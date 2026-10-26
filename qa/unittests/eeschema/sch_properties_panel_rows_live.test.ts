// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SCH_PROPERTIES_PANEL's rows for every schematic item kind, on the live model: what each class's
 * PROPERTY_MANAGER registrations put in the grid, in which groups and order, which rows are
 * read-only, and the pane's caption (EDA_ITEM::GetFriendlyName, GetTypeDesc unless overridden).
 *
 * Ordering follows CLASS_DESC::rebuild: properties base-class first, groups derived-class first
 * (property_mgr.cpp collectGroupsRecursive). A mask (`propMgr.Mask`) removes a row; an
 * available func that answers false removes it too; a writeable func greys it.
 *
 * The fixture (qa/data/eeschema/props_panel/every_kind.kicad_sch) holds one of every kind and
 * reads in kicad-cli.
 */
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EDA_ITEM } from '@ziroeda/common/eda_item.js';
import { schIUScale } from '@ziroeda/common/eda_units.js';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { FIELD_T } from '@ziroeda/common/template_fieldnames.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { SCH_JUNCTION } from '@ziroeda/eeschema/sch_junction.js';
import type { SCH_LINE } from '@ziroeda/eeschema/sch_line.js';
import type { SCH_SHEET } from '@ziroeda/eeschema/sch_sheet.js';
import type { SCH_SYMBOL } from '@ziroeda/eeschema/sch_symbol.js';
import type { SCH_TABLE } from '@ziroeda/eeschema/sch_table.js';
import type { SCH_TEXT } from '@ziroeda/eeschema/sch_text.js';
import { SCH_SELECTION_TOOL } from '@ziroeda/eeschema/tools/sch_selection_tool.js';
import { SCH_PROPERTIES_PANEL } from '@ziroeda/eeschema/widgets/sch_properties_panel.js';
import {
  type SCH_HARNESS,
  openProject,
  schFrame,
  schToolHarness,
} from './support/sch_tool_harness.js';

const DIR = resolve(__dirname, '../../data/eeschema/props_panel');

let h: SCH_HARNESS;
let panel: SCH_PROPERTIES_PANEL;

beforeEach(() => {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  h = schToolHarness(schFrame({}));
  openProject(h.frame, DIR, 'every_kind', ['every_kind.kicad_sch', 'sub.kicad_sch']);
  panel = new SCH_PROPERTIES_PANEL(h.frame);
});

afterEach(() => SetPgm(null));

const items = (): EDA_ITEM[] => [...h.frame.GetScreen()!.Items()];
const ofType = <T extends EDA_ITEM>(aType: KICAD_T): T[] =>
  items().filter((i) => i.Type() === aType) as T[];
const line = (aLayerName: 'Wire' | 'Bus' | 'Graphic Line'): SCH_LINE =>
  ofType<SCH_LINE>(KICAD_T.SCH_LINE_T).find((l) => l.GetFriendlyName() === aLayerName)!;
const symbol = () => ofType<SCH_SYMBOL>(KICAD_T.SCH_SYMBOL_T)[0]!;
const sheet = () => ofType<SCH_SHEET>(KICAD_T.SCH_SHEET_T)[0]!;
const table = () => ofType<SCH_TABLE>(KICAD_T.SCH_TABLE_T)[0]!;

/** Select \a aItem alone and rebuild the grid. */
function select(aItem: EDA_ITEM): void {
  const sel = h.frame.GetToolManager()!.GetTool(SCH_SELECTION_TOOL)!;
  sel.ClearSelection(true);
  sel.AddItemToSel(aItem, true);
  panel.UpdateData();
}

/** The grid as group -> row names, in display order. */
const groups = (): [string, string[]][] =>
  panel.m_groups.map((g) => [g.name, g.cells.map((c) => c.property.Name())]);
const names = (): string[] => panel.m_groups.flatMap((g) => g.cells.map((c) => c.property.Name()));
const readOnly = (): string[] =>
  panel.m_groups.flatMap((g) => g.cells.filter((c) => !c.writeable).map((c) => c.property.Name()));
/** The painted cell, as the grid shows it. */
const shown = (aName: string) =>
  panel.GridRows({ units: 'mm', iuScale: schIUScale } as never).find((r) => r.name === aName)!;

const TEXT_PROPS = [
  'Text',
  'Font',
  'Auto Thickness',
  'Italic',
  'Bold',
  'Horizontal Justification',
  'Vertical Justification',
  'Color',
];

