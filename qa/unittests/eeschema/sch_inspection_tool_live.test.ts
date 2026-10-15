// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SCH_INSPECTION_TOOL (tools/sch_inspection_tool.cpp) on the TOOL_MANAGER: the ERC dialog and its
 * marker navigation, the symbol-vs-library diff (with LIB_SYMBOL::Compare's report) and datasheets.
 */
import { resolve } from 'node:path';
import {
  LIBRARY_TABLE,
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from '@ziroeda/common/libraries/library_table.js';
import { PGM_BASE, Pgm, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { FIELD_T } from '@ziroeda/common/template_fieldnames.js';
import { ACTIONS } from '@ziroeda/common/tool/actions.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import { ERC_ITEM } from '@ziroeda/eeschema/erc/erc_item.js';
import { ERCE_T } from '@ziroeda/eeschema/erc/erc_settings.js';
import { SymbolLibAdapter } from '@ziroeda/eeschema/project_sch.js';
import type { DIALOG_ERC, SCH_EDIT_FRAME_HOOKS } from '@ziroeda/eeschema/sch_edit_frame.js';
import type { SCH_SYMBOL } from '@ziroeda/eeschema/sch_symbol.js';
import { SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import { SCH_INSPECTION_TOOL } from '@ziroeda/eeschema/tools/sch_inspection_tool.js';
import { SCH_SELECTION_TOOL } from '@ziroeda/eeschema/tools/sch_selection_tool.js';
import type { SYMBOL_DIFF_WIDGET } from '@ziroeda/eeschema/widgets/symbol_diff_widget.js';
import { MEMORY_FILESYSTEM, wxMountFileSystem, wxWriteFileSync } from '@ziroeda/wx/filefn.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openProject, schFrame, schToolHarness } from './support/sch_tool_harness.js';

const DATA = resolve(__dirname, '../../data');
const ORACLE = resolve(DATA, 'eeschema/netlist_oracle/complex_hierarchy');
const SHEETS = ['complex_hierarchy.kicad_sch', 'ampli_ht.kicad_sch', 'complex_hierarchy.kicad_pro'];

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => SetPgm(null));

function ercDialog() {
  const calls: string[] = [];
  const dlg: DIALOG_ERC = {
    Show: (s) => calls.push(`Show(${s})`),
    Raise: () => calls.push('Raise'),
    FocusOkButton: () => calls.push('FocusOk'),
    IsShownOnScreen: () => true,
    PrevMarker: () => calls.push('Prev'),
    NextMarker: () => calls.push('Next'),
    SelectMarker: () => calls.push('Select'),
    ExcludeMarker: (m) => calls.push(`Exclude(${m ? 'marker' : 'null'})`),
    Destroy: () => calls.push('Destroy'),
  };
  return { dlg, calls };
}

function setUp(aHooks: Partial<SCH_EDIT_FRAME_HOOKS> = {}) {
  const h = schToolHarness(schFrame(aHooks));
  openProject(h.frame, ORACLE, 'complex_hierarchy', SHEETS);
  h.frame.SetCurrentSheet(
    h.frame
      .Schematic()
      .Hierarchy()
      .find((p) => p.size() === 2)!,
  );
  const mgr = h.frame.GetToolManager()!;
  const sel = mgr.GetTool(SCH_SELECTION_TOOL)!;
  const sym = ([...h.frame.GetScreen()!.Items().OfType(KICAD_T.SCH_SYMBOL_T)] as SCH_SYMBOL[]).find(
    (s) => !s.GetLibSymbolRef()?.IsPower(),
  )!;
  return { ...h, mgr, sel, sym };
}

describe('SCH_INSPECTION_TOOL', () => {
  it('runERC shows and raises the ERC dialog; next / previous step its markers', () => {
    const { dlg, calls } = ercDialog();
    const h = setUp({ ercDialog: () => dlg });
    h.mgr.RunAction(SCH_ACTIONS.runERC);
    h.mgr.RunAction(SCH_ACTIONS.nextMarker);
    h.mgr.RunAction(SCH_ACTIONS.prevMarker);
    expect(calls).toEqual([
      'Show(true)',
      'Raise',
      'FocusOk',
      'Show(true)',
      'Raise',
      'Next',
      'Show(true)',
      'Raise',
      'Prev',
    ]);
  });

  it('excludeMarker hands the dialog the selected marker, or none', () => {
    const { dlg, calls } = ercDialog();
    const h = setUp({ ercDialog: () => dlg });
    h.mgr.RunAction(SCH_ACTIONS.excludeMarker);
    expect(calls).toEqual(['Exclude(null)']);
  });

  it('showDatasheet without one says so in the info bar', () => {
    const h = setUp();
    const errors: string[] = [];
    h.frame.ShowInfoBarError = (m: string) => {
      errors.push(m);
    };
    h.sym.GetField(FIELD_T.DATASHEET)!.SetText('~');
    h.sel.ClearSelection(true);
    h.sel.AddItemToSel(h.sym, true);
    h.mgr.RunAction(ACTIONS.showDatasheet);
    expect(errors).toEqual(['No datasheet defined.']);
  });

  it('diffSymbol reports a library it cannot find, and a difference with the library copy', async () => {
    let hasLib = false;
    const h = setUp({
      symbolLibHasLibrary: () => hasLib,
    });
    // the library copy: the schematic's own with its keywords changed, so Compare reports them
    h.frame.GetLibSymbol = async () => {
      const lib = h.sym.GetLibSymbolRef()!.Flatten();
      lib.SetKeyWords(`${lib.GetKeyWords()} changed`);
      return lib;
    };
    h.sel.ClearSelection(true);
    h.sel.AddItemToSel(h.sym, true);
    h.mgr.RunAction(SCH_ACTIONS.diffSymbol);
    await flush();
    const dialog = h.frame.GetSymbolDiffDialog();
    const summary = () => dialog.GetPages()[0]!.messages;
    expect(summary().some((m) => m.startsWith('The library is not included'))).toBe(true);

    hasLib = true;
    h.sel.ClearSelection(true);
    h.sel.AddItemToSel(h.sym, true);
    h.mgr.RunAction(SCH_ACTIONS.diffSymbol);
    await flush();
    expect(summary()).toContain('Symbol keywords differ.');
    expect(summary()).not.toContain('No relevant differences detected.');
    const visual = dialog.GetPages()[1]!;
    expect(visual.title).toBe('Visual');
    const widget = visual.panel!.find((i) => i.kind === 'widget');
    expect((widget as { widget: SYMBOL_DIFF_WIDGET }).widget.GetUnit()).toBe(h.sym.GetUnit());
    expect(dialog.GetUserItemID()).toBe(h.sym.m_Uuid);
    expect(dialog.IsShown()).toBe(true);
  });

  /**
   * InspectERCError on ERCE_LIB_SYMBOL_MISMATCH runs DiffSymbol( symbol ), which reads the library
   * copy with `libs->LoadSymbol( libName, symbolName )` - synchronously, from the libraries an ERC
   * run has already loaded. No coroutine, so the ERC dialog's row menu can call it directly.
   */
  it('InspectERCError diffs a mismatched symbol against the loaded library, synchronously', () => {
    const h = setUp({ symbolLibHasLibrary: () => true });
    const libId = h.sym.GetLibId();
    const item = libId.GetLibItemName();
    // The library's copy: one rectangle and no pins, so Compare finds differences.
    const lib = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
      (symbol "${item}" (in_bom yes) (on_board yes)
        (property "Reference" "U" (at 0 0 0) (effects (font (size 1.27 1.27))))
        (property "Value" "${item}" (at 0 -2.54 0) (effects (font (size 1.27 1.27))))
        (symbol "${item}_0_1" (rectangle (start -1 1) (end 1 -1) (stroke (width 0.254) (type default)) (fill (type none))))))`;
    const unmount = wxMountFileSystem('/libs', new MEMORY_FILESYSTEM());
    try {
      wxWriteFileSync('/libs/lib.kicad_sym', new TextEncoder().encode(lib));
      Pgm()
        .GetLibraryManager()
        .SetTable(
          LIBRARY_TABLE_TYPE.SYMBOL,
          LIBRARY_TABLE_SCOPE.PROJECT,
          LIBRARY_TABLE.FromFile(
            '/libs/sym-lib-table',
            `(sym_lib_table (version 7)
              (lib (name "${libId.GetLibNickname()}")(type "KiCad")(uri "/libs/lib.kicad_sym")(options "")(descr "")))`,
            LIBRARY_TABLE_SCOPE.PROJECT,
            LIBRARY_TABLE_TYPE.SYMBOL,
          ),
        );
      SymbolLibAdapter(null).LoadOne(libId.GetLibNickname());
      // Nothing may be fetched: the diff must come from the loaded library.
      h.frame.GetLibSymbol = async () => {
        throw new Error('fetched');
      };

      const erc = ERC_ITEM.Create(ERCE_T.ERCE_LIB_SYMBOL_MISMATCH)!;
      erc.SetItems(h.sym);
      const tool = h.mgr.GetTool(SCH_INSPECTION_TOOL)!;
      expect(tool.InspectERCErrorMenuText(erc)).not.toBe('');
      tool.InspectERCError(erc);

      const dialog = h.frame.GetSymbolDiffDialog();
      const summary = dialog.GetPages()[0]!.messages;
      expect(summary.some((m) => m.startsWith('The library no longer contains'))).toBe(false);
      expect(summary).not.toContain('No relevant differences detected.');
      expect(dialog.GetPages()[1]!.title).toBe('Visual');
      expect(dialog.GetUserItemID()).toBe(h.sym.m_Uuid);
      expect(dialog.IsShown()).toBe(true);
    } finally {
      unmount();
    }
  });
});
