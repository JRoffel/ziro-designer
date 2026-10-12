// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The Footprint Editor's nine Preferences pages, **rendered**.
 *
 * The same argument `ds_prefs_pages.test.tsx` makes: a page can be in `PAGES`,
 * have a factory case, own a reset slice and be built from a correct table, and
 * still never appear — a bad dynamic import, a panel that throws, a page id the
 * shell cannot resolve. This opens the dialog on each one and reads what came
 * out.
 *
 * Two things here that the drawing sheet's file has no equivalent of, and both
 * are where this heading's parity actually lives:
 *
 *  - the pages that are the SAME upstream class as the PCB Editor's, shown in
 *    their footprint-editor form: Display Options with an empty simplebook
 *    page, Origins & Axes with the Display Origin group hidden, Editing Options
 *    with the board half hidden and Magnetic Points as two checkboxes;
 *  - the three pages that are this editor's own and are grids.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PreferencesDialog } from '@ziroeda/designer/src/dialogs/PreferencesDialog.js';
import { resetPrefsPanelCache } from '@ziroeda/designer/src/dialogs/prefs/lazy_pages.js';
import { GAL_GROUP_TITLES } from '@ziroeda/common/dialogs/panel_gal_options.js';
import { OVERRIDE_ROWS } from '@ziroeda/common/dialogs/panel_grid_settings.js';
import { shippedUnder } from '@ziroeda/designer/src/dialogs/prefs/registry.js';
import { FPEDIT_DEFAULTS } from '@ziroeda/designer/src/prefs/settings.js';
import { fpColorRows } from '@ziroeda/pcbnew/dialogs/panel_fp_editor_color_settings.js';
import { GRAPHICS_ROWS } from '@ziroeda/pcbnew/footprint_editor_settings.js';

afterEach(() => {
  cleanup();
  resetPrefsPanelCache();
});

type FpPage =
  | 'fp-display'
  | 'fp-grids'
  | 'fp-origins'
  | 'fp-editing'
  | 'fp-colors'
  | 'fp-toolbars'
  | 'fp-defaults'
  | 'fp-graphics'
  | 'fp-userlayers';

/**
 * Something only that page renders, to wait on. Each is a control the page
 * would not have if the wrong panel came back, so waiting on it is also a check
 * that the id resolved to the right module.
 */
const ANCHOR: Record<FpPage, string> = {
  'fp-display': 'Clearance Outlines',
  'fp-grids': 'Fast Grid Switching',
  'fp-origins': 'X Axis',
  'fp-editing': 'Magnetic graphics',
  // `PANEL_COLOR_SETTINGS`' own control is labelled "Theme:" — "Color theme:"
  // is `PANEL_SYM_COLOR_SETTINGS`/`PANEL_PL_EDITOR_COLOR_SETTINGS`, which are
  // a theme choice and no swatch grid.
  'fp-colors': 'Theme:',
  'fp-toolbars': 'Custom Toolbars',
  'fp-defaults': 'Default Text Items for New Footprints',
  'fp-graphics': 'Default Properties for New Graphic Items',
  'fp-userlayers': 'User layers:',
};

/**
 * Open Preferences on a page and wait for its lazily-imported panel.
 *
 * The budget is `ds_prefs_pages.test.tsx`' argument with bigger numbers: the
 * FIRST open in a run compiles the whole lazily imported chain — the dialog,
 * the registry, this editor's factory and every panel it names — and later ones
 * take tens of milliseconds. Measured here at ~9 s for the first and ~40 ms
 * after, on a machine with another build running. A tight budget would be a
 * wall-clock assertion on vitest's transform rather than on anything this file
 * tests, and `SLOW` has to clear it or vitest's own per-test default cuts in
 * first — which is what made `ds_prefs_pages.test.tsx`' 15 s findBy budget
 * unreachable behind a 5 s test.
 */
async function openPage(id: FpPage): Promise<void> {
  render(<PreferencesDialog onClose={() => {}} initialPage={id} />);
  await screen.findByText(ANCHOR[id], { exact: false }, { timeout: 30000 });
}

