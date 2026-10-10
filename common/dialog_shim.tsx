// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `DIALOG_SHIM` (common/dialog_shim.cpp), the base every KiCad dialog derives
 * from, as far as a React dialog needs it: the size floor
 * (`finishDialogSettings` -> `SetSizeHints`), Escape closing the topmost
 * dialog (wx's `wxID_CANCEL` on Escape, which `ShowModal` /
 * `ShowQuasiModal` route to the dialog in front), and the standard button row
 * each `_base.cpp` builds. Until 09-26 these were four files
 * (`dialog_shim_buttons`, `dialogs/dialog_size_hints`, `dialogs/modal_escape`,
 * `dialogs/use_modal_escape`).
 */
import type {
  JSX,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  RefObject,
  CSSProperties,
  Ref,
} from 'react';
import { Dialog, isSingleLineEntry, pressDefaultButton } from '@ziroeda/wx/dialog.js';
import { PgmOrNull } from './pgm_base.js';
import { DIALOG_GEOMETRY_KEY } from './settings/common_settings.js';

// ---------------------------------------------------------------------------
// finishDialogSettings / SetSizeHints: the size floor.

export interface Size {
  readonly w: number;
  readonly h: number;
}

/**
 * `wxSize::IncTo` -- a componentwise maximum, which is why a wx dialog only
 * ever grows.
 *
 * An unmeasured element is ignored rather than treated as zero. A dialog that
 * is not laid out yet, or is display:none, reports 0 for both, and clamping the
 * floor down to that would put back exactly the tracking behaviour this exists
 * to remove -- while looking like it was working.
 */
export function heldSize(floor: Size, measured: Size): Size {
  return {
    w: measured.w > 0 ? Math.max(floor.w, measured.w) : floor.w,
    h: measured.h > 0 ? Math.max(floor.h, measured.h) : floor.h,
  };
}

/** Dialogs that state their own size, and must not be given a second answer. */
const EXEMPT = [
  // Its own port of the same upstream behaviour, and a closer one: upstream
  // re-fits a PAGED_DIALOG on every page change, with a floor and a ceiling
  // the C++ names. See `paged_dialog_size.ts`.
  '.ze-paged-dialog',
].join(',');

/**
 * Give every dialog a size floor that rises with its content and never falls.
 *
 * Idempotent, and safe to call before anything is on screen: dialogs are found
 * as they are added.
 */
export function installDialogSizeHints(): void {
  if (typeof document === 'undefined' || typeof ResizeObserver === 'undefined') return;

  const held = new WeakMap<HTMLElement, Size>();

  const hold = (el: HTMLElement): void => {
    const floor = held.get(el) ?? { w: 0, h: 0 };
    const rect = el.getBoundingClientRect();
    // Ceil, because a fractional floor and a fractional measurement disagree
    // forever: the element lands a hundredth of a pixel under its own minimum
    // and the observer fires again on every frame.
    const next = heldSize(floor, { w: Math.ceil(rect.width), h: Math.ceil(rect.height) });
    if (next.w === floor.w && next.h === floor.h) return;
    held.set(el, next);
    // A minimum rather than a fixed size: `SetSizeHints` sets the floor, and a
    // dialog the user can drag larger stays larger. It also means this can only
    // ever reveal content, never clip it.
    if (next.w > 0) el.style.minWidth = `${next.w}px`;
    if (next.h > 0) el.style.minHeight = `${next.h}px`;
  };

  // The floor only rises, so writing it back cannot make the element smaller
  // and the loop converges after one further callback.
  const sizes = new ResizeObserver((entries) => {
    for (const e of entries) hold(e.target as HTMLElement);
  });

  const watch = (el: HTMLElement): void => {
    if (held.has(el) || el.matches(EXEMPT)) return;
    held.set(el, { w: 0, h: 0 });
    sizes.observe(el);
  };

  const scan = (root: ParentNode): void => {
    for (const el of root.querySelectorAll<HTMLElement>('.ze-modal')) watch(el);
  };

  scan(document);
  new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.classList.contains('ze-modal')) watch(node);
        scan(node);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// Escape is wxID_CANCEL for the dialog in front: wxDialog's (external/wx/dialog.tsx).

export {
  cancelTopModal,
  openModalCount,
  pushModalCancel,
  resetModalStack,
  useModalEscape,
} from '@ziroeda/wx/dialog.js';

// ---------------------------------------------------------------------------
// The standard button row: `wxStdDialogButtonSizer`, which is wx's (wx/sizer.h), so it lives in
// external/wx/sizer.tsx. The old name stays here until every caller imports it from there.

export {
  StdDialogButtonSizer as StdDialogButtons,
  type StdDialogButtonSizerProps as StdDialogButtonsProps,
} from '@ziroeda/wx/sizer.js';

// ---------------------------------------------------------------------------
// The dialog window.

/**
 * `getDialogKeyFromTitle` (dialog_shim.cpp:85-101): the title, cut before a trailing
 * parenthesised part, so "Footprint Properties (U3)" and "... (R1)" share one remembered state.
 */
export function getDialogKeyFromTitle(aTitle: string): string {
  const parenPos = aTitle.lastIndexOf('(');

  if (parenPos > 0) {
    let end = parenPos;

    while (end > 0 && aTitle[end - 1] === ' ') end--;

    return aTitle.substring(0, end);
  }

  return aTitle;
}

