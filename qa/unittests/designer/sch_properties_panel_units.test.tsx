// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SCH_PROPERTIES_PANEL end to end: the live panel's rows for a placed symbol, rendered by the
 * shared widget, read as KiCad's grid - every distance cell formatted by PGPROPERTY_DISTANCE in
 * the frame's display units (pg_properties.cpp:357), never the message panel's formatter.
 */
import { resolve } from 'node:path';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import type { StatusUnits } from '@ziroeda/common/widgets/kistatusbar_format.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { SCH_SYMBOL } from '@ziroeda/eeschema/sch_symbol.js';
import { SCH_SELECTION_TOOL } from '@ziroeda/eeschema/tools/sch_selection_tool.js';
import { LiveSchPropertiesPanel } from '@ziroeda/eeschema/widgets/sch_properties_panel_ui.js';
import { openProject, schFrame, schToolHarness } from '../eeschema/support/sch_tool_harness.js';

// `import.meta.url` is not a file: URL under happy-dom, so the fixture is resolved off the vitest
// root (qa/) the way the other DOM tests do.
const DIR = resolve(process.cwd(), 'data/eeschema/props_panel');

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => {
  cleanup();
  SetPgm(null);
});

/** The value cell text of one named row, with R1 - at (127, 50.8) mm - selected. */
function cellText(name: string, units: StatusUnits): string {
  const h = schToolHarness(schFrame({}));
  openProject(h.frame, DIR, 'every_kind', ['every_kind.kicad_sch', 'sub.kicad_sch']);
  const r1 = [...h.frame.GetScreen()!.Items().OfType(KICAD_T.SCH_SYMBOL_T)][0] as SCH_SYMBOL;
  const { container } = render(<LiveSchPropertiesPanel frame={h.frame} units={units} />);
  act(() => h.frame.GetToolManager()!.GetTool(SCH_SELECTION_TOOL)!.AddItemToSel(r1));

  const row = Array.from(container.querySelectorAll('.ze-pgrid-row')).find(
    (r) => r.querySelector('.ze-pgrid-name')?.textContent === name,
  );
  if (!row) throw new Error(`no row named ${name}`);
  return row.querySelector('.ze-pgrid-value')?.textContent ?? '';
}

describe('every distance cell carries its unit, as PGPROPERTY_DISTANCE does', () => {
  it('paints Position X and Y in mils with the unit, not as a bare number', () => {
    expect(cellText('Position X', 'mils')).toBe('5000 mils');
    expect(cellText('Position Y', 'mils')).toBe('2000 mils');
  });

  it('follows the frame’s display units', () => {
    expect(cellText('Position X', 'mm')).toBe('127 mm');
    expect(cellText('Position X', 'in')).toBe('5 in');
  });

  /**
   * `PROPERTY_DISPLAY::PT_SIZE` on "Pin Name Position Offset" (lib_symbol.cpp:2689) makes it a
   * PGPROPERTY_SIZE, which is the same PGPROPERTY_DISTANCE.
   */
  it('paints the PT_SIZE row the same way, so the offset reads "0 mils"', () => {
    expect(cellText('Pin Name Position Offset', 'mils')).toBe('0 mils');
  });

  it('leaves a non-distance row alone - Orientation is not "0 mils"', () => {
    expect(cellText('Orientation', 'mils')).toBe('0');
  });
});