const panelText = (): string =>
  document.querySelector('.ze-prefs-panel')?.textContent?.replace(/\s+/g, ' ') ?? '';

/** The panel's text as the user sees it: a wxSimplebook's hidden pages left out. */
const shownText = (): string => {
  const panel = document.querySelector('.ze-prefs-panel')!.cloneNode(true) as HTMLElement;
  for (const hidden of panel.querySelectorAll('[data-hide]')) hidden.remove();
  return panel.textContent?.replace(/\s+/g, ' ') ?? '';
};

/** The labels a `Combo` offers — see the note in `ds_prefs_pages.test.tsx`. */
const comboOptions = (root: ParentNode = document): string[] =>
  Array.from(root.querySelectorAll('.ze-combo-ghost')).map((o) => o.textContent ?? '');

/** A Graphics Defaults grid cell, by row label and column. */
const gfxCell = (rowLabel: string, col: number): HTMLElement => {
  const row = GRAPHICS_ROWS.findIndex((r) => r.label === rowLabel);
  const cell = document.querySelector<HTMLElement>(
    `table[aria-label="Default properties for new graphic items"] tbody tr:nth-child(${row + 1}) td[data-col="${col}"]`,
  );
  if (!cell) throw new Error(`no cell ${rowLabel}/${col}`);
  return cell;
};

/** Click a grid cell open (mouse-up opens the editor) and type into its editor. */
const typeInCell = (cell: HTMLElement, text: string): void => {
  fireEvent.mouseDown(cell, { button: 0 });
  fireEvent.mouseUp(cell);
  const input = cell.querySelector('input');
  if (!input) throw new Error('no editor opened');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
};

/** The auto-eval re-format runs after the edit is applied (`CallAfter`). */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** vitest's own per-test budget, which has to clear `openPage`'s. */
const SLOW = 60000;

describe('the heading is complete', () => {
  it('ships all nine rows `ShowPreferences` adds', () => {
    // `common/eda_base_frame.cpp:1667-1675`, in source order.
    expect(shippedUnder('Footprint Editor')).toEqual([
      'Display Options',
      'Grids',
      'Origins & Axes',
      'Editing Options',
      'Colors',
      'Toolbars',
      'Footprint Defaults',
      'Graphics Defaults',
      'User Layer Names',
    ]);
  });
});

describe('Footprint Editor > Display Options', () => {
  it(
    'is the GAL panel plus the two groups outside the simplebook',
    async () => {
      await openPage('fp-display');
      const text = panelText();
      // `m_galOptionsSizer`, always present.
      for (const title of GAL_GROUP_TITLES) expect(text).toContain(title);
      // `bSizerPads`, which lives in `bSizer11` and so is drawn by BOTH frames.
      expect(text).toContain('Pads');
      expect(text).toContain('Use via color for normal through hole padstacks');
      expect(text).toContain('Clearance Outlines');
      expect(text).toContain('Show pad clearance');
    },
    SLOW,
  );

  it(
    'draws NOTHING from the simplebook: this frame gets the empty page',
    async () => {
      await openPage('fp-display');
      // The wxSimplebook keeps page 1, hidden; what the user sees is the panel without it.
      const shown = document.querySelector('.ze-prefs-panel')!.cloneNode(true) as HTMLElement;
      for (const hidden of shown.querySelectorAll('[data-hide]')) hidden.remove();
      const text = shown.textContent ?? '';
      // `m_optionsBook->SetSelection( m_isPCBEdit ? 1 : 0 )` and page 0 is a
      // bare `wxPanel` (`panel_display_options_base.cpp:88-97`). Every string
      // below is on page 1 and must not appear here.
      for (const pcbOnly of [
        'Annotations',
        'Net names:',
        'Show pad numbers',
        'Selection && Highlighting',
        'Cross-probing',
        'Refresh 3D view automatically',
      ]) {
        expect(text, `${pcbOnly} is on the PCB page of the book`).not.toContain(pcbOnly);
      }
    },
    SLOW,
  );
});

