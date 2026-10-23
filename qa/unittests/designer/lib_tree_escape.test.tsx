// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Esc and the search box. LIB_TREE itself has no Escape (lib_tree.cpp's onQueryCharHook handles
 * the arrows, +/- and Enter only); the first-Esc-clears-the-search rule is each CHOOSER's OnChar:
 *
 *   - PANEL_SYMBOL_CHOOSER and PANEL_DESIGN_BLOCK_CHOOSER, only when the key comes from the
 *     search box (`dynamic_cast<wxTextCtrl*>( eventSource )`);
 *   - PANEL_FOOTPRINT_CHOOSER, whatever has focus.
 *
 * Ours cleared it from every LIB_TREE on every Esc, so in the Symbol Editor's dock cancelling a
 * tool on the canvas also wiped the library filter and collapsed the tree.
 */
import { afterEach, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { makeItemNode } from '@ziroeda/common/lib_tree_model.js';
import { LibTreeModelAdapter } from '@ziroeda/common/lib_tree_model_adapter.js';
import { LibTree } from '@ziroeda/common/widgets/lib_tree.js';

afterEach(cleanup);

const mount = (aRule?: 'fromSearch' | 'always') => {
  const adapter = new LibTreeModelAdapter();
  const lib = adapter.addLibrary('Device', '', false);
  makeItemNode(lib, 'Device', 'R');
  adapter.finishLibrary(lib);
  const { container } = render(
    <>
      <button type="button" data-testid="elsewhere">
        canvas
      </button>
      <LibTree
        adapter={adapter}
        onSelect={() => {}}
        onChoose={() => {}}
        {...(aRule ? { escapeClearsSearch: aRule } : {})}
      />
    </>,
  );
  const input = container.querySelector('.ze-libtree input') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'R' } });
  return { input, elsewhere: container.querySelector('[data-testid=elsewhere]') as HTMLElement };
};

/** Focus \a aOn as a browser does - the old element's focusout first - then press Esc there. */
const pressEscape = (aOn: HTMLElement) => {
  // Two events, as in a browser: the focus moves (and its effects run), then the key.
  act(() => {
    const prev = document.activeElement;
    if (prev instanceof HTMLElement && prev !== aOn) fireEvent.blur(prev);
    aOn.focus();
    fireEvent.focus(aOn);
  });
  act(() => {
    fireEvent.keyDown(aOn, { key: 'Escape' });
  });
};

it('an editor’s dock keeps its filter on Esc, wherever it is pressed', () => {
  const { input, elsewhere } = mount();
  pressEscape(elsewhere);
  pressEscape(input);
  expect(input.value).toBe('R');
});

it('the symbol chooser clears it only from the search box', () => {
  const { input, elsewhere } = mount('fromSearch');
  pressEscape(elsewhere);
  expect(input.value).toBe('R');
  pressEscape(input);
  expect(input.value).toBe('');
});

it('the footprint chooser clears it whatever has focus', () => {
  const { input, elsewhere } = mount('always');
  pressEscape(elsewhere);
  expect(input.value).toBe('');
});
