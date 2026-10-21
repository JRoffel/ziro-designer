// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_PIN_PROPERTIES over its _base (dialog_pin_properties.cpp), on a live symbol editor pin:
 * the controls filled from the pin; the preview's copy of the symbol (its items in unit 1, the
 * pin alone in unit 2) following the controls; the units / body-style checkboxes and their
 * tooltips; synchronized pins mode in the infobar; the alternates grid; OK's checks (unnamed
 * alternates, the off-grid question) and what it writes back to the pin.
 */
import { SetErrorPresenter, SetQuestionPresenter } from '@ziroeda/common/confirm.js';
import { bitmapUrl } from '@ziroeda/common/bitmap_store.js';
import { IS_NEW } from '@ziroeda/common/eda_item_flags.js';
import { schIUScale } from '@ziroeda/common/eda_units.js';
import { ELECTRICAL_PINTYPE, GRAPHIC_PINSHAPE, PIN_ORIENTATION } from '@ziroeda/common/pin_type.js';
import {
  ALT_COL,
  DIALOG_PIN_PROPERTIES,
  DialogPinProperties,
} from '@ziroeda/eeschema/dialogs/dialog_pin_properties.js';
import type { LIB_SYMBOL } from '@ziroeda/eeschema/lib_symbol.js';
import {
  PinOrientationCode,
  PinOrientationIcons,
  PinOrientationIndex,
  PinOrientationNames,
  PinTypeNames,
} from '@ziroeda/eeschema/pin_type.js';
import type { SCH_PIN } from '@ziroeda/eeschema/sch_pin.js';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from '../support/symbol_edit_harness.js';

let t: SYMBOL_EDIT_HARNESS;
let errors: string[] = [];
let questions: string[] = [];
let answer = true;

/** The harness's U, shown, in mils; its unit-1 pin "A" (number 1) at (10.16, 0) mm, 5.08 mm long. */
function setUp(): { symbol: LIB_SYMBOL; pin: SCH_PIN } {
  errors = [];
  questions = [];
  answer = true;
  SetErrorPresenter((aText) => {
    errors.push(aText);
  });
  SetQuestionPresenter(async (aMessage) => {
    questions.push(aMessage);
    return answer;
  });
  DIALOG_PIN_PROPERTIES.s_alternatesTurndownOpen = false;
  t = symbolEditHarness();
  t.frame.SetUserUnits('mils');
  const symbol = t.open();
  // SetCurSymbol turns synchronized pins on for U's interchangeable units; the tests that want
  // the mode turn it back on.
  t.frame.m_SyncPinEdit = false;
  const pin = symbol.GetGraphicalPins(1, 0).find((p) => p.GetNumber() === '1')!;
  return { symbol, pin };
}

afterEach(() => {
  cleanup();
  t?.dispose();
  SetErrorPresenter((aText) => console.error(aText));
  SetQuestionPresenter(async () => false);
});

describe('pin orientation tables', () => {
  it('are the four orientations in enum order, INHERIT left out', () => {
    expect(PinOrientationNames()).toEqual(['Right', 'Left', 'Up', 'Down']);
    expect(PinOrientationIcons()).toEqual([
      'pinorient_right',
      'pinorient_left',
      'pinorient_up',
      'pinorient_down',
    ]);
    expect(PinOrientationCode(2)).toBe(PIN_ORIENTATION.PIN_UP);
    expect(PinOrientationIndex(PIN_ORIENTATION.PIN_DOWN)).toBe(3);
  });
});

