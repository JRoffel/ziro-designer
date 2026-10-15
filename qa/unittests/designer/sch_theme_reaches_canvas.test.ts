// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Reported: the schematic stayed white after picking wDark in Preferences > Colors.
 *
 * SCH_DRAW_PANEL's painter takes the frame's GetColorSettings() once, when it is built, and
 * nothing asked again. KiCad's KIWAY::CommonSettingsChanged after a Preferences OK runs
 * SCH_BASE_FRAME::CommonSettingsChanged, which looks the theme up again (sch_base_frame
 * tests pin that it does); this pins that the window raises it whenever the theme changes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCH = readFileSync(join(__dirname, '../../../eeschema/sch_edit_frame_ui.tsx'), 'utf8');

describe('a theme picked in Preferences', () => {
  it('raises CommonSettingsChanged on the live frame, keyed on the resolved theme', () => {
    expect(SCH).toMatch(
      /useEffect\(\(\) => \{\s*schFrameRef\.current\?\.CommonSettingsChanged\(\);\s*\}, \[theme\]\);/,
    );
    expect(SCH).toMatch(/const theme = app\.useSchematicTheme\(\);/);
  });
});
