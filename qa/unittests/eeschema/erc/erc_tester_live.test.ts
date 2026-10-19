// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The paths of ERC_TESTER, SHEETLIST_ERC_ITEMS_PROVIDER and ERC_REPORT the kicad-cli oracle
 * cannot reach, its 43 projects having no duplicate sheet names, no exclusions and every
 * severity asked for. Expectations from erc.cpp, erc_settings.cpp and erc_report.cpp.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PROJECT } from '@ziroeda/common/project.js';
import { PROJECT_FILE } from '@ziroeda/common/project/project_file.js';
import {
  RPT_SEVERITY_ERROR,
  RPT_SEVERITY_EXCLUSION,
  RPT_SEVERITY_IGNORE,
  RPT_SEVERITY_WARNING,
} from '@ziroeda/common/reporter.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import { ELECTRICAL_PINTYPE } from '@ziroeda/common/pin_type.js';
import { LIB_SYMBOL } from '@ziroeda/eeschema/lib_symbol.js';
import { SCH_PIN } from '@ziroeda/eeschema/sch_pin.js';
import { SCH_SYMBOL } from '@ziroeda/eeschema/sch_symbol.js';
import { LoadSchematic } from '@ziroeda/eeschema/eeschema_helpers.js';
import { ERC_TESTER } from '@ziroeda/eeschema/erc/erc.js';
import { EDA_UNITS_INT } from '@ziroeda/common/settings/app_settings.js';
import { makeHarness } from '../../pagelayout_editor/pl_editor_fixture.js';
import { ERC_REPORT } from '@ziroeda/eeschema/erc/erc_report.js';
import { ERCE_T, SHEETLIST_ERC_ITEMS_PROVIDER } from '@ziroeda/eeschema/erc/erc_settings.js';
import { SCH_MARKER as SCH_MARKER_CLASS, type SCH_MARKER } from '@ziroeda/eeschema/sch_marker.js';
import { ERC_ITEM } from '@ziroeda/eeschema/erc/erc_item.js';
import type { SCH_SHEET } from '@ziroeda/eeschema/sch_sheet.js';
import { DS_PROXY_VIEW_ITEM } from '@ziroeda/common/drawing_sheet/ds_proxy_view_item.js';
import { schIUScale } from '@ziroeda/common/eda_units.js';
import { PAGE_INFO, PAGE_SIZE_TYPE } from '@ziroeda/common/page_info.js';
import { TITLE_BLOCK } from '@ziroeda/common/title_block.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';

// ERC_TESTER asks Pgm() for the library manager, as KiCad's always-present PGM_BASE answers.
beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => SetPgm(null));

const DATA = resolve(__dirname, '../../../data/eeschema');

type Edit = (json: Record<string, Record<string, unknown>>) => void;

function load(aEdit: Edit = () => {}, aDir = 'netlist_oracle/complex_hierarchy') {
  const DIR = join(DATA, aDir);
  const name = aDir.slice(aDir.lastIndexOf('/') + 1);
  const pro = join(DIR, `${name}.kicad_pro`);
  const project = new PROJECT();
  project.setProjectFullName(pro);
  const file = new PROJECT_FILE(pro);
  project.setProjectFile(file);
  const json = JSON.parse(readFileSync(pro, 'utf8'));
  json.erc ??= {};
  aEdit(json);
  file.LoadFromFile(json);
  return LoadSchematic(join(DIR, `${name}.kicad_sch`), project, (p) =>
    existsSync(p) ? readFileSync(p, 'utf8') : null,
  )!;
}

const markersOn = (aSchematic: ReturnType<typeof load>) =>
  aSchematic.RootScreen()!.Items().OfType(KICAD_T.SCH_MARKER_T) as unknown as SCH_MARKER[];

const rootSheets = (aSchematic: ReturnType<typeof load>) =>
  aSchematic.RootScreen()!.Items().OfType(KICAD_T.SCH_SHEET_T) as unknown as SCH_SHEET[];

