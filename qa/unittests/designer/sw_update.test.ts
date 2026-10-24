// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * designer/src/sw_update.ts: a new version that has downloaded is noticed, offered, and taken
 * over on request, and the page reloads onto it. The service worker container here is a stand-in
 * with the parts the module touches: its controller, `ready`, and the two events.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyUpdate,
  resetUpdateWatchForTests,
  subscribeUpdate,
  UPDATE_CHECK_MS,
  updateWaiting,
  watchForUpdate,
} from '@ziroeda/designer/src/sw_update.js';

afterEach(resetUpdateWatchForTests);

type Listener = () => void;

class FakeWorker {
  state = 'installing';
  readonly posted: unknown[] = [];
  private listeners: Listener[] = [];
  addEventListener(_type: string, aListener: Listener): void {
    this.listeners.push(aListener);
  }
  postMessage(aMessage: unknown): void {
    this.posted.push(aMessage);
  }
  /** The worker reaches \a aState, as the browser moves it along. */
  become(aState: string): void {
    this.state = aState;
    for (const l of this.listeners) l();
  }
}

function makeContainer(aOptions: { controlled: boolean; waiting?: FakeWorker }) {
  const updateFound: Listener[] = [];
  const controllerChange: Listener[] = [];
  const registration = {
    waiting: aOptions.waiting ?? null,
    installing: null as FakeWorker | null,
    update: vi.fn(() => Promise.resolve()),
    addEventListener: (_type: string, aListener: Listener) => updateFound.push(aListener),
  };
  const container = {
    controller: aOptions.controlled ? {} : null,
    ready: Promise.resolve(registration),
    addEventListener: (_type: string, aListener: Listener) => controllerChange.push(aListener),
  };
  return {
    container: container as unknown as ServiceWorkerContainer,
    registration,
    /** The browser found a new sw.js and started installing it. */
    found(aWorker: FakeWorker): void {
      registration.installing = aWorker;
      for (const l of updateFound) l();
    },
    /** A new worker took control of the page. */
    controllerChanged(): void {
      container.controller = {};
      for (const l of controllerChange) l();
    },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('watchForUpdate', () => {
  it('offers a version that was already waiting when the page loaded', async () => {
    const waiting = new FakeWorker();
    const c = makeContainer({ controlled: true, waiting });

    watchForUpdate(
      c.container,
      () => {},
      () => {},
    );
    await settle();

    expect(updateWaiting() === (waiting as unknown as ServiceWorker)).toBe(true);
  });

  it('offers one that finishes installing later, and says so to its subscribers', async () => {
    const c = makeContainer({ controlled: true });
    const heard = vi.fn();
    subscribeUpdate(heard);
    watchForUpdate(
      c.container,
      () => {},
      () => {},
    );
    await settle();

    const worker = new FakeWorker();
    c.found(worker);
    expect(updateWaiting()).toBeNull();

    worker.become('installed');
    expect(updateWaiting() === (worker as unknown as ServiceWorker)).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('offers nothing on a first install: there is no old build to replace', async () => {
    const c = makeContainer({ controlled: false, waiting: new FakeWorker() });

    watchForUpdate(
      c.container,
      () => {},
      () => {},
    );
    await settle();

    expect(updateWaiting()).toBeNull();
  });

  it('asks the browser for a new sw.js every hour, since an open tab never navigates', async () => {
    const c = makeContainer({ controlled: true });
    let check: (() => void) | null = null;

    watchForUpdate(
      c.container,
      () => {},
      (aCheck) => {
        check = aCheck;
      },
    );
    await settle();
    check!();

    expect(c.registration.update).toHaveBeenCalledTimes(1);
    expect(UPDATE_CHECK_MS).toBe(60 * 60 * 1000);
  });

  it('reloads, once, when a new worker takes control of the page', async () => {
    const c = makeContainer({ controlled: true });
    const reload = vi.fn();
    watchForUpdate(c.container, reload, () => {});

    c.controllerChanged();
    c.controllerChanged();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when a first install claims the page', () => {
    const c = makeContainer({ controlled: false });
    const reload = vi.fn();
    watchForUpdate(c.container, reload, () => {});

    c.controllerChanged();

    expect(reload).not.toHaveBeenCalled();
  });
});

describe('applyUpdate', () => {
  it("tells the waiting worker to take over - the generated sw.js's SKIP_WAITING", async () => {
    const waiting = new FakeWorker();
    const c = makeContainer({ controlled: true, waiting });
    watchForUpdate(
      c.container,
      () => {},
      () => {},
    );
    await settle();

    expect(applyUpdate()).toBe(true);
    expect(waiting.posted).toEqual([{ type: 'SKIP_WAITING' }]);
  });

  it('does nothing while no version is waiting', () => {
    expect(applyUpdate()).toBe(false);
  });
});

describe('the app', () => {
  const APP = readFileSync(
    fileURLToPath(new URL('../../../designer/src/App.tsx', import.meta.url)),
    'utf8',
  );

  it('takes a waiting version at once on the launcher, where nothing is open', () => {
    expect(APP).toMatch(/if \(updateReady && view === 'home'\) applyUpdate\(\);/);
  });

  it("offers it on every editor's info bar, ahead of the demo's message", () => {
    const sites = [...APP.matchAll(/readOnlyNotice=\{\s*([^\n]*)/g)].map((m) => m[1]);

    expect(sites).toHaveLength(4);
    for (const s of sites) expect(s).toMatch(/^(frameNotice\}|updateNotice \?\?)/);
    expect(APP).toMatch(/const frameNotice = updateNotice \?\? demoNotice;/);
  });
});
