// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The part of `<wx/utils.h>` KiCad reads: `wxGetEnv` / `wxSetEnv` /
 * `wxUnsetEnv`, the process environment.
 *
 * A page has no process environment of its own, so it starts empty: what
 * `wxSetEnv` puts there (PGM_BASE sets KiCad's variables at startup), over
 * whatever a host that does have one (a node harness, a test) installs as its
 * lookup.
 */

export type EnvVarLookup = (aName: string) => string | undefined;

let s_envVarLookup: EnvVarLookup = () => undefined;

/** Install the environment `wxGetEnv` reads. */
export function SetEnvVarLookup(aLookup: EnvVarLookup): void {
  s_envVarLookup = aLookup;
}

/** Variables set in this process with `wxSetEnv`. */
const s_env = new Map<string, string>();

/** `wxGetEnv( aName, &value )`: the value, or undefined when it is not set. */
export function wxGetEnv(aName: string): string | undefined {
  return s_env.get(aName) ?? s_envVarLookup(aName);
}

/** `wxSetEnv( aName, aValue )`. */
export function wxSetEnv(aName: string, aValue: string): boolean {
  s_env.set(aName, aValue);
  return true;
}

/** `wxUnsetEnv( aName )`. */
export function wxUnsetEnv(aName: string): boolean {
  return s_env.delete(aName);
}

/**
 * `wxLaunchDefaultBrowser( url )`: the URL in a new tab.
 *
 * Always true outside a test: a window opened `noopener` is null to its opener
 * by specification, so a popup blocker cannot be told from success, and the
 * "could not launch the default browser" branches upstream are unreachable.
 */
export function wxLaunchDefaultBrowser(aUrl: string): boolean {
  if (typeof window === 'undefined') return false;

  window.open(aUrl, '_blank', 'noopener,noreferrer');
  return true;
}

/**
 * `wxBell()` (wx/utils.h): the system alert sound, which on GTK is
 * `gdk_display_beep`. A page has no way to ring the system bell, so it is
 * silent; the callers' early returns are what matter.
 */
export function wxBell(): void {}

/** The last pointer position the display reported, in screen (page) coordinates. */
let s_mousePosition = { x: 0, y: 0 };

/**
 * `wxGetMousePosition()`. On GTK it asks the display server, so it knows the pointer wherever
 * it is, not only over a window that got an event. The page's equivalent is to watch the
 * pointer at the window, capture phase, so nothing that stops propagation hides a move from it.
 */
export function wxGetMousePosition(): { x: number; y: number } {
  return { ...s_mousePosition };
}

/** The display's half: every pointer event the page sees records its position here. */
export function wxSetMousePosition(aX: number, aY: number): void {
  s_mousePosition = { x: aX, y: aY };
}

if (typeof window !== 'undefined') {
  // Viewport coordinates: what a fixed-position popup is placed in, and the
  // same as page coordinates here, since the app's page never scrolls.
  const track = (e: PointerEvent): void => wxSetMousePosition(e.clientX, e.clientY);
  window.addEventListener('pointermove', track, { capture: true, passive: true });
  window.addEventListener('pointerdown', track, { capture: true, passive: true });
}

/**
 * `wxString::Matches( aMask )` (wx/string.h): the whole string against a wildcard mask, `*` any
 * run of characters and `?` any one, case-sensitive.
 */
export function wxMatches(aString: string, aMask: string): boolean {
  let pattern = '^';

  for (const c of aMask) {
    if (c === '*') pattern += '[\\s\\S]*';
    else if (c === '?') pattern += '[\\s\\S]';
    else pattern += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return new RegExp(`${pattern}$`, 'u').test(aString);
}
