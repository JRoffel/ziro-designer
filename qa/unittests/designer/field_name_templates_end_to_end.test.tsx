// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Preferences > Schematic Editor > Field Name Templates, from the page to the
 * places a template is supposed to show up.
 *
 * There are two lists and one resolved list. The Preferences page edits the
 * GLOBAL one — `PANEL_TEMPLATE_FIELDNAMES` built with `m_global = true` over
 * `cfg->m_Drawing.field_names` (`panel_template_fieldnames.cpp:50-60`) — and
 * Schematic Setup edits the PROJECT's. Every CONSUMER asks
 * `m_TemplateFieldNames.GetTemplateFieldNames()`, the resolved list:
 *
 *     DIALOG_SYMBOL_PROPERTIES::UpdateFieldsFromLibrary  dialog_symbol_properties.cpp:473-483
 *     DIALOG_SYMBOL_FIELDS_TABLE::LoadFieldNames         dialog_symbol_fields_table.cpp:777-780
 *
 * Ours handed both of them `setup.fieldTemplates`, the project's list alone, so
 * a template typed on the Preferences page was stored, listed back on that same
 * page, and used by nothing else in the app. The page looked finished.
 *
 * The first two describes below are the round trip through the page. The rest
 * are the consumers, because those are what "end to end" means here — a test
 * that only proved the page writes `drawing.field_names` would have passed
 * throughout the whole time this was broken.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PanelTemplateFieldnames } from '@ziroeda/designer/src/editors/schematic/prefs/PanelTemplateFieldnames.js';
import { EESCHEMA_DEFAULTS } from '@ziroeda/eeschema/eeschema_settings.js';
import type { EeschemaSettings } from '@ziroeda/eeschema/eeschema_settings.js';
import type { PrefsContext } from '@ziroeda/designer/src/dialogs/prefs/types.js';
import { transferTemplateFieldnamesPage } from '@ziroeda/designer/src/editors/schematic/prefs/resets.js';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import {
  DIALOG_SYMBOL_FIELDS_TABLE,
  type DIALOG_SYMBOL_FIELDS_TABLE_WINDOW,
} from '@ziroeda/eeschema/dialogs/dialog_symbol_fields_table.js';
import { setEeschemaSettingsProvider } from '@ziroeda/eeschema/eeschema_settings.js';
import type { SCH_SYMBOL } from '@ziroeda/eeschema/sch_symbol.js';
import { schFrame } from '../eeschema/support/sch_tool_harness.js';

afterEach(cleanup);

const settingsWith = (names: EeschemaSettings['drawing']['field_names']): EeschemaSettings => {
  const s = structuredClone(EESCHEMA_DEFAULTS);
  s.drawing.field_names = names;
  return s;
};

function ctxFor(eeschema: EeschemaSettings): PrefsContext {
  return {
    eeschema,
    upE: (fn: (s: EeschemaSettings) => void) => fn(eeschema),
  } as unknown as PrefsContext;
}

describe('the page edits the GLOBAL list, which is eeschema.json’s', () => {
  it('shows what drawing.field_names holds', () => {
    render(
      <PanelTemplateFieldnames
        ctx={ctxFor(settingsWith([{ name: 'MPN', visible: true, url: false }]))}
      />,
    );
    expect(screen.getByText('MPN')).toBeTruthy();
  });

  /** `m_title->SetLabel( _( "Global Field Name Templates" ) )` (`:50`). */
  it('says so, because the same panel serves the project’s list too', () => {
    render(<PanelTemplateFieldnames ctx={ctxFor(settingsWith([]))} />);
    expect(screen.getByText('Global Field Name Templates')).toBeTruthy();
  });

  it('writes an edit back into drawing.field_names and nowhere else', () => {
    const s = settingsWith([{ name: 'MPN', visible: false, url: false }]);
    render(<PanelTemplateFieldnames ctx={ctxFor(s)} />);
    const td = screen.getByText('MPN').closest('td') as HTMLElement;
    fireEvent.mouseDown(td, { button: 0 });
    fireEvent.mouseUp(td);
    const input = td.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Manufacturer' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(s.drawing.field_names).toEqual([{ name: 'Manufacturer', visible: false, url: false }]);
  });
});

/* ------------------------------------------------------- and out again -- */

