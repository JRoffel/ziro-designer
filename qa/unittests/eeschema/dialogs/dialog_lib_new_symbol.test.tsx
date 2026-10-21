// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_LIB_NEW_SYMBOL over its _base (dialog_lib_new_symbol.cpp): the base's defaults; choosing a
 * parent shows the infobar, defaults the name to <parent>_1 (until the user types one) and swaps
 * which options apply; a power symbol is always out of the BOM and board; OK runs the field
 * validators then the caller's, and fills the frame's NEW_SYMBOL_PROPERTIES from the getters.
 */
import { SetErrorPresenter } from '@ziroeda/common/confirm.js';
import { schIUScale } from '@ziroeda/common/eda_units.js';
import {
  DIALOG_LIB_NEW_SYMBOL,
  type DIALOG_LIB_NEW_SYMBOL_ARG,
  DialogLibNewSymbol,
} from '@ziroeda/eeschema/dialogs/dialog_lib_new_symbol.js';
import type { NEW_SYMBOL_PROPERTIES } from '@ziroeda/eeschema/symbol_editor/lib_symbol_library_manager.js';
import {
  kNoParentSymbol,
  symbolFilterListContent,
} from '@ziroeda/eeschema/widgets/symbol_filter_combobox.js';
import { wxMatches } from '@ziroeda/wx/utils.js';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
  SetErrorPresenter((aText) => console.error(aText));
});

/** The frame as a UNIT_BINDER asks it. */
const frame = { GetUserUnits: () => 'mils' as const, GetIuScale: () => schIUScale };

const dialog = (aInherit = '', aValidator = (_n: string) => true) =>
  new DIALOG_LIB_NEW_SYMBOL(frame, ['U', 'R{slash}C'], aInherit, aValidator);

const emptyProps = (): NEW_SYMBOL_PROPERTIES =>
  ({ name: '', parentSymbolName: '' }) as NEW_SYMBOL_PROPERTIES;

describe('DIALOG_LIB_NEW_SYMBOL', () => {
  it('starts as the base builds it, a symbol of its own', () => {
    const dlg = dialog();
    const s = dlg.TransferDataToWindow();

    expect(dlg.m_symbolNames).toEqual(['U', 'R/C']);
    expect(s.infoBarMessage).toBeNull();
    // onParentSymbolSelect runs once with no parent: getDerivativeName( "" ), as upstream.
    expect(s.m_textName).toBe('_1');
    expect(s.m_textReference).toEqual({ value: 'U', enabled: true });
    expect(s.m_spinPartCount).toEqual({ value: 1, enabled: true });
    expect(s.m_checkUnitsInterchangeable).toEqual({ value: false, enabled: true });
    expect(s.m_checkShowPinNumber.value && s.m_checkShowPinName.value).toBe(true);
    expect(s.m_checkShowPinNameInside.value).toBe(true);
    expect(s.m_checkKeepDatasheet.enabled || s.m_checkTransferUserFields.enabled).toBe(false);
    expect(s.m_checkKeepContentUserFields.enabled).toBe(false);
    // DEFAULT_PIN_NAME_OFFSET, in the frame's mils.
    expect(s.m_textPinTextPosition.value).toBe('20');
  });

  it('a parent given shows in the combo and names the symbol after it', () => {
    const dlg = dialog('R{slash}C');
    const s = dlg.TransferDataToWindow();

    expect(s.m_comboInheritanceSelect).toBe('R/C');
    expect(s.m_textName).toBe('R/C_1');
    expect(s.infoBarMessage).toBe("Deriving from symbol 'R/C'.");
    // Derived: the units and pins are the parent's; datasheet, footprint and fields may be kept.
    expect(s.m_textReference.enabled || s.m_spinPartCount.enabled).toBe(false);
    expect(s.m_checkIsPowerSymbol.enabled || s.m_textPinTextPosition.enabled).toBe(false);
    expect(s.m_checkKeepDatasheet.enabled && s.m_checkKeepFootprint.enabled).toBe(true);
    expect(s.m_checkTransferUserFields.enabled).toBe(true);
    // TransferDataToWindow's onPowerCheckBox runs after syncControls and, with no power symbol,
    // enables the two exclude boxes again - upstream's order, kept.
    expect(s.m_excludeFromBomCheckBox.enabled && s.m_excludeFromBoardCheckBox.enabled).toBe(true);
    // CTX_LIBID no longer escapes '/': the name reads back unescaped, as upstream's does.
    expect(dlg.GetParentSymbolName()).toBe('R/C');
  });

  it('choosing a parent renames the symbol only while the name is still the defaulted one', () => {
    const dlg = dialog();
    dlg.TransferDataToWindow();

    expect(dlg.onParentSymbolSelected('U').m_textName).toBe('U_1');

    dlg.onNameText('MINE');
    const s = dlg.onParentSymbolSelected('R/C');
    expect(s.m_textName).toBe('MINE');

    // "<do not derive>" reads as no parent.
    const back = dlg.onParentSymbolSelected(kNoParentSymbol);
    expect(back.infoBarMessage).toBeNull();
    expect(back.m_textReference.enabled).toBe(true);
    expect(dlg.GetParentSymbolName()).toBe('');
  });

  it('a power symbol is excluded from the BOM and board, and those boxes are fixed', () => {
    const dlg = dialog();
    dlg.TransferDataToWindow();

    dlg.Set('m_checkIsPowerSymbol', true);
    const s = dlg.onPowerCheckBox();
    expect(s.m_excludeFromBomCheckBox).toEqual({ value: true, enabled: false });
    expect(s.m_excludeFromBoardCheckBox).toEqual({ value: true, enabled: false });

    dlg.Set('m_checkIsPowerSymbol', false);
    const off = dlg.onPowerCheckBox();
    // Re-enabled, still ticked.
    expect(off.m_excludeFromBomCheckBox).toEqual({ value: true, enabled: true });
  });

  it('Keep content of user-defined fields follows Transfer user-defined fields', () => {
    const dlg = dialog('U');
    dlg.TransferDataToWindow();

    dlg.Set('m_checkTransferUserFields', true);
    expect(dlg.onCheckTransferUserFields().m_checkKeepContentUserFields.enabled).toBe(true);
    dlg.Set('m_checkTransferUserFields', false);
    expect(dlg.onCheckTransferUserFields().m_checkKeepContentUserFields.enabled).toBe(false);
  });

  it('OK checks the name and the reference, then asks the caller about the name it will use', async () => {
    const errors: string[] = [];
    SetErrorPresenter((aText) => {
      errors.push(aText);
    });
    const asked: string[] = [];
    const dlg = dialog('', (aName) => {
      asked.push(aName);
      return aName !== 'TAKEN';
    });
    dlg.TransferDataToWindow();

    dlg.Set('m_textReference', 'U 1');
    expect(await dlg.TransferDataFromWindow()).toBe(false);
    expect(errors).toEqual(['The reference designator cannot contain space character(s).']);

    dlg.Set('m_textReference', 'U');
    dlg.onNameText('my part:2');
    expect(await dlg.TransferDataFromWindow()).toBe(true);
    // Escaped as a LIB_ID part, spaces as underscores.
    expect(asked).toEqual(['my_part{colon}2']);

    dlg.onNameText('TAKEN');
    expect(await dlg.TransferDataFromWindow()).toBe(false);
  });

  it('a derived symbol is not refused for a reference it does not use', async () => {
    const dlg = dialog('U');
    dlg.TransferDataToWindow();
    dlg.Set('m_textReference', '');

    expect(await dlg.TransferDataFromWindow()).toBe(true);
  });

  it('fills the frame its properties from the getters', () => {
    const dlg = dialog();
    dlg.TransferDataToWindow();
    dlg.onNameText('X');
    dlg.Set('m_spinPartCount', 3);
    dlg.Set('m_checkUnitsInterchangeable', true);
    dlg.Set('m_checkHasAlternateBodyStyle', true);
    dlg.Set('m_excludeFromBoardCheckBox', true);
    dlg.Set('m_checkShowPinName', false);
    dlg.Set('m_textPinTextPosition', '40');
    void dlg.TransferDataFromWindow();
    const props = emptyProps();

    dlg.FillProperties(props);

    expect(props).toMatchObject({
      name: 'X',
      parentSymbolName: '',
      reference: 'U',
      unitCount: 3,
      unitsInterchangeable: true,
      alternateBodyStyle: true,
      powerSymbol: false,
      includeInBom: true,
      includeOnBoard: false,
      showPinNumber: true,
      showPinName: false,
      pinNameInside: true,
      pinTextPosition: schIUScale.milsToIU(40),
      keepDatasheet: false,
    });
  });
});

