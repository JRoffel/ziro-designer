// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_FILTER_SELECTION (pcbnew/dialogs/dialog_filter_selection.cpp): the boxes it shows and
 * writes back, GetSuggestedAllItemsState, and the All items box forcing every box.
 */
import { describe, expect, it } from 'vitest';
import {
  DIALOG_FILTER_SELECTION,
  type SelectionFilter,
} from '@ziroeda/pcbnew/dialogs/dialog_filter_selection.js';

/** `DIALOG_FILTER_SELECTION::OPTIONS`' member initialisers: every one true. */
const defaults = (): SelectionFilter => ({
  footprints: true,
  lockedFootprints: true,
  tracks: true,
  vias: true,
  zones: true,
  boardOutline: true,
  techLayers: true,
  text: true,
});

const opened = (aOptions = defaults()) => {
  const d = new DIALOG_FILTER_SELECTION(aOptions);
  d.TransferDataToWindow();
  return d;
};

describe('DIALOG_FILTER_SELECTION', () => {
  it('opens on the defaults with All items checked: every box is on', () => {
    expect(opened().m_All_Items).toBe(true);
  });

  it('All items is undetermined between none and all, and unchecked at none', () => {
    const d = opened({ ...defaults(), vias: false });
    expect(d.m_All_Items).toBe(null);

    d.m_All_Items = false;
    d.allItemsClicked();
    expect(d.m_Include_Tracks.value).toBe(false);
    expect(d.GetSuggestedAllItemsState()).toBe(false);
  });

  it('the locked box follows footprints: disabled while it is off, and not counted', () => {
    const d = opened({ ...defaults(), footprints: false, lockedFootprints: false });

    expect(d.m_IncludeLockedModules.enabled).toBe(false);
    // Six of the seven counted boxes: still undetermined.
    expect(d.m_All_Items).toBe(null);

    d.m_Include_Modules.value = true;
    d.checkBoxClicked();
    expect(d.m_IncludeLockedModules.enabled).toBe(true);
  });

  it('a lone locked tick counts for nothing while footprints is off', () => {
    const d = opened({
      footprints: false,
      lockedFootprints: true,
      tracks: false,
      vias: false,
      zones: false,
      boardOutline: false,
      techLayers: false,
      text: false,
    });

    expect(d.m_All_Items).toBe(false);
  });

  it('All items checked forces every box on and enables the locked one', () => {
    const d = opened({ ...defaults(), footprints: false, tracks: false });

    d.m_All_Items = true;
    d.allItemsClicked();
    expect(d.m_Include_Modules.value).toBe(true);
    expect(d.m_IncludeLockedModules.enabled).toBe(true);
    expect(d.m_Include_Tracks.value).toBe(true);
  });

  it('TransferDataFromWindow writes each box into its option', () => {
    const o = defaults();
    const d = opened(o);

    d.m_Include_Draw_Items.value = false;
    d.m_Include_Edges_Items.value = false;
    d.m_IncludeLockedModules.value = false;
    expect(d.TransferDataFromWindow()).toBe(true);
    expect(o).toEqual({
      ...defaults(),
      techLayers: false,
      boardOutline: false,
      lockedFootprints: false,
    });
  });
});
