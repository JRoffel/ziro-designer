// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_SHEET_PIN_PROPERTIES over its _base: the units label, Syntax help opening the frame's
 * syntax-help window, an invalid name refused with "Invalid signal name" (and OK not taken), and
 * a valid one handed back.
 */
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import {
  DIALOG_SHEET_PIN_PROPERTIES,
  DialogSheetPinProperties,
} from '@ziroeda/eeschema/dialogs/dialog_sheet_pin_properties.js';
import { LABEL_FLAG_SHAPE, SCH_HIERLABEL } from '@ziroeda/eeschema/sch_label.js';
import { SCH_SCREEN } from '@ziroeda/eeschema/sch_screen.js';
import { SCH_SHEET } from '@ziroeda/eeschema/sch_sheet.js';
import { SCH_SHEET_PIN } from '@ziroeda/eeschema/sch_sheet_pin.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schFrame, schToolHarness } from '../support/sch_tool_harness.js';

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => {
  cleanup();
  SetPgm(null);
});

function open(onOk = vi.fn()) {
  const h = schToolHarness(schFrame({}));
  const sheet = new SCH_SHEET(null, { x: 0, y: 0 }, { x: 25400, y: 25400 });
  h.frame.AddToScreen(sheet, h.frame.GetScreen());
  // A sub-sheet screen holding one output hierarchical label, OUT2.
  const sub = new SCH_SCREEN(h.frame.Schematic());
  sheet.SetScreen(sub);
  const out = new SCH_HIERLABEL({ x: 0, y: 0 }, 'OUT2');
  out.SetShape(LABEL_FLAG_SHAPE.L_OUTPUT);
  sub.Append(out);
  const pin = new SCH_SHEET_PIN(sheet, { x: 0, y: 0 }, 'IN1');
  sheet.AddPin(pin);
  const dlg = new DIALOG_SHEET_PIN_PROPERTIES(h.frame, pin);
  const help = vi.fn();
  h.frame.SetBusSyntaxHelpPresenter(help);
  render(
    <DialogSheetPinProperties
      dlg={dlg}
      initial={dlg.TransferDataToWindow()}
      units="mils"
      onOk={onOk}
      onCancel={() => {}}
    />,
  );
  return { help, onOk };
}

describe('DIALOG_SHEET_PIN_PROPERTIES_BASE', () => {
  it('labels the text size in the frame units', () => {
    open();
    expect(screen.getByText('mils')).toBeTruthy();
    expect((screen.getByLabelText('Text size') as HTMLInputElement).value).toBe('1.27');
  });

  it('Syntax help opens the frame syntax help', () => {
    const { help } = open();
    fireEvent.click(screen.getByText('Syntax help'));
    expect(help).toHaveBeenCalledTimes(1);
  });

  it('an invalid name is refused with "Invalid signal name"; a valid one goes back', () => {
    const { onOk } = open();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'A[7..' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByText('Invalid signal name')).toBeTruthy();
    expect(onOk).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'OK' }).at(-1)!);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'IN2' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onOk.mock.calls[0]![0]).toMatchObject({ name: 'IN2' });
  });

  it('picking OUT2 from the list sets the Output shape (onComboBox)', () => {
    open();
    expect((screen.getByLabelText('Input') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(document.querySelector('.ze-textcombo-button')!);
    fireEvent.mouseDown(screen.getByRole('option', { name: 'OUT2' }));
    expect((screen.getByLabelText('Output') as HTMLInputElement).checked).toBe(true);
  });
});
