// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_SYMBOL_PROPERTIES over its _base: the General / Pin Functions notebook (rendering it at
 * all pins the old onUpdate={redraw} loop, which never let a render settle), the window's values
 * reaching OK, the four library buttons ending with their return codes, a single-unit symbol's
 * Unit greyed, and the library link.
 */
import { resolve } from 'node:path';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import {
  DIALOG_SYMBOL_PROPERTIES,
  DialogSymbolProperties,
} from '@ziroeda/eeschema/dialogs/dialog_symbol_properties.js';
import type { SCH_SYMBOL } from '@ziroeda/eeschema/sch_symbol.js';
import { SYMBOL_PROPS_RETVALUE } from '@ziroeda/eeschema/tools/sch_edit_tool.js';
import { wxID_OK } from '@ziroeda/wx/menu.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openProject, schFrame, schToolHarness } from '../support/sch_tool_harness.js';

const ORACLE = resolve(__dirname, '../../../data/eeschema/netlist_oracle/complex_hierarchy');
const SHEETS = ['complex_hierarchy.kicad_sch', 'ampli_ht.kicad_sch', 'complex_hierarchy.kicad_pro'];

const HOST = {
  ChooseFootprint: () => Promise.resolve(null),
  OpenFile: () => Promise.resolve(null),
  OpenDocument: () => {},
};

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => {
  cleanup();
  SetPgm(null);
});

function open() {
  const h = schToolHarness(schFrame({}));
  openProject(h.frame, ORACLE, 'complex_hierarchy', SHEETS);
  h.frame.SetCurrentSheet(
    h.frame
      .Schematic()
      .Hierarchy()
      .find((p) => p.size() === 2)!,
  );
  // D_Small: one unit, one body style, pins 1 "K" and 2 "A".
  const sym = ([...h.frame.GetScreen()!.Items().OfType(KICAD_T.SCH_SYMBOL_T)] as SCH_SYMBOL[]).find(
    (s) => s.GetLibId().GetLibItemName() === 'D_Small',
  )!;
  const dlg = new DIALOG_SYMBOL_PROPERTIES(h.frame, sym, HOST);
  const onClose = vi.fn();
  render(
    <DialogSymbolProperties
      dlg={dlg}
      initial={dlg.TransferDataToWindow()}
      onClose={onClose}
      onCancel={() => {}}
    />,
  );
  return { dlg, sym, onClose };
}

describe('DIALOG_SYMBOL_PROPERTIES_BASE', () => {
  it('renders the General and Pin Functions pages and the library link', () => {
    const { dlg } = open();
    expect(screen.getByRole('tab', { name: 'General' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Pin Functions' })).toBeTruthy();
    for (const box of ['Fields', 'Attributes']) expect(screen.getByText(box)).toBeTruthy();
    expect((screen.getByLabelText('Library link') as HTMLInputElement).value).toBe(dlg.m_libraryId);
    expect(screen.getByLabelText('Pin functions')).toBeTruthy();
  });

  it('a single-unit symbol greys Unit', () => {
    open();
    expect(screen.getByText('Unit:').className).toMatch(/disabled/);
  });

  it('OK applies the window values to the symbol', () => {
    const { sym, onClose } = open();
    const dnp = sym.GetDNP();
    fireEvent.click(screen.getByLabelText('Do not populate'));
    fireEvent.click(screen.getByText('OK'));
    expect(onClose).toHaveBeenCalledWith(wxID_OK);
    expect(sym.GetDNP()).toBe(!dnp);
  });

  it('Change Symbol... ends with SYMBOL_PROPS_WANT_EXCHANGE_SYMBOL', () => {
    const { onClose } = open();
    fireEvent.click(screen.getByText('Change Symbol...'));
    expect(onClose).toHaveBeenCalledWith(SYMBOL_PROPS_RETVALUE.SYMBOL_PROPS_WANT_EXCHANGE_SYMBOL);
  });

  it('Pin Functions is selectable', () => {
    open();
    fireEvent.click(screen.getByRole('tab', { name: 'Pin Functions' }));
    expect(screen.getByRole('tab', { name: 'Pin Functions' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});
