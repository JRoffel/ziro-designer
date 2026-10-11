// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_TABLECELL_PROPERTIES over its _base: the units labels, a mixed colour showing the popup
 * page until "Set Color..." flips it to the swatch, Syntax help opening the frame's window, and
 * OK handing the values to the class.
 */
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import {
  DIALOG_TABLECELL_PROPERTIES,
  DialogTableCellProperties,
} from '@ziroeda/eeschema/dialogs/dialog_tablecell_properties.js';
import { SCH_TABLE } from '@ziroeda/eeschema/sch_table.js';
import { SCH_TABLECELL } from '@ziroeda/eeschema/sch_tablecell.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schFrame, schToolHarness } from '../support/sch_tool_harness.js';

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => {
  cleanup();
  SetPgm(null);
});

function open() {
  const h = schToolHarness(schFrame({}));
  const table = new SCH_TABLE();
  table.SetColCount(2);
  for (const text of ['A', 'B']) {
    const cell = new SCH_TABLECELL();
    cell.SetText(text);
    table.AddCell(cell);
  }
  table.Normalize();
  // Two cells with different text colours: the colour is mixed.
  table.GetCell(0, 0)!.SetTextColor({ r: 1, g: 0, b: 0, a: 1 });
  h.frame.AddToScreen(table, h.frame.GetScreen());
  const help = vi.fn();
  h.frame.SetBusSyntaxHelpPresenter(help);
  const dlg = new DIALOG_TABLECELL_PROPERTIES(h.frame, [
    table.GetCell(0, 0)!,
    table.GetCell(0, 1)!,
  ]);
  const onClose = vi.fn();
  render(
    <DialogTableCellProperties
      dlg={dlg}
      initial={dlg.TransferDataToWindow()}
      units="mils"
      onClose={onClose}
    />,
  );
  return { help, onClose, table };
}

describe('DIALOG_TABLECELL_PROPERTIES_BASE', () => {
  it('labels the size and the margins in the frame units', () => {
    open();
    expect(screen.getAllByText('mils')).toHaveLength(2);
  });

  it('a mixed text colour shows the popup until Set Color... flips it to the swatch', () => {
    open();
    // Only the background fill book (its cells agree) is on its swatch page.
    expect(document.querySelectorAll('.ze-swatch')).toHaveLength(1);
    expect(screen.queryByRole('dialog', { name: 'Color Picker' })).toBeNull();
    fireEvent.click(screen.getByLabelText('Text color'));
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Set Color...' }));
    // onTextColorPopup: m_textColorBook->SetSelection( 1 ); GetNewSwatchColor() - the picker opens.
    expect(document.querySelectorAll('.ze-swatch').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('dialog', { name: 'Color Picker' })).toBeTruthy();
  });

  it('Syntax help opens the frame syntax help', () => {
    const { help } = open();
    fireEvent.click(screen.getByText('Syntax help'));
    expect(help).toHaveBeenCalledTimes(1);
  });

  it('OK writes the cell text and closes with TABLECELL_PROPS_OK', () => {
    const { onClose, table } = open();
    fireEvent.change(screen.getByLabelText('Cell contents'), { target: { value: 'Z' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(table.GetCell(0, 1)!.GetText()).toBe('Z');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
