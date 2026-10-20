// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * Generated output is downloaded, not filed into the project (output_downloads.ts): one file as
 * itself, the files of one run as one zip with their folders.
 */
import { wxZipInputStream } from '@ziroeda/wx/zipstrm.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bundleOutputs,
  OUTPUT_DOWNLOADER,
  type OUTPUT_DOWNLOAD,
} from '@ziroeda/designer/src/output_downloads.js';

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);
/** A zip's entries by name. */
function unzip(aZip: Uint8Array): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  const zip = new wxZipInputStream(aZip);
  for (let e = zip.GetNextEntry(); e; e = zip.GetNextEntry()) out[e.GetName()] = e.Read()!;
  return out;
}

describe('bundleOutputs', () => {
  it('a lone file downloads as itself, under its base name', () => {
    const d = bundleOutputs(
      [{ path: 'gerbers/b-F_Cu.gbr', bytes: bytes('G04'), mime: 'text/plain' }],
      'b',
    )!;

    expect(d.name).toBe('b-F_Cu.gbr');
    expect(text(d.bytes)).toBe('G04');
    expect(d.mime).toBe('text/plain');
  });

  it('several files leave as one zip that keeps their folders', () => {
    const d = bundleOutputs(
      [
        { path: 'gerbers/b-F_Cu.gbr', bytes: bytes('F'), mime: '' },
        { path: '/gerbers/b-B_Cu.gbr', bytes: bytes('B'), mime: '' },
        { path: 'b.drl', bytes: bytes('D'), mime: '' },
      ],
      'board',
    )!;
    const zip = unzip(d.bytes);

    expect(d.name).toBe('board.zip');
    expect(d.mime).toBe('application/zip');
    expect(Object.keys(zip).sort()).toEqual(['b.drl', 'gerbers/b-B_Cu.gbr', 'gerbers/b-F_Cu.gbr']);
    expect(text(zip['gerbers/b-B_Cu.gbr']!)).toBe('B');
  });

  it('a path written twice in one run keeps the later file', () => {
    const d = bundleOutputs(
      [
        { path: 'a.txt', bytes: bytes('old'), mime: '' },
        { path: 'a.txt', bytes: bytes('new'), mime: '' },
      ],
      'p',
    )!;

    expect(d.name).toBe('a.txt');
    expect(text(d.bytes)).toBe('new');
  });

  it('nothing to download is nothing', () => {
    expect(bundleOutputs([], 'p')).toBeNull();
  });
});

describe('OUTPUT_DOWNLOADER', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gathers one run and downloads it once the run goes quiet, named after its folder', () => {
    const got: OUTPUT_DOWNLOAD[] = [];
    const dl = new OUTPUT_DOWNLOADER(
      () => 'board',
      600,
      (d) => got.push(d),
    );

    dl.Add('gerbers/F.gbr', bytes('F'), '');
    vi.advanceTimersByTime(400);
    dl.Add('gerbers/B.gbr', bytes('B'), '');
    vi.advanceTimersByTime(400);
    expect(got).toHaveLength(0);

    vi.advanceTimersByTime(300);
    expect(got).toHaveLength(1);
    expect(got[0]!.name).toBe('board-gerbers.zip');
    expect(Object.keys(unzip(got[0]!.bytes)).sort()).toEqual(['gerbers/B.gbr', 'gerbers/F.gbr']);
  });

  it('two runs apart are two downloads; files in different folders zip under the project name', () => {
    const got: OUTPUT_DOWNLOAD[] = [];
    const dl = new OUTPUT_DOWNLOADER(
      () => 'board',
      600,
      (d) => got.push(d),
    );

    dl.Add('report.txt', bytes('r'), 'text/plain');
    vi.advanceTimersByTime(700);
    dl.Add('gerbers/F.gbr', bytes('F'), '');
    dl.Add('b.drl', bytes('D'), '');
    vi.advanceTimersByTime(700);

    expect(got.map((d) => d.name)).toEqual(['report.txt', 'board.zip']);
  });
});