describe('ERC_TESTER::TestDuplicateSheetNames', () => {
  it('finds two sheets on one screen whose names differ only in case, once', () => {
    const schematic = load();
    const [a, b] = rootSheets(schematic);
    b!.SetName(a!.GetName().toUpperCase());

    const tester = new ERC_TESTER(schematic);
    expect(tester.TestDuplicateSheetNames(false)).toBe(1);
    expect(markersOn(schematic)).toHaveLength(0); // aCreateMarker false: counted only

    expect(tester.TestDuplicateSheetNames(true)).toBe(1);
    const [marker] = markersOn(schematic);
    expect(marker!.GetRCItem()!.GetErrorCode()).toBe(ERCE_T.ERCE_DUPLICATE_SHEET_NAME);
    expect(marker!.GetPosition()).toEqual(a!.GetPosition());
  });

  it('runs from RunTests unless the rule is ignored', () => {
    const named = (ignore: boolean) => {
      const schematic = load((json) => {
        if (ignore) json.erc!.rule_severities = { duplicate_sheet_names: 'ignore' };
      });
      const [a, b] = rootSheets(schematic);
      b!.SetName(a!.GetName());
      new ERC_TESTER(schematic).RunTests();
      return markersOn(schematic).filter(
        (m) => m.GetRCItem()!.GetErrorCode() === ERCE_T.ERCE_DUPLICATE_SHEET_NAME,
      ).length;
    };
    expect([named(false), named(true)]).toEqual([1, 0]);
  });

  it('passes distinct names', () => {
    expect(new ERC_TESTER(load()).TestDuplicateSheetNames(false)).toBe(0);
  });
});

/** issue22694 (three sheets) after ERC: kicad-cli finds 10 errors and 3 warnings in it. */
function checked(aEdit?: Edit) {
  const schematic = load(aEdit, 'netlist_oracle_graph/issue22694');
  new ERC_TESTER(schematic).RunTests();
  return schematic;
}

describe('ERC_TESTER::TestOffGridEndpoints', () => {
  /** A one-pin symbol of \a aType on the root screen, its pin 10 IU off the 50 mil grid. */
  const offGrid = (aType: ELECTRICAL_PINTYPE) => {
    const schematic = load();
    const root = schematic.Hierarchy()[0]!;
    const lib = new LIB_SYMBOL('ONE');
    const libPin = new SCH_PIN(lib);
    libPin.SetNumber('1');
    libPin.SetType(aType);
    libPin.SetPosition({ x: 10, y: 0 });
    lib.AddDrawItem(libPin);
    const symbol = new SCH_SYMBOL(lib, lib.GetLibId(), root, 1, 0, { x: 0, y: 0 });
    symbol.SetRef(root, 'X1');
    symbol.UpdatePins();
    root.LastScreen()!.Append(symbol);
    const before = new ERC_TESTER(load()).TestOffGridEndpoints();
    return [new ERC_TESTER(schematic).TestOffGridEndpoints() - before, markersOn(schematic)];
  };

  it('marks an off-grid pin, at the pin', () => {
    const [added, markers] = offGrid(ELECTRICAL_PINTYPE.PT_PASSIVE) as [number, SCH_MARKER[]];
    expect(added).toBe(1);
    expect(markers.some((m) => m.GetPosition().x === 10 && m.GetPosition().y === 0)).toBe(true);
  });

  it('leaves a no-connect pin alone', () => {
    expect(offGrid(ELECTRICAL_PINTYPE.PT_NC)[0]).toBe(0);
  });
});

