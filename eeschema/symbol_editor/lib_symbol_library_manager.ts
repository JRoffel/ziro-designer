// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `LIB_SYMBOL_LIBRARY_MANAGER` (eeschema/symbol_editor/lib_symbol_library_manager.cpp): the
 * symbol editor's SYMBOL_LIBRARY_MANAGER - creating symbols, and telling the frame when the
 * libraries change.
 *
 * Upstream it also owns the library tree's SYMBOL_TREE_SYNCHRONIZING_ADAPTER (`m_adapter`,
 * `Sync`); the tree here is still the window's, so that half arrives when the window does.
 */
import { FIELD_T, MANDATORY_FIELDS } from '@ziroeda/common/template_fieldnames.js';
import { LIB_SYMBOL } from '../lib_symbol.js';
import { SCH_FIELD } from '../sch_field.js';
import type { SCH_BASE_FRAME } from '../sch_base_frame.js';
import { SYMBOL_LIBRARY_MANAGER } from '../symbol_library_manager.js';

/** `NEW_SYMBOL_PROPERTIES` (lib_symbol_library_manager.h): what DIALOG_LIB_NEW_SYMBOL returns. */
export interface NEW_SYMBOL_PROPERTIES {
  name: string;
  parentSymbolName: string;
  reference: string;
  unitCount: number;
  pinNameInside: boolean;
  pinTextPosition: number;
  powerSymbol: boolean;
  showPinNumber: boolean;
  showPinName: boolean;
  unitsInterchangeable: boolean;
  includeInBom: boolean;
  includeOnBoard: boolean;
  alternateBodyStyle: boolean;
  keepFootprint: boolean;
  keepDatasheet: boolean;
  transferUserFields: boolean;
  keepContentUserFields: boolean;
}

/** What the manager asks of its frame: SYMBOL_EDIT_FRAME's `SyncLibraries`. */
interface SYNCING_FRAME {
  SyncLibraries?(aShowProgress: boolean): void;
}

export class LIB_SYMBOL_LIBRARY_MANAGER extends SYMBOL_LIBRARY_MANAGER {
  // biome-ignore lint/complexity/noUselessConstructor: LIB_SYMBOL_LIBRARY_MANAGER( SYMBOL_EDIT_FRAME& )
  constructor(aFrame: SCH_BASE_FRAME) {
    super(aFrame);
  }

  /** `CreateSymbol( aProps, aParent )`: a new symbol, or one derived from \a aParent. */
  static CreateSymbol(aProps: NEW_SYMBOL_PROPERTIES, aParent: LIB_SYMBOL | null): LIB_SYMBOL {
    const new_symbol = new LIB_SYMBOL(aProps.name);

    if (!aParent) {
      new_symbol.GetReferenceField().SetText(aProps.reference);
      new_symbol.SetUnitCount(aProps.unitCount, true);

      if (aProps.pinNameInside) {
        new_symbol.SetPinNameOffset(aProps.pinTextPosition);

        if (new_symbol.GetPinNameOffset() === 0) new_symbol.SetPinNameOffset(1);
      } else {
        new_symbol.SetPinNameOffset(0);
      }

      if (aProps.powerSymbol) new_symbol.SetGlobalPower();
      else new_symbol.SetNormal();

      new_symbol.SetShowPinNumbers(aProps.showPinNumber);
      new_symbol.SetShowPinNames(aProps.showPinName);
      new_symbol.LockUnits(!aProps.unitsInterchangeable);
      new_symbol.SetExcludedFromBOM(!aProps.includeInBom);
      new_symbol.SetExcludedFromBoard(!aProps.includeOnBoard);

      if (aProps.unitCount < 2) new_symbol.LockUnits(false);

      if (aProps.alternateBodyStyle) {
        // The count is derived from the flag, so set it after the pins have been duplicated
        new_symbol.SetBodyStyleCount(2, false, true);
        new_symbol.SetHasDeMorganBodyStyles(true);
      }
    } else {
      new_symbol.SetLibParent(aParent);

      for (const fieldId of MANDATORY_FIELDS) {
        const field = new_symbol.GetField(fieldId)!;
        const parentField = aParent.GetField(fieldId)!;

        // *field = *parentField
        parentField.Copy(field);

        switch (fieldId) {
          case FIELD_T.REFERENCE:
            break;

          case FIELD_T.VALUE:
            if (aParent.IsPower()) field.SetText(aProps.name);
            break;

          case FIELD_T.FOOTPRINT:
            if (!aProps.keepFootprint) field.SetText('');
            break;

          case FIELD_T.DATASHEET:
            if (!aProps.keepDatasheet) field.SetText('');
            break;

          default:
            break;
        }

        field.SetParent(new_symbol);
      }

      if (aProps.transferUserFields) {
        const listFields: SCH_FIELD[] = [];
        aParent.GetFields(listFields);

        for (const field of listFields) {
          if (field.GetId() === FIELD_T.USER) {
            const new_field = SCH_FIELD.copyOf(field);

            if (!aProps.keepContentUserFields) new_field.SetText('');

            new_field.SetParent(new_symbol);
            new_symbol.AddField(new_field);
          }
        }
      }
    }

    return new_symbol;
  }

  /** `CreateNewSymbol( aLibrary, aProps )`: a new symbol into the library's buffer. */
  CreateNewSymbol(aLibrary: string, aProps: NEW_SYMBOL_PROPERTIES): boolean {
    let parent: LIB_SYMBOL | null = null;

    if (aProps.parentSymbolName !== '') parent = this.GetSymbol(aProps.parentSymbolName, aLibrary);

    const new_symbol = LIB_SYMBOL_LIBRARY_MANAGER.CreateSymbol(aProps, parent);

    if (!this.UpdateSymbol(new_symbol, aLibrary)) return false;

    return true;
  }

  /** `OnDataChanged()`: the frame syncs its libraries. */
  override OnDataChanged(): void {
    (this.m_frame as SCH_BASE_FRAME & SYNCING_FRAME).SyncLibraries?.(false);
  }
}
