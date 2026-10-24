// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `SYMBOL_EDIT_FRAME::SVGPlotSymbol` (eeschema/symbol_editor/symbol_editor_plotter.cpp): the
 * current unit and body style of the symbol, plotted through SVG_PLOTTER on the screen's page.
 *
 * A mixin, applied to SYMBOL_EDIT_FRAME by symbol_edit_frame.ts like the other files that hold its
 * methods. Upstream's plotter writes the file it opened; ours accumulates the document, and the
 * frame hands it to WriteOutputFile, which downloads it like every generated output.
 */

import { schIUScale } from '@ziroeda/common/eda_units.js';
import { SVG_PLOTTER } from '@ziroeda/common/plotters/SVG_plotter.js';
import type { VECTOR2I } from '@ziroeda/kimath/src/math/vector2.js';
import { SCH_PLOT_OPTS } from '../sch_plotter.js';
import { SCH_RENDER_SETTINGS } from '../sch_render_settings.js';
import type { SYMBOL_EDIT_FRAME } from './symbol_edit_frame.js';

export class SYMBOL_EDITOR_PLOTTER_MIXIN {
  /**
   * Create the SVG file for the current symbol.
   *
   * @param aFullFileName the name of the file to create.
   * @param aOffset the symbol's offset on the page, so it plots centred.
   */
  SVGPlotSymbol(this: SYMBOL_EDIT_FRAME, aFullFileName: string, aOffset: VECTOR2I): void {
    const renderSettings = new SCH_RENDER_SETTINGS();
    renderSettings.LoadColors(this.GetColorSettings());
    renderSettings.SetDefaultPenWidth(this.GetRenderSettings()!.GetDefaultPenWidth());

    const pageInfo = this.GetScreen()!.GetPageSettings();

    const plotter = new SVG_PLOTTER();
    plotter.SetRenderSettings(renderSettings);
    plotter.SetPageSettings(pageInfo);
    plotter.SetColorMode(true);

    const plot_offset = { x: 0, y: 0 };
    const scale = 1.0;

    // Currently, plot units are in decimil
    plotter.SetViewport(plot_offset, schIUScale.IU_PER_MILS / 10, scale, false);

    // Init :
    plotter.SetCreator('Eeschema-SVG');

    if (!plotter.OpenFile(aFullFileName)) return;

    // `LOCALE_IO toggle`: numbers are written in the C locale already.
    const plotOpts = new SCH_PLOT_OPTS();

    plotter.StartPlot('1');

    if (this.m_symbol) {
      const background = true;

      this.m_symbol.Plot(
        plotter,
        background,
        plotOpts,
        this.GetUnit(),
        this.GetBodyStyle(),
        aOffset,
        false,
      );
      this.m_symbol.Plot(
        plotter,
        !background,
        plotOpts,
        this.GetUnit(),
        this.GetBodyStyle(),
        aOffset,
        false,
      );
      this.m_symbol.PlotFields(
        plotter,
        !background,
        plotOpts,
        this.GetUnit(),
        this.GetBodyStyle(),
        aOffset,
        false,
      );
    }

    plotter.EndPlot();

    this.WriteOutputFile(aFullFileName, new TextEncoder().encode(plotter.text()), 'image/svg+xml');
  }
}