const GLOBAL = [{ name: 'MPN', visible: true, url: false }];
const PROJECT = [{ name: 'Vendor', visible: false, url: false }];

const SCH = `(kicad_sch (version 20250114) (generator "eeschema")
  (uuid "00000000-0000-0000-0000-0000000000a0")
  (paper "A4")
  (lib_symbols
    (symbol "Device:R" (pin_numbers hide)
      (property "Reference" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))
      (property "Value" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))))
  (symbol (lib_id "Device:R") (at 40 60 0) (unit 1)
    (uuid "00000000-0000-0000-0000-0000000000a1")
    (property "Reference" "R1" (at 40 57 0) (effects (font (size 1.27 1.27))))
    (property "Value" "10k" (at 40 63 0) (effects (font (size 1.27 1.27))))
    (instances (project "t" (path "/00000000-0000-0000-0000-0000000000a0" (reference "R1") (unit 1))))))`;

/**
 * A live SCH_EDIT_FRAME on a one-sheet project whose `.kicad_pro` holds \a aProject and whose
 * eeschema.json holds \a aGlobal: the frame's SCHEMATIC_SETTINGS loads both, as
 * schematic_settings.cpp:150-199's "drawing.field_names" lambda does.
 */
function openLive(
  aProject: readonly { name: string; visible: boolean; url: boolean }[],
  aGlobal: readonly { name: string; visible: boolean; url: boolean }[],
) {
  setEeschemaSettingsProvider(() => settingsWith([...aGlobal]));
  const pro = JSON.stringify({ schematic: { drawing: { field_names: aProject } } });
  const files: Record<string, string> = { '/t/t.kicad_sch': SCH, '/t/t.kicad_pro': pro };
  const frame = schFrame();
  frame.OpenProjectFiles(['/t/t.kicad_sch'], 0, (p) => files[p] ?? null);
  return frame;
}

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => {
  SetPgm(null);
  setEeschemaSettingsProvider(() => EESCHEMA_DEFAULTS);
});

describe('the Symbol Fields Table gives every resolved template a column', () => {
  /*
   * `for( const TEMPLATE_FIELDNAME& tfn : …GetTemplateFieldNames() )
   *      if( userFieldNames.count( tfn.m_Name ) == 0 ) AddField( … );`
   * (`dialog_symbol_fields_table.cpp:777-780`), over SCHEMATIC_SETTINGS' resolved list.
   */
  const columns = (
    aProject: readonly { name: string; visible: boolean; url: boolean }[],
    aGlobal: readonly { name: string; visible: boolean; url: boolean }[],
  ): string[] => {
    const frame = openLive(aProject, aGlobal);
    const window = {
      fieldEditorSettings: () => structuredClone(EESCHEMA_DEFAULTS.field_editor),
    } as unknown as DIALOG_SYMBOL_FIELDS_TABLE_WINDOW;
    const dialog = new DIALOG_SYMBOL_FIELDS_TABLE(frame, window);
    const model = dialog.m_viewControlsDataModel;
    return Array.from({ length: model.GetNumberRows() }, (_, r) => model.GetCanonicalFieldName(r));
  };

  it('adds a column for a global template', () => {
    expect(columns(PROJECT, GLOBAL)).toContain('MPN');
  });

  it('and for a project one', () => {
    expect(columns(PROJECT, GLOBAL)).toContain('Vendor');
  });

  /** The "Read global fieldname templates" half files them as GLOBAL, so a save leaves them out. */
  it('keeps the global templates out of the project list', () => {
    const templates = openLive(PROJECT, GLOBAL).Schematic().Settings().m_TemplateFieldNames;
    expect(templates.GetTemplateFieldNames(true).map((f) => f.m_Name)).toStrictEqual(['MPN']);
    expect(templates.GetTemplateFieldNames(false).map((f) => f.m_Name)).toStrictEqual(['Vendor']);
  });

  it('and none at all when the page is empty', () => {
    expect(columns([], [])).not.toContain('MPN');
  });
});

