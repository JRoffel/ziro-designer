// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * `wxWindow::Raise()` on a KIWAY_PLAYER: the frame brought to the front. A page has one window,
 * so the program shows the frame's type - `Kiway().Player( type )` - as SYMBOL_EDITOR_CONTROL's
 * Add to Schematic needs before it posts placeSymbol to the schematic editor.
 */
import { FRAME_T } from '@ziroeda/common/frame_type.js';
import { KIWAY } from '@ziroeda/common/kiway.js';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { SYMBOL_EDIT_FRAME } from '@ziroeda/eeschema/symbol_editor/symbol_edit_frame.js';
import { afterEach, beforeEach, expect, it } from 'vitest';

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => SetPgm(null));

it('shows the frame of its own type through the program', () => {
  const shown: FRAME_T[] = [];
  const kiway = new KIWAY({
    OnKiCadExit: () => {},
    Player: (aType) => {
      shown.push(aType);
      return true;
    },
    HasProjectManager: () => true,
    ShowProjectManager: () => {},
    CreateKiWindow: () => false,
  });
  const frame = new SYMBOL_EDIT_FRAME({});
  frame.SetKiway(kiway);

  frame.Raise();

  expect(shown).toEqual([FRAME_T.FRAME_SCH_SYMBOL_EDITOR]);
});

it('does nothing on a frame no program owns', () => {
  expect(() => new SYMBOL_EDIT_FRAME({}).Raise()).not.toThrow();
});
