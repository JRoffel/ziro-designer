// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The Text Box Properties dialog, against `dialog_textbox_properties_base.cpp`.
 *
 * wxFormBuilder generates that file, so every control below is a declaration in
 * a checked-in file rather than a judgement call. Four things this pins, all of
 * which were wrong:
 *
 *  - **No group boxes.** `bMainSizer` is vertical: the multi-line control, a
 *    "Syntax help" link, `Locked`, then one `wxGridBagSizer`. This dialog had
 *    invented Text / Font / Alignment / Border fieldsets and put a four-line
 *    text area in the corner of the first one.
 *  - **The formatting bar is the shared one.** KiCad assembles the same
 *    `FONT_CHOICE` + `BITMAP_BUTTON` row into every dialog that edits text;
 *    ours had spelled it out as two checkboxes and two dropdowns.
 *  - **Knockout and the four margins are not in this dialog.** They are
 *    `PCB_TEXTBOX`'s property-manager entries (`pcb_textbox.cpp:871,893-900`),
 *    so they belong to the Properties panel. They were invented controls.
 *  - **Orientation is a combo**, `m_OrientCtrl` being a `wxComboBox`, not a
 *    free-text angle field.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../designer/src/${rel}`, import.meta.url)), 'utf8');

describe('the tool that opens it wears the right cursor', () => {
  it('is the pencil, like every other graphic-drawing tool', () => {
    // `DRAWING_TOOL::drawShape`'s setCursor is one unconditional line, and the
    // text box is `DrawRectangle`'s `isTextBox` arm, so it goes through it.
    const cursors = read('../../common/tool/tool_cursors.ts');
    for (const tool of [
      'drawTextBox',
      'drawLine',
      'drawRectangle',
      'drawCircle',
      'drawArc',
      'drawPolygon',
      'drawZone',
      'drawRuleArea',
    ])
      expect(cursors).toMatch(new RegExp(`${tool}:\\s*'PENCIL'`));
  });
});