describe('a placed pin (sch_pin.cpp): read-only outside the symbol editor', () => {
  it('lists the library pin rows, every one greyed, the geometry ones unavailable', () => {
    select(symbol().GetPins(h.frame.GetCurrentSheet())[0]!);

    expect(panel.m_caption).toBe('Pin');
    expect(groups()).toEqual([
      ['', ['Pin Name', 'Pin Number', 'Electrical Type', 'Graphic Style', 'Orientation', 'Length']],
    ]);
    expect(readOnly()).toEqual(names());
    expect([shown('Pin Number').value, shown('Electrical Type').value]).toEqual(['1', 'Passive']);
    expect(shown('Graphic Style').value).toBe('Line');
  });
});

describe('a symbol (sch_symbol.cpp SCH_SYMBOL_DESC, lib_symbol.cpp LIB_SYMBOL_DESC)', () => {
  it('groups its own three first, then the inherited Pin Display', () => {
    select(symbol());

    expect(panel.m_caption).toBe('Symbol');
    expect(groups()).toEqual([
      // The SYMBOL base's two pin flags come first: properties are base-first. "Unit" is
      // absent: R is single-unit, `.SetAvailableFunc( multiUnit )`.
      [
        '',
        [
          'Pin numbers',
          'Pin names',
          'Position X',
          'Position Y',
          'Orientation',
          'Mirror X',
          'Mirror Y',
        ],
      ],
      [
        'Fields',
        [
          'Reference',
          'Value',
          'Library Link',
          'Library Description',
          'Keywords',
          // SCH_SYMBOL_FIELD_PROPERTY rows, from a std::set: alphabetical, not file order.
          'Datasheet',
          'Description',
          'Footprint',
        ],
      ],
      [
        'Attributes',
        [
          'Exclude From Simulation',
          'Exclude From Bill of Materials',
          'Exclude From Board',
          'Exclude From Position Files',
          'Do not Populate',
        ],
      ],
      ['Pin Display', ['Show Pin Number', 'Show Pin Name', 'Pin Name Position Offset']],
    ]);
  });

  it('greys exactly the three NO_SETTER rows, and has no Locked row (#ifdef NOTYET)', () => {
    select(symbol());

    expect(readOnly()).toEqual(['Library Link', 'Library Description', 'Keywords']);
    expect(names()).not.toContain('Locked');
  });

  it('reads the pin flags off the library symbol, both rows of each agreeing', () => {
    select(symbol());

    // Device:R in the fixture: (pin_numbers (hide yes)), pin names shown.
    expect([shown('Pin numbers').value, shown('Show Pin Number').value]).toEqual([false, false]);
    expect([shown('Pin names').value, shown('Show Pin Name').value]).toEqual([true, true]);
    expect(shown('Library Description').value).toBe('Resistor');
  });
});

describe('a field (sch_field.cpp SCH_FIELD_DESC)', () => {
  it('lists two ungrouped rows and the masked EDA_TEXT set under Text Properties', () => {
    select(symbol().GetField(FIELD_T.REFERENCE)!);

    expect(panel.m_caption).toBe('Field');
    expect(groups()).toEqual([
      ['', ['Show Field Name', 'Allow Autoplacement']],
      [
        'Text Properties',
        [
          'Text',
          'Font',
          'Auto Thickness',
          'Italic',
          'Bold',
          'Visible',
          'Color',
          'Horizontal Justification',
          'Vertical Justification',
          'Text Size',
        ],
      ],
    ]);
    for (const masked of ['Orientation', 'Hyperlink', 'Thickness', 'Mirrored', 'Width', 'Height'])
      expect(names()).not.toContain(masked);
  });
});

describe('text and labels (sch_text.cpp, sch_label.cpp)', () => {
  const text = () => ofType<SCH_TEXT>(KICAD_T.SCH_TEXT_T)[0]!;

  it('a Text has ten rows, all in Text Properties, one Text Size', () => {
    select(text());

    expect(panel.m_caption).toBe('Text');
    expect(groups()).toEqual([['Text Properties', [...TEXT_PROPS, 'Hyperlink', 'Text Size']]]);
  });

  it('Text Size writes both axes', async () => {
    select(text());
    const undo = h.frame.GetUndoCommandCount();

    await panel.valueChanged('Text Size', 25400);

    expect([text().GetTextWidth(), text().GetTextHeight()]).toEqual([25400, 25400]);
    expect(h.frame.GetUndoCommandCount()).toBe(undo + 1);
  });

  it('a label has no Shape; global and hierarchical labels put Shape first, ungrouped', () => {
    select(ofType(KICAD_T.SCH_LABEL_T)[0]!);
    expect(panel.m_caption).toBe('Label');
    expect(groups()).toEqual([['Text Properties', [...TEXT_PROPS, 'Text Size']]]);

    for (const [type, caption] of [
      [KICAD_T.SCH_GLOBAL_LABEL_T, 'Global Label'],
      [KICAD_T.SCH_HIER_LABEL_T, 'Hierarchical Label'],
    ] as const) {
      select(ofType(type)[0]!);
      expect(panel.m_caption).toBe(caption);
      expect(groups()).toEqual([
        ['', ['Shape']],
        ['Text Properties', [...TEXT_PROPS, 'Text Size']],
      ]);
    }
  });

  it('every label masks Hyperlink: the mask is on SCH_LABEL_BASE (sch_label.cpp:2467)', () => {
    for (const type of [
      KICAD_T.SCH_LABEL_T,
      KICAD_T.SCH_GLOBAL_LABEL_T,
      KICAD_T.SCH_HIER_LABEL_T,
    ]) {
      select(ofType(type)[0]!);
      expect(names()).not.toContain('Hyperlink');
    }
  });

  it('a sheet pin has a hierarchical label’s set, with no position', () => {
    select(sheet().GetPins()[0]!);

    expect(panel.m_caption).toBe('Sheet Pin');
    expect(groups()).toEqual([
      ['', ['Shape']],
      ['Text Properties', [...TEXT_PROPS, 'Text Size']],
    ]);
  });
});

