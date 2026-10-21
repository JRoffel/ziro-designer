// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `LIB_FIELDS_EDITOR_GRID_DATA_MODEL` (lib_fields_data_model.cpp), the library Symbol Fields
 * Table's grid table: columns and the per-symbol data store, cell reads and writes, filtering,
 * grouping and sorting, expanding groups on a live grid, the cell colours and stripes, ApplyData
 * writing back, and derived-symbol creation.
 */
import { FIELD_T } from '@ziroeda/common/template_fieldnames.js';
import { STRIPED_STRING_RENDERER } from '@ziroeda/common/widgets/grid_striped_renderer.js';
import { INDETERMINATE_STATE } from '@ziroeda/common/widgets/ui_common.js';
import { GROUP_TYPE, WX_GRID } from '@ziroeda/common/widgets/wx_grid.js';
import { LIB_FIELDS_EDITOR_GRID_DATA_MODEL } from '@ziroeda/eeschema/lib_fields_data_model.js';
import { LIB_SYMBOL } from '@ziroeda/eeschema/lib_symbol.js';
import { SCH_FIELD } from '@ziroeda/eeschema/sch_field.js';
import { wxGRID_VALUE_BOOL, wxGridCellAttr, wxGridSelectionModes } from '@ziroeda/wx/grid.js';
import { describe, expect, it } from 'vitest';

const { SYMBOL_NAME } = LIB_FIELDS_EDITOR_GRID_DATA_MODEL;
const ANY_KIND = 0 as never;

function symbol(aName: string, aValue = '', aExtra: Record<string, string> = {}): LIB_SYMBOL {
  const s = new LIB_SYMBOL(aName);
  if (aValue !== '') s.GetValueField().SetText(aValue);
  for (const [name, text] of Object.entries(aExtra)) {
    const f = new SCH_FIELD(s, FIELD_T.USER, name);
    f.SetText(text);
    s.AddField(f);
  }
  return s;
}

/** A model over \a aSymbols with the Symbol Name, Value and any further columns, rows built. */
function model(aSymbols: LIB_SYMBOL[], aCols: string[] = [], aView = false) {
  const m = new LIB_FIELDS_EDITOR_GRID_DATA_MODEL();
  m.SetSymbols(aSymbols);
  m.AddColumn(SYMBOL_NAME, SYMBOL_NAME, false, false);
  m.AddColumn('Value', 'Value', false, false);
  for (const c of aCols) m.AddColumn(c, c, false, c.startsWith('${') || c.endsWith('Power'));
  if (aView) {
    const grid = new WX_GRID();
    grid.SetTable(m, false, wxGridSelectionModes.wxGridSelectRows);
  }
  m.RebuildRows();
  return m;
}

const col = (m: LIB_FIELDS_EDITOR_GRID_DATA_MODEL, aName: string) => m.GetFieldNameCol(aName);
const names = (m: LIB_FIELDS_EDITOR_GRID_DATA_MODEL) =>
  Array.from({ length: m.GetNumberRows() }, (_, r) => m.GetValue(r, col(m, SYMBOL_NAME)));