describe('a ${TEMPLATE} token on a symbol that has no such field is empty', () => {
  /*
   * `SCH_SYMBOL::ResolveTextVar` (`eeschema/sch_symbol.cpp:1967-1978`). Without
   * this the token falls through to the document resolver and a field reading
   * `${MPN}` prints `${MPN}` — the token itself — on a symbol that simply has
   * not been given that field yet, which is every symbol the moment a template
   * is added.
   */
  const resolve = (
    token: string,
    aProject: readonly { name: string; visible: boolean; url: boolean }[],
    aGlobal: readonly { name: string; visible: boolean; url: boolean }[] = [],
  ): string | undefined => {
    const frame = openLive(aProject, aGlobal);
    const path = frame.Schematic().Hierarchy()[0]!;
    const symbol = [...path.LastScreen()!.Items().OfType(KICAD_T.SCH_SYMBOL_T)][0] as SCH_SYMBOL;
    const t = { value: token };
    return symbol.ResolveTextVar(path, t, 0) ? t.value : undefined;
  };

  it('answers empty for a global template name', () => {
    expect(resolve('MPN', PROJECT, GLOBAL)).toBe('');
  });

  it('and for its fully upper-cased spelling, which is the only other form', () => {
    // `token->IsSameAs( … ) || token->IsSameAs( …Upper() )` — as written or
    // ALL CAPS, and nothing in between, so a mixed-case guess still misses.
    expect(resolve('VENDOR', PROJECT)).toBe('');
    expect(resolve('vendor', PROJECT)).toBeUndefined();
  });

  it('leaves an unrelated token to the document resolver', () => {
    expect(resolve('NOT_A_TEMPLATE', PROJECT, GLOBAL)).toBeUndefined();
  });

  it('and a field the symbol DOES carry still answers with its value', () => {
    // The loop over the fields runs first, so a template that is also a real
    // field is not blanked.
    expect(resolve('VALUE', [{ name: 'Value', visible: false, url: false }])).toBe('10k');
  });
});

describe('the page’s TransferDataFromWindow, which is what OK runs', () => {
  /*
   * `PANEL_TEMPLATE_FIELDNAMES::TransferDataFromWindow` (`:193-252`). It filters
   * once, on OK — filtering per keystroke would delete the row a user is
   * halfway through clearing.
   */
  const withNames = (names: string[]): EeschemaSettings =>
    settingsWith(names.map((n) => ({ name: n, visible: false, url: false })));

  it('filters the list in place when nothing needs asking', () => {
    const s = withNames(['', 'MPN', 'reference', 'MPN']);
    expect(transferTemplateFieldnamesPage(ctxFor(s))).toBeUndefined();
    expect(s.drawing.field_names.map((f) => f.name)).toEqual(['MPN']);
  });

  it('asks before it filters when a name is padded, and changes nothing yet', () => {
    const s = withNames([' MPN ']);
    const asked = transferTemplateFieldnamesPage(ctxFor(s));
    expect(asked?.caption).toBe('Warning');
    expect(asked?.message).toContain("The field name ' MPN ' contains trailing");
    expect(asked?.labels).toEqual({ ok: 'Remove White Space', cancel: 'Keep White Space' });
    // Nothing written: the answer decides the name, so the transfer waits.
    expect(s.drawing.field_names.map((f) => f.name)).toEqual([' MPN ']);
  });

  it('trims on the affirmative answer', () => {
    const s = withNames([' MPN ']);
    expect(transferTemplateFieldnamesPage(ctxFor(s), true)).toBeUndefined();
    expect(s.drawing.field_names.map((f) => f.name)).toEqual(['MPN']);
  });

  it('and keeps the padding on the other, because neither answer cancels', () => {
    const s = withNames([' MPN ']);
    expect(transferTemplateFieldnamesPage(ctxFor(s), false)).toBeUndefined();
    expect(s.drawing.field_names.map((f) => f.name)).toEqual([' MPN ']);
  });

  it('names the count rather than one field when several are padded', () => {
    const asked = transferTemplateFieldnamesPage(ctxFor(withNames([' A', 'B ', 'C'])));
    expect(asked?.message).toBe('2 field names contain trailing and/or leading white space.');
  });

  /** The page is `sch-fields`, and its factory is what hands the shell the hook. */
  it('is the function the schematic factory registers for that page', async () => {
    const { createPrefsPanel } = await import(
      '@ziroeda/designer/src/editors/schematic/prefs/index.js'
    );
    expect(createPrefsPanel('sch-fields')?.transfer).toBe(transferTemplateFieldnamesPage);
    // …and the page still has no reset, which is a different virtual.
    expect(createPrefsPanel('sch-fields')?.reset).toBeUndefined();
  });
});