describe('Footprint Editor > Grids', () => {
  it(
    'lists this editor’s grids, from the settings and not from the unit',
    async () => {
      await openPage('fp-grids');
      const text = panelText();
      expect(text).toContain('Grids');
      expect(text).toContain('Fast Grid Switching');
      // `defaultGridIdx` 15 for `fpedit` — `0.5 mm`, printed at pcbnew's
      // precision with the imperial pair in brackets.
      expect(text).toContain('0.5000 mm');
    },
    SLOW,
  );

  it(
    'shows exactly the override rows FRAME_FOOTPRINT_EDITOR shows',
    async () => {
      await openPage('fp-grids');
      const text = panelText();
      for (const [, label] of OVERRIDE_ROWS.FRAME_FOOTPRINT_EDITOR) expect(text).toContain(label);
      // `m_checkGridOverrideVias->Show( false )` outside pcbnew, and connected
      // and wires are hidden outside the schematic frames — connected being
      // re-shown as "Pads:" is why that row IS here under another name.
      expect(text).not.toContain('Vias:');
      expect(text).not.toContain('Tracks:');
      expect(text).not.toContain('Connected items:');
    },
    SLOW,
  );
});

describe('Footprint Editor > Origins & Axes', () => {
  it(
    'is X Axis and Y Axis, with the Display Origin group hidden',
    async () => {
      await openPage('fp-origins');
      const text = panelText();
      expect(text).toContain('X Axis');
      expect(text).toContain('Increases right');
      expect(text).toContain('Increases left');
      expect(text).toContain('Y Axis');
      expect(text).toContain('Increases up');
      expect(text).toContain('Increases down');
      // `m_displayOrigin->Show( m_frameType == FRAME_PCB_EDITOR )`
      // (`panel_pcbnew_display_origin.cpp:37`) — the heading and all three
      // radios go with it.
      expect(text).not.toContain('Display Origin');
      expect(text).not.toContain('Page origin');
      expect(text).not.toContain('Drill/place file origin');
      expect(text).not.toContain('Grid origin');
    },
    SLOW,
  );
});

describe('Footprint Editor > Editing Options', () => {
  it(
    'shows the universal group and the footprint page of the book',
    async () => {
      await openPage('fp-editing');
      const text = panelText();
      expect(text).toContain('Constrain actions to H, V, 45 degrees');
      expect(text).toContain('Step for rotate commands:');
      expect(text).toContain('Arc editing mode:');
      // The book's page 0.
      expect(text).toContain('Magnetic Points');
      expect(text).toContain('Magnetic pads');
      expect(text).toContain('Magnetic graphics');
      // `m_stHint1` and its table.
      expect(text).toContain('Left Click Mouse Commands');
      expect(text).toContain('Clarify selection from menu');
    },
    SLOW,
  );

  it(
    'labels the rotation entry with UNIT_BINDER’s degree sign, next to the entry',
    async () => {
      await openPage('fp-editing');
      // `m_rotationAngle` is a UNIT_BINDER on `EDA_UNITS::DEGREES`
      // (`panel_edit_options.cpp:38-45`), and `SetUnits` writes
      // `EDA_UNIT_UTILS::GetLabel( DEGREES )` -- `°` (`eda_units.cpp:153`) --
      // over the `_("deg")` wxFormBuilder put in `_base.cpp:49`.
      // bSizerRotationStep, a wxBoxSizer: the label, the entry, its units label, side by side.
      const entry = screen.getByRole('textbox', { name: 'Step for rotate commands' });
      const units = entry.closest('.ze-szi')!.nextElementSibling;
      expect(units?.textContent).toBe('°');
    },
    SLOW,
  );

  it(
    'stacks the arc-mode label above a full-width choice',
    async () => {
      await openPage('fp-editing');
      // `Add( m_arcEditModeLabel, 0, wxLEFT, 5 )`, a `(0, 3)` spacer, then
      // `Add( m_arcEditMode, 0, wxEXPAND|wxBOTTOM|wxRIGHT|wxLEFT, 5 )`
      // (`panel_edit_options_base.cpp:59-71`) -- two Add()s of a VERTICAL
      // sizer, so the choice is as wide as the column and not a cell beside
      // the label.
      const choice = screen.getByLabelText('Arc editing mode');
      const box = choice.closest('.ze-combo') as HTMLElement;
      // The label is its own Add() above, not a cell beside the choice.
      const choiceItem = choice.closest('.ze-szi')!;
      expect(choiceItem.previousElementSibling?.previousElementSibling?.textContent).toBe(
        'Arc editing mode:',
      );
      // Every choice upstream offers, in upstream's order.
      expect(comboOptions(box)).toEqual([
        'Keep center, adjust radius',
        'Keep endpoints or direction of starting point',
        'Keep center and radius, adjust endpoints',
      ]);
    },
    SLOW,
  );

  it(
    'hides the board half and the Ctrl row’s second radio',
    async () => {
      await openPage('fp-editing');
      const text = shownText();
      // `m_sizerBoardEdit->Show( !m_isFootprintEditor )`
      // (`panel_edit_options.cpp:43`).
      for (const boardOnly of [
        'Track mouse-drag mode:',
        'Flip board items:',
        'Allow free pads',
        'Ratsnest',
        'Automatically refill zones',
        'Snap to pads:',
      ]) {
        expect(text, `${boardOnly} is in m_sizerBoardEdit or the PCB book page`).not.toContain(
          boardOnly,
        );
      }
      // `m_rbHighlightNet->Show( false )` for this frame (`:65-68`), with
      // `m_rbToggleSel` forced on.
      expect(text).toContain('Toggle selection');
      expect(text).not.toContain('Highlight net');
    },
    SLOW,
  );
});

