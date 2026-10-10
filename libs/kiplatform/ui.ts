// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `libs/kiplatform/include/kiplatform/ui.h`, the browser port: what the
 * canvas code asks the platform for. A browser cannot warp the pointer, so
 * `WarpPointer` fails the way it does on a Wayland display, and every
 * caller already handles that answer.
 */

import { wxGetMousePosition } from '@ziroeda/wx/utils.js';

/** `wxWindow` as the platform layer reaches it: the element, its client size and focus. */
export interface KIPLATFORM_WINDOW {
  GetHandle(): HTMLElement | null;
  HasFocus(): boolean;
  SetFocus(): void;
}

/** `KIPLATFORM::UI::GetMousePosition` (port/wxgtk/ui.cpp:316): `wxGetMousePosition()`. */
export function GetMousePosition(): { x: number; y: number } {
  return wxGetMousePosition();
}

/**
 * Move the mouse cursor to a specific position relative to the window.
 *
 * @return true if the warp was successful.
 *
 * No browser API moves the pointer; this is the Wayland answer.
 */
export function WarpPointer(_aWindow: KIPLATFORM_WINDOW, _aX: number, _aY: number): boolean {
  return false;
}

/**
 * Configures the IME mode of a given control handle.
 */
export function ImmControl(_aWindow: KIPLATFORM_WINDOW, _aEnable: boolean): void {}

/**
 * Check to see if the given window is the currently active window (e.g. the window
 * in the foreground the user is interacting with).
 *
 * The frame is a document here; it is active when the document has focus.
 */
export function IsWindowActive(_aWindow: unknown): boolean {
  return typeof document !== 'undefined' ? document.hasFocus() : true;
}

/**
 * Sets the mouse pointer for infinite drag, and prepares the window for it.
 *
 * @return true if the platform supports infinite drag (the browser's pointer
 *         lock would; it is not requested here, so the drag is finite).
 */
export function InfiniteDragPrepareWindow(_aWindow: KIPLATFORM_WINDOW): boolean {
  return false;
}

/** Releases the window from infinite drag mode. */
export function InfiniteDragReleaseWindow(): void {}

/** Enables or disables overlay scrolling for a window. */
export function SetOverlayScrolling(_aWindow: KIPLATFORM_WINDOW, _aOverlay: boolean): void {}

/** Cancels any IME composition in progress. */
export function ImeNotifyCancelComposition(_aWindow: KIPLATFORM_WINDOW): void {}

/** The window a platform scale query is about: a page has one, `window`. */
export interface PlatformWindow {
  devicePixelRatio?: number;
}

/**
 * `KIPLATFORM::UI::GetPixelScaleFactor( aWindow )`: device pixels per logical
 * pixel for the window - GTK's `gtk_widget_get_scale_factor`, the page's
 * `devicePixelRatio`.
 */
export function GetPixelScaleFactor(aWindow: PlatformWindow): number {
  return aWindow.devicePixelRatio || 1;
}

/**
 * `KIPLATFORM::UI::GetContentScaleFactor( aWindow )`: on GTK it is the pixel
 * scale ("TODO: Do we need something different here?", wxgtk/ui.cpp:277).
 */
export function GetContentScaleFactor(aWindow: PlatformWindow): number {
  return GetPixelScaleFactor(aWindow);
}