describe('ERC_TESTER::TestMissingUnits', () => {
  it('lists at most three missing units, and their bidirectional pins', () => {
    // erc.cpp:631: a fourth missing unit is written "...", then the Truncate meant for the
    // last ", " cuts two of its dots, so KiCad prints "[ B, C, D, . ]". A unit holding a
    // PT_BIDI pin is reported as ERCE_MISSING_BIDI_PIN.
    const schematic = load();
    const root = schematic.Hierarchy()[0]!;
    const lib = new LIB_SYMBOL('FIVE');
    lib.SetUnitCount(5, false);
    for (let unit = 1; unit <= 5; unit++) {
      const libPin = new SCH_PIN(lib);
      libPin.SetNumber(String(unit));
      libPin.SetType(ELECTRICAL_PINTYPE.PT_BIDI);
      libPin.SetUnit(unit);
      libPin.SetPosition({ x: unit * 2540, y: 0 });
      lib.AddDrawItem(libPin);
    }
    const symbol = new SCH_SYMBOL(lib, lib.GetLibId(), root, 1, 0, { x: 0, y: 0 });
    symbol.SetRef(root, 'U99');
    symbol.UpdatePins();
    root.LastScreen()!.Append(symbol);

    new ERC_TESTER(schematic).TestMissingUnits();
    const messages = markersOn(schematic).map((m) => [
      m.GetRCItem()!.GetErrorCode(),
      m.GetRCItem()!.GetErrorMessage(false),
    ]);
    expect(messages).toEqual([
      [ERCE_T.ERCE_MISSING_UNIT, 'Symbol U99 has unplaced units [ B, C, D, . ]'],
      [
        ERCE_T.ERCE_MISSING_BIDI_PIN,
        'Symbol U99 has bidirectional pins in units [ B, C, D, . ] that are not placed',
      ],
    ]);
  });
});

describe('SHEETLIST_ERC_ITEMS_PROVIDER', () => {
  it('counts by severity, and keeps only the asked severities, errors first', () => {
    const schematic = checked();
    const all = new SHEETLIST_ERC_ITEMS_PROVIDER(schematic);
    all.SetSeverities(RPT_SEVERITY_ERROR | RPT_SEVERITY_WARNING);
    const errors = all.GetCount(RPT_SEVERITY_ERROR);
    const warnings = all.GetCount(RPT_SEVERITY_WARNING);
    expect(errors).toBeGreaterThan(0);
    expect(warnings).toBeGreaterThan(0);
    expect(all.GetCount()).toBe(errors + warnings);

    const sev = (p: SHEETLIST_ERC_ITEMS_PROVIDER, i: number) =>
      schematic.ErcSettings().GetSeverity(p.GetItem(i)!.GetErrorCode());
    const order = Array.from({ length: all.GetCount() }, (_, i) => sev(all, i));
    expect(order).toEqual([...order].sort((x, y) => y - x));

    const onlyWarnings = new SHEETLIST_ERC_ITEMS_PROVIDER(schematic);
    onlyWarnings.SetSeverities(RPT_SEVERITY_WARNING);
    expect(onlyWarnings.GetCount()).toBe(warnings);
    // The per-severity counts are of every marker, not only the kept ones.
    expect(onlyWarnings.GetCount(RPT_SEVERITY_ERROR)).toBe(errors);
  });

  it('moves an excluded marker to the exclusion count, and back', () => {
    const schematic = checked();
    const provider = new SHEETLIST_ERC_ITEMS_PROVIDER(schematic);
    provider.SetSeverities(RPT_SEVERITY_ERROR | RPT_SEVERITY_WARNING | RPT_SEVERITY_EXCLUSION);
    const errors = provider.GetCount(RPT_SEVERITY_ERROR);
    const marker = provider.GetItem(0)!.GetParent() as unknown as SCH_MARKER;

    provider.SetMarkerExcluded(marker, true, 'fine');
    expect([
      provider.GetCount(RPT_SEVERITY_ERROR),
      provider.GetCount(RPT_SEVERITY_EXCLUSION),
    ]).toEqual([errors - 1, 1]);
    expect(marker.GetComment()).toBe('fine');

    // SetSeverities recounts from the markers: the exclusion holds.
    provider.SetSeverities(RPT_SEVERITY_ERROR);
    expect(provider.GetCount()).toBe(errors - 1);

    provider.SetSeverities(RPT_SEVERITY_ERROR | RPT_SEVERITY_EXCLUSION);
    provider.SetMarkerExcluded(marker, false);
    expect(provider.GetCount(RPT_SEVERITY_EXCLUSION)).toBe(0);
  });

  it('deletes an item from the list, and with aDeep from its screen', () => {
    const schematic = checked();
    const provider = new SHEETLIST_ERC_ITEMS_PROVIDER(schematic);
    provider.SetSeverities(RPT_SEVERITY_ERROR | RPT_SEVERITY_WARNING);
    const n = provider.GetCount();
    const onScreens = () =>
      schematic
        .Hierarchy()
        .reduce((s, p) => s + p.LastScreen()!.Items().OfType(KICAD_T.SCH_MARKER_T).length, 0);
    const before = onScreens();

    provider.DeleteItem(0, false);
    expect([provider.GetCount(), onScreens()]).toEqual([n - 1, before]);
    provider.DeleteItem(0, true);
    expect(provider.GetCount()).toBe(n - 2);
    expect(onScreens()).toBeLessThan(before);
  });
});

