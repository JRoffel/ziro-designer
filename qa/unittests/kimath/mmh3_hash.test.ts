// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * mmh3HashToString against KiCad's own MMH3_HASH: every digest is what
 * qa/probes/mmh3_probe.cpp, built on the pinned reference's mmh3_hash.h, printed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mmh3HashToString, mmh3HashToStringV1 } from '@ziroeda/kimath/src/mmh3_hash.js';
import { describe, expect, it } from 'vitest';

const PROBE = JSON.parse(
  readFileSync(resolve(__dirname, '../../data/kimath/mmh3_probe.json'), 'utf8'),
) as {
  bytes: { seed: number; data: string; digest: string }[];
  words: { words: number[]; digest: string }[];
};

const fromHex = (aHex: string) =>
  Uint8Array.from(aHex.match(/../g) ?? [], (b) => Number.parseInt(b, 16));

// 10.0.6's addData pads the tail to 4 bytes and counts the padding: mmh3HashToStringV1.
describe('MMH3_HASH::addData', () => {
  for (const c of PROBE.bytes) {
    it(`${c.data.length / 2} bytes`, () => {
      const data = fromHex(c.data);
      expect(mmh3HashToStringV1(data, c.seed)).toBe(c.digest);

      // The same bytes at an odd offset: no aligned word view, the words are assembled.
      const shifted = new Uint8Array(data.length + 1);
      shifted.set(data, 1);
      expect(mmh3HashToStringV1(shifted.subarray(1), c.seed)).toBe(c.digest);
    });
  }
});

// add( int32_t ) hashes whole words, so no tail is ever padded: mmh3HashToString.
describe('MMH3_HASH::add( int32_t ), as SHAPE_POLY_SET::checksum feeds it', () => {
  for (const c of PROBE.words) {
    it(`${c.words.length} words`, () => {
      const bytes = new Uint8Array(Int32Array.from(c.words).buffer);
      expect(mmh3HashToString(bytes, 0x68af835d)).toBe(c.digest);
    });
  }
});
