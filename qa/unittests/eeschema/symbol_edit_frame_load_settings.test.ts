// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `SYMBOL_EDIT_FRAME::LoadSettings` (symbol_edit_frame.cpp:327-338): after the canvas settings,
 * the four display options of `symbol_editor.json` go into the render settings - pin electrical
 * types, hidden pins, hidden fields, pin alternate icons. Each is read both ways, so a reader
 * stuck on the schematic's default cannot pass.
 */
import {
  SYMBOL_EDITOR_DEFAULTS,
  type SymbolEditorSettings,
  setSymbolEditorSettingsProvider,
} from '@ziroeda/eeschema/symbol_editor/symbol_editor_settings.js';
import { GRID_SNAPPING, GRID_STYLE } from '@ziroeda/common/gal/gal_display_options.js';
import { SCH_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { COLOR_SETTINGS } from '@ziroeda/common/settings/color_settings.js';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

let t: SYMBOL_EDIT_HARNESS;
let cfg: SymbolEditorSettings;

beforeEach(() => {
  cfg = structuredClone(SYMBOL_EDITOR_DEFAULTS);
  setSymbolEditorSettingsProvider(() => cfg);
  t = symbolEditHarness();
});

afterEach(() => {
  t.dispose();
  setSymbolEditorSettingsProvider(() => SYMBOL_EDITOR_DEFAULTS);
});

const shown = () => {
  t.frame.LoadSettings(t.frame.config()!);
  const rs = t.frame.GetRenderSettings()!;
  return {
    types: rs.m_ShowPinsElectricalType,
    pins: rs.m_ShowHiddenPins,
    fields: rs.m_ShowHiddenFields,
    alt: rs.m_ShowPinAltIcons,
  };
};

it.each([true, false])('takes each display option from the file (%s)', (aOn) => {
  cfg.show_pin_electrical_type = aOn;
  cfg.show_hidden_lib_pins = aOn;
  cfg.show_hidden_lib_fields = aOn;
  cfg.show_pin_alt_icons = aOn;
  expect(shown()).toEqual({ types: aOn, pins: aOn, fields: aOn, alt: aOn });
});

/**
 * Three settings in which every pair of keys differs at least once, so a reader that takes one
 * option from another's key - types from fields, say - is caught by one of them.
 */
it.each([
  [true, true, false, false],
  [true, false, true, false],
  [false, true, true, false],
])('reads each option from its own key (%s %s %s %s)', (types, pins, fields, alt) => {
  cfg.show_pin_electrical_type = types;
  cfg.show_hidden_lib_pins = pins;
  cfg.show_hidden_lib_fields = fields;
  cfg.show_pin_alt_icons = alt;
  expect(shown()).toEqual({ types, pins, fields, alt });
});

/**
 * `EDA_DRAW_FRAME::LoadSettings`' half: `m_galDisplayOptions.ReadConfig( *cmnCfg, *window, ... )`
 * from the symbol editor's OWN window slice - the Grids and Display pages' grid style, snapping
 * and line width, not the schematic's.
 */
it('reads the grid appearance and snapping from symbol_editor.json', () => {
  // The store replaces the slice on every write, which is what makes the object reload.
  cfg = structuredClone(cfg);
  cfg.window.grid.style = 'lines';
  cfg.window.grid.snap = 2;
  cfg.window.grid.line_width = 2.5;
  cfg.window.grid.min_spacing = 17;
  t.frame.LoadSettings(t.frame.config()!);
  const o = t.frame.GetGalDisplayOptions();
  expect({
    style: o.m_gridStyle,
    snap: o.m_gridSnapping,
    width: o.m_gridLineWidth,
    spacing: o.m_gridMinSpacing,
  }).toEqual({
    style: GRID_STYLE.LINES,
    snap: GRID_SNAPPING.NEVER,
    width: 2.5,
    spacing: 17,
  });
  cfg = structuredClone(cfg);
  cfg.window.grid.style = 'crosses';
  cfg.window.grid.snap = 1;
  t.frame.LoadSettings(t.frame.config()!);
  expect([o.m_gridStyle, o.m_gridSnapping]).toEqual([
    GRID_STYLE.SMALL_CROSS,
    GRID_SNAPPING.WITH_GRID,
  ]);
});

/**
 * `CommonSettingsChanged` (symbol_edit_frame.cpp:1558): SCH_BASE_FRAME's half reloads the colour
 * theme into the painter - the symbol editor's own when it is not set to follow eeschema's - and
 * the frame's half re-reads the display options.
 */
it('CommonSettingsChanged brings a theme and the display options to the canvas', () => {
  const painted = () =>
    JSON.stringify(
      t.harness.view
        .GetPainter()
        .GetSettings()
        .GetColor(null, SCH_LAYER_ID.LAYER_SCHEMATIC_BACKGROUND),
    );
  const theme = (aName: string) =>
    JSON.stringify(
      COLOR_SETTINGS.CreateBuiltinColorSettings()
        .find((c) => c.GetFilename() === aName)!
        .GetColor(SCH_LAYER_ID.LAYER_SCHEMATIC_BACKGROUND),
    );

  cfg = structuredClone(cfg);
  cfg.use_eeschema_color_settings = false;
  cfg.appearance.color_theme = COLOR_SETTINGS.COLOR_BUILTIN_CLASSIC;
  cfg.show_hidden_lib_pins = !cfg.show_hidden_lib_pins;
  t.frame.CommonSettingsChanged();
  expect(painted()).toBe(theme(COLOR_SETTINGS.COLOR_BUILTIN_CLASSIC));
  expect(t.frame.GetRenderSettings()!.m_ShowHiddenPins).toBe(cfg.show_hidden_lib_pins);

  cfg = structuredClone(cfg);
  cfg.appearance.color_theme = COLOR_SETTINGS.COLOR_BUILTIN_DEFAULT;
  t.frame.CommonSettingsChanged();
  expect(painted()).toBe(theme(COLOR_SETTINGS.COLOR_BUILTIN_DEFAULT));
});

/** `OnModify` (symbol_edit_frame.cpp:1112-1127): the edit stored, then the tree refreshed. */
it('OnModify refreshes the library tree', () => {
  t.dispose();
  let refreshed = 0;
  t = symbolEditHarness(undefined, { refreshLibTree: () => refreshed++ });
  t.open();
  refreshed = 0;
  t.frame.OnModify();
  expect(refreshed).toBe(1);
});
