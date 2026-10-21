// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * The half of dialog_lib_edit_pin_table.cpp above the dialog: the column labels,
 * PIN_INFO_FORMATTER, PIN_TABLE_DATA_MODEL (rows, groups, filters, renumbering, sorting) and the
 * CSV export / import, on a live symbol editor symbol.
 */
import { GetClipboardUTF8, SaveClipboard } from '@ziroeda/common/clipboard.js';
import { CANDIDATE } from '@ziroeda/common/eda_item_flags.js';
import { schIUScale } from '@ziroeda/common/eda_units.js';
import { ELECTRICAL_PINTYPE, GRAPHIC_PINSHAPE, PIN_ORIENTATION } from '@ziroeda/common/pin_type.js';
import { WX_STRING_REPORTER } from '@ziroeda/common/reporter.js';
import { INDETERMINATE_STATE } from '@ziroeda/common/widgets/ui_common.js';
import { WX_GRID } from '@ziroeda/common/widgets/wx_grid.js';
import {
  BOOL_FORMAT,
  COL_ORDER,
  GetColTypeForString,
  GetPinTableColLabel,
  PIN_INFO_FORMATTER,
  PIN_TABLE_DATA_MODEL,
  PIN_TABLE_EXPORT,
  PIN_TABLE_IMPORT,
  type PIN_TABLE_OWNER,
} from '@ziroeda/eeschema/dialogs/dialog_lib_edit_pin_table.js';
import type { LIB_SYMBOL } from '@ziroeda/eeschema/lib_symbol.js';
import type { SCH_PIN } from '@ziroeda/eeschema/sch_pin.js';
import { wxReadFileSync, wxWriteFileSync } from '@ziroeda/wx/filefn.js';
import { wxGridSelectionModes } from '@ziroeda/wx/grid.js';
import { afterEach, describe, expect, it } from 'vitest';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from '../support/symbol_edit_harness.js';

const prop = (aName: string, aValue: string) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))))`;
const pin = (aType: string, aX: number, aY: number, aRot: number, aName: string, aNumber: string) =>
  `(pin ${aType} line (at ${aX} ${aY} ${aRot}) (length 2.54) (name "${aName}" (effects (font (size 1.27 1.27)))) (number "${aNumber}" (effects (font (size 1.27 1.27)))))`;

/**
 * Q: two units ("Alpha", and B by letter). Unit 1: GND (2), GND (10), D0 (1). Unit 2: D1 (3).
 * S: one unit, one pin.
 */
const LIB = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "Q" ${prop('Reference', 'U')} ${prop('Value', 'Q')}
    (symbol "Q_1_1" (unit_name "Alpha")
      ${pin('power_in', -5.08, 2.54, 0, 'GND', '2')}
      ${pin('power_in', -5.08, 0, 0, 'GND', '10')}
      ${pin('input', -5.08, -2.54, 0, 'D0', '1')})
    (symbol "Q_2_1" ${pin('output', 5.08, 0, 180, 'D1', '3')}))
  (symbol "S" ${prop('Reference', 'U')} ${prop('Value', 'S')}
    (symbol "S_1_1" ${pin('input', 0, 0, 0, 'X', '1')})))`;

let t: SYMBOL_EDIT_HARNESS;

afterEach(() => t?.dispose());

function setUp(aName = 'Q'): { symbol: LIB_SYMBOL; pins: SCH_PIN[] } {
  t = symbolEditHarness(LIB);
  t.frame.SetUserUnits('mils');
  const symbol = t.open(aName);
  return { symbol, pins: symbol.GetGraphicalPins(0, 0) };
}

const byNumber = (aPins: SCH_PIN[], aNumber: string) =>
  aPins.find((p) => p.GetNumber() === aNumber)!;