describe('ERC_TESTER::RunTests and the report', () => {
  it("excludes the project's recorded exclusions after the run", () => {
    const first = checked();
    const provider = new SHEETLIST_ERC_ITEMS_PROVIDER(first);
    provider.SetSeverities(RPT_SEVERITY_ERROR);
    const marker = provider.GetItem(0)!.GetParent() as unknown as SCH_MARKER;
    const serialized = marker.SerializeToString();

    const again = checked((json) => {
      json.erc!.erc_exclusions = [[serialized, 'reviewed']];
    });
    const excluded = again
      .Hierarchy()
      .flatMap(
        (p) => p.LastScreen()!.Items().OfType(KICAD_T.SCH_MARKER_T) as unknown as SCH_MARKER[],
      )
      .filter((m) => m.IsExcluded());
    expect(excluded.map((m) => [m.SerializeToString(), m.GetComment()])).toEqual([
      [serialized, 'reviewed'],
    ]);
  });

  it('resolves exclusions recorded after the load against the markers it makes', () => {
    // erc.cpp:2290: RunTests ends with ResolveERCExclusionsPostUpdate, so an exclusion the
    // load did not see is matched to the marker this run makes.
    const first = checked();
    const provider = new SHEETLIST_ERC_ITEMS_PROVIDER(first);
    provider.SetSeverities(RPT_SEVERITY_ERROR);
    const serialized = (
      provider.GetItem(0)!.GetParent() as unknown as SCH_MARKER
    ).SerializeToString();

    const schematic = load(undefined, 'netlist_oracle_graph/issue22694');
    schematic.ErcSettings().m_ErcExclusions.add(serialized);
    schematic.ErcSettings().m_ErcExclusionComments.set(serialized, 'later');
    new ERC_TESTER(schematic).RunTests();

    const matching = schematic
      .Hierarchy()
      .flatMap(
        (p) => p.LastScreen()!.Items().OfType(KICAD_T.SCH_MARKER_T) as unknown as SCH_MARKER[],
      )
      .filter((m) => m.SerializeToString() === serialized);
    expect(matching.map((m) => [m.IsExcluded(), m.GetComment()])).toEqual([[true, 'later']]);
  });

  it('shows a marker that is not sheet specific once, though its screen is used twice', () => {
    // erc_settings.cpp:378: complex_hierarchy uses ampli_ht.kicad_sch for two sheets.
    const schematic = load();
    const vertical = schematic
      .Hierarchy()
      .find((p) => p.PathHumanReadable() === '/ampli_ht_vertical/')!;
    const item = ERC_ITEM.Create(ERCE_T.ERCE_ENDPOINT_OFF_GRID)!;
    vertical.LastScreen()!.Append(new SCH_MARKER_CLASS(item, { x: 1, y: 1 }));

    const provider = new SHEETLIST_ERC_ITEMS_PROVIDER(schematic);
    provider.SetSeverities(RPT_SEVERITY_ERROR | RPT_SEVERITY_WARNING);
    expect(provider.GetCount()).toBe(1);
  });

  it('lists the ignored checks, and only the severities it was given', () => {
    const schematic = checked((json) => {
      json.erc!.rule_severities = { pin_not_connected: 'ignore' };
    });
    expect(schematic.ErcSettings().GetSeverity(ERCE_T.ERCE_PIN_NOT_CONNECTED)).toBe(
      RPT_SEVERITY_IGNORE,
    );
    const provider = new SHEETLIST_ERC_ITEMS_PROVIDER(schematic);
    provider.SetSeverities(RPT_SEVERITY_WARNING);
    const report = JSON.parse(new ERC_REPORT(schematic, 'mm', provider).WriteJsonReport());

    expect(report.included_severities).toEqual(['warning']);
    expect(report.ignored_checks.map((c: { key: string }) => c.key)).toContain('pin_not_connected');
    expect(report.ignored_checks.map((c: { key: string }) => c.key)).not.toContain(
      'pin_not_driven',
    );
  });

  it('writes the text report a sheet at a time, with the totals and the ignored checks', () => {
    const schematic = checked();
    const text = new ERC_REPORT(schematic, 'mm').WriteTextReport();
    expect(text).toMatch(/^ERC report \(.*, Encoding UTF8\)\nReport includes: Errors, Warnings\n/);
    expect(text).toContain('\n***** Sheet /\n');
    expect(text).toContain('\n***** Sheet /Subsheet 1/\n');
    expect(text).toMatch(/\n \*\* ERC messages: \d+ {2}Errors \d+ {2}Warnings \d+\n/);
    expect(text).toContain('\n ** Ignored checks:\n');
  });
});

