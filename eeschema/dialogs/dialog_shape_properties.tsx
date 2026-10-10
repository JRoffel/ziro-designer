// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `DIALOG_SHAPE_PROPERTIES` (eeschema/dialogs/dialog_shape_properties.cpp) over
 * DIALOG_SHAPE_PROPERTIES_BASE, in the schematic editor: a shape's border (a UNIT_BINDER in the
 * frame's units; unticked is width -1, "no border", unlike 0, "the default width"), its style
 * from `lineTypeNames`, the fill choice and colour, and a rule area's exclude/DNP flags.
 *
 * Not carried over yet: the symbol editor's branch (`m_fillBook` page 1, the fill radios, Private
 * and the common-to-all checkboxes, the read-only OK). The symbol editor still edits shapes in
 * its own form until its live switch; the base carries that page so it lands unchanged.
 */
import { type JSX, useRef, useState } from 'react';
import { FILL_MODE_NAMES } from '@ziroeda/common';
import { bitmapUrl } from '@ziroeda/common/bitmap_store.js';
import { DisplayErrorMessage } from '@ziroeda/common/confirm.js';
import { schIUScale } from '@ziroeda/common/eda_units.js';
import type { Color4d } from '@ziroeda/common/gal/color4d.js';
import { LINE_STYLE, LINE_STYLE_NAMES } from '@ziroeda/common/stroke_params.js';
import type { StatusUnits } from '@ziroeda/common/widgets/kistatusbar_format.js';
import { UNIT_BINDER, unitLabel } from '@ziroeda/common/widgets/unit_binder.js';
import { SCH_COMMIT } from '../sch_commit.js';
import type { SCH_EDIT_FRAME } from '../sch_edit_frame.js';
import { SCH_RULE_AREA } from '../sch_rule_area.js';
import type { SCH_SHAPE } from '../sch_shape.js';
import {
  type BITMAP_COMBO_ITEM,
  DIALOG_SHAPE_PROPERTIES_BASE,
} from './dialog_shape_properties_base.js';

/** `lineTypeNames`, as the constructor fills `m_borderStyleCombo`. */
const BORDER_STYLES: BITMAP_COMBO_ITEM[] = LINE_STYLE_NAMES.map((d) => ({
  label: d.label,
  bitmap: bitmapUrl(d.bitmap!),
}));

/** UI_FILL_MODE: NONE is the first of `m_fillCtrlChoices`. */
const UI_FILL_NONE = 0;

export interface SHAPE_DIALOG_VALUES {
  excludeFromSim: boolean;
  excludeFromBom: boolean;
  excludeFromBoard: boolean;
  dnp: boolean;
  border: boolean;
  /** `m_borderWidthCtrl`'s text. */
  borderWidth: string;
  /** `m_borderStyleCombo->GetSelection()`. */
  borderStyle: number;
  borderColor: Color4d;
  /** `m_fillCtrl->GetSelection()`, a UI_FILL_MODE. */
  fill: number;
  fillColor: Color4d;
}

export class DIALOG_SHAPE_PROPERTIES {
  private readonly m_frame: SCH_EDIT_FRAME;
  private readonly m_shape: SCH_SHAPE;
  private readonly m_borderWidth: UNIT_BINDER;

  constructor(aParent: SCH_EDIT_FRAME, aShape: SCH_SHAPE) {
    this.m_frame = aParent;
    this.m_shape = aShape;
    this.m_borderWidth = new UNIT_BINDER(aParent, 'Width:', (m) => DisplayErrorMessage(m));
  }

  /** `SetTitle( wxString::Format( GetTitle(), aShape->GetFriendlyName() ) )`: "%s Properties". */
  Title(): string {
    return `${this.m_shape.GetFriendlyName()} Properties`;
  }

  /** `m_ruleAreaSizer->Show( dynamic_cast<SCH_RULE_AREA*>( aShape ) != nullptr )`. */
  IsRuleArea(): boolean {
    return this.m_shape instanceof SCH_RULE_AREA;
  }

  /** `m_infoBar->ShowMessage( … )` when item colours are overridden in Preferences. */
  InfoBarMessage(): string | null {
    return this.m_frame.GetColorSettings().GetOverrideSchItemColors()
      ? 'Note: individual item colors overridden in Preferences.'
      : null;
  }

  /** `SetSwatchBackground( canvas )` on both swatches. */
  SwatchBackground(): Color4d {
    return this.m_frame.GetDrawBgColor();
  }

  BorderStyleItems(): BITMAP_COMBO_ITEM[] {
    return BORDER_STYLES;
  }

  /** `onBorderChecked()`: ticking the border with no width gives it the default line width. */
  OnBorderChecked(aWidthText: string, aBorder: boolean): string {
    this.m_borderWidth.SetText(aWidthText);

    if (aBorder && this.m_borderWidth.GetValue() < 0) {
      const defaultInMils = this.m_frame.eeconfig()?.drawing.default_line_thickness ?? 0;
      this.m_borderWidth.SetValue(schIUScale.milsToIU(defaultInMils));
    }

    return this.m_borderWidth.GetText();
  }

