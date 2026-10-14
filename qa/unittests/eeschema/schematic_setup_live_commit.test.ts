// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * What the window's Schematic Setup commit does to the live project: the panels' values written
 * into the PROJECT_FILE's `.kicad_pro` JSON and loaded back reach the settings classes nested in
 * it - ERC_SETTINGS' severities and pin map, the text variables - and SCHEMATIC::SetBusAliases
 * takes the project file's aliases, so ERC_TESTER and every live reader see the edit.
 */
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { PROJECT } from '@ziroeda/common/project.js';
import { PROJECT_FILE } from '@ziroeda/common/project/project_file.js';
import { RPT_SEVERITY_IGNORE } from '@ziroeda/common/reporter.js';
import type { JsonValue } from '@ziroeda/common/settings/json_settings_internals.js';
import { BUS_ALIAS } from '@ziroeda/eeschema/bus_alias.js';
import { ELECTRICAL_PINTYPE } from '@ziroeda/common/pin_type.js';
import { ERCE_T, PIN_ERROR } from '@ziroeda/eeschema/erc/erc_settings.js';
import {
  readSchematicSetupText,
  writeSchematicSetupText,
} from '@ziroeda/eeschema/project_settings.js';
import { SCHEMATIC } from '@ziroeda/eeschema/schematic.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => SetPgm(null));

describe('Schematic Setup committed into the live project', () => {
  it('reaches ERC_SETTINGS, the text variables and the bus aliases', () => {
    const project = new PROJECT();
    project.setProjectFullName('/t/t.kicad_pro');
    const file = new PROJECT_FILE('/t/t.kicad_pro');
    project.setProjectFile(file);
    file.LoadFromFile({});
    const schematic = new SCHEMATIC(project);

    // TransferDataToWindow: the panels' values, read from the live project.
    const setup = readSchematicSetupText(JSON.stringify(file.SaveToJson()));
    setup.erc.severities.pin_not_connected = 'ignore';
    const out = ELECTRICAL_PINTYPE.PT_OUTPUT;
    setup.erc.pinMap[out]![out] = 0; // OK
    setup.textVars = [{ name: 'REV', value: 'B' }];
    setup.busAliases = [{ name: 'DATA', members: ['D0', 'D1'] }];

    // The commit.
    const updated = writeSchematicSetupText(JSON.stringify(file.SaveToJson()), setup)!;
    file.LoadFromFile(JSON.parse(updated) as JsonValue);
    schematic.SetBusAliases(
      [...file.m_BusAliases].map(([name, members]) => {
        const alias = new BUS_ALIAS();
        alias.SetName(name);
        alias.SetMembers(members);
        return alias;
      }),
    );

    const erc = schematic.ErcSettings();
    expect(erc.GetSeverity(ERCE_T.ERCE_PIN_NOT_CONNECTED)).toBe(RPT_SEVERITY_IGNORE);
    expect(erc.GetPinMapValue(out, out)).toBe(PIN_ERROR.OK);
    const token = { value: 'REV' };
    expect(project.TextVarResolver(token)).toBe(true);
    expect(token.value).toBe('B');
    expect(schematic.GetAllBusAliases().map((a) => [a.GetName(), [...a.Members()]])).toEqual([
      ['DATA', ['D0', 'D1']],
    ]);
  });
});