/** A model on a grid, as the dialog makes it, over copies of the symbol's pins. */
function model(
  aSymbol: LIB_SYMBOL,
  aPins: SCH_PIN[],
  aSelected: SCH_PIN[] = [],
  aGrouped = false,
): { m: PIN_TABLE_DATA_MODEL; grid: WX_GRID; added: SCH_PIN[]; removed: SCH_PIN[] } {
  const added: SCH_PIN[] = [];
  const removed: SCH_PIN[] = [];
  const owner: PIN_TABLE_OWNER = {
    IsDisplayGrouped: () => aGrouped,
    AddPin: (p) => added.push(p),
    RemovePin: (p) => removed.push(p),
  };
  const m = new PIN_TABLE_DATA_MODEL(t.frame, owner, aSymbol, aSelected);
  const grid = new WX_GRID();
  // The dialog's m_grid->SetSelectionMode( wxGrid::wxGridSelectCells ).
  grid.SetTable(m, false, wxGridSelectionModes.wxGridSelectCells);
  return { m, grid, added, removed };
}

const rowText = (aModel: PIN_TABLE_DATA_MODEL, aCol: number): string[] =>
  Array.from({ length: aModel.GetNumberRows() }, (_, r) => aModel.GetValue(r, aCol));

describe('pin table columns', () => {
  it('labels each column and maps a header back, case ignored', () => {
    expect(GetPinTableColLabel(COL_ORDER.COL_TYPE)).toBe('Electrical Type');
    expect(GetPinTableColLabel(COL_ORDER.COL_BODY_STYLE)).toBe('Body Style');
    expect(GetColTypeForString('x position')).toBe(COL_ORDER.COL_POSX);
    expect(GetColTypeForString('Count')).toBe(COL_ORDER.COL_PIN_COUNT);
    expect(GetColTypeForString('Colour')).toBe(COL_ORDER.COL_COUNT);
  });
});

