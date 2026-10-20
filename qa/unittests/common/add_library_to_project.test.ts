// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * A library from the user's computer brought into the project: PCB_BASE_EDIT_FRAME::AddLibrary
 * and SYMBOL_EDIT_FRAME::AddLibraryFile, with the file copied in (a page cannot point a row at
 * the user's disk). The row is the one upstream inserts; the files land beside the table.
 */
import { describe, expect, it } from 'vitest';
import { AddFootprintLibraryToProject, parseFpLibTable } from '@ziroeda/common/fp_lib_table.js';
import { AddSymbolLibraryToProject } from '@ziroeda/eeschema/project_sym_lib_table.js';

const PRO = { name: 'Amp/Amp.kicad_pro', text: '{}' };
const MOD = '(footprint "R_0603" (layer "F.Cu"))';

describe('a footprint library folder', () => {
  it('lands under <name>.pretty beside the table, with a KiCad row at ${KIPRJMOD}', () => {
    const r = AddFootprintLibraryToProject([PRO], {
      name: 'MyParts.pretty',
      files: [
        { path: 'R_0603.kicad_mod', text: MOD },
        { path: 'R_0805.kicad_mod', text: MOD },
        { path: 'README.txt', text: 'x' },
        { path: '3d/R.step', text: 'x' },
      ],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nickname).toBe('MyParts');
    expect(r.files.map((f) => f.name)).toEqual([
      'Amp/MyParts.pretty/R_0603.kicad_mod',
      'Amp/MyParts.pretty/R_0805.kicad_mod',
      'Amp/fp-lib-table',
    ]);
    expect(parseFpLibTable(r.files.at(-1)!.text)).toEqual([
      expect.objectContaining({
        name: 'MyParts',
        type: 'KiCad',
        uri: '${KIPRJMOD}/MyParts.pretty',
      }),
    ]);
  });

  it('keeps the rows already in the table', () => {
    const table = AddFootprintLibraryToProject([PRO], {
      name: 'A.pretty',
      files: [{ path: 'x.kicad_mod', text: MOD }],
    });
    if (!table.ok) throw new Error(table.error);
    const r = AddFootprintLibraryToProject([PRO, ...table.files], {
      name: 'B',
      files: [{ path: 'y.kicad_mod', text: MOD }],
    });

    expect(r.ok && parseFpLibTable(r.files.at(-1)!.text).map((row) => row.name)).toEqual([
      'A',
      'B',
    ]);
    // A folder not named .pretty gets the extension: the project finds libraries by it.
    expect(r.ok && r.files[0]!.name).toBe('Amp/B.pretty/y.kicad_mod');
  });

  it('is refused over a library folder of the same name, or with no footprints', () => {
    const files = [PRO, { name: 'Amp/MyParts.pretty/old.kicad_mod', text: MOD }];

    expect(
      AddFootprintLibraryToProject(files, {
        name: 'MyParts.pretty',
        files: [{ path: 'new.kicad_mod', text: MOD }],
      }),
    ).toEqual({ ok: false, error: "The project already has a library folder 'MyParts.pretty'." });
    expect(
      AddFootprintLibraryToProject([PRO], {
        name: 'Empty.pretty',
        files: [{ path: 'a.txt', text: '' }],
      }).ok,
    ).toBe(false);
  });
});

describe('a symbol library file', () => {
  const LIB = '(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor"))';

  it('lands beside the table with a KiCad row at ${KIPRJMOD}', () => {
    const r = AddSymbolLibraryToProject([PRO], { name: 'MyParts.kicad_sym', text: LIB });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nickname).toBe('MyParts');
    expect(r.files.map((f) => f.name)).toEqual(['Amp/MyParts.kicad_sym', 'Amp/sym-lib-table']);
    expect(r.files[1]!.text).toContain('(uri "${KIPRJMOD}/MyParts.kicad_sym")');
  });

  it('is refused when any table already has the nickname, as upstream refuses it', () => {
    expect(
      AddSymbolLibraryToProject([PRO], { name: 'Device.kicad_sym', text: LIB }, ['Device']),
    ).toEqual({
      ok: false,
      error: "Library 'Device' already exists.",
    });
  });

  it('is refused over a different file of the same name; the same file is only registered', () => {
    const same = AddSymbolLibraryToProject([PRO, { name: 'Amp/X.kicad_sym', text: LIB }], {
      name: 'X.kicad_sym',
      text: LIB,
    });
    expect(same.ok && same.files.map((f) => f.name)).toEqual(['Amp/sym-lib-table']);
    expect(
      AddSymbolLibraryToProject([PRO, { name: 'Amp/X.kicad_sym', text: 'other' }], {
        name: 'X.kicad_sym',
        text: LIB,
      }).ok,
    ).toBe(false);
    expect(AddSymbolLibraryToProject([PRO], { name: 'notes.txt', text: '' }).ok).toBe(false);
  });
});
