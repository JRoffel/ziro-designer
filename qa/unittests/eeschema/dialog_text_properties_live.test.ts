// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_TEXT_PROPERTIES (dialog_text_properties.cpp) on live text and text boxes: references
 * shown human-readable and stored as KIIDs (SCHEMATIC::ConvertRefsToKIIDs), an invalid hyperlink
 * refused, justification / angle / style written, a text box grown to its minimum size.
 */
import { resolve } from 'node:path';
import { GR_TEXT_H_ALIGN_T, GR_TEXT_V_ALIGN_T } from '@ziroeda/common/font/text_attributes.js';
import { SetErrorPresenter } from '@ziroeda/common/confirm.js';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import {
  DIALOG_TEXT_PROPERTIES,
  INVALID_HYPERLINK_MESSAGE,
} from '@ziroeda/eeschema/dialogs/dialog_text_properties.js';
import type { SCH_SYMBOL } from '@ziroeda/eeschema/sch_symbol.js';
import { SCH_TEXT } from '@ziroeda/eeschema/sch_text.js';
import { SCH_TEXTBOX } from '@ziroeda/eeschema/sch_textbox.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openProject, schFrame, schToolHarness } from './support/sch_tool_harness.js';

const ORACLE = resolve(__dirname, '../../data/eeschema/netlist_oracle/complex_hierarchy');
const SHEETS = ['complex_hierarchy.kicad_sch', 'ampli_ht.kicad_sch', 'complex_hierarchy.kicad_pro'];

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => SetPgm(null));

function setUp() {
  const h = schToolHarness(schFrame({}));
  openProject(h.frame, ORACLE, 'complex_hierarchy', SHEETS);
  const root = h.frame.Schematic().Hierarchy()[0]!;
  h.frame.SetCurrentSheet(root);
  const text = new SCH_TEXT({ x: 0, y: 0 }, 'hello');
  h.frame.AddToScreen(text, h.frame.GetScreen());
  return { h, root, text, dlg: new DIALOG_TEXT_PROPERTIES(h.frame, text) };
}

describe('DIALOG_TEXT_PROPERTIES', () => {
  it('stores a ${ref:field} cross-reference as its KIID path, and shows it as the ref again', () => {
    const { h, root, text, dlg } = setUp();
    const symbol = [...root.LastScreen()!.Items().OfType(KICAD_T.SCH_SYMBOL_T)].find(
      (s) => !(s as SCH_SYMBOL).GetRef(root).startsWith('#'),
    ) as SCH_SYMBOL;
    const ref = symbol.GetRef(root, true);

    expect(
      dlg.TransferDataFromWindow({ ...dlg.TransferDataToWindow(), text: `v=\${${ref}:VALUE}` }),
    ).toBe(true);

    expect(text.GetText()).toBe(`v=\${${root.Path().AsString()}/${symbol.m_Uuid}:VALUE}`);
    expect(new DIALOG_TEXT_PROPERTIES(h.frame, text).TransferDataToWindow().text).toBe(
      `v=\${${ref}:VALUE}`,
    );
  });

  it('refuses an invalid hyperlink and changes nothing', () => {
    const { h, text, dlg } = setUp();
    const undo = h.frame.GetUndoCommandCount();

    const error = vi.fn();
    SetErrorPresenter(error);
    expect(
      dlg.TransferDataFromWindow({ ...dlg.TransferDataToWindow(), text: 'x', hyperlink: 'nope' }),
    ).toBe(false);
    expect(error.mock.calls[0]?.[0]).toBe(INVALID_HYPERLINK_MESSAGE);
    expect(text.GetText()).toBe('hello');
    expect(h.frame.GetUndoCommandCount()).toBe(undo);
  });

  it('writes size, justification, angle and style as one commit', () => {
    const { h, text, dlg } = setUp();
    const undo = h.frame.GetUndoCommandCount();

    dlg.TransferDataFromWindow({
      ...dlg.TransferDataToWindow(),
      size: '0.254',
      hAlign: 'right',
      vAlign: 'bottom',
      angle: 90,
      bold: true,
    });

    expect(text.GetTextWidth()).toBe(2540);
    expect(text.GetHorizJustify()).toBe(GR_TEXT_H_ALIGN_T.GR_TEXT_H_ALIGN_RIGHT);
    expect(text.GetVertJustify()).toBe(GR_TEXT_V_ALIGN_T.GR_TEXT_V_ALIGN_BOTTOM);
    expect(text.GetTextAngle().IsVertical()).toBe(true);
    expect(text.IsBold()).toBe(true);
    expect(h.frame.GetUndoCommandCount()).toBe(undo + 1);
  });

  it('a text box takes border and fill, and grows to the size its text needs', () => {
    const { h } = setUp();
    const box = new SCH_TEXTBOX();
    box.SetText('a long line of text that needs room');
    box.SetStart({ x: 0, y: 0 });
    box.SetEnd({ x: 10, y: 10 });
    h.frame.AddToScreen(box, h.frame.GetScreen());
    const dlg = new DIALOG_TEXT_PROPERTIES(h.frame, box);
    expect(dlg.IsTextBox()).toBe(true);

    dlg.TransferDataFromWindow({
      ...dlg.TransferDataToWindow(),
      border: false,
      filled: true,
      fillColor: { r: 1, g: 0, b: 0, a: 1 },
    });

    expect(box.GetWidth()).toBe(-1);
    expect(box.IsSolidFill()).toBe(true);
    const min = box.GetMinSize();
    expect(Math.abs(box.GetEnd().x - box.GetStart().x)).toBeGreaterThanOrEqual(min.x);
    expect(Math.abs(box.GetEnd().y - box.GetStart().y)).toBeGreaterThanOrEqual(min.y);
  });

  it('refuses a text size under 0.01 mm, and writes a ticked border at its width', () => {
    const { h, text, dlg } = setUp();
    const error = vi.fn();
    SetErrorPresenter(error);
    const width = text.GetTextWidth();
    expect(dlg.TransferDataFromWindow({ ...dlg.TransferDataToWindow(), size: '0.001' })).toBe(
      false,
    );
    expect(error).toHaveBeenCalledTimes(1);
    expect(text.GetTextWidth()).toBe(width);

    const box = new SCH_TEXTBOX();
    box.SetText('b');
    h.frame.AddToScreen(box, h.frame.GetScreen());
    const boxDlg = new DIALOG_TEXT_PROPERTIES(h.frame, box);
    boxDlg.TransferDataFromWindow({
      ...boxDlg.TransferDataToWindow(),
      border: true,
      borderWidth: '0.3',
    });
    // 0.3 mm in schematic IU (100 nm).
    expect(box.GetWidth()).toBe(3000);
  });
});
