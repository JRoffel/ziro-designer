// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_CHANGE_SYMBOLS over its _base: the constructor's two modes - Update keeps the base's
 * labels and hides m_newIdSizer; Change hides m_matchAll, shows the new-id row and relabels
 * every option - plus Select All / None on the field list and the Close / Update buttons.
 */
import { resolve } from 'node:path';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import {
  DIALOG_CHANGE_SYMBOLS,
  DialogChangeSymbols,
} from '@ziroeda/eeschema/dialogs/dialog_change_symbols.js';
import type { SCH_SYMBOL } from '@ziroeda/eeschema/sch_symbol.js';
import { DIALOG_CHANGE_SYMBOLS_MODE } from '@ziroeda/eeschema/tools/sch_edit_tool.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openProject, schFrame, schToolHarness } from '../support/sch_tool_harness.js';

const ORACLE = resolve(__dirname, '../../../data/eeschema/netlist_oracle/complex_hierarchy');
const SHEETS = ['complex_hierarchy.kicad_sch', 'ampli_ht.kicad_sch', 'complex_hierarchy.kicad_pro'];

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => {
  cleanup();
  SetPgm(null);
});

function open(aMode: DIALOG_CHANGE_SYMBOLS_MODE, aWithSymbol = true) {
  const h = schToolHarness(schFrame({}));
  openProject(h.frame, ORACLE, 'complex_hierarchy', SHEETS);
  h.frame.SetCurrentSheet(
    h.frame
      .Schematic()
      .Hierarchy()
      .find((p) => p.size() === 2)!,
  );
  const sym = ([...h.frame.GetScreen()!.Items().OfType(KICAD_T.SCH_SYMBOL_T)] as SCH_SYMBOL[])[0]!;
  const dlg = new DIALOG_CHANGE_SYMBOLS(h.frame, aWithSymbol ? sym : null, aMode, async () => null);
  const onClose = vi.fn();
  render(<DialogChangeSymbols dlg={dlg} onClose={onClose} />);
  return { dlg, onClose };
}

const boxes = () =>
  Array.from(
    screen.getByRole('listbox').querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  );

describe('DIALOG_CHANGE_SYMBOLS_BASE', () => {
  it('Update mode: the base labels, all-symbols radio, no new library identifier row', () => {
    open(DIALOG_CHANGE_SYMBOLS_MODE.UPDATE);
    expect(screen.getByRole('dialog', { name: 'Update Symbols from Library' })).toBeTruthy();
    expect(screen.getByLabelText('Update all symbols in schematic')).toBeTruthy();
    expect(screen.queryByText('New library identifier:')).toBeNull();
    expect(screen.getByText('Update/Reset Fields')).toBeTruthy();
    expect(screen.getByLabelText('Update/reset field text')).toBeTruthy();
    expect(screen.getByText('Update')).toBeTruthy();
    expect(screen.getByText('Close')).toBeTruthy();
  });

  it('Change mode: no all-symbols radio, the new-id row, and the Change labels', () => {
    open(DIALOG_CHANGE_SYMBOLS_MODE.CHANGE);
    expect(screen.getByRole('dialog', { name: 'Change Symbols' })).toBeTruthy();
    expect(screen.queryByLabelText('Change all symbols in schematic')).toBeNull();
    expect(screen.getByText('New library identifier:')).toBeTruthy();
    expect(screen.getByLabelText('Change selected symbol(s)')).toBeTruthy();
    expect(screen.getByText('Update Fields')).toBeTruthy();
    expect(screen.getByLabelText('Remove fields if not in new symbol')).toBeTruthy();
    expect(screen.getByLabelText('Update field sizes and styles')).toBeTruthy();
  });

  it('no symbol: m_matchBySelection hidden', () => {
    open(DIALOG_CHANGE_SYMBOLS_MODE.UPDATE, false);
    expect(screen.queryByLabelText('Update selected symbol(s)')).toBeNull();
  });

  it('Select All and Select None drive the field list', () => {
    open(DIALOG_CHANGE_SYMBOLS_MODE.UPDATE);
    fireEvent.click(screen.getByText('Select None'));
    expect(boxes().every((b) => !b.checked)).toBe(true);
    fireEvent.click(screen.getByText('Select All'));
    expect(boxes().every((b) => b.checked)).toBe(true);
  });

  it('Check / Uncheck All Update Options', () => {
    const { dlg } = open(DIALOG_CHANGE_SYMBOLS_MODE.UPDATE);
    fireEvent.click(screen.getByText('Check All Update Options'));
    expect(dlg.m_resetFieldPositions).toBe(true);
    fireEvent.click(screen.getByText('Uncheck All Update Options'));
    expect(dlg.m_resetFieldPositions).toBe(false);
  });

  it('Close saves the settings and closes', () => {
    const { dlg, onClose } = open(DIALOG_CHANGE_SYMBOLS_MODE.UPDATE);
    const save = vi.spyOn(dlg, 'SaveSettings');
    fireEvent.click(screen.getByText('Close'));
    expect(save).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
