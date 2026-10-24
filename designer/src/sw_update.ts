// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * A new version of the app, downloaded and waiting to take over.
 *
 * The service worker serves `index.html` from its precache, and that copy names the old build's
 * hashed files, which are precached too: a tab keeps running the build it was opened on. The new
 * worker installs in the background and then WAITS (vite.config.ts keeps `registerType: 'prompt'`,
 * because swapping the worker under a running editor sends its still-lazy chunks to the network
 * for hashes the new deploy no longer serves). Waiting, it only takes over once every tab of the
 * site is closed - a refresh keeps the tab, so it does not.
 *
 * So the app asks. {@link watchForUpdate} notices the waiting worker; the window offers it
 * (the WX_INFOBAR strip over an editor, or at once on the launcher, where nothing is open), and
 * {@link applyUpdate} tells it to take over - the generated sw.js answers `SKIP_WAITING` with
 * `skipWaiting()` - after which the controller changes and the page reloads onto the new build.
 */

/** How often a tab that never navigates asks for a new sw.js: the browser only checks on navigation. */
export const UPDATE_CHECK_MS = 60 * 60 * 1000;

let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();
let watching = false;

/** The new version's worker, installed and waiting; null while there is none. */
export function updateWaiting(): ServiceWorker | null {
  return waiting;
}

/** `useSyncExternalStore`'s subscribe: told when a new version is waiting. */
export function subscribeUpdate(aListener: () => void): () => void {
  listeners.add(aListener);
  return () => listeners.delete(aListener);
}

/** The waiting worker takes over; the page reloads when it has (see watchForUpdate). */
export function applyUpdate(): boolean {
  if (!waiting) return false;

  waiting.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

/**
 * Watch \a aContainer for a new version: one waiting already, one that finishes installing later,
 * and an hourly check for one. \a aReload runs when a new worker takes control of the page - an
 * update this tab applied or another tab did, either way the old build's lazy chunks are gone -
 * and not on a first install, which has no worker to replace.
 */
export function watchForUpdate(
  aContainer: ServiceWorkerContainer,
  aReload: () => void,
  aSchedule: (aCheck: () => void) => void = (aCheck) => setInterval(aCheck, UPDATE_CHECK_MS),
): void {
  if (watching) return;

  watching = true;

  const hadController = !!aContainer.controller;
  let reloading = false;

  aContainer.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;

    reloading = true;
    aReload();
  });

  const offer = (aWorker: ServiceWorker): void => {
    // A first install is not an update: there is no old build to replace.
    if (!aContainer.controller) return;

    waiting = aWorker;
    for (const listener of listeners) listener();
  };

  aContainer.ready
    .then((aRegistration) => {
      if (aRegistration.waiting) offer(aRegistration.waiting);

      aRegistration.addEventListener('updatefound', () => {
        const worker = aRegistration.installing;

        if (!worker) return;

        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') offer(worker);
        });
      });

      aSchedule(() => {
        aRegistration.update().catch(() => {});
      });
    })
    .catch(() => {});
}

/** For the tests: forget the watch and the waiting worker. */
export function resetUpdateWatchForTests(): void {
  watching = false;
  waiting = null;
  listeners.clear();
}