describe('a text box (sch_textbox.cpp): its own groups before the inherited shape group', () => {
  it('lists Margins, Text Properties, then Shape Properties', () => {
    select(ofType(KICAD_T.SCH_TEXTBOX_T)[0]!);

    expect(panel.m_caption).toBe('Text Box');
    expect(groups()).toEqual([
      ['Margins', ['Margin Left', 'Margin Top', 'Margin Right', 'Margin Bottom']],
      [
        'Text Properties',
        [
          'Text',
          'Font',
          'Auto Thickness',
          'Italic',
          'Bold',
          'Mirrored',
          'Horizontal Justification',
          'Vertical Justification',
          'Color',
          'Hyperlink',
          'Text Size',
        ],
      ],
      [
        'Shape Properties',
        [
          'Start X',
          'Start Y',
          'End X',
          'End Y',
          'Width',
          'Height',
          'Line Width',
          'Line Style',
          'Line Color',
          'Fill',
          'Fill Color',
        ],
      ],
    ]);
    for (const masked of ['Shape', 'Corner Radius', 'Thickness', 'Orientation', 'Visible'])
      expect(names()).not.toContain(masked);
  });
});

describe('a table and its cells (sch_table.cpp, sch_tablecell.cpp)', () => {
  it('a table lists its position and the border and separator rows', () => {
    select(table());

    expect(panel.m_caption).toBe('Table');
    expect(groups()).toEqual([
      ['', ['Start X', 'Start Y']],
      [
        'Table Properties',
        [
          'External Border',
          'Header Border',
          'Border Width',
          'Border Style',
          'Border Color',
          'Row Separators',
          'Cell Separators',
          'Separators Width',
          'Separators Style',
          'Separators Color',
        ],
      ],
    ]);
  });

  it('Row Separators writes the table, as one undo step', async () => {
    select(table());
    const undo = h.frame.GetUndoCommandCount();

    await panel.valueChanged('Row Separators', false);

    expect(table().StrokeRows()).toBe(false);
    expect(table().StrokeExternal()).toBe(true);
    expect(h.frame.GetUndoCommandCount()).toBe(undo + 1);
  });

  it('a cell shows what survives SCH_TABLECELL’s masks, in its four groups', () => {
    select(table().GetCell(1, 1)!);

    expect(panel.m_caption).toBe('Table Cell');
    expect(groups()).toEqual([
      ['Table', ['Column Width', 'Row Height']],
      ['Cell Properties', ['Background Fill', 'Background Fill Color']],
      ['Margins', ['Margin Left', 'Margin Top', 'Margin Right', 'Margin Bottom']],
      ['Text Properties', [...TEXT_PROPS, 'Text Size']],
    ]);
    // Its own column and row: cell (1, 1) is column 1 (50.8 mm), row 1 (25.4 mm).
    expect([shown('Column Width').value, shown('Row Height').value]).toEqual([508000, 254000]);
  });
});

