// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `include/settings/app_settings.h` + `common/settings/app_settings.cpp`: the
 * in-memory settings object every frame reads. The C++ class is a
 * `JSON_SETTINGS`, whose `PARAM` list loads and stores each member from the
 * app's JSON file; here the designer's settings store is that file and the
 * PARAM mapping lands with the frame wiring (pending, #636 stage 6). What is
 * here is every member, at the default its PARAM gives it.
 */
import { CROSS_HAIR_MODE } from '../gal/gal_display_options.js';
import {
  ZOOM_LIST_EESCHEMA,
  ZOOM_LIST_GERBVIEW,
  ZOOM_LIST_PCBNEW,
  ZOOM_LIST_PCBNEW_HYPER,
  ZOOM_LIST_PL_EDITOR,
} from '../zoom_defines.js';
import { GRID, GRID_SETTINGS } from './grid_settings.js';
import type { EdaUnits } from '../eda_units.js';

/**
 * Cross-probing behavior.
 */
export class CROSS_PROBING_SETTINGS {
  on_selection = true; ///< Synchronize the selection for multiple items too.
  center_on_items = true; ///< Automatically pan to cross-probed items.
  zoom_to_fit = true; ///< Zoom to fit items (ignored if center_on_items is off).
  auto_highlight = true; ///< Automatically turn on highlight mode in the target frame.
  flash_selection = false; ///< Flash newly cross-probed selection (visual attention aid).
}

/**
 * Common cursor settings, available to every frame.
 */
export class CURSOR_SETTINGS {
  always_show_cursor = true;
  cross_hair_mode: CROSS_HAIR_MODE = CROSS_HAIR_MODE.SMALL_CROSS;
}

/**
 * Settings for arc editing. Used by pcbnew and footprint editor
 */
export { ARC_EDIT_MODE } from '../frame_type.js';

/**
 * Store the window positioning/state.
 */
export class WINDOW_STATE {
  maximized = false;
  size_x = 0;
  size_y = 0;
  pos_x = 0;
  pos_y = 0;
  display = 0;
}

/**
 * Store the common settings that are saved and loaded for each window / frame.
 */
export class WINDOW_SETTINGS {
  state = new WINDOW_STATE();
  mru_path = '';
  perspective = '';
  aui_state: unknown = null;
  zoom_factors: number[] = [];

  cursor = new CURSOR_SETTINGS();
  grid = new GRID_SETTINGS();
}

export class FIND_REPLACE {
  find_string = '';
  find_history: string[] = [];
  replace_string = '';
  replace_history: string[] = [];
  search_and_replace = false;
  match_case = false;
  match_mode = 0;
}

export enum SEARCH_PANE_SELECTION_ZOOM {
  NONE,
  PAN,
  ZOOM,
}

export class SEARCH_PANE {
  selection_zoom: SEARCH_PANE_SELECTION_ZOOM = SEARCH_PANE_SELECTION_ZOOM.PAN;
  search_hidden_fields = true;
  search_metadata = false;
}

export class GRAPHICS {
  highlight_factor = 0.5; ///< How much to brighten highlighted objects by.
  select_factor = 0.75; ///< How much to brighten selected objects by.
}

export class COLOR_PICKER {
  default_tab = 0;
}

export class LIB_TREE {
  columns: string[] = []; ///< Ordered list of visible columns in the tree.
  column_widths = new Map<string, number>(); ///< Column widths, keyed by header name.
  open_libs: string[] = []; ///< list of libraries the user has open in the tree.
}

export class PANEL_DESIGN_BLOCK_CHOOSER {
  sash_pos_h = -1;
  sash_pos_v = -1;
  width = -1;
  height = -1;
  sort_mode = 0;
  repeated_placement = false;
  place_as_sheet = false;
  place_as_group = true;
  keep_annotations = false;

  // For saving tree columns and widths
  tree = new LIB_TREE();
}

export class PRINTING {
  background = false; ///< Whether or not to print background color.
  monochrome = true; ///< Whether or not to print in monochrome.
  scale = 1.0; ///< Printout scale.
  use_theme = false; ///< If false, display color theme will be used.
  color_theme = ''; ///< Color theme to use for printing.
  title_block = false; ///< Whether or not to print title block.
  layers: number[] = []; ///< List of enabled layers for printing.
  mirror = false; ///< Print mirrored.
  drill_marks = 1; ///< Drill marks type (0=none, 1=small, 2=real).
  pagination = 1; ///< 0=all layers on one page, 1=one page per layer.
  edge_cuts_on_all_pages = true; ///< Print board edges on all pages.
  as_item_checkboxes = false; ///< Honor checkboxes in appearance manager.
}

export class SYSTEM {
  first_run_shown = false; //@todo RFB remove? - not used
  max_undo_items = 0;
  file_history: string[] = [];
  units = 0;
  last_metric_units = 0;
  last_imperial_units = 0;
  show_import_issues = true;
}

export class PLUGINS {
  actions: [string, boolean][] = [];
}

/** `COLOR_SETTINGS::COLOR_BUILTIN_DEFAULT` (color_settings.cpp:34). */
export const COLOR_BUILTIN_DEFAULT = '_builtin_default';

/**
 * `EDA_UNITS` as `system.units` stores it: the enum's integer
 * (include/eda_units.h `enum class EDA_UNITS`).
 */
export enum EDA_UNITS_INT {
  INCH = 0, // Do not use IN: it conflicts with a Windows header
  MM = 1,
  UNSCALED = 2,
  DEGREES = 3,
  PERCENT = 4,
  MILS = 5,
  UM = 6,
  CM = 7,
  FS = 8, // Femtoseconds
  PS = 9, // Picoseconds
  PS_PER_INCH = 10,
  PS_PER_CM = 11,
  PS_PER_MM = 12,
}

/** `EDA_UNITS` by its integer, as the unit strings the port carries. */
const EDA_UNITS_BY_INT: readonly EdaUnits[] = [
  'in',
  'mm',
  'unscaled',
  'degrees',
  'percent',
  'mils',
  'um',
  'cm',
  'fs',
  'ps',
  'ps/in',
  'ps/cm',
  'ps/mm',
];

/** `static_cast<EDA_UNITS>( aValue )`: a stored integer as the unit. */
export function EdaUnitsFromInt(aValue: number): EdaUnits {
  return EDA_UNITS_BY_INT[aValue] ?? 'mm';
}

/** `static_cast<int>( aUnits )`: the integer a unit is stored as. */
export function EdaUnitsToInt(aUnits: EdaUnits): number {
  return EDA_UNITS_BY_INT.indexOf(aUnits);
}

export class APP_SETTINGS_BASE {
  protected m_filename: string;
  protected m_schemaVersion: number;

  m_CrossProbing = new CROSS_PROBING_SETTINGS();
  m_FindReplace = new FIND_REPLACE();
  m_DesignBlockChooserPanel = new PANEL_DESIGN_BLOCK_CHOOSER();
  m_Graphics = new GRAPHICS();
  m_ColorPicker = new COLOR_PICKER();
  m_LibTree = new LIB_TREE();
  m_Printing = new PRINTING();
  m_SearchPane = new SEARCH_PANE();
  m_System = new SYSTEM();
  m_Plugins = new PLUGINS();
  m_Window = new WINDOW_SETTINGS();

  m_ColorTheme: string = COLOR_BUILTIN_DEFAULT;
  m_CustomToolbars = false;

  ///< Local schema version for common app settings
  m_appSettingsSchemaVersion: number;

  constructor(aFilename: string, aSchemaVersion: number) {
    this.m_filename = aFilename;
    this.m_schemaVersion = aSchemaVersion;
    this.m_appSettingsSchemaVersion = aSchemaVersion;

    // app_settings.cpp:228-238
    if (
      this.m_filename === 'pl_editor' ||
      this.m_filename === 'eeschema' ||
      this.m_filename === 'symbol_editor'
    ) {
      this.m_System.units = EDA_UNITS_INT.MILS;
    } else {
      this.m_System.units = EDA_UNITS_INT.MM;
    }

    this.m_System.last_metric_units = EDA_UNITS_INT.MM;
    this.m_System.last_imperial_units = EDA_UNITS_INT.MILS;

    this.addParamsForWindow(this.m_Window);
  }

  GetFilename(): string {
    return this.m_filename;
  }

  DefaultGridSizeList(): GRID[] {
    if (this.m_filename === 'eeschema' || this.m_filename === 'symbol_editor') {
      return [
        new GRID('', '100 mil', '100 mil'),
        new GRID('', '50 mil', '50 mil'),
        new GRID('', '25 mil', '25 mil'),
        new GRID('', '10 mil', '10 mil'),
      ];
    }
    if (this.m_filename === 'pl_editor') {
      return [
        new GRID('', '5.00 mm', '5.00 mm'),
        new GRID('', '2.50 mm', '2.50 mm'),
        new GRID('', '2.00 mm', '2.00 mm'),
        new GRID('', '1.00 mm', '1.00 mm'),
        new GRID('', '0.50 mm', '0.50 mm'),
        new GRID('', '0.25 mm', '0.25 mm'),
        new GRID('', '0.20 mm', '0.20 mm'),
        new GRID('', '0.10 mm', '0.10 mm'),
      ];
    }
    if (this.m_filename === 'gerbview') {
      return [
        new GRID('', '100 mil', '100 mil'),
        new GRID('', '50 mil', '50 mil'),
        new GRID('', '25 mil', '25 mil'),
        new GRID('', '20 mil', '20 mil'),
        new GRID('', '10 mil', '10 mil'),
        new GRID('', '5 mil', '5 mil'),
        new GRID('', '2.5 mil', '2.5 mil'),
        new GRID('', '2 mil', '2 mil'),
        new GRID('', '1 mil', '1 mil'),
        new GRID('', '0.5 mil', '0.5 mil'),
        new GRID('', '0.2 mil', '0.2 mil'),
        new GRID('', '0.1 mil', '0.1 mil'),
        new GRID('', '5.0 mm', '5.0 mm'),
        new GRID('', '1.5 mm', '2.5 mm'),
        new GRID('', '1.0 mm', '1.0 mm'),
        new GRID('', '0.5 mm', '0.5 mm'),
        new GRID('', '0.25 mm', '0.25 mm'),
        new GRID('', '0.2 mm', '0.2 mm'),
        new GRID('', '0.1 mm', '0.1 mm'),
        new GRID('', '0.05 mm', '0.0 mm'),
        new GRID('', '0.025 mm', '0.0 mm'),
        new GRID('', '0.01 mm', '0.0 mm'),
      ];
    }
    return [
      new GRID('', '1000 mil', '1000 mil'),
      new GRID('', '500 mil', '500 mil'),
      new GRID('', '250 mil', '250 mil'),
      new GRID('', '200 mil', '200 mil'),
      new GRID('', '100 mil', '100 mil'),
      new GRID('', '50 mil', '50 mil'),
      new GRID('', '25 mil', '25 mil'),
      new GRID('', '20 mil', '20 mil'),
      new GRID('', '10 mil', '10 mil'),
      new GRID('', '5 mil', '5 mil'),
      new GRID('', '2 mil', '2 mil'),
      new GRID('', '1 mil', '1 mil'),
      new GRID('', '5.0 mm', '5.0 mm'),
      new GRID('', '2.5 mm', '2.5 mm'),
      new GRID('', '1.0 mm', '1.0 mm'),
      new GRID('', '0.5 mm', '0.5 mm'),
      new GRID('', '0.25 mm', '0.25 mm'),
      new GRID('', '0.2 mm', '0.2 mm'),
      new GRID('', '0.1 mm', '0.1 mm'),
      new GRID('', '0.05 mm', '0.05 mm'),
      new GRID('', '0.025 mm', '0.025 mm'),
      new GRID('', '0.01 mm', '0.01 mm'),
    ];
  }

  /**
   * `ADVANCED_CFG::GetCfg().m_HyperZoom` picks the hyper list; that flag is
   * pending with ADVANCED_CFG, so the plain list it is.
   */
  DefaultZoomList(): number[] {
    if (this.m_filename === 'eeschema' || this.m_filename === 'symbol_editor') {
      return [...ZOOM_LIST_EESCHEMA];
    }
    if (this.m_filename === 'pl_editor') {
      return [...ZOOM_LIST_PL_EDITOR];
    }
    if (this.m_filename === 'gerbview') {
      return [...ZOOM_LIST_GERBVIEW];
    }
    const hyperZoom = false;
    return hyperZoom ? [...ZOOM_LIST_PCBNEW_HYPER] : [...ZOOM_LIST_PCBNEW];
  }

  /**
   * `APP_SETTINGS_BASE::addParamsForWindow`: the window block's PARAM defaults
   * (app_settings.cpp:447-569), applied to the block.
   */
  protected addParamsForWindow(aWindow: WINDOW_SETTINGS): void {
    aWindow.state.maximized = false;
    aWindow.mru_path = '';
    aWindow.state.size_x = 0;
    aWindow.state.size_y = 0;
    aWindow.perspective = '';
    aWindow.state.pos_x = 0;
    aWindow.state.pos_y = 0;
    aWindow.state.display = 0;

    aWindow.zoom_factors = this.DefaultZoomList();

    const grid = aWindow.grid;
    grid.axes_enabled = false;

    let defaultGridIdx: number;

    if (this.m_filename === 'eeschema' || this.m_filename === 'symbol_editor') {
      defaultGridIdx = 1;
    } else if (this.m_filename === 'pl_editor') {
      defaultGridIdx = 4;
    } else {
      defaultGridIdx = 15;
    }

    grid.grids = this.DefaultGridSizeList();
    grid.last_size_idx = defaultGridIdx;
    grid.fast_grid_1 = defaultGridIdx;
    grid.fast_grid_2 = defaultGridIdx + 1;

    // legacy values, leave blank by default so we don't convert them
    grid.user_grid_x = '';
    grid.user_grid_y = '';

    // for grid overrides, give just the schematic and symbol editors sane values
    if (this.m_filename === 'eeschema' || this.m_filename === 'symbol_editor') {
      grid.overrides_enabled = true;
      grid.override_connected = true;
      grid.override_wires = true;
      grid.override_vias = false;
      grid.override_text = true;
      grid.override_graphics = false;

      grid.override_connected_idx = 1;
      grid.override_wires_idx = 1;
      grid.override_vias_idx = 0;
      grid.override_text_idx = 3;
      grid.override_graphics_idx = 2;
    } else {
      grid.overrides_enabled = true;
      grid.override_connected = false;
      grid.override_wires = false;
      grid.override_vias = false;
      grid.override_text = false;
      grid.override_graphics = false;

      grid.override_connected_idx = 16;
      grid.override_text_idx = 18;
      grid.override_wires_idx = 19;
      grid.override_vias_idx = 18;
      grid.override_graphics_idx = 15;
    }

    grid.line_width = 1.0;
    grid.min_spacing = 10;
    grid.show = true;
    grid.style = 0;
    grid.snap = 0;

    aWindow.cursor.always_show_cursor = true;
    aWindow.cursor.cross_hair_mode = CROSS_HAIR_MODE.SMALL_CROSS;
  }
}

/**
 * The slice of an app's JSON settings that holds APP_SETTINGS_BASE's own PARAMs
 * (`app_settings.cpp`: `system.units`, `system.last_*_units`, `window.grid.*`,
 * `window.cursor.*`), as each editor's settings store spells them.
 */
export interface APP_SETTINGS_BASE_JSON {
  system: { units: EdaUnits; last_metric_units: EdaUnits; last_imperial_units: EdaUnits };
  window: {
    grid: {
      sizes: readonly { name: string; x: string; y: string }[];
      last_size_idx: number;
      fast_grid_1: number;
      fast_grid_2: number;
      style: 'dots' | 'lines' | 'crosses';
      line_width: number;
      min_spacing: number;
      snap: number;
      show: boolean;
      overrides_enabled: boolean;
      /**
       * `override_<kind>` and `override_<kind>_idx`, as the stores spell them: the grid by its
       * size rather than its row, which is one of `sizes`. A kind an editor does not offer is
       * absent.
       */
      overrides?: Partial<Record<GRID_OVERRIDE_KIND, { enabled: boolean; size: string }>>;
    };
    cursor: { crosshair: 'small' | 'full' | '45'; always_show_cursor: boolean };
  };
}

/** The override rows of GRID_SETTINGS (`include/settings/grid_settings.h`). */
type GRID_OVERRIDE_KIND = 'connected' | 'wires' | 'vias' | 'text' | 'graphics';

const GRID_OVERRIDE_KINDS: readonly GRID_OVERRIDE_KIND[] = [
  'connected',
  'wires',
  'vias',
  'text',
  'graphics',
];

/** `grid.style`'s stored integers (`common/settings/app_settings.cpp`): 0 dots, 1 lines, 2 crosses. */
const GRID_STYLE_NAMES: readonly APP_SETTINGS_BASE_JSON['window']['grid']['style'][] = [
  'dots',
  'lines',
  'crosses',
];

/** `window.cursor.cross_hair_mode`, as the stores spell it. */
const CROSS_HAIR_MODE_OF: Record<
  APP_SETTINGS_BASE_JSON['window']['cursor']['crosshair'],
  CROSS_HAIR_MODE
> = {
  small: CROSS_HAIR_MODE.SMALL_CROSS,
  full: CROSS_HAIR_MODE.FULLSCREEN_CROSS,
  '45': CROSS_HAIR_MODE.FULLSCREEN_DIAGONAL,
};

/**
 * `JSON_SETTINGS::Load` for APP_SETTINGS_BASE's own PARAMs, from an editor's JSON slice into
 * its settings object: the units, and the window's grid and cursor.
 */
export function loadAppSettingsBase(s: APP_SETTINGS_BASE, json: APP_SETTINGS_BASE_JSON): void {
  s.m_System.units = EdaUnitsToInt(json.system.units);
  s.m_System.last_metric_units = EdaUnitsToInt(json.system.last_metric_units);
  s.m_System.last_imperial_units = EdaUnitsToInt(json.system.last_imperial_units);

  loadWindowSettings(s.m_Window, json.window);
}

/**
 * A window's JSON block as `addParamsForWindow( aWindow, aJsonPath, aDefaultWidth,
 * aDefaultHeight )` (app_settings.cpp) registers it: the grid and cursor, and for a window that
 * carries them, its size.
 */
export type WINDOW_SETTINGS_JSON = APP_SETTINGS_BASE_JSON['window'] & {
  size_x?: number;
  size_y?: number;
};

/** `JSON_SETTINGS::Load` for one `addParamsForWindow` block into its WINDOW_SETTINGS. */
export function loadWindowSettings(aWindow: WINDOW_SETTINGS, aJson: WINDOW_SETTINGS_JSON): void {
  if (aJson.size_x !== undefined) aWindow.state.size_x = aJson.size_x;
  if (aJson.size_y !== undefined) aWindow.state.size_y = aJson.size_y;

  const g = aWindow.grid;
  const jg = aJson.grid;
  g.grids = jg.sizes.map((aEntry) => new GRID(aEntry.name, aEntry.x, aEntry.y));
  g.last_size_idx = jg.last_size_idx;
  g.fast_grid_1 = jg.fast_grid_1;
  g.fast_grid_2 = jg.fast_grid_2;
  g.style = Math.max(0, GRID_STYLE_NAMES.indexOf(jg.style));
  g.line_width = jg.line_width;
  g.min_spacing = jg.min_spacing;
  g.snap = jg.snap;
  g.show = jg.show;
  g.overrides_enabled = jg.overrides_enabled;

  aWindow.cursor.cross_hair_mode = CROSS_HAIR_MODE_OF[aJson.cursor.crosshair];
  aWindow.cursor.always_show_cursor = aJson.cursor.always_show_cursor;
}

/**
 * `JSON_SETTINGS::Store` for the same PARAMs: what a frame or a tool changed in the object - the
 * units, the current and fast grids, the grid's display, the cursor - back into the slice.
 * Whether anything moved.
 */
export function storeAppSettingsBase(s: APP_SETTINGS_BASE, json: APP_SETTINGS_BASE_JSON): boolean {
  let changed = false;
  const set = <T extends object, K extends keyof T>(aObj: T, aKey: K, aValue: T[K]): void => {
    if (aObj[aKey] !== aValue) {
      aObj[aKey] = aValue;
      changed = true;
    }
  };

  set(json.system, 'units', EdaUnitsFromInt(s.m_System.units));
  set(json.system, 'last_metric_units', EdaUnitsFromInt(s.m_System.last_metric_units));
  set(json.system, 'last_imperial_units', EdaUnitsFromInt(s.m_System.last_imperial_units));

  if (storeWindowSettings(s.m_Window, json.window)) changed = true;

  return changed;
}

/**
 * `JSON_SETTINGS::Store` for one `addParamsForWindow` block: the current and fast grids, the
 * grid's display, the cursor, and the size where the block carries one. Whether anything moved.
 */
export function storeWindowSettings(
  aWindow: WINDOW_SETTINGS,
  aJson: WINDOW_SETTINGS_JSON,
): boolean {
  let changed = false;
  const set = <T extends object, K extends keyof T>(aObj: T, aKey: K, aValue: T[K]): void => {
    if (aObj[aKey] !== aValue) {
      aObj[aKey] = aValue;
      changed = true;
    }
  };

  if (aJson.size_x !== undefined) set(aJson, 'size_x', aWindow.state.size_x);
  if (aJson.size_y !== undefined) set(aJson, 'size_y', aWindow.state.size_y);

  const g = aWindow.grid;
  const jg = aJson.grid;
  set(jg, 'last_size_idx', g.last_size_idx);
  set(jg, 'fast_grid_1', g.fast_grid_1);
  set(jg, 'fast_grid_2', g.fast_grid_2);
  set(jg, 'style', GRID_STYLE_NAMES[g.style] ?? jg.style);
  set(jg, 'line_width', g.line_width);
  set(jg, 'min_spacing', g.min_spacing);
  set(jg, 'snap', g.snap as typeof jg.snap);
  set(jg, 'show', g.show);
  set(jg, 'overrides_enabled', g.overrides_enabled);

  const crosshair = (Object.keys(CROSS_HAIR_MODE_OF) as (keyof typeof CROSS_HAIR_MODE_OF)[]).find(
    (k) => CROSS_HAIR_MODE_OF[k] === aWindow.cursor.cross_hair_mode,
  );

  if (crosshair) set(aJson.cursor, 'crosshair', crosshair);

  set(aJson.cursor, 'always_show_cursor', aWindow.cursor.always_show_cursor);

  return changed;
}

/**
 * `window.grid.override_<kind>` / `override_<kind>_idx` from a slice's `overrides` rows: the
 * enable as it is, the size as its row in `sizes`. Kept apart from loadAppSettingsBase while
 * EESCHEMA_DEFAULTS holds the wrong defaults for its rows (all off, text at 25 mil, against
 * app_settings.cpp:381-394's connected, wires and text on): the schematic's settings object
 * keeps the C++ defaults until that is fixed.
 */
export function loadGridOverrides(s: APP_SETTINGS_BASE, json: APP_SETTINGS_BASE_JSON): void {
  const g = s.m_Window.grid;
  const jg = json.window.grid;

  for (const kind of GRID_OVERRIDE_KINDS) {
    const ov = jg.overrides?.[kind];

    if (!ov) continue;

    g[`override_${kind}`] = ov.enabled;
    const idx = jg.sizes.findIndex((aEntry) => aEntry.x === ov.size);

    if (idx >= 0) g[`override_${kind}_idx`] = idx;
  }
}

/** The store half of {@link loadGridOverrides}. Whether anything moved. */
export function storeGridOverrides(s: APP_SETTINGS_BASE, json: APP_SETTINGS_BASE_JSON): boolean {
  const g = s.m_Window.grid;
  const jg = json.window.grid;
  let changed = false;

  for (const kind of GRID_OVERRIDE_KINDS) {
    const ov = jg.overrides?.[kind];

    if (!ov) continue;

    if (ov.enabled !== g[`override_${kind}`]) {
      ov.enabled = g[`override_${kind}`];
      changed = true;
    }

    const size = jg.sizes[g[`override_${kind}_idx`]]?.x;

    if (size !== undefined && ov.size !== size) {
      ov.size = size;
      changed = true;
    }
  }

  return changed;
}