describe('ERC_TESTER::TestTextVars on the drawing sheet', () => {
  /** complex_hierarchy checked against a drawing sheet whose title block says \a aTitle. */
  const withTitle = (aTitle: string) => {
    const schematic = load();
    const titleBlock = new TITLE_BLOCK();
    titleBlock.SetTitle(aTitle);
    const drawingSheet = new DS_PROXY_VIEW_ITEM(
      schIUScale,
      new PAGE_INFO(PAGE_SIZE_TYPE.A4),
      null,
      titleBlock,
      null,
    );
    new ERC_TESTER(schematic).TestTextVars(drawingSheet);
    return schematic;
  };

  /** Every marker on every screen (a screen two sheets share counted once), as [code, message]. */
  const all = (aSchematic: ReturnType<typeof load>) =>
    [...new Set(aSchematic.Hierarchy().map((path) => path.LastScreen()!))].flatMap((screen) =>
      (screen.Items().OfType(KICAD_T.SCH_MARKER_T) as unknown as SCH_MARKER[]).map((m) => [
        m.GetRCItem()!.GetErrorCode(),
        m.GetRCItem()!.GetErrorMessage(false),
      ]),
    );

  it('raises a ${ERC_WARNING} in the title block once per sheet, marked as the drawing sheet', () => {
    const schematic = withTitle('${ERC_WARNING check me}');
    const sheets = schematic.Hierarchy().length;
    expect(sheets).toBeGreaterThan(1);
    expect(all(schematic)).toEqual(
      Array(sheets).fill([ERCE_T.ERCE_GENERIC_WARNING, 'check me (in drawing sheet)']),
    );
  });

  it('a Drawing Sheet Editor opened beside it leaves the title block resolved', () => {
    // Its frame turns its model's edit mode on (pl_editor_frame.cpp: `m_EditMode = true`), in
    // which every text item shows its raw format. Upstream that model is pl_editor's own static;
    // when it was the shared one, ERC flagged every ${...} of a correct schematic's title block.
    makeHarness(EDA_UNITS_INT.MM);

    expect(all(withTitle('led ckt'))).toEqual([]);
  });

  it('reports an unresolved variable in the title block', () => {
    const schematic = withTitle('${NO_SUCH_VAR}');
    expect(all(schematic)).toEqual(
      Array(schematic.Hierarchy().length).fill([
        ERCE_T.ERCE_UNRESOLVED_VARIABLE,
        'Unresolved text variable in drawing sheet',
      ]),
    );

    // One marker per sheet instance, each naming its own sheet path.
    const paths = [...new Set(schematic.Hierarchy().map((p) => p.LastScreen()!))]
      .flatMap((screen) => screen.Items().OfType(KICAD_T.SCH_MARKER_T) as unknown as SCH_MARKER[])
      .map((m) => (m.GetRCItem() as ERC_ITEM).GetSpecificSheetPath().PathAsString())
      .sort();
    expect(paths).toEqual(
      schematic
        .Hierarchy()
        .map((p) => p.PathAsString())
        .sort(),
    );
  });

  it('finds nothing in a plain title, nor without a drawing sheet', () => {
    expect(all(withTitle('Plain'))).toEqual([]);
    const schematic = load();
    new ERC_TESTER(schematic).TestTextVars(null);
    expect(all(schematic)).toEqual([]);
  });
});
