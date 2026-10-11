// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_GLOBAL_EDIT_TEARDROPS's window (dialog_global_edit_teardrops.cpp) on its base: the
 * base's Apply button (wxDialog's wxID_APPLY default: apply without closing), the four Action
 * radios reaching m_action, and the Board Setup link. The edit itself is
 * teardrop_global_edit.test.ts's.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type DIALOG_GLOBAL_EDIT_TEARDROPS,
  DialogGlobalEditTeardrops,
  TEARDROP_ACTION,
} from '@ziroeda/pcbnew/dialogs/dialog_global_edit_teardrops.js';

afterEach(cleanup);

const binder = (aLabel: string) => ({
  GetLabel: () => aLabel,
  GetText: () => '',
  SetText: () => {},
  GetUnits: () => 'mm',
});

function show() {
  const dialog = {
    m_pthPads: true,
    m_smdPads: true,
    m_vias: true,
    m_trackToTrack: false,
    m_netFilterOpt: false,
    m_netFilter: -1,
    m_netclassFilterOpt: false,
    m_netclassFilter: '',
    m_netclassNames: ['Default'],
    m_layerFilterOpt: false,
    m_layerFilter: 0,
    m_roundPadsFilter: false,
    m_existingFilter: false,
    m_selectedItemsFilter: false,
    m_action: TEARDROP_ACTION.ADD_DEFAULTS,
    m_cbPreferZoneConnection: null,
    m_cbTeardropsUseNextTrack: null,
    m_curvedEdges: null,
    m_teardropHDPercent: binder('Track width limit:'),
    m_teardropLenPercent: binder('Best length (L):'),
    m_teardropMaxLen: binder('Maximum length (L):'),
    m_teardropHeightPercent: binder('Best width (W):'),
    m_teardropMaxHeight: binder('Maximum width (W):'),
    TransferDataToWindow: () => true,
    TransferDataFromWindow: vi.fn(() => true),
    OnClose: vi.fn(),
    OnTrackToTrack: vi.fn(),
    FiltersEnabled: () => true,
    SpecifiedValuesEnabled() {
      return this.m_action === TEARDROP_ACTION.SPECIFIED;
    },
    AddLabels: () => ({
      addTeardrops: 'Add teardrops with default values for shape',
      specifiedValues: 'Add teardrops with specified values:',
    }),
  };
  const onApplied = vi.fn();
  const onClose = vi.fn();
  const onShowBoardSetup = vi.fn();
  render(
    <DialogGlobalEditTeardrops
      dialog={dialog as unknown as DIALOG_GLOBAL_EDIT_TEARDROPS}
      nets={new Map()}
      layers={[]}
      onShowBoardSetup={onShowBoardSetup}
      onApplied={onApplied}
      onClose={onClose}
    />,
  );
  return { dialog, onApplied, onClose, onShowBoardSetup };
}

describe('DIALOG_GLOBAL_EDIT_TEARDROPS window', () => {
  it('Apply applies and leaves the dialog open; Apply and Close closes', () => {
    const s = show();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(s.dialog.TransferDataFromWindow).toHaveBeenCalledTimes(1);
    expect(s.onApplied).toHaveBeenCalledTimes(1);
    expect(s.onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Apply and Close' }));
    expect(s.onClose).toHaveBeenCalled();
  });

  it('each Action radio sets its own action, and specified values enable the shape fields', () => {
    const s = show();
    expect(
      (screen.getByRole('textbox', { name: 'Best length (L)' }) as HTMLInputElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByLabelText('Remove all teardrops'));
    expect(s.dialog.m_action).toBe(TEARDROP_ACTION.REMOVE_ALL);
    fireEvent.click(screen.getByLabelText('Add teardrops with specified values:'));
    expect(s.dialog.m_action).toBe(TEARDROP_ACTION.SPECIFIED);
    expect(
      (screen.getByRole('textbox', { name: 'Best length (L)' }) as HTMLInputElement).disabled,
    ).toBe(false);
  });

  it('the Board Setup link opens Board Setup', () => {
    const s = show();
    fireEvent.click(screen.getByText('Edit default values in Board Setup'));
    expect(s.onShowBoardSetup).toHaveBeenCalled();
  });
});