describe('LIB_FIELDS_EDITOR_GRID_DATA_MODEL columns and the data store', () => {
  it('seeds each column from the symbol: a field, Keywords, the name, an attribute, a missing field', () => {
    const r = symbol('R', '10k', { MPN: 'X' });
    r.SetKeyWords('res');
    r.SetExcludedFromBOM(true);
    const m = model([r], ['MPN', 'Keywords', '${EXCLUDE_FROM_BOM}', 'Power', 'Note']);

    expect(m.GetValue(0, col(m, SYMBOL_NAME))).toBe('R');
    expect(m.GetValue(0, col(m, 'Value'))).toBe('10k');
    expect(m.GetValue(0, col(m, 'MPN'))).toBe('X');
    expect(m.GetValue(0, col(m, 'Keywords'))).toBe('res');
    expect(m.GetValue(0, col(m, '${EXCLUDE_FROM_BOM}'))).toBe('1');
    expect(m.GetValue(0, col(m, 'Power'))).toBe('0');
    expect(m.GetValue(0, col(m, 'Note'))).toBe('');
    expect(m.IsCellClear(0, col(m, 'Note'))).toBe(true);
    expect(m.IsCellClear(0, col(m, 'MPN'))).toBe(false);
    expect(m.GetTypeName(0, col(m, 'Power'))).toBe(wxGRID_VALUE_BOOL);
    expect(m.GetTypeName(0, col(m, 'MPN'))).not.toBe(wxGRID_VALUE_BOOL);
  });

  it('a field already a column is not added again, whatever its case or label', () => {
    const m = model([symbol('R')]);
    m.AddColumn('value', 'Other', false, false);
    expect(m.GetNumberCols()).toBe(2);
    expect(m.GetColLabelValue(1)).toBe('Value');
    m.SetColLabelValue(1, 'Val');
    expect(m.GetColLabelValue(1)).toBe('Val');
    expect(m.GetColFieldName(1)).toBe('Value');
  });

  it('removes, renames and moves columns, keeping the sort column on its field', () => {
    const r = symbol('R', '1', { A: 'a', B: 'b' });
    const m = model([r], ['A', 'B']);
    m.SetSorting(3, true);
    m.RemoveColumn(2);
    expect(m.GetSortCol()).toBe(2);
    expect(m.GetColFieldName(2)).toBe('B');
    expect(m.IsEdited()).toBe(true);
    // Removing the sort column itself sorts by column 0.
    m.SetSorting(1, true);
    m.RemoveColumn(1);
    expect(m.GetSortCol()).toBe(0);
    // A column after the removed one is untouched.
    m.SetSorting(0, true);
    m.RemoveColumn(1);
    expect(m.GetSortCol()).toBe(0);

    const m2 = model([symbol('R', '1', { A: 'a' })], ['A']);
    m2.RenameColumn(2, 'Alpha');
    expect(m2.GetColFieldName(2)).toBe('Alpha');
    expect(m2.GetColLabelValue(2)).toBe('Alpha');
    expect(m2.GetValue(0, 2)).toBe('a');
    expect(m2.IsCellEdited(0, 2)).toBe(true);

    m2.MoveColumn(0, 2);
    expect([0, 1, 2].map((c) => m2.GetColFieldName(c))).toEqual(['Value', 'Alpha', SYMBOL_NAME]);
    m2.MoveColumn(2, 0);
    expect([0, 1, 2].map((c) => m2.GetColFieldName(c))).toEqual([SYMBOL_NAME, 'Value', 'Alpha']);

    m2.SetFieldsOrder(['Alpha', SYMBOL_NAME]);
    expect([0, 1, 2].map((c) => m2.GetColFieldName(c))).toEqual(['Alpha', SYMBOL_NAME, 'Value']);
  });

  it('the expander column is the first one shown', () => {
    const m = model([symbol('R')], ['A']);
    expect(m.IsExpanderColumn(0)).toBe(true);
    expect(m.IsExpanderColumn(2)).toBe(true);
    m.SetShowColumn(1, true);
    expect(m.GetShowColumn(1)).toBe(true);
    expect(m.IsExpanderColumn(2)).toBe(false);
    expect(m.IsExpanderColumn(1)).toBe(true);
  });
});

