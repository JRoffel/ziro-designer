// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `SYMBOL_PREVIEW_WIDGET` (eeschema/widgets/symbol_preview_widget.{h,cpp}): a live LIB_SYMBOL drawn
 * on an SCH_PREVIEW_PANEL, fitted to the panel with a fifth of whitespace, one unit and body style
 * at a time - or, when built with a status panel, a line of text in its place.
 *
 * SYMBOL_PREVIEW_WIDGET is the class over the panel; `SymbolPreviewWidget` is the wxPanel the
 * window lays out, which owns the canvas and hands the class back once WebGL is up.
 */
import { DEFAULT_THEME } from '@ziroeda/common/settings/settings_manager.js';
import { GAL_TYPE } from '@ziroeda/common/draw_panel_gal.js';
import type { DRAW_PANEL_GAL_WINDOW } from '@ziroeda/common/draw_panel_gal.js';
import type { BOX2I } from '@ziroeda/kimath/src/math/box2.js';
import { drawPanelWindow, loadBitmapFontImage } from '@ziroeda/common/gal/gal_window.js';
import { GAL_DISPLAY_OPTIONS_IMPL } from '@ziroeda/common/gal_display_options_common.js';
import { IO_ERROR } from '@ziroeda/common/exceptions.js';
import { toCssString } from '@ziroeda/common/gal/color4d.js';
import type { LIB_ID } from '@ziroeda/common/lib_id.js';
import { GetColorSettings, PgmOrNull } from '@ziroeda/common/pgm_base.js';
import type { PROJECT } from '@ziroeda/common/project.js';
import { wxEVT_SIZE } from '@ziroeda/wx/wx_event.js';
import { type JSX, useEffect, useRef, useState } from 'react';
import { currentEeschemaSettings, eeschemaKifaceSettings } from '../eeschema_settings.js';
import { LIB_SYMBOL } from '../lib_symbol.js';
import { SymbolLibAdapter } from '../project_sch.js';
import { AUTOPLACE_ALGO } from '../sch_item.js';
import { SCH_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { SCH_PREVIEW_PANEL } from '../sch_preview_panel.js';
import type { SCH_RENDER_SETTINGS } from '../sch_render_settings.js';

export class SYMBOL_PREVIEW_WIDGET {
  private readonly m_project: PROJECT | null;
  private readonly m_galDisplayOptions = new GAL_DISPLAY_OPTIONS_IMPL();
  readonly m_preview: SCH_PREVIEW_PANEL;
  private readonly m_renderSettings: SCH_RENDER_SETTINGS;
  /** `m_statusPanel`: whether the widget has one. */
  private readonly m_includeStatus: boolean;
  /** `m_status`'s label while the status panel is shown in place of the preview, else null. */
  m_statusText: string | null = null;
  /** The background and the text colour of the status panel (canvas background, reference colour). */
  readonly m_statusColors: { background: string; foreground: string };
  /** `m_previewItem`: the copy being shown, owned by the widget. */
  private m_previewItem: LIB_SYMBOL | null = null;
  private m_itemBBox: BOX2I | null = null;
  /** Called after the status panel is shown or hidden: the window's `Layout()`. */
  OnLayout: (() => void) | null = null;

  constructor(
    aWindow: DRAW_PANEL_GAL_WINDOW,
    aProject: PROJECT | null,
    aIncludeStatus: boolean,
    aCanvasType: GAL_TYPE = GAL_TYPE.GAL_TYPE_OPENGL,
  ) {
    this.m_project = aProject;
    this.m_includeStatus = aIncludeStatus;

    const common_settings = PgmOrNull()?.GetCommonSettings() ?? null;
    const app_settings = eeschemaKifaceSettings();

    if (common_settings)
      this.m_galDisplayOptions.ReadConfig(common_settings, app_settings.m_Window, null);
    else this.m_galDisplayOptions.ReadWindowSettings(app_settings.m_Window);

    this.m_galDisplayOptions.m_forceDisplayCursor = false;

    // Allows only a CAIRO or OPENGL canvas: there is no Cairo here, so every type is OPENGL.
    const canvasType =
      aCanvasType === GAL_TYPE.GAL_TYPE_OPENGL ? aCanvasType : GAL_TYPE.GAL_TYPE_OPENGL;

    this.m_preview = new SCH_PREVIEW_PANEL(null, aWindow, this.m_galDisplayOptions, canvasType);
    this.m_preview.SetStealsFocus(false);
    this.m_preview.GetGAL().SetAxesEnabled(false);

    // Do not display the grid: the look is not good for a small canvas area.
    this.m_preview.GetGAL().SetGridVisibility(false);

    // Early initialization of the canvas background color,
    // before any OnPaint event is fired for the canvas using a wrong bg color
    const view = this.m_preview.GetView();
    this.m_renderSettings = view.GetPainter()!.GetSettings() as SCH_RENDER_SETTINGS;

    const cs = GetColorSettings(app_settings ? app_settings.m_ColorTheme : DEFAULT_THEME);

    if (cs) this.m_renderSettings.LoadColors(cs);

    const backgroundColor = this.m_renderSettings.GetBackgroundColor();
    this.m_preview.GetGAL().SetClearColor(backgroundColor);

    const libView = currentEeschemaSettings().lib_view;
    this.m_renderSettings.m_ShowPinsElectricalType = libView.show_pin_electrical_type;
    // m_LibViewPanel.show_pin_numbers has no PARAM: value-initialised, it is false.
    this.m_renderSettings.m_ShowPinNumbers = false;
    this.m_renderSettings.m_ShowHiddenPins = false;
    this.m_renderSettings.m_ShowHiddenFields = false;
    this.m_renderSettings.m_ShowPinAltIcons = false;
    this.m_renderSettings.m_ShowPinsElectricalType = false;

    // Give the status panel the same color scheme as the canvas so it isn't jarring when
    // switched to.
    this.m_statusColors = {
      background: toCssString(backgroundColor),
      foreground: toCssString(
        this.m_renderSettings.GetLayerColor(SCH_LAYER_ID.LAYER_REFERENCEPART),
      ),
    };

    this.m_preview.Connect(wxEVT_SIZE, (aEvent) => {
      this.onSize();
      aEvent.Skip();
    });
  }

  /** `~SYMBOL_PREVIEW_WIDGET()`, and the panel with it. */
  Destroy(): void {
    if (this.m_previewItem) this.m_preview.GetView().Remove(this.m_previewItem);

    this.m_previewItem = null;
    this.m_preview.Destroy();
  }

  GetRenderSettings(): SCH_RENDER_SETTINGS {
    return this.m_renderSettings;
  }

  /** The symbol shown, or null. */
  GetPreviewItem(): LIB_SYMBOL | null {
    return this.m_previewItem;
  }

  /** `SetStatusText( aText )`: the status panel, with \a aText, shown in place of the preview. */
  SetStatusText(aText: string): void {
    if (!this.m_includeStatus) {
      console.assert(false, 'SetStatusText on a SYMBOL_PREVIEW_WIDGET without a status panel');
      return;
    }

    this.m_statusText = aText;
    this.OnLayout?.();
  }

  /** `onSize( aEvent )`. */
  private onSize(): void {
    if (this.m_previewItem) {
      this.fitOnDrawArea();
      this.m_preview.ForceRefresh();
    }
  }

  /** `fitOnDrawArea()`: the item fitted to the panel, with a fifth of whitespace. */
  fitOnDrawArea(): void {
    if (!this.m_previewItem || !this.m_itemBBox) return;

    // set the view scale to fit the item on screen
    const view = this.m_preview.GetView();

    // Calculate the drawing area size, in internal units, for a scaling factor = 1.0
    view.SetScale(1.0);
    const client = this.m_preview.GetClientSize();
    const clientSize = view.ToWorld({ x: client.x, y: client.y }, false);

    // Calculate the draw scale to fit the drawing area
    let scale = Math.min(
      Math.abs(clientSize.x / this.m_itemBBox.GetWidth()),
      Math.abs(clientSize.y / this.m_itemBBox.GetHeight()),
    );

    // Above calculation will yield an exact fit; add a bit of whitespace around symbol
    scale /= 1.2;

    // Now fix the best scale
    view.SetScale(scale);
    view.SetCenter(this.m_itemBBox.Centre());
  }

  /** `DisplaySymbol( aSymbolID, aUnit, aBodyStyle )`: a library symbol, loaded and flattened. */
  DisplaySymbol(aSymbolID: LIB_ID, aUnit: number, aBodyStyle = 0): void {
    const view = this.m_preview.GetView();
    let symbol: LIB_SYMBOL | null = null;

    try {
      const tmp = SymbolLibAdapter(this.m_project).LoadSymbol(aSymbolID);

      if (tmp) symbol = tmp.Flatten();
    } catch (ioe) {
      if (!(ioe instanceof IO_ERROR)) throw ioe;

      console.error(
        `Error loading symbol ${aSymbolID.GetLibItemName()} from library ` +
          `'${aSymbolID.GetLibNickname()}'.\n${ioe.What()}`,
      );
    }

    this.removePreviewItem();

    if (symbol) {
      // This will flatten derived parts so that the correct final symbol can be shown.
      this.showItem(symbol, aUnit, aBodyStyle);

      // Get the symbol size, in internal units
      this.m_itemBBox = symbol.GetUnitBoundingBox(
        this.m_renderSettings.m_ShowUnit,
        this.m_renderSettings.m_ShowBodyStyle,
      );

      if (this.m_statusText !== null) {
        this.m_statusText = null;
        this.OnLayout?.(); // Ensure panel size is up to date.
      }

      // Calculate the draw scale to fit the drawing area
      this.fitOnDrawArea();
    }

    this.m_preview.ForceRefresh();
  }

  /** `DisplayPart( aSymbol, aUnit, aBodyStyle )`: a copy of a symbol already loaded. */
  DisplayPart(aSymbol: LIB_SYMBOL | null, aUnit: number, aBodyStyle = 0): void {
    this.removePreviewItem();

    if (aSymbol) {
      const item = LIB_SYMBOL.copyOf(aSymbol);

      // For symbols having a De Morgan body style, use the first style
      this.showItem(item, aUnit, aBodyStyle);

      // Get the symbol size, in internal units
      this.m_itemBBox = item.GetUnitBoundingBox(
        this.m_renderSettings.m_ShowUnit,
        this.m_renderSettings.m_ShowBodyStyle,
        true,
        false,
      );

      // Calculate the draw scale to fit the drawing area
      this.fitOnDrawArea();
    }

    this.m_preview.ForceRefresh();

    if (this.m_statusText !== null) {
      this.m_statusText = null;
      this.OnLayout?.();
    }
  }

  private removePreviewItem(): void {
    if (this.m_previewItem) {
      this.m_preview.GetView().Remove(this.m_previewItem);
      this.m_previewItem = null;
    }
  }

  /** What DisplaySymbol and DisplayPart share: the unit and style chosen, autoplace, into the view. */
  private showItem(aItem: LIB_SYMBOL, aUnit: number, aBodyStyle: number): void {
    this.m_previewItem = aItem;

    // If unit isn't specified for a multi-unit part, pick the first.  (Otherwise we'll draw all of them.)
    this.m_renderSettings.m_ShowUnit = aItem.IsMultiUnit() && aUnit === 0 ? 1 : aUnit;

    // For symbols having multiple body styles, use the first style.
    this.m_renderSettings.m_ShowBodyStyle =
      aItem.IsMultiBodyStyle() && aBodyStyle === 0 ? 1 : aBodyStyle;

    aItem.SetPreviewUnit(this.m_renderSettings.m_ShowUnit);
    aItem.SetPreviewBodyStyle(this.m_renderSettings.m_ShowBodyStyle);

    if (currentEeschemaSettings().autoplace_fields.enable)
      aItem.AutoplaceFields(null, AUTOPLACE_ALGO.AUTOPLACE_AUTO);

    this.m_preview.GetView().Add(aItem);
  }
}

/**
 * The wxPanel: the canvas (and the status panel, with \a includeStatus), \a onReady handed the
 * widget once the panel is up and null as it goes. No WebGL2 leaves the panel empty.
 */
export function SymbolPreviewWidget({
  project,
  includeStatus = false,
  onReady,
  className,
}: {
  project: PROJECT | null;
  includeStatus?: boolean;
  onReady: (aWidget: SYMBOL_PREVIEW_WIDGET | null) => void;
  className?: string;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [widget, setWidget] = useState<SYMBOL_PREVIEW_WIDGET | null>(null);
  const [, setLayout] = useState(0);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // biome-ignore lint/correctness/useExhaustiveDependencies: built once; the project and the status panel are construction arguments, as upstream's
  useEffect(() => {
    let built: SYMBOL_PREVIEW_WIDGET | null = null;
    let cancelled = false;

    loadBitmapFontImage().then(
      (fontImage) => {
        const canvas = canvasRef.current;

        if (cancelled || !canvas) return;

        try {
          built = new SYMBOL_PREVIEW_WIDGET(
            drawPanelWindow(canvas, fontImage),
            project,
            includeStatus,
          );
        } catch (err) {
          console.warn(`Could not use OpenGL: ${(err as Error).message}`);
          return;
        }

        built.OnLayout = () => setLayout((n) => n + 1);
        setWidget(built);
        onReadyRef.current(built);
      },
      (err: unknown) => console.warn(`Could not use OpenGL: ${(err as Error).message}`),
    );

    return () => {
      cancelled = true;

      if (built) {
        onReadyRef.current(null);
        built.Destroy();
      }
    };
  }, []);

  const status = widget?.m_statusText ?? null;

  return (
    <div className={`ze-symbol-preview${className ? ` ${className}` : ''}`}>
      <canvas ref={canvasRef} hidden={status !== null} />
      {includeStatus && status !== null && widget && (
        <div
          className="ze-symbol-preview-status"
          style={{
            // The canvas's colours, which are the colour theme's: data, not chrome.
            background: widget.m_statusColors.background,
            color: widget.m_statusColors.foreground,
          }}
        >
          {status}
        </div>
      )}
    </div>
  );
}