describe('PIN_INFO_FORMATTER', () => {
  it('formats each field, sizes with or without units', () => {
    const { pins } = setUp();
    const d1 = byNumber(pins, '3');
    const r = new WX_STRING_REPORTER();
    const f = new PIN_INFO_FORMATTER(t.frame.GetUnitsProvider(), true, BOOL_FORMAT.ZERO_ONE, r);

    expect(f.Format(d1, COL_ORDER.COL_NAME)).toBe('D1');
    expect(f.Format(d1, COL_ORDER.COL_TYPE)).toBe('Output');
    expect(f.Format(d1, COL_ORDER.COL_SHAPE)).toBe('Line');
    expect(f.Format(d1, COL_ORDER.COL_ORIENTATION)).toBe('Left');
    expect(f.Format(d1, COL_ORDER.COL_LENGTH)).toBe('100 mils');
    expect(f.Format(d1, COL_ORDER.COL_POSX)).toBe('200 mils');
    expect(f.Format(d1, COL_ORDER.COL_VISIBLE)).toBe('1');
    // The label form: GetUnitDisplayName( unit, true ).
    expect(f.Format(d1, COL_ORDER.COL_UNIT)).toBe('Unit B');
    expect(f.Format(byNumber(pins, '1'), COL_ORDER.COL_UNIT)).toBe('Alpha');
    // One body style: ALL.
    expect(f.Format(d1, COL_ORDER.COL_BODY_STYLE)).toBe('ALL');

    const bare = new PIN_INFO_FORMATTER(
      t.frame.GetUnitsProvider(),
      false,
      BOOL_FORMAT.TRUE_FALSE,
      r,
    );
    expect(bare.Format(d1, COL_ORDER.COL_LENGTH)).toBe('100');
    expect(bare.Format(d1, COL_ORDER.COL_VISIBLE)).toBe('True');
    d1.SetVisible(false);
    expect(bare.Format(d1, COL_ORDER.COL_VISIBLE)).toBe('False');
  });

  it('a single-unit symbol shows ALL for unit and body style', () => {
    const { pins } = setUp('S');
    const f = new PIN_INFO_FORMATTER(
      t.frame.GetUnitsProvider(),
      true,
      BOOL_FORMAT.ZERO_ONE,
      new WX_STRING_REPORTER(),
    );
    expect(f.Format(pins[0]!, COL_ORDER.COL_UNIT)).toBe('ALL');
    expect(f.Format(pins[0]!, COL_ORDER.COL_BODY_STYLE)).toBe('ALL');
  });

  it('updates a pin from text: names, sizes, positions, units, booleans', () => {
    const { symbol, pins } = setUp();
    const d0 = byNumber(pins, '1');
    const r = new WX_STRING_REPORTER();
    const f = new PIN_INFO_FORMATTER(t.frame.GetUnitsProvider(), false, BOOL_FORMAT.TRUE_FALSE, r);

    f.UpdatePin(d0, 'Bidirectional', COL_ORDER.COL_TYPE, symbol);
    expect(d0.GetType()).toBe(ELECTRICAL_PINTYPE.PT_BIDI);
    f.UpdatePin(d0, 'Inverted', COL_ORDER.COL_SHAPE, symbol);
    expect(d0.GetShape()).toBe(GRAPHIC_PINSHAPE.INVERTED);
    f.UpdatePin(d0, 'Up', COL_ORDER.COL_ORIENTATION, symbol);
    expect(d0.GetOrientation()).toBe(PIN_ORIENTATION.PIN_UP);
    // An unknown name changes nothing.
    f.UpdatePin(d0, 'Sideways', COL_ORDER.COL_ORIENTATION, symbol);
    expect(d0.GetOrientation()).toBe(PIN_ORIENTATION.PIN_UP);
    // Found ignoring case, indexed with it: upstream sets wxNOT_FOUND (-1).
    f.UpdatePin(d0, 'output', COL_ORDER.COL_TYPE, symbol);
    expect(d0.GetType() as number).toBe(-1);

    // ChangeLength keeps the pin's tip: a pin pointing up grows from the far end, so its
    // position moves down by the length added (100 -> 150 mils).
    const before = { ...d0.GetPosition() };
    f.UpdatePin(d0, '150', COL_ORDER.COL_LENGTH, symbol);
    expect(d0.GetLength()).toBe(schIUScale.milsToIU(150));
    expect(d0.GetPosition()).toEqual({ x: before.x, y: before.y + schIUScale.milsToIU(50) });
    f.UpdatePin(d0, '60', COL_ORDER.COL_NUMBER_SIZE, symbol);
    expect(d0.GetNumberTextSize()).toBe(schIUScale.milsToIU(60));
    f.UpdatePin(d0, '40', COL_ORDER.COL_NAME_SIZE, symbol);
    expect(d0.GetNameTextSize()).toBe(schIUScale.milsToIU(40));
    const y = d0.GetPosition().y;
    f.UpdatePin(d0, '300', COL_ORDER.COL_POSX, symbol);
    expect(d0.GetPosition()).toEqual({ x: schIUScale.milsToIU(300), y });
    f.UpdatePin(d0, '-50', COL_ORDER.COL_POSY, symbol);
    expect(d0.GetPosition()).toEqual({ x: schIUScale.milsToIU(300), y: schIUScale.milsToIU(-50) });

    f.UpdatePin(d0, 'B', COL_ORDER.COL_UNIT, symbol);
    expect(d0.GetUnit()).toBe(2);
    f.UpdatePin(d0, 'Alpha', COL_ORDER.COL_UNIT, symbol);
    expect(d0.GetUnit()).toBe(1);
    f.UpdatePin(d0, 'all', COL_ORDER.COL_UNIT, symbol);
    expect(d0.GetUnit()).toBe(0);

    f.UpdatePin(d0, '0', COL_ORDER.COL_VISIBLE, symbol);
    expect(d0.IsVisible()).toBe(false);
    f.UpdatePin(d0, 'TRUE', COL_ORDER.COL_VISIBLE, symbol);
    expect(d0.IsVisible()).toBe(true);
    f.UpdatePin(d0, 'false', COL_ORDER.COL_VISIBLE, symbol);
    expect(d0.IsVisible()).toBe(false);
    f.UpdatePin(d0, '1', COL_ORDER.COL_VISIBLE, symbol);
    expect(d0.IsVisible()).toBe(true);
    expect(r.GetMessages()).toBe('');
    f.UpdatePin(d0, 'maybe', COL_ORDER.COL_VISIBLE, symbol);
    expect(d0.IsVisible()).toBe(false);
    expect(r.GetMessages()).toContain(
      "The value 'maybe' can't be converted to boolean correctly, it has been interpreted as 'False'",
    );
  });

  it('a single-unit or single-style symbol ignores unit and body style', () => {
    const { symbol, pins } = setUp('S');
    const f = new PIN_INFO_FORMATTER(
      t.frame.GetUnitsProvider(),
      false,
      BOOL_FORMAT.TRUE_FALSE,
      new WX_STRING_REPORTER(),
    );
    pins[0]!.SetUnit(1);
    f.UpdatePin(pins[0]!, 'ALL', COL_ORDER.COL_UNIT, symbol);
    expect(pins[0]!.GetUnit()).toBe(1);
    pins[0]!.SetBodyStyle(1);
    f.UpdatePin(pins[0]!, 'ALL', COL_ORDER.COL_BODY_STYLE, symbol);
    expect(pins[0]!.GetBodyStyle()).toBe(1);
  });
});