describe('LIB_FIELDS_EDITOR_GRID_DATA_MODEL cells', () => {
  it('SetValue edits every symbol of the row; the name column is not editable', () => {
    const m = model([symbol('R', '10k')]);
    expect(m.IsEdited()).toBe(false);
    m.SetValue(0, col(m, SYMBOL_NAME), 'S');
    expect(m.GetValue(0, col(m, SYMBOL_NAME))).toBe('R');
    expect(m.IsEdited()).toBe(false);

    m.SetValue(0, col(m, 'Value'), '22k');
    expect(m.GetValue(0, col(m, 'Value'))).toBe('22k');
    expect(m.IsCellEdited(0, col(m, 'Value'))).toBe(true);
    // Back to the original: no longer modified.
    m.SetValue(0, col(m, 'Value'), '10k');
    expect(m.IsCellEdited(0, col(m, 'Value'))).toBe(false);
    expect(m.IsEdited()).toBe(true);
  });

  it('a group shows the shared value, or indeterminate; its name column lists the names', () => {
    const a = symbol('A', '10k', { G: 'x' });
    const b = symbol('B', '22k', { G: 'x' });
    const m = model([a, b], ['G']);
    m.SetGroupColumn(col(m, 'G'), true);
    expect(m.GetGroupColumn(col(m, 'G'))).toBe(true);
    m.SetGroupingEnabled(true);
    m.RebuildRows();

    expect(m.GetNumberRows()).toBe(1);
    expect(m.GetGroupType(0)).toBe(GROUP_TYPE.GROUP_COLLAPSED);
    expect(m.GetValue(0, col(m, 'G'))).toBe('x');
    expect(m.GetValue(0, col(m, 'Value'))).toBe(INDETERMINATE_STATE);
    expect(m.GetValue(0, col(m, SYMBOL_NAME))).toBe('A,B');
    expect(m.IsRowSingleSymbol(0)).toBe(false);
    expect(m.IsRowEditable(0)).toBe(false);
  });

  it('ClearCell empties a field cell; Keywords is cleared, not removed', () => {
    const r = symbol('R', '10k', { MPN: 'X' });
    r.SetKeyWords('res');
    const m = model([r], ['MPN', 'Keywords']);
    m.ClearCell(0, col(m, 'MPN'));
    expect(m.GetValue(0, col(m, 'MPN'))).toBe('');
    expect(m.IsCellClear(0, col(m, 'MPN'))).toBe(true);
    expect(m.IsCellEdited(0, col(m, 'MPN'))).toBe(true);
    m.ClearCell(0, col(m, 'Keywords'));
    expect(m.IsCellClear(0, col(m, 'Keywords'))).toBe(false);
    expect(m.IsCellEdited(0, col(m, 'Keywords'))).toBe(true);

    // A field already empty and absent stays unmodified when cleared.
    const m2 = model([symbol('S')], ['Note']);
    m2.ClearCell(0, col(m2, 'Note'));
    expect(m2.IsCellEdited(0, col(m2, 'Note'))).toBe(false);
  });

  it('RevertRow puts a row back, and IsEdited answers for what is left', () => {
    const m = model([symbol('A', '1'), symbol('B', '2')]);
    const a = names(m).indexOf('A');
    m.SetValue(a, 1, 'x');
    m.SetValue(1 - a, 1, 'y');
    m.RevertRow(a);
    expect(m.GetValue(a, 1)).toBe('1');
    expect(m.IsEdited()).toBe(true);
    m.RevertRow(1 - a);
    expect(m.IsEdited()).toBe(false);
  });
});

