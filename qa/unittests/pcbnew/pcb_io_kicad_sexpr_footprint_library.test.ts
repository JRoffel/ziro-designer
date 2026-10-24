// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * PCB_IO_KICAD_SEXPR as a footprint library plugin (pcb_io_kicad_sexpr.cpp:85-276, 3221-3620): a
 * `.pretty` folder of `.kicad_mod` files read through FP_CACHE, written one footprint at a time,
 * created and deleted - on a mounted filesystem, as the library adapter will ask it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IO_ERROR } from '@ziroeda/common/exceptions.js';
import { PCB_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import { ANGLE_90 } from '@ziroeda/kimath/src/geometry/eda_angle.js';
import { BOARD } from '@ziroeda/pcbnew/board.js';
import { MEMORY_FILESYSTEM, wxDirExists, wxMountFileSystem } from '@ziroeda/wx/filefn.js';
import {
  PCB_IO_KICAD_SEXPR,
  ParseFootprintFile,
} from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';

const LIB = '/L/My.pretty';
const dec = new TextDecoder();
const enc = new TextEncoder();

const FP = (aName: string, aLayer = 'F.Cu') => `(footprint "${aName}"
  (version 20241229)
  (generator "pcbnew")
  (layer "${aLayer}")
  (uuid "0f000000-0000-0000-0000-00000000000${aName.length}")
  (pad "1" smd rect (at 0 0) (size 1 1) (layers "${aLayer}"))
)
`;

let fs: MEMORY_FILESYSTEM;
let unmount: () => void;

beforeEach(() => {
  fs = new MEMORY_FILESYSTEM();
  unmount = wxMountFileSystem('/L', fs);
});

afterEach(() => unmount());

const names = (aIo: PCB_IO_KICAD_SEXPR, aBestEfforts = true): string[] => {
  const out: string[] = [];
  aIo.FootprintEnumerate(out, LIB, aBestEfforts);
  return out.sort();
};

describe('a footprint library', () => {
  it('is created empty, and not over one that is there', () => {
    const io = new PCB_IO_KICAD_SEXPR();

    io.CreateLibrary(LIB);

    expect(wxDirExists(LIB)).toBe(true);
    expect(names(io)).toEqual([]);
    expect(() => io.CreateLibrary(LIB)).toThrow(`Cannot overwrite library path '${LIB}'.`);
  });

  it('lists and loads the footprints its folder holds, a copy each time', () => {
    fs.Write('My.pretty/R.kicad_mod', enc.encode(FP('R')));
    fs.Write('My.pretty/notes.txt', enc.encode('x'));
    const io = new PCB_IO_KICAD_SEXPR();

    expect(names(io)).toEqual(['R']);
    expect(io.FootprintExists(LIB, 'R')).toBe(true);
    expect(io.FootprintExists(LIB, 'C')).toBe(false);

    const kept = io.FootprintLoad(LIB, 'R', true)!;
    const fresh = io.FootprintLoad(LIB, 'R', false)!;

    expect(kept.m_Uuid).toBe('0f000000-0000-0000-0000-000000000001');
    expect(fresh.m_Uuid).not.toBe(kept.m_Uuid);
    expect(kept === io.FootprintLoad(LIB, 'R', true)).toBe(false);
    expect(io.FootprintLoad(LIB, 'C')).toBeNull();
  });

  // FP_CACHE::Load: `footprint->SetFPID( LIB_ID( wxEmptyString, fpName ) )`, fpName the file's.
  it('names each footprint for its file, whatever the file calls it', () => {
    fs.Write('My.pretty/R.kicad_mod', enc.encode(FP('Other')));
    const io = new PCB_IO_KICAD_SEXPR();

    expect(names(io)).toEqual(['R']);
    expect(io.FootprintLoad(LIB, 'R')!.GetFPID().GetLibItemName()).toBe('R');
  });

  it('reads only the footprint files of the folder', () => {
    fs.Write('My.pretty/R.kicad_mod', enc.encode(FP('R')));
    fs.Write('My.pretty/notes.txt', enc.encode('not a footprint'));

    expect(names(new PCB_IO_KICAD_SEXPR(), false)).toEqual(['R']);
  });

  it('sees a footprint written into the folder behind its back', () => {
    fs.Write('My.pretty/R.kicad_mod', enc.encode(FP('R')));
    const io = new PCB_IO_KICAD_SEXPR();
    expect(names(io)).toEqual(['R']);

    fs.Write('My.pretty/CC.kicad_mod', enc.encode(FP('CC')));

    expect(names(io)).toEqual(['CC', 'R']);
  });

  it('keeps the footprints that read, and says which file did not', () => {
    fs.Write('My.pretty/R.kicad_mod', enc.encode(FP('R')));
    fs.Write('My.pretty/Bad.kicad_mod', enc.encode('(footprint "Bad" (pad'));
    const io = new PCB_IO_KICAD_SEXPR();

    expect(names(io, true)).toEqual(['R']);

    let thrown: unknown = null;
    try {
      names(new PCB_IO_KICAD_SEXPR(), false);
    } catch (e) {
      thrown = e;
    }
    expect(thrown instanceof IO_ERROR).toBe(true);
    expect((thrown as Error).message).toMatch(
      /^Unable to read file '\/L\/My\.pretty\/Bad\.kicad_mod'\n/,
    );
  });

  it('saves a footprint unrotated, on the front, under its name, replacing one of that name', () => {
    const io = new PCB_IO_KICAD_SEXPR();
    io.CreateLibrary(LIB);
    // A board's footprint, as the editors save one: the flip goes through its board's layers.
    const board = new BOARD();
    const fp = ParseFootprintFile(FP('Q', 'B.Cu'));
    board.Add(fp);
    fp.SetFPID(new LIB_ID('My', 'Q'));
    fp.SetOrientation(ANGLE_90);

    io.FootprintSave(LIB, fp);

    const saved = ParseFootprintFile(dec.decode(fs.Read('My.pretty/Q.kicad_mod')!));
    expect(saved.GetLayer()).toBe(PCB_LAYER_ID.F_Cu);
    expect(saved.GetOrientation().AsDegrees()).toBe(0);
    // The caller's footprint is not the one changed.
    expect(fp.GetLayer()).toBe(PCB_LAYER_ID.B_Cu);
    expect(names(io)).toEqual(['Q']);

    fp.SetFPID(new LIB_ID('My', 'Q'));
    fp.SetValue('second');
    io.FootprintSave(LIB, fp);

    expect(names(io)).toEqual(['Q']);
    expect(dec.decode(fs.Read('My.pretty/Q.kicad_mod')!)).toContain('second');
  });

  it('saves into a single file named for it, the folder being the library', () => {
    const io = new PCB_IO_KICAD_SEXPR();
    io.CreateLibrary(LIB);
    const fp = ParseFootprintFile(FP('Q'));
    fp.SetFPID(new LIB_ID('My', 'Q'));

    io.FootprintSave(`${LIB}/Other.kicad_mod`, fp);

    expect(fs.Read('My.pretty/Other.kicad_mod')).not.toBeNull();
    expect(fs.Read('My.pretty/Q.kicad_mod')).toBeNull();
  });

  // validateCache's FP_CACHE::Load throws first: the "does not exist, create it?" question after
  // it is only for a cache already read from a folder since removed.
  it('writes nothing into a library folder that is not there', () => {
    const io = new PCB_IO_KICAD_SEXPR();
    const fp = ParseFootprintFile(FP('Q'));
    fp.SetFPID(new LIB_ID('My', 'Q'));

    expect(() => io.FootprintSave(LIB, fp)).toThrow(`Footprint library '${LIB}' not found.`);
    expect(wxDirExists(LIB)).toBe(false);
  });

  // Told not to re-read the folder, the plugin still finds it gone: FootprintSave's "does not
  // exist, create it?" - which, with no window to ask from, writes nothing.
  it('writes nothing into a library folder removed since it was read', () => {
    fs.Write('My.pretty/R.kicad_mod', enc.encode(FP('R')));
    const io = new PCB_IO_KICAD_SEXPR();
    expect(names(io)).toEqual(['R']);
    fs.Remove('My.pretty/R.kicad_mod');
    const fp = ParseFootprintFile(FP('Q'));
    fp.SetFPID(new LIB_ID('My', 'Q'));

    io.FootprintSave(LIB, fp, new Map([['skip_cache_validation', '']]));

    expect(wxDirExists(LIB)).toBe(false);
  });

  it('refuses to write into a read-only library', () => {
    fs.Write('My.pretty/R.kicad_mod', enc.encode(FP('R')));
    fs.ReadOnly = true;
    const io = new PCB_IO_KICAD_SEXPR();
    const fp = ParseFootprintFile(FP('Q'));
    fp.SetFPID(new LIB_ID('My', 'Q'));

    expect(io.IsLibraryWritable(LIB)).toBe(false);
    expect(() => io.FootprintSave(LIB, fp)).toThrow(`Library '${LIB}' is read only.`);
    expect(() => io.FootprintDelete(LIB, 'R')).toThrow(`Library '${LIB}' is read only.`);
  });

  it('deletes a footprint and its file, and says when there is no such footprint', () => {
    fs.Write('My.pretty/R.kicad_mod', enc.encode(FP('R')));
    fs.Write('My.pretty/CC.kicad_mod', enc.encode(FP('CC')));
    const io = new PCB_IO_KICAD_SEXPR();

    io.FootprintDelete(LIB, 'R');

    expect(fs.Read('My.pretty/R.kicad_mod')).toBeNull();
    expect(names(io)).toEqual(['CC']);
    expect(() => io.FootprintDelete(LIB, 'R')).toThrow(`Library '${LIB}' has no footprint 'R'.`);
  });

  it('deletes the whole library, but not a folder with something else in it', () => {
    fs.Write('My.pretty/R.kicad_mod', enc.encode(FP('R')));
    const io = new PCB_IO_KICAD_SEXPR();

    expect(io.DeleteLibrary('/L/None.pretty')).toBe(false);
    expect(io.DeleteLibrary(LIB)).toBe(true);
    expect(wxDirExists(LIB)).toBe(false);

    fs.Write('My.pretty/R.kicad_mod', enc.encode(FP('R')));
    fs.Write('My.pretty/readme.md', enc.encode('x'));

    expect(() => io.DeleteLibrary(LIB)).toThrow(
      `Unexpected file '${LIB}/readme.md' found in library path '${LIB}'.`,
    );
    expect(fs.Read('My.pretty/R.kicad_mod')).not.toBeNull();
  });
});
