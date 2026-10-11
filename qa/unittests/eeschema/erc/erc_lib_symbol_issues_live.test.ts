// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `ERC_TESTER::TestLibSymbolIssues` (erc.cpp) against a project symbol table: a library the
 * table does not list, one it lists whose file is missing, a symbol the library lacks, a cached
 * copy that matches its library symbol (no marker) and one that does not. The oracle cannot judge
 * these portably - kicad-cli resolves libraries through the machine's own global table - so the
 * table here is built for the test.
 */
import { PGM_BASE, Pgm, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import {
  LIBRARY_TABLE,
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from '@ziroeda/common/libraries/library_table.js';
import { PROJECT } from '@ziroeda/common/project.js';
import { PROJECT_FILE } from '@ziroeda/common/project/project_file.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import { LoadSchematic } from '@ziroeda/eeschema/eeschema_helpers.js';
import { ERC_TESTER } from '@ziroeda/eeschema/erc/erc.js';
import { SymbolLibAdapter } from '@ziroeda/eeschema/project_sch.js';
import type { SCH_MARKER } from '@ziroeda/eeschema/sch_marker.js';
import { MEMORY_FILESYSTEM, wxMountFileSystem, wxWriteFileSync } from '@ziroeda/wx/filefn.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const BODY = (
  aName: string,
  aPin: string,
  aRefY = 0,
  aUnit = aName.split(':').pop(),
) => `(symbol "${aName}" (pin_names (offset 0))
      (exclude_from_sim no) (in_bom yes) (on_board yes)
      (property "Reference" "R" (at 0 ${aRefY} 0) (effects (font (size 1.27 1.27))))
      (property "Value" "${aUnit}" (at 0 -2.54 0) (effects (font (size 1.27 1.27))))
      (symbol "${aUnit}_0_1" (rectangle (start -1.016 2.54) (end 1.016 -2.54) (stroke (width 0.254) (type default)) (fill (type none))))
      (symbol "${aUnit}_1_1" (pin passive line (at 0 3.81 270) (length 1.27) (name "~" (effects (font (size 1.27 1.27)))) (number "${aPin}" (effects (font (size 1.27 1.27))))))
    )`;

const LIB = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  ${BODY('R', '1')}
  ${BODY('R2', '1')}
  ${BODY('R3', '1')}
)`;

const placed = (aLibId: string, aRef: string, aX: number) =>
  `(symbol (lib_id "${aLibId}") (at ${aX} 50.8 0) (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "00000000-0000-0000-0000-0000000000${aX}")
    (property "Reference" "${aRef}" (at ${aX} 45 0) (effects (font (size 1.27 1.27))))
    (property "Value" "v" (at ${aX} 55 0) (effects (font (size 1.27 1.27))))
    (instances (project "p" (path "/11111111-2222-3333-4444-555555555555" (reference "${aRef}") (unit 1)))))`;

// Lib:R2's cached copy numbers its pin "2" where the library says "1": a mismatch. Lib:R3's
// copy only moves its Reference field, which ERC's SKIP_TST_POS forgives. Off is disabled.
const SCH = `(kicad_sch (version 20250114) (generator "eeschema") (generator_version "10.0")
  (uuid "11111111-2222-3333-4444-555555555555") (paper "A4")
  (lib_symbols
    ${BODY('Lib:R', '1')}
    ${BODY('Lib:R2', '2')}
    ${BODY('Lib:R3', '1', 1.27)}
    ${BODY('Off:R', '1')}
    ${BODY('Lib:NoSuch', '1')}
    ${BODY('Gone:R', '1')}
    ${BODY('Missing:R', '1')})
  ${placed('Lib:R', 'R1', 10)}
  ${placed('Lib:R2', 'R2', 20)}
  ${placed('Lib:NoSuch', 'R3', 30)}
  ${placed('Gone:R', 'R4', 40)}
  ${placed('Missing:R', 'R5', 50)}
  ${placed('Lib:R3', 'R6', 60)}
  ${placed('Off:R', 'R7', 70)}
  (sheet_instances (path "/" (page "1"))))`;

let unmount: () => void = () => {};

beforeEach(() => {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  const fs = new MEMORY_FILESYSTEM();
  unmount = wxMountFileSystem('/libs', fs);
  wxWriteFileSync('/libs/lib.kicad_sym', new TextEncoder().encode(LIB));
  Pgm()
    .GetLibraryManager()
    .SetTable(
      LIBRARY_TABLE_TYPE.SYMBOL,
      LIBRARY_TABLE_SCOPE.PROJECT,
      LIBRARY_TABLE.FromFile(
        '/libs/sym-lib-table',
        `(sym_lib_table (version 7)
          (lib (name "Lib")(type "KiCad")(uri "/libs/lib.kicad_sym")(options "")(descr ""))
          (lib (name "Gone")(type "KiCad")(uri "/libs/gone.kicad_sym")(options "")(descr ""))
          (lib (name "Off")(type "KiCad")(uri "/libs/lib.kicad_sym")(options "")(descr "")(disabled)))`,
        LIBRARY_TABLE_SCOPE.PROJECT,
        LIBRARY_TABLE_TYPE.SYMBOL,
      ),
    );
  SymbolLibAdapter(null).LoadOne('Lib');
  SymbolLibAdapter(null).LoadOne('Gone');
});
afterEach(() => {
  unmount();
  SetPgm(null);
});

function run(): Map<string, string> {
  const project = new PROJECT();
  project.setProjectFullName('/sch/p.kicad_pro');
  const file = new PROJECT_FILE('/sch/p.kicad_pro');
  project.setProjectFile(file);
  file.LoadFromFile({});
  const schematic = LoadSchematic('/sch/p.kicad_sch', project, (p) =>
    p === '/sch/p.kicad_sch' ? SCH : null,
  )!;
  new ERC_TESTER(schematic).RunTests();
  const out = new Map<string, string>();
  for (const m of schematic.RootScreen()!.Items().OfType(KICAD_T.SCH_MARKER_T)) {
    const item = (m as SCH_MARKER).GetRCItem()!;
    if (item.GetSettingsKey().startsWith('lib_symbol'))
      out.set(item.GetErrorMessage(false), item.GetSettingsKey());
  }
  return out;
}

describe('ERC_TESTER::TestLibSymbolIssues', () => {
  it('reports each library problem once, with upstream messages', () => {
    const got = run();
    expect(got.get("The current configuration does not include the symbol library 'Missing'")).toBe(
      'lib_symbol_issues',
    );
    expect(got.get("The symbol library 'Gone' was not found at '/libs/gone.kicad_sym'")).toBe(
      'lib_symbol_issues',
    );
    expect(got.get("Symbol 'NoSuch' not found in symbol library 'Lib'")).toBe('lib_symbol_issues');
    expect(got.get("Symbol 'R2' doesn't match copy in library 'Lib'")).toBe('lib_symbol_mismatch');
    expect(got.get("The current configuration does not include the symbol library 'Off'")).toBe(
      'lib_symbol_issues',
    );
    // Lib:R matches its library symbol: no marker for it.
    expect([...got.keys()].some((k) => k.includes("'R' doesn't match"))).toBe(false);
    expect([...got.keys()].some((k) => k.includes("'R3'"))).toBe(false);
    expect(got.size).toBe(5);
  });
});
