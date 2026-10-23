// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `DIALOG_FIELD_PROPERTIES::UpdateField( SCH_FIELD* )` (dialog_field_properties.cpp:590), the
 * symbol editor's form: a library symbol's field takes the dialog's text, look, name visibility,
 * autoplace flag, justification and position - and no commit, the caller's.
 */
import { GR_TEXT_H_ALIGN_T, GR_TEXT_V_ALIGN_T } from '@ziroeda/common/eda_text.js';
import type { GRID_TEXT_BUTTON_HOST } from '@ziroeda/common/widgets/grid_text_button_helpers.js';
import { DIALOG_FIELD_PROPERTIES } from '@ziroeda/eeschema/dialogs/dialog_field_properties.js';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

const HOST: GRID_TEXT_BUTTON_HOST = {
  ChooseFootprint: () => Promise.resolve(null),
  OpenFile: () => Promise.resolve(null),
  OpenDocument: () => {},
};

let t: SYMBOL_EDIT_HARNESS;

beforeEach(() => {
  t = symbolEditHarness();
});

afterEach(() => t.dispose());

it('writes every control back to the library field', () => {
  const field = t.open().GetValueField();
  const dlg = new DIALOG_FIELD_PROPERTIES(t.frame, 'Value', field, HOST);
  const shown = dlg.TransferDataToWindow();
  const wasAutoplace = field.CanAutoplace();

  expect(
    dlg.TransferDataFromWindow({
      ...shown,
      text: 'NEW',
      nameVisible: true,
      allowAutoplace: !shown.allowAutoplace,
      hAlign: GR_TEXT_H_ALIGN_T.GR_TEXT_H_ALIGN_LEFT,
      vAlign: GR_TEXT_V_ALIGN_T.GR_TEXT_V_ALIGN_TOP,
      posX: '2.54',
      posY: '-1.27',
    }),
  ).toBe(true);
  dlg.UpdateField(field);

  expect({
    text: field.GetText(),
    nameShown: field.IsNameShown(),
    autoplace: field.CanAutoplace(),
    h: field.GetHorizJustify(),
    v: field.GetVertJustify(),
    // m_posX / m_posY in millimetres, to IU with no flip: TransferDataFromWindow takes them as they
    // read.
    pos: field.GetTextPos(),
  }).toEqual({
    text: 'NEW',
    nameShown: true,
    autoplace: !wasAutoplace,
    h: GR_TEXT_H_ALIGN_T.GR_TEXT_H_ALIGN_LEFT,
    v: GR_TEXT_V_ALIGN_T.GR_TEXT_V_ALIGN_TOP,
    pos: { x: 25400, y: -12700 },
  });
});
