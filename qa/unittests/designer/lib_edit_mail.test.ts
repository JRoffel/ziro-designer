// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * `SYMBOL_EDIT_FRAME::KiwayMailIn`'s MAIL_LIB_EDIT and `FOOTPRINT_EDIT_FRAME::
 * KiwayMailIn`'s MAIL_FP_EDIT: the project manager's double-click on a library
 * file (`PROJECT_TREE_ITEM::Activate`), arriving at an editor that is running
 * or still mounting.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { FRAME_T } from '@ziroeda/common/frame_type.js';
import { KIWAY } from '@ziroeda/common/kiway.js';
import { SetErrorPresenter } from '@ziroeda/common/confirm.js';
import { LIBRARY_MANAGER } from '@ziroeda/common/libraries/library_manager.js';
import { LIBRARY_TABLE_TYPE } from '@ziroeda/common/libraries/library_table.js';
import { MAIL_T } from '@ziroeda/common/mail_type.js';
import { Pgm } from '@ziroeda/common/pgm_base.js';
import { wxSetWorkingDirectory } from '@ziroeda/wx/filefn.js';
import { wxSetEnv, wxUnsetEnv } from '@ziroeda/wx/utils.js';
import { SYMBOL_EDIT_FRAME } from '@ziroeda/eeschema/symbol_editor/symbol_edit_frame.js';
import { FOOTPRINT_EDIT_FRAME } from '@ziroeda/pcbnew/footprint_edit_frame.js';
import {
  type SYMBOL_EDIT_HARNESS,
  symbolEditHarness,
} from '../eeschema/support/symbol_edit_harness.js';

const makeKiway = (shown: FRAME_T[] = []) =>
  new KIWAY({
    OnKiCadExit: () => {},
    Player: (t) => {
      shown.push(t);
      return true;
    },
    HasProjectManager: () => true,
    ShowProjectManager: () => {},
    CreateKiWindow: () => false,
  });

describe('MAIL_LIB_EDIT', () => {
  let t: SYMBOL_EDIT_HARNESS;
  let errors: string[][];
  let tree: string[];

  const setUp = (): void => {
    errors = [];
    tree = [];
    SetErrorPresenter((aText, aExtra) => errors.push([aText, aExtra]));
    t = symbolEditHarness(undefined, {
      libTreeSelectLibId: (aLibId) => tree.push(`select ${aLibId.Format()}`),
      libTreeExpandLibId: (aLibId) => tree.push(`expand ${aLibId.Format()}`),
      libTreeCenterLibId: (aLibId) => tree.push(`center ${aLibId.Format()}`),
    });
  };
  const mail = (aPayload: string): void => {
    const kiway = makeKiway();
    kiway.SetPlayerFrame(FRAME_T.FRAME_SCH_SYMBOL_EDITOR, t.frame);
    kiway.ExpressMail(FRAME_T.FRAME_SCH_SYMBOL_EDITOR, MAIL_T.MAIL_LIB_EDIT, { value: aPayload });
  };

  afterEach(() => {
    t.dispose();
    wxSetWorkingDirectory('/');
    SetErrorPresenter(() => {});
  });

  it('makes the library whose row names the file current, and shows it in the tree', () => {
    setUp();
    mail('/libs/mine.kicad_sym');

    expect(errors).toEqual([]);
    expect(t.frame.GetCurLib()).toBe('mine');
    expect(tree).toEqual(['select mine:', 'expand mine:', 'center mine:']);
  });

  it('compares the file as wxFileName does: against the working directory, dots folded', () => {
    setUp();
    wxSetWorkingDirectory('/libs');
    mail('mine.kicad_sym');
    expect(t.frame.GetCurLib()).toBe('mine');

    t.frame.SetCurLib('');
    mail('/libs/sub/../mine.kicad_sym');
    expect(t.frame.GetCurLib()).toBe('mine');
  });

  it('matches the row by its substituted URI: a project library under ${KIPRJMOD}', () => {
    setUp();
    Pgm()
      .GetLibraryManager()
      .GetRow(LIBRARY_TABLE_TYPE.SYMBOL, 'mine')!
      .SetURI('${KIPRJMOD}/mine.kicad_sym');
    wxSetEnv('KIPRJMOD', '/libs');
    mail('/libs/mine.kicad_sym');
    wxUnsetEnv('KIPRJMOD');

    expect(errors).toEqual([]);
    expect(t.frame.GetCurLib()).toBe('mine');
  });

  it("refuses a file no row names, with upstream's message", () => {
    setUp();
    mail('/libs/other.kicad_sym');

    expect(t.frame.GetCurLib()).toBe('');
    expect(tree).toEqual([]);
    expect(errors).toEqual([
      [
        'Library not found in symbol library table.',
        "The current configuration does not include the symbol library '/libs/other.kicad_sym'.\nUse Manage Symbol Libraries to edit the configuration.",
      ],
    ]);
  });

  it('refuses a disabled library', () => {
    setUp();
    Pgm().GetLibraryManager().GetRow(LIBRARY_TABLE_TYPE.SYMBOL, 'mine')!.SetDisabled(true);
    mail('/libs/mine.kicad_sym');

    expect(t.frame.GetCurLib()).toBe('');
    expect(tree).toEqual([]);
    expect(errors).toEqual([
      [
        'Symbol library not enabled.',
        "The symbol library 'mine' is not enabled in the current configuration.\nUse Manage Symbol Libraries to edit the configuration.",
      ],
    ]);
  });

  it('ignores an empty payload and a footprint mail', () => {
    setUp();
    const kiway = makeKiway();
    kiway.SetPlayerFrame(FRAME_T.FRAME_SCH_SYMBOL_EDITOR, t.frame);
    kiway.ExpressMail(FRAME_T.FRAME_SCH_SYMBOL_EDITOR, MAIL_T.MAIL_LIB_EDIT, { value: '' });
    kiway.ExpressMail(FRAME_T.FRAME_SCH_SYMBOL_EDITOR, MAIL_T.MAIL_FP_EDIT, {
      value: '/libs/mine.kicad_sym',
    });

    expect([t.frame.GetCurLib(), tree, errors]).toEqual(['', [], []]);
  });

  it('reaches an editor opened by Player() once it registers', () => {
    setUp();
    const shown: FRAME_T[] = [];
    const kiway = makeKiway(shown);

    kiway.Player(FRAME_T.FRAME_SCH_SYMBOL_EDITOR);
    kiway.ExpressMail(FRAME_T.FRAME_SCH_SYMBOL_EDITOR, MAIL_T.MAIL_LIB_EDIT, {
      value: '/libs/mine.kicad_sym',
    });
    expect(t.frame.GetCurLib()).toBe('');

    kiway.SetPlayerFrame(FRAME_T.FRAME_SCH_SYMBOL_EDITOR, t.frame);
    expect(shown).toEqual([FRAME_T.FRAME_SCH_SYMBOL_EDITOR]);
    expect(t.frame.GetCurLib()).toBe('mine');
  });
});

describe('LIBRARY_MANAGER::UrisAreEquivalent', () => {
  it('compares a URL as text, never as a file name', () => {
    expect(LIBRARY_MANAGER.UrisAreEquivalent('https://h/a', 'https://h/a')).toBe(true);
    expect(LIBRARY_MANAGER.UrisAreEquivalent('https://h/a', 'https://h/b')).toBe(false);
    // As file names these would fold to the same path.
    expect(LIBRARY_MANAGER.UrisAreEquivalent('https://h/x/../a', 'https://h/a')).toBe(false);
  });
});

describe('MAIL_FP_EDIT', () => {
  it('hands a non-empty file to the footprint editor, and ignores an empty one', () => {
    const kiway = makeKiway();
    const got: string[] = [];
    kiway.SetPlayerFrame(
      FRAME_T.FRAME_FOOTPRINT_EDITOR,
      new FOOTPRINT_EDIT_FRAME({ fpEdit: (f) => got.push(f) }),
    );

    kiway.ExpressMail(FRAME_T.FRAME_FOOTPRINT_EDITOR, MAIL_T.MAIL_FP_EDIT, {
      value: 'my.pretty/R.kicad_mod',
    });
    kiway.ExpressMail(FRAME_T.FRAME_FOOTPRINT_EDITOR, MAIL_T.MAIL_FP_EDIT, { value: '' });
    kiway.ExpressMail(FRAME_T.FRAME_FOOTPRINT_EDITOR, MAIL_T.MAIL_LIB_EDIT, {
      value: 'a.kicad_sym',
    });

    expect(got).toEqual(['my.pretty/R.kicad_mod']);
  });

  it('goes to the footprint editor, not the symbol editor', () => {
    const kiway = makeKiway();
    const sym: string[] = [];
    const fp: string[] = [];
    kiway.SetPlayerFrame(
      FRAME_T.FRAME_SCH_SYMBOL_EDITOR,
      new SYMBOL_EDIT_FRAME({ libTreeSelectLibId: (aLibId) => sym.push(aLibId.Format()) }),
    );
    kiway.SetPlayerFrame(
      FRAME_T.FRAME_FOOTPRINT_EDITOR,
      new FOOTPRINT_EDIT_FRAME({ fpEdit: (f) => fp.push(f) }),
    );

    kiway.ExpressMail(FRAME_T.FRAME_FOOTPRINT_EDITOR, MAIL_T.MAIL_FP_EDIT, {
      value: 'R.kicad_mod',
    });

    expect([sym, fp]).toEqual([[], ['R.kicad_mod']]);
  });
});

describe('the frames are the types KIWAY knows them as', () => {
  it('IsType answers FRAME_SCH_SYMBOL_EDITOR and FRAME_FOOTPRINT_EDITOR', () => {
    const sym = new SYMBOL_EDIT_FRAME({});
    const fp = new FOOTPRINT_EDIT_FRAME({ fpEdit: () => {} });
    expect([
      sym.IsType(FRAME_T.FRAME_SCH_SYMBOL_EDITOR),
      sym.IsType(FRAME_T.FRAME_FOOTPRINT_EDITOR),
    ]).toEqual([true, false]);
    expect([
      fp.IsType(FRAME_T.FRAME_FOOTPRINT_EDITOR),
      fp.IsType(FRAME_T.FRAME_SCH_SYMBOL_EDITOR),
    ]).toEqual([true, false]);
  });
});
