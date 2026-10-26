// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `GRAPHICS_IMPORTER_SCH` (eeschema/import_gfx/graphics_importer_sch.{h,cpp}): graphics imported
 * into a sheet as live SCH_LINE, SCH_SHAPE and SCH_TEXT items on their default LAYER_NOTES, for
 * SCH_DRAWING_TOOLS::ImportGraphics to place.
 *
 * MapCoordinate scales, then adds the offset in millimetres, then converts to IU, so the offset is
 * in millimetres of the already-scaled drawing. MapLineWidth averages the two scale factors and
 * truncates, a C++ `int( double )`. A stroke width of -1 is Eeschema's historical "no stroke" and
 * passes through unmapped.
 *
 * AddEllipse / AddEllipseArc: 10.0.6 has no ellipse shape, so they are reported and dropped, as
 * GRAPHICS_IMPORTER_LIB_SYMBOL and GRAPHICS_IMPORTER_PCBNEW drop them.
 */
import {
  COLOR4D_UNSPECIFIED,
  GRAPHICS_IMPORTER,
  type IMPORTED_STROKE,
  setupSplineOrLine,
} from '@ziroeda/common/import_gfx/graphics_importer.js';
import { schIUScale } from '@ziroeda/common/eda_units.js';
import { FILL_T, SHAPE_T } from '@ziroeda/common/eda_shape.js';
import type { GR_TEXT_H_ALIGN_T, GR_TEXT_V_ALIGN_T } from '@ziroeda/common/eda_text.js';
import { type Color4d, color4dEquals } from '@ziroeda/common/gal/color4d.js';
import { STROKE_PARAMS } from '@ziroeda/common/stroke_params.js';
import { EDA_ANGLE, EDA_ANGLE_T } from '@ziroeda/kimath/src/geometry/eda_angle.js';
import { KiROUND } from '@ziroeda/kimath/src/math/util.js';
import type { Vec2, VECTOR2I } from '@ziroeda/kimath/src/math/vector2.js';
import { CalcArcCenterFromAngle, RotatePointD } from '@ziroeda/kimath/src/trigo.js';
import type { SCH_ITEM } from '../sch_item.js';
import { SCH_LINE } from '../sch_line.js';
import { SCH_SHAPE } from '../sch_shape.js';
import { SCH_TEXT } from '../sch_text.js';

export class GRAPHICS_IMPORTER_SCH extends GRAPHICS_IMPORTER<SCH_ITEM> {
  constructor() {
    super();
    this.m_millimeterToIu = schIUScale.mmToIU(1.0);
  }

  /** `MapCoordinate( aCoordinate )`: scale, offset, to IU, rounded. */
  MapCoordinate(aCoordinate: Vec2): VECTOR2I {
    const scale = this.GetScale();
    const offset = this.GetImportOffsetMM();
    const k = this.GetMillimeterToIuFactor();

    return {
      x: KiROUND((aCoordinate.x * scale.x + offset.x) * k),
      y: KiROUND((aCoordinate.y * scale.y + offset.y) * k),
    };
  }

  /** `MapLineWidth( aLineWidth )`: the default width when none, scaled by the mean factor. */
  MapLineWidth(aLineWidth: number): number {
    const factor = this.ImportScalingFactor();
    const scale = (Math.abs(factor.x) + Math.abs(factor.y)) * 0.5;

    if (aLineWidth <= 0.0) return Math.trunc(this.GetLineWidthMM() * scale);

    // aLineWidth is in mm:
    return Math.trunc(aLineWidth * scale);
  }

  /** `MapStrokeParams( aStroke )`. */
  MapStrokeParams(aStroke: IMPORTED_STROKE): STROKE_PARAMS {
    // Historicaly -1 meant no-stroke in Eeschema.
    const width = aStroke.GetWidth() === -1 ? -1 : this.MapLineWidth(aStroke.GetWidth());

    return new STROKE_PARAMS(width, aStroke.GetPlotStyle(), aStroke.GetColor());
  }

  AddLine(aStart: Vec2, aEnd: Vec2, aStroke: IMPORTED_STROKE): void {
    const pt0 = this.MapCoordinate(aStart);
    const pt1 = this.MapCoordinate(aEnd);

    // Skip 0 len lines:
    if (pt0.x === pt1.x && pt0.y === pt1.y) return;

    const line = new SCH_LINE();
    line.SetStroke(this.MapStrokeParams(aStroke));

    line.SetStartPoint(pt0);
    line.SetEndPoint(pt1);

    this.addItem(line);
  }

  AddCircle(
    aCenter: Vec2,
    aRadius: number,
    aStroke: IMPORTED_STROKE,
    aFilled: boolean,
    aFillColor: Color4d = COLOR4D_UNSPECIFIED,
  ): void {
    const circle = new SCH_SHAPE(SHAPE_T.CIRCLE);
    circle.SetFillColor(aFillColor);
    circle.SetFilled(aFilled);
    circle.SetStroke(this.MapStrokeParams(aStroke));
    circle.SetStart(this.MapCoordinate(aCenter));
    circle.SetEnd(this.MapCoordinate({ x: aCenter.x + aRadius, y: aCenter.y }));

    this.addItem(circle);
  }

