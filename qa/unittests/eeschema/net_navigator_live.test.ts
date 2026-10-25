// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * eeschema/net_navigator.cpp on the live frame: RefreshNetNavigator / MakeNetNavigatorNode build
 * `m_netNavigator` from the CONNECTION_GRAPH; highlightNet narrows it to the net and selects the
 * row under the cursor; Tab steps it; the filter, its gear menu and the row menu act on it.
 *
 * The report this answers: highlighting a net in the schematic (the ` key) left the Net
 * Navigator showing every net with nothing selected, where KiCad shows that net alone with the
 * item under the cursor selected.
 */
import { resolve } from 'node:path';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { unescapeString } from '@ziroeda/common/string_utils.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import {
  GetNetNavigatorItemText,
  ID_NET_NAVIGATOR,
  NET_NAVIGATOR_ITEM_DATA,
} from '@ziroeda/eeschema/net_navigator.js';
import {
  currentEeschemaSettings,
  EESCHEMA_DEFAULTS,
  type EeschemaSettings,
  setEeschemaSettingsProvider,
  setUpdateEeschemaSettingsProvider,
} from '@ziroeda/eeschema/eeschema_settings.js';
import type { SCH_EDIT_FRAME_HOOKS } from '@ziroeda/eeschema/sch_edit_frame.js';
import type { SCH_LABEL } from '@ziroeda/eeschema/sch_label.js';
import type { SCH_LINE } from '@ziroeda/eeschema/sch_line.js';
import type { SCH_SYMBOL } from '@ziroeda/eeschema/sch_symbol.js';
import { SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import { SCH_SELECTION_TOOL } from '@ziroeda/eeschema/tools/sch_selection_tool.js';
import type { wxMenu } from '@ziroeda/wx/menu.js';
import {
  type wxGenericTreeCtrl,
  wxTreeItemId,
  type wxTreeItemIdValue,
} from '@ziroeda/wx/treectrl.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openProject, schFrame, schToolHarness } from './support/sch_tool_harness.js';

const ORACLE = resolve(__dirname, '../../data/eeschema/netlist_oracle/complex_hierarchy');
const SHEETS = ['complex_hierarchy.kicad_sch', 'ampli_ht.kicad_sch', 'complex_hierarchy.kicad_pro'];

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => SetPgm(null));

const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};

const PROBE = {
  on_selection: true,
  center_on_items: false,
  zoom_to_fit: false,
  auto_highlight: true,
  flash_selection: false,
};

function setUp(aHooks: Partial<SCH_EDIT_FRAME_HOOKS> = {}) {
  const hierarchy: string[] = [];
  const h = schToolHarness(
    schFrame({
      crossProbingSettings: () => PROBE as ReturnType<SCH_EDIT_FRAME_HOOKS['crossProbingSettings']>,
      isNetNavigatorShown: () => true,
      hierarchyUpdateNetHighlight: (aNet) => hierarchy.push(aNet),
      ...aHooks,
    }),
  );
  openProject(h.frame, ORACLE, 'complex_hierarchy', SHEETS);
  const root = h.frame
    .Schematic()
    .Hierarchy()
    .find((p) => p.size() === 1)!;
  h.frame.SetCurrentSheet(root);
  const screen = h.frame.GetScreen()!;
  const label = [...screen.Items().OfType(KICAD_T.SCH_LABEL_T)][0] as SCH_LABEL;
  const netName = label.Connection()!.Name();
  const wire = ([...screen.Items().OfType(KICAD_T.SCH_LINE_T)] as SCH_LINE[]).find(
    (w) => w.IsWire() && w.Connection()?.Name() === netName,
  )!;
  return { ...h, mgr: h.frame.GetToolManager()!, screen, label, netName, wire, hierarchy };
}

const midpoint = (aWire: SCH_LINE) => ({
  x: (aWire.GetStartPoint().x + aWire.GetEndPoint().x) / 2,
  y: (aWire.GetStartPoint().y + aWire.GetEndPoint().y) / 2,
});

/** The children of \a aId, as ids. */
function children(aTree: wxGenericTreeCtrl, aId: wxTreeItemId): wxTreeItemId[] {
  const out: wxTreeItemId[] = [];
  const cookie: wxTreeItemIdValue = { index: 0 };

  for (let c = aTree.GetFirstChild(aId, cookie); c.IsOk(); c = aTree.GetNextChild(aId, cookie))
    out.push(c);

  return out;
}

const texts = (aTree: wxGenericTreeCtrl, aIds: wxTreeItemId[]): string[] =>
  aIds.map((i) => aTree.GetItemText(i));

/** Every leaf, in tree order. */
function leaves(aTree: wxGenericTreeCtrl, aId = aTree.GetRootItem()): wxTreeItemId[] {
  return children(aTree, aId).flatMap((c) => (aTree.ItemHasChildren(c) ? leaves(aTree, c) : [c]));
}

const dataOf = (aTree: wxGenericTreeCtrl, aId: wxTreeItemId): NET_NAVIGATOR_ITEM_DATA =>
  aTree.GetItemData(aId) as NET_NAVIGATOR_ITEM_DATA;

describe('with no net highlighted', () => {
  it('roots the tree at "Nets", one row per named net in the net map, each expanded', () => {
    const h = setUp();
    const tree = h.frame.GetNetNavigator();

    h.frame.RefreshNetNavigator();

    const root = tree.GetRootItem();
    expect(tree.GetItemText(root)).toBe('Nets');
    expect(tree.IsExpanded(root)).toBe(true);

    // AddRoot / AppendItem order: NET_MAP's own iteration, the unnamed bus-member nets skipped,
    // and the name shown through UnescapeString.
    const expected = [...h.frame.Schematic().ConnectionGraph().GetNetMap()]
      .map(([k]) => k.Name)
      .filter((n) => n !== '')
      .map(unescapeString);
    const nets = children(tree, root);
    expect(texts(tree, nets)).toEqual(expected);
    // A net row carries no data: Find in Net Inspector has nothing to read off it.
    expect(nets.every((n) => tree.GetItemData(n) === null)).toBe(true);
    expect(nets.every((n) => tree.IsExpanded(n))).toBe(true);
  });

  it('puts a sheet row under a net and what the net reaches under that, never a wire', () => {
    const h = setUp();
    const tree = h.frame.GetNetNavigator();

    h.frame.RefreshNetNavigator();

    const net = children(tree, tree.GetRootItem()).find(
      (n) => tree.GetItemText(n) === unescapeString(h.netName),
    )!;
    const sheets = children(tree, net);
    expect(sheets.length).toBeGreaterThan(0);
    // A sheet row's data names the sheet and no item; its rows are sorted by text.
    for (const sheet of sheets) {
      expect(dataOf(tree, sheet).GetItem()).toBeNull();
      const rows = texts(tree, children(tree, sheet));
      expect(rows).toEqual([...rows].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    const items = leaves(tree, net).map((l) => dataOf(tree, l).GetItem()!);
    expect(items.includes(h.label)).toBe(true);
    expect(items.some((i) => i.Type() === KICAD_T.SCH_LINE_T)).toBe(false);
    expect(items.some((i) => i.Type() === KICAD_T.SCH_JUNCTION_T)).toBe(false);
  });

  it('builds nothing while the pane is hidden', () => {
    let shown = false;
    const h = setUp({ isNetNavigatorShown: () => shown });

    h.frame.RefreshNetNavigator();
    expect(h.frame.GetNetNavigator().IsEmpty()).toBe(true);

    shown = true;
    h.frame.RefreshNetNavigator();
    expect(h.frame.GetNetNavigator().IsEmpty()).toBe(false);
  });
});

describe('Highlight Net', () => {
  it('makes the net the root, alone, with the item under the cursor selected', async () => {
    const h = setUp();
    const tree = h.frame.GetNetNavigator();
    h.frame.RefreshNetNavigator();

    h.h.mouse = h.label.GetPosition();
    h.mgr.RunAction(SCH_ACTIONS.highlightNet);
    await flush();

    expect(h.frame.GetHighlightedConnection()).toBe(h.netName);
    expect(tree.GetItemText(tree.GetRootItem())).toBe(unescapeString(h.netName));
    expect(h.frame.GetSelectedNetNavigatorItem() === h.label).toBe(true);
    expect(tree.IsVisible(tree.GetSelection())).toBe(true);
    // The filter box is off while a net is highlighted.
    expect(h.frame.GetNetNavigatorFilter().IsEnabled()).toBe(false);
    // And the hierarchy pane is told which net to mark.
    expect(h.hierarchy.at(-1)).toBe(h.netName);
  });

  it('on a wire narrows to the net and selects nothing, since a wire is no row', async () => {
    const h = setUp();
    const tree = h.frame.GetNetNavigator();
    h.frame.RefreshNetNavigator();

    // A point the selection tool resolves to a wire, not to a label or pin sitting on one.
    const sel = h.mgr.GetTool(SCH_SELECTION_TOOL)!;
    const wire = ([...h.screen.Items().OfType(KICAD_T.SCH_LINE_T)] as SCH_LINE[]).find(
      (w) => w.IsWire() && w.Connection() && sel.GetNode(midpoint(w)) === w,
    )!;
    expect(wire).toBeDefined();
    h.h.mouse = midpoint(wire);
    h.mgr.RunAction(SCH_ACTIONS.highlightNet);
    await flush();

    expect(tree.GetItemText(tree.GetRootItem())).toBe(unescapeString(wire.Connection()!.Name()));
    expect(tree.GetSelection().IsOk()).toBe(false);
  });

  it('the same net again, from a row not selected, selects that row without rebuilding', async () => {
    // highlightNet's else branch: same net, so no SetHighlightedConnection - only
    // `if( item != GetSelectedNetNavigatorItem() ) SelectNetNavigatorItem( &itemData )`.
    const h = setUp();
    const tree = h.frame.GetNetNavigator();
    h.frame.RefreshNetNavigator();
    h.h.mouse = h.label.GetPosition();
    h.mgr.RunAction(SCH_ACTIONS.highlightNet);
    await flush();
    const rootBefore = tree.GetRootItem();
    const other = leaves(tree).find((l) => dataOf(tree, l).GetItem() !== h.label)!;
    tree.SelectItem(other);
    expect(h.frame.GetSelectedNetNavigatorItem() === h.label).toBe(false);

    h.mgr.RunAction(SCH_ACTIONS.highlightNet);
    await flush();

    expect(tree.GetRootItem().equals(rootBefore)).toBe(true);
    expect(h.frame.GetSelectedNetNavigatorItem() === h.label).toBe(true);
  });

  it('clearing it brings back every net and the filter', async () => {
    const h = setUp();
    const tree = h.frame.GetNetNavigator();
    h.frame.RefreshNetNavigator();
    h.h.mouse = h.label.GetPosition();
    h.mgr.RunAction(SCH_ACTIONS.highlightNet);
    await flush();

    h.mgr.RunAction(SCH_ACTIONS.clearHighlight);
    await flush();

    expect(tree.GetItemText(tree.GetRootItem())).toBe('Nets');
    expect(h.frame.GetNetNavigatorFilter().IsEnabled()).toBe(true);
  });
});

describe('the filter', () => {
  it('wildcard: a bare pattern is wrapped in * and matched without case', () => {
    const h = setUp();
    const tree = h.frame.GetNetNavigator();
    const shown = unescapeString(h.netName);
    const part = shown.slice(1, -1).toLowerCase();

    h.frame.RefreshNetNavigator();
    h.frame.GetNetNavigatorFilter().SetValue(part);

    const nets = texts(tree, children(tree, tree.GetRootItem()));
    expect(nets).toContain(shown);
    expect(nets.every((n) => n.toLowerCase().includes(part))).toBe(true);
  });

  it('regex, from the gear menu, and back; Escape clears it', () => {
    // The settings store, as the app installs it: a write replaces the slice.
    let slice: EeschemaSettings = structuredClone(EESCHEMA_DEFAULTS);
    setEeschemaSettingsProvider(() => slice);
    setUpdateEeschemaSettingsProvider((mutate) => {
      const next = structuredClone(slice);
      mutate(next);
      slice = next;
    });
    const h = setUp();
    const tree = h.frame.GetNetNavigator();
    let shown: wxMenu | null = null;
    tree.SetPopupMenuPresenter((aMenu) => {
      shown = aMenu;
    });

    try {
      h.frame.RefreshNetNavigator();
      h.frame.showNetNavigatorSearchMenu();
      // The radio pair, the mode in force checked.
      expect(shown!.FindItem(ID_NET_NAVIGATOR.SEARCH_WILDCARD)!.IsChecked()).toBe(true);
      expect(shown!.FindItem(ID_NET_NAVIGATOR.SEARCH_REGEX)!.IsChecked()).toBe(false);

      h.frame.onNetNavigatorMenuCommand(ID_NET_NAVIGATOR.SEARCH_REGEX);
      expect(currentEeschemaSettings().aui.net_nav_search_mode_wildcard).toBe(false);

      // ^ anchors only as a regular expression; as a wildcard it would match nothing.
      // A net whose name opens on a capital, searched for in lower case: the pattern is compiled
      // icase, as std::regex_constants::icase has it.
      const all = texts(tree, children(tree, tree.GetRootItem()));
      const capital = all.find((n) => /^[A-Z]/.test(n))!;
      const first = capital[0]!.toLowerCase();
      h.frame.GetNetNavigatorFilter().SetValue(`^${first}`);
      const nets = texts(tree, children(tree, tree.GetRootItem()));
      expect(nets).toContain(capital);
      expect(nets.every((n) => n.toLowerCase().startsWith(first))).toBe(true);

      expect(h.frame.onNetNavigatorKey('Escape')).toBe(true);
      expect(h.frame.GetNetNavigatorFilter().GetValue()).toBe('');
      expect(children(tree, tree.GetRootItem()).length).toBeGreaterThan(nets.length);
    } finally {
      setEeschemaSettingsProvider(() => EESCHEMA_DEFAULTS);
      setUpdateEeschemaSettingsProvider(() => {});
    }
  });
});

describe('Tab and Shift+Tab', () => {
  it('step the leaves in tree order, wrapping at both ends', () => {
    const h = setUp();
    const tree = h.frame.GetNetNavigator();
    h.frame.RefreshNetNavigator();
    const all = leaves(tree);
    expect(all.length).toBeGreaterThan(2);

    const itemAt = (aId: wxTreeItemId) => dataOf(tree, aId).GetItem();

    tree.SelectItem(all.at(-1)!);
    expect(h.frame.SelectNextPrevNetNavigatorItem(true) === itemAt(all[0]!)).toBe(true);
    expect(tree.GetSelection().equals(all[0]!)).toBe(true);

    expect(h.frame.SelectNextPrevNetNavigatorItem(false) === itemAt(all.at(-1)!)).toBe(true);
    expect(h.frame.SelectNextPrevNetNavigatorItem(false) === itemAt(all.at(-2)!)).toBe(true);
  });

  it('do nothing with no row selected', () => {
    const h = setUp();
    h.frame.RefreshNetNavigator();

    expect(h.frame.SelectNextPrevNetNavigatorItem(true)).toBeNull();
  });
});

describe('the row menu', () => {
  it('Expand All, Collapse All (the root stays open), and no Find in Net Inspector off a net row', () => {
    const h = setUp();
    const tree = h.frame.GetNetNavigator();
    let shown: wxMenu | null = null;
    let choose: (aId: number) => void = () => {};
    tree.SetPopupMenuPresenter((aMenu, aOnSelect) => {
      shown = aMenu;
      choose = aOnSelect;
    });
    h.frame.RefreshNetNavigator();
    const net = children(tree, tree.GetRootItem())[0]!;

    h.frame.onNetNavigatorItemMenu(net);
    expect(shown!.GetMenuItems().map((i) => i.GetItemLabel())).toEqual([
      'Expand All',
      'Collapse All',
      'Find in Net Inspector',
    ]);
    // RefreshNetNavigator hangs no wxStringClientData on a net row, so upstream finds no name.
    expect(shown!.FindItem(ID_NET_NAVIGATOR.FIND_IN_INSPECTOR)!.IsEnabled()).toBe(false);

    choose(ID_NET_NAVIGATOR.EXPAND_ALL);
    expect(leaves(tree).every((l) => tree.IsVisible(l))).toBe(true);

    h.frame.onNetNavigatorItemMenu(net);
    choose(ID_NET_NAVIGATOR.COLLAPSE_ALL);
    expect(tree.IsExpanded(tree.GetRootItem())).toBe(true);
    expect(tree.IsExpanded(net)).toBe(false);
  });

  it('on the highlighted net, Find in Net Inspector clears the highlight and filters to it', async () => {
    const h = setUp();
    const tree = h.frame.GetNetNavigator();
    let choose: (aId: number) => void = () => {};
    let shown: wxMenu | null = null;
    tree.SetPopupMenuPresenter((aMenu, aOnSelect) => {
      shown = aMenu;
      choose = aOnSelect;
    });
    h.frame.RefreshNetNavigator();
    h.h.mouse = h.label.GetPosition();
    h.mgr.RunAction(SCH_ACTIONS.highlightNet);
    await flush();

    h.frame.onNetNavigatorContextMenu(new wxTreeItemId());
    expect(shown!.FindItem(ID_NET_NAVIGATOR.FIND_IN_INSPECTOR)!.IsEnabled()).toBe(true);
    choose(ID_NET_NAVIGATOR.FIND_IN_INSPECTOR);

    expect(h.frame.GetHighlightedConnection()).toBe('');
    expect(h.frame.GetNetNavigatorFilter().GetValue()).toBe(h.netName);
    expect(tree.GetItemText(tree.GetRootItem())).toBe('Nets');
  });
});

describe('GetNetNavigatorItemText', () => {
  it('names a label by its text and position, a pin by reference and number', () => {
    const h = setUp();
    const units = h.frame.GetUnitsProvider();
    const sheet = h.frame.GetCurrentSheet();
    const at = (v: number) => units.MessageTextFromValue(v);

    expect(GetNetNavigatorItemText(h.label, sheet, units)).toBe(
      `Label '${unescapeString(h.label.GetText())}' at (${at(h.label.GetPosition().x)}, ${at(h.label.GetPosition().y)})`,
    );
    expect(GetNetNavigatorItemText(h.wire, sheet, units)).toBe(
      `Wire from (${at(h.wire.GetStartPoint().x)}, ${at(h.wire.GetStartPoint().y)}) to (${at(h.wire.GetEndPoint().x)}, ${at(h.wire.GetEndPoint().y)})`,
    );

    const symbol = [...h.screen.Items().OfType(KICAD_T.SCH_SYMBOL_T)].find(
      (s) => !(s as SCH_SYMBOL).GetRef(sheet).startsWith('#'),
    ) as SCH_SYMBOL;
    const pin = symbol.GetPins(sheet)[0]!;
    const name = unescapeString(pin.GetShownName());
    expect(GetNetNavigatorItemText(pin, sheet, units)).toBe(
      `Symbol '${symbol.GetRef(sheet, true)}' pin '${unescapeString(pin.GetNumber())}'${name ? ` (${name})` : ''}`,
    );
  });
});

describe("the net map's unnamed entries", () => {
  it('get no row: "Skip bus member subgraphs for the moment"', () => {
    // None of the oracle schematics yields one (a bus member's subgraph, upstream), so the entry
    // is put in the live net map by hand, the shape upstream skips: an empty Name.
    const h = setUp();
    const tree = h.frame.GetNetNavigator();
    const netMap = h.frame.Schematic().ConnectionGraph().GetNetMap();
    const named = [...netMap].filter(([k]) => k.Name !== '').length;
    netMap.set({ Name: '', Netcode: 99999 }, []);

    h.frame.RefreshNetNavigator();

    const rows = texts(tree, children(tree, tree.GetRootItem()));
    expect(rows.includes('')).toBe(false);
    expect(rows.length).toBe(named);
  });
});
