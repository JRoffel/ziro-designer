// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * BOARD::SetTitleBlock is `m_titles = aTitleBlock`: the board keeps its own TITLE_BLOCK and
 * copies into it, so whatever holds a reference to it - the drawing sheet's proxy item - shows
 * the new texts, as KiCad's does after Page Settings.
 */
import { TITLE_BLOCK } from '@ziroeda/common/title_block.js';
import { BOARD } from '@ziroeda/pcbnew/board.js';
import { describe, expect, it } from 'vitest';

describe('BOARD::SetTitleBlock', () => {
  it('copies into the title block the board already has', () => {
    const board = new BOARD();
    const held = board.GetTitleBlock();
    const edited = new TITLE_BLOCK();

    edited.SetTitle('Edited');
    board.SetTitleBlock(edited);

    expect(board.GetTitleBlock()).toBe(held);
    expect(held.GetTitle()).toBe('Edited');
  });

  it('and does not share the caller’s', () => {
    const board = new BOARD();
    const edited = new TITLE_BLOCK();

    edited.SetTitle('First');
    board.SetTitleBlock(edited);
    edited.SetTitle('Later');

    expect(board.GetTitleBlock().GetTitle()).toBe('First');
  });
});