describe('DIALOG_PIN_PROPERTIES', () => {
  it('fills the controls from the pin, in the frame units', () => {
    const { pin } = setUp();
    const s = new DIALOG_PIN_PROPERTIES(t.frame, pin, false).TransferDataToWindow();

    expect(s.m_textPinName).toBe('A');
    expect(s.m_textPinNumber).toBe('1');
    expect(s.m_choiceElectricalType).toBe(ELECTRICAL_PINTYPE.PT_INPUT);
    expect(s.m_choiceStyle).toBe(GRAPHIC_PINSHAPE.LINE);
    expect(s.m_choiceOrientation).toBe(PinOrientationIndex(pin.GetOrientation()));
    expect(s.m_posXCtrl).toBe('400');
    expect(s.m_posYCtrl).toBe('0');
    expect(s.m_pinLengthCtrl).toBe('200');
    expect(s.m_nameSizeCtrl).toBe('50');
    expect(s.m_numberSizeCtrl).toBe('50');
    expect(s.m_checkShow.value).toBe(true);
    expect(s.infoBar).toBeNull();
  });

  it('a pin of one unit of a multi-unit symbol: the units box is enabled and clear', () => {
    const { pin } = setUp();
    const s = new DIALOG_PIN_PROPERTIES(t.frame, pin, false).TransferDataToWindow();

    expect(s.m_checkApplyToAllParts).toEqual({
      enabled: true,
      value: false,
      tooltip: 'If checked, this pin will exist in all units.',
    });
    // One body style: disabled, and checked because the pin is in body style 0.
    expect(s.m_checkApplyToAllBodyStyles).toEqual({
      enabled: false,
      value: pin.GetBodyStyle() === 0,
    });
  });

  it('a single-unit symbol says the units box has no effect', () => {
    const { symbol, pin } = setUp();
    symbol.SetUnitCount(1, false);
    const s = new DIALOG_PIN_PROPERTIES(t.frame, pin, false).TransferDataToWindow();

    expect(s.m_checkApplyToAllParts.enabled).toBe(false);
    expect(s.m_checkApplyToAllParts.tooltip).toBe(
      'This symbol only has one unit. This control has no effect.',
    );
  });

  it('previews the pin alone in unit 2 of a copy, which follows the controls', () => {
    const { symbol, pin } = setUp();
    const dlg = new DIALOG_PIN_PROPERTIES(t.frame, pin, false);
    dlg.TransferDataToWindow();

    expect(dlg.m_dummyParent === symbol).toBe(false);
    expect(dlg.m_dummyParent.GetUnitCount()).toBe(2);
    expect(dlg.m_dummyPin === pin).toBe(false);
    expect(dlg.m_dummyPin.GetUnit()).toBe(2);
    expect(dlg.m_dummyParent.GetGraphicalPins(2, 0)).toEqual([dlg.m_dummyPin]);
    // Every one of the copy's own items moved to unit 1.
    expect(dlg.m_dummyParent.GetGraphicalPins(1, 0).every((p) => p.GetUnit() === 1)).toBe(true);
    expect(dlg.m_dummyParent.GetShowPinNames() && dlg.m_dummyParent.GetShowPinNumbers()).toBe(true);
    expect(dlg.m_dummyPin.IsNew()).toBe(false);

    dlg.Set('m_textPinName', 'CLK');
    dlg.Set('m_pinLengthCtrl', '300');
    dlg.Set('m_choiceStyle', GRAPHIC_PINSHAPE.CLOCK);
    dlg.Set('m_checkShow', false);

    expect(dlg.m_dummyPin.GetName()).toBe('CLK');
    expect(dlg.m_dummyPin.GetLength()).toBe(schIUScale.milsToIU(300));
    expect(dlg.m_dummyPin.GetShape()).toBe(GRAPHIC_PINSHAPE.CLOCK);
    expect(dlg.m_dummyPin.IsVisible()).toBe(false);
    // The pin itself is untouched until OK.
    expect(pin.GetName()).toBe('A');
  });

  it('the preview copy has two units, shows pin names and numbers, and its pin is not new', () => {
    const { symbol, pin } = setUp();
    symbol.SetUnitCount(1, false);
    symbol.SetShowPinNames(false);
    symbol.SetShowPinNumbers(false);
    pin.SetFlags(IS_NEW);
    pin.SetType(ELECTRICAL_PINTYPE.PT_OUTPUT);

    const dlg = new DIALOG_PIN_PROPERTIES(t.frame, pin, false);
    const s = dlg.TransferDataToWindow();

    expect(dlg.m_dummyParent.GetUnitCount()).toBe(2);
    expect(dlg.m_dummyParent.GetShowPinNames()).toBe(true);
    expect(dlg.m_dummyParent.GetShowPinNumbers()).toBe(true);
    expect(dlg.m_dummyPin.IsNew()).toBe(false);
    expect(pin.IsNew()).toBe(true);
    expect(s.m_choiceElectricalType).toBe(ELECTRICAL_PINTYPE.PT_OUTPUT);

    // A new alternate takes the pin's type.
    dlg.OnAddAlternate();
    dlg.m_alternatesGrid.CancelPendingChanges();
    expect(dlg.m_alternatesDataModel.m_alts[0]!.m_Type).toBe(ELECTRICAL_PINTYPE.PT_OUTPUT);
  });

  it('an alternate deleted in the dialog is gone from the pin', async () => {
    const { pin } = setUp();
    pin.GetAlternates().set('OLD', {
      m_Name: 'OLD',
      m_Type: ELECTRICAL_PINTYPE.PT_INPUT,
      m_Shape: GRAPHIC_PINSHAPE.LINE,
    });
    const dlg = new DIALOG_PIN_PROPERTIES(t.frame, pin, false);
    dlg.TransferDataToWindow();
    dlg.m_alternatesDataModel.SetValue(0, ALT_COL.COL_NAME, 'NEW');

    expect(await dlg.TransferDataFromWindow()).toBe(true);

    expect([...pin.GetAlternates().keys()]).toEqual(['NEW']);
  });

  it('OK writes the controls back to the pin', async () => {
    const { pin } = setUp();
    t.frame.SetUnit(1);
    const dlg = new DIALOG_PIN_PROPERTIES(t.frame, pin, false);
    dlg.TransferDataToWindow();
    dlg.Set('m_textPinName', 'B');
    dlg.Set('m_textPinNumber', '9');
    dlg.Set('m_choiceElectricalType', ELECTRICAL_PINTYPE.PT_OUTPUT);
    dlg.Set('m_choiceOrientation', 2);
    dlg.Set('m_posXCtrl', '500');
    dlg.Set('m_posYCtrl', '-100');
    dlg.Set('m_nameSizeCtrl', '60');
    dlg.Set('m_checkApplyToAllParts', true);

    expect(await dlg.TransferDataFromWindow()).toBe(true);

    expect(pin.GetName()).toBe('B');
    expect(pin.GetNumber()).toBe('9');
    expect(pin.GetType()).toBe(ELECTRICAL_PINTYPE.PT_OUTPUT);
    expect(pin.GetOrientation()).toBe(PIN_ORIENTATION.PIN_UP);
    expect(pin.GetPosition()).toEqual({
      x: schIUScale.milsToIU(500),
      y: schIUScale.milsToIU(-100),
    });
    expect(pin.GetNameTextSize()).toBe(schIUScale.milsToIU(60));
    expect(pin.GetUnit()).toBe(0);
    // A position on a 50 mil grid is not asked about.
    expect(questions).toEqual([]);
  });

  it('a pin moved off the grid asks first, and No keeps the dialog up', async () => {
    const { pin } = setUp();
    const dlg = new DIALOG_PIN_PROPERTIES(t.frame, pin, false);
    dlg.TransferDataToWindow();
    // 0.1 mil is 25.4 internal units: not a multiple of upstream's 50.
    dlg.Set('m_posXCtrl', '400.1');
    answer = false;

    expect(await dlg.TransferDataFromWindow()).toBe(false);

    expect(questions).toEqual([
      'This pin is not on a 50 mils grid which will make it difficult to connect to in the ' +
        'schematic.\nDo you wish to continue?',
    ]);
    expect(pin.GetPosition().x).toBe(schIUScale.milsToIU(400));
  });

  it('alternates: added with the pin type and style, written by name; an unnamed one is refused', async () => {
    const { pin } = setUp();
    const dlg = new DIALOG_PIN_PROPERTIES(t.frame, pin, false);
    dlg.TransferDataToWindow();

    dlg.OnAddAlternate();
    dlg.m_alternatesGrid.CancelPendingChanges();
    expect(dlg.m_alternatesDataModel.m_alts).toEqual([
      { m_Name: '', m_Type: pin.GetType(), m_Shape: pin.GetShape() },
    ]);
    expect(dlg.m_alternatesDataModel.GetValue(0, ALT_COL.COL_TYPE)).toBe('Input');

    expect(await dlg.TransferDataFromWindow()).toBe(false);
    expect(errors).toEqual(['Alternate pin definitions must have a name.']);
    const focused = dlg.HandleDelayedFocus()!;
    expect(focused.m_alternatesTurndown.collapsed).toBe(false);
    expect(dlg.m_alternatesGrid.GetGridCursorRow()).toBe(0);

    dlg.m_alternatesGrid.CancelPendingChanges();
    dlg.m_alternatesDataModel.SetValue(0, ALT_COL.COL_NAME, 'SCL');
    dlg.m_alternatesDataModel.SetValue(0, ALT_COL.COL_SHAPE, 'Clock');
    expect(await dlg.TransferDataFromWindow()).toBe(true);

    expect([...pin.GetAlternates().keys()]).toEqual(['SCL']);
    expect(pin.GetAlternates().get('SCL')!.m_Shape).toBe(GRAPHIC_PINSHAPE.CLOCK);
  });

  it('opens the alternates pane for a pin with alternates, and remembers it was open', () => {
    const { pin } = setUp();
    expect(
      new DIALOG_PIN_PROPERTIES(t.frame, pin, false).m_state.m_alternatesTurndown.collapsed,
    ).toBe(true);

    pin.GetAlternates().set('X', {
      m_Name: 'X',
      m_Type: ELECTRICAL_PINTYPE.PT_INPUT,
      m_Shape: GRAPHIC_PINSHAPE.LINE,
    });
    const dlg = new DIALOG_PIN_PROPERTIES(t.frame, pin, false);
    expect(dlg.m_state.m_alternatesTurndown.collapsed).toBe(false);
    expect(dlg.TransferDataToWindow() && dlg.m_alternatesDataModel.GetNumberRows()).toBe(1);

    pin.GetAlternates().clear();
    expect(
      new DIALOG_PIN_PROPERTIES(t.frame, pin, false).m_state.m_alternatesTurndown.collapsed,
    ).toBe(false);
  });

  it('a symbol with body styles has no alternates', () => {
    const { symbol, pin } = setUp();
    symbol.SetHasDeMorganBodyStyles(true);
    symbol.SetBodyStyleCount(2, false, false);

    const dlg = new DIALOG_PIN_PROPERTIES(t.frame, pin, false);

    expect(symbol.IsMultiBodyStyle()).toBe(true);
    expect(dlg.m_state.m_alternatesTurndown).toEqual({
      collapsed: true,
      enabled: false,
      tooltip: 'Alternate pin assignments are not available for symbols with multiple body styles.',
    });
  });

  it('synchronized pins mode: the infobar message follows the units box, and its link leaves the mode', () => {
    const { pin } = setUp();
    t.frame.m_SyncPinEdit = true;
    const dlg = new DIALOG_PIN_PROPERTIES(t.frame, pin, false);
    const s = dlg.TransferDataToWindow();

    expect(s.infoBar).toEqual({
      message: 'Synchronized Pins Mode.  Matching pins in other units will be updated.',
      exitLink: true,
    });
    expect(s.m_checkApplyToAllParts.tooltip).toBe(
      'Synchronized pins mode is enabled.\nSimilar pins will be edited regardless of this option.',
    );
    expect(dlg.Set('m_checkApplyToAllParts', true).infoBar!.message).toBe(
      'Synchronized Pins Mode.',
    );

    expect(dlg.OnExitSyncPinsMode().infoBar).toBeNull();
    expect(t.frame.m_SyncPinEdit).toBe(false);
  });
});