describe('Footprint Editor > Colors', () => {
  it(
    'draws the swatch grid in createSwatches’ order',
    async () => {
      await openPage('fp-colors');
      const text = panelText();
      // The three copper rows come first, before the sorted GAL run.
      const rows = fpColorRows();
      expect(rows.slice(0, 3).map((r) => r.name)).toEqual(['F.Cu', 'Internal Layers', 'B.Cu']);
      for (const r of rows) expect(text).toContain(r.name);
      // `m_optOverrideColors->Hide()` — absent, not greyed.
      expect(text).not.toContain('Override individual item colors');
    },
    SLOW,
  );

  it(
    'excludes the five via and pad-hole layers m_validLayers skips',
    async () => {
      await openPage('fp-colors');
      const text = panelText();
      for (const gone of ['Via holes', 'Via hole walls', 'Plated holes', 'Plated hole walls']) {
        expect(text, `${gone} is one of the five m_validLayers skips`).not.toContain(gone);
      }
      // ...but "Non-plated holes" IS in the list: `board.plated_hole` is
      // LAYER_NON_PLATEDHOLES, which is not one of the five.
      expect(text).toContain('Non-plated holes');
    },
    SLOW,
  );
});

describe('Footprint Editor > Footprint Defaults', () => {
  it(
    'splits the one text-item list into two grids by position',
    async () => {
      await openPage('fp-defaults');
      const text = panelText();
      expect(text).toContain('Default Field Properties for New Footprints');
      expect(text).toContain('Reference designator');
      expect(text).toContain('Default Text Items for New Footprints');
      // The upper grid has a Show column and the lower does not, because
      // everything past index 1 is written back visible.
      expect(text).toContain('Show');
      expect(text).toContain('Text Items');
    },
    SLOW,
  );

  it(
    'seeds the fields from the settings, not from a constant',
    async () => {
      await openPage('fp-defaults');
      const [ref, value] = FPEDIT_DEFAULTS.design_settings.default_footprint_text_items;
      const values = Array.from(
        document.querySelectorAll(
          'table[aria-label="Default field properties"] tbody td[data-col="0"]',
        ),
      ).map((c) => c.textContent);
      expect(values[0]).toBe(ref?.text);
      expect(values[1]).toBe(value?.text);
      // The third default item — `${REFERENCE}` on F.Fab — is the lower grid's
      // one row on a fresh install.
      const items = Array.from(
        document.querySelectorAll('table[aria-label="Default text items"] tbody td[data-col="0"]'),
      ).map((c) => c.textContent);
      expect(items).toEqual(
        FPEDIT_DEFAULTS.design_settings.default_footprint_text_items.slice(2).map((t) => t.text),
      );
    },
    SLOW,
  );

  it(
    'puts every layer in the cell, not the ones a footprint board has',
    async () => {
      await openPage('fp-defaults');
      // `GRID_CELL_LAYER_SELECTOR( nullptr, {} )` — a null frame, so
      // `getEnabledLayers()` is `LSET::AllLayersMask()` and `UIOrder()` yields
      // 95 rows. See `fp_layer_choices.test.ts` for the list itself; this is
      // the assertion that the PAGE reaches it.
      const cell = document.querySelector(
        'table[aria-label="Default field properties"] tbody td[data-col="2"]',
      );
      expect(cell).not.toBeNull();
      // A click opens the cell's editor, and the layer box is that editor.
      fireEvent.mouseDown(cell!, { button: 0 });
      fireEvent.mouseUp(cell!);
      const offered = comboOptions(cell ?? document);
      expect(offered).toHaveLength(95);
      expect(offered[0]).toBe('F.Cu');
      expect(offered.at(-1)).toBe('User.45');
      // The renamed ones are shown by `LayerName`, stored by `LSET::Name`.
      expect(offered).toContain('F.Silkscreen');
      expect(offered).not.toContain('F.SilkS');
    },
    SLOW,
  );

  it('is two grids whose columns stop at 610 px, not two that fill the dialog', async () => {
    // `SetColSize` 240/60/150 with `SetRowLabelSize( 160 )`, and 460/150, every width stated and
    // held (WxGridView fixedColumns), so both grids' columns stop at 610 and the filler takes the
    // rest.
    await openPage('fp-defaults');
    const widths = (aName: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(`table[aria-label="${aName}"] thead th`))
        .filter((h) => !h.classList.contains('ze-grid-filler'))
        .map((h) => h.style.width);
    expect(widths('Default field properties')).toEqual(['160px', '240px', '60px', '150px']);
    expect(widths('Default text items')).toEqual(['460px', '150px']);
    for (const name of ['Default field properties', 'Default text items'])
      expect(
        document.querySelector(`table[aria-label="${name}"]`)!.classList.contains('ze-grid-fixed'),
      ).toBe(true);
  });
});

