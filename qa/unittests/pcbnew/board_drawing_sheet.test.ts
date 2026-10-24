// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The PCB editor's drawing sheet, as `PCB_EDIT_FRAME::SetPageSettings` (pcb_edit_frame.cpp:887-922)
 * builds it: File is the board's file name, Sheet is the frame's `GetScreenDesc()` - EDA_DRAW_FRAME's
 * empty string, a board having no sheets - and the page is the first. The board itself is drawn in
 * the render worker from a re-parse of its text, which had no file name, so its title block said
 * "File:" with nothing after it; `loadBoardForDrc` now names it as `PCB_IO_KICAD_SEXPR::LoadBoard`
 * does.
 */
import { loadBoardForDrc } from '@ziroeda/pcbnew/browser/drc_job.js';
import { attachBoardToPanel } from '@ziroeda/pcbnew/browser/pcb_canvas.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { boardDrawingSheet } from '@ziroeda/pcbnew/pcb_draw_panel_gal.js';
import { describe, expect, it } from 'vitest';

const BOARD_TEXT = `(kicad_pcb (version 20241229) (generator "test")
  (general (thickness 1.6))
  (paper "A4")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal))
  (setup)
)`;

/** What the builder set, as upstream's setters leave it. */
const state = (aSheet: object) =>
  aSheet as unknown as {
    m_fileName: string;
    m_sheetName: string;
    m_sheetPath: string;
    m_isFirstPage: boolean;
    m_pageNumber: string;
    m_sheetCount: number;
  };

describe('boardDrawingSheet', () => {
  it('names the file, leaves Sheet to the frame and draws the first page', () => {
    const board = ParseBoard(BOARD_TEXT);
    board.SetFileName('/proj/ecc83-pp.kicad_pcb');

    const sheet = state(
      boardDrawingSheet(board, '', '', { GetPageNumber: () => '1', GetPageCount: () => 1 }),
    );

    expect(sheet.m_fileName).toBe('/proj/ecc83-pp.kicad_pcb');
    expect(sheet.m_sheetName).toBe('');
    expect(sheet.m_sheetPath).toBe('');
    expect(sheet.m_isFirstPage).toBe(true);
    expect([sheet.m_pageNumber, sheet.m_sheetCount]).toEqual(['1', 1]);
  });

  it('takes the sheet name and path the frame gives it', () => {
    const sheet = state(boardDrawingSheet(ParseBoard(BOARD_TEXT), 'desc', '/full/desc', null));

    expect([sheet.m_sheetName, sheet.m_sheetPath]).toEqual(['desc', '/full/desc']);
  });
});

describe('the render worker board', () => {
  it('carries the window board file name, so its sheet does too', () => {
    const board = loadBoardForDrc({
      boardText: BOARD_TEXT,
      boardPath: 'ecc83-pp.kicad_pcb',
      boardUuid: '00000000-0000-4000-8000-000000000001',
      projectText: null,
      rulesText: null,
      rulesPath: '',
    });

    expect(board.GetFileName()).toBe('ecc83-pp.kicad_pcb');
    expect(state(boardDrawingSheet(board, '', '', null)).m_fileName).toBe('ecc83-pp.kicad_pcb');
  });
});

describe('the window board', () => {
  it('gets the sheet from the frame - Sheet blank, File the board', () => {
    const board = ParseBoard(BOARD_TEXT);
    board.SetFileName('ecc83-pp.kicad_pcb');
    let shown: object | null = null;

    attachBoardToPanel(
      {
        GetScreen: () => null,
        GetScreenDesc: () => '',
        GetFullScreenDesc: () => '',
      } as never,
      { SetDrawingSheet: (aSheet: object) => (shown = aSheet) } as never,
      board,
    );

    expect(state(shown!).m_fileName).toBe('ecc83-pp.kicad_pcb');
    expect(state(shown!).m_sheetName).toBe('');
  });
});