describe('GRID_CELL_ICON_TEXT_POPUP', () => {
  it('offers the alternates grid every pin type, each with its icon', () => {
    const { pin } = setUp();
    const dlg = new DIALOG_PIN_PROPERTIES(t.frame, pin, false);
    const editor = dlg.m_alternatesGrid.GetCellEditor(0, ALT_COL.COL_TYPE) as unknown as {
      GetComboOptions(): { value: string; label: string; bitmap?: string }[];
      Clone(): unknown;
    };
    const options = editor.GetComboOptions();

    expect(options.map((o) => o.label)).toEqual([...PinTypeNames()]);
    expect(options[0]!.bitmap).toBe(bitmapUrl('pintype_input'));
    expect(options.every((o) => o.value === o.label)).toBe(true);
    expect((editor.Clone() as typeof editor).GetComboOptions()).toEqual(options);
  });
});

describe('DialogPinProperties', () => {
  it('draws the base, and OK changes the pin and closes with wxID_OK', async () => {
    const { pin } = setUp();
    const onClose = vi.fn();
    render(
      <DialogPinProperties
        frame={t.frame}
        pin={pin}
        focusPinNumber
        units="mils"
        onClose={onClose}
      />,
    );

    expect(screen.getByText('Pin Properties')).toBeTruthy();
    expect((screen.getByLabelText('Pin number') as HTMLInputElement).value).toBe('1');
    fireEvent.change(screen.getByLabelText('Pin name'), { target: { value: 'Q' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledWith(5100));
    expect(pin.GetName()).toBe('Q');
  });
});