/** The height of the title bar a saved position must keep on screen (`FromDIP( 15 )`). */
const TITLE_GRAB = 15; // [data] dialog_shim.cpp:549, the point tested inside the title bar

export interface DialogShimProps {
  /** The window title (`SetTitle`), drawn centred in the title bar. */
  title: string;
  /** The title bar's close button, and Escape: `wxID_CANCEL`. */
  onClose: () => void;
  /**
   * `Show()` rather than `ShowModal()` / `ShowQuasiModal()`: no backdrop, the frame behind
   * stays live, and Escape acts only while the dialog has the focus - on the canvas it is the
   * tool's cancel, not the dialog's.
   */
  modeless?: boolean;
  /** The dialog's own layout class (its `_base.cpp` sizer tree), never its chrome. */
  className?: string;
  /** `SetInitialFocus( aWindow )`; the dialog itself when absent. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** `m_hash_key`, for a dialog whose title varies; the title's key otherwise. */
  hashKey?: string;
  /**
   * `wxRESIZE_BORDER`, which 138 of KiCad's 149 dialog bases carry in their default style; the
   * few that do not (DIALOG_ASSIGN_NETCLASS, DIALOG_GRID_SETTINGS, the fields tables, ...) pass
   * false. The fitted size is the minimum (`SetSizeHints` from the best size).
   */
  resizable?: boolean;
  /**
   * A size the dialog states: `SetSize` / `SetMinSize` from its constructor's `aInitialSize`
   * (data from its `_base.cpp`, never chrome). Position is DialogShim's own.
   */
  style?: CSSProperties;
  /** The window element, for a dialog that measures or focuses it. */
  frameRef?: Ref<HTMLDivElement>;
  /**
   * A subclass's `OnCharHook` override: it sees every key in the window first, and a key it
   * consumes (preventDefault) does not reach DIALOG_SHIM::OnCharHook's Escape and Enter.
   */
  onCharHook?: (aEvent: ReactKeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

/**
 * `DIALOG_SHIM`'s window: the class every KiCad dialog derives from, on wx's `wxDialog`
 * (external/wx/dialog.tsx), which owns the frame, placement, moving, resizing, Escape and the
 * default button. What DIALOG_SHIM adds on top:
 *
 * - `Show`: opens where it was last closed (`"__geometry"` in the common settings' dialog map),
 *   else centred over the frame; re-centred if the title bar would land off screen. A saved size
 *   can grow the dialog, never shrink it. `SaveControlState` writes the geometry back as it
 *   closes.
 * - On the first paint the text in every entry is selected (`SelectAllInTextCtrls`) and focus
 *   goes to the initial target, or the dialog itself so its keys still work
 *   (`forceInitialFocus`).
 * - `OnCharHook` (dialog_shim.cpp:1789-1835): Ctrl+Enter is wxID_OK from anywhere; a subclass's
 *   override sees every key first.
 */
export function DialogShim({
  title,
  onClose,
  modeless = false,
  className,
  initialFocus,
  hashKey,
  resizable = true,
  style,
  frameRef,
  onCharHook,
  children,
}: DialogShimProps): JSX.Element {
  const key = hashKey ?? getDialogKeyFromTitle(title);
  const internals = PgmOrNull()?.GetCommonSettings()?.CsInternals?.() ?? null;

  return (
    <Dialog
      title={title}
      onClose={onClose}
      modeless={modeless}
      resizable={resizable}
      className={className}
      style={style}
      frameRef={frameRef}
      placement={(aFitted, aView) => {
        const saved = internals?.GetDialogControlValue(key, DIALOG_GEOMETRY_KEY);

        if (typeof saved !== 'object' || saved.w === 0 || saved.h === 0) return null;

        // Re-center if the title bar would land on no display.
        const grabX = saved.x + aFitted.w / 2;
        const grabY = saved.y + TITLE_GRAB;
        const onScreen = grabX >= 0 && grabX < aView.w && grabY >= 0 && grabY < aView.h;

        return {
          x: onScreen ? saved.x : Math.round((aView.w - aFitted.w) / 2),
          y: onScreen ? saved.y : Math.round((aView.h - aFitted.h) / 2),
          w: saved.w,
          h: saved.h,
        };
      }}
      onShown={(aFrame) => {
        // SelectAllInTextCtrls, then forceInitialFocus.
        for (const input of aFrame.querySelectorAll('input')) {
          if (isSingleLineEntry(input)) {
            try {
              input.setSelectionRange(0, input.value.length);
            } catch {
              /* a number entry has no selection API */
            }
          }
        }

        const target = initialFocus?.current;

        if (target && target.offsetParent !== null) target.focus();
        else if (!aFrame.contains(document.activeElement)) aFrame.focus();
      }}
      onClosing={(aRect) => {
        // SaveControlState: where it was and how big, as it closes.
        internals?.SetDialogControlValue(key, DIALOG_GEOMETRY_KEY, aRect);
      }}
      onCharHook={(e) => {
        onCharHook?.(e);

        if (e.defaultPrevented) return;

        // Ctrl+Enter anywhere is wxID_OK (wxDialog itself handles Enter in an entry).
        if (e.key === 'Enter' && e.ctrlKey && pressDefaultButton(e.currentTarget)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {children}
    </Dialog>
  );
}
