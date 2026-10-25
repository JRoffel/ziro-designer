// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * `wxGenericTreeCtrl` (`wx/generic/treectlg.h`) as a model: the items, their text, client data,
 * expanded state and the single selection, filled and read by the frame's own code. GTK builds its
 * tree controls from the generic one, so the semantics are treectlg.cpp's. The page draws it and
 * reports clicks back (`SelectItem` then the frame's `wxEVT_TREE_SEL_CHANGED` handler).
 *
 * Only what a caller uses is here. A change listener stands in for the repaint wx does on its own.
 */

import type { wxMenu } from './menu.js';

/** `wxTreeItemData`: whatever a caller hangs on an item. */
export type wxTreeItemData = object;

/** `wxTreeItemId`: an item, compared by identity. A default-constructed id is not `IsOk()`. */
export class wxTreeItemId {
  /** @internal the item it names; null for an invalid id. */
  constructor(readonly m_item: wxGenericTreeItem | null = null) {}

  IsOk(): boolean {
    return this.m_item !== null;
  }

  equals(aOther: wxTreeItemId): boolean {
    return this.m_item === aOther.m_item;
  }
}

/** `wxGenericTreeItem`: one node. */
export class wxGenericTreeItem {
  readonly m_children: wxGenericTreeItem[] = [];
  m_isExpanded = false;

  constructor(
    readonly m_parent: wxGenericTreeItem | null,
    public m_text: string,
    public m_data: wxTreeItemData | null,
  ) {}
}

/** `wxTreeItemIdValue`: the cookie GetFirstChild hands GetNextChild; ours is the next index. */
export interface wxTreeItemIdValue {
  index: number;
}

export class wxGenericTreeCtrl {
  private m_anchor: wxGenericTreeItem | null = null;
  private m_current: wxGenericTreeItem | null = null;
  private m_frozen = 0;
  private m_onChange: (() => void) | null = null;
  /** The item EnsureVisible last asked the page to scroll to. */
  private m_ensureVisible: wxGenericTreeItem | null = null;

  /** The page's repaint hook. */
  SetChangeListener(aListener: (() => void) | null): void {
    this.m_onChange = aListener;
  }

  private changed(): void {
    if (this.m_frozen === 0) this.m_onChange?.();
  }

  // ----- creation ------------------------------------------------------------------------

  /** `AddRoot( text, image, selImage, data )`. The root is shown (no wxTR_HIDE_ROOT). */
  AddRoot(
    aText: string,
    _aImage = -1,
    _aSelImage = -1,
    aData: wxTreeItemData | null = null,
  ): wxTreeItemId {
    // wxCHECK_MSG( !m_anchor, ..., "tree can have only one root" )
    if (this.m_anchor) return new wxTreeItemId();

    this.m_anchor = new wxGenericTreeItem(null, aText, aData);
    this.changed();
    return new wxTreeItemId(this.m_anchor);
  }

  /** `AppendItem( parent, text, image, selImage, data )`. */
  AppendItem(
    aParent: wxTreeItemId,
    aText: string,
    _aImage = -1,
    _aSelImage = -1,
    aData: wxTreeItemData | null = null,
  ): wxTreeItemId {
    const parent = aParent.m_item;

    if (!parent) return new wxTreeItemId(); // wxCHECK_MSG( parent, ..., "item must have a parent" )

    const item = new wxGenericTreeItem(parent, aText, aData);
    parent.m_children.push(item);
    this.changed();
    return new wxTreeItemId(item);
  }

  /** `DeleteAllItems()`: the root and everything under it, and with them the selection. */
  DeleteAllItems(): void {
    this.m_anchor = null;
    this.m_current = null;
    this.m_ensureVisible = null;
    this.changed();
  }

  // ----- navigation ----------------------------------------------------------------------

  GetRootItem(): wxTreeItemId {
    return new wxTreeItemId(this.m_anchor);
  }

  IsEmpty(): boolean {
    return this.m_anchor === null;
  }

  GetItemParent(aItem: wxTreeItemId): wxTreeItemId {
    return new wxTreeItemId(aItem.m_item?.m_parent ?? null);
  }

  GetFirstChild(aItem: wxTreeItemId, aCookie: wxTreeItemIdValue): wxTreeItemId {
    aCookie.index = 0;
    return this.GetNextChild(aItem, aCookie);
  }

  GetNextChild(aItem: wxTreeItemId, aCookie: wxTreeItemIdValue): wxTreeItemId {
    const child = aItem.m_item?.m_children[aCookie.index] ?? null;

    if (child) aCookie.index++;

    return new wxTreeItemId(child);
  }

  GetNextSibling(aItem: wxTreeItemId): wxTreeItemId {
    const item = aItem.m_item;
    const parent = item?.m_parent;

    if (!item || !parent) return new wxTreeItemId();

    return new wxTreeItemId(parent.m_children[parent.m_children.indexOf(item) + 1] ?? null);
  }

  ItemHasChildren(aItem: wxTreeItemId): boolean {
    return (aItem.m_item?.m_children.length ?? 0) > 0;
  }

  GetChildrenCount(aItem: wxTreeItemId, aRecursively = true): number {
    const item = aItem.m_item;

    if (!item) return 0;

    let count = item.m_children.length;

    if (aRecursively)
      for (const child of item.m_children) count += this.GetChildrenCount(new wxTreeItemId(child));

    return count;
  }

  // ----- attributes ----------------------------------------------------------------------

  GetItemText(aItem: wxTreeItemId): string {
    return aItem.m_item?.m_text ?? '';
  }

  GetItemData(aItem: wxTreeItemId): wxTreeItemData | null {
    return aItem.m_item?.m_data ?? null;
  }

  // ----- expansion -----------------------------------------------------------------------

  IsExpanded(aItem: wxTreeItemId): boolean {
    return !!aItem.m_item?.m_isExpanded;
  }

  /** `Expand( item )`: a no-op on a leaf, as wx's is (an item with no children has no button). */
  Expand(aItem: wxTreeItemId): void {
    const item = aItem.m_item;

    if (!item || item.m_isExpanded || item.m_children.length === 0) return;

    item.m_isExpanded = true;
    this.changed();
  }

  Collapse(aItem: wxTreeItemId): void {
    const item = aItem.m_item;

    if (!item?.m_isExpanded) return;

    item.m_isExpanded = false;
    this.changed();
  }

  Toggle(aItem: wxTreeItemId): void {
    if (this.IsExpanded(aItem)) this.Collapse(aItem);
    else this.Expand(aItem);
  }

  /** `CollapseAll()` (treebase.cpp): `CollapseAllChildren( GetRootItem() )`, the root included. */
  CollapseAll(): void {
    const collapse = (aItem: wxGenericTreeItem): void => {
      aItem.m_isExpanded = false;
      for (const child of aItem.m_children) collapse(child);
    };

    if (this.m_anchor) collapse(this.m_anchor);

    this.changed();
  }

  /** `ExpandAll()` (treebase.cpp): every item with children, the root included. */
  ExpandAll(): void {
    const expand = (aItem: wxGenericTreeItem): void => {
      if (aItem.m_children.length) aItem.m_isExpanded = true;
      for (const child of aItem.m_children) expand(child);
    };

    if (this.m_anchor) expand(this.m_anchor);

    this.changed();
  }

  /**
   * `IsVisible( item )`: every ancestor expanded. (treectlg.cpp also asks whether the row is inside
   * the scrolled window; the page scrolls to an EnsureVisible'd row, so that half is the page's.)
   */
  IsVisible(aItem: wxTreeItemId): boolean {
    let parent = aItem.m_item?.m_parent ?? null;

    if (!aItem.m_item) return false;

    while (parent) {
      if (!parent.m_isExpanded) return false;
      parent = parent.m_parent;
    }

    return true;
  }

  /** `EnsureVisible( item )`: expand every ancestor, and have the page scroll the row into view. */
  EnsureVisible(aItem: wxTreeItemId): void {
    const item = aItem.m_item;

    if (!item) return;

    for (let parent = item.m_parent; parent; parent = parent.m_parent) parent.m_isExpanded = true;

    this.m_ensureVisible = item;
    this.changed();
  }

  /** The row the page should scroll to, once: reading it clears it. */
  TakeEnsureVisible(): wxTreeItemId {
    const item = this.m_ensureVisible;
    this.m_ensureVisible = null;
    return new wxTreeItemId(item);
  }

  // ----- selection -----------------------------------------------------------------------

  GetSelection(): wxTreeItemId {
    return new wxTreeItemId(this.m_current);
  }

  /** `SelectItem( item, select )`: single selection, so selecting one drops the last. */
  SelectItem(aItem: wxTreeItemId, aSelect = true): void {
    const item = aItem.m_item;

    if (!item) return;

    if (aSelect) this.m_current = item;
    else if (this.m_current === item) this.m_current = null;

    this.changed();
  }

  UnselectAll(): void {
    if (!this.m_current) return;

    this.m_current = null;
    this.changed();
  }

  // ----- sorting -------------------------------------------------------------------------

  /** `OnCompareItems`: `wxStrcmp` on the item text - case-sensitive, by code unit. */
  OnCompareItems(aItem1: wxTreeItemId, aItem2: wxTreeItemId): number {
    const a = this.GetItemText(aItem1);
    const b = this.GetItemText(aItem2);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /** `SortChildren( item )`: the direct children, by OnCompareItems. */
  SortChildren(aItem: wxTreeItemId): void {
    const item = aItem.m_item;

    if (!item || item.m_children.length < 2) return;

    item.m_children.sort((a, b) => this.OnCompareItems(new wxTreeItemId(a), new wxTreeItemId(b)));
    this.changed();
  }

  // ----- popup menus -------------------------------------------------------------------

  private m_popupPresenter: ((aMenu: wxMenu, aOnSelect: (aId: number) => void) => void) | null =
    null;

  /** The page's context menu: shows `aMenu`, calls back with the chosen item's id. */
  SetPopupMenuPresenter(
    aPresenter: ((aMenu: wxMenu, aOnSelect: (aId: number) => void) => void) | null,
  ): void {
    this.m_popupPresenter = aPresenter;
  }

  /**
   * `PopupMenu( menu )`: wx's is modal and dispatches the choice as a menu event; a page's menu
   * is not, so the choice comes back through `aOnSelect`.
   */
  PopupMenu(aMenu: wxMenu, aOnSelect: (aId: number) => void): void {
    this.m_popupPresenter?.(aMenu, aOnSelect);
  }

  // ----- freezing ------------------------------------------------------------------------

  Freeze(): void {
    this.m_frozen++;
  }

  Thaw(): void {
    if (this.m_frozen > 0 && --this.m_frozen === 0) this.m_onChange?.();
  }

  IsFrozen(): boolean {
    return this.m_frozen > 0;
  }
}