describe('SYMBOL_FILTER_COMBOBOX', () => {
  it('lists "<do not derive>" first while the filter is empty or matches it', () => {
    expect(symbolFilterListContent(['A', 'B'], '')).toEqual([kNoParentSymbol, 'A', 'B']);
    expect(symbolFilterListContent(['A', 'B'], 'a')).toEqual(['A']);
    expect(symbolFilterListContent(['A', 'B'], '<do*')).toEqual([kNoParentSymbol]);
  });

  it('wxString::Matches is a whole-string wildcard match', () => {
    expect(wxMatches('abc', 'a*')).toBe(true);
    expect(wxMatches('abc', 'a?c')).toBe(true);
    expect(wxMatches('abbc', 'a?c')).toBe(false);
    expect(wxMatches('abc', 'ab')).toBe(false);
    expect(wxMatches('abc', 'b')).toBe(false);
    expect(wxMatches('a.c', 'a.c')).toBe(true);
    expect(wxMatches('abc', 'a.c')).toBe(false);
  });
});

describe('DialogLibNewSymbol', () => {
  function open(aArg: Partial<DIALOG_LIB_NEW_SYMBOL_ARG> = {}) {
    const arg: DIALOG_LIB_NEW_SYMBOL_ARG = {
      symbolNames: ['U'],
      inheritFrom: '',
      validator: () => true,
      props: emptyProps(),
      ...aArg,
    };
    const onClose = vi.fn();
    render(<DialogLibNewSymbol frame={frame} arg={arg} units="mils" onClose={onClose} />);
    return { arg, onClose };
  }

  it('draws the base, and OK fills the arg and closes with wxID_OK', async () => {
    const { arg, onClose } = open();

    expect(screen.getByText('New Symbol')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Symbol name'), { target: { value: 'NEW' } });
    fireEvent.click(screen.getByLabelText('Create symbol as power symbol'));
    expect((screen.getByLabelText('Exclude from board') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledWith(5100));
    expect(arg.props.name).toBe('NEW');
    expect(arg.props.powerSymbol).toBe(true);
    expect(arg.props.includeOnBoard).toBe(false);
  });

  it('a derived symbol shows the infobar; Cancel closes with wxID_CANCEL', () => {
    const { arg, onClose } = open({ inheritFrom: 'U' });

    expect(screen.getByText("Deriving from symbol 'U'.")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledWith(5101);
    expect(arg.props.name).toBe('');
  });
});
