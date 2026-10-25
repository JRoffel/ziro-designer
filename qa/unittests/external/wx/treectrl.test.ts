// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * The wxGenericTreeCtrl model (external/wx/treectrl.ts) on the semantics the Net Navigator leans
 * on, and wxMenu's radio items (the navigator filter's gear menu).
 */
import { describe, expect, it } from 'vitest';
import { wxMenu } from '@ziroeda/wx/menu.js';
import { wxGenericTreeCtrl, type wxTreeItemId } from '@ziroeda/wx/treectrl.js';

function tree(): { t: wxGenericTreeCtrl; root: wxTreeItemId; a: wxTreeItemId; leaf: wxTreeItemId } {
  const t = new wxGenericTreeCtrl();
  const root = t.AddRoot('root');
  const a = t.AppendItem(root, 'a');
  const leaf = t.AppendItem(a, 'leaf');
  return { t, root, a, leaf };
}

describe('wxGenericTreeCtrl', () => {
  it('SortChildren is wxStrcmp: by code unit, capitals first', () => {
    const t = new wxGenericTreeCtrl();
    const root = t.AddRoot('r');
    for (const s of ['b', 'B', 'a', 'A10', 'A2']) t.AppendItem(root, s);

    t.SortChildren(root);

    const cookie = { index: 0 };
    const out: string[] = [];
    for (let c = t.GetFirstChild(root, cookie); c.IsOk(); c = t.GetNextChild(root, cookie))
      out.push(t.GetItemText(c));
    expect(out).toEqual(['A10', 'A2', 'B', 'a', 'b']);
  });

  it('a row is visible only under expanded ancestors; EnsureVisible opens them', () => {
    const { t, root, a, leaf } = tree();
    expect(t.IsVisible(leaf)).toBe(false);

    t.EnsureVisible(leaf);

    expect([t.IsExpanded(root), t.IsExpanded(a), t.IsVisible(leaf)]).toEqual([true, true, true]);
    expect(t.TakeEnsureVisible().equals(leaf)).toBe(true);
    expect(t.TakeEnsureVisible().IsOk()).toBe(false);
  });

  it('CollapseAll closes the root too; Expand does nothing to a leaf', () => {
    const { t, root, a, leaf } = tree();
    t.ExpandAll();
    expect([t.IsExpanded(root), t.IsExpanded(a)]).toEqual([true, true]);

    t.CollapseAll();
    expect([t.IsExpanded(root), t.IsExpanded(a)]).toEqual([false, false]);

    t.Expand(leaf);
    expect(t.IsExpanded(leaf)).toBe(false);
  });

  it('holds one selection, and DeleteAllItems drops it with the items', () => {
    const { t, a, leaf } = tree();
    t.SelectItem(a);
    t.SelectItem(leaf);
    expect(t.GetSelection().equals(leaf)).toBe(true);

    t.DeleteAllItems();
    expect([t.IsEmpty(), t.GetSelection().IsOk(), t.GetRootItem().IsOk()]).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('a frozen tree tells the page once, on the last Thaw', () => {
    const t = new wxGenericTreeCtrl();
    let painted = 0;
    t.SetChangeListener(() => painted++);

    t.Freeze();
    t.Freeze();
    const root = t.AddRoot('r');
    t.AppendItem(root, 'x');
    t.Thaw();
    expect(painted).toBe(0);
    t.Thaw();
    expect(painted).toBe(1);
  });
});

describe('wxMenu radio items', () => {
  it('start a run with its first item checked, and Check moves the mark', () => {
    const menu = new wxMenu();
    const one = menu.AppendRadioItem(1, 'One');
    const two = menu.AppendRadioItem(2, 'Two');
    expect([one.IsChecked(), two.IsChecked()]).toEqual([true, false]);

    two.Check();
    expect([one.IsChecked(), two.IsChecked()]).toEqual([false, true]);

    // Unchecking a radio item alone does nothing: a group always has one.
    two.Check(false);
    expect(two.IsChecked()).toBe(true);
  });

  it('a separate run is its own group', () => {
    const menu = new wxMenu();
    const a = menu.AppendRadioItem(1, 'A');
    menu.AppendSeparator();
    const b = menu.AppendRadioItem(2, 'B');
    expect([a.IsChecked(), b.IsChecked()]).toEqual([true, true]);
  });
});
