// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The footprint editor's Edit-menu dialogs reach its window: FOOTPRINT_EDITOR_CONTROL's
 * EditTextAndGraphics and DefaultPadProperties, and PAD_TOOL's Pad Table, which only the
 * footprint editor runs (pad_tool.cpp, `m_isFootprintEditor`). They were answered on
 * PCB_EDIT_FRAME alone, where PAD_TOOL returns at once.
 */
import { describe, expect, it } from 'vitest';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { FOOTPRINT_EDIT_FRAME } from '@ziroeda/pcbnew/footprint_edit_frame.js';
import { PCB_ACTIONS } from '@ziroeda/pcbnew/tools/pcb_actions.js';
import type { STROKE_PARAMS } from '@ziroeda/common/stroke_params.js';
import type { PCB_SHAPE } from '@ziroeda/pcbnew/pcb_shape.js';
import { attachFootprintFrameCanvas } from './support/footprint_frame_canvas.js';

const BOARD = `(kicad_pcb (version 20240108) (generator "pcbnew")
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (37 "F.SilkS" user) (44 "Edge.Cuts" user))
  (footprint "R" (layer "F.Cu") (at 0 0)
    (fp_text reference "R1" (at 0 -1) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))
    (pad "1" smd rect (at -1 0) (size 1 1) (layers "F.Cu"))
    (pad "2" smd rect (at 1 0) (size 1 1) (layers "F.Cu"))))`;

function frame() {
  const asked: string[] = [];
  const f = new FOOTPRINT_EDIT_FRAME({
    fpEdit: () => {},
    showGlobalEditTextAndGraphicsDialog: () => asked.push('textAndGraphics'),
    showPadPropertiesDialog: (d) => asked.push(`pad:${d.m_title}`),
    showPadTableDialog: () => asked.push('padTable'),
  });
  attachFootprintFrameCanvas(f);
  f.ReloadFootprint(ParseBoard(BOARD).GetFirstFootprint()!);
  return { f, asked };
}

describe("the footprint editor's Edit menu dialogs", () => {
  it('Edit Text & Graphics Properties... opens the global edit dialog', () => {
    const { f, asked } = frame();
    f.GetToolManager()!.RunAction(PCB_ACTIONS.editTextAndGraphics);
    expect(asked).toEqual(['textAndGraphics']);
  });

  it("Default Pad Properties... opens the pad dialog on the Add Pad tool's master pad", () => {
    const { f, asked } = frame();
    f.GetToolManager()!.RunAction(PCB_ACTIONS.defaultPadProperties);
    expect(asked).toEqual(['pad:Default Pad Properties for Add Pad Tool']);
  });

  it('Pad Table... opens the pad table', () => {
    const { f, asked } = frame();
    f.GetToolManager()!.RunAction(PCB_ACTIONS.padTable);
    expect(asked).toEqual(['padTable']);
  });
});

describe('ShowGraphicItemPropertiesDialog (pcb_base_edit_frame / dialog_shape_properties.cpp)', () => {
  it('OK on a shape on the active layer hands its stroke to the drawing tool', () => {
    let onOK: (() => void) | undefined;
    const f = new FOOTPRINT_EDIT_FRAME({
      fpEdit: () => {},
      showGraphicItemPropertiesDialog: (_d, aOnOK) => {
        onOK = aOnOK;
      },
    });
    attachFootprintFrameCanvas(f);
    f.ReloadFootprint(
      ParseBoard(`(kicad_pcb (version 20240108) (generator "pcbnew")
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (37 "F.SilkS" user))
  (footprint "R" (layer "F.Cu") (at 0 0)
    (fp_line (start 0 0) (end 5 0) (stroke (width 0.42) (type dash)) (layer "F.SilkS"))))`).GetFirstFootprint()!,
    );
    const shape = f.GetBoard()!.GetFirstFootprint()!.GraphicalItems()[0] as PCB_SHAPE;
    f.SetActiveLayer(shape.GetLayer());
    f.ShowGraphicItemPropertiesDialog(shape);
    onOK!();
    const tool = f.GetToolManager()!.FindTool('pcbnew.InteractiveDrawing') as unknown as {
      m_stroke: STROKE_PARAMS;
    };
    expect(tool.m_stroke.GetWidth()).toBe(shape.GetStroke().GetWidth());
    expect(tool.m_stroke.GetLineStyle()).toBe(shape.GetStroke().GetLineStyle());
  });
});
