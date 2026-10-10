// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from wxWidgets (wxWindows Library Licence).
/**
 * `wxDialog` (wx/dialog.h) as wxGTK shows one: the window KiCad's DIALOG_SHIM derives from.
 * What is wx's and GTK's, and so lives here:
 *
 * - the frame: the client-side title bar with the title centred and the close box, the border,
 *   the window shadow (`.ze-modal`, `.ze-modal-header`);
 * - `ShowModal()` (a backdrop, the frame behind dead) against `Show()` (no backdrop, the frame
 *   behind live);
 * - `Centre( wxBOTH )`, moving by the title bar, and `wxRESIZE_BORDER`'s grips with the fitted
 *   size as the floor;
 * - Escape is `wxID_CANCEL` for the modal dialog in front (the modal stack below), or for a
 *   modeless one while it has the focus;
 * - Enter presses the default button: GTK's `activates-default` in a one-line entry, and Return
 *   on the window itself when no widget takes it.
 *
 * A subclass (DIALOG_SHIM) adds its behaviour through the hooks: where the window opens
 * (`placement`), what happens once it is shown (`onShown`) and as it closes (`onClosing`), and
 * the keys it sees first (`onCharHook`).
 */
import {
  type CSSProperties,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { wasBrowserSuppressed } from './dom_events.js';

// ---------------------------------------------------------------------------
// Escape is wxID_CANCEL for the dialog in front: the hook a dialog calls.

/**
 * Close this dialog when Esc is pressed and it is the topmost one.
 *
 * `cancel` is read through a ref rather than captured by the effect, because a
 * dialog's close handler is usually an inline arrow and so has a new identity
 * every render. Depending on it would re-register on each one, and each
 * re-registration moves the dialog to the top of the stack - so a repainting
 * background dialog would start swallowing the Esc meant for the one in front
 * of it.
 *
 * `enabled` is for a dialog that renders while closed. Passing `false`
 * unregisters it, so it does not sit on the stack absorbing the key.
 */
export function useModalEscape(cancel: () => void, enabled = true): void {
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;

  useEffect(() => {
    if (!enabled) return undefined;
    return pushModalCancel(() => cancelRef.current());
  }, [enabled]);
}

/** A dialog's cancel, while it is on screen. */
type CancelFn = () => void;

/**
 * The open dialogs, oldest first. A plain array rather than a Set because the
 * order is the whole point.
 */
const stack: { cancel: CancelFn }[] = [];

let listening = false;

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  // `defaultPrevented` means someone already acted on this key — EXCEPT when it
  // was the page's own browser suppression (`claimBrowserHotkeys`), which runs in
  // capture phase and calls `preventDefault()` on every combo the app CLAIMS,
  // purely to stop the browser acting on it; the event is meant to carry on to us.
  if (e.defaultPrevented && !wasBrowserSuppressed(e)) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  // Stop here rather than let it run on: an editor's key handler treats Esc as
  // "cancel the current tool", and cancelling a tool because a dialog closed is
  // an edit the user did not ask for.
  e.preventDefault();
  e.stopPropagation();
  top.cancel();
}

function listen(): void {
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('keydown', onKeyDown, true);
  listening = true;
}

/**
 * Put a dialog's cancel on top of the stack, and return the function that takes
 * it off again.
 *
 * The unregister is idempotent and order-independent: a dialog closed from
 * underneath another - which happens when a whole editor unmounts - is removed
 * from wherever it sits rather than popped.
 */
export function pushModalCancel(cancel: CancelFn): () => void {
  listen();
  const entry = { cancel };
  stack.push(entry);
  return () => {
    const i = stack.indexOf(entry);
    if (i !== -1) stack.splice(i, 1);
  };
}

/** How many dialogs are open. For tests, and for anything that needs to know. */
export const openModalCount = (): number => stack.length;

/** Close the topmost dialog, as Esc does. Exported so the rule can be tested. */
export function cancelTopModal(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.cancel();
  return true;
}

/** Drop every registration. Tests only - a leaked entry would outlive its test. */
export function resetModalStack(): void {
  stack.length = 0;
}

// ---------------------------------------------------------------------------
// The window.

/** A one-line text entry: what GTK's `activates-default` applies to. */
export function isSingleLineEntry(aEl: EventTarget | null): boolean {
  if (!(aEl instanceof HTMLInputElement)) return false;
  return ['', 'text', 'number', 'search', 'email', 'url', 'tel', 'password'].includes(aEl.type);
}

/** Press the window's enabled default button (`wxWindow::GetDefaultItem`), if it has one. */
export function pressDefaultButton(aFrame: HTMLElement | null): boolean {
  const button = aFrame?.querySelector<HTMLButtonElement>('.ze-btn.primary:not(:disabled)');

  if (!button) return false;

  button.click();
  return true;
}

