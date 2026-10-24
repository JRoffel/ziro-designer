// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The Symbol Library Browser's window (`symbol_viewer_frame_ui.tsx`) driven as a user would, and
 * the library source it gives the frame over the hosted set.
 *
 * There is no WebGL here, so `createSchDrawPanel` puts the frame on schToolHarness's stand-in
 * canvas - the same frame calls (LoadSettings, setupTools) on a canvas that draws nothing - and the
 * tools are the frame's own.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SetErrorPresenter } from '@ziroeda/common/confirm.js';
import { FRAME_T } from '@ziroeda/common/frame_type.js';
import { KIWAY } from '@ziroeda/common/kiway.js';
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import {
  LIBRARY_TABLE,
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from '@ziroeda/common/libraries/library_table.js';
import { Pgm } from '@ziroeda/common/pgm_base.js';
import {
  EESCHEMA_DEFAULTS,
  type EeschemaSettings,
  setEeschemaSettingsProvider,
  setUpdateEeschemaSettingsProvider,
} from '@ziroeda/eeschema/eeschema_settings.js';
import type { LibTreeItem } from '@ziroeda/eeschema/lib_tree_item.js';
import { SYMBOL_TYPE } from '@ziroeda/eeschema/libraries/symbol_library_adapter.js';
import { SymbolLibAdapter } from '@ziroeda/eeschema/project_sch.js';
import type { SYMBOL_VIEWER_FRAME } from '@ziroeda/eeschema/symbol_viewer_frame.js';
import { symbolViewerLibraries } from './support/symbol_viewer_harness.js';

vi.mock('@ziroeda/common/gal/gal_window.js', async (aOriginal) => ({
  ...(await aOriginal<typeof import('@ziroeda/common/gal/gal_window.js')>()),
  loadBitmapFontImage: () => Promise.resolve({} as ImageBitmap),
}));

vi.mock('@ziroeda/eeschema/browser/sch_canvas.js', async () => {
  const { schToolHarness } = await import('./support/sch_tool_harness.js');
  return {
    createSchDrawPanel: (aFrame: SYMBOL_VIEWER_FRAME) => {
      const cfg = aFrame.config();
      if (cfg) aFrame.LoadSettings(cfg);
      const h = schToolHarness(aFrame as never);
      return { Destroy: () => {}, GetView: () => h.view };
    },
  };
});

const { SymbolViewerFrame, hostedSymbolHooks } = await import(
  '@ziroeda/eeschema/symbol_viewer_frame_ui.js'
);

let dispose: () => void = () => {};

afterEach(() => {
  cleanup();
  dispose();
  setEeschemaSettingsProvider(() => EESCHEMA_DEFAULTS);
  setUpdateEeschemaSettingsProvider(() => {});
});

const item = (aName: string, aExtra: Partial<LibTreeItem> = {}): LibTreeItem => ({
  name: aName,
  description: '',
  keywords: '',
  footprint: '',
  isPower: false,
  isRoot: true,
  pinCount: 1,
  unitCount: 1,
  chooserFields: [],
  ...aExtra,
});

const REG_FILE = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "REG" (in_bom yes) (on_board yes)
    (property "Reference" "U" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (property "Value" "REG" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (symbol "REG_1_1" (rectangle (start -5.08 -2.54) (end 5.08 2.54) (stroke (width 0) (type default)) (fill (type none))))))`;

/**
 * Two hosted libraries - global rows over folders - of which the preload has loaded Gamma, and a
 * fetch that writes the symbol's file into its folder.
 */
function hostedSetup() {
  const libs = symbolViewerLibraries(['Gamma', 'Delta']);
  dispose = libs.dispose;
  const fetched: string[] = [];
  let hostHas = true;
  const items = new Map<string, LibTreeItem[]>([
    ['Gamma', [item('OPAMP', { pinCount: 8 }), item('REG'), item('VCC', { isPower: true })]],
  ]);
  const hooks = hostedSymbolHooks({
    libraryLoaded: (aLib) => items.has(aLib),
    loadedLibraryItems: (aLib) => items.get(aLib),
    fetchSymbolFile: async (aLibId) => {
      fetched.push(aLibId.Format());
      if (!hostHas) return null;
      const rel = `${aLibId.GetLibNickname()}/${aLibId.GetLibItemName()}.kicad_sym`;
      libs.fs.Write(rel, new TextEncoder().encode(REG_FILE));
      return `/libs/${rel}`;
    },
  });
  return {
    hooks,
    fetched,
    items,
    hostMisses: () => {
      hostHas = false;
    },
  };
}

describe('hostedSymbolHooks: the hosted set as the frame reads it', () => {
  it('lists the loaded rows and the hosted libraries the preload has, StrNumCmp-sorted', () => {
    const { hooks, items } = hostedSetup();

    // Delta's preload has not landed: it is not LOADED, so it is not listed.
    expect(hooks.getLibraryNames()).toEqual(['Alpha', 'Beta', 'Gamma']);

    items.set('Delta', []);
    expect(hooks.getLibraryNames()).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']);
  });

  it("lists a hosted library's symbols from its items, power ones alone when asked", () => {
    const { hooks } = hostedSetup();

    expect(hooks.getSymbols('Gamma', SYMBOL_TYPE.ALL_SYMBOLS)?.map((s) => s.GetName())).toEqual([
      'OPAMP',
      'REG',
      'VCC',
    ]);
    expect(hooks.getSymbols('Gamma', SYMBOL_TYPE.POWER_ONLY)?.map((s) => s.GetName())).toEqual([
      'VCC',
    ]);
    expect(hooks.getSymbols('Gamma', SYMBOL_TYPE.ALL_SYMBOLS)?.[0]?.GetPinCount()).toBe(8);
    // Not loaded yet: nothing, as the adapter has nothing for a library still loading.
    expect(hooks.getSymbols('Delta', SYMBOL_TYPE.ALL_SYMBOLS)).toEqual([]);
  });

  it('leaves a project row to the adapter', () => {
    const { hooks } = hostedSetup();

    expect(hooks.getSymbols('Alpha', SYMBOL_TYPE.ALL_SYMBOLS)).toBeUndefined();
  });

  it("fetches a hosted symbol's file and re-reads its library, so the symbol loads", async () => {
    const { hooks, fetched } = hostedSetup();
    const id = new LIB_ID('Gamma', 'REG');

    expect(SymbolLibAdapter(null).LoadSymbol(id)).toBeNull();
    expect(await hooks.ensureSymbol(id)).toBe(true);
    expect(fetched).toEqual(['Gamma:REG']);
    expect(SymbolLibAdapter(null).LoadSymbol(id)?.GetName()).toBe('REG');
  });

  it('fetches nothing for a project library, and fails a symbol the host does not have', async () => {
    const { hooks, fetched, hostMisses } = hostedSetup();

    expect(await hooks.ensureSymbol(new LIB_ID('Alpha', 'R'))).toBe(false);
    expect(fetched).toEqual([]);

    hostMisses();
    expect(await hooks.ensureSymbol(new LIB_ID('Gamma', 'REG'))).toBe(false);
    expect(fetched).toEqual(['Gamma:REG']);
  });
});

// ----- the window -------------------------------------------------------------------------

function makeKiway(): KIWAY {
  return new KIWAY({
    OnKiCadExit: () => {},
    Player: () => true,
    HasProjectManager: () => true,
    ShowProjectManager: () => {},
    CreateKiWindow: () => false,
  });
}

const APP = {
  loadIndex: () => Promise.resolve([]),
  useSchematicTheme: () => null,
  HomeLink: () => null,
  LibraryLoadingPanel: () => null,
};

const rows = (aTestId: string): string[] =>
  Array.from(screen.getByTestId(aTestId).querySelectorAll('[role="option"]')).map(
    (r) => r.textContent ?? '',
  );
const selected = (aTestId: string): string =>
  screen.getByTestId(aTestId).querySelector('[aria-selected="true"]')?.textContent ?? '';
const pick = (aTestId: string, aRow: string): void => {
  const row = Array.from(screen.getByTestId(aTestId).querySelectorAll('[role="option"]')).find(
    (r) => r.textContent === aRow,
  );
  fireEvent.mouseDown(row!);
};

async function openWindow(aProps: { onClose?: () => void } = {}) {
  const libs = symbolViewerLibraries();
  dispose = libs.dispose;
  const kiway = makeKiway();
  const view = render(
    <SymbolViewerFrame app={APP} kiway={kiway} onClose={aProps.onClose ?? (() => {})} />,
  );
  await waitFor(() => expect(rows('symviewer-lib-list')).toEqual(['Alpha', 'Beta']));
  const frame = kiway.GetPlayerFrame(FRAME_T.FRAME_SCH_VIEWER) as SYMBOL_VIEWER_FRAME;
  await waitFor(() => expect(frame.GetToolManager()).toBeTruthy());
  return { kiway, view, frame };
}

describe('SymbolViewerFrame', () => {
  it('is FRAME_SCH_VIEWER while it is up, and KIWAY hears it close', async () => {
    const { kiway, view, frame } = await openWindow();

    expect(frame).toBeTruthy();
    view.unmount();
    // As a boolean: a failing toBeNull() diffs the whole frame and runs the worker out of memory.
    expect(kiway.GetPlayerFrame(FRAME_T.FRAME_SCH_VIEWER) === null).toBe(true);
  });

  it('lists the first library, then a clicked one, with their symbols', async () => {
    await openWindow();

    expect(selected('symviewer-lib-list')).toBe('Alpha');
    expect(rows('symviewer-sym-list')).toEqual(['R', 'U']);

    act(() => pick('symviewer-lib-list', 'Beta'));

    expect(selected('symviewer-lib-list')).toBe('Beta');
    expect(rows('symviewer-sym-list')).toEqual(['GND', 'Q']);
    // SetSelectedLibrary ends in `m_libList->SetFocus()`, so the arrow keys walk that list.
    expect(document.activeElement).toBe(screen.getByTestId('symviewer-lib-list'));

    act(() => pick('symviewer-sym-list', 'Q'));
    expect(document.activeElement).toBe(screen.getByTestId('symviewer-sym-list'));
  });

  it('previews a clicked symbol: the message panel and the unit choice', async () => {
    const { frame } = await openWindow();

    act(() => pick('symviewer-sym-list', 'U'));

    expect(selected('symviewer-sym-list')).toBe('U');
    expect(frame.m_previewItem?.GetName()).toBe('U');
    const panel = screen.getByTestId('symviewer-message-panel').textContent ?? '';
    expect(panel).toContain('Quad gate');
    expect((screen.getByTitle('Unit') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTitle('Body style') as HTMLButtonElement).disabled).toBe(false);

    act(() => pick('symviewer-sym-list', 'R'));
    expect((screen.getByTitle('Unit') as HTMLButtonElement).disabled).toBe(true);
  });

  /** `EVT_CHOICE( ID_LIBVIEW_SELECT_UNIT_NUMBER )` -> onSelectSymbolUnit: the pick is the unit shown. */
  it('shows the unit picked in the unit choice', async () => {
    const { frame } = await openWindow();
    act(() => pick('symviewer-sym-list', 'U'));
    expect(frame.GetUnit()).toBe(1);

    act(() => fireEvent.click(screen.getByTitle('Unit')));
    // LIB_SYMBOL::GetUnitDisplayName( 2, true ).
    const second = screen.getAllByRole('option').find((o) => o.textContent === 'Unit B')!;
    act(() => {
      fireEvent.mouseDown(second);
    });

    expect(frame.GetUnit()).toBe(2);
    expect(frame.GetRenderSettings()!.m_ShowUnit).toBe(2);
  });

  it('narrows the symbols on the filter', async () => {
    await openWindow();

    act(() => {
      fireEvent.change(screen.getByTestId('symviewer-sym-filter'), { target: { value: 'quad' } });
    });

    expect(rows('symviewer-sym-list')).toEqual(['U']);
  });

  it('walks the library list with Down from the list, and the symbols from anywhere else', async () => {
    await openWindow();

    act(() => {
      const list = screen.getByTestId('symviewer-lib-list');
      list.focus();
      fireEvent.keyDown(list, { key: 'ArrowDown' });
    });
    expect(selected('symviewer-lib-list')).toBe('Beta');

    // SelectNextSymbol steps from the selection; with none (wxNOT_FOUND) it stays put (:989-1000).
    act(() => pick('symviewer-sym-list', 'GND'));
    act(() => {
      const filter = screen.getByTestId('symviewer-sym-filter');
      filter.focus();
      fireEvent.keyDown(filter, { key: 'ArrowDown' });
    });
    expect(selected('symviewer-lib-list')).toBe('Beta');
    expect(selected('symviewer-sym-list')).toBe('Q');
  });

  /**
   * `EVT_LISTBOX_DCLICK` -> DClickOnSymbolList -> addSymbolToSchematic, which with no schematic
   * frame says so. A double click under the last row activates nothing.
   */
  it('adds a double-clicked symbol to the schematic, of which there is none here', async () => {
    const errors: string[] = [];
    SetErrorPresenter((aMessage) => errors.push(aMessage));
    await openWindow();
    act(() => pick('symviewer-sym-list', 'R'));

    act(() => fireEvent.doubleClick(screen.getByTestId('symviewer-sym-list')));
    expect(errors).toEqual([]);

    const row = screen.getByTestId('symviewer-sym-list').querySelector('[role="option"]')!;
    act(() => fireEvent.doubleClick(row));
    expect(errors).toEqual(['No schematic currently open.']);
    SetErrorPresenter(() => {});
  });

  it('closes on File > Close', async () => {
    const onClose = vi.fn();
    const { frame } = await openWindow({ onClose });

    act(() => frame.CloseLibraryViewer());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lights the render toggles from the render settings', async () => {
    const { frame } = await openWindow();
    const button = () => screen.getByTitle('Show Pin Numbers');

    expect(button().className).not.toMatch(/\bactive\b|\bchecked\b|\bon\b/);

    act(() => fireEvent.click(button()));

    expect(frame.ConditionPinNumbersShown()).toBe(true);
    expect(button().className).toMatch(/\bactive\b|\bchecked\b|\bon\b/);
  });

  it('opens the panes at their saved widths, and saves what they were on close', async () => {
    let stored: EeschemaSettings = structuredClone({
      ...EESCHEMA_DEFAULTS,
      lib_view: {
        ...EESCHEMA_DEFAULTS.lib_view,
        lib_list_width: 150,
        cmp_list_width: 260,
        window: { ...structuredClone(EESCHEMA_DEFAULTS.lib_view.window), size_x: 1200 },
      },
    });
    setEeschemaSettingsProvider(() => stored);
    setUpdateEeschemaSettingsProvider((mutate) => {
      const next = structuredClone(stored);
      mutate(next);
      stored = next;
    });
    const { view } = await openWindow();
    const pane = (aTestId: string) =>
      (screen.getByTestId(aTestId).parentElement as HTMLElement).style.width;

    expect([pane('symviewer-lib-list'), pane('symviewer-sym-list')]).toEqual(['150px', '260px']);

    stored = { ...stored, lib_view: { ...stored.lib_view, lib_list_width: 0, cmp_list_width: 0 } };
    view.unmount();

    expect([stored.lib_view.lib_list_width, stored.lib_view.cmp_list_width]).toEqual([150, 260]);
  });

  /** `EVT_ACTIVATE` -> OnActivate: back at the front, the browser re-reads the tables. */
  it('re-reads the libraries when it comes back to the front', async () => {
    const libs = symbolViewerLibraries();
    dispose = libs.dispose;
    const frame = (aActive: boolean) => (
      <SymbolViewerFrame app={APP} active={aActive} onClose={() => {}} />
    );
    const view = render(frame(true));
    await waitFor(() => expect(rows('symviewer-lib-list')).toEqual(['Alpha', 'Beta']));

    view.rerender(frame(false));
    Pgm()
      .GetLibraryManager()
      .SetTable(
        LIBRARY_TABLE_TYPE.SYMBOL,
        LIBRARY_TABLE_SCOPE.PROJECT,
        LIBRARY_TABLE.FromFile(
          '/libs/sym-lib-table',
          '(sym_lib_table (version 7) (lib (name "Alpha")(type "KiCad")(uri "/libs/Alpha.kicad_sym")(options "")(descr "")))',
          LIBRARY_TABLE_SCOPE.PROJECT,
          LIBRARY_TABLE_TYPE.SYMBOL,
        ),
      );
    expect(rows('symviewer-lib-list')).toEqual(['Alpha', 'Beta']);

    view.rerender(frame(true));
    await waitFor(() => expect(rows('symviewer-lib-list')).toEqual(['Alpha']));
  });
});
