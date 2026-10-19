// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The main-thread half of the DRC worker: `DRC_TOOL::RunTests` asks for a job
 * to be run, this puts it on a worker and feeds what comes back to the hooks.
 *
 * One worker per run, not a pool. A DRC is a thing a person asks for once and
 * then reads the results of, so the realm a `new Worker` costs is paid in the
 * same click that is about to spend tens of seconds anyway — and holding one
 * open between runs would hold a whole second copy of the board with it.
 *
 * Cancel is `terminate()`. A worker in the middle of a synchronous run cannot
 * read a message, so asking it to stop is not possible; killing it is, and it
 * is safe here because it shares nothing — it owns a copy of the board built
 * from the text it was handed. Every violation found before the stop has
 * already been delivered.
 */
import type { DRC_JOB_HOOKS, DRC_JOB_REQUEST } from './drc_job.js';
import { runDrcJob } from './drc_job.js';
import {
  type FILL_JOB_HOOKS,
  type FILL_JOB_REQUEST,
  type FILL_JOB_RESULT,
  runFillJob,
} from './fill_job.js';
import type { DRC_WORKER_MESSAGE } from './drc_worker.js';

/** Set once `new Worker` has failed, so we stop trying for the session. */
let workersUnavailable = false;

/**
 * A worker started before it is needed, holding no board: its realm and the DRC's modules are
 * loaded while the dialog is open, rather than in the silence after Run DRC is pressed - KiCad's
 * run starts on the board it already has, and the first phase follows the click. Taken by the
 * next run; at most one.
 */
let g_spare: Worker | null = null;

function startWorker(): Worker {
  // `new URL(..., import.meta.url)` with `{ type: 'module' }` is the form the
  // bundler detects and emits a separate chunk for; a string specifier would
  // be left as a runtime path that does not exist in the build.
  return new Worker(new URL('./drc_worker.js', import.meta.url), { type: 'module' });
}

/** Start the next run's worker now, if there is none waiting. */
export function prewarmDrcWorker(): void {
  if (g_spare !== null || !drcWorkerAvailable()) return;

  try {
    g_spare = startWorker();
  } catch {
    workersUnavailable = true;
  }
}

/** How often the run is asked whether the user pressed Cancel. */
const CANCEL_POLL_MS = 100;

/**
 * Whether the run can be handed off at all.
 *
 * False in the test runner and anywhere else without module workers, and the
 * caller then runs the identical job inline — `runDrcJob` either way, so the
 * two paths cannot drift.
 */
export function drcWorkerAvailable(): boolean {
  return !workersUnavailable && typeof Worker !== 'undefined';
}

/** The hooks every job here reports through (DRC_JOB_HOOKS and FILL_JOB_HOOKS share them). */
interface JOB_PROGRESS_HOOKS {
  onPhase(aMessage: string): void;
  onProgress(aValue: number): void;
  isCancelled?(): boolean;
}

/**
 * Post \a aMessage to a job worker - the spare one if there is one - and settle with what
 * \a aOnResult makes of the worker's answer. Phases and progress go to the hooks; Cancel
 * terminates the worker and settles with \a aCancelled; null when no worker could start, and
 * the caller then runs its job inline.
 */
function runOnJobWorker<R>(
  aMessage: unknown,
  aHooks: JOB_PROGRESS_HOOKS,
  aOnResult: (aMsg: DRC_WORKER_MESSAGE) => { value: R } | null,
  aCancelled: R,
): Promise<R> | null {
  if (!drcWorkerAvailable()) return null;

  let worker: Worker;

  try {
    worker = g_spare ?? startWorker();
    g_spare = null;
  } catch {
    workersUnavailable = true;
    return null;
  }

  return new Promise<R>((resolve, reject) => {
    let settled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    const finish = (andThen: () => void): void => {
      if (settled) return;

      settled = true;

      if (poll !== null) clearInterval(poll);

      worker.terminate();
      andThen();
    };

    poll = setInterval(() => {
      // The run is over as far as the caller is concerned; what it has
      // collected so far is what it keeps.
      if (aHooks.isCancelled?.()) finish(() => resolve(aCancelled));
    }, CANCEL_POLL_MS);

    worker.onmessage = (e: MessageEvent<DRC_WORKER_MESSAGE>): void => {
      const msg = e.data;

      switch (msg.t) {
        case 'phase':
          aHooks.onPhase(msg.message);
          return;
        case 'progress':
          aHooks.onProgress(msg.value);
          return;
        case 'error':
          finish(() => reject(new Error(msg.message)));
          return;
        default: {
          const result = aOnResult(msg);

          if (result) finish(() => resolve(result.value));
        }
      }
    };

    // A worker that dies takes the run with it. It has already delivered what
    // it found, so this is reported rather than thrown away.
    worker.onerror = (e: ErrorEvent): void => {
      finish(() => reject(new Error(e.message || 'the job worker failed')));
    };

    worker.postMessage(aMessage);
  });
}

/**
 * Run a DRC job, off the main thread where that is possible.
 *
 * Resolves when the run finishes, fails, or is cancelled; rejects only if the
 * job itself threw, which `DIALOG_DRC` reports in its message pane.
 */
export async function runDrcJobOffThread(
  aRequest: DRC_JOB_REQUEST,
  aHooks: DRC_JOB_HOOKS,
): Promise<void> {
  const run = runOnJobWorker<void>(
    aRequest,
    aHooks,
    (msg) => {
      if (msg.t === 'violation') aHooks.onViolation(msg.violation);

      return msg.t === 'done' ? { value: undefined } : null;
    },
    undefined,
  );

  return run ?? runDrcJob(aRequest, aHooks);
}

/**
 * Run `ZONE_FILLER::Fill` as a job (fill_job.ts), off the main thread where that is possible.
 *
 * Resolves with what the fill left, or null when it was cancelled; the caller installs it.
 */
export async function runFillJobOffThread(
  aRequest: FILL_JOB_REQUEST,
  aHooks: FILL_JOB_HOOKS,
): Promise<FILL_JOB_RESULT | null> {
  const run = runOnJobWorker<FILL_JOB_RESULT | null>(
    { fill: aRequest },
    aHooks,
    (msg) => (msg.t === 'filled' ? { value: msg.result } : null),
    null,
  );

  if (run) return run;

  const result = await runFillJob(aRequest, aHooks);

  return aHooks.isCancelled?.() ? null : result;
}
