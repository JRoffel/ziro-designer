// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SYMBOL_VIEWER_FRAME on the live model (eeschema/symbol_viewer_frame.cpp): the library and symbol
 * lists, their filters, the selection, the preview with its unit and body style, the keys, and
 * the browser's half of SYMBOL_EDITOR_CONTROL. Every expectation is read off the C++ at the line
 * named beside it.
 */
import { SetErrorPresenter } from '@ziroeda/common/confirm.js';
import { KIWAY_MAIL_EVENT } from '@ziroeda/common/kiway_mail.js';
import { PINNING_SYMBOL } from '@ziroeda/common/lib_tree_model_adapter.js';
import { MAIL_T } from '@ziroeda/common/mail_type.js';
import { FRAME_T } from '@ziroeda/common/frame_type.js';
import { SYMBOL_VIEWER_FRAME } from '@ziroeda/eeschema/symbol_viewer_frame.js';
import { SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import {
  EESCHEMA_DEFAULTS,
  type EeschemaSettings,
  eeschemaKifaceSettings,
  setEeschemaSettingsProvider,
  setUpdateEeschemaSettingsProvider,
} from '@ziroeda/eeschema/eeschema_settings.js';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type SYMBOL_VIEWER_HARNESS,
  symbolViewerHarness,
} from './support/symbol_viewer_harness.js';

let t: SYMBOL_VIEWER_HARNESS;

afterEach(() => {
  t.dispose();
  SetErrorPresenter(() => {});
});

const libs = () => t.frame.m_libList.GetStrings();
const symbols = () => t.frame.m_symbolList.GetStrings();
const current = () => SYMBOL_VIEWER_FRAME.m_currentSymbol.Format();

/** The user clicks a row, as EVT_LISTBOX reaches ClickOnLibList / ClickOnSymbolList. */
const clickLib = (aName: string) => {
  t.frame.m_libList.SetSelection(t.frame.m_libList.FindString(aName));
  t.frame.ClickOnLibList();
};
const clickSymbol = (aName: string) => {
  t.frame.m_symbolList.SetSelection(t.frame.m_symbolList.FindString(aName));
  t.frame.ClickOnSymbolList();
};

describe('ReCreateLibList (:478)', () => {
  it('lists every library and, with none current, makes the first one current', () => {
    t = symbolViewerHarness();

    expect(libs()).toEqual(['Alpha', 'Beta']);
    expect(current()).toBe('Alpha:');
    expect(symbols()).toEqual(['R', 'U']);
    // No symbol name to find: ReCreateSymbolList selects nothing (:671-679).
    expect(t.frame.m_symbolList.GetSelection()).toBe(-1);
  });

  it('puts a pinned library first, marked, and still finds it by its plain name', () => {
    t = symbolViewerHarness();
    // project.m_PinnedSymbolLibs (:496)
    t.frame.Prj().GetProjectFile().m_PinnedSymbolLibs.push('Beta');
    t.frame.ReCreateLibList();

    expect(libs()).toEqual([`${PINNING_SYMBOL}Beta`, 'Alpha']);
    expect(t.frame.m_libList.FindString('Beta')).toBe(0);
    expect(t.frame.m_libList.GetBaseString(0)).toBe('Beta');
  });

  it('filters by library name, and moves to the first one listed when the current one is gone', () => {
    t = symbolViewerHarness();
    t.frame.m_libFilter.SetValue('bet');

    expect(libs()).toEqual(['Beta']);
    expect(current()).toBe('Beta:');
    expect(symbols()).toEqual(['GND', 'Q']);
  });

  it('with the power filter on, lists only libraries that have a power symbol', () => {
    t = symbolViewerHarness();
    t.frame.m_listPowerOnly = true;
    t.frame.ReCreateLibList();

    expect(libs()).toEqual(['Beta']);
  });

  it('with an allowed-libraries list, lists only those', () => {
    t = symbolViewerHarness();
    t.frame.m_allowedLibs = ['Alpha'];
    t.frame.ReCreateLibList();

    expect(libs()).toEqual(['Alpha']);
  });
});

