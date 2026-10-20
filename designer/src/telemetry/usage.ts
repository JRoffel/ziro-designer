// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * Anonymous usage counts: how many people use ZiroEDA, which screens they use,
 * for how long, and where they came from. No KiCad counterpart (KiCad collects
 * nothing); the crash-report side of telemetry is `sentry_backend.ts`.
 *
 * What is sent, and only this:
 *  - `$pageview` on load and whenever the screen changes, with the screen's
 *    label from `usage_screen.ts` (`project/pcb`, never a project or file);
 *  - `active_minute` once a minute while the tab is visible AND the user has
 *    touched the keyboard or pointer in that minute - the "time spent" figure;
 *  - on the first pageview of a session, the referring site's host and any
 *    `utm_*` tags, so a post or a README badge can be told apart.
 * The id is a random one per browser, kept in localStorage and linked to no
 * account; the session id is random per tab and renewed after 30 idle minutes.
 *
 * Nothing is sent when `VITE_POSTHOG_KEY` is unset (local builds), when
 * `privacy.usage_stats` is off, or when the browser asks not to be tracked
 * (Do Not Track / Global Privacy Control). The events go to PostHog's capture
 * endpoint with `fetch` - no SDK, so no autocapture of clicks or text, no
 * session recording and no cookies can ever be switched on by accident.
 */
import { settings } from '../prefs/settings.js';
import { parseRoute } from '../nav/route.js';
import { campaignOf, referrerHost, screenOf } from './usage_screen.js';

const env: Record<string, string | undefined> =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
/** The project's public, write-only key; with none nothing is ever sent. */
const KEY: string | undefined = env.VITE_POSTHOG_KEY;
const HOST: string = env.VITE_POSTHOG_HOST ?? 'https://eu.i.posthog.com';
const BASE: string = env.BASE_URL || '/';

const ID_KEY = 'ziroeda.usageId';
const MINUTE = 60_000;
const SESSION_IDLE = 30 * MINUTE;

const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function browserId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return uuid(); // storage blocked: counted as a new visitor each load
  }
}

function trackingRefused(): boolean {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.doNotTrack === '1' || n.globalPrivacyControl === true;
}

let distinctId = '';
let sessionId = '';
let lastEventAt = 0;
let lastInputAt = 0;
let screen = '';
let started = false;

function send(event: string, properties: Record<string, unknown>): void {
  if (!KEY || !settings.privacy.usage_stats) return;
  const now = Date.now();
  if (!sessionId || now - lastEventAt > SESSION_IDLE) sessionId = uuid();
  lastEventAt = now;
  const body = JSON.stringify({
    api_key: KEY,
    event,
    distinct_id: distinctId,
    timestamp: new Date(now).toISOString(),
    properties: {
      ...properties,
      $session_id: sessionId,
      // The screen label stands in for the URL, so PostHog's web analytics
      // (pages, paths, session length) work without ever seeing a real address.
      $current_url: `${location.origin}/${screen}`,
      $pathname: `/${screen}`,
      $host: location.host,
      $screen_width: window.innerWidth,
      $process_person_profile: false,
    },
  });
  void fetch(`${HOST}/i/v0/e/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Counting is best-effort: a blocked or offline request is simply lost.
  });
}

function onScreenMaybeChanged(first: boolean): void {
  const next = screenOf(parseRoute(location.href, BASE));
  if (next === screen && !first) return;
  screen = next;
  send(
    '$pageview',
    first
      ? {
          $referring_domain: referrerHost(document.referrer, location.hostname) || '$direct',
          ...campaignOf(location.href),
        }
      : {},
  );
}

/** Start counting; called once at boot from `main.tsx`. Idempotent. */
export function startUsageStats(): void {
  if (started || !KEY || typeof window === 'undefined' || trackingRefused()) return;
  started = true;
  distinctId = browserId();
  onScreenMaybeChanged(true);
  // The app navigates with history.pushState (`nav/useRoute.ts`), which fires
  // no event; a cheap poll of the address catches every screen change.
  window.setInterval(() => onScreenMaybeChanged(false), 2000);
  const touched = (): void => {
    lastInputAt = Date.now();
  };
  for (const type of ['pointerdown', 'keydown', 'wheel'] as const)
    window.addEventListener(type, touched, { passive: true, capture: true });
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastInputAt < MINUTE)
      send('active_minute', {});
  }, MINUTE);
}
