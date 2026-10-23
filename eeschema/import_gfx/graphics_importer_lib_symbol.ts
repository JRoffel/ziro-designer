// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `GRAPHICS_IMPORTER_LIB_SYMBOL` (eeschema/import_gfx/graphics_importer_lib_symbol.{h,cpp}):
 * graphics imported into a library symbol as SCH_SHAPE and SCH_TEXT items on LAYER_DEVICE, each
 * parented to the symbol and given the unit, for SYMBOL_EDITOR_DRAWING_TOOLS::ImportGraphics to
 * place.
 *
 * Coordinates are mapped as the schematic's are - scale, then the offset in millimetres, then to
 * IU - with no Y flip: a symbol's items are held in the same +Y-down space as a sheet's, and only
 * the file format stores them +Y up.
 *
 * AddEllipse / AddEllipseArc: 10.0.6 has no ellipse shape, so they are reported and dropped, as
 * GRAPHICS_IMPORTER_PCBNEW drops them.
 */
import {
  COLOR4D_UNSPECIFIED,
  GRAPHICS_IMPORTER,
  type IMPORTED_STROKE,
} from '@ziroeda/common/import_gfx/graphics_importer.js';
import { ARC_LOW_DEF_MM, schIUScale } from '@ziroeda/common/eda_units.js';
import { FILL_T, SHAPE_T } from '@ziroeda/common/eda_shape.js';
import type { GR_TEXT_H_ALIGN_T, GR_TEXT_V_ALIGN_T } from '@ziroeda/common/eda_text.js';
import { type Color4d, color4dEquals } from '@ziroeda/common/gal/color4d.js';
import { SCH_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { STROKE_PARAMS } from '@ziroeda/common/stroke_params.js';
import { EDA_ANGLE, EDA_ANGLE_T } from '@ziroeda/kimath/src/geometry/eda_angle.js';
import { KiROUND } from '@ziroeda/kimath/src/math/util.js';
import type { Vec2, VECTOR2I } from '@ziroeda/kimath/src/math/vector2.js';
import { CalcArcCenterFromAngle, RotatePointD } from '@ziroeda/kimath/src/trigo.js';
import type { LIB_SYMBOL } from '../lib_symbol.js';
import type { SCH_ITEM } from '../sch_item.js';
import { SCH_SHAPE } from '../sch_shape.js';
import { SCH_TEXT } from '../sch_text.js';

export class GRAPHICS_IMPORTER_LIB_SYMBOL extends GRAPHICS_IMPORTER<SCH_ITEM> {
  private readonly m_symbol: LIB_SYMBOL;
  private readonly m_unit: number;

  constructor(aSymbol: LIB_SYMBOL, aUnit: number) {
    super();
    this.m_symbol = aSymbol;
    this.m_unit = aUnit;
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

  /** A shape of \a aShape on LAYER_DEVICE, the symbol's, in the importer's unit. */
  private newShape(aShape: SHAPE_T): SCH_SHAPE {
    const shape = new SCH_SHAPE(aShape, SCH_LAYER_ID.LAYER_DEVICE);
    shape.SetParent(this.m_symbol);
    shape.SetUnit(this.m_unit);
    return shape;
  }

  AddLine(aStart: Vec2, aEnd: Vec2, aStroke: IMPORTED_STROKE): void {
    const pt0 = this.MapCoordinate(aStart);
    const pt1 = this.MapCoordinate(aEnd);

    // Skip 0 len lines:
    if (pt0.x === pt1.x && pt0.y === pt1.y) return;

    const line = this.newShape(SHAPE_T.POLY);
    line.SetStroke(this.MapStrokeParams(aStroke));
    line.AddPoint(pt0);
    line.AddPoint(pt1);

    this.addItem(line);
  }

  AddCircle(
    aCenter: Vec2,
    aRadius: number,
    aStroke: IMPORTED_STROKE,
    aFilled: boolean,
    aFillColor: Color4d = COLOR4D_UNSPECIFIED,
  ): void {
    const circle = this.newShape(SHAPE_T.CIRCLE);
    circle.SetFillColor(aFillColor);
    circle.SetFilled(aFilled);
    circle.SetStroke(this.MapStrokeParams(aStroke));
    circle.SetStart(this.MapCoordinate(aCenter));
    circle.SetEnd(this.MapCoordinate({ x: aCenter.x + aRadius, y: aCenter.y }));

    this.addItem(circle);
  }

  AddArc(aCenter: Vec2, aStart: Vec2, aAngle: EDA_ANGLE, aStroke: IMPORTED_STROKE): void {
    const arc = this.newShape(SHAPE_T.ARC);

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

    const polygon = this.newShape(SHAPE_T.POLY);

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

    if (polygon.IsPolyShapeValid()) this.addItem(polygon);
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
    const textItem = new SCH_TEXT(this.MapCoordinate(aOrigin), aText, SCH_LAYER_ID.LAYER_DEVICE);
    textItem.SetParent(this.m_symbol);
    textItem.SetUnit(this.m_unit);
    textItem.SetTextColor(aColor);
    textItem.SetTextThickness(this.MapLineWidth(aThickness));
    textItem.SetTextAngle(new EDA_ANGLE(aOrientation, EDA_ANGLE_T.DEGREES_T));
    textItem.SetTextWidth(aWidth * this.ImportScalingFactor().x);
    textItem.SetTextHeight(aHeight * this.ImportScalingFactor().y);
    textItem.SetVertJustify(aVJustify);
    textItem.SetHorizJustify(aHJustify);

    this.addItem(textItem);
  }

  AddSpline(
    aStart: Vec2,
    aBezierControl1: Vec2,
    aBezierControl2: Vec2,
    aEnd: Vec2,
    aStroke: IMPORTED_STROKE,
  ): void {
    const spline = this.newShape(SHAPE_T.BEZIER);
    spline.SetStroke(this.MapStrokeParams(aStroke));
    spline.SetStart(this.MapCoordinate(aStart));
    spline.SetBezierC1(this.MapCoordinate(aBezierControl1));
    spline.SetBezierC2(this.MapCoordinate(aBezierControl2));
    spline.SetEnd(this.MapCoordinate(aEnd));
    spline.RebuildBezierToSegmentsPointsList(schIUScale.mmToIU(ARC_LOW_DEF_MM));

    // If the spline is degenerated (i.e. a segment) add it as segment or discard it if
    // null (i.e. very small) length)
    if (spline.GetBezierPoints().length <= 2) {
      // segment smaller than 1 IU len are skipped by AddLine()
      this.AddLine(aStart, aEnd, aStroke);
      return;
    }

    this.addItem(spline);
  }

  /** Not in 10.0.6's GRAPHICS_IMPORTER: there is no ellipse shape to make. Reported, dropped. */
  AddEllipse(): void {
    this.ReportMsg('Ellipses are not supported in a symbol and were not imported.');
  }

  /** `AddEllipseArc`: dropped for the same reason as {@link AddEllipse}. */
  AddEllipseArc(): void {
    this.ReportMsg('Ellipses are not supported in a symbol and were not imported.');
  }
}
