// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `RC_TREE_MODEL::PrevMarker` / `NextMarker` (common/rc_item.cpp), which DIALOG_ERC and
 * DIALOG_DRC step their trees with. Three behaviours here are each the kind of thing "improved"
 * by accident: neither direction wraps; with nothing selected Next takes the first marker and
 * Prev the last; and a selected child row counts as its marker.
 */
import { niluuid } from '@ziroeda/common/kiid.js';
import {
  RC_ITEM,
  RC_ITEMS_PROVIDER,
  RC_TREE_MODEL,
  type RC_TREE_FRAME,
  RC_TREE_VIEW_STATE,
} from '@ziroeda/common/rc_item.js';
import { RPT_SEVERITY_ERROR } from '@ziroeda/common/reporter.js';
import { UNITS_PROVIDER } from '@ziroeda/common/units_provider.js';
import { schIUScale } from '@ziroeda/common/eda_units.js';
import { describe, expect, it } from 'vitest';

class PROVIDER extends RC_ITEMS_PROVIDER {
  constructor(private readonly m_items: RC_ITEM[]) {
    super();
  }
  SetSeverities(): void {}
  GetSeverities(): number {
    return RPT_SEVERITY_ERROR;
  }
  GetCount(): number {
    return this.m_items.length;
  }
  GetItem(aIndex: number): RC_ITEM | null {
    return this.m_items[aIndex] ?? null;
  }
  DeleteItem(aIndex: number): void {
    this.m_items.splice(aIndex, 1);
  }
}

const FRAME: RC_TREE_FRAME = {
  ResolveItem: () => null,
  GetSeverity: () => RPT_SEVERITY_ERROR,
  GetUnitsProvider: () => new UNITS_PROVIDER(schIUScale, 'mm'),
};

/** A tree of \a aCount markers, each with one item child; the markers and the view. */
function tree(aCount: number) {
  const items = Array.from({ length: aCount }, (_, i) => {
    const item = new RC_ITEM();
    item.SetErrorMessage(`m${i}`);
    item.SetItems(`00000000-0000-0000-0000-00000000000${i + 1}`, niluuid);
    return item;
  });
  const view = new RC_TREE_VIEW_STATE();
  const model = new RC_TREE_MODEL(FRAME, view);
  model.Update(new PROVIDER(items), RPT_SEVERITY_ERROR);
  const markers = model.GetTree();
  const selected = (): number | null => {
    const node = view.GetSelection();
    return node ? markers.indexOf(node) : null;
  };
  return { model, view, markers, selected };
}

describe('RC_TREE_MODEL::NextMarker / PrevMarker', () => {
  it('moves one marker at a time in each direction', () => {
    const { model, view, markers, selected } = tree(3);
    view.Select(markers[0]!);
    model.NextMarker();
    expect(selected()).toBe(1);
    model.NextMarker();
    expect(selected()).toBe(2);
    model.PrevMarker();
    expect(selected()).toBe(1);
    model.PrevMarker();
    expect(selected()).toBe(0);
  });

  it('does not wrap at either end', () => {
    const { model, view, markers, selected } = tree(3);
    view.Select(markers[2]!);
    model.NextMarker();
    expect(selected()).toBe(2);
    view.Select(markers[0]!);
    model.PrevMarker();
    expect(selected()).toBe(0);
  });

  it('with nothing selected, Next takes the first marker and Prev the last', () => {
    const next = tree(3);
    next.model.NextMarker();
    expect(next.selected()).toBe(0);

    const prev = tree(3);
    prev.model.PrevMarker();
    expect(prev.selected()).toBe(2);
  });

  it('an empty tree moves nowhere', () => {
    const { model, selected } = tree(0);
    model.NextMarker();
    model.PrevMarker();
    expect(selected()).toBeNull();
  });

  it('steps from a selected item row as from its marker', () => {
    const { model, view, markers, selected } = tree(3);
    view.Select(markers[1]!.m_Children[0]!);
    model.NextMarker();
    expect(selected()).toBe(2);
    view.Select(markers[1]!.m_Children[0]!);
    model.PrevMarker();
    expect(selected()).toBe(0);
  });
});
