// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SYMBOL_LIBRARY_MANAGER, LIB_BUFFER and SYMBOL_BUFFER (eeschema/symbol_library_manager.cpp):
 * the symbol editor's edit buffers over the symbol library adapter, on a real library file read
 * and written through SCH_IO_KICAD_SEXPR.
 */
import {
  LIBRARY_TABLE,
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from '@ziroeda/common/libraries/library_table.js';
import { PGM_BASE, Pgm, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { MEMORY_FILESYSTEM, wxMountFileSystem, wxReadFileSync } from '@ziroeda/wx/filefn.js';
import { SymbolLibAdapter } from '@ziroeda/eeschema/project_sch.js';
import type { SCH_BASE_FRAME } from '@ziroeda/eeschema/sch_base_frame.js';
import { SCH_IO_KICAD_SEXPR } from '@ziroeda/eeschema/sch_io/kicad_sexpr/sch_io_kicad_sexpr.js';
import {
  SYMBOL_LIBRARY_MANAGER,
  SYMBOL_NAME_FILTER,
} from '@ziroeda/eeschema/symbol_library_manager.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const LIB = '/libs/mine.kicad_sym';

const prop = (aName: string, aValue: string) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))))`;

const LIB_TEXT = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "R" (in_bom yes) (on_board yes)
    ${prop('Reference', 'R')} ${prop('Value', 'R')}
    (symbol "R_0_1" (rectangle (start -1 -2) (end 1 2) (stroke (width 0) (type default)) (fill (type none)))))
  (symbol "R_Small" (extends "R")
    ${prop('Reference', 'R')} ${prop('Value', 'R_Small')})
  (symbol "C" (in_bom yes) (on_board yes)
    ${prop('Reference', 'C')} ${prop('Value', 'C')}))`;

let unmount: () => void = () => {};
let mgr: SYMBOL_LIBRARY_MANAGER;

/** What the file says now, read back through a fresh plugin. */
const inFile = (): string[] => {
  const names: string[] = [];
  new SCH_IO_KICAD_SEXPR().EnumerateSymbolLib(names, LIB);
  return names.sort();
};

beforeEach(() => {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  const fs = new MEMORY_FILESYSTEM();
  unmount = wxMountFileSystem('/libs', fs);
  fs.Write('mine.kicad_sym', new TextEncoder().encode(LIB_TEXT));
  Pgm()
    .GetLibraryManager()
    .SetTable(
      LIBRARY_TABLE_TYPE.SYMBOL,
      LIBRARY_TABLE_SCOPE.PROJECT,
      LIBRARY_TABLE.FromFile(
        '/libs/sym-lib-table',
        `(sym_lib_table (version 7) (lib (name "mine")(type "KiCad")(uri "${LIB}")(options "")(descr "")) (lib (name "a10")(type "KiCad")(uri "/libs/a10.kicad_sym")(options "")(descr "")) (lib (name "a9")(type "KiCad")(uri "/libs/a9.kicad_sym")(options "")(descr "")))`,
        LIBRARY_TABLE_SCOPE.PROJECT,
        LIBRARY_TABLE_TYPE.SYMBOL,
      ),
    );
  SymbolLibAdapter(null).LoadOne('mine');
  mgr = new SYMBOL_LIBRARY_MANAGER({ Prj: () => null } as unknown as SCH_BASE_FRAME);
});

afterEach(() => {
  unmount();
  SetPgm(null);
});

