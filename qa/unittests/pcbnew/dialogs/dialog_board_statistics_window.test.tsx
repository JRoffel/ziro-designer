// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_BOARD_STATISTICS's window (pcbnew/dialogs/dialog_board_statistics.cpp) on its base:
 * updateWidgets' Total rows, the remembered checkboxes, Close alone at the bottom, and the
 * report's suggested name.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pcbIUScale } from '@ziroeda/common/eda_units.js';
import { UNITS_PROVIDER } from '@ziroeda/common/units_provider.js';
import {
  DialogBoardStatistics,
  ResetBoardStatisticsState,
} from '@ziroeda/pcbnew/dialogs/dialog_board_statistics.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';

afterEach(cleanup);
beforeEach(() => ResetBoardStatisticsState());

const BOARD = () =>
  ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (25 "Edge.Cuts" user))
  (net 0 "")
  (via (at 1 1) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 0) (uuid "00000000-0000-4000-8000-000000000001"))
  (via (at 2 1) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 0) (uuid "00000000-0000-4000-8000-000000000002")))`);

function show() {
  const onGenerateReport = vi.fn();
  render(
    <DialogBoardStatistics
      board={BOARD()}
      unitsProvider={new UNITS_PROVIDER(pcbIUScale, 'mm')}
      projectName="proj"
      boardName="demo.kicad_pcb"
      onGenerateReport={onGenerateReport}
      onClose={() => {}}
    />,
  );
  return { onGenerateReport };
}

const rows = (aGrid: string) =>
  Array.from(screen.getByLabelText(aGrid).querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('td'))
      .map((td) => td.textContent)
      .filter((t) => t !== ''),
  );

describe('DIALOG_BOARD_STATISTICS window', () => {
  it('counts the vias and ends the list with their Total:', () => {
    show();
    const vias = rows('Vias');
    expect(vias.at(-1)).toEqual(['Total:', '2']);
    expect(vias.find((r) => r[0] === 'Through vias:')?.[1]).toBe('2');
  });

  it('has Close and no OK', () => {
    show();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'OK' })).toBeNull();
  });

  it('remembers a checkbox for the next opening', () => {
    show();
    fireEvent.click(screen.getByLabelText('Exclude footprints with no pads'));
    cleanup();
    show();
    expect(
      (screen.getByLabelText('Exclude footprints with no pads') as HTMLInputElement).checked,
    ).toBe(true);
  });

  it('suggests the board name with _report.txt', () => {
    const { onGenerateReport } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Generate Report File...' }));
    expect(onGenerateReport.mock.calls[0]![1]).toBe('demo_report.txt');
  });
});
