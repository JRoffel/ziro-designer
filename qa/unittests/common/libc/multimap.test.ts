// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * STD_MULTIMAP against libstdc++ itself: every expectation is what
 * qa/probes/std_multimap_probe.cpp printed on this machine, replaying the calls
 * CACHED_CONTAINER makes on its FREE_CHUNK_MAP.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type MULTIMAP_ENTRY, STD_MULTIMAP } from '@ziroeda/libc/multimap.js';
import { describe, expect, it } from 'vitest';

type Op =
  | ['insert', number, number]
  | ['lower_bound', number, null]
  | ['reallocate', number, [number, number], number, number]
  | ['size', number]
  | ['walk', number, [number, number][]]
  | ['clear'];

const PROBE = JSON.parse(
  readFileSync(resolve(__dirname, '../../../data/common/libc/std_multimap_probe.json'), 'utf8'),
) as { runs: { ops: Op[]; final: [number, number][] }[] };

const walk = (aMap: STD_MULTIMAP<number, number>) => [...aMap].map(([k, v]) => [k, v]);

describe('std::multimap<unsigned int, unsigned int>', () => {
  PROBE.runs.forEach((run, n) => {
    it(`run ${n}: ${run.ops.length} calls`, () => {
      const map = new STD_MULTIMAP<number, number>();

      for (const op of run.ops) {
        switch (op[0]) {
          case 'insert':
            map.insert([op[1], op[2]]);
            break;
          case 'lower_bound':
            expect(map.lower_bound(op[1])).toBe(map.end());
            break;
          case 'reallocate': {
            const it = map.lower_bound(op[1]) as MULTIMAP_ENTRY<number, number>;
            expect(it).not.toBe(map.end());
            expect([it[0], it[1]]).toEqual(op[2]);
            map.insert([op[3], op[4]]);
            map.erase(it);
            break;
          }
          case 'size':
            expect(map.size()).toBe(op[1]);
            break;
          case 'walk':
            expect(map.size()).toBe(op[1]);
            expect(walk(map)).toEqual(op[2]);
            break;
          case 'clear':
            map.clear();
            break;
        }
      }

      expect(walk(map)).toEqual(run.final);
    });
  });

  it('erases a held element that is not the first of its key', () => {
    const map = new STD_MULTIMAP<number, number>();
    map.insert([4, 0]);
    const second = map.insert([4, 10]);
    map.insert([4, 20]);

    map.erase(second);

    expect(walk(map)).toEqual([
      [4, 0],
      [4, 20],
    ]);
    expect(map.lower_bound(4)).toEqual([4, 0]);
  });
});
