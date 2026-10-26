// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `GRAPHICS_IMPORTER_SCH` (graphics_importer_sch.cpp) on live items: lines are SCH_LINEs, the
 * rest SCH_SHAPEs and SCH_TEXTs, all on LAYER_NOTES. What is specific here is the mapping -
 * schematic internal units, the coordinate order (scale, then offset, then mm-to-IU), the averaged
 * and truncated line width, the `-1` "no stroke" width - and the two fill rules, which differ
 * between a circle and a polygon.
 */
import { describe, it, expect } from 'vitest';
import { GRAPHICS_IMPORTER_SCH } from '@ziroeda/eeschema/import_gfx/graphics_importer_sch.js';
import {
  type GRAPHICS_IMPORTER,
  IMPORTED_STROKE,
} from '@ziroeda/common/import_gfx/graphics_importer.js';
import { DXF_IMPORT_PLUGIN } from '@ziroeda/common/import_gfx/dxf_import_plugin.js';
import { EDA_ANGLE } from '@ziroeda/kimath/src/geometry/eda_angle.js';
import { LINE_STYLE } from '@ziroeda/common/stroke_params.js';
import { COLOR4D_BLACK } from '@ziroeda/common/gal/color4d.js';
import { mmToIU } from '@ziroeda/common/eda_units.js';
import { FILL_T, SHAPE_T } from '@ziroeda/common/eda_shape.js';
import { GR_TEXT_H_ALIGN_T, GR_TEXT_V_ALIGN_T } from '@ziroeda/common/eda_text.js';
import { SCH_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { SCH_ITEM } from '@ziroeda/eeschema/sch_item.js';
import type { SCH_LINE } from '@ziroeda/eeschema/sch_line.js';
import type { SCH_SHAPE } from '@ziroeda/eeschema/sch_shape.js';
import type { SCH_TEXT } from '@ziroeda/eeschema/sch_text.js';

const plain = () => new IMPORTED_STROKE(0.2, LINE_STYLE.SOLID);

/** An importer at 1:1 with no offset, the identity case. */
function importer(): GRAPHICS_IMPORTER_SCH {
  const imp = new GRAPHICS_IMPORTER_SCH();
  imp.SetScale({ x: 1, y: 1 });
  imp.SetImportOffsetMM({ x: 0, y: 0 });
  imp.SetLineWidthMM(0.2);
  return imp;
}

const only = (imp: GRAPHICS_IMPORTER_SCH): SCH_ITEM => {
  const items = imp.GetItems();
  expect(items).toHaveLength(1);
  return items[0]!;
};
const line = (imp: GRAPHICS_IMPORTER_SCH) => only(imp) as SCH_LINE;
const shape = (imp: GRAPHICS_IMPORTER_SCH) => only(imp) as SCH_SHAPE;
const text = (imp: GRAPHICS_IMPORTER_SCH) => only(imp) as SCH_TEXT;

describe('mapping into schematic internal units', () => {
  it('a line is an SCH_LINE on LAYER_NOTES, in schIUScale', () => {
    // The only reason this class exists apart from GRAPHICS_IMPORTER_PCBNEW.
    const imp = importer();
    imp.AddLine({ x: 0, y: 0 }, { x: 10, y: 0 }, plain());
    const l = line(imp);
    expect([l.Type(), l.GetLayer()]).toEqual([KICAD_T.SCH_LINE_T, SCH_LAYER_ID.LAYER_NOTES]);
    expect(l.GetEndPoint().x).toBe(mmToIU(10));
  });

  it('applies the offset in millimetres of the scaled drawing, not the file', () => {
    // `coord *= scale; coord += offset; coord *= mmToIu` — so halving the scale
    // leaves the offset landing the drawing in the same place.
    const imp = importer();
    imp.SetScale({ x: 0.5, y: 0.5 });
    imp.SetImportOffsetMM({ x: 100, y: 0 });
    imp.AddLine({ x: 0, y: 0 }, { x: 10, y: 0 }, plain());
    const l = line(imp);
    expect([l.GetStartPoint().x, l.GetEndPoint().x]).toEqual([mmToIU(100), mmToIU(105)]);
  });

  it('skips a zero-length line', () => {
    // "Skip 0 len lines" — an artefact of the conversion, not content.
    const imp = importer();
    imp.AddLine({ x: 5, y: 5 }, { x: 5, y: 5 }, plain());
    expect(imp.GetItems()).toHaveLength(0);
  });
});

describe('the stroke width', () => {
  it('scales by the averaged X/Y factor, because a stroke has no direction', () => {
    const imp = importer();
    imp.SetScale({ x: 2, y: 4 }); // averaged: 3
    imp.AddLine({ x: 0, y: 0 }, { x: 1, y: 0 }, new IMPORTED_STROKE(1, LINE_STYLE.SOLID));
    expect(line(imp).GetStroke().GetWidth()).toBe(Math.trunc(1 * 3 * mmToIU(1)));
  });

  it('truncates rather than rounding, as the C++ int cast does', () => {
    const imp = importer();
    // A width whose IU value has a fractional part: 0.10005 mm.
    imp.AddLine({ x: 0, y: 0 }, { x: 1, y: 0 }, new IMPORTED_STROKE(0.10005, LINE_STYLE.SOLID));
    const exact = 0.10005 * mmToIU(1);
    expect(line(imp).GetStroke().GetWidth()).toBe(Math.trunc(exact));
    expect(Math.trunc(exact)).not.toBe(Math.round(exact));
  });

  it('falls back to the importer default when the file gave no width', () => {
    const imp = importer();
    imp.AddLine({ x: 0, y: 0 }, { x: 1, y: 0 }, new IMPORTED_STROKE(0, LINE_STYLE.SOLID));
    expect(line(imp).GetStroke().GetWidth()).toBe(Math.trunc(0.2 * mmToIU(1)));
  });

  it('passes -1 straight through: in Eeschema it means "no stroke"', () => {
    const imp = importer();
    imp.AddCircle(
      { x: 0, y: 0 },
      5,
      new IMPORTED_STROKE(-1, LINE_STYLE.SOLID),
      true,
      COLOR4D_BLACK,
    );
    expect(shape(imp).GetStroke().GetWidth()).toBe(-1);
  });
});

describe('the shapes', () => {
  it('a circle takes its radius from the mapped edge', () => {
    const imp = importer();
    imp.SetScale({ x: 3, y: 3 });
    imp.AddCircle({ x: 0, y: 0 }, 5, plain(), false, COLOR4D_BLACK);
    const c = shape(imp);
    expect([c.GetShape(), c.GetLayer()]).toEqual([SHAPE_T.CIRCLE, SCH_LAYER_ID.LAYER_NOTES]);
    expect(c.GetRadius()).toBe(mmToIU(15));
  });

  it('an arc through its mapped start, mid and end', () => {
    const imp = importer();
    imp.AddArc({ x: 0, y: 0 }, { x: 10, y: 0 }, new EDA_ANGLE(90), plain());
    const a = shape(imp);
    expect(a.GetShape()).toBe(SHAPE_T.ARC);
    expect(a.GetStart()).toEqual({ x: mmToIU(10), y: 0 });
    // RotatePoint( end, center, -aAngle ): -90 degrees takes (x, y) to (-y, x).
    expect(a.GetEnd()).toEqual({ x: 0, y: mmToIU(10) });
  });

  it('a polygon repeats its first vertex to close the outline', () => {
    // "Need to close last point for libedit".
    const imp = importer();
    imp.AddPolygon(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      plain(),
      false,
      COLOR4D_BLACK,
    );
    const outline = shape(imp).GetPolyShape().COutline(0);
    expect(outline.PointCount()).toBe(4);
    expect(outline.CPoint(3)).toEqual(outline.CPoint(0));
  });

  it('an empty polygon produces nothing', () => {
    const imp = importer();
    imp.AddPolygon([], plain(), false, COLOR4D_BLACK);
    expect(imp.GetItems()).toHaveLength(0);
  });

  it('a spline whose controls sit on the chord is demoted to an SCH_LINE', () => {
    // setupSplineOrLine: a cubic drawn the long way round is a segment, and "SCH_LINES aren't
    // SCH_SHAPES", so it is added as a line.
    const imp = importer();
    imp.AddSpline({ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 }, { x: 9, y: 0 }, plain());
    const l = line(imp);
    expect(l.Type()).toBe(KICAD_T.SCH_LINE_T);
    expect([l.GetStartPoint().x, l.GetEndPoint().x]).toEqual([0, mmToIU(9)]);
  });

  it('and a real curve stays a bezier', () => {
    const imp = importer();
    imp.AddSpline({ x: 0, y: 0 }, { x: 3, y: 8 }, { x: 6, y: -8 }, { x: 9, y: 0 }, plain());
    const b = shape(imp);
    expect(b.GetShape()).toBe(SHAPE_T.BEZIER);
    expect(b.GetBezierC1()).toEqual({ x: mmToIU(3), y: mmToIU(8) });
  });
});

describe('text', () => {
  it('is an SCH_TEXT on LAYER_NOTES at the mapped origin', () => {
    const imp = importer();
    imp.AddText({ x: 1, y: 2 }, 'hello', 2, 1, 0.1, 0, -1, -1, COLOR4D_BLACK);
    const t = text(imp);
    expect([t.Type(), t.GetLayer(), t.GetText()]).toEqual([
      KICAD_T.SCH_TEXT_T,
      SCH_LAYER_ID.LAYER_NOTES,
      'hello',
    ]);
    expect(t.GetTextPos()).toEqual({ x: mmToIU(1), y: mmToIU(2) });
  });

  it('scales height and width by their own axis factors, independently', () => {
    //     textItem->SetTextWidth( aWidth * ImportScalingFactor().x );
    //     textItem->SetTextHeight( aHeight * ImportScalingFactor().y );
    const imp = importer();
    imp.SetScale({ x: 2, y: 3 });
    imp.AddText({ x: 0, y: 0 }, 'x', 4, 5, 0, 0, -1, -1, COLOR4D_BLACK);
    const t = text(imp);
    expect([t.GetTextWidth(), t.GetTextHeight()]).toEqual([mmToIU(10), mmToIU(12)]);
  });

  it('truncates a size as the int parameter does', () => {
    const imp = importer();
    // 0.10005 mm -> 1000.5 IU, passed to SetTextWidth( int ).
    imp.AddText({ x: 0, y: 0 }, 'x', 0.10005, 0.10005, 0, 0, -1, -1, COLOR4D_BLACK);
    expect(text(imp).GetTextWidth()).toBe(Math.trunc(0.10005 * mmToIU(1)));
  });

  it('a mirrored import lands on TEXT_MIN_SIZE_MM, as EDA_TEXT clamps', () => {
    const imp = importer();
    imp.SetScale({ x: -1, y: -2 });
    imp.AddText({ x: 0, y: 0 }, 'x', 3, 3, 0, 0, -1, -1, COLOR4D_BLACK);
    const t = text(imp);
    expect([t.GetTextWidth(), t.GetTextHeight()]).toEqual([mmToIU(0.001), mmToIU(0.001)]);
  });

  it('carries both justifications through', () => {
    const imp = importer();
    imp.AddText({ x: 0, y: 0 }, 'x', 2, 2, 0, 0, 1, 1, COLOR4D_BLACK);
    expect([text(imp).GetHorizJustify(), text(imp).GetVertJustify()]).toEqual([
      GR_TEXT_H_ALIGN_T.GR_TEXT_H_ALIGN_RIGHT,
      GR_TEXT_V_ALIGN_T.GR_TEXT_V_ALIGN_BOTTOM,
    ]);
  });

  it('carries the thickness through as a mapped pen', () => {
    const imp = importer();
    imp.SetScale({ x: 2, y: 4 }); // averaged: 3
    imp.AddText({ x: 0, y: 0 }, 'x', 2, 2, 0.5, 0, -1, -1, COLOR4D_BLACK);
    expect(text(imp).GetTextThickness()).toBe(Math.trunc(0.5 * 3 * mmToIU(1)));
  });

  it('carries the angle and the colour through', () => {
    const imp = importer();
    imp.AddText({ x: 0, y: 0 }, 'x', 2, 2, 0, 90, -1, -1, { r: 1, g: 0, b: 0, a: 1 });
    const t = text(imp);
    expect(t.GetTextAngle().AsDegrees()).toBe(90);
    expect(t.GetTextColor()).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });
});

describe('the two fill rules, which are not the same rule', () => {
  it('a filled circle is FILLED_WITH_COLOR whatever the colour: SCH_SHAPE::SetFilled', () => {
    //     circle->SetFillColor( aFillColor );
    //     circle->SetFilled( aFilled );
    // SCH_SHAPE::SetFilled (sch_shape.cpp:69) gives a shape with no parent symbol
    // FILLED_WITH_COLOR; EDA_SHAPE's FILLED_SHAPE is for one in a symbol.
    const imp = importer();
    imp.AddCircle({ x: 0, y: 0 }, 5, plain(), true, { r: 0, g: 1, b: 0, a: 1 });
    const c = shape(imp);
    expect(c.GetFillMode()).toBe(FILL_T.FILLED_WITH_COLOR);
    expect(c.GetFillColor()).toEqual({ r: 0, g: 1, b: 0, a: 1 });
  });

  const triangle = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
  ];

  it('but a filled polygon with a colour is FILLED_WITH_COLOR', () => {
    const imp = importer();
    imp.AddPolygon(triangle, plain(), true, { r: 0, g: 1, b: 0, a: 1 });
    expect(shape(imp).GetFillMode()).toBe(FILL_T.FILLED_WITH_COLOR);
  });

  it('and a filled polygon with no colour is FILLED_SHAPE; an unfilled one NO_FILL', () => {
    const imp = importer();
    imp.AddPolygon(triangle, plain(), true, { r: 0, g: 0, b: 0, a: 0 });
    expect(shape(imp).GetFillMode()).toBe(FILL_T.FILLED_SHAPE);

    const imp2 = importer();
    imp2.AddPolygon(triangle, plain(), false, { r: 0, g: 1, b: 0, a: 1 });
    expect(shape(imp2).GetFillMode()).toBe(FILL_T.NO_FILL);
  });
});

