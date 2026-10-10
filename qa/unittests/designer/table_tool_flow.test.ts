// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `SCH_DRAWING_TOOLS::DrawTable`, end to end.
 *
 * Two things were missing and neither could fail a test, because both live in
 * `.tsx` that `qa` cannot compile:
 *
 *  - **the preview was a rectangle.** Upstream's motion branch rebuilds the
 *    whole table — cells and all — on every mouse move and re-adds it to the
 *    view preview, so the grid you are about to get is on screen while you are
 *    still dragging. Ours drew a plain notes-layer box that turned into a table
 *    on release;
 *  - **and the dialog only reported the counts.** `DrawTable` ends with
 *    `DIALOG_TABLE_PROPERTIES`, whose OK is what commits the table and whose
 *    Cancel deletes it. Ours had OK/Cancel over three read-only lines, so a
 *    table could be created but never given contents or a border.
 *
 * Read as source text, which is crude, but it is the only way to see these two
 * files from here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const EDITOR = read('../../../eeschema/sch_edit_frame_ui.tsx');
const DIALOG = read('../../../eeschema/dialogs/dialog_table_properties.tsx');
/** eeschema's DIALOG_TABLE_PROPERTIES_BASE: the layout; DIALOG is its logic. */
const BASE = read('../../../eeschema/dialogs/dialog_table_properties_base.tsx');

describe('the dialog the tool ends with', () => {
  it('edits the cell contents', () => {
    expect(BASE).toContain('Cell contents');
  });

  it('and the border and separator controls upstream has', () => {
    for (const label of [
      'External border',
      'Header border',
      'Row lines',
      'Column lines',
      'Width:',
      'Style:',
    ])
      expect(BASE).toContain(label);
    // "Color:" is eeschema's alone: a PCB_TABLE takes its layer's colour.
    expect(BASE).toContain('Color:');
  });

  it('greying out the line controls when the lines are off', () => {
    // `m_borderWidth.Enable( StrokeExternal() || StrokeHeaderSeparator() )`, in eeschema's own
    // DIALOG_TABLE_PROPERTIES over its _base (10-11: one pair per editor, as KiCad has). The
    // behaviour is pinned by qa/unittests/eeschema/dialogs/dialog_table_properties.test.tsx.
    expect(DIALOG).toContain('const borderOn = v.borderExternal || v.borderHeader;');
    expect(DIALOG).toContain('const sepOn = v.separatorRows || v.separatorCols;');
    expect(DIALOG).not.toContain('common/dialogs/dialog_table_properties');
  });

  it('and the old read-only stub is gone', () => {
    // It reported the counts the drag had produced and offered nothing else.
    expect(EDITOR).not.toContain('tableDrawGrid');
    expect(EDITOR).not.toContain('setTableEdit');
  });
});
