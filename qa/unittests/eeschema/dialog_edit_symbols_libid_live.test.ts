// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_EDIT_SYMBOLS_LIBID (dialog_edit_symbols_libid.cpp) on the live schematic: initDlg's
 * grid (one row per library id, sorted by LIB_ID, a reference listed once however many units
 * carry it, orphans marked), Map Orphans (first match taken, a choice asked when a name is in
 * two libraries, the summary message), the browse on a double click, validateLibIds, and
 * TransferDataFromWindow's one commit - the value updated only when it was the item name, and
 * the fields reset from the new library when the box is ticked.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SetErrorPresenter, SetInfoPresenter } from '@ziroeda/common/confirm.js';
import {
  LIBRARY_TABLE,
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from '@ziroeda/common/libraries/library_table.js';
import { PGM_BASE, Pgm, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { FIELD_T } from '@ziroeda/common/template_fieldnames.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import {
  COL_CURR_LIBID,
  COL_NEW_LIBID,
  COL_REFS,
  DIALOG_EDIT_SYMBOLS_LIBID,
  getLibIdValue,
} from '@ziroeda/eeschema/dialogs/dialog_edit_symbols_libid.js';
import { SymbolLibAdapter } from '@ziroeda/eeschema/project_sch.js';
import type { SCH_SYMBOL } from '@ziroeda/eeschema/sch_symbol.js';
import { MEMORY_FILESYSTEM, wxMountFileSystem } from '@ziroeda/wx/filefn.js';
import { wxEVT_GRID_CELL_LEFT_DCLICK } from '@ziroeda/wx/grid.js';
import { type SCH_HARNESS, schFrame, schToolHarness } from './support/sch_tool_harness.js';

const ROOT = '10000000-0000-0000-0000-000000000001';
const prop = (aName: string, aValue: string) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))))`;
const pin = (aNum: string) =>
  `(pin passive line (at 0 0 0) (length 2.54) (name "~" (effects (font (size 1.27 1.27)))) (number "${aNum}" (effects (font (size 1.27 1.27)))))`;
const libSym = (aName: string, aRef: string, aUnits = 1, aExtra = '') => {
  const leaf = aName.slice(aName.indexOf(':') + 1);
  let units = '';
  for (let u = 1; u <= aUnits; u++) units += `(symbol "${leaf}_${u}_1" ${pin(String(u))})`;
  return `(symbol "${aName}" (in_bom yes) (on_board yes) ${prop('Reference', aRef)} ${prop('Value', leaf)} ${aExtra} ${units})`;
};
const placed = (aLibId: string, aRef: string, aValue: string, aUuid: string, aUnit = 1) =>
  `(symbol (lib_id "${aLibId}") (at 10 10 0) (unit ${aUnit}) (in_bom yes) (on_board yes) (uuid "${aUuid}")
    ${prop('Reference', aRef)} ${prop('Value', aValue)} ${prop('Footprint', 'FP:Old')}
    (instances (project "t" (path "/${ROOT}" (reference "${aRef}") (unit ${aUnit})))))`;

/** R2 and R1 on Device:R (R1's value is the item name), C1, a two-unit U1, an orphan X1. */
const SHEET = `(kicad_sch (version 20250114) (generator "eeschema") (uuid "${ROOT}") (paper "A4")
  (lib_symbols
    ${libSym('Device:R', 'R')}
    ${libSym('Device:C', 'C')}
    ${libSym('Amp:Dual', 'U', 2)})
  ${placed('Device:R', 'R2', '10k', '20000000-0000-0000-0000-000000000001')}
  ${placed('Device:C', 'C1', '100n', '20000000-0000-0000-0000-000000000002')}
  ${placed('Amp:Dual', 'U1', 'Dual', '20000000-0000-0000-0000-000000000003', 1)}
  ${placed('Device:R', 'R1', 'R', '20000000-0000-0000-0000-000000000004')}
  ${placed('Old:Missing', 'X1', 'Missing', '20000000-0000-0000-0000-000000000005')}
  ${placed('Amp:Dual', 'U1', 'Dual', '20000000-0000-0000-0000-000000000006', 2)}
  (sheet_instances (path "/" (page "1"))))`;

const LIB2 = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  ${libSym('R2', 'R', 1, prop('Footprint', 'FP:New'))}
  ${libSym('Missing', 'X')})`;
