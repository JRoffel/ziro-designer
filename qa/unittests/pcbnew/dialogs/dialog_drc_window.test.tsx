// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_DRC's window (dialog_drc.cpp) on DIALOG_DRC_BASE: the base's controls in the base's
 * order, the constructor's SetupStandardButtons labels and Kiface().IsSingle() hiding, and the
 * controls reaching DIALOG_DRC's handlers.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PGM_BASE, SetPgm } from '@ziroeda/common/pgm_base.js';
import type { BOX2D } from '@ziroeda/kimath/src/math/box2.js';
import type { Vec2 } from '@ziroeda/kimath/src/math/vector2.js';
import {
  DIALOG_DRC,
  type DIALOG_DRC_WINDOW,
  DialogDrc,
} from '@ziroeda/pcbnew/dialogs/dialog_drc.js';
import { PCB_EDIT_FRAME } from '@ziroeda/pcbnew/pcb_edit_frame.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { PCBNEW_SETTINGS } from '@ziroeda/pcbnew/pcbnew_settings.js';
import { PCB_ACTIONS } from '@ziroeda/pcbnew/tools/pcb_actions.js';

afterEach(cleanup);
SetPgm(new PGM_BASE());

function show(aIsSingle: boolean) {
  const settings = new PCBNEW_SETTINGS();
  settings.m_DRCDialog.crossprobe = false;
  const shown: boolean[] = [];
  let created: DIALOG_DRC | null = null;

  const window: DIALOG_DRC_WINDOW = {
    textEntry: async () => '',
    askDeleteExclusions: async () => 'no',
    saveReport: async () => null,
    displayError: () => {},
    showBoardSetupDialog: () => {},
    setLayerVisible: () => {},
    show: (aShow) => {
      shown.push(aShow);
    },
    raise: () => {},
    isShownOnScreen: () => shown.at(-1) === true,
    destroy: () => {
      shown.push(false);
    },
    saveDrcDialogSettings: () => {},
  };

  const frame: PCB_EDIT_FRAME = new PCB_EDIT_FRAME({
    settings: () => settings,
    onModify: () => {},
    onUndoRedoIncomplete: () => {},
    createDrcDialog: () => {
      created = new DIALOG_DRC(frame, window);
      return created;
    },
    isSingle: () => aIsSingle,
    fetchNetlistFromSchematic: () => false,
    schematicNetlistText: () => null,
    projectText: () => null,
    showExchangeFootprintsDialog: () => {},
    findDialogRects: (): BOX2D[] => [],
    setViewCenter: (_aPos: Vec2) => {},
    editZoneParams: () => {},
    selectCopperLayerPair: () => {},
    updatePcbFromSchematic: () => {},
  });
  frame.SetBoard(
    ParseBoard(
      '(kicad_pcb (version 20241229) (generator "t") (layers (0 "F.Cu" signal) (2 "B.Cu" signal)))',
    ),
    false,
  );

  // PCB_ACTIONS::runDRC -> DRC_TOOL::ShowDRCDialog -> the frame's CreateDrcDialog.
  frame.GetToolManager()!.RunAction(PCB_ACTIONS.runDRC);
  const dialog = created!;
  const root = { current: null as HTMLDivElement | null };
  render(<DialogDrc dialog={dialog} isSingle={aIsSingle} canRefillZones rootRef={root} />);
  return { dialog, shown, root };
}

const button = (aName: string) => screen.getByRole('button', { name: aName });

describe('DIALOG_DRC window', () => {
  it('is the base: options, the four result pages, the Show row and the button row', () => {
    const { root } = show(false);

    expect(screen.getByText('DRC Control')).toBeTruthy();
    expect(screen.getByLabelText('Refill all zones before performing DRC')).toBeTruthy();
    expect(screen.getByLabelText('Test for parity between PCB and schematic')).toBeTruthy();
    expect(
      screen
        .getAllByRole('tab')
        .map((t) => t.textContent)
        .slice(1),
    ).toEqual(['Violations ', 'Unconnected Items ', 'Schematic Parity ', 'Ignored Tests ']);
    for (const label of ['All', 'Errors', 'Warnings', 'Exclusions'])
      expect(screen.getByLabelText(label)).toBeTruthy();
    // SetupStandardButtons( { wxID_OK, "Run DRC" }, { wxID_CANCEL, "Close" } )
    expect(button('Run DRC')).toBeTruthy();
    expect(button('Close')).toBeTruthy();
    expect(button('Delete Marker')).toBeTruthy();
    expect(button('Delete All Markers')).toBeTruthy();
    expect(button('Save...')).toBeTruthy();
    // The frame finds the window for findDialogRects.
    expect(root.current).not.toBeNull();
  });

  it('Kiface().IsSingle() hides the parity box', () => {
    show(true);

    expect(screen.queryByLabelText('Test for parity between PCB and schematic')).toBeNull();
  });

  it('a severity box reaches OnSeverity: All turns every box on', () => {
    const { dialog } = show(false);

    fireEvent.click(screen.getByLabelText('All'));
    expect(dialog.m_showAll).toBe(true);
    expect(dialog.m_showExclusions).toBe(true);
    expect((screen.getByLabelText('Exclusions') as HTMLInputElement).checked).toBe(true);
  });

  it('a result tab reaches OnChangingNotebookPage', () => {
    const { dialog } = show(false);

    fireEvent.click(screen.getByRole('tab', { name: 'Ignored Tests' }));
    expect(dialog.m_notebookSelection).toBe(3);
  });

  it('Close is OnCancelClick: the dialog is destroyed', () => {
    const { shown } = show(false);

    fireEvent.click(button('Close'));
    expect(shown.at(-1)).toBe(false);
  });
});