  AddArc(aCenter: Vec2, aStart: Vec2, aAngle: EDA_ANGLE, aStroke: IMPORTED_STROKE): void {
    const arc = new SCH_SHAPE(SHAPE_T.ARC);

    /**
     * We need to perform the rotation/conversion here while still using floating point values
     * to avoid rounding errors when operating in integer space in KiCad
     */
    const end = RotatePointD(aStart, aCenter, aAngle.negate());
    const mid = RotatePointD(aStart, aCenter, aAngle.negate().divide(2.0));

    arc.SetArcGeometry(
      this.MapCoordinate(aStart),
      this.MapCoordinate(mid),
      this.MapCoordinate(end),
    );

    // Ensure the arc can be handled by KiCad. Arcs with a too big radius cannot.
    // The criteria used here is radius < MAX_INT / 2.
    // this is not perfect, but we do not know the exact final position of the arc, so
    // we cannot test the coordinate values, because the arc can be moved before being placed.
    const center = CalcArcCenterFromAngle(arc.GetStart(), arc.GetEnd(), aAngle);
    const radius = Math.hypot(center.x - arc.GetStart().x, center.y - arc.GetStart().y);
    const rd_max_value = 2147483647 / 2.0;

    if (radius >= rd_max_value) {
      // Arc cannot be handled: convert it to a segment
      this.AddLine(aStart, end, aStroke);
      return;
    }

    arc.SetStroke(this.MapStrokeParams(aStroke));

    this.addItem(arc);
  }

  AddPolygon(
    aVertices: Vec2[],
    aStroke: IMPORTED_STROKE,
    aFilled: boolean,
    aFillColor: Color4d = COLOR4D_UNSPECIFIED,
  ): void {
    const convertedPoints = aVertices.map((p) => this.MapCoordinate(p));

    if (convertedPoints.length === 0) return;

    const polygon = new SCH_SHAPE(SHAPE_T.POLY);

    if (aFilled) {
      polygon.SetFillMode(
        !color4dEquals(aFillColor, COLOR4D_UNSPECIFIED)
          ? FILL_T.FILLED_WITH_COLOR
          : FILL_T.FILLED_SHAPE,
      );
    }

    polygon.SetFillColor(aFillColor);
    polygon.SetPolyPoints(convertedPoints);
    polygon.AddPoint(convertedPoints[0]!); // Need to close last point for libedit

    polygon.SetStroke(this.MapStrokeParams(aStroke));

    this.addItem(polygon);
  }

  AddText(
    aOrigin: Vec2,
    aText: string,
    aHeight: number,
    aWidth: number,
    aThickness: number,
    aOrientation: number,
    aHJustify: GR_TEXT_H_ALIGN_T,
    aVJustify: GR_TEXT_V_ALIGN_T,
    aColor: Color4d = COLOR4D_UNSPECIFIED,
  ): void {
    const textItem = new SCH_TEXT();
    textItem.SetTextColor(aColor);
    textItem.SetTextThickness(this.MapLineWidth(aThickness));
    textItem.SetTextPos(this.MapCoordinate(aOrigin));
    textItem.SetTextAngle(new EDA_ANGLE(aOrientation, EDA_ANGLE_T.DEGREES_T));
    // SetTextWidth( int ): the double truncates as it is passed.
    textItem.SetTextWidth(Math.trunc(aWidth * this.ImportScalingFactor().x));
    textItem.SetTextHeight(Math.trunc(aHeight * this.ImportScalingFactor().y));
    textItem.SetVertJustify(aVJustify);
    textItem.SetHorizJustify(aHJustify);
    textItem.SetText(aText);

    this.addItem(textItem);
  }

  AddSpline(
    aStart: Vec2,
    aBezierControl1: Vec2,
    aBezierControl2: Vec2,
    aEnd: Vec2,
    aStroke: IMPORTED_STROKE,
  ): void {
    const spline = new SCH_SHAPE(SHAPE_T.BEZIER);
    spline.SetStroke(this.MapStrokeParams(aStroke));
    spline.SetStart(this.MapCoordinate(aStart));
    spline.SetBezierC1(this.MapCoordinate(aBezierControl1));
    spline.SetBezierC2(this.MapCoordinate(aBezierControl2));
    spline.SetEnd(this.MapCoordinate(aEnd));

    // `setupSplineOrLine( *spline, aStroke.GetWidth() / 2 )`: the int parameter truncates the
    // half-width. BEZIER, a SEGMENT when degenerate, or nothing when that segment is too short.
    const accuracy = Math.trunc(aStroke.GetWidth() / 2);
    const kind = setupSplineOrLine(
      spline.GetStart(),
      spline.GetBezierC1(),
      spline.GetBezierC2(),
      spline.GetEnd(),
      accuracy,
    );

    if (kind === null) return;

    // SCH_LINES aren't SCH_SHAPES
    if (kind === 'line') {
      this.AddLine(aStart, aEnd, aStroke);
    } else {
      spline.RebuildBezierToSegmentsPointsList(accuracy);
      this.addItem(spline);
    }
  }

  /** Not in 10.0.6's GRAPHICS_IMPORTER: there is no ellipse shape to make. Reported, dropped. */
  AddEllipse(): void {
    this.ReportMsg('Ellipses are not supported in a schematic and were not imported.');
  }

  /** `AddEllipseArc`: dropped for the same reason as {@link AddEllipse}. */
  AddEllipseArc(): void {
    this.ReportMsg('Ellipses are not supported in a schematic and were not imported.');
  }
}
