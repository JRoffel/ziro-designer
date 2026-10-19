// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * `std::multimap<K, V>`, for the places KiCad keeps one: CACHED_CONTAINER's FREE_CHUNK_MAP.
 *
 * Only what the callers can observe is ported:
 *  - iteration is in key order (`std::less<K>`), and equal keys keep their insertion order,
 *    as `insert` places a new element at the upper bound of its equal range;
 *  - `lower_bound( k )` is the first element whose key is not less than k, or `end()`;
 *  - an iterator stays valid until its own element is erased, whatever else is inserted.
 *
 * `_Rb_tree` gives each of those in O(log n). Here the distinct keys are a sorted array
 * (binary search) and each key's elements a queue, so insert, lower_bound and erasing the
 * first of a key are O(log k) plus the shift when a new key arrives.
 */

/** An element, and the iterator that points at it: `it->first`, `it->second`. */
export type MULTIMAP_ENTRY<K, V> = [K, V];

interface Bucket<K, V> {
  entries: MULTIMAP_ENTRY<K, V>[];
  /// The first entry not yet erased.
  head: number;
}

export class STD_MULTIMAP<K, V> implements Iterable<MULTIMAP_ENTRY<K, V>> {
  /// The keys that hold at least one element, ascending.
  private m_keys: K[] = [];
  private m_buckets = new Map<K, Bucket<K, V>>();
  private m_size = 0;

  /** \a aLess is the map's Compare (std::less<K> by default). */
  constructor(private readonly m_less: (a: K, b: K) => boolean = (a, b) => a < b) {}

  size(): number {
    return this.m_size;
  }

  empty(): boolean {
    return this.m_size === 0;
  }

  /** The past-the-end iterator. */
  end(): MULTIMAP_ENTRY<K, V> | null {
    return null;
  }

  /** `insert( std::make_pair( aKey, aValue ) )`: after every element with an equal key. */
  insert(aEntry: MULTIMAP_ENTRY<K, V>): MULTIMAP_ENTRY<K, V> {
    const key = aEntry[0];
    let bucket = this.m_buckets.get(key);

    if (!bucket) {
      bucket = { entries: [], head: 0 };
      this.m_buckets.set(key, bucket);
      this.m_keys.splice(this.keyLowerBound(key), 0, key);
    }

    bucket.entries.push(aEntry);
    this.m_size++;
    return aEntry;
  }

  /** `lower_bound( aKey )`: the first element whose key is not less than aKey, or end(). */
  lower_bound(aKey: K): MULTIMAP_ENTRY<K, V> | null {
    const i = this.keyLowerBound(aKey);

    if (i === this.m_keys.length) return this.end();

    const bucket = this.m_buckets.get(this.m_keys[i]!)!;
    return bucket.entries[bucket.head]!;
  }

  /** `erase( aIt )`. */
  erase(aIt: MULTIMAP_ENTRY<K, V>): void {
    const key = aIt[0];
    const bucket = this.m_buckets.get(key);

    if (!bucket) throw new Error('STD_MULTIMAP::erase: not an element of this map');

    if (bucket.entries[bucket.head] === aIt) {
      bucket.head++;
    } else {
      const at = bucket.entries.indexOf(aIt, bucket.head);

      if (at < 0) throw new Error('STD_MULTIMAP::erase: not an element of this map');

      bucket.entries.splice(at, 1);
    }

    this.m_size--;

    if (bucket.head === bucket.entries.length) {
      this.m_buckets.delete(key);
      this.m_keys.splice(this.keyLowerBound(key), 1);
    } else if (bucket.head * 2 > bucket.entries.length) {
      // Drop the erased front, so a key that is erased from as often as it is inserted into
      // does not hold every element it ever had.
      bucket.entries.splice(0, bucket.head);
      bucket.head = 0;
    }
  }

  clear(): void {
    this.m_keys = [];
    this.m_buckets.clear();
    this.m_size = 0;
  }

  /** `begin()` to `end()`. */
  *[Symbol.iterator](): IterableIterator<MULTIMAP_ENTRY<K, V>> {
    for (const key of this.m_keys) {
      const bucket = this.m_buckets.get(key)!;

      for (let i = bucket.head; i < bucket.entries.length; i++) yield bucket.entries[i]!;
    }
  }

  private keyLowerBound(aKey: K): number {
    let lo = 0;
    let hi = this.m_keys.length;

    while (lo < hi) {
      const mid = (lo + hi) >>> 1;

      if (this.m_less(this.m_keys[mid]!, aKey)) lo = mid + 1;
      else hi = mid;
    }

    return lo;
  }
}
