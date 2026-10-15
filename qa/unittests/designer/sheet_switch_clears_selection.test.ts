// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Reported: "when i selected a component and switched the sheet the component is still
 * selected and came along to another sheet".
 *
 * The window's sheet switch (hierarchy pane, Back/Forward, Up, Previous/Next) reaches the
 * live frame through showLiveRef, which called SetCurrentSheet alone. SCH_NAVIGATE_TOOL's
 * changeSheet follows it with DisplayCurrentSheet, whose selectionClear is what leaves the
 * old sheet's selection behind. sch_navigate_tool_live pins that DisplayCurrentSheet clears;
 * this pins that the window's switch reaches it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCH = readFileSync(join(__dirname, '../../../eeschema/sch_edit_frame_ui.tsx'), 'utf8');

describe('the window switching sheets', () => {
  it('follows every SetCurrentSheet with DisplayCurrentSheet', () => {
    const calls = [...SCH.matchAll(/frame\.SetCurrentSheet\(path\);/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const m of calls) {
      const next = SCH.slice(m.index! + m[0].length).trimStart();
      expect(next.startsWith('frame.DisplayCurrentSheet();')).toBe(true);
    }
    // No bare one-line form left over.
    expect(SCH).not.toMatch(/frame\.SetCurrentSheet\(path\)(?!;\s*frame\.DisplayCurrentSheet)/);
  });
});
