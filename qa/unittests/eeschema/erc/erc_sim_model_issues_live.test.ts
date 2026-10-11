// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `ERC_TESTER::TestSimModelIssues` (erc.cpp:2054) against kicad-cli 10.0.6's own report for
 * erc_cases/sim_models: a plain RLC part, a type no device provides, a missing library, a
 * library with no Sim.Name, an unknown and a matching base model, a library model whose
 * Sim.Type no device provides (the library branch never reads it), a '#' reference, a symbol
 * excluded from simulation, and a bad symbol on a sheet excluded from simulation. The oracle test cannot compare these - their messages carry the
 * absolute path kicad-cli resolved the library at - so the project is mounted at /sim_models
 * and the report's directory is mapped onto it.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { PROJECT } from '@ziroeda/common/project.js';
import { PROJECT_FILE } from '@ziroeda/common/project/project_file.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import { LoadSchematic } from '@ziroeda/eeschema/eeschema_helpers.js';
import { ERC_TESTER } from '@ziroeda/eeschema/erc/erc.js';
import type { SCH_MARKER } from '@ziroeda/eeschema/sch_marker.js';
import { SCH_SCREENS } from '@ziroeda/eeschema/sch_screen.js';
import { MEMORY_FILESYSTEM, wxMountFileSystem } from '@ziroeda/wx/filefn.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const DIR = resolve(__dirname, '../../../data/eeschema/erc_cases/sim_models');
const ORACLE = resolve(__dirname, '../../../data/eeschema/erc_oracle/erc_cases_sim_models.json');

let unmount: () => void = () => {};

beforeEach(() => {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  const fs = new MEMORY_FILESYSTEM();
  for (const f of readdirSync(DIR)) fs.Write(f, readFileSync(join(DIR, f)));
  unmount = wxMountFileSystem('/sim_models', fs);
});
afterEach(() => {
  unmount();
  SetPgm(null);
});

interface Violation {
  type: string;
  description: string;
  items: { uuid: string }[];
}

/** kicad-cli's simulation markers, its directory mapped onto the mount. */
function expected(): [string, string][] {
  const report = JSON.parse(readFileSync(ORACLE, 'utf8')) as {
    sheets: { violations: Violation[] }[];
  };
  return report.sheets
    .flatMap((s) => s.violations)
    .filter((v) => v.type === 'simulation_model_issue')
    .map(
      (v) =>
        [
          v.description.replace(/\/[^']*\/erc_cases\/sim_models\//g, '/sim_models/'),
          v.items[0]!.uuid,
        ] as [string, string],
    )
    .sort();
}

function run(aDefaults = false): [string, string][] {
  const pro = '/sim_models/sim_models.kicad_pro';
  const project = new PROJECT();
  project.setProjectFullName(pro);
  const file = new PROJECT_FILE(pro);
  project.setProjectFile(file);
  file.LoadFromFile(
    aDefaults ? {} : JSON.parse(readFileSync(join(DIR, 'sim_models.kicad_pro'), 'utf8')),
  );
  const schematic = LoadSchematic('/sim_models/sim_models.kicad_sch', project, (p) =>
    p.startsWith('/sim_models/') && existsSync(join(DIR, p.slice('/sim_models/'.length)))
      ? readFileSync(join(DIR, p.slice('/sim_models/'.length)), 'utf8')
      : null,
  )!;
  new ERC_TESTER(schematic).RunTests();

  const out: [string, string][] = [];
  // Every sheet's screen: a marker lands on the screen of the sheet its symbol is on.
  const screens = new SCH_SCREENS(schematic.Root());
  const markers = [];
  for (let screen = screens.GetFirst(); screen; screen = screens.GetNext())
    markers.push(...screen.Items().OfType(KICAD_T.SCH_MARKER_T));
  for (const m of markers) {
    const item = (m as SCH_MARKER).GetRCItem()!;
    if (item.GetSettingsKey() === 'simulation_model_issue')
      out.push([item.GetErrorMessage(false), item.GetMainItemID()]);
  }
  return out.sort();
}

describe('ERC_TESTER::TestSimModelIssues', () => {
  it('reports what kicad-cli reports, on the same symbols', () => {
    const want = expected();
    // The report has the four problems; the other six symbols raise nothing.
    expect(want.length).toBe(4);
    expect(run()).toEqual(want);
  });

  it('runs nothing at the default severities, where KiCad ignores the check', () => {
    expect(run(true)).toEqual([]);
  });
});