describe('ReCreateSymbolList (:606)', () => {
  it('requires every term: name, description and keywords all count', () => {
    t = symbolViewerHarness();

    t.frame.m_symbolFilter.SetValue('passive');
    expect(symbols()).toEqual(['R']);

    t.frame.m_symbolFilter.SetValue('gate');
    expect(symbols()).toEqual(['U']);

    t.frame.m_symbolFilter.SetValue('passive gate');
    expect(symbols()).toEqual([]);
  });

  /**
   * GetPinCount is cachePinCount's: the graphical pins of every unit at body style 1
   * (lib_symbol.cpp:1276). U has one pin in each unit, so two, like R; Q has three, GND one.
   */
  it('matches a number against the pin count', () => {
    t = symbolViewerHarness();

    t.frame.m_symbolFilter.SetValue('2');
    expect(symbols()).toEqual(['R', 'U']);

    t.frame.m_symbolFilter.SetValue('4');
    expect(symbols()).toEqual([]);

    clickLib('Beta');
    t.frame.m_symbolFilter.SetValue('3');
    expect(symbols()).toEqual(['Q']);
  });

  it('an emptied list clears the symbol and its unit and body style', () => {
    t = symbolViewerHarness();
    clickSymbol('U');
    t.frame.SetUnitAndBodyStyle(2, 2);

    t.frame.m_symbolFilter.SetValue('nothing-matches-this');

    expect(current()).toBe('Alpha:');
    expect([t.frame.GetUnit(), t.frame.GetBodyStyle()]).toEqual([1, 1]);
  });
});

describe('selecting a symbol', () => {
  it('previews it flattened, with its name, parent, description and keywords', () => {
    t = symbolViewerHarness();
    clickSymbol('R');

    expect(current()).toBe('Alpha:R');
    expect(t.frame.m_previewItem?.GetName()).toBe('R');
    expect(t.frame.GetMsgPanelItems().map((i) => [i.GetUpperText(), i.GetLowerText()])).toEqual([
      ['Name', 'R'],
      ['Parent', ''],
      ['Description', 'Resistor'],
      ['Keywords', 'res passive'],
    ]);
  });

  it('a library click keeps the symbol only if the new library has one of that name', () => {
    t = symbolViewerHarness();
    clickSymbol('R');
    clickLib('Beta');

    expect(current()).toBe('Beta:');
    expect(t.frame.m_libList.GetStringSelection()).toBe('Beta');
  });

  it('puts the library in the title (:1043)', () => {
    t = symbolViewerHarness();
    clickLib('Beta');

    expect(t.titles.at(-1)).toBe('/libs/Beta.kicad_sym — Symbol Library Browser');
  });

  it('Show Datasheet is live only for a symbol with a datasheet (:316-321)', () => {
    t = symbolViewerHarness();
    clickSymbol('U');
    expect(t.frame.ConditionShowDatasheet()).toBe(false);

    clickSymbol('R');
    expect(t.frame.ConditionShowDatasheet()).toBe(true);
  });
});

