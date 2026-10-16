// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * PCB_EDIT_FRAME's tools are initialised before the frame has its board, so the
 * RUN reset `InitTools` sends builds no router (pns_tool_base.ts). The board's
 * own reset must build it: `routeSingleTrack` is a transition, so no later RUN
 * comes, and MainLoop read `m_router` as null - the editor crashed on X.
 */
import { describe, expect, it } from 'vitest';
import { PCB_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { RESET_REASON } from '@ziroeda/common/tool/tool_base.js';
import {
  TA_MOUSE_CLICK,
  TA_MOUSE_DBLCLICK,
  TA_MOUSE_MOTION,
} from '@ziroeda/common/tool/tool_event.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import { DRC_ENGINE } from '@ziroeda/pcbnew/drc/drc_engine.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { ROUTER_TOOL } from '@ziroeda/pcbnew/router/router_tool.js';
import { PCB_ACTIONS } from '@ziroeda/pcbnew/tools/pcb_actions.js';
import type { Vec2 } from '@ziroeda/kimath/src/math/vector2.js';
import { mm, mouse, toolHarness } from '../support/pcb_tool_harness.js';
import { TEST_PCB_FRAME } from '../support/test_pcb_frame.js';

/** Two pads of N1 on F.Cu, the first at (`aX`, 60), the second 10 mm right of it. */
const boardText = (aX: number): string => `(kicad_pcb (version 20241229) (generator "pcbnew")
  (general (thickness 1.6) (legacy_teardrops no))
  (paper "A4")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (25 "Edge.Cuts" user))
  (setup (pad_to_mask_clearance 0))
  (net 0 "")
  (net 1 "N1")
  (footprint "R1" (layer "F.Cu") (at ${aX} 60) (uuid "00000000-0000-4000-8000-000000000001")
    (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1 "N1") (uuid "00000000-0000-4000-8000-000000000011")))
  (footprint "R2" (layer "F.Cu") (at ${aX + 10} 60) (uuid "00000000-0000-4000-8000-000000000002")
    (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1 "N1") (uuid "00000000-0000-4000-8000-000000000012")))
)
`;

function withDrc(aBoard: BOARD): BOARD {
  const bds = aBoard.GetDesignSettings();
  bds.m_DRCEngine = new DRC_ENGINE(aBoard, bds);
  bds.m_DRCEngine.InitEngine('(version 1)', 'r.kicad_dru');
  return aBoard;
}

describe("ROUTER_TOOL gets its router from the frame's board", () => {
  it('tools initialised before the board: the board reset builds the router, and X routes', () => {
    const h = toolHarness(
      boardText(40),
      (b) => new TEST_PCB_FRAME(b),
      () => [new ROUTER_TOOL()],
    );
    const mgr = h.mgr;
    const env = (aBoard: BOARD | null): void =>
      mgr.SetEnvironment(aBoard, h.view, mgr.GetViewControls(), h.frame.settings, h.frame);
    const route = (aBoard: BOARD, aFrom: Vec2): void => {
      h.view.SetTopLayer(PCB_LAYER_ID.F_Cu);
      const evt = PCB_ACTIONS.routeSingleTrack.MakeEvent();
      evt.SetHasPosition(false);
      mgr.ProcessEvent(evt);
      mouse(h, TA_MOUSE_MOTION, aFrom);
      mouse(h, TA_MOUSE_CLICK, aFrom);
      expect(rt.RoutingInProgress()).toBe(true);
      expect(aBoard.Tracks().filter((t) => t.Type() === KICAD_T.PCB_TRACE_T)).toHaveLength(0);
    };
    const rt = mgr.GetTool(ROUTER_TOOL)!;

    // `setupTools`: InitTools's RUN with no board yet.
    env(null);
    mgr.ResetTools(RESET_REASON.RUN);
    expect(rt.RoutingInProgress()).toBe(false);

    // The board arrives: SetBoard's MODEL_RELOAD.
    withDrc(h.board);
    env(h.board);
    mgr.ResetTools(RESET_REASON.MODEL_RELOAD);
    route(h.board, mm(40, 60));

    // A second board, its pads where the first has none: the route's Activate() rebuilds
    // the router on it, so the route is not made on the first board's world.
    const next = withDrc(ParseBoard(boardText(70), '/p/y.kicad_pcb'));
    next.BuildConnectivity();
    env(next);
    mgr.ResetTools(RESET_REASON.MODEL_RELOAD);
    expect(rt.RoutingInProgress()).toBe(false);
    route(next, mm(70, 60));

    // The route is fixed on the board the frame now shows.
    mouse(h, TA_MOUSE_MOTION, mm(75, 60));
    mouse(h, TA_MOUSE_DBLCLICK, mm(75, 60));
    const traces = (aBoard: BOARD) =>
      aBoard.Tracks().filter((t) => t.Type() === KICAD_T.PCB_TRACE_T);
    expect(traces(next).length).toBeGreaterThan(0);
    for (const t of traces(next)) expect(t.GetNetCode()).toBe(1);
    expect(traces(h.board)).toHaveLength(0);
  });
});
