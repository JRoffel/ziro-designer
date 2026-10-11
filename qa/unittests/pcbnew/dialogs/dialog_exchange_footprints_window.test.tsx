// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_EXCHANGE_FOOTPRINTS's window (dialog_exchange_footprints.cpp) on its base: typing in a
 * match field selects its radio (OnMatchRefClicked and the like), and the two Check / Uncheck All
 * buttons. The exchange itself is dialog_exchange_footprints.test.ts's.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type DIALOG_EXCHANGE_FOOTPRINTS,
  DialogExchangeFootprints,
  ID_MATCH_FP_REF,
  ID_MATCH_FP_VAL,
} from '@ziroeda/pcbnew/dialogs/dialog_exchange_footprints.js';

afterEach(cleanup);

const LABELS = {
  matchAll: 'Update all footprints on board',
  matchSelected: 'Update selected footprint(s)',
  matchRef: 'Update footprints matching reference designator:',
  matchValue: 'Update footprints matching value:',
  matchID: 'Update footprints with library id:',
  resetTextItemLayers: 'Update/reset text layers and visibilities',
  resetTextItemEffects: 'Update/reset text sizes and styles',
  resetTextItemPositions: 'Update/reset text positions',
  resetTextItemContent: 'Update/reset text content',
  resetFabricationAttrs: 'Update/reset fabrication attributes',
  resetClearanceOverrides: 'Update/reset clearance overrides',
  reset3DModels: 'Update/reset 3D models',
};

function show() {
  const dialog = {
    m_matchMode: 0,
    m_specifiedRef: '',
    m_specifiedValue: '',
    m_specifiedID: '',
    m_newID: '',
    m_removeExtraBox: false,
    m_resetTextItemLayers: false,
    m_resetTextItemEffects: false,
    m_resetTextItemPositions: false,
    m_resetTextItemContent: false,
    m_resetFabricationAttrs: false,
    m_resetClearanceOverrides: false,
    m_reset3DModels: false,
    m_MessageWindow: { lines: [] },
    TransferDataToWindow: () => true,
    Labels: () => LABELS,
    GetTitle: () => 'Update Footprints from Library',
    OkLabel: () => 'Update',
    ShowMatchAll: () => true,
    ShowMatchSelected: () => true,
    ShowChangeSizer: () => false,
    CheckAll: vi.fn(),
    OnOKClicked: vi.fn(async () => {}),
  };
  render(
    <DialogExchangeFootprints
      dialog={dialog as unknown as DIALOG_EXCHANGE_FOOTPRINTS}
      onBrowse={async () => null}
      onClose={() => {}}
    />,
  );
  return dialog;
}

describe('DIALOG_EXCHANGE_FOOTPRINTS window', () => {
  it('typing in a match field selects its own radio', () => {
    const d = show();
    fireEvent.change(screen.getByRole('textbox', { name: 'Reference designator' }), {
      target: { value: 'R1' },
    });
    expect([d.m_specifiedRef, d.m_matchMode]).toEqual(['R1', ID_MATCH_FP_REF]);
    fireEvent.change(screen.getByRole('textbox', { name: 'Value' }), { target: { value: '10k' } });
    expect(d.m_matchMode).toBe(ID_MATCH_FP_VAL);
  });

  it('Check All checks, Uncheck All unchecks', () => {
    const d = show();
    fireEvent.click(screen.getByRole('button', { name: 'Check All Update Options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Uncheck All Update Options' }));
    expect(d.CheckAll.mock.calls).toEqual([[true], [false]]);
  });
});
