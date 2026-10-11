// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from wxWidgets (wxWindows Library Licence).
/**
 * external/wx's wxStaticBitmap and wxSimplebook as DIALOG_PAD_PROPERTIES_BASE uses them: a
 * bitmap at its stated size, wxNullBitmap keeping that size, Enable( false ) as the insensitive
 * image; a simplebook that is as tall as its selected page when its owner SetMaxSize()s it so.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StaticBitmap } from '@ziroeda/wx/controls.js';
import { Simplebook } from '@ziroeda/wx/simplebook.js';

afterEach(cleanup);

describe('StaticBitmap', () => {
  it('draws the bundle at the stated size, and disabled as insensitive', () => {
    const { container } = render(<StaticBitmap bitmap="x.svg" size={[48, 48]} disabled />);
    const img = container.querySelector('img') as HTMLImageElement;

    expect(img.getAttribute('src')).toBe('x.svg');
    expect(img.style.width).toBe('48px');
    expect(img.style.height).toBe('48px');
    expect(img.classList.contains('disabled')).toBe(true);
  });

  it('wxNullBitmap draws nothing but keeps its size', () => {
    const { container } = render(<StaticBitmap bitmap={null} size={[48, 48]} />);

    expect(container.querySelector('img')).toBeNull();
    expect((container.firstChild as HTMLElement).style.width).toBe('48px');
  });
});

describe('Simplebook', () => {
  it('shows the selected page; the others stay in the layout', () => {
    const { container } = render(<Simplebook selection={1} pages={['a', 'b', 'c']} />);
    const pages = [...container.querySelectorAll('.ze-simplebook-page')];

    expect(pages).toHaveLength(3);
    expect(pages.map((p) => p.hasAttribute('data-hide'))).toEqual([true, false, true]);
    expect(container.firstElementChild!.className).toBe('ze-simplebook');
  });

  it('fitSelection and wxBORDER_SIMPLE are the book classes the shell styles', () => {
    const { container } = render(
      <Simplebook selection={0} fitSelection border="simple" pages={['a']} />,
    );

    expect(container.firstElementChild!.className).toBe(
      'ze-simplebook fit-selection border-simple',
    );
  });
});
