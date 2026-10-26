// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `GRAPHICS_IMPORTER_LIB_SYMBOL` (graphics_importer_lib_symbol.cpp): imported graphics as
 * SCH_SHAPE / SCH_TEXT items on LAYER_DEVICE, parented to the symbol, in the importer's unit;
 * coordinates scaled, offset and taken to IU with no flip; zero-length lines skipped; a polygon
 * closed and checked; a flat spline demoted to a line; ellipses (not in 10.0.6) reported.
 */
import { FILL_T, SHAPE_T } from '@ziroeda/common/eda_shape.js';
import { mmToIU } from '@ziroeda/common/eda_units.js';
import { COLOR4D_BLACK } from '@ziroeda/common/gal/color4d.js';
import { IMPORTED_STROKE } from '@ziroeda/common/import_gfx/graphics_importer.js';
import { SCH_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { LINE_STYLE } from '@ziroeda/common/stroke_params.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import { GRAPHICS_IMPORTER_LIB_SYMBOL } from '@ziroeda/eeschema/import_gfx/graphics_importer_lib_symbol.js';
import { LIB_SYMBOL } from '@ziroeda/eeschema/lib_symbol.js';
import type { SCH_SHAPE } from '@ziroeda/eeschema/sch_shape.js';
import type { SCH_TEXT } from '@ziroeda/eeschema/sch_text.js';
import { EDA_ANGLE } from '@ziroeda/kimath/src/geometry/eda_angle.js';
import { describe, expect, it } from 'vitest';

const plain = () => new IMPORTED_STROKE(0.2, LINE_STYLE.SOLID);
const symbol = new LIB_SYMBOL('S');

function importer(aUnit = 2): GRAPHICS_IMPORTER_LIB_SYMBOL {
  const imp = new GRAPHICS_IMPORTER_LIB_SYMBOL(symbol, aUnit);
  imp.SetScale({ x: 1, y: 1 });
  imp.SetImportOffsetMM({ x: 0, y: 0 });
  imp.SetLineWidthMM(0.2);
  return imp;
}

const shapes = (imp: GRAPHICS_IMPORTER_LIB_SYMBOL) => imp.GetItems() as SCH_SHAPE[];

describe('every item is the symbol’s', () => {
  it('on LAYER_DEVICE, parented to the symbol, in the importer’s unit', () => {
    const imp = importer(3);
    imp.AddLine({ x: 0, y: 0 }, { x: 10, y: 7 }, plain());
    imp.AddText({ x: 1, y: 2 }, 'hi', 2, 1, 0.3, 90, -1, -1, COLOR4D_BLACK);
    for (const item of imp.GetItems()) {
      expect(item.GetLayer()).toBe(SCH_LAYER_ID.LAYER_DEVICE);
      expect(item.GetParent() === symbol).toBe(true);
      expect(item.GetUnit()).toBe(3);
    }
  });
});

describe('coordinates', () => {
  it('scale, then the offset in millimetres, then IU; Y is down, not flipped', () => {
    const imp = importer();
    imp.SetScale({ x: 2, y: 2 });
    imp.SetImportOffsetMM({ x: 1, y: -1 });
    imp.AddLine({ x: 0, y: 0 }, { x: 10, y: 7 }, plain());
    const line = shapes(imp)[0]!;
    expect(line.GetShape()).toBe(SHAPE_T.POLY);
    expect(line.GetPolyPoints()).toEqual([
      { x: mmToIU(1), y: mmToIU(-1) },
      { x: mmToIU(21), y: mmToIU(13) },
    ]);
  });

  it('a zero-length line is skipped', () => {
    const imp = importer();
    imp.AddLine({ x: 5, y: 5 }, { x: 5, y: 5 }, plain());
    expect(imp.GetItems()).toHaveLength(0);
  });

  it('a width of -1 stays "no stroke"; none takes the default, scaled by the mean factor', () => {
    const imp = importer();
    imp.SetScale({ x: 1, y: 3 });
    imp.AddLine({ x: 0, y: 0 }, { x: 1, y: 0 }, new IMPORTED_STROKE(-1));
    imp.AddLine({ x: 0, y: 0 }, { x: 1, y: 0 }, new IMPORTED_STROKE(0));
    imp.AddLine({ x: 0, y: 0 }, { x: 1, y: 0 }, new IMPORTED_STROKE(0.5));
    expect(shapes(imp).map((s) => s.GetStroke().GetWidth())).toEqual([
      -1,
      Math.trunc(0.2 * mmToIU(1) * 2),
      Math.trunc(0.5 * mmToIU(1) * 2),
    ]);
  });
});

describe('a polygon is checked before it is kept', () => {
  const tri = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];

  it('closed by repeating the first vertex, filled with the outline colour or its own', () => {
    const imp = importer();
    imp.AddPolygon(tri, plain(), true);
    imp.AddPolygon(tri, plain(), true, COLOR4D_BLACK);
    imp.AddPolygon(tri, plain(), false);
    const [outline, coloured, open] = shapes(imp);
    expect(outline!.GetPolyPoints()).toHaveLength(4);
    expect(outline!.GetPolyPoints()[3]).toEqual(outline!.GetPolyPoints()[0]);
    expect(outline!.GetFillMode()).toBe(FILL_T.FILLED_SHAPE);
    expect(coloured!.GetFillMode()).toBe(FILL_T.FILLED_WITH_COLOR);
    expect(open!.GetFillMode()).toBe(FILL_T.NO_FILL);
  });

  it('dropped at two points or fewer once closed (IsPolyShapeValid), so one vertex goes', () => {
    // Two vertices close to three points, which upstream keeps; one closes to two.
    const imp = importer();
    imp.AddPolygon(tri.slice(0, 1), plain(), false);
    imp.AddPolygon([], plain(), false);
    expect(imp.GetItems()).toHaveLength(0);
    imp.AddPolygon(tri.slice(0, 2), plain(), false);
    expect(shapes(imp)[0]!.GetPolyPoints()).toHaveLength(3);
  });
});

