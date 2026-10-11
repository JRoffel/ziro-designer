// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from wxWidgets (wxWindows Library Licence).
/**
 * external/wx's wxStaticBitmap and wxSimplebook as DIALOG_PAD_PROPERTIES_BASE uses them: a
 * bitmap at its stated size, wxNullBitmap keeping that size, Enable( false ) as the insensitive
 * image; a simplebook that is as tall as its selected page when its owner SetMaxSize()s it so.
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HtmlWindow } from '@ziroeda/common/widgets/html_window.js';
import { Gauge, ListCtrl, StaticBitmap, StatusBar } from '@ziroeda/wx/controls.js';
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

describe('Gauge, ListCtrl and StatusBar', () => {
  it('Gauge is the shared .ze-gauge over its range', () => {
    const { container } = render(<Gauge value={250} range={500} />);
    const bar = container.querySelector('progress') as HTMLProgressElement;

    expect(bar.className).toBe('ze-gauge');
    expect(bar.max).toBe(500);
    expect(bar.value).toBe(250);
  });

  it('ListCtrl lays each row at the column widths and reports a right click with its row', () => {
    const onRightClick = vi.fn();
    const { container } = render(
      <ListCtrl rows={[['a'], ['b']]} columnWidths={[660]} onRightClick={onRightClick} />,
    );
    const rows = container.querySelectorAll('.ze-listctrl-row');

    expect(rows).toHaveLength(2);
    expect((rows[1] as HTMLElement).style.gridTemplateColumns).toBe('660px');
    fireEvent.contextMenu(rows[1]!);
    expect(onRightClick).toHaveBeenCalledWith(1, expect.anything());
  });

  it('StatusBar: a fixed field is its width, -1 takes the rest', () => {
    const { container } = render(<StatusBar widths={[12, -1]} texts={['', 'Done']} />);
    const [a, b] = [...container.querySelectorAll('.ze-wxstatusbar > span')] as HTMLElement[];

    expect(a!.style.width).toBe('12px');
    expect(b!.style.flex).toContain('1');
    expect(b!.textContent).toBe('Done');
  });
});

describe('HtmlWindow links', () => {
  it('a connected wxEVT_HTML_LINK_CLICKED gets the href as written, and nothing opens', () => {
    const onLink = vi.fn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { container } = render(
      <HtmlWindow html={'<a href="$CUSTOM_RULES">rules</a>'} onLinkClicked={onLink} />,
    );

    fireEvent.click(container.querySelector('a')!);
    expect(onLink).toHaveBeenCalledWith('$CUSTOM_RULES');
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