describe('Footprint Editor > Graphics Defaults', () => {
  it(
    'is the six layer classes and the shared dimensions panel',
    async () => {
      await openPage('fp-graphics');
      const text = panelText();
      for (const r of GRAPHICS_ROWS) expect(text).toContain(r.label);
      for (const col of ['Line Thickness', 'Text Width', 'Text Height', 'Text Thickness', 'Italic'])
        expect(text).toContain(col);
      // `PANEL_SETUP_DIMENSIONS`, added to this panel's own sizer.
      expect(text).toContain('Default Properties for New Dimension Objects');
      expect(text).toContain('Extension line offset:');
    },
    SLOW,
  );

  it(
    'has no Keep Upright column — that one is Board Setup’s',
    async () => {
      await openPage('fp-graphics');
      // `PANEL_SETUP_TEXT_AND_GRAPHICS` has six columns and this one five
      // (`panel_fp_editor_graphics_defaults_base.cpp:28`, `CreateGrid( 6, 5 )`).
      expect(panelText()).not.toContain('Keep Upright');
      const headers = Array.from(
        document.querySelectorAll(
          'table[aria-label="Default properties for new graphic items"] thead th',
        ),
      ).filter((h) => h.className !== 'ze-grid-filler');
      // Five columns plus the row-label column.
      expect(headers).toHaveLength(6);
    },
    SLOW,
  );

  it(
    'puts the unit IN the cell, as WX_GRID::SetUnitValue does',
    async () => {
      await openPage('fp-graphics');
      // `SetCellValue( row, col, StringFromValue( value, true ) )`
      // (`common/widgets/wx_grid.cpp:970-980`) — so a live footprint editor
      // reads "0.1 mm", and its column headers carry no "(mm)" of their own.
      const cell = (row: string, col: number): string => gfxCell(row, col).textContent ?? '';
      expect(cell('Silk Layers', 0)).toBe('0.1 mm');
      expect(cell('Copper Layers', 1)).toBe('1.5 mm');
      expect(cell('Copper Layers', 3)).toBe('0.3 mm');
      expect(cell('Edge Cuts', 0)).toBe('0.05 mm');
      // The header states the quantity, never the unit.
      const headers = Array.from(
        document.querySelectorAll(
          'table[aria-label="Default properties for new graphic items"] thead th',
        ),
      ).map((h) => h.textContent ?? '');
      expect(headers).not.toContain('Line Thickness (mm)');
      for (const h of headers) expect(h).not.toMatch(/mm|mils|\bin\b/);
    },
    SLOW,
  );

  it(
    'commits a cell when its editor closes, and takes a typed unit designator',
    async () => {
      await openPage('fp-graphics');
      const cell = gfxCell('Fab Layers', 2);
      // A wxGrid editor holds its own text until it loses the cell; nothing is
      // reformatted under the caret while it is open.
      typeInCell(cell, '40 mils');
      await settle();
      // `ValueFromString` reads the trailing designator, so 40 mils is 1.016 mm
      // and the cell comes back in the frame's own unit.
      expect(gfxCell('Fab Layers', 2).textContent).toBe('1.016 mm');
    },
    SLOW,
  );

  it(
    'refuses a line width outside KiCad’s limits and says so beside the grid',
    async () => {
      await openPage('fp-graphics');
      typeInCell(gfxCell('Silk Layers', 0), '0.001');
      await settle();
      // `TransferDataFromWindow`'s KIDIALOG. The value is NOT applied and the
      // bad value stays in the cell for the user to correct - re-formatted in
      // the frame's unit by `WX_GRID::onCellEditorHidden`, as every auto-eval
      // cell is.
      await waitFor(() => expect(gfxCell('Silk Layers', 0).textContent).toBe('0.001 mm'));
      expect(document.querySelector('.ze-prefs-error')?.textContent).toContain(
        'Silk Layers: Incorrect line width.',
      );
    },
    SLOW,
  );

  it(
    'truncates a text thickness thicker than a quarter of the text size',
    async () => {
      await openPage('fp-graphics');
      // Silk text is 1 mm, so the ceiling is 0.25 mm. This one is CLAMPED
      // rather than refused, and the cell is rewritten with the truncation.
      typeInCell(gfxCell('Silk Layers', 3), '0.6');
      await settle();
      await waitFor(() => expect(gfxCell('Silk Layers', 3).textContent).toBe('0.25 mm'));
      expect(document.querySelector('.ze-prefs-error')?.textContent).toContain(
        'It will be truncated to 0.25 mm',
      );
    },
    SLOW,
  );

  it(
    'blanks the four text cells of Edge Cuts and Courtyards',
    async () => {
      await openPage('fp-graphics');
      const rows = Array.from(
        document.querySelectorAll(
          'table[aria-label="Default properties for new graphic items"] tbody tr',
        ),
      );
      for (const [i, r] of GRAPHICS_ROWS.entries()) {
        const cells = Array.from(rows[i]?.querySelectorAll<HTMLElement>('td[data-col]') ?? []);
        // Column 0 is the line width, which every row has.
        expect(cells[0]?.textContent).toMatch(/mm$/);
        // `disableCell`: painted wxSYS_COLOUR_FRAMEBK, the label colour.
        const disabled = cells
          .slice(1)
          .filter((c) => c.style.background.includes('--grid-label-bg'));
        expect(disabled, `${r.label}`).toHaveLength(r.text ? 0 : 4);
      }
    },
    SLOW,
  );

  it('floors its columns at the stated widths and gives the slack to the filler', async () => {
    // `SetRowLabelSize( 125 )` and `SetColSize` 110/100/100/100/60
    // (`panel_fp_editor_graphics_defaults_base.cpp:45-49, 68`), each of them a
    // FLOOR because `loadFPSettings` re-measures with `GetVisibleWidth( col,
    // true, true, aKeep = true )`. [px] the live editor's gridlines fall at
    // 776 / 887 / 987 / 1087 / 1193 / 1253 — 125 then 110/100/100/105/59, with
    // only Text Thickness widened, by its own header.
    const css = readFileSync(resolve(process.cwd(), '../common/widgets/shell.css'), 'utf8');
    const rule = (selector: string): string => {
      for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g))
        if ((m[1] ?? '').split(',').some((sel) => sel.trim() === selector)) return m[2] ?? '';
      return '';
    };
    // The grid's own SetRowLabelSize / SetColSize, stated on the label cells: a table cell's
    // width is a floor, the aKeep = true that loadFPSettings asks for.
    await openPage('fp-graphics');
    const heads = Array.from(
      document.querySelectorAll<HTMLElement>(
        'table[aria-label="Default properties for new graphic items"] thead th',
      ),
    ).filter((h) => !h.classList.contains('ze-grid-filler'));
    expect(heads.map((h) => h.style.width)).toEqual([
      '125px',
      '110px',
      '100px',
      '100px',
      '100px',
      '60px',
    ]);
    // The strip past the last column: it takes the slack so the real columns
    // do not, and it is NOT painted by a selected row.
    expect(rule('.ze-grid th.ze-grid-filler')).toMatch(/width:\s*100%/);
    expect(rule('.ze-grid tr.selected td.ze-grid-filler')).toMatch(
      /background:\s*var\(--grid-cell-bg\)/,
    );
    // `WX_GRID::DrawColLabel`'s `if( col == 0 ) hAlign = wxALIGN_LEFT` is
    // stated once, on the shared class, and keyed off the corner cell so a
    // grid with a row-label gutter gets it on the right header.
    expect(rule('.ze-grid th.ze-grid-corner + th')).toMatch(/text-align:\s*left/);
  });

  it(
    'gives the slack to a filler cell rather than to a column',
    async () => {
      await openPage('fp-graphics');
      const head = Array.from(
        document.querySelectorAll(
          'table[aria-label="Default properties for new graphic items"] thead th',
        ),
      );
      expect(head.at(-1)?.className).toBe('ze-grid-filler');
      for (const tr of document.querySelectorAll(
        'table[aria-label="Default properties for new graphic items"] tbody tr',
      ))
        expect(tr.lastElementChild?.className).toBe('ze-grid-filler');
    },
    SLOW,
  );

  it(
    'draws the wxStaticLine this heading has and the other two do not',
    async () => {
      await openPage('fp-graphics');
      // `m_staticline1` (`panel_fp_editor_graphics_defaults_base.cpp:31`).
      // Footprint Defaults' and User Layer Names' headings have none, which is
      // what `.ze-fp-defaults-title` is for.
      expect(screen.getByText('Default Properties for New Graphic Items')).toBeTruthy();
      // This heading's line and the embedded PANEL_SETUP_DIMENSIONS' own.
      expect(document.querySelectorAll('.ze-staticline')).toHaveLength(2);
    },
    SLOW,
  );
});

