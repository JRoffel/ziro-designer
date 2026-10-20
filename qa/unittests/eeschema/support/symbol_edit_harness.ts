// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * A live SYMBOL_EDIT_FRAME on schToolHarness's canvas, with a library "mine" in an in-memory
 * project table, for the symbol editor's tool tests.
 */
import {
  LIBRARY_TABLE,
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from '@ziroeda/common/libraries/library_table.js';
import { PGM_BASE, Pgm, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { LIB_SYMBOL } from '@ziroeda/eeschema/lib_symbol.js';
import { SymbolLibAdapter } from '@ziroeda/eeschema/project_sch.js';
import type { SCH_EDIT_FRAME } from '@ziroeda/eeschema/sch_edit_frame.js';
import {
  SYMBOL_EDIT_FRAME,
  type SYMBOL_EDIT_FRAME_HOOKS,
} from '@ziroeda/eeschema/symbol_editor/symbol_edit_frame.js';
import { MEMORY_FILESYSTEM, wxMountFileSystem } from '@ziroeda/wx/filefn.js';
import { type SCH_HARNESS, schToolHarness } from './sch_tool_harness.js';

const prop = (aName: string, aValue: string) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))))`;

/** 50 mil, the symbol editor's default grid. */
export const G = 50 * 254;

/**
 * A two-unit symbol "U" on the 50 mil grid: a rectangle in unit 1 and a pin "A" at (10.16, 0) mm
 * in each unit - interchangeable units, so the two pins are synchronized.
 */
export const LIB_TEXT = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "U" (in_bom yes) (on_board yes)
    ${prop('Reference', 'U')} ${prop('Value', 'U')}
    (symbol "U_1_1"
      (rectangle (start -5.08 -5.08) (end 5.08 5.08) (stroke (width 0) (type default)) (fill (type none)))
      (pin input line (at 10.16 0 180) (length 5.08) (name "A" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27))))))
    (symbol "U_2_1"
      (pin input line (at 10.16 0 180) (length 5.08) (name "A" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27))))))))`;

export interface SYMBOL_EDIT_HARNESS {
  frame: SYMBOL_EDIT_FRAME;
  /** The in-memory filesystem mounted at /libs, holding mine.kicad_sym and sym-lib-table. */
  fs: MEMORY_FILESYSTEM;
  harness: SCH_HARNESS;
  /** Open \a aName of "mine" as LoadSymbolFromCurrentLib does: a copy of the buffered one. */
  open(aName?: string): LIB_SYMBOL;
  dispose(): void;
}

/**
 * Make the program, the library and the frame; call dispose() in afterEach. \a aExtraLibs adds
 * more libraries to the table, by nickname: the text of each one's .kicad_sym.
 */
export function symbolEditHarness(
  aLibText = LIB_TEXT,
  aHooks: Partial<SYMBOL_EDIT_FRAME_HOOKS> = {},
  aExtraLibs: Record<string, string> = {},
): SYMBOL_EDIT_HARNESS {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  const fs = new MEMORY_FILESYSTEM();
  const unmount = wxMountFileSystem('/libs', fs);
  fs.Write('mine.kicad_sym', new TextEncoder().encode(aLibText));
  let rows = '(lib (name "mine")(type "KiCad")(uri "/libs/mine.kicad_sym")(options "")(descr ""))';

  for (const [nickname, text] of Object.entries(aExtraLibs)) {
    fs.Write(`${nickname}.kicad_sym`, new TextEncoder().encode(text));
    rows += `(lib (name "${nickname}")(type "KiCad")(uri "/libs/${nickname}.kicad_sym")(options "")(descr ""))`;
  }

  Pgm()
    .GetLibraryManager()
    .SetTable(
      LIBRARY_TABLE_TYPE.SYMBOL,
      LIBRARY_TABLE_SCOPE.PROJECT,
      LIBRARY_TABLE.FromFile(
        '/libs/sym-lib-table',
        `(sym_lib_table (version 7) ${rows})`,
        LIBRARY_TABLE_SCOPE.PROJECT,
        LIBRARY_TABLE_TYPE.SYMBOL,
      ),
    );
  SymbolLibAdapter(null).LoadOne('mine');

  for (const nickname of Object.keys(aExtraLibs)) SymbolLibAdapter(null).LoadOne(nickname);

  const frame = new SYMBOL_EDIT_FRAME({ libEdit: () => {}, ...aHooks });
  const harness = schToolHarness(frame as unknown as SCH_EDIT_FRAME);

  return {
    frame,
    fs,
    harness,
    open(aName = 'U') {
      frame.SetCurLib('mine');
      const symbol = LIB_SYMBOL.copyOf(frame.GetLibManager().GetBufferedSymbol(aName, 'mine')!);
      frame.SetCurSymbol(symbol, true);
      return symbol;
    },
    dispose() {
      unmount();
      SetPgm(null);
    },
  };
}