describe('PIN_TABLE_DATA_MODEL', () => {
  it('one row per pin, sorted by number; grouped by name the GND pins share a row', () => {
    const { symbol, pins } = setUp();
    const { m } = model(symbol, pins);
    m.RebuildRows(pins, false, false);
    expect(rowText(m, COL_ORDER.COL_NUMBER)).toEqual(['1', '2', '3', '10']);

    // A group's pins in number order, whatever order they arrive in.
    m.RebuildRows([...pins].reverse(), true, false);
    // Sorted by the first column, Count: the single pins (1) before the pair (2), then by number.
    expect(rowText(m, COL_ORDER.COL_NUMBER)).toEqual(['1', '3', '2, 10']);
    expect(rowText(m, COL_ORDER.COL_PIN_COUNT)).toEqual(['1', '1', '2']);
    expect(rowText(m, COL_ORDER.COL_NAME)).toEqual(['D0', 'D1', 'GND']);
    // A group whose pins differ shows the indeterminate state.
    const gnd = m.GetRowPins(2);
    gnd[1]!.SetLength(schIUScale.milsToIU(150));
    expect(m.GetValue(2, COL_ORDER.COL_LENGTH)).toBe(INDETERMINATE_STATE);
  });

  it('filters by unit (unit 0 pins always shown), by body style, and by the editor selection', () => {
    const { symbol, pins } = setUp();
    const { m } = model(symbol, pins, [byNumber(pins, '3')]);
    m.SetUnitFilter(2);
    m.RebuildRows(pins, false, false);
    expect(rowText(m, COL_ORDER.COL_NUMBER)).toEqual(['3']);

    byNumber(pins, '1').SetUnit(0);
    m.RebuildRows(pins, false, false);
    expect(rowText(m, COL_ORDER.COL_NUMBER)).toEqual(['1', '3']);

    m.SetUnitFilter(-1);
    m.SetBodyStyleFilter(2);
    m.RebuildRows(pins, false, false);
    expect(m.GetNumberRows()).toBe(0);

    m.SetBodyStyleFilter(-1);
    m.SetFilterBySelection(true);
    m.RebuildRows(pins, false, false);
    expect(rowText(m, COL_ORDER.COL_NUMBER)).toEqual(['3']);

    // The selection matches copies on number, name, unit and body style.
    const other = setUp();
    const copy = byNumber(other.pins, '3');
    copy.SetName('D9');
    const { m: m2 } = model(symbol, pins, [copy]);
    m2.SetFilterBySelection(true);
    m2.RebuildRows(pins, false, false);
    expect(m2.GetNumberRows()).toBe(0);
  });

  it('grouped by selection: the first selected block becomes row 0, selected', () => {
    const { symbol, pins } = setUp();
    const { m, grid } = model(symbol, pins);
    m.RebuildRows(pins, false, false);
    grid.SelectRow(1);
    grid.SelectRow(3, true);
    m.RebuildRows(pins, false, true);
    // wx 3.2 keeps a selection as blocks, and getSelectedArea reads the first: rows 1 and 3 are
    // two blocks, so row 0 is the first block's pin alone.
    expect(m.GetValue(0, COL_ORDER.COL_NUMBER)).toBe('2');
    expect(m.GetNumberRows()).toBe(4);
    expect(grid.GetSelectedRows()).toEqual([0]);
    // The CANDIDATE marks are cleared again.
    for (const p of pins) expect(p.GetFlags() & CANDIDATE).toBe(0);
  });

  it('editing a grouped number renumbers, adds pins a pin_step away, and removes the rest', () => {
    const { symbol, pins } = setUp();
    const { m, added, removed } = model(symbol, pins, [], true);
    m.RebuildRows(pins, true, false);
    const gnd = 2;

    m.SetValue(gnd, COL_ORDER.COL_NUMBER, '4, 5 ,6');
    expect(m.GetValue(gnd, COL_ORDER.COL_NUMBER)).toBe('4, 5, 6');
    expect(added.length).toBe(1);
    const last = m.GetRowPins(gnd)[1]!;
    // The last pin points right: the new one is pin_step (100 mils) below it.
    expect(added[0]!.GetPosition()).toEqual({
      x: last.GetPosition().x,
      y: last.GetPosition().y - schIUScale.milsToIU(100),
    });
    expect(added[0]!.GetName()).toBe('GND');
    expect(added[0]!.GetType()).toBe(ELECTRICAL_PINTYPE.PT_POWER_IN);
    expect(m.IsEdited()).toBe(true);

    m.SetValue(gnd, COL_ORDER.COL_NUMBER, '7');
    expect(m.GetValue(gnd, COL_ORDER.COL_NUMBER)).toBe('7');
    expect(removed.length).toBe(2);
  });

  it('a vertical pin repeats a pin_step to the right', () => {
    const { symbol, pins } = setUp();
    byNumber(pins, '1').SetOrientation(PIN_ORIENTATION.PIN_UP);
    const { m, added } = model(symbol, pins, [], true);
    m.RebuildRows(pins, true, false);
    m.SetValue(0, COL_ORDER.COL_NUMBER, '1,11');
    const d0 = byNumber(pins, '1');
    expect(added[0]!.GetPosition()).toEqual({
      x: d0.GetPosition().x + schIUScale.milsToIU(100),
      y: d0.GetPosition().y,
    });
  });

  it('other columns set every pin in the row; sizes evaluate; the indeterminate text is ignored', () => {
    const { symbol, pins } = setUp();
    const { m } = model(symbol, pins, [], true);
    m.RebuildRows(pins, true, false);
    m.SetValue(2, COL_ORDER.COL_LENGTH, '100+50');
    for (const p of m.GetRowPins(2)) expect(p.GetLength()).toBe(schIUScale.milsToIU(150));

    m.SetValue(2, COL_ORDER.COL_NAME, INDETERMINATE_STATE);
    expect(m.GetValue(2, COL_ORDER.COL_NAME)).toBe('GND');

    // Ungrouped, a number edit renumbers just that pin.
    const plain = model(symbol, pins, [], false);
    plain.m.RebuildRows(pins, false, false);
    plain.m.SetValue(0, COL_ORDER.COL_NUMBER, '9,8');
    expect(plain.m.GetValue(0, COL_ORDER.COL_NUMBER)).toBe('9,8');
    expect(plain.added.length).toBe(0);
  });

  it('sorts by any column, descending too, ties broken by number', () => {
    const { symbol, pins } = setUp();
    const { m } = model(symbol, pins);
    m.RebuildRows(pins, false, false);
    m.SortRows(COL_ORDER.COL_NAME, true);
    expect(rowText(m, COL_ORDER.COL_NUMBER)).toEqual(['1', '3', '2', '10']);
    m.SortRows(COL_ORDER.COL_NAME, false);
    expect(rowText(m, COL_ORDER.COL_NUMBER)).toEqual(['10', '2', '3', '1']);
    m.SortRows(COL_ORDER.COL_POSX, true);
    expect(rowText(m, COL_ORDER.COL_NUMBER)).toEqual(['1', '2', '10', '3']);
    m.SortRows(COL_ORDER.COL_TYPE, true);
    expect(rowText(m, COL_ORDER.COL_TYPE)).toEqual([
      'Input',
      'Output',
      'Power input',
      'Power input',
    ]);
  });

  it('appends and removes rows', () => {
    const { symbol, pins } = setUp();
    const { m } = model(symbol, pins);
    m.RebuildRows(pins, false, false);
    const extra = pins[0]!;
    m.AppendRow(extra);
    expect(m.GetNumberRows()).toBe(5);
    expect(m.RemoveRow(4)).toEqual([extra]);
    expect(m.GetNumberRows()).toBe(4);
  });
});

