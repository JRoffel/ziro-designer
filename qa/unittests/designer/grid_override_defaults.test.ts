// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Whether the per-item grid overrides are ON when a frame first opens.
 *
 * `ACTIONS::toggleGridOverrides` is one of the two left-toolbar buttons that
 * genuinely IS a check item — it declares `TOOLBAR_STATE::TOGGLE`, where the
 * units actions declare nothing — so its default is not a preference detail:
 * it is the state the button is painted in the moment the editor opens. Ours
 * defaulted it off and a real eeschema opens with it on, which is why the
 * second button in the left toolbar was flat in our capture and lit in KiCad's.
 *
 * WHERE THE VALUE COMES FROM. `APP_SETTINGS_BASE` registers the grid params
 * behind a per-editor split (`common/settings/app_settings.cpp:494-525`) under
 * the comment "for grid overrides, give just the schematic and symbol editors
 * sane values". The split is real, but it does NOT reach this parameter:
 *
 *     if( m_filename == "eeschema" || m_filename == "symbol_editor" )
 *         ... PARAM<bool>( ".grid.overrides_enabled", ..., true )     // :497-498
 *     else
 *         ... PARAM<bool>( ".grid.overrides_enabled", ..., true )     // :523-524
 *
 * Both arms say `true`. Only `override_connected` (true / false) and
 * `override_graphics_idx` differ between them. So this one is editor
 * independent, which is what lets it live in a single shared grid block here
 * rather than needing the per-frame window settings KiCad has.
 *
 * The value is asserted as a literal read off those two C++ lines. Nothing
 * here calls the module to work out what it should have said.
 */
import { describe, expect, it } from 'vitest';
import { EESCHEMA_DEFAULTS } from '@ziroeda/eeschema/eeschema_settings.js';

describe('grid overrides are enabled by default', () => {
  it('eeschema opens with the overrides on', () => {
    expect(EESCHEMA_DEFAULTS.window.grid.overrides_enabled).toBe(true);
  });

  // `true` here means the override MECHANISM is armed; each item type is its own param. The
  // eeschema arm turns connected, wires and text on and leaves graphics off
  // (app_settings.cpp:499-508), at indices 1, 1, 3 and 2 (:511-520) of the 100/50/25/10 mil
  // list - and the installed build's eeschema.json says the same. This asserted wires and text
  // OFF until 10-24, which was our old default rather than the C++'s.
  it('and which item types are overridden, at which grid', () => {
    expect(EESCHEMA_DEFAULTS.window.grid.overrides).toEqual({
      connected: { enabled: true, size: '50 mil' },
      wires: { enabled: true, size: '50 mil' },
      text: { enabled: true, size: '10 mil' },
      graphics: { enabled: false, size: '25 mil' },
    });
  });
});

/**
 * KNOWN GAP, deliberately not asserted here: the `else` arm (:523-536), which every frame but
 * eeschema and the symbol editor takes. Each editor has its own settings slice now, and the
 * eeschema arm is asserted above (the symbol editor's in symbol_edit_frame_grid_live), but
 * `PCBNEW_DEFAULTS` carries no grid-override block at all, so there is nothing to compare the
 * `else` arm against yet.
 */