describe('LIB_FIELDS_EDITOR_GRID_DATA_MODEL rows', () => {
  it('filters on any column, wildcards, case ignored', () => {
    const m = model([symbol('R1', '10k'), symbol('C1', '100n'), symbol('R2', '4k7')]);
    m.SetFilter('r*');
    expect(m.GetFilter()).toBe('r*');
    m.RebuildRows();
    expect(names(m).sort()).toEqual(['R1', 'R2']);
    m.SetFilter('*N');
    m.RebuildRows();
    expect(names(m)).toEqual(['C1']);
  });

  it('sorts by the sort column either way, and numbers the items', () => {
    const m = model([symbol('B', '2'), symbol('A', '3'), symbol('C', '1')]);
    m.SetSorting(col(m, 'Value'), true);
    expect(m.GetSortAsc()).toBe(true);
    m.RebuildRows();
    expect(names(m)).toEqual(['C', 'B', 'A']);
    m.SetSorting(col(m, 'Value'), false);
    m.RebuildRows();
    expect(names(m)).toEqual(['A', 'B', 'C']);
    // The default sort is column 0 descending.
    const d = model([symbol('B'), symbol('A'), symbol('C')]);
    expect(names(d)).toEqual(['C', 'B', 'A']);
  });

  it('expands and collapses a group on a live grid, and keeps it expanded across a sort', () => {
    const syms = [symbol('A', '1', { G: 'x' }), symbol('B', '1', { G: 'x' }), symbol('C', '2')];
    const m = model(syms, ['G'], true);
    m.SetGroupColumn(col(m, 'G'), true);
    m.SetGroupingEnabled(true);
    m.SetSorting(col(m, SYMBOL_NAME), true);
    m.RebuildRows();
    const grid = m.GetView()!;
    expect(m.GetNumberRows()).toBe(2);
    const group = [0, 1].find((r) => m.GetGroupType(r) === GROUP_TYPE.GROUP_COLLAPSED)!;

    // The group row stays, a child row per symbol below it.
    m.ExpandCollapseRow(group);
    expect(m.GetNumberRows()).toBe(4);
    expect(grid.GetNumberRows()).toBe(4);
    expect(m.GetGroupType(group)).toBe(GROUP_TYPE.GROUP_EXPANDED);
    expect(m.GetGroupType(group + 1)).toBe(GROUP_TYPE.CHILD_ITEM);
    expect(m.IsRowSingleSymbol(group + 1)).toBe(true);

    m.RebuildRows();
    // Rebuilt rows start collapsed; an expanded group survives Sort() only.
    m.ExpandRow(group);
    (m as unknown as { Sort(): void }).Sort();
    expect(m.GetNumberRows()).toBe(4);
    expect(m.GetGroupType(group)).toBe(GROUP_TYPE.GROUP_EXPANDED);

    m.ExpandCollapseRow(group);
    expect(m.GetNumberRows()).toBe(2);
    expect(grid.GetNumberRows()).toBe(2);
    expect(m.GetGroupType(group)).toBe(GROUP_TYPE.GROUP_COLLAPSED);

    // A singleton does not expand.
    const single = group === 0 ? 1 : 0;
    m.ExpandCollapseRow(single);
    expect(m.GetNumberRows()).toBe(2);
  });

  it('GetSymbolForRow and GetSymbolNames', () => {
    const a = symbol('A');
    const m = model([a, symbol('B')]);
    expect(m.GetSymbolForRow(names(m).indexOf('A'))).toBe(a);
    expect(m.GetSymbolForRow(9)).toBeNull();
    const list: string[] = ['stale'];
    m.GetSymbolNames(list);
    expect(list).toEqual(['A', 'B']);
  });
});

describe('LIB_FIELDS_EDITOR_GRID_DATA_MODEL cell colours', () => {
  it('a modified row is WINDOWFRAME, a blanked field green, an empty cell striped', () => {
    const m = model([symbol('R', '10k', { MPN: 'X' })], ['MPN', 'Note', 'Power']);
    expect(m.GetAttr(0, col(m, 'Value'), ANY_KIND)!.GetBackgroundColour()).toBeFalsy();

    const empty = m.GetAttr(0, col(m, 'Note'), ANY_KIND)!;
    expect(empty.GetRendererPtr()).toBeInstanceOf(STRIPED_STRING_RENDERER);
    expect(empty.GetBackgroundColour()).toBe('var(--chrome-bg2)');
    // Checkboxes are never striped, and one renderer serves a field.
    expect(m.GetAttr(0, col(m, 'Power'), ANY_KIND)!.GetRendererPtr()).not.toBeInstanceOf(
      STRIPED_STRING_RENDERER,
    );
    expect(m.GetAttr(0, col(m, 'Note'), ANY_KIND)!.GetRendererPtr()).toBe(empty.GetRendererPtr());

    m.SetValue(0, col(m, 'Value'), '22k');
    expect(m.GetAttr(0, col(m, 'MPN'), ANY_KIND)!.GetBackgroundColour()).toBe(
      'var(--sys-windowframe)',
    );
    m.SetValue(0, col(m, 'MPN'), '');
    expect(m.GetAttr(0, col(m, 'MPN'), ANY_KIND)!.GetBackgroundColour()).toBe('#c0ffc0');
  });

  it('a modified empty cell takes the stripe tint for what happened to it', () => {
    const m = model([symbol('R', '10k', { MPN: 'X', E: '' })], ['MPN', 'E', 'Note']);
    // Removed: had text, now cleared.
    m.ClearCell(0, col(m, 'MPN'));
    expect(m.GetAttr(0, col(m, 'MPN'), ANY_KIND)!.GetBackgroundColour()).toBe('#dcb4b4');
    // Cleared a field that was there but empty.
    m.ClearCell(0, col(m, 'E'));
    expect(m.GetAttr(0, col(m, 'E'), ANY_KIND)!.GetBackgroundColour()).toBe('#b4dcb4');

    // Once a cell has text again its stripe goes.
    m.SetValue(0, col(m, 'MPN'), 'Y');
    const attr = m.GetAttr(0, col(m, 'MPN'), ANY_KIND)!;
    expect(attr.GetRendererPtr()).not.toBeInstanceOf(STRIPED_STRING_RENDERER);
    expect(attr.GetBackgroundColour()).toBe('var(--sys-windowframe)');
  });
});

