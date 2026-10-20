// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * wxCheckListBox's best height (wxListBox::DoGetBestSize, src/gtk/listbox.cpp): at most ten rows,
 * so a long list does not make its dialog taller than the screen. The Plot dialog's 22 layers made
 * it overflow the window and pushed the Plot button out of the frame.
 *
 * 290 is measured, not derived: qa/probes/plot_layer_list_probe.cpp builds DIALOG_PLOT's two
 * lists with the 22 layers and asks wxGTK, which answers 290 for both.
 */
import { CheckListBox, CheckListBoxBestHeight } from '@ziroeda/wx/checklst.js';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const layers = (n: number) => Array.from({ length: n }, (_, i) => `L${i}`);

describe('wxCheckListBox best height', () => {
  it('is the measured 290 for the Plot dialog layer list', () => {
    expect(CheckListBoxBestHeight(22)).toBe(290);
  });

  it('is never fewer than three rows, nor more than ten', () => {
    expect(CheckListBoxBestHeight(1)).toBe(CheckListBoxBestHeight(3));
    expect(CheckListBoxBestHeight(5)).toBe(145);
    expect(CheckListBoxBestHeight(10)).toBe(CheckListBoxBestHeight(400));
  });

  it('is the floor of the list, whose rows scroll in a body of no height of its own', () => {
    const items = layers(22);
    const { container } = render(
      <CheckListBox items={items} checked={items.map(() => false)} onCheck={() => {}} />,
    );
    const list = container.querySelector<HTMLElement>('.ze-checklist')!;

    expect(list.style.minHeight).toBe('290px');
    // Every row is still there, inside the scrolling body.
    expect(list.querySelectorAll('.ze-checklist-rows > .ze-gridlist-row')).toHaveLength(22);
  });
});
