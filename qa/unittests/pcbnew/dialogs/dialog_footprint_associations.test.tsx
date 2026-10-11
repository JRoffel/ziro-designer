// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_FOOTPRINT_ASSOCIATIONS (dialog_footprint_associations.cpp): what TransferDataToWindow
 * puts in the two grids, MAIL_SCH_GET_ITEM filling the schematic column only when a schematic
 * frame answers, and the OK-only button row.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FRAME_T } from '@ziroeda/common/frame_type.js';
import { MAIL_T } from '@ziroeda/common/mail_type.js';
import type { MAIL_PAYLOAD } from '@ziroeda/common/kiway_mail.js';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import {
  DIALOG_FOOTPRINT_ASSOCIATIONS,
  DialogFootprintAssociations,
} from '@ziroeda/pcbnew/dialogs/dialog_footprint_associations.js';
import type { FOOTPRINT } from '@ziroeda/pcbnew/footprint.js';
import type { FOOTPRINT_LIBRARY_ADAPTER } from '@ziroeda/pcbnew/footprint_library_adapter.js';
import type { PCB_EDIT_FRAME } from '@ziroeda/pcbnew/pcb_edit_frame.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';

afterEach(cleanup);

const A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const C = 'cccccccc-0000-4000-8000-00000000000c';

function footprint(aAdapter: FOOTPRINT_LIBRARY_ADAPTER | null): FOOTPRINT {
  const board: BOARD = ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal))
  (footprint "Resistor_SMD:R_0603" (layer "F.Cu") (at 10 10)
    (uuid "dddddddd-0000-4000-8000-00000000000d")
    (path "/${A}/${B}/${C}") (sheetname "Power")
    (property "Reference" "R7" (at 0 0) (layer "F.SilkS"))
    (property "Value" "10k" (at 0 0) (layer "F.Fab")))
)`);
  if (aAdapter) board.SetFootprintLibAdapter(aAdapter);
  return board.Footprints()[0]!;
}

const adapter = (desc: string | null, rowDesc: string | undefined): FOOTPRINT_LIBRARY_ADAPTER =>
  ({
    GetRow: () => ({
      nickname: 'Resistor_SMD',
      uri: '',
      type: '',
      enabled: true,
      GetOptionsMap: () => new Map(),
      ...(rowDesc === undefined ? {} : { Description: () => rowDesc }),
    }),
    LoadFootprint: () => {
      if (desc === null) throw new Error('IO_ERROR');
      return { GetLibDescription: () => desc } as unknown as FOOTPRINT;
    },
  }) as unknown as FOOTPRINT_LIBRARY_ADAPTER;

/** A frame whose kiway has a schematic frame answering MAIL_SCH_GET_ITEM (or none). */
function frame(aSingle: boolean, aSchOpen: boolean) {
  const mails: string[] = [];
  const answers: Record<string, string> = { [A]: 'Root', [B]: 'Power', [C]: 'R7' };
  const f = {
    IsSingle: () => aSingle,
    Kiway: () => ({
      Player: (aType: FRAME_T) => aType === FRAME_T.FRAME_SCH && aSchOpen,
      ExpressMail: (aDest: FRAME_T, aCmd: MAIL_T, aPayload: MAIL_PAYLOAD) => {
        if (aDest === FRAME_T.FRAME_SCH && aCmd === MAIL_T.MAIL_SCH_GET_ITEM) {
          mails.push(aPayload.value);
          aPayload.value = answers[aPayload.value] ?? '';
        }
      },
    }),
  };
  return { f: f as unknown as PCB_EDIT_FRAME, mails };
}

const cells = (d: DIALOG_FOOTPRINT_ASSOCIATIONS, which: 'lib' | 'sym') => {
  const g = which === 'lib' ? d.m_gridLibrary : d.m_gridSymbol;
  return Array.from({ length: g.GetNumberRows() }, (_, r) =>
    [0, 1, 2].map((c) => g.GetCellValue(r, c)),
  );
};

describe('DIALOG_FOOTPRINT_ASSOCIATIONS', () => {
  it('Library Association: nickname and item name, with the row and library descriptions', () => {
    const d = new DIALOG_FOOTPRINT_ASSOCIATIONS(
      frame(false, false).f,
      footprint(adapter('0603 chip', 'SMD resistors')),
    );
    d.TransferDataToWindow();

    expect(cells(d, 'lib')).toEqual([
      ['Library: ', 'Resistor_SMD', 'SMD resistors'],
      ['Footprint: ', 'R_0603', '0603 chip'],
    ]);
  });

  it('an IO_ERROR on the library load leaves the footprint description blank', () => {
    const d = new DIALOG_FOOTPRINT_ASSOCIATIONS(
      frame(false, false).f,
      footprint(adapter(null, 'x')),
    );
    d.TransferDataToWindow();

    expect(cells(d, 'lib')[1]).toEqual(['Footprint: ', 'R_0603', '']);
  });

  it('Schematic Association: one row per KIID_PATH segment, each asked of the schematic', () => {
    const { f, mails } = frame(false, true);
    const d = new DIALOG_FOOTPRINT_ASSOCIATIONS(f, footprint(null));
    d.TransferDataToWindow();

    expect(mails).toEqual([A, B, C]);
    expect(cells(d, 'sym')).toEqual([
      ['Sheet: ', A, 'Root'],
      ['Sheet: ', B, 'Power'],
      ['Symbol:', C, 'R7'],
    ]);
  });

  it('standalone, or with no schematic frame, the third column stays blank and nothing is mailed', () => {
    for (const [single, open] of [
      [true, true],
      [false, false],
    ] as const) {
      const { f, mails } = frame(single, open);
      const d = new DIALOG_FOOTPRINT_ASSOCIATIONS(f, footprint(null));
      d.TransferDataToWindow();

      expect(mails).toEqual([]);
      expect(cells(d, 'sym').map((r) => r[2])).toEqual(['', '', '']);
    }
  });

  it('draws both headings and the grid cells, and OK alone closes it', () => {
    const onClose = vi.fn();
    render(
      <DialogFootprintAssociations
        dialog={
          new DIALOG_FOOTPRINT_ASSOCIATIONS(
            frame(false, false).f,
            footprint(adapter('0603 chip', 'SMD resistors')),
          )
        }
        onClose={onClose}
      />,
    );
    expect(screen.getByText('Library Association')).toBeTruthy();
    expect(screen.getByText('Schematic Association')).toBeTruthy();
    expect(screen.getByText('R_0603')).toBeTruthy();
    expect(screen.getByText(C)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
