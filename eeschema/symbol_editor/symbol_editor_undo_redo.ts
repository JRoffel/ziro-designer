// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `SYMBOL_EDIT_FRAME`'s undo and redo (eeschema/symbol_editor/symbol_editor_undo_redo.cpp): the
 * symbol editor's undo unit is the whole symbol - each entry is a copy of it, swapped with the
 * current one on undo and redo.
 *
 * A TypeScript class cannot be split across files as one C++ class's methods are, so this is a
 * mixin, applied to SYMBOL_EDIT_FRAME by symbol_edit_frame.ts (the pattern of
 * schematic_undo_redo.ts). Each method takes `this: SYMBOL_EDIT_FRAME`.
 */
import { UNDO_REDO_LIST } from '@ziroeda/common/eda_base_frame.js';
import { UR_TRANSIENT } from '@ziroeda/common/eda_item_flags.js';
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import { ITEM_PICKER, PICKED_ITEMS_LIST, UNDO_REDO } from '@ziroeda/common/undo_redo_container.js';
import { LIB_SYMBOL } from '../lib_symbol.js';
import type { SYMBOL_EDIT_FRAME } from './symbol_edit_frame.js';

export class SYMBOL_EDITOR_UNDO_REDO_MIXIN {
  /** `PushSymbolToUndoList( aDescription, aSymbolCopy, aUndoType )`: the undo list owns the copy. */
  PushSymbolToUndoList(
    this: SYMBOL_EDIT_FRAME,
    aDescription: string,
    aSymbolCopy: LIB_SYMBOL | null,
    aUndoType = UNDO_REDO.LIBEDIT,
  ): void {
    if (!aSymbolCopy) return;

    const lastcmd = new PICKED_ITEMS_LIST();

    // Clear current flags (which can be temporary set by a current edit command).
    aSymbolCopy.ClearTempFlags();
    aSymbolCopy.ClearEditFlags();
    aSymbolCopy.SetFlags(UR_TRANSIENT);

    const wrapper = new ITEM_PICKER(this.GetScreen(), aSymbolCopy, aUndoType);
    lastcmd.PushItem(wrapper);
    lastcmd.SetDescription(aDescription);
    this.PushCommandToUndoList(lastcmd);

    // Clear redo list, because after new save there is no redo to do.
    this.ClearUndoORRedoList(UNDO_REDO_LIST.REDO_LIST);
  }

  /** `SaveCopyInUndoList( aDescription, aSymbol, aUndoType )`. */
  SaveCopyInUndoList(
    this: SYMBOL_EDIT_FRAME,
    aDescription: string,
    aSymbol: LIB_SYMBOL | null,
    aUndoType = UNDO_REDO.LIBEDIT,
  ): void {
    if (aSymbol) this.PushSymbolToUndoList(aDescription, LIB_SYMBOL.copyOf(aSymbol), aUndoType);
  }

  /** `GetSymbolFromRedoList()`. */
  GetSymbolFromRedoList(this: SYMBOL_EDIT_FRAME): void {
    if (this.GetRedoCommandCount() <= 0) return;

    // Load the last redo entry
    const redoCommand = this.PopCommandFromRedoList()!;
    const redoWrapper = redoCommand.PopItem();
    const description = redoCommand.GetDescription();

    this.swapInSymbol(redoWrapper, description, (aCommand) => this.PushCommandToUndoList(aCommand));
  }

  /** `GetSymbolFromUndoList()`. */
  GetSymbolFromUndoList(this: SYMBOL_EDIT_FRAME): void {
    if (this.GetUndoCommandCount() <= 0) return;

    // Load the last undo entry
    const undoCommand = this.PopCommandFromUndoList()!;
    const description = undoCommand.GetDescription();
    const undoWrapper = undoCommand.PopItem();

    this.swapInSymbol(undoWrapper, description, (aCommand) => this.PushCommandToRedoList(aCommand));
  }

  /**
   * The shared tail of the two above: the stored symbol becomes the current one, the current one
   * goes on the other list (upstream writes it out twice).
   */
  swapInSymbol(
    this: SYMBOL_EDIT_FRAME,
    aWrapper: ITEM_PICKER,
    aDescription: string,
    aPushOld: (aCommand: PICKED_ITEMS_LIST) => void,
  ): void {
    const symbol = aWrapper.GetItem() as LIB_SYMBOL | null;
    const undoRedoType = aWrapper.GetStatus();

    if (!symbol) return; // wxCHECK

    symbol.ClearFlags(UR_TRANSIENT);

    // Store the current symbol on the other list
    const command = new PICKED_ITEMS_LIST();
    const oldSymbol = this.m_symbol!;

    oldSymbol.SetFlags(UR_TRANSIENT);
    command.PushItem(new ITEM_PICKER(this.GetScreen(), oldSymbol, undoRedoType));
    command.SetDescription(aDescription);
    aPushOld(command);

    // Do not delete the previous symbol by calling SetCurSymbol( symbol ): it is now owned by the
    // other list. Just set the current symbol to the one that came off this list.
    this.m_symbol = symbol;

    if (undoRedoType === UNDO_REDO.LIB_RENAME) {
      const lib = this.GetCurLib();
      this.GetLibManager().UpdateSymbolAfterRename(symbol, oldSymbol.GetName(), lib);

      // Reselect the renamed symbol
      this.FocusOnLibId(new LIB_ID(lib, symbol.GetName()));
    }

    this.RebuildSymbolUnitAndBodyStyleLists();
    this.UpdateTitle();

    this.RebuildView();
    this.OnModify();
  }
}
