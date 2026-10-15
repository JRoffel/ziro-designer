// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * PCB_PAINTER::drawPad draws a pad it cannot draw as simple shapes - every pad of a selected
 * footprint on a layer the pad does not flash - from `TransformShapeToPolygon( poly, layer,
 * margin, maxError, ERROR_INSIDE )`, which KiCad rebuilds each frame. Ours keeps it per pad
 * (PadOutlineForDraw) until `PAD::SetDirty`, which is only right if what it keeps is that outline
 * for every shape, layer and margin, and if every change to the pad drops it.
 */
import { describe, expect, it } from 'vitest';
import { ERROR_LOC } from '@ziroeda/kimath/src/convert_basic_shapes_to_polygon.js';
import { PCB_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { FLIP_DIRECTION } from '@ziroeda/kimath/src/core/mirror.js';
import { EDA_ANGLE } from '@ziroeda/kimath/src/geometry/eda_angle.js';
import { SHAPE_POLY_SET } from '@ziroeda/kimath/src/geometry/shape_poly_set.js';
import type { PAD } from '@ziroeda/pcbnew/pad.js';
import { PadOutlineForDraw } from '@ziroeda/pcbnew/pcb_painter.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';

const PADS = [
  `(pad "1" smd rect (at 0 0) (size 2 1) (layers "F.Cu" "F.Mask" "F.Paste"))`,
  `(pad "2" smd roundrect (at 3 0 30) (size 2 1) (layers "F.Cu" "F.Mask") (roundrect_rratio 0.25))`,
  `(pad "3" smd roundrect (at 6 0) (size 2 1.2) (layers "F.Cu" "F.Mask") (roundrect_rratio 0.2)
     (chamfer_ratio 0.3) (chamfer top_left bottom_right))`,
  `(pad "4" smd trapezoid (at 9 0 15) (size 2 1.4) (rect_delta 0 0.4) (layers "F.Cu" "F.Mask"))`,
  `(pad "5" thru_hole oval (at 12 0 45) (size 2.4 1.2) (drill oval 1.2 0.6) (layers "*.Cu" "*.Mask"))`,
  `(pad "6" thru_hole circle (at 15 0) (size 1.7 1.7) (drill 1) (layers "*.Cu" "*.Mask"))`,
  `(pad "7" smd custom (at 18 0 90) (size 1 1) (layers "F.Cu" "F.Mask")
     (options (clearance outline) (anchor rect))
     (primitives (gr_poly (pts (xy -0.5 -1) (xy 1.5 -0.5) (xy 1 1)) (width 0.1) (fill yes))))`,
  `(pad "8" smd rect (at 21 0) (size 2 1) (drill (offset 0.3 0.2)) (layers "F.Cu" "F.Mask"))`,
];

function pads(): PAD[] {
  const board = ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (1 "F.Mask" user) (3 "B.Mask" user)
    (13 "F.Paste" user) (15 "B.Paste" user) (5 "F.SilkS" user "F.Silkscreen")
    (25 "Edge.Cuts" user))
  (setup)
  (net 0 "")
  (footprint "X" (layer "F.Cu") (at 10 10 20)
    ${PADS.join('\n    ')})
)`);
  return board.Footprints()[0]!.Pads();
}

const outline = (p: SHAPE_POLY_SET): string =>
  Array.from({ length: p.OutlineCount() }, (_, i) => {
    const c = p.COutline(i);
    return Array.from({ length: c.PointCount() }, (_, j) => `${c.CPoint(j).x},${c.CPoint(j).y}`)
      .concat(c.IsClosed() ? ['closed'] : [])
      .join(' ');
  }).join(' | ');

const LAYERS = [
  PCB_LAYER_ID.F_Cu,
  PCB_LAYER_ID.B_Cu,
  PCB_LAYER_ID.F_Mask,
  PCB_LAYER_ID.F_SilkS,
  PCB_LAYER_ID.Edge_Cuts,
];

const fresh = (aPad: PAD, aLayer: PCB_LAYER_ID, aMargin: number): string => {
  const built = new SHAPE_POLY_SET();
  aPad.TransformShapeToPolygon(built, aLayer, aMargin, MAX_ERROR, ERROR_LOC.ERROR_INSIDE);
  return outline(built);
};

const MAX_ERROR = 5000;
const MM = 1_000_000;

describe('PadOutlineForDraw: the outline drawPad draws, kept until the pad changes', () => {
  it('found every pad, so the comparison is not over nothing', () => {
    expect(pads().map((p) => p.GetNumber())).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });

  for (const layer of LAYERS) {
    it(`is TransformShapeToPolygon's outline on ${PCB_LAYER_ID[layer]}, every shape and margin`, () => {
      for (const pad of pads()) {
        for (const margin of [0, 50_000, -20_000]) {
          const at = `pad ${pad.GetNumber()} margin ${margin}`;
          const drawn = PadOutlineForDraw(pad, layer, margin, MAX_ERROR);

          expect(drawn.OutlineCount(), at).toBeGreaterThan(0);
          expect(outline(drawn), at).toBe(fresh(pad, layer, margin));
          // Asked again, it is the kept one rather than a rebuild.
          expect(PadOutlineForDraw(pad, layer, margin, MAX_ERROR), at).toBe(drawn);
          expect(drawn.IsTriangulationUpToDate(), at).toBe(false);
        }
      }
    });
  }

  it('keeps one outline per layer, margin and max error', () => {
    const pad = pads()[1]!;
    const a = PadOutlineForDraw(pad, PCB_LAYER_ID.F_Mask, 0, MAX_ERROR);

    expect(PadOutlineForDraw(pad, PCB_LAYER_ID.F_Mask, 1000, MAX_ERROR)).not.toBe(a);
    expect(PadOutlineForDraw(pad, PCB_LAYER_ID.F_SilkS, 0, MAX_ERROR)).not.toBe(a);
    expect(PadOutlineForDraw(pad, PCB_LAYER_ID.F_Mask, 0, 1000)).not.toBe(a);
  });

  // A selection being dragged, rotated or flipped draws where the pad now is.
  const CHANGES: [string, (aPad: PAD) => void][] = [
    ['moves', (p) => p.SetPosition({ x: p.GetPosition().x + MM, y: p.GetPosition().y })],
    ['rotates', (p) => p.Rotate({ x: 0, y: 0 }, new EDA_ANGLE(30))],
    ['flips', (p) => p.Flip({ x: 0, y: 0 }, FLIP_DIRECTION.LEFT_RIGHT)],
    ['resizes', (p) => p.SetSize(PCB_LAYER_ID.F_Cu, { x: 3 * MM, y: 2 * MM })],
  ];

  for (const [what, change] of CHANGES) {
    it(`is rebuilt when the pad ${what}`, () => {
      for (const pad of pads()) {
        const before = outline(PadOutlineForDraw(pad, PCB_LAYER_ID.F_Mask, 0, MAX_ERROR));
        change(pad);
        const after = outline(PadOutlineForDraw(pad, PCB_LAYER_ID.F_Mask, 0, MAX_ERROR));

        expect(after, `pad ${pad.GetNumber()}`).toBe(fresh(pad, PCB_LAYER_ID.F_Mask, 0));
        expect(after, `pad ${pad.GetNumber()}`).not.toBe(before);
      }
    });
  }
});