/** A window's place and size, in viewport pixels. */
export interface wxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DialogProps {
  /** `SetTitle`, drawn centred in the title bar. */
  title: string;
  /** The close box, and Escape: `wxID_CANCEL`. */
  onClose: () => void;
  /** `Show()` rather than `ShowModal()`: no backdrop, and Escape only while it has the focus. */
  modeless?: boolean;
  /** `wxRESIZE_BORDER`: grips on every edge, the fitted size the floor. */
  resizable?: boolean;
  /** The dialog's own class on the window (its layout, never its chrome). */
  className?: string;
  /** A size the dialog states (`SetSize` / `SetMinSize`): data, not chrome. */
  style?: CSSProperties;
  /** The window element. */
  frameRef?: Ref<HTMLDivElement>;
  /**
   * Where the window opens, given its fitted size and the viewport; `Centre( wxBOTH )` when
   * absent or when it answers null. A size larger than the fitted one is kept.
   */
  placement?: (aFitted: { w: number; h: number }, aView: { w: number; h: number }) => wxRect | null;
  /** Once placed on its first layout. */
  onShown?: (aFrame: HTMLDivElement) => void;
  /** As it closes: where it was and how big. */
  onClosing?: (aRect: wxRect) => void;
  /** Sees every key in the window first; a key it consumes (preventDefault) goes no further. */
  onCharHook?: (aEvent: ReactKeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

/** `wxDialog`: the frame, its placement, moving and resizing, Escape and the default button. */
export function Dialog({
  title,
  onClose,
  modeless = false,
  resizable = true,
  className,
  style,
  frameRef: outerFrameRef,
  placement,
  onShown,
  onClosing,
  onCharHook,
  children,
}: DialogProps): JSX.Element {
  const frameRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(outerFrameRef, () => frameRef.current!, []);
  // The window's top-left; null until the first layout has placed it.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  // The window's size once the user (or a placement) has set one; null while it is the fitted
  // size. `minSize` is that fitted size, the floor a resize stops at.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const minSize = useRef({ w: 0, h: 0 });
  const resize = useRef<{
    edge: string;
    x: number;
    y: number;
    ox: number;
    oy: number;
    w: number;
    h: number;
  } | null>(null);
  useModalEscape(onClose, !modeless);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Show() runs once per showing; the hooks are read at that moment
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const r = frame.getBoundingClientRect();
    const fitted = { w: Math.round(r.width), h: Math.round(r.height) };
    const view = { w: window.innerWidth, h: window.innerHeight };

    minSize.current = fitted;

    // Centre( wxBOTH ), unless the subclass places it.
    let x = Math.round((view.w - r.width) / 2);
    let y = Math.round((view.h - r.height) / 2);
    const placed = placement?.(fitted, view) ?? null;

    if (placed) {
      x = placed.x;
      y = placed.y;

      if (resizable && (placed.w > fitted.w || placed.h > fitted.h))
        setSize({ w: Math.max(placed.w, fitted.w), h: Math.max(placed.h, fitted.h) });
    }

    setPos({ x, y });
    onShown?.(frame);

    return () => {
      const at = posRef.current;
      const box = frame.getBoundingClientRect();

      if (at)
        onClosing?.({ x: at.x, y: at.y, w: Math.round(box.width), h: Math.round(box.height) });
    };
  }, []);

  const onTitleDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || !pos || (e.target as HTMLElement).closest('.x')) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onTitleMove = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (d) setPos({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y });
  };
  const onTitleUp = (): void => {
    drag.current = null;
  };

  const onGripDown =
    (aEdge: string) =>
    (e: PointerEvent<HTMLDivElement>): void => {
      const frame = frameRef.current;
      if (e.button !== 0 || !pos || !frame) return;
      const r = frame.getBoundingClientRect();
      resize.current = {
        edge: aEdge,
        x: e.clientX,
        y: e.clientY,
        ox: pos.x,
        oy: pos.y,
        w: r.width,
        h: r.height,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.stopPropagation();
    };
  const onGripMove = (e: PointerEvent<HTMLDivElement>): void => {
    const g = resize.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const min = minSize.current;
    let { w, h } = g;
    let { ox: x, oy: y } = g;
    if (g.edge.includes('e')) w = Math.max(min.w, g.w + dx);
    if (g.edge.includes('s')) h = Math.max(min.h, g.h + dy);
    if (g.edge.includes('w')) {
      w = Math.max(min.w, g.w - dx);
      x = g.ox + (g.w - w);
    }
    if (g.edge.includes('n')) {
      h = Math.max(min.h, g.h - dy);
      y = g.oy + (g.h - h);
    }
    setSize({ w: Math.round(w), h: Math.round(h) });
    setPos({ x: Math.round(x), y: Math.round(y) });
  };
  const onGripUp = (): void => {
    resize.current = null;
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    onCharHook?.(e);

    if (e.defaultPrevented) return;

    if (e.key === 'Escape' && modeless) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }

    // Enter in a one-line entry, or on the window itself (GtkWindow binds Return to
    // activate-default when no widget takes it): the default button.
    if (e.key !== 'Enter') return;
    if (!(isSingleLineEntry(e.target) || e.target === frameRef.current)) return;

    if (pressDefaultButton(frameRef.current)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const frame = (
    <div
      ref={frameRef}
      className={`ze-modal ze-shim${modeless ? ' ze-modeless' : ''}${className ? ` ${className}` : ''}`}
      // Where the window is: data the user put there, not chrome. Hidden for the one layout
      // before it is placed.
      style={{
        ...style,
        ...(size ? { width: size.w, height: size.h } : {}),
        ...(pos ? { left: pos.x, top: pos.y } : { visibility: 'hidden' }),
      }}
      role="dialog"
      aria-modal={!modeless}
      aria-label={title}
      tabIndex={-1}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
    >
      <div
        className="ze-modal-header"
        onPointerDown={onTitleDown}
        onPointerMove={onTitleMove}
        onPointerUp={onTitleUp}
      >
        {title}
        <span className="x" title="Close" onClick={onClose}>
          ✕
        </span>
      </div>
      {children}
      {resizable &&
        (['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const).map((edge) => (
          <div
            key={edge}
            className={`ze-shim-grip ${edge}`}
            onPointerDown={onGripDown(edge)}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
          />
        ))}
    </div>
  );

  return modeless ? frame : <div className="ze-modal-backdrop">{frame}</div>;
}
