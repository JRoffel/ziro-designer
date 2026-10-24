// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The SCH_ITEM `Plot` family - LIB_SYMBOL::Plot / PlotFields, SCH_SHAPE, SCH_PIN (PlotPinType,
 * PlotPinTexts), SCH_FIELD, SCH_TEXT, SCH_TEXTBOX - checked against KiCad's own output.
 *
 * `golden/` is `kicad-cli sym export svg -t _builtin_default` (10.0.6) of plot_symbols.kicad_sym,
 * symbols picked from the installed libraries to cover every shape, every pin decoration, text,
 * text boxes, multi-unit and De Morgan, plus one written here, EDGE_OUTSIDE: pin names outside
 * the body, non-logic pins both ways, a size-0 name and a size-0 number, and a dashed outline
 * drawn before the pins (the pen must be back to solid for them); `golden_hidden/` adds `--include-hidden-pins
 * --include-hidden-fields` for two of them. This replays `EESCHEMA_JOBS_HANDLER::doSymExportSvg`
 * (eeschema_jobs_handler.cpp:967) on our classes and compares the documents byte for byte, the
 * date in `<title>` taken from the golden.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { schIUScale } from '@ziroeda/common/eda_units.js';
import { PAGE_INFO, PAGE_SIZE_TYPE } from '@ziroeda/common/page_info.js';
import { SVG_PLOTTER } from '@ziroeda/common/plotters/SVG_plotter.js';
import { COLOR_SETTINGS } from '@ziroeda/common/settings/color_settings.js';
import { DEFAULT_LINE_WIDTH_MILS } from '@ziroeda/eeschema/default_values.js';
import type { LIB_SYMBOL } from '@ziroeda/eeschema/lib_symbol.js';
import { SCH_IO_KICAD_SEXPR_PARSER } from '@ziroeda/eeschema/sch_io/kicad_sexpr/sch_io_kicad_sexpr_parser.js';
import { SCH_PLOT_OPTS } from '@ziroeda/eeschema/sch_plotter.js';
import { SCH_RENDER_SETTINGS } from '@ziroeda/eeschema/sch_render_settings.js';

const DIR = fileURLToPath(new URL('../../data/eeschema/plot_symbol_svg/', import.meta.url));

const symbols = new Map<string, LIB_SYMBOL>();
new SCH_IO_KICAD_SEXPR_PARSER(
  readFileSync(`${DIR}plot_symbols.kicad_sym`, 'utf8'),
  'plot_symbols.kicad_sym',
).ParseLib(symbols);

const defaultTheme = COLOR_SETTINGS.CreateBuiltinColorSettings().find(
  (c) => c.GetFilename() === COLOR_SETTINGS.COLOR_BUILTIN_DEFAULT,
)!;

/** `doSymExportSvg` for one unit and body style. */
function plotSymbol(
  symbol: LIB_SYMBOL,
  unit: number,
  bodyStyle: number,
  fileName: string,
  now: Date,
  hidden: boolean,
): string {
  const renderSettings = new SCH_RENDER_SETTINGS();
  renderSettings.LoadColors(defaultTheme);
  renderSettings.SetDefaultPenWidth(DEFAULT_LINE_WIDTH_MILS * schIUScale.IU_PER_MILS);
  renderSettings.m_ShowHiddenPins = hidden;
  renderSettings.m_ShowHiddenFields = hidden;

  const symbolBB = symbol.Flatten().GetUnitBoundingBox(unit, bodyStyle, !hidden);
  const pageInfo = new PAGE_INFO(PAGE_SIZE_TYPE.User);
  pageInfo.SetHeightMils(schIUScale.iuToMils(symbolBB.GetHeight() * 1.2));
  pageInfo.SetWidthMils(schIUScale.iuToMils(symbolBB.GetWidth() * 1.2));

  const plotter = new SVG_PLOTTER();
  plotter.SetRenderSettings(renderSettings);
  plotter.SetPageSettings(pageInfo);
  plotter.SetColorMode(true);

  const plot_offset = symbolBB.GetCenter();
  plotter.SetViewport(plot_offset, schIUScale.IU_PER_MILS / 10, 1.0, false);
  plotter.SetCreator('Eeschema-SVG');
  plotter.OpenFile(fileName);

  const plotOpts = new SCH_PLOT_OPTS();
  plotter.StartPlot('1', now);

  const background = true;
  const offset = {
    x: Math.trunc(pageInfo.GetWidthIU(schIUScale.IU_PER_MILS) / 2),
    y: Math.trunc(pageInfo.GetHeightIU(schIUScale.IU_PER_MILS) / 2),
  };

  symbol.Plot(plotter, background, plotOpts, unit, bodyStyle, offset, false);
  symbol.PlotFields(plotter, background, plotOpts, unit, bodyStyle, offset, false);

  symbol.Plot(plotter, !background, plotOpts, unit, bodyStyle, offset, false);
  symbol.PlotFields(plotter, !background, plotOpts, unit, bodyStyle, offset, false);

  plotter.EndPlot();
  return plotter.text();
}

/** `<title>... date 2026-10-24T06:37:12 </title>` as the local time SVG_PLOTTER printed. */
function goldenDate(aSvg: string): Date {
  const m = /date (\d+)-(\d+)-(\d+)T(\d+):(\d+):(\d+)/.exec(aSvg)!;
  return new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!);
}

for (const [folder, hidden] of [
  ['golden', false],
  ['golden_hidden', true],
] as const) {
  describe(`${folder}: kicad-cli sym export svg`, () => {
    for (const file of readdirSync(`${DIR}${folder}`).sort()) {
      // Ohmmeter's text item is "Ω" (U+03A9), which newstroke_font.ts carries since it took every
      // block before CJK: its strokes are KiCad's, not the '?' they fell back to.
      it(file, () => {
        const m = /^(.+)_unit(\d+)(_demorgan)?\.svg$/.exec(file)!;
        const symbol = symbols.get(m[1]!)!;
        const golden = readFileSync(`${DIR}${folder}/${file}`, 'utf8');

        const ours = plotSymbol(symbol, +m[2]!, m[3] ? 2 : 1, file, goldenDate(golden), hidden);

        expect(ours).toBe(golden);
      });
    }
  });
}
