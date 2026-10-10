// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * MAIL_PCB_GET_NETLIST (cross-probing.cpp:539-587) as `formatPcbNetlist`: one (ref …) per
 * footprint but the board-only ones, its pads' nets, and the pcb_netlist document around them.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatPcbNetlist } from '@ziroeda/pcbnew/cross-probing.js';
import { FOOTPRINT_ATTR_T } from '@ziroeda/pcbnew/footprint.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';

const SOURCE = readFileSync(
  resolve(__dirname, '../../data/pcbnew/plot/gerber_oracle.kicad_pcb'),
  'utf8',
);

describe('formatPcbNetlist', () => {
  it('writes each footprint as a component with its pads nets', () => {
    const board = ParseBoard(SOURCE);
    const text = formatPcbNetlist(board);
    expect(text.startsWith('(pcb_netlist')).toBe(true);

    for (const fp of board.Footprints())
      expect(text).toContain(`(ref ${JSON.stringify(fp.GetReference())}`);

    const pad = board
      .Footprints()
      .flatMap((f) => f.Pads())
      .find((p) => p.GetShortNetname() !== '');
    expect(pad).toBeDefined();
    expect(text).toContain(JSON.stringify(pad!.GetShortNetname()));
  });

  it('leaves out a board-only footprint', () => {
    const board = ParseBoard(SOURCE);
    const fp = board.Footprints()[0]!;
    fp.SetAttributes(fp.GetAttributes() | FOOTPRINT_ATTR_T.FP_BOARD_ONLY);
    expect(formatPcbNetlist(board)).not.toContain(`(ref ${JSON.stringify(fp.GetReference())}`);
  });
});