describe('LIB_FIELDS_EDITOR_GRID_DATA_MODEL ApplyData', () => {
  it('writes values, keywords and attributes back; reports each changed symbol', () => {
    const r = symbol('R', '10k', { MPN: 'X', Old: 'o' });
    r.SetKeyWords('res');
    const m = model([r], ['MPN', 'Keywords', '${DNP}', 'Footprint', 'Reference']);
    m.SetValue(0, col(m, 'MPN'), 'Y');
    m.SetValue(0, col(m, 'Keywords'), 'resistor');
    m.SetValue(0, col(m, '${DNP}'), '1');
    m.SetValue(0, col(m, 'Footprint'), 'R_0402');
    m.SetValue(0, col(m, 'Reference'), 'Q');
    const changed: LIB_SYMBOL[] = [];
    let posted = 0;
    m.ApplyData(
      (s) => changed.push(s),
      () => posted++,
    );

    expect(r.GetField('MPN')!.GetText()).toBe('Y');
    expect(r.GetKeyWords()).toBe('resistor');
    expect(r.GetDNP()).toBe(true);
    expect(r.GetField(FIELD_T.FOOTPRINT)!.GetText()).toBe('R_0402');
    // The reference is not editable here.
    expect(r.GetField(FIELD_T.REFERENCE)!.GetText()).not.toBe('Q');
    // "Old" has no column, so it is not tracked: removed.
    expect(r.GetField('Old')).toBeNull();
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((s) => s === r)).toBe(true);
    expect(posted).toBe(1);
    expect(m.IsEdited()).toBe(false);
    expect(m.IsCellEdited(0, col(m, 'MPN'))).toBe(false);
  });

  it('an empty value is refused; a user column creates its field; an empty field is not created', () => {
    const r = symbol('R', '10k');
    const m = model([r], ['Note']);
    m.AddColumn('Added', 'Added', true, false);
    m.SetValue(0, col(m, 'Value'), '');
    m.ApplyData(() => {});
    expect(r.GetValueField().GetText()).toBe('10k');
    expect(r.GetField('Added')).not.toBeNull();
    expect(r.GetField('Note')).toBeNull();

    m.SetValue(0, col(m, 'Note'), 'n');
    m.ApplyData(() => {});
    expect(r.GetField('Note')!.GetText()).toBe('n');
  });

  it('Power off makes a normal symbol; LocalPower off leaves it global', () => {
    const r = symbol('P');
    r.SetLocalPower();
    const m = model([r], ['Power', 'LocalPower']);
    m.SetValue(0, col(m, 'LocalPower'), '0');
    m.ApplyData(() => {});
    expect(r.IsPower()).toBe(true);
    expect(r.IsLocalPower()).toBe(false);
    m.SetValue(0, col(m, 'Power'), '0');
    m.SetValue(0, col(m, 'LocalPower'), '0');
    m.ApplyData(() => {});
    expect(r.IsPower()).toBe(false);
  });
});

