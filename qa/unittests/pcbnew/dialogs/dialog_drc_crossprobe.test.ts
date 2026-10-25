// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DRC cross-probing, both ways, as pcbnew does it:
 *
 * - a row of DRC Control clicked: DIALOG_DRC::OnDRCItemSelected (dialog_drc.cpp) - the marker's
 *   layer made the active one, the row's item brightened (PCB_BASE_FRAME::FocusOnItems) and the
 *   view moved to it when it is off screen (EDA_DRAW_FRAME::FocusOnLocation), the cross-hair on it;
 * - a marker selected on the board: DRC_TOOL::CrossProbe -> DIALOG_DRC::SelectMarker - its row
 *   selected on the Violations page, and NOTHING else: RC_TREE_MODEL::SelectMarker is a
 *   programmatic wxDataViewCtrl::Select(), which raises no selection-changed event on wxGTK
 *   (qa/probes/dataview_select_event_probe.cpp), so OnDRCItemSelected does not run for it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { PCB_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { PGM_BASE, SetPgm } from '@ziroeda/common/pgm_base.js';
import { ACTIONS } from '@ziroeda/common/tool/actions.js';
import type { BOX2D } from '@ziroeda/kimath/src/math/box2.js';
import type { Vec2 } from '@ziroeda/kimath/src/math/vector2.js';
import { DIALOG_DRC, type DIALOG_DRC_WINDOW } from '@ziroeda/pcbnew/dialogs/dialog_drc.js';
import { DRC_ITEM, PCB_DRC_CODE } from '@ziroeda/pcbnew/drc/drc_item.js';
import type { PAD } from '@ziroeda/pcbnew/pad.js';
import { PCB_EDIT_FRAME } from '@ziroeda/pcbnew/pcb_edit_frame.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { PCB_MARKER } from '@ziroeda/pcbnew/pcb_marker.js';
import { PCBNEW_SETTINGS } from '@ziroeda/pcbnew/pcbnew_settings.js';
import { PCB_ACTIONS } from '@ziroeda/pcbnew/tools/pcb_actions.js';
import { harnessCanvas, mm } from '../support/pcb_tool_harness.js';

/** The frame of the running test: FocusOnItems' last-brightened list is static, as upstream's is. */
let s_frame: PCB_EDIT_FRAME | null = null;

afterEach(() => {
  // Leave nothing brightened for the next test's frame, whose board is not there yet.
  s_frame?.FocusOnItems([]);
  s_frame = null;
  SetPgm(null);
});

const BOARD = `(kicad_pcb (version 20241229) (generator "t")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (1 "F.Mask" user) (3 "B.Mask" user))
  (net 0 "") (net 1 "A") (net 2 "B")
  (footprint "t:Q" (layer "B.Cu") (at 60 60) (uuid "11111111-1111-1111-1111-111111111111")
    (property "Reference" "Q1" (at 0 -3 0) (layer "B.SilkS") (uuid "22222222-2222-2222-2222-222222222222"))
    (pad "5" smd rect (at 0 0) (size 1 1) (layers "B.Cu" "B.Mask") (net 1 "A") (uuid "55555555-5555-5555-5555-555555555555"))
    (pad "9" smd rect (at 1.05 0) (size 1 1) (layers "B.Cu" "B.Mask") (net 2 "B") (uuid "99999999-9999-9999-9999-999999999999"))))`;

function setUp(aCrossprobe = true) {
  SetPgm(new PGM_BASE(null));
  const settings = new PCBNEW_SETTINGS();
  settings.m_DRCDialog.crossprobe = aCrossprobe;
  settings.m_DRCDialog.scroll_on_crossprobe = true;
  let shown = false;
  let dialog: DIALOG_DRC | null = null;
  const centred: Vec2[] = [];

  const window: DIALOG_DRC_WINDOW = {
    textEntry: async () => '',
    askDeleteExclusions: async () => 'no',
    saveReport: async () => null,
    displayError: () => {},
    showBoardSetupDialog: () => {},
    setLayerVisible: () => {},
    show: (aShow) => {
      shown = aShow;
    },
    raise: () => {},
    isShownOnScreen: () => shown,
    destroy: () => {
      shown = false;
    },
    saveDrcDialogSettings: () => {},
  };

  const frame: PCB_EDIT_FRAME = new PCB_EDIT_FRAME({
    settings: () => settings,
    onModify: () => {},
    onUndoRedoIncomplete: () => {},
    createDrcDialog: () => {
      dialog = new DIALOG_DRC(frame, window);
      return dialog;
    },
    isSingle: () => false,
    fetchNetlistFromSchematic: () => false,
    schematicNetlistText: () => null,
    projectText: () => null,
    showExchangeFootprintsDialog: () => {},
    findDialogRects: (): BOX2D[] => [],
    setViewCenter: (aPos: Vec2) => {
      centred.push({ ...aPos });
    },
    editZoneParams: () => {},
    selectCopperLayerPair: () => {},
    updatePcbFromSchematic: () => {},
  });
  const board = ParseBoard(BOARD);
  frame.SetBoard(board, false);
  s_frame = frame;

  const pads = board.Footprints()[0]!.Pads() as PAD[];
  const pad = (n: string) => pads.find((p) => p.GetNumber() === n)!;

  // The violation DRC found: a mask bridge between pads 5 and 9, its marker on B.Mask.
  const item = DRC_ITEM.Create(PCB_DRC_CODE.DRCE_SOLDERMASK_BRIDGE)!;
  item.SetItems([pad('5').m_Uuid, pad('9').m_Uuid]);
  const marker = new PCB_MARKER(item, pad('5').GetPosition(), PCB_LAYER_ID.B_Mask);
  board.Add(marker);

  const h = { mouse: { x: 0, y: 0 }, forced: null, shape: null } as never;
  const { view, controls } = harnessCanvas(board, frame, h);
  let crossHair: Vec2 | null = null;
  (
    controls as unknown as { SetCrossHairCursorPosition: (p: Vec2) => void }
  ).SetCrossHairCursorPosition = (p: Vec2) => {
    crossHair = { ...p };
  };

  frame.GetToolManager()!.RunAction(PCB_ACTIONS.runDRC);
  const drc = dialog!;
  drc.UpdateData();
  frame.SetActiveLayer(PCB_LAYER_ID.F_Cu);

  return { frame, drc, pad, marker, view, centred, crossHair: () => crossHair };
}

/** The Violations tree's node for \a aPad's row under the one marker. */
const rowOf = (aDrc: DIALOG_DRC, aPad: PAD) => {
  const top = aDrc.m_markersTreeModel.GetTree()[0]!;
  return top.m_Children.find((c) => {
    const id = c.m_Type === 1 ? c.m_RcItem!.GetMainItemID() : c.m_RcItem!.GetAuxItemID();
    return id === aPad.m_Uuid;
  })!;
};

describe('clicking a row of DRC Control', () => {
  it("makes the marker's layer the active one and brightens the row's item", () => {
    const t = setUp();

    t.drc.m_markerDataView.ClickItem(rowOf(t.drc, t.pad('5')));

    expect(t.frame.GetActiveLayer()).toBe(PCB_LAYER_ID.B_Mask);
    expect([t.pad('5').IsBrightened(), t.pad('9').IsBrightened()]).toEqual([true, false]);
    expect(t.crossHair()).toEqual(t.pad('5').GetFocusPosition());
  });

  it('moves the view to the item when it is off screen, and not when it is on screen', () => {
    const t = setUp();
    t.view.SetCenter(mm(500, 500));

    t.drc.m_markerDataView.ClickItem(rowOf(t.drc, t.pad('9')));

    expect(t.centred).toEqual([t.pad('9').GetFocusPosition()]);

    t.centred.length = 0;
    t.view.SetCenter(t.pad('5').GetFocusPosition());
    t.drc.m_markerDataView.ClickItem(rowOf(t.drc, t.pad('5')));

    expect(t.centred).toEqual([]);
  });

  it('dims the item it brightened before', () => {
    const t = setUp();

    t.drc.m_markerDataView.ClickItem(rowOf(t.drc, t.pad('5')));
    t.drc.m_markerDataView.ClickItem(rowOf(t.drc, t.pad('9')));

    expect([t.pad('5').IsBrightened(), t.pad('9').IsBrightened()]).toEqual([false, true]);
  });

  it('does nothing on the board with cross-probing off', () => {
    const t = setUp(false);

    t.drc.m_markerDataView.ClickItem(rowOf(t.drc, t.pad('5')));

    expect(t.frame.GetActiveLayer()).toBe(PCB_LAYER_ID.F_Cu);
    expect(t.pad('5').IsBrightened()).toBe(false);
  });
});

describe('selecting a marker on the board', () => {
  it('selects its row on the Violations page, and moves nothing on the board', () => {
    const t = setUp();
    t.drc.m_notebookSelection = 3;
    t.view.SetCenter(mm(500, 500));

    t.frame.GetToolManager()!.RunAction(ACTIONS.selectItem, t.marker);

    const selected = t.drc.m_markerDataView.GetSelection();
    expect(selected?.m_RcItem?.GetParent() === t.marker).toBe(true);
    expect(t.drc.m_notebookSelection).toBe(0);
    // No OnDRCItemSelected: the layer, the brightening and the view stay as they were.
    expect(t.frame.GetActiveLayer()).toBe(PCB_LAYER_ID.F_Cu);
    expect(t.pad('5').IsBrightened()).toBe(false);
    expect(t.centred).toEqual([]);
  });

  it('Next Marker moves the row only, as well', () => {
    const t = setUp();

    t.drc.NextMarker();

    expect(t.drc.m_markerDataView.GetSelection()).not.toBeNull();
    expect(t.frame.GetActiveLayer()).toBe(PCB_LAYER_ID.F_Cu);
    expect(t.centred).toEqual([]);
  });
});