describe('Footprint Editor > User Layer Names', () => {
  it(
    'offers 0..9 user layers and a Layer/Name grid',
    async () => {
      await openPage('fp-userlayers');
      const text = panelText();
      expect(text).toContain('User layers:');
      expect(text).toContain('User Layer Names');
      // `m_choiceUserLayersChoices` — ten rows, "0" … "9".
      const counts = comboOptions();
      for (const n of ['0', '1', '9']) expect(counts).toContain(n);
    },
    SLOW,
  );

  it(
    'the User layers choice holds the count picked',
    async () => {
      await openPage('fp-userlayers');
      const combo = screen.getByLabelText('User layers').closest('.ze-combo') as HTMLElement;
      fireEvent.click(combo);
      const option = [...document.querySelectorAll('[role="option"]')].find(
        (o) => o.textContent === '3',
      );
      fireEvent.mouseDown(option as HTMLElement);
      expect(combo.querySelector('.ze-combo-shown')?.textContent).toBe('3');
    },
    SLOW,
  );

  it(
    'offers the 49 layers its mask leaves, not eight',
    async () => {
      await openPage('fp-userlayers');
      // `AllCuMask() | AllTechMask()` plus Edge_Cuts and Margin
      // (`panel_fp_user_layer_names.cpp:160-164`): the four `*.User`
      // auxiliaries and User.1 … User.45 survive.
      // The grid starts empty — a fresh install has named no user layer — so
      // `m_bpAdd` is what puts a layer cell on the page.
      fireEvent.click(screen.getByLabelText('Add layer'));
      const cell = document.querySelector(
        'table[aria-label="User layer names"] tbody td[data-col="0"]',
      );
      expect(cell, 'the added row').not.toBeNull();
      // Add opens no editor upstream (`OnAddRow` returns column -1); a click on
      // the layer cell does, and the layer box is that editor.
      fireEvent.mouseDown(cell!, { button: 0 });
      fireEvent.mouseUp(cell!);
      const offered = comboOptions(cell ?? document);
      expect(offered).toHaveLength(49);
      expect(offered[0]).toBe('User.Drawings');
      expect(offered.at(-1)).toBe('User.45');
      expect(offered).not.toContain('F.Cu');
    },
    SLOW,
  );

  it('holds its two columns at 200 and 220 against the filler cell', async () => {
    // `SetColSize( 0, 200 )` / `SetColSize( 1, 220 )`, never autosized
    // (`panel_fp_user_layer_names_base.cpp:65-66`).
    //
    // The regression this pins: `.ze-grid-filler`'s `width: 100%` and a stated
    // `width: 200px` are BOTH suggestions to the auto table algorithm, and the
    // 100% wins — Layer and Name collapsed onto their own text. Only
    // `table-layout: fixed` reads a stated width as stated, and in that
    // algorithm the filler has to be `auto` or it takes the whole table.
    const css = readFileSync(resolve(process.cwd(), '../common/widgets/shell.css'), 'utf8');
    const rule = (selector: string): string => {
      for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g))
        if ((m[1] ?? '').split(',').some((sel) => sel.trim() === selector)) return m[2] ?? '';
      return '';
    };
    // WxGridView fixedColumns: the shared fixed-layout rule, the filler taking only the rest.
    expect(rule('.ze-grid.ze-grid-fixed')).toMatch(/table-layout:\s*fixed/);
    expect(rule('.ze-grid.ze-grid-fixed th.ze-grid-filler')).toMatch(/width:\s*auto/);
    await openPage('fp-userlayers');
    const grid = document.querySelector('table[aria-label="User layer names"]') as HTMLElement;
    expect(grid.classList.contains('ze-grid-fixed')).toBe(true);
    const heads = Array.from(grid.querySelectorAll<HTMLElement>('thead th')).filter(
      (h) => !h.classList.contains('ze-grid-filler'),
    );
    expect(heads.map((h) => h.style.width)).toEqual(['200px', '220px']);
  });

  it(
    'gives the grid a filler cell, so the columns stop at 420',
    async () => {
      await openPage('fp-userlayers');
      fireEvent.click(screen.getByLabelText('Add layer'));
      const head = Array.from(
        document.querySelectorAll('table[aria-label="User layer names"] thead th'),
      );
      expect(head.at(-1)?.className).toBe('ze-grid-filler');
      const row = document.querySelector('table[aria-label="User layer names"] tbody tr');
      expect(row?.lastElementChild?.className).toBe('ze-grid-filler');
    },
    SLOW,
  );
});
