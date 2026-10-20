// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * COLLECTOR::Remove( EDA_ITEM* ) is std::erase_if: every copy goes, the rest keep their order.
 * The by-index form erases one slot.
 */
import { COLLECTOR } from '@ziroeda/common/collector.js';
import type { EDA_ITEM } from '@ziroeda/common/eda_item.js';
import { describe, expect, it } from 'vitest';

const items = ['a', 'b', 'c', 'd'].map((name) => ({ name }) as unknown as EDA_ITEM);
const [a, b, c, d] = items as [EDA_ITEM, EDA_ITEM, EDA_ITEM, EDA_ITEM];

function collector(aList: EDA_ITEM[]): COLLECTOR {
  const col = new COLLECTOR();

  for (const item of aList) col.Append(item);

  return col;
}

const names = (aCol: COLLECTOR): string[] =>
  Array.from(
    { length: aCol.GetCount() },
    (_, i) => (aCol.At(i) as unknown as { name: string }).name,
  );

describe('COLLECTOR::Remove', () => {
  it('removes the one copy and keeps the order', () => {
    const col = collector([a, b, c, d]);
    col.Remove(b);
    expect(names(col)).toEqual(['a', 'c', 'd']);
  });

  it('removes every copy', () => {
    const col = collector([a, b, c, b, d, b]);
    col.Remove(b);
    expect(names(col)).toEqual(['a', 'c', 'd']);
  });

  it('leaves the list alone for an item it does not hold', () => {
    const col = collector([a, c]);
    col.Remove(d);
    expect(names(col)).toEqual(['a', 'c']);
  });

  it('by index, erases that slot only', () => {
    const col = collector([a, b, a]);
    col.Remove(2);
    expect(names(col)).toEqual(['a', 'b']);
  });
});
