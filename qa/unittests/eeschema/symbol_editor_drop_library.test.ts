// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * A symbol library dropped on the Symbol Editor: EDA_BASE_FRAME::OnDropFiles keeps the files whose
 * extension the frame accepts (`.kicad_sym` -> ACTIONS::ddAddLibrary, symbol_edit_frame.cpp:280),
 * SYMBOL_EDITOR_CONTROL::DdAddLibrary hands each to SYMBOL_EDIT_FRAME::DdAddLibrary, which adds it
 * to the project table and mails MAIL_RELOAD_LIB / MAIL_LIB_EDIT (:1280-1325).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { SetErrorPresenter } from '@ziroeda/common/confirm.js';
import { FRAME_T } from '@ziroeda/common/frame_type.js';
import { KIWAY } from '@ziroeda/common/kiway.js';
import { KIWAY_MAIL_EVENT } from '@ziroeda/common/kiway_mail.js';
import {
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from '@ziroeda/common/libraries/library_table.js';
import { MAIL_T } from '@ziroeda/common/mail_type.js';
import { Pgm } from '@ziroeda/common/pgm_base.js';
import { SymbolLibAdapter } from '@ziroeda/eeschema/project_sch.js';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

const SYM = LIBRARY_TABLE_TYPE.SYMBOL;
const DROPPED = `(kicad_symbol_lib (version 20241209) (generator "qa")
  (symbol "D" (in_bom yes) (on_board yes)
    (property "Reference" "D" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (property "Value" "D" (at 0 0 0) (effects (font (size 1.27 1.27))))))`;

let t: SYMBOL_EDIT_HARNESS;
let errors: string[];
let mails: [FRAME_T, MAIL_T, string][];
let libEdits: string[];

function setUp() {
  errors = [];
  mails = [];
  libEdits = [];
  SetErrorPresenter((aText) => errors.push(aText));
  t = symbolEditHarness(undefined, {
    libTreeSelectLibId: (aLibId) => libEdits.push(aLibId.Format()),
  });
  const kiway = new KIWAY({
    OnKiCadExit: () => {},
    Player: () => true,
    HasProjectManager: () => true,
    ShowProjectManager: () => {},
    CreateKiWindow: () => false,
  });
  const express = kiway.ExpressMail.bind(kiway);
  kiway.ExpressMail = (aDest, aCommand, aPayload, aSource) => {
    mails.push([aDest, aCommand, (aPayload as { value: string }).value]);
    return express(aDest, aCommand, aPayload, aSource);
  };
  t.frame.SetKiway(kiway);
  kiway.SetPlayerFrame(FRAME_T.FRAME_SCH_SYMBOL_EDITOR, t.frame);
  t.fs.Write('dropped.kicad_sym', new TextEncoder().encode(DROPPED));
}

afterEach(() => {
  t.dispose();
  SetErrorPresenter(() => {});
});

/** The actions a drop runs are coroutines; let them finish. */
const settle = () => new Promise((r) => setTimeout(r, 0));
const projectTable = () => Pgm().GetLibraryManager().Table(SYM, LIBRARY_TABLE_SCOPE.PROJECT)!;

describe('a library dropped on the Symbol Editor', () => {
  it('is added to the project table, saved, read, and announced', async () => {
    setUp();

    t.frame.OnDropFiles(['/libs/dropped.kicad_sym']);
    await settle();

    expect(errors).toEqual([]);
    expect(projectTable().HasRow('dropped')).toBe(true);
    expect(new TextDecoder().decode(t.fs.Read('sym-lib-table')!)).toContain('"dropped"');
    expect(SymbolLibAdapter(t.frame.Prj()).HasLibrary('dropped')).toBe(true);
    expect(mails).toEqual([
      [FRAME_T.FRAME_SCH_SYMBOL_EDITOR, MAIL_T.MAIL_RELOAD_LIB, '/libs/dropped.kicad_sym'],
      [FRAME_T.FRAME_SCH_SYMBOL_EDITOR, MAIL_T.MAIL_LIB_EDIT, '/libs/dropped.kicad_sym'],
    ]);
    // MAIL_LIB_EDIT found the new row: the library is current and selected in the tree.
    expect(t.frame.GetCurLib()).toBe('dropped');
    expect(libEdits).toEqual(['dropped:']);
  });

  it('takes only the extensions the frame accepts', async () => {
    setUp();
    t.fs.Write('notes.txt', new TextEncoder().encode('x'));

    expect(t.frame.IsDropAccepted('/libs/dropped.kicad_sym')).toBe(true);
    expect(t.frame.IsDropAccepted('/libs/notes.txt')).toBe(false);
    expect(t.frame.IsDropAccepted('/libs/kicad_sym')).toBe(false);

    t.frame.OnDropFiles(['/libs/notes.txt', '/libs/dropped.kicad_sym']);
    await settle();

    expect(errors).toEqual([]);
    expect(projectTable().HasRow('notes')).toBe(false);
    expect(projectTable().HasRow('dropped')).toBe(true);
    expect(mails.map((m) => m[2])).toEqual(['/libs/dropped.kicad_sym', '/libs/dropped.kicad_sym']);
  });

  it('refuses a library of a name the tables already have', async () => {
    setUp();

    t.frame.OnDropFiles(['/libs/mine.kicad_sym']);
    await settle();

    expect(errors).toEqual(["Library 'mine' already exists."]);
    expect(mails).toEqual([]);
  });

  // SYMBOL_LIBRARY_MANAGER::addLibrary's wxCHECK( optTable, false ): no project table to add to.
  it('says it could not open the library with no project table to add it to', async () => {
    setUp();
    Pgm().GetLibraryManager().SetTable(SYM, LIBRARY_TABLE_SCOPE.PROJECT, null);

    t.frame.OnDropFiles(['/libs/dropped.kicad_sym']);
    await settle();

    expect(errors).toEqual(['Could not open the library file.']);
    expect(mails).toEqual([]);
  });
});

describe('MAIL_RELOAD_LIB', () => {
  /**
   * Upstream's check is `HasLibrary( currentLib, true )` - present AND enabled - and GetCurLib
   * already forgets a library that is gone. So what empties the editor is the library being
   * disabled; one removed from the tables leaves its symbol on screen, as KiCad's does.
   */
  it('drops the current library, and its symbol, once it is disabled', () => {
    setUp();
    t.open();
    expect(t.frame.GetCurLib()).toBe('mine');

    projectTable()
      .Rows()
      .find((r) => r.Nickname() === 'mine')!
      .SetDisabled(true);
    t.frame.KiwayMailIn(
      new KIWAY_MAIL_EVENT(FRAME_T.FRAME_SCH_SYMBOL_EDITOR, MAIL_T.MAIL_RELOAD_LIB, { value: '' }),
    );

    expect(t.frame.GetCurLib()).toBe('');
    expect(t.frame.GetCurSymbol() === null).toBe(true);
  });

  it('keeps it while it is still there', () => {
    setUp();
    t.open();

    t.frame.KiwayMailIn(
      new KIWAY_MAIL_EVENT(FRAME_T.FRAME_SCH_SYMBOL_EDITOR, MAIL_T.MAIL_RELOAD_LIB, { value: '' }),
    );

    expect(t.frame.GetCurLib()).toBe('mine');
  });
});
