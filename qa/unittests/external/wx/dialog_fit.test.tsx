// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from wxWidgets (wxWindows Library Licence).
/**
 * A wxDialog is fitted once and then keeps its size: nothing its controls do afterwards resizes
 * it, only a handler that asks (Fit() / GetSizer()->SetSizeHints( this )). Here the window fits
 * its content until the user first touches it, then holds that size and clips what does not fit;
 * `fitKey` is a handler's Fit(), `fitWhenTooShortKey` DIALOG_PAD_PROPERTIES' conditional one.
 *
 * happy-dom lays nothing out, so the window's measured box is stated per test.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from '@ziroeda/wx/dialog.js';

/** What the frame measures: its content's size while it has none stated. */
let content = { w: 300, h: 200 };

beforeEach(() => {
  content = { w: 300, h: 200 };
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    // A resize grip straddles the frame's edge, so it always reaches past the frame's bottom.
    if (this.classList.contains('ze-shim-grip')) {
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 6,
        height: 9999,
        right: 6,
        bottom: 9999,
      } as DOMRect;
    }
    const w = this.style.width ? Number.parseFloat(this.style.width) : content.w;
    const h = this.style.height ? Number.parseFloat(this.style.height) : content.h;
    return { x: 0, y: 0, left: 0, top: 0, width: w, height: h, right: w, bottom: h } as DOMRect;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const frame = () => screen.getByRole('dialog') as HTMLDivElement;
const stated = () => [frame().style.width, frame().style.height];

function Probe({ fitKey, tooShortKey }: { fitKey?: unknown; tooShortKey?: unknown }) {
  return (
    <Dialog title="t" onClose={() => {}} fitKey={fitKey} fitWhenTooShortKey={tooShortKey}>
      <button type="button">inside</button>
    </Dialog>
  );
}

describe('a dialog', () => {
  it('fits its content until it is first touched, then holds that size and clips', () => {
    render(<Probe />);
    expect(stated()).toEqual(['', '']);

    content = { w: 320, h: 240 };
    fireEvent.pointerDown(screen.getByText('inside'));

    expect(stated()).toEqual(['320px', '240px']);
    expect(frame().style.overflow).toBe('clip');

    // What the controls then do moves nothing.
    content = { w: 500, h: 600 };
    fireEvent.pointerDown(screen.getByText('inside'));
    expect(stated()).toEqual(['320px', '240px']);
  });

  it('holds its size from a key as well', () => {
    render(<Probe />);

    fireEvent.keyDown(screen.getByText('inside'), { key: 'Tab' });

    expect(stated()).toEqual(['300px', '200px']);
  });

  it('re-fits to its content when a handler Fit()s, and holds the new size', () => {
    const { rerender } = render(<Probe fitKey="gerber" />);
    fireEvent.pointerDown(screen.getByText('inside'));
    expect(stated()).toEqual(['300px', '200px']);

    content = { w: 280, h: 330 };
    act(() => rerender(<Probe fitKey="pdf" />));

    // Grown and shrunk to the content, as SetSizeHints( this ) does.
    expect(stated()).toEqual(['280px', '330px']);
  });

  it('re-fits only when it has become too short for its content', () => {
    const { rerender } = render(<Probe tooShortKey={0} />);
    fireEvent.pointerDown(screen.getByText('inside'));

    // The frame's children measure the content's size; the frame, once held, its own.
    content = { w: 300, h: 180 };
    act(() => rerender(<Probe tooShortKey={1} />));
    expect(stated()).toEqual(['300px', '200px']);

    content = { w: 300, h: 260 };
    act(() => rerender(<Probe tooShortKey={2} />));
    expect(stated()).toEqual(['300px', '260px']);
  });
});