const LIB3 = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  ${libSym('Missing', 'X')})`;

let h: SCH_HARNESS;
let unmount: () => void;
let infos: string[];
let errors: string[];
let picks: string[];
let pickAnswer: string | null;
let choices: { message: string; caption: string; choices: readonly string[] }[];
let choiceAnswer: string | null;

beforeEach(() => {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  infos = [];
  errors = [];
  picks = [];
  pickAnswer = null;
  choices = [];
  choiceAnswer = null;
  SetInfoPresenter((aMessage) => {
    infos.push(aMessage);
    return Promise.resolve();
  });
  SetErrorPresenter((aText) => errors.push(aText));

  h = schToolHarness(schFrame({}));
  h.frame.OpenProjectFiles([`/t/t.kicad_sch`], 0, (p) => (p === '/t/t.kicad_sch' ? SHEET : null));

  // The project's symbol table, installed after the project load (its ProjectChanged reloads
  // the tables from the project folder).
  const fs = new MEMORY_FILESYSTEM();
  unmount = wxMountFileSystem('/libs', fs);
  fs.Write('Lib2.kicad_sym', new TextEncoder().encode(LIB2));
  fs.Write('Lib3.kicad_sym', new TextEncoder().encode(LIB3));
  Pgm()
    .GetLibraryManager()
    .SetTable(
      LIBRARY_TABLE_TYPE.SYMBOL,
      LIBRARY_TABLE_SCOPE.PROJECT,
      LIBRARY_TABLE.FromFile(
        '/libs/sym-lib-table',
        `(sym_lib_table (version 7)
          (lib (name "Lib2")(type "KiCad")(uri "/libs/Lib2.kicad_sym")(options "")(descr ""))
          (lib (name "Lib3")(type "KiCad")(uri "/libs/Lib3.kicad_sym")(options "")(descr "")))`,
        LIBRARY_TABLE_SCOPE.PROJECT,
        LIBRARY_TABLE_TYPE.SYMBOL,
      ),
    );
  SymbolLibAdapter(null).LoadOne('Lib2');
  SymbolLibAdapter(null).LoadOne('Lib3');
});

afterEach(() => {
  unmount();
  SetInfoPresenter(() => Promise.resolve());
  SetErrorPresenter(() => {});
  SetPgm(null);
});

const dialog = () =>
  new DIALOG_EDIT_SYMBOLS_LIBID(h.frame, {
    pickSymbolFromLibrary: (aPreselected) => {
      picks.push(aPreselected);
      return Promise.resolve(pickAnswer);
    },
    singleChoice: (aMessage, aCaption, aChoices) => {
      choices.push({ message: aMessage, caption: aCaption, choices: [...aChoices] });
      return Promise.resolve(choiceAnswer);
    },
  });

const grid = (d: DIALOG_EDIT_SYMBOLS_LIBID): string[][] => {
  const out: string[][] = [];
  for (let r = 0; r < d.m_grid.GetNumberRows(); r++)
    out.push([COL_REFS, COL_CURR_LIBID, COL_NEW_LIBID].map((c) => d.m_grid.GetCellValue(r, c)));
  return out;
};

/** By uuid: UpdateFields( nullptr, … ) resets the Reference field's text (upstream too). */
const UUID: Record<string, string> = {
  R2: '20000000-0000-0000-0000-000000000001',
  C1: '20000000-0000-0000-0000-000000000002',
  R1: '20000000-0000-0000-0000-000000000004',
  X1: '20000000-0000-0000-0000-000000000005',
};
const symbol = (aRef: string): SCH_SYMBOL =>
  ([...h.frame.GetScreen()!.Items().OfType(KICAD_T.SCH_SYMBOL_T)] as SCH_SYMBOL[]).find(
    (s) => s.m_Uuid === UUID[aRef],
  )!;

describe('initDlg', () => {
  it('lists one row per library id, sorted by LIB_ID, each reference once, orphans marked', () => {
    const d = dialog();

    expect(grid(d)).toEqual([
      ['U1', 'Amp:Dual', ''],
      ['C1', 'Device:C', ''],
      ['R1, R2', 'Device:R', ''],
      ['X1', 'Old:Missing', ''],
    ]);
    expect(d.m_OrphansRowIndexes).toEqual([3]);
    expect([0, 1, 2, 3].map((r) => d.IsMarkedRow(r))).toEqual([false, false, false, true]);
    expect(d.m_buttonOrphanItemsEnabled).toBe(true);
    expect([d.m_grid.IsReadOnly(0, COL_REFS), d.m_grid.IsReadOnly(0, COL_CURR_LIBID)]).toEqual([
      true,
      true,
    ]);
    expect(d.m_grid.IsReadOnly(0, COL_NEW_LIBID)).toBe(false);
  });
});

describe('getLibIdValue', () => {
  it('escapes each half for a LIB_ID, with no part missing its colon', () => {
    const d = dialog();
    d.m_grid.SetCellValue(0, COL_NEW_LIBID, 'My<Lib:R\\1');
    d.m_grid.SetCellValue(1, COL_NEW_LIBID, 'NoColon');

    expect(getLibIdValue(d.m_grid, 0, COL_NEW_LIBID)).toBe('My{lt}Lib:R{backslash}1');
    expect(getLibIdValue(d.m_grid, 1, COL_NEW_LIBID)).toBe('NoColon:');
    expect(getLibIdValue(d.m_grid, 2, COL_NEW_LIBID)).toBe('');
  });
});

describe('Map Orphans', () => {
  it('is disabled with no orphan', () => {
    for (const s of [...h.frame.GetScreen()!.Items().OfType(KICAD_T.SCH_SYMBOL_T)] as SCH_SYMBOL[])
      if (s.GetLibId().GetLibNickname() === 'Old') h.frame.GetScreen()!.Remove(s);

    const d = dialog();

    expect([d.m_OrphansRowIndexes, d.m_buttonOrphanItemsEnabled]).toEqual([[], false]);
  });

  it('takes the first library with the name, asks between two, and reports the count', async () => {
    choiceAnswer = 'Lib3:Missing';
    const d = dialog();

    await d.onClickOrphansButton();

    expect(choices).toEqual([
      {
        message: 'Available Candidates for Old:Missing ',
        caption: 'Candidates count 2 ',
        choices: ['Lib2:Missing', 'Lib3:Missing'],
      },
    ]);
    expect(d.m_grid.GetCellValue(3, COL_NEW_LIBID)).toBe('Lib3:Missing');
    expect(infos).toEqual(['All 1 link(s) resolved']);
  });

  it('keeps the first match when the choice is cancelled', async () => {
    const d = dialog();

    await d.onClickOrphansButton();

    expect(d.m_grid.GetCellValue(3, COL_NEW_LIBID)).toBe('Lib2:Missing');
    expect(infos).toEqual(['All 1 link(s) resolved']);
  });

  it('counts the orphans no library has a name for', async () => {
    Pgm()
      .GetLibraryManager()
      .SetTable(
        LIBRARY_TABLE_TYPE.SYMBOL,
        LIBRARY_TABLE_SCOPE.PROJECT,
        LIBRARY_TABLE.Empty(LIBRARY_TABLE_SCOPE.PROJECT, LIBRARY_TABLE_TYPE.SYMBOL),
      );
    const d = dialog();

    await d.onClickOrphansButton();

    expect(choices).toEqual([]);
    expect(d.m_grid.GetCellValue(3, COL_NEW_LIBID)).toBe('');
    expect(infos).toEqual(['0 link(s) mapped, 1 not found']);
  });
});

describe('the browse (onCellBrowseLib)', () => {
  /**
   * `m_grid->Connect( wxEVT_GRID_CELL_LEFT_DCLICK, onCellBrowseLib )`, behind GRID_TRICKS: its
   * double click opens the editor of an editable cell and stops there, so only the two read-only
   * columns reach the browse (grid_tricks.cpp:218-263).
   */
  const dclick = async (d: DIALOG_EDIT_SYMBOLS_LIBID, aRow: number, aCol: number) => {
    d.m_grid.SendEvent(wxEVT_GRID_CELL_LEFT_DCLICK, aRow, aCol);
    await new Promise((r) => setTimeout(r, 0));
  };

  it("preselects the row's new id, else its current one, and writes the pick", async () => {
    const d = dialog();
    pickAnswer = 'Lib2:R2';

    await dclick(d, 2, COL_CURR_LIBID);
    expect(d.m_grid.GetCellValue(2, COL_NEW_LIBID)).toBe('Lib2:R2');

    pickAnswer = null;
    await dclick(d, 2, COL_REFS);
    await dclick(d, 1, COL_CURR_LIBID);

    expect(picks).toEqual(['Device:R', 'Lib2:R2', 'Device:C']);
    // A cancelled browse leaves the cell alone, and says nothing.
    expect(d.m_grid.GetCellValue(2, COL_NEW_LIBID)).toBe('Lib2:R2');
    expect(infos).toEqual([]);
    expect(d.m_grid.GetCellValue(1, COL_NEW_LIBID)).toBe('');
  });

  it('a double click on the editable column edits it instead', async () => {
    const d = dialog();

    await dclick(d, 2, COL_NEW_LIBID);

    expect(picks).toEqual([]);
  });
});

describe('TransferDataFromWindow', () => {
  it('refuses an invalid id with its message and changes nothing', async () => {
    const d = dialog();
    d.m_grid.SetCellValue(2, COL_NEW_LIBID, 'R2');

    expect(await d.TransferDataFromWindow()).toBe(false);
    expect(infos).toEqual(['Symbol library identifier R2: is not valid.']);
    expect(symbol('R1').GetLibId().Format()).toBe('Device:R');
    expect(d.IsSchematicModified()).toBe(false);
  });

  it('relinks every symbol of the row in one commit; the value follows only when it was the name', async () => {
    const d = dialog();
    d.m_grid.SetCellValue(2, COL_NEW_LIBID, 'Lib2:R2');
    const undos = h.frame.GetUndoCommandCount();

    expect(await d.TransferDataFromWindow()).toBe(true);

    expect(d.IsSchematicModified()).toBe(true);
    expect([symbol('R1').GetLibId().Format(), symbol('R2').GetLibId().Format()]).toEqual([
      'Lib2:R2',
      'Lib2:R2',
    ]);
    // R1's value was "R", the old item name: it becomes the new one. R2's "10k" stays.
    expect(symbol('R1').GetField(FIELD_T.VALUE)!.GetText()).toBe('R2');
    expect(symbol('R2').GetField(FIELD_T.VALUE)!.GetText()).toBe('10k');
    expect(symbol('R1').GetLibSymbolRef()!.GetName()).toBe('R2');
    // Box unticked: the placed footprint is kept.
    expect(symbol('R1').GetField(FIELD_T.FOOTPRINT)!.GetText()).toBe('FP:Old');
    expect(symbol('C1').GetLibId().Format()).toBe('Device:C');
    expect(h.frame.GetUndoCommandCount()).toBe(undos + 1);
  });

  it('with the box ticked, resets the other fields from the new library', async () => {
    const d = dialog();
    d.m_checkBoxUpdateFields = true;
    d.m_grid.SetCellValue(2, COL_NEW_LIBID, 'Lib2:R2');

    await d.TransferDataFromWindow();

    expect(symbol('R2').GetField(FIELD_T.FOOTPRINT)!.GetText()).toBe('FP:New');
    // The value is SetValueFieldText( the library's ), whatever it was.
    expect(symbol('R2').GetField(FIELD_T.VALUE)!.GetText()).toBe('R2');
    // aPath is nullptr, so the Reference field takes the last branch: its text is reset too,
    // while the instance keeps its reference.
    const path = h.frame.GetCurrentSheet();
    expect([
      symbol('R2').GetField(FIELD_T.REFERENCE)!.GetText(),
      symbol('R2').GetRef(path),
    ]).toEqual(['R', 'R2']);
  });

  it('a row left empty or naming its own id is no edit', async () => {
    const first = dialog();
    first.m_grid.SetCellValue(2, COL_NEW_LIBID, 'Lib2:R2');
    await first.TransferDataFromWindow();

    // Now on Lib2:R2, which the table loads: naming it again would reload it if not skipped.
    const d = dialog();
    const row = [...Array(d.m_grid.GetNumberRows()).keys()].find(
      (r) => d.m_grid.GetCellValue(r, COL_CURR_LIBID) === 'Lib2:R2',
    )!;
    d.m_grid.SetCellValue(row, COL_NEW_LIBID, 'Lib2:R2');
    const undos = h.frame.GetUndoCommandCount();

    expect(await d.TransferDataFromWindow()).toBe(true);
    expect(d.IsSchematicModified()).toBe(false);
    expect(h.frame.GetUndoCommandCount()).toBe(undos);
  });
});