describe('units and body styles', () => {
  it('fills the unit and body style choices for the symbol, and greys them for one of each', () => {
    t = symbolViewerHarness();
    clickSymbol('U');

    expect(t.frame.m_unitChoice.GetStrings()).toEqual(['Unit A', 'Unit B']);
    expect(t.frame.m_unitChoice.IsEnabled()).toBe(true);
    expect(t.frame.m_bodyStyleChoice.GetStrings()).toEqual(['Standard', 'Alternate']);

    clickSymbol('R');

    expect(t.frame.m_unitChoice.GetStrings()).toEqual([]);
    expect(t.frame.m_unitChoice.IsEnabled()).toBe(false);
    expect(t.frame.m_bodyStyleChoice.IsEnabled()).toBe(false);
  });

  it('picking unit B shows unit B, and Zoom to Fit fits it', () => {
    t = symbolViewerHarness();
    clickSymbol('U');
    const unitA = t.frame.GetDocumentExtents().GetWidth();

    t.frame.m_unitChoice.SetSelection(1);
    t.frame.onSelectSymbolUnit();

    expect(t.frame.GetUnit()).toBe(2);
    expect(t.frame.GetRenderSettings()!.m_ShowUnit).toBe(2);
    expect(t.frame.GetDocumentExtents().GetWidth()).toBeGreaterThan(unitA);
  });

  it('picking Alternate shows body style 2', () => {
    t = symbolViewerHarness();
    clickSymbol('U');

    t.frame.m_bodyStyleChoice.SetSelection(1);
    t.frame.onSelectSymbolBodyStyle();

    expect(t.frame.GetBodyStyle()).toBe(2);
    expect(t.frame.GetRenderSettings()!.m_ShowBodyStyle).toBe(2);
  });

  it('a different symbol picked by the user starts again at unit 1 (:770-775)', () => {
    t = symbolViewerHarness();
    clickSymbol('U');
    t.frame.m_unitChoice.SetSelection(1);
    t.frame.onSelectSymbolUnit();

    clickSymbol('R');
    clickSymbol('U');

    expect(t.frame.GetUnit()).toBe(1);
  });

  it('with no symbol, the extents are a 400 IU square at the origin (:891)', () => {
    t = symbolViewerHarness();
    const box = t.frame.GetDocumentExtents();

    expect([box.GetX(), box.GetY(), box.GetWidth(), box.GetHeight()]).toEqual([
      -200, -200, 400, 400,
    ]);
  });
});

describe('next and previous', () => {
  it('step through the symbol list and stop at its ends (:989-1015)', () => {
    t = symbolViewerHarness();
    clickSymbol('R');

    t.frame.SelectNextSymbol();
    expect(current()).toBe('Alpha:U');
    t.frame.SelectNextSymbol();
    expect(current()).toBe('Alpha:U');

    t.frame.SelectPreviousSymbol();
    expect(current()).toBe('Alpha:R');
    t.frame.SelectPreviousSymbol();
    expect(current()).toBe('Alpha:R');
    // The list keeps its row: stepping back from the first one does not deselect it.
    expect(t.frame.m_symbolList.GetStringSelection()).toBe('R');
  });

  it('are the browser actions SYMBOL_EDITOR_CONTROL binds (:1057-1058)', () => {
    t = symbolViewerHarness();
    clickSymbol('R');

    t.frame.GetToolManager()!.RunAction(SCH_ACTIONS.nextSymbol);
    expect(current()).toBe('Alpha:U');

    t.frame.GetToolManager()!.RunAction(SCH_ACTIONS.previousSymbol);
    expect(current()).toBe('Alpha:R');
  });
});

describe('OnCharHook (:920)', () => {
  it('Down in the library list or its filter moves to the next library', () => {
    t = symbolViewerHarness();
    t.frame.m_libList.SetSelection(0);
    t.frame.m_libList.SetHasFocus(true);

    expect(t.frame.OnCharHook('ArrowDown')).toBe(true);
    expect(current()).toBe('Beta:');
  });

  it('Up in the library list moves to the previous library, and stops at the first', () => {
    t = symbolViewerHarness();
    clickLib('Beta');
    t.frame.m_libList.SetHasFocus(true);

    expect(t.frame.OnCharHook('ArrowUp')).toBe(true);
    expect(current()).toBe('Alpha:');

    expect(t.frame.OnCharHook('ArrowUp')).toBe(true);
    expect(current()).toBe('Alpha:');
  });

  it('Down anywhere else moves to the next symbol, Up to the previous', () => {
    t = symbolViewerHarness();
    clickSymbol('R');
    t.frame.m_symbolList.SetHasFocus(false);

    t.frame.OnCharHook('ArrowDown');
    expect(current()).toBe('Alpha:U');

    t.frame.OnCharHook('ArrowUp');
    expect(current()).toBe('Alpha:R');
  });

  it('Tab goes from the library filter to the symbol filter, Shift+Tab back', () => {
    t = symbolViewerHarness();
    t.frame.m_libFilter.SetHasFocus(true);

    expect(t.frame.OnCharHook('Tab')).toBe(true);
    expect(t.frame.m_symbolFilter.TakeFocusRequest()).toBe(true);

    t.frame.m_libFilter.SetHasFocus(false);
    expect(t.frame.OnCharHook('Tab', true)).toBe(true);
    expect(t.frame.m_libFilter.TakeFocusRequest()).toBe(true);

    // Shift+Tab out of the library filter, and Tab out of the symbol one, are skipped.
    expect(t.frame.OnCharHook('Tab', true)).toBe(false);
  });

  it('Enter on a selected symbol places it: with no schematic open, says so', () => {
    const errors: string[] = [];
    SetErrorPresenter((aMessage) => errors.push(aMessage));
    t = symbolViewerHarness();
    clickSymbol('R');

    expect(t.frame.OnCharHook('Enter')).toBe(true);
    expect(errors).toEqual(['No schematic currently open.']);
  });

  it('any other key is skipped', () => {
    t = symbolViewerHarness();

    expect(t.frame.OnCharHook('a')).toBe(false);
  });
});