describe('LIB_FIELDS_EDITOR_GRID_DATA_MODEL derived symbols', () => {
  it('a requested derived symbol is created on ApplyData, named uniquely when it repeats its parent', () => {
    const p = symbol('P', '1');
    const taken = symbol('P_1', '1');
    const m = model([p, taken]);
    const row = names(m).indexOf('P');
    m.CreateDerivedSymbol(row, col(m, 'Value'), 'P');
    expect(m.IsEdited()).toBe(true);
    m.ApplyData(() => {});

    const created = m.GetAndClearCreatedDerivedSymbols();
    expect(created.length).toBe(1);
    const [child] = created[0]!;
    expect(child.GetName()).toBe('P_2');
    expect(child.GetValueField().GetText()).toBe('P_2');
    expect(child.GetLibParent()).toBe(p);
    expect(child.m_Uuid).not.toBe(p.m_Uuid);
    expect(m.GetAndClearCreatedDerivedSymbols().length).toBe(0);
    const list: string[] = [];
    m.GetSymbolNames(list);
    expect(list).toEqual(['P', 'P_1', 'P_2']);
  });

  it('a derived symbol with its own name, and the immediate form adding a row', () => {
    const p = symbol('P', '1');
    const m = model([p]);
    m.CreateDerivedSymbol(0, 1, 'Q');
    m.ApplyData(() => {});
    expect(m.GetAndClearCreatedDerivedSymbols()[0]![0].GetName()).toBe('Q');

    const m2 = model([symbol('S', '1')]);
    m2.CreateDerivedSymbolImmediate(0, 1, 'T');
    expect(m2.GetNumberRows()).toBe(2);
    expect(names(m2).sort()).toEqual(['S', 'T']);
    expect(m2.GetValue(names(m2).indexOf('T'), 1)).toBe('T');
    expect(m2.IsEdited()).toBe(true);
  });
});

describe('LIB_FIELDS_EDITOR_GRID_DATA_MODEL edges', () => {
  it('a group name list skips an empty name', () => {
    const a = symbol('', '1', { G: 'x' });
    const b = symbol('B', '2', { G: 'x' });
    const m = model([a, b], ['G']);
    m.SetGroupColumn(col(m, 'G'), true);
    m.SetGroupingEnabled(true);
    m.RebuildRows();
    expect(m.GetValue(0, col(m, SYMBOL_NAME))).toBe('B');
  });

  it('a cleared checkbox is not striped', () => {
    const m = model([symbol('R')], ['Power']);
    m.ClearCell(0, col(m, 'Power'));
    expect(m.GetAttr(0, col(m, 'Power'), ANY_KIND)!.GetRendererPtr()).not.toBeInstanceOf(
      STRIPED_STRING_RENDERER,
    );
  });

  it('a cell that stops being striped starts from a fresh attribute, not the column one', () => {
    const m = model([symbol('R', '1', { MPN: 'X' })], ['MPN']);
    const colAttr = new wxGridCellAttr();
    colAttr.SetBackgroundColour('#123456');
    m.SetColAttr(colAttr, col(m, 'MPN'));
    m.ClearCell(0, col(m, 'MPN'));
    expect(m.GetAttr(0, col(m, 'MPN'), ANY_KIND)!.GetRendererPtr()).toBeInstanceOf(
      STRIPED_STRING_RENDERER,
    );
    // Reverted: no longer empty, nothing modified. The first read after the stripes starts from
    // a fresh attribute, without the column's colour; the next is the column's again.
    m.RevertRow(0);
    expect(m.GetAttr(0, col(m, 'MPN'), ANY_KIND)!.GetBackgroundColour()).toBeFalsy();
    expect(m.GetAttr(0, col(m, 'MPN'), ANY_KIND)!.GetBackgroundColour()).toBe('#123456');
  });

  it('a single-symbol row does not expand', () => {
    const m = model([symbol('A'), symbol('B')], [], true);
    m.ExpandRow(0);
    expect(m.GetNumberRows()).toBe(2);
    expect(m.GetGroupType(0)).toBe(GROUP_TYPE.GROUP_SINGLETON);
  });

  it('ApplyData reports just the symbols it changed, and writes no "Symbol Name" field', () => {
    const a = symbol('A', '1');
    const b = symbol('B', '2');
    const m = model([a, b]);
    m.SetValue(names(m).indexOf('A'), col(m, 'Value'), '9');
    const changed: LIB_SYMBOL[] = [];
    m.ApplyData((sym) => changed.push(sym));
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((sym) => sym === a)).toBe(true);
    expect(a.GetField(SYMBOL_NAME)).toBeNull();
    expect(b.GetField(SYMBOL_NAME)).toBeNull();
  });

  it('LocalPower off on its own leaves a global power symbol', () => {
    const r = symbol('P');
    r.SetLocalPower();
    const m = model([r], ['LocalPower']);
    m.SetValue(0, col(m, 'LocalPower'), '0');
    m.ApplyData(() => {});
    expect(r.IsPower()).toBe(true);
    expect(r.IsLocalPower()).toBe(false);
  });
});
