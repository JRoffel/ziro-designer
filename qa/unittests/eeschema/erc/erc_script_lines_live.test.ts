// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * `schErcLines`, the script API's ERC: ERC_TESTER on a schematic loaded on its own, its errors
 * and warnings read back with the items named the way the AI bridge reads them - a pin as
 * REF.NAME when its name is a plain word unique on the symbol, else REF.NUMBER.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { PROJECT } from '@ziroeda/common/project.js';
import { PROJECT_FILE } from '@ziroeda/common/project/project_file.js';
import { LoadSchematic } from '@ziroeda/eeschema/eeschema_helpers.js';
import { schErcLines } from '@ziroeda/eeschema/sch_script_api.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => SetPgm(null));

function load(aPro: string, aSch: string, aRead: (p: string) => string | null) {
  const project = new PROJECT();
  project.setProjectFullName(aPro);
  const file = new PROJECT_FILE(aPro);
  project.setProjectFile(file);
  const pro = aRead(aPro);
  file.LoadFromFile(pro ? JSON.parse(pro) : {});
  return LoadSchematic(aSch, project, aRead)!;
}

describe('schErcLines', () => {
  it('reads back warnings as well as errors', () => {
    const dir = resolve(__dirname, '../../../data/eeschema/erc_cases/quirks');
    const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
    const lines = schErcLines(
      load(join(dir, 'quirks.kicad_pro'), join(dir, 'quirks.kicad_sch'), read),
    );
    expect(lines.some((l) => l.severity === 'error' && l.code === 'label_dangling')).toBe(true);
    expect(lines.find((l) => l.code === 'same_local_global_label')).toEqual({
      severity: 'warning',
      code: 'same_local_global_label',
      message: expect.any(String),
      items: ['label SIG @101.6,152.4', 'label SIG @55.88,152.4'],
    });
  });

  it('names a pin by its name when that is a plain word unique on the symbol', () => {
    const pin = (aName: string, aNumber: string, aY: number) =>
      `(pin passive line (at 0 ${aY} 0) (length 2.54) (name "${aName}" (effects (font (size 1.27 1.27)))) (number "${aNumber}" (effects (font (size 1.27 1.27)))))`;
    const sch = `(kicad_sch (version 20250114) (generator "eeschema") (generator_version "10.0")
      (uuid "a1111111-2222-3333-4444-555555555555") (paper "A4")
      (lib_symbols (symbol "T:P" (exclude_from_sim no) (in_bom yes) (on_board yes)
        (property "Reference" "U" (at 0 0 0) (effects (font (size 1.27 1.27))))
        (property "Value" "P" (at 0 0 0) (effects (font (size 1.27 1.27))))
        (symbol "P_1_1" ${pin('IN', '1', 0)} ${pin('~', '2', 2.54)} ${pin('A', '3', 5.08)} ${pin('A', '4', 7.62)})))
      (symbol (lib_id "T:P") (at 50.8 50.8 0) (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
        (uuid "b1111111-2222-3333-4444-555555555555")
        (property "Reference" "U1" (at 50.8 45 0) (effects (font (size 1.27 1.27))))
        (property "Value" "P" (at 50.8 55 0) (effects (font (size 1.27 1.27))))
        (instances (project "t" (path "/a1111111-2222-3333-4444-555555555555" (reference "U1") (unit 1)))))
      (sheet_instances (path "/" (page "1"))))`;
    const lines = schErcLines(
      load('/t/t.kicad_pro', '/t/t.kicad_sch', (p) => (p === '/t/t.kicad_sch' ? sch : null)),
    );
    const pins = lines.filter((l) => l.code === 'pin_not_connected').flatMap((l) => l.items);
    // "IN" is named; "~" is no name, and "A" is on two pins, so those read by number.
    expect(pins.sort()).toEqual(['U1.2', 'U1.3', 'U1.4', 'U1.IN']);
  });
});