describe('curves', () => {
  it('a circle: centre and a point on the rim', () => {
    const imp = importer();
    imp.AddCircle({ x: 1, y: 1 }, 3, plain(), true, COLOR4D_BLACK);
    const c = shapes(imp)[0]!;
    expect(c.GetShape()).toBe(SHAPE_T.CIRCLE);
    expect(c.GetStart()).toEqual({ x: mmToIU(1), y: mmToIU(1) });
    expect(c.GetEnd()).toEqual({ x: mmToIU(4), y: mmToIU(1) });
    expect(c.IsSolidFill()).toBe(true);
  });

  it('an arc through its start, mid and end', () => {
    const imp = importer();
    imp.AddArc({ x: 0, y: 0 }, { x: 5, y: 0 }, new EDA_ANGLE(90), plain());
    const a = shapes(imp)[0]!;
    expect(a.GetShape()).toBe(SHAPE_T.ARC);
    expect(a.GetStart()).toEqual({ x: mmToIU(5), y: 0 });
    // RotatePoint( end, center, -aAngle ): 90 degrees is a quarter turn to -Y here.
    expect(a.GetEnd().x).toBeCloseTo(0, -1);
    expect(Math.abs(a.GetEnd().y)).toBe(mmToIU(5));
  });

  it('a flat spline is a line; a real one a bezier', () => {
    const imp = importer();
    imp.AddSpline({ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 }, { x: 9, y: 0 }, plain());
    imp.AddSpline({ x: 0, y: 0 }, { x: 3, y: 8 }, { x: 6, y: -8 }, { x: 9, y: 0 }, plain());
    expect(shapes(imp).map((s) => s.GetShape())).toEqual([SHAPE_T.POLY, SHAPE_T.BEZIER]);
  });

  it('an ellipse is reported, not imported (10.0.6 has none)', () => {
    const imp = importer();
    imp.AddEllipse();
    imp.AddEllipseArc();
    expect(imp.GetItems()).toHaveLength(0);
    expect(imp.GetMessages()).toContain('Ellipses are not supported');
  });
});

describe('text', () => {
  it('an SCH_TEXT with the pen, the glyph box, the angle and the justification', () => {
    const imp = importer();
    imp.AddText({ x: 1, y: 2 }, 'hi', 2, 1, 0.3, 90, 1, 1, COLOR4D_BLACK);
    const t = imp.GetItems()[0] as SCH_TEXT;
    expect(t.Type()).toBe(KICAD_T.SCH_TEXT_T);
    expect(t.GetText()).toBe('hi');
    expect(t.GetPosition()).toEqual({ x: mmToIU(1), y: mmToIU(2) });
    expect(t.GetTextAngle().AsDegrees()).toBe(90);
    expect(t.GetTextHeight()).toBe(mmToIU(2));
    expect(t.GetTextWidth()).toBe(mmToIU(1));
    expect(t.GetTextThickness()).toBe(Math.trunc(0.3 * mmToIU(1)));
    expect([t.GetHorizJustify(), t.GetVertJustify()]).toEqual([1, 1]);
  });

  it('truncates a size as the int parameter does', () => {
    const imp = importer();
    // 0.10005 mm -> 1000.5 IU, passed to SetTextWidth( int ) and SetTextHeight( int ).
    imp.AddText({ x: 0, y: 0 }, 'x', 0.10005, 0.10005, 0, 0, -1, -1, COLOR4D_BLACK);
    const t = imp.GetItems()[0] as SCH_TEXT;
    const exact = 0.10005 * mmToIU(1);
    expect([t.GetTextWidth(), t.GetTextHeight()]).toEqual([Math.trunc(exact), Math.trunc(exact)]);
  });
});