describe('PIN_TABLE_EXPORT / PIN_TABLE_IMPORT', () => {
  it('exports a header and a row per pin, to a CSV file or to the clipboard', () => {
    const { pins } = setUp();
    const d1 = byNumber(pins, '3');
    new PIN_TABLE_EXPORT(t.frame.GetUnitsProvider()).ExportData([d1], '/libs/pins.csv');
    const text = new TextDecoder().decode(wxReadFileSync('/libs/pins.csv')!);
    // CSV_WRITER always quotes (csv.cpp:50).
    const q = (aCells: string[]) => aCells.map((c) => `"${c}"`).join(',');
    expect(text.split('\n')[0]).toBe(
      q([
        'Number',
        'Name',
        'Electrical Type',
        'Graphic Style',
        'Orientation',
        'Number Text Size',
        'Name Text Size',
        'Length',
        'X Position',
        'Y Position',
        'Visible',
        'Unit',
        'Body Style',
      ]),
    );
    expect(text.split('\n')[1]).toBe(
      q([
        '3',
        'D1',
        'Output',
        'Line',
        'Left',
        '50',
        '50',
        '100',
        '200',
        '0',
        'True',
        'Unit B',
        'ALL',
      ]),
    );

    // The clipboard takes the same CSV text (clipboard.cpp:234, "plain text CSV").
    new PIN_TABLE_EXPORT(t.frame.GetUnitsProvider()).ExportData([d1], '');
    expect(GetClipboardUTF8()).toBe(text);
  });

  it('imports by header, reorders and unknown columns reported, short rows tolerated', async () => {
    const { symbol } = setUp();
    wxWriteFileSync(
      '/libs/in.csv',
      new TextEncoder().encode('Name,Colour,Number,Length\nA0,red,7,150\nA1\n'),
    );
    const r = new WX_STRING_REPORTER();
    const imp = new PIN_TABLE_IMPORT(t.frame.GetUnitsProvider(), r, async () => '/libs/in.csv');
    const got = await imp.ImportData(true, symbol);

    expect(got.map((p) => [p.GetName(), p.GetNumber()])).toEqual([
      ['A0', '7'],
      ['A1', ''],
    ]);
    expect(got[0]!.GetLength()).toBe(schIUScale.milsToIU(150));
    expect(got[0]!.GetParentSymbol()).toBe(symbol);
    expect(r.GetMessages()).toContain(
      'Unknown columns in data: Colour. These columns will be ignored.',
    );

    // Cancelling the file prompt imports nothing, even with pin data on the clipboard.
    SaveClipboard('Number\tName\n5\tCLK\n');
    const none = new PIN_TABLE_IMPORT(t.frame.GetUnitsProvider(), r, async () => '');
    // A length, not toEqual([]): diffing a live SCH_PIN against [] runs vitest out of memory.
    expect((await none.ImportData(true, symbol)).length).toBe(0);

    // From the clipboard, tab separated.
    SaveClipboard('Number\tName\n5\tCLK\n');
    const clip = await new PIN_TABLE_IMPORT(t.frame.GetUnitsProvider(), r).ImportData(
      false,
      symbol,
    );
    expect(clip.map((p) => p.GetName())).toEqual(['CLK']);
  });
});