describe('ellipses, which 10.0.6 has no shape for', () => {
  it('are reported and dropped', () => {
    const imp = importer();
    // As the plugins call it: through GRAPHICS_IMPORTER.
    const base: GRAPHICS_IMPORTER<SCH_ITEM> = imp;
    base.AddEllipse({ x: 0, y: 0 }, 10, 4, new EDA_ANGLE(30), plain(), false, COLOR4D_BLACK);
    base.AddEllipseArc(
      { x: 0, y: 0 },
      10,
      4,
      new EDA_ANGLE(0),
      new EDA_ANGLE(15),
      new EDA_ANGLE(95),
      plain(),
    );

    expect(imp.GetItems()).toHaveLength(0);
    // Each call reports for itself.
    const note = 'Ellipses are not supported in a schematic and were not imported.';
    expect(imp.GetMessages().split(note).length - 1).toBe(2);
  });

  it('but a DXF ELLIPSE reaches the sheet as four beziers, as 10.0.6 reads it', () => {
    // dxf_import_plugin.cpp addEllipse hands the importer TransformEllipseToBeziers' curves.
    const dxf = [
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'ELLIPSE',
      '10',
      '0',
      '20',
      '0',
      '11',
      '10',
      '21',
      '0',
      '40',
      '0.5',
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ].join('\n');

    const imp = importer();
    const plugin = new DXF_IMPORT_PLUGIN();
    plugin.SetImporter(imp);
    expect(plugin.Load(dxf)).toBe(true);
    plugin.Import();

    expect(imp.GetItems().map((i) => (i as SCH_SHAPE).GetShape())).toEqual([
      SHAPE_T.BEZIER,
      SHAPE_T.BEZIER,
      SHAPE_T.BEZIER,
      SHAPE_T.BEZIER,
    ]);
  });
});
