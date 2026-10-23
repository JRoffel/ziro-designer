// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Preferences > Symbol Editor > Grids, and the reader that makes it mean
 * anything.
 *
 * The page itself is the shared `PANEL_GRID_SETTINGS` — one class upstream,
 * one component here — so what is worth asserting is not the widgets a third
 * editor draws for the third time. It is the two things that were actually
 * wrong:
 *
 *  1. `symbol_editor.json` did not exist here at all. The Symbol Editor read
 *     `eeschema.json`'s cursor and grid style, which is a settings file
 *     upstream never hands `SYMBOL_EDIT_FRAME`
 *     (`GetAppSettings<SYMBOL_EDITOR_SETTINGS>( "symbol_editor" )`,
 *     `eeschema/eeschema.cpp:252`).
 *  2. Nothing read the grid. The frame snapped, drew and reported on the
 *     module constant `GRID` in `render/symbolRenderer.ts`, so a Grids page
 *     could have shipped storing a value with no effect whatever — the shape
 *     of defect this suite exists to catch.
 *
 * The defaults below are checked against `~/.config/kicad/10.0/symbol_editor.json`
 * as the installed 10.0.5 writes it, not against `app_settings.cpp` read twice:
 * the parity target is the installed build, and that file is its own answer.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { gridSizeToIU } from '@ziroeda/eeschema/eeschema_settings.js';
import {
  SYMBOL_EDITOR_DEFAULTS,
  type SymbolEditorSettings,
} from '@ziroeda/eeschema/symbol_editor/symbol_editor_settings.js';
import { DEFAULT_GRID_INDEX, GRID_SIZE_LIST } from '@ziroeda/common/settings/grid_settings_ui.js';
import { OVERRIDE_ROWS } from '@ziroeda/common/dialogs/panel_grid_settings.js';

const SRC = fileURLToPath(new URL('../../../designer/src', import.meta.url));
const read = (rel: string): string => readFileSync(join(SRC, rel), 'utf8');

const cfg = (): SymbolEditorSettings => structuredClone(SYMBOL_EDITOR_DEFAULTS);

// --------------------------------------------------------------- the settings file

describe('symbol_editor.json', () => {
  it('opens on 50 mil, which is defaultGridIdx 1 and not pcbnew’s 15', () => {
    // `common/settings/app_settings.cpp:463-466` names `symbol_editor`
    // alongside `eeschema` in the branch that sets `defaultGridIdx = 1`, and
    // the installed build's file agrees: `"last_size": 1`.
    expect(SYMBOL_EDITOR_DEFAULTS.window.grid.last_size_idx).toBe(1);
    const def = SYMBOL_EDITOR_DEFAULTS.window.grid;
    expect(gridSizeToIU(def.sizes[def.last_size_idx]!.x)).toBe(gridSizeToIU('50 mil'));
    // 50 mil in eeschema IU (100 nm), which is what `symbolRenderer.ts`'
    // `GRID = 1.27 * MM` was: a fresh profile snaps where it always did.
    expect(gridSizeToIU('50 mil')).toBe(12700);
  });

  it('carries DefaultGridSizeList()’s symbol_editor row, asked not restated', () => {
    expect(SYMBOL_EDITOR_DEFAULTS.window.grid.sizes.map((g) => g.x)).toEqual(
      GRID_SIZE_LIST.symbol_editor.map((g) => g.x),
    );
    expect(SYMBOL_EDITOR_DEFAULTS.window.grid.fast_grid_1).toBe(DEFAULT_GRID_INDEX.symbol_editor);
    expect(SYMBOL_EDITOR_DEFAULTS.window.grid.fast_grid_2).toBe(
      DEFAULT_GRID_INDEX.symbol_editor + 1,
    );
  });

  it('has the four overrides the installed build writes, at its own indices', () => {
    // `~/.config/kicad/10.0/symbol_editor.json`, verbatim:
    //   override_connected true  / _idx 1  -> 50 mil
    //   override_wires     true  / _idx 1  -> 50 mil
    //   override_text      true  / _idx 3  -> 10 mil
    //   override_graphics  false / _idx 2  -> 25 mil
    // The indices are into the four-entry list above, so they are spelled here
    // as the sizes they name — ours store the string, not the index.
    const o = SYMBOL_EDITOR_DEFAULTS.window.grid.overrides;
    expect(o.connected).toEqual({ enabled: true, size: '50 mil' });
    expect(o.wires).toEqual({ enabled: true, size: '50 mil' });
    expect(o.text).toEqual({ enabled: true, size: '10 mil' });
    expect(o.graphics).toEqual({ enabled: false, size: '25 mil' });
    expect(SYMBOL_EDITOR_DEFAULTS.window.grid.overrides_enabled).toBe(true);
  });

  it('is its own file, not a slice of eeschema’s', () => {
    // The mistake this replaces: the canvas read `settings.eeschema.window.*`,
    // which made every control on the Symbol Editor's Display Options page a
    // second set of switches over the SCHEMATIC's file. The live frame's
    // config() is SYMBOL_EDITOR_SETTINGS, loaded from symbol_editor.json
    // (eeschema/symbol_edit_frame_grid_live.test.ts drives it).
    const frame = read('../../eeschema/symbol_editor/symbol_edit_frame_ui.tsx');
    expect(frame).not.toContain('settings.eeschema');
    expect(read('../../eeschema/symbol_editor/symbol_edit_frame.ts')).toContain(
      'return symbolEditorKifaceSettings();',
    );
  });
});

// ------------------------------------------------------------------- the reader
//
// Which grid the frame is on, and which an item snaps to, are COMMON_TOOLS' and
// EE_GRID_HELPER::GetItemGrid's - the machinery every GAL frame shares, pinned in
// common/common_tools.test.ts and eeschema/ee_grid_helper.test.ts - fed from this
// file by the frame's settings object (eeschema/symbol_edit_frame_grid_live.test.ts).

describe('the page is the shared panel, constructed for this frame', () => {
  const PAGE = 'editors/symbol/prefs/PanelSymbolEditorGrids.tsx';

  it('calls common/dialogs/panel_grid_settings rather than copying it', () => {
    // The rule this editor's Grids page exists to obey: KiCad writes
    // `PANEL_GRID_SETTINGS` once in `common/` and every KIFACE constructs the
    // same type. A second copy here is the defect, not a style choice.
    const src = read(PAGE);
    expect(src).toContain("from '@ziroeda/common/dialogs/panel_grid_settings.js'");
    expect(src).toContain('frameType="FRAME_SCH_SYMBOL_EDITOR"');
    // It must not restate the panel: no listbox, no override rows of its own.
    expect(src).not.toContain('ze-gridlist');
    // Nor may it reach the per-frame row table: which overrides this frame
    // shows is the shared panel's business, keyed on the `frameType` above.
    expect(src).not.toContain("from '../../../dialogs/prefs/grid_settings_rows.js'");
  });

  it('writes symbol_editor.json and not the schematic’s', () => {
    const src = read(PAGE);
    expect(src).toContain('symbolEditor.window.grid');
    expect(src).not.toContain('ctx.eeschema');
  });
});