describe('SYMBOL_LIBRARY_MANAGER', () => {
  it('buffers a copy of the library symbol, unmodified', () => {
    const sym = mgr.GetBufferedSymbol('C', 'mine')!;

    expect(sym.GetName()).toBe('C');
    expect(sym.GetLibId().GetLibNickname()).toBe('mine');
    expect(mgr.GetBufferedSymbol('C', 'mine')).toBe(sym);
    expect(mgr.IsSymbolModified('C', 'mine')).toBe(false);
    expect(mgr.IsLibraryModified('mine')).toBe(false);
  });

  it('a derived symbol is buffered with its buffered parent', () => {
    const child = mgr.GetBufferedSymbol('R_Small', 'mine')!;

    expect(child.IsDerived()).toBe(true);
    expect(child.GetLibParent()).toBe(mgr.GetBufferedSymbol('R', 'mine'));
    expect(mgr.HasDerivedSymbols('R', 'mine')).toBe(true);
    const derived: string[] = [];
    expect(mgr.GetDerivedSymbolNames('R', 'mine', derived)).toBe(1);
    expect(derived).toEqual(['R_Small']);
  });

  it('lists the buffered names by filter', () => {
    const roots: string[] = [];
    const children: string[] = [];
    mgr.GetSymbolNames('mine', roots, SYMBOL_NAME_FILTER.ROOT_ONLY);
    mgr.GetSymbolNames('mine', children, SYMBOL_NAME_FILTER.DERIVED_ONLY);

    expect(roots.sort()).toEqual(['C', 'R']);
    expect(children).toEqual(['R_Small']);
    expect(mgr.SymbolNameInUse('r_small', 'mine')).toBe(true);
    expect(mgr.SymbolNameInUse('L', 'mine')).toBe(false);
  });

  it('an edit is the buffer, in place; revert puts the original back', () => {
    const sym = mgr.GetBufferedSymbol('C', 'mine')!;
    const edited = mgr.GetSymbol('C', 'mine')!;
    expect(edited).toBe(sym);

    const copy = mgr.GetBufferedSymbol('C', 'mine')!;
    copy.SetKeyWords('capacitor');
    mgr.UpdateSymbol(copy, 'mine');
    expect(mgr.IsSymbolModified('C', 'mine')).toBe(true);
    expect(mgr.IsLibraryModified('mine')).toBe(true);

    mgr.RevertSymbol('C', 'mine');
    expect(mgr.GetBufferedSymbol('C', 'mine')!.GetKeyWords()).toBe('');
    // The same object, assigned to: what held it sees the revert.
    expect(mgr.GetBufferedSymbol('C', 'mine')).toBe(sym);
  });

  it('a new symbol joins the buffer, modified', () => {
    const fresh = SymbolLibAdapter(null).LoadSymbol('mine', 'C')!;
    fresh.SetName('C_New');
    mgr.UpdateSymbol(fresh, 'mine');

    expect(mgr.SymbolExists('C_New', 'mine')).toBe(true);
    expect(mgr.IsSymbolModified('C_New', 'mine')).toBe(true);
    expect(mgr.GetBufferedSymbol('C_New', 'mine')!.GetLibId().GetLibNickname()).toBe('mine');
  });

  it('saving writes the buffers to the file; a rename drops the old name', () => {
    const sym = mgr.GetBufferedSymbol('C', 'mine')!;
    sym.SetName('C_Polarized');
    mgr.UpdateSymbolAfterRename(sym, 'C_Polarized', 'mine');

    expect(mgr.SaveLibrary('mine', LIB)).toBe(true);
    expect(inFile()).toEqual(['C_Polarized', 'R', 'R_Small']);
    expect(new TextDecoder().decode(wxReadFileSync(LIB)!)).toContain('(extends "R")');
  });

  it('removing a parent removes its children, and saving deletes them from the file', () => {
    mgr.GetBufferedSymbol('R', 'mine');
    expect(mgr.RemoveSymbol('R', 'mine')).toBe(true);

    expect(mgr.SymbolExists('R', 'mine')).toBe(false);
    expect(mgr.SymbolExists('R_Small', 'mine')).toBe(false);
    expect(mgr.IsLibraryModified('mine')).toBe(true);

    expect(mgr.SaveLibrary('mine', LIB)).toBe(true);
    expect(inFile()).toEqual(['C']);
    expect(mgr.IsLibraryModified('mine')).toBe(false);
  });

  it('library names sort as KiCad sorts them, and a new one is unique', () => {
    expect(mgr.GetLibraryNames()).toEqual(['a9', 'a10', 'mine']);
    expect(mgr.GetUniqueLibraryName()).toBe('New_Library');
    expect(mgr.LibraryExists('mine')).toBe(true);
    expect(mgr.LibraryExists('')).toBe(false);
  });

  it('reverting a library drops its buffers', () => {
    const sym = mgr.GetBufferedSymbol('C', 'mine')!;
    sym.SetKeyWords('x');
    mgr.UpdateSymbol(sym, 'mine');

    expect(mgr.RevertLibrary('mine')).toBe(true);
    expect(mgr.IsLibraryModified('mine')).toBe(false);
    expect(mgr.GetBufferedSymbol('C', 'mine')!.GetKeyWords()).toBe('');
  });
});