describe('lines, junctions and bus entries (sch_line.cpp, sch_junction.cpp, sch_bus_entry.cpp)', () => {
  const LINE = ['Start X', 'Start Y', 'End X', 'End Y', 'Length'];

  it('a wire and a bus keep the Default style; a graphic line names it Line Style, without Default', () => {
    for (const kind of ['Wire', 'Bus'] as const) {
      select(line(kind));
      expect(panel.m_caption).toBe(kind);
      expect(groups()).toEqual([['', [...LINE, 'Wire Style', 'Line Width', 'Color']]]);
      expect(shown('Wire Style').choices?.[0]).toBe('Default');
    }

    select(line('Graphic Line'));
    expect(groups()).toEqual([['', [...LINE, 'Line Style', 'Line Width', 'Color']]]);
    expect(shown('Line Style').choices).toEqual([
      'Solid',
      'Dashed',
      'Dotted',
      'Dash-Dot',
      'Dash-Dot-Dot',
    ]);
  });

  it('a junction offers Diameter and Color, and a colour edit is one undo step', async () => {
    const junction = ofType<SCH_JUNCTION>(KICAD_T.SCH_JUNCTION_T)[0]!;
    select(junction);
    expect(panel.m_caption).toBe('Junction');
    expect(groups()).toEqual([['', ['Diameter', 'Color']]]);

    const undo = h.frame.GetUndoCommandCount();
    await panel.valueChanged('Color', { r: 1, g: 0, b: 0, a: 1 });

    expect(junction.GetColor()).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(h.frame.GetUndoCommandCount()).toBe(undo + 1);
  });

  it('a wire entry offers its stroke rows, with no position', () => {
    select(ofType(KICAD_T.SCH_BUS_WIRE_ENTRY_T)[0]!);

    expect(panel.m_caption).toBe('Wire Entry');
    expect(groups()).toEqual([['', ['Wire Style', 'Line Width', 'Color']]]);
  });

  it('a no-connect flag registers nothing', () => {
    select(ofType(KICAD_T.SCH_NO_CONNECT_T)[0]!);

    expect(panel.m_caption).toBe('No-Connect Flag');
    expect(groups()).toEqual([]);
  });
});

describe('graphics and images (eda_shape.cpp, sch_bitmap.cpp)', () => {
  const shapes = () => ofType(KICAD_T.SCH_SHAPE_T);

  it('a rectangle lists every EDA_SHAPE row it has, its Shape greyed, under Shape Properties', () => {
    select(shapes()[0]!);

    // SCH_SHAPE has no GetFriendlyName override (PCB_SHAPE does): GetTypeDesc's "Graphic".
    expect(panel.m_caption).toBe('Graphic');
    expect(groups()).toEqual([
      [
        'Shape Properties',
        [
          'Shape',
          'Start X',
          'Start Y',
          'End X',
          'End Y',
          'Width',
          'Height',
          'Corner Radius',
          'Line Width',
          'Line Style',
          'Line Color',
          'Fill',
          'Fill Color',
        ],
      ],
    ]);
    expect(readOnly()).toContain('Shape');
    expect(shown('Fill').choices).toEqual([
      'None',
      'Solid',
      'Hatch',
      'Reverse Hatch',
      'Cross-hatch',
    ]);
  });

  it('a circle has Center X, Center Y and Radius instead of the corners', () => {
    select(shapes()[1]!);

    expect(groups()[0]![1].slice(0, 4)).toEqual(['Shape', 'Center X', 'Center Y', 'Radius']);
    expect(names()).not.toContain('Start X');
    expect(names()).not.toContain('Width');
  });

  it('an image lists its position and every Image Properties row', () => {
    select(ofType(KICAD_T.SCH_BITMAP_T)[0]!);

    expect(panel.m_caption).toBe('Bitmap');
    expect(groups()).toEqual([
      ['', ['Position X', 'Position Y']],
      [
        'Image Properties',
        ['Scale', 'Transform Offset X', 'Transform Offset Y', 'Width', 'Height'],
      ],
    ]);
  });
});

describe('a sheet (sch_sheet.cpp, sch_properties_panel.cpp)', () => {
  it('lists its rows, and a Fields row per field name, alphabetically', () => {
    select(sheet());

    expect(panel.m_caption).toBe('Sheet');
    // The parser marks only a USER field private, and a sheet's own are SHEET_USER
    // (sch_io_kicad_sexpr_parser.cpp:2380), so "Secret" is listed as KiCad lists it.
    expect(groups()).toEqual([
      ['', ['Sheet Name', 'Border Width', 'Border Color', 'Background Color']],
      [
        'Attributes',
        [
          'Exclude From Board',
          'Exclude From Simulation',
          'Exclude From Bill of Materials',
          'Do not Populate',
        ],
      ],
      ['Fields', ['Assembly', 'Secret', 'Sheetfile', 'Sheetname']],
    ]);
  });

  it('a field row writes the sheet’s field, as one undo step', async () => {
    select(sheet());
    const undo = h.frame.GetUndoCommandCount();

    await panel.valueChanged('Assembly', 'A2');

    expect(sheet().GetField('Assembly')!.GetText()).toBe('A2');
    expect(h.frame.GetUndoCommandCount()).toBe(undo + 1);
  });
});
