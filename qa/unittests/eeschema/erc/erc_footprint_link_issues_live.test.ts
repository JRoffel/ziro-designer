// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `ERC_TESTER::TestFootprintLinkIssues` (erc.cpp:1816) through CvPcb's KIFACE_TEST_FOOTPRINT_LINK
 * (cvpcb.cpp:40). The messages are kicad-cli 10.0.6's for the same Footprint fields, run against
 * this machine's stock table where Resistor_SMD holds R_0603_1608Metric and no NoSuchFp: an
 * unlisted library (the empty nickname of a bare name among them), a missing footprint, and a
 * footprint name with an illegal character, which the ERC's aFix parse reports as fixed. The
 * oracle cannot judge these portably - kicad-cli reads the machine's global footprint table -
 * so the table here is a FOOTPRINT_LIBRARY_STORE with that one footprint, plus a disabled row.
 */
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { PROJECT } from '@ziroeda/common/project.js';
import { PROJECT_FILE } from '@ziroeda/common/project/project_file.js';
import type { JsonValue } from '@ziroeda/common/settings/json_settings_internals.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import { IFACE } from '@ziroeda/cvpcb/cvpcb.js';
import { LoadSchematic } from '@ziroeda/eeschema/eeschema_helpers.js';
import { ERC_TESTER } from '@ziroeda/eeschema/erc/erc.js';
import type { SCH_MARKER } from '@ziroeda/eeschema/sch_marker.js';
import { FOOTPRINT_LIBRARY_STORE } from '@ziroeda/pcbnew/footprint_library_adapter.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** A store whose `Off` library is listed but not enabled (`HasLibrary( nick, true )`). */
class STORE_WITH_DISABLED extends FOOTPRINT_LIBRARY_STORE {
  override HasLibrary(aNickname: string, aCheckEnabled = false): boolean {
    if (aNickname === 'Off') return !aCheckEnabled;

    return super.HasLibrary(aNickname, aCheckEnabled);
  }
}

const FOOTPRINTS = [
  'Resistor_SMD:R_0603_1608Metric',
  'Resistor_SMD:NoSuchFp',
  'NoLib:R',
  'Resistor_SMD:Bad\\"Name',
  'NoColon',
  'Off:R',
  '',
  'Resistor_SMD:${FP}',
];

const SCH = `(kicad_sch (version 20250114) (generator "eeschema") (generator_version "10.0")
  (uuid "81111111-2222-3333-4444-555555555555") (paper "A4")
  (lib_symbols (symbol "Device:R" (pin_names (offset 0)) (exclude_from_sim no) (in_bom yes) (on_board yes)
    (property "Reference" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (property "Value" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (symbol "R_1_1" (pin passive line (at 0 3.81 270) (length 1.27) (name "~" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27))))))))
  ${FOOTPRINTS.map(
    (
      f,
      i,
    ) => `(symbol (lib_id "Device:R") (at ${25.4 * (i + 1)} 50.8 0) (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "00000000-0000-0000-0000-00000000000${i}")
    (property "Reference" "R${i + 1}" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (property "Value" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (property "Footprint" "${f}" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (instances (project "p" (path "/81111111-2222-3333-4444-555555555555" (reference "R${i + 1}") (unit 1)))))`,
  ).join('\n  ')}
  (sheet_instances (path "/" (page "1"))))`;

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => SetPgm(null));

function run(
  aCvPcb: IFACE | null,
  aProjectJson: JsonValue = { text_variables: { FP: 'Var_Fp' } },
): [string, string][] {
  const project = new PROJECT();
  project.setProjectFullName('/sch/p.kicad_pro');
  const file = new PROJECT_FILE('/sch/p.kicad_pro');
  project.setProjectFile(file);
  file.LoadFromFile(aProjectJson);
  const schematic = LoadSchematic('/sch/p.kicad_sch', project, (p) =>
    p === '/sch/p.kicad_sch' ? SCH : null,
  )!;
  new ERC_TESTER(schematic).RunTests(null, aCvPcb, project);

  const out: [string, string][] = [];
  for (const m of schematic.RootScreen()!.Items().OfType(KICAD_T.SCH_MARKER_T)) {
    const item = (m as SCH_MARKER).GetRCItem()!;
    if (item.GetSettingsKey() === 'footprint_link_issues')
      out.push([item.GetErrorMessage(false), item.GetMainItemID()]);
  }
  return out.sort();
}

function store(): STORE_WITH_DISABLED {
  const s = new STORE_WITH_DISABLED({
    footprintText: () => Promise.reject(new Error('unused')),
    flipLeftRight: () => false,
  });
  s.AddGlobalLibrary('Resistor_SMD', ['R_0603_1608Metric']);
  s.AddGlobalLibrary('Off', ['R']);
  return s;
}

describe('ERC_TESTER::TestFootprintLinkIssues', () => {
  it("reports each broken link with kicad-cli's message, on its symbol", () => {
    expect(run(new IFACE(store()))).toEqual(
      [
        ["Footprint 'NoSuchFp' not found in library 'Resistor_SMD'", '1'],
        ["The current configuration does not include the footprint library 'NoLib'", '2'],
        ["Footprint 'Bad_Name' not found in library 'Resistor_SMD'", '3'],
        ["The current configuration does not include the footprint library ''", '4'],
        ["The footprint library 'Off' is not enabled in the current configuration", '5'],
        // Resolved through the project's text variables before it is parsed.
        ["Footprint 'Var_Fp' not found in library 'Resistor_SMD'", '7'],
      ]
        .map(([m, i]) => [m, `00000000-0000-0000-0000-00000000000${i}`] as [string, string])
        .sort(),
    );
  });

  it('is skipped when the project ignores the check', () => {
    expect(
      run(new IFACE(store()), { erc: { rule_severities: { footprint_link_issues: 'ignore' } } }),
    ).toEqual([]);
  });

  it('is skipped without the CvPcb kiface, as upstream', () => {
    expect(run(null)).toEqual([]);
  });
});