  /** `TransferDataToWindow()`, the schematic branch. */
  TransferDataToWindow(): SHAPE_DIALOG_VALUES {
    const shape = this.m_shape;
    const ruleArea = shape instanceof SCH_RULE_AREA ? shape : null;

    this.m_borderWidth.SetText('');
    if (shape.GetWidth() >= 0) this.m_borderWidth.SetValue(shape.GetWidth());

    const s = shape.GetStroke().GetLineStyle() as number;
    let borderStyle = 0;

    // DEFAULT_LINE_STYLE_LABEL is "Solid", the first row.
    if (s === -1) borderStyle = 0;
    else if (s < LINE_STYLE_NAMES.length) borderStyle = s;
    else console.assert(false, 'Line type not found in the type lookup map');

    return {
      excludeFromSim: ruleArea?.GetExcludedFromSim() ?? false,
      excludeFromBom: ruleArea?.GetExcludedFromBOM() ?? false,
      excludeFromBoard: ruleArea?.GetExcludedFromBoard() ?? false,
      dnp: ruleArea?.GetDNP() ?? false,
      border: shape.GetWidth() >= 0,
      borderWidth: this.m_borderWidth.GetText(),
      borderStyle,
      borderColor: shape.GetStroke().GetColor(),
      fill: shape.GetFillModeProp(),
      fillColor: shape.GetFillColor(),
    };
  }

  /** `TransferDataFromWindow()`, the schematic branch. */
  TransferDataFromWindow(aValues: SHAPE_DIALOG_VALUES): boolean {
    const shape = this.m_shape;
    this.m_borderWidth.SetText(aValues.borderWidth);
    const commit = new SCH_COMMIT(this.m_frame);

    if (!shape.IsNew()) commit.Modify(shape, this.m_frame.GetScreen());

    if (shape instanceof SCH_RULE_AREA) {
      shape.SetExcludedFromSim(aValues.excludeFromSim);
      shape.SetExcludedFromBOM(aValues.excludeFromBom);
      shape.SetExcludedFromBoard(aValues.excludeFromBoard);
      shape.SetDNP(aValues.dnp);
    }

    const stroke = shape.GetStroke();

    if (aValues.border) {
      if (!this.m_borderWidth.IsIndeterminate())
        stroke.SetWidth(Math.max(0, this.m_borderWidth.GetIntValue()));
    } else {
      stroke.SetWidth(-1);
    }

    // `std::advance( lineTypeNames.begin(), selection )`, SOLID past the end.
    stroke.SetLineStyle(LINE_STYLE_NAMES[aValues.borderStyle]?.style ?? LINE_STYLE.SOLID);
    stroke.SetColor(aValues.borderColor);

    shape.SetStroke(stroke);

    shape.SetFillModeProp(aValues.fill);
    shape.SetFillColor(aValues.fillColor);

    if (!commit.Empty()) commit.Push(`Edit ${shape.GetFriendlyName()}`);

    return true;
  }
}

export function DialogShapeProperties({
  dlg,
  initial,
  title,
  units,
  onOk,
  onCancel,
}: {
  dlg: DIALOG_SHAPE_PROPERTIES;
  initial: SHAPE_DIALOG_VALUES;
  /** A caller's `SetTitle()` (SCH_EDIT_TOOL names a rule area's dialog itself). */
  title?: string;
  /** The frame's units, which `m_borderWidth` labels its entry with. */
  units: StatusUnits;
  onOk: (aValues: SHAPE_DIALOG_VALUES) => void;
  onCancel: () => void;
}): JSX.Element {
  const [v, setV] = useState(initial);
  const widthRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<SHAPE_DIALOG_VALUES>): void => setV((p) => ({ ...p, ...patch }));
  const background = dlg.SwatchBackground();
  // onFillChoice: the colour has nothing to apply to without a fill.
  const fillOn = v.fill !== UI_FILL_NONE;

  return (
    <DIALOG_SHAPE_PROPERTIES_BASE
      title={title ?? dlg.Title()}
      m_infoBar={dlg.InfoBarMessage()}
      ruleAreaShown={dlg.IsRuleArea()}
      m_cbExcludeFromSim={{
        value: v.excludeFromSim,
        onChange: (on) => set({ excludeFromSim: on }),
      }}
      m_cbExcludeFromBom={{
        value: v.excludeFromBom,
        onChange: (on) => set({ excludeFromBom: on }),
      }}
      m_cbExcludeFromBoard={{
        value: v.excludeFromBoard,
        onChange: (on) => set({ excludeFromBoard: on }),
      }}
      m_cbDNP={{ value: v.dnp, onChange: (on) => set({ dnp: on }) }}
      m_borderCheckbox={{
        value: v.border,
        onChange: (on) => set({ border: on, borderWidth: dlg.OnBorderChecked(v.borderWidth, on) }),
      }}
      m_borderWidthCtrl={v.borderWidth}
      onBorderWidth={(t) => set({ borderWidth: t })}
      borderWidthRef={widthRef}
      borderEnabled={v.border}
      units={unitLabel(units)}
      m_borderColorSwatch={{
        color: v.borderColor,
        background,
        enabled: v.border,
        onChange: (c) => set({ borderColor: c }),
      }}
      borderStyleItems={dlg.BorderStyleItems()}
      m_borderStyleCombo={{ value: v.borderStyle, onChange: (i) => set({ borderStyle: i }) }}
      fillBookSelection={0}
      fillChoices={FILL_MODE_NAMES}
      m_fillCtrl={{ value: v.fill, onChange: (i) => set({ fill: i }) }}
      m_fillColorSwatch={{
        color: v.fillColor,
        background,
        enabled: fillOn,
        onChange: (c) => set({ fillColor: c }),
      }}
      fillRadio="none"
      onFillRadio={() => {}}
      m_customColorSwatch={{ color: v.fillColor, onChange: () => {} }}
      symbolEditorShown={false}
      m_privateCheckbox={{ value: false, onChange: () => {} }}
      m_checkApplyToAllUnits={{ value: false, onChange: () => {} }}
      m_checkApplyToAllBodyStyles={{ value: false, onChange: () => {} }}
      onOK={() => onOk(v)}
      onCancel={onCancel}
    />
  );
}
