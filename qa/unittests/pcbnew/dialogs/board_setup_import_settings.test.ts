// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_BOARD_SETUP::onAuxiliaryAction's merge: each ticked group's panel takes the other
 * board's values. The Defaults group is PANEL_SETUP_DEFAULTS, whose TransferDataToWindow refills
 * all three of its panels - text & graphics, dimensions, and the zone defaults.
 */
import { describe, expect, it } from 'vitest';
import { ImportBoardSetupSettings } from '@ziroeda/pcbnew/dialogs/dialog_board_setup.js';
import type { ImportSettingsOpts } from '@ziroeda/pcbnew/dialogs/dialog_import_settings.js';
import { freshBoardSetup } from '../../designer/board_setup_test_utils.js';

const NONE: ImportSettingsOpts = {
  layers: false,
  maskAndPaste: false,
  zoneHatchingOffsets: false,
  textAndGraphics: false,
  formatting: false,
  constraints: false,
  tracksAndVias: false,
  teardrops: false,
  tuningPatterns: false,
  netclasses: false,
  componentClasses: false,
  tuningProfiles: false,
  customRules: false,
  severities: false,
};

describe('ImportBoardSetupSettings', () => {
  it('Defaults brings text & graphics, dimensions and the zone defaults together', () => {
    const v = freshBoardSetup();
    const other = freshBoardSetup();
    other.zones = { ...other.zones, marker: 'other' } as typeof other.zones;
    other.dimensions = { ...other.dimensions, marker: 'other' } as typeof other.dimensions;
    other.textGraphics = { ...other.textGraphics, marker: 'other' } as typeof other.textGraphics;

    const next = ImportBoardSetupSettings(v, other, { ...NONE, textAndGraphics: true });
    for (const group of [next.zones, next.dimensions, next.textGraphics])
      expect((group as unknown as { marker?: string }).marker).toBe('other');
  });

  it('leaves an unticked group as it was', () => {
    const v = freshBoardSetup();
    const other = freshBoardSetup();
    other.zones = { ...other.zones, marker: 'other' } as typeof other.zones;
    const next = ImportBoardSetupSettings(v, other, NONE);
    expect((next.zones as unknown as { marker?: string }).marker).toBeUndefined();
  });
});