describe('KiwayMailIn (:1067)', () => {
  it('MAIL_RELOAD_LIB re-lists the libraries', () => {
    t = symbolViewerHarness();
    t.frame.m_allowedLibs = ['Beta'];

    t.frame.KiwayMailIn(
      new KIWAY_MAIL_EVENT(FRAME_T.FRAME_SCH_VIEWER, MAIL_T.MAIL_RELOAD_LIB, { value: '' }),
    );

    expect(libs()).toEqual(['Beta']);
  });

  it("MAIL_REFRESH_SYMBOL rebuilds the preview only when it names the shown symbol's library", () => {
    t = symbolViewerHarness();
    clickSymbol('R');
    const before = t.frame.m_previewItem;

    const mail = (aLib: string) =>
      t.frame.KiwayMailIn(
        new KIWAY_MAIL_EVENT(FRAME_T.FRAME_SCH_VIEWER, MAIL_T.MAIL_REFRESH_SYMBOL, { value: aLib }),
      );

    mail('/libs/Beta.kicad_sym');
    // Identity as a boolean: a failed toBe on two LIB_SYMBOLs diffs them whole and runs out of heap.
    expect(t.frame.m_previewItem === before).toBe(true);

    mail('/libs/Alpha.kicad_sym');
    expect(t.frame.m_previewItem === before).toBe(false);
    expect(t.frame.m_previewItem?.GetName()).toBe('R');
  });
});

describe('LoadSettings / SaveSettings (:791-839)', () => {
  let stored: EeschemaSettings;

  afterEach(() => {
    setEeschemaSettingsProvider(() => EESCHEMA_DEFAULTS);
    setUpdateEeschemaSettingsProvider(() => {});
  });

  const useSettings = (aLibView: EeschemaSettings['lib_view']) => {
    stored = structuredClone({ ...EESCHEMA_DEFAULTS, lib_view: aLibView });
    setEeschemaSettingsProvider(() => stored);
    setUpdateEeschemaSettingsProvider((mutate) => {
      const next = structuredClone(stored);
      mutate(next);
      stored = next;
    });
  };

  it('reads lib_view, and with no saved window size clamps the widths as upstream does', () => {
    useSettings({ lib_list_width: 120, cmp_list_width: 180, show_pin_electrical_type: false });
    t = symbolViewerHarness();
    t.frame.LoadSettings(eeschemaKifaceSettings());

    expect(t.frame.GetRenderSettings()!.m_ShowPinsElectricalType).toBe(false);
    // window.state.size_x is 0, so maxWidth is -80: 120 * ( 120 / 300 ) in ints is 0, and the
    // symbol list takes the rest, -80. A real window's size undoes it.
    expect([t.frame.m_libListWidth, t.frame.m_symbolListWidth]).toEqual([0, -80]);
  });

  it('writes the widths and the electrical-type toggle back', () => {
    useSettings({ lib_list_width: 150, cmp_list_width: 150, show_pin_electrical_type: true });
    t = symbolViewerHarness();
    t.frame.m_libListWidth = 210;
    t.frame.m_symbolListWidth = 320;
    t.frame.GetRenderSettings()!.m_ShowPinsElectricalType = false;

    t.frame.SaveSettings(eeschemaKifaceSettings());

    expect(stored.lib_view).toEqual({
      lib_list_width: 210,
      cmp_list_width: 320,
      show_pin_electrical_type: false,
    });
  });
});
