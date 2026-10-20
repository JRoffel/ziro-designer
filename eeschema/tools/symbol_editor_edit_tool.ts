// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `SYMBOL_EDITOR_EDIT_TOOL` (eeschema/tools/symbol_editor_edit_tool.{h,cpp}): the symbol editor's
 * rotate, mirror, swap, delete, undo and redo.
 *
 * Still to come with the dialogs and the clipboard: Properties, PinTable, ConvertStackedPins,
 * ExplodeStackedPin, UpdateSymbolFields, Cut, Copy, CopyAsText, Paste and Duplicate - their menu
 * entries are added with them, so no entry runs nothing.
 */
import type { EDA_ITEM } from '@ziroeda/common/eda_item.js';
import { RECURSE_MODE } from '@ziroeda/common/eda_item.js';
import {
  GetFlippedHAlignment,
  GetFlippedVAlignment,
} from '@ziroeda/common/font/text_attributes.js';
import { ACTIONS } from '@ziroeda/common/tool/actions.js';
import type { SELECTION } from '@ziroeda/common/tool/selection.js';
import {
  type SELECTION_CONDITION,
  SELECTION_CONDITIONS,
} from '@ziroeda/common/tool/selection_conditions.js';
import type { TOOL_EVENT } from '@ziroeda/common/tool/tool_event.js';
import { SYNC_HANDLER } from '@ziroeda/common/tool/tool_interactive.js';
import { UNDO_REDO } from '@ziroeda/common/undo_redo_container.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { VECTOR2I } from '@ziroeda/kimath/src/math/vector2.js';
import { SCH_COMMIT } from '../sch_commit.js';
import type { SCH_FIELD } from '../sch_field.js';
import type { SCH_ITEM } from '../sch_item.js';
import type { SCH_PIN } from '../sch_pin.js';
import type { SYMBOL_EDIT_FRAME } from '../symbol_editor/symbol_edit_frame.js';
import { SCH_ACTIONS } from './sch_actions.js';
import { SCH_CONDITIONS, SCH_SELECTION_TOOL } from './sch_selection_tool.js';
import { SCH_TOOL_BASE } from './sch_tool_base.js';
import { SYMBOL_EDITOR_MOVE_TOOL } from './symbol_editor_move_tool.js';

const veq = (a: VECTOR2I, b: VECTOR2I): boolean => a.x === b.x && a.y === b.y;

export class SYMBOL_EDITOR_EDIT_TOOL extends SCH_TOOL_BASE<SYMBOL_EDIT_FRAME> {
  static readonly SwappableItems: readonly KICAD_T[] = [
    KICAD_T.LIB_SYMBOL_T, // Allows swapping the anchor
    KICAD_T.SCH_PIN_T,
    KICAD_T.SCH_SHAPE_T,
    KICAD_T.SCH_TEXT_T,
    KICAD_T.SCH_TEXTBOX_T,
    KICAD_T.SCH_FIELD_T,
  ];

  constructor() {
    super('eeschema.SymbolEditTool');
  }

  override Init(): boolean {
    super.Init();

    // SYMBOL_EDITOR_DRAWING_TOOLS' menu takes rotate, mirror and properties too; that tool is
    // the next stage of the port, and its menu entries come with it.
    const moveTool = this.m_toolMgr!.GetTool(SYMBOL_EDITOR_MOVE_TOOL);
    const { And } = SELECTION_CONDITIONS;
    const S_C = SCH_CONDITIONS;

    const haveSymbolCondition: SELECTION_CONDITION = () =>
      this.m_isSymbolEditor && !!this.m_frame!.GetCurSymbol();

    const canEdit: SELECTION_CONDITION = (sel: SELECTION) => {
      if (!this.m_frame!.IsSymbolEditable()) return false;

      if (this.m_frame!.IsSymbolAlias()) {
        for (const item of sel) {
          if (item.Type() !== KICAD_T.SCH_FIELD_T) return false;
        }
      }

      return true;
    };

    const swapSelectionCondition = And(
      And(canEdit, S_C.OnlyTypes(SYMBOL_EDITOR_EDIT_TOOL.SwappableItems)),
      SELECTION_CONDITIONS.MoreThan(1),
    );

    // Add edit actions to the move tool menu
    if (moveTool) {
      const moveMenu = moveTool.GetToolMenu().GetMenu();

      moveMenu.AddSeparator(200);
      moveMenu.AddItem(SCH_ACTIONS.rotateCCW, And(canEdit, S_C.NotEmpty), 200);
      moveMenu.AddItem(SCH_ACTIONS.rotateCW, And(canEdit, S_C.NotEmpty), 200);
      moveMenu.AddItem(SCH_ACTIONS.mirrorV, And(canEdit, S_C.NotEmpty), 200);
      moveMenu.AddItem(SCH_ACTIONS.mirrorH, And(canEdit, S_C.NotEmpty), 200);

      moveMenu.AddItem(SCH_ACTIONS.swap, swapSelectionCondition, 200);

      moveMenu.AddSeparator(300);
      moveMenu.AddItem(ACTIONS.doDelete, And(canEdit, S_C.NotEmpty), 200);

      moveMenu.AddSeparator(400);
      moveMenu.AddItem(ACTIONS.selectAll, haveSymbolCondition, 400);
      moveMenu.AddItem(ACTIONS.unselectAll, haveSymbolCondition, 400);
    }

    // Add editing actions to the selection tool menu
    const selToolMenu = this.m_selectionTool!.GetToolMenu().GetMenu();

    selToolMenu.AddItem(SCH_ACTIONS.rotateCCW, And(canEdit, S_C.NotEmpty), 200);
    selToolMenu.AddItem(SCH_ACTIONS.rotateCW, And(canEdit, S_C.NotEmpty), 200);
    selToolMenu.AddItem(SCH_ACTIONS.mirrorV, And(canEdit, S_C.NotEmpty), 200);
    selToolMenu.AddItem(SCH_ACTIONS.mirrorH, And(canEdit, S_C.NotEmpty), 200);

    selToolMenu.AddItem(SCH_ACTIONS.swap, swapSelectionCondition, 200);

    selToolMenu.AddSeparator(300);
    selToolMenu.AddItem(ACTIONS.doDelete, And(canEdit, S_C.NotEmpty), 300);

    selToolMenu.AddSeparator(400);
    selToolMenu.AddItem(ACTIONS.selectAll, haveSymbolCondition, 400);
    selToolMenu.AddItem(ACTIONS.unselectAll, haveSymbolCondition, 400);

    return true;
  }

  Rotate(aEvent: TOOL_EVENT): number {
    const selection = this.m_selectionTool!.RequestSelection();

    if (selection.GetSize() === 0) return 0;

    let rotPoint: VECTOR2I;
    const ccw = aEvent.Matches(SCH_ACTIONS.rotateCCW.MakeEvent());
    let item = selection.Front() as SCH_ITEM;
    const localCommit = new SCH_COMMIT(this.m_toolMgr!);
    const eventCommit = aEvent.Commit();
    const commit = eventCommit instanceof SCH_COMMIT ? eventCommit : localCommit;

    if (!item.IsMoving())
      commit.Modify(this.m_frame!.GetCurSymbol()!, this.m_frame!.GetScreen(), RECURSE_MODE.RECURSE);

    if (selection.GetSize() === 1) rotPoint = item.GetPosition();
    else rotPoint = this.m_frame!.GetNearestHalfGridPosition(selection.GetCenter());

    for (let ii = 0; ii < selection.GetSize(); ii++) {
      item = selection.GetItem(ii) as SCH_ITEM;
      item.Rotate(rotPoint, ccw);
      this.m_frame!.UpdateItem(item, false, true);
    }

    if (item.IsMoving()) {
      this.m_toolMgr!.RunAction(ACTIONS.refreshPreview);
    } else {
      if (selection.IsHover()) this.m_toolMgr!.RunAction(ACTIONS.selectionClear);

      if (!localCommit.Empty()) localCommit.Push('Rotate');
    }

    return 0;
  }

  Mirror(aEvent: TOOL_EVENT): number {
    const selection = this.m_selectionTool!.RequestSelection();

    if (selection.GetSize() === 0) return 0;

    let mirrorPoint: VECTOR2I;
    const xAxis = aEvent.Matches(SCH_ACTIONS.mirrorV.MakeEvent());
    let item = selection.Front() as SCH_ITEM;

    if (!item.IsMoving()) this.saveCopyInUndoList(this.m_frame!.GetCurSymbol()!, UNDO_REDO.LIBEDIT);

    if (selection.GetSize() === 1) {
      mirrorPoint = item.GetPosition();

      switch (item.Type()) {
        case KICAD_T.SCH_FIELD_T: {
          const field = item as SCH_FIELD;

          if (xAxis) field.SetVertJustify(GetFlippedVAlignment(field.GetVertJustify()));
          else field.SetHorizJustify(GetFlippedHAlignment(field.GetHorizJustify()));

          break;
        }

        default:
          if (xAxis) item.MirrorVertically(mirrorPoint.y);
          else item.MirrorHorizontally(mirrorPoint.x);

          break;
      }

      this.m_frame!.UpdateItem(item, false, true);
    } else {
      mirrorPoint = this.m_frame!.GetNearestHalfGridPosition(selection.GetCenter());

      for (let ii = 0; ii < selection.GetSize(); ii++) {
        item = selection.GetItem(ii) as SCH_ITEM;

        if (xAxis) item.MirrorVertically(mirrorPoint.y);
        else item.MirrorHorizontally(mirrorPoint.x);

        this.m_frame!.UpdateItem(item, false, true);
      }
    }

    if (item.IsMoving()) {
      this.m_toolMgr!.RunAction(ACTIONS.refreshPreview);
    } else {
      if (selection.IsHover()) this.m_toolMgr!.RunAction(ACTIONS.selectionClear);

      this.m_frame!.OnModify();
    }

    return 0;
  }

  Swap(_aEvent: TOOL_EVENT): number {
    const selection = this.m_selectionTool!.RequestSelection(
      SYMBOL_EDITOR_EDIT_TOOL.SwappableItems,
    );
    const sorted = selection.GetItemsSortedBySelectionOrder();

    if (selection.Size() < 2) return 0;

    const front = selection.Front()!;
    const isMoving = front.IsMoving();

    // Save copy for undo if not in edit (edit command already handle the save copy)
    if (front.GetEditFlags() === 0) this.saveCopyInUndoList(front.GetParent()!, UNDO_REDO.LIBEDIT);

    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i] as SCH_ITEM;
      const b = sorted[(i + 1) % sorted.length] as SCH_ITEM;

      const aPos = b.GetPosition();
      const bPos = a.GetPosition();

      a.SetPosition(aPos);
      b.SetPosition(bPos);

      // Special case some common swaps
      if (a.Type() === b.Type()) {
        switch (a.Type()) {
          case KICAD_T.SCH_PIN_T: {
            const aPin = a as SCH_PIN;
            const bBpin = b as SCH_PIN;

            const aOrient = aPin.GetOrientation();
            const bOrient = bBpin.GetOrientation();

            aPin.SetOrientation(bOrient);
            bBpin.SetOrientation(aOrient);

            break;
          }
          default:
            break;
        }
      }

      this.m_frame!.UpdateItem(a, false, true);
      this.m_frame!.UpdateItem(b, false, true);
    }

    // Update R-Tree for modified items
    for (const selected of selection) this.updateItem(selected, true);

    if (isMoving) {
      this.m_toolMgr!.PostAction(ACTIONS.refreshPreview);
    } else {
      if (selection.IsHover()) this.m_toolMgr!.RunAction(ACTIONS.selectionClear);

      this.m_frame!.OnModify();
    }

    return 0;
  }

  /** Delete the selected items, or the item under the cursor. */
  DoDelete(_aEvent: TOOL_EVENT): number {
    const frame = this.m_frame!;
    const symbol = frame.GetCurSymbol()!;
    const items: EDA_ITEM[] = [...this.m_selectionTool!.RequestSelection().GetItems()];
    const commit = new SCH_COMMIT(frame);

    if (items.length === 0) return 0;

    // Don't leave a freed pointer in the selection
    this.m_toolMgr!.RunAction(ACTIONS.selectionClear);

    commit.Modify(symbol, frame.GetScreen());

    const toDelete = new Set<SCH_ITEM>();
    let fieldsHidden = 0;
    let fieldsAlreadyHidden = 0;

    for (const item of items) {
      if (item.Type() === KICAD_T.SCH_PIN_T) {
        const curr_pin = item as SCH_PIN;
        const pos = curr_pin.GetPosition();

        toDelete.add(curr_pin);

        // when pin editing is synchronized, pins in the same position, with the same name
        // in different units are also removed.  But only one pin per unit (matching)
        if (frame.SynchronizePins()) {
          const got_unit: boolean[] = new Array(symbol.GetUnitCount() + 1).fill(false);

          got_unit[curr_pin.GetUnit()] = true;

          for (const pin of symbol.GetPins()) {
            if (got_unit[pin.GetUnit()]) continue;

            if (!veq(pin.GetPosition(), pos)) continue;

            if (pin.GetBodyStyle() !== curr_pin.GetBodyStyle()) continue;

            if (pin.GetType() !== curr_pin.GetType()) continue;

            if (pin.GetName() !== curr_pin.GetName()) continue;

            toDelete.add(pin);
            got_unit[pin.GetUnit()] = true;
          }
        }
      } else if (item.Type() === KICAD_T.SCH_FIELD_T) {
        const field = item as SCH_FIELD;

        // Hide "deleted" fields
        if (field.IsVisible()) {
          field.SetVisible(false);
          fieldsHidden++;
        } else {
          fieldsAlreadyHidden++;
        }
      } else if (item.IsSCH_ITEM()) {
        toDelete.add(item as SCH_ITEM);
      }
    }

    for (const item of toDelete) symbol.RemoveDrawItem(item);

    if (toDelete.size === 0) {
      if (fieldsHidden === 1) commit.Push('Hide Field');
      else if (fieldsHidden > 1) commit.Push('Hide Fields');
      else if (fieldsAlreadyHidden > 0)
        frame.ShowInfoBarError('Use the Symbol Properties dialog to remove fields.');
    } else {
      commit.Push('Delete');
    }

    frame.RebuildView();
    return 0;
  }

  Undo(_aEvent: TOOL_EVENT): number {
    const selTool = this.m_toolMgr!.GetTool(SCH_SELECTION_TOOL)!;

    // Nuke the selection for later rebuilding.  This does *not* clear the flags on any items;
    // it just clears the SELECTION's reference to them.
    selTool.GetSelection().Clear();
    {
      this.m_frame!.GetSymbolFromUndoList();
    }
    selTool.RebuildSelection();

    return 0;
  }

  Redo(_aEvent: TOOL_EVENT): number {
    const selTool = this.m_toolMgr!.GetTool(SCH_SELECTION_TOOL)!;

    // Nuke the selection for later rebuilding.  This does *not* clear the flags on any items;
    // it just clears the SELECTION's reference to them.
    selTool.GetSelection().Clear();
    {
      this.m_frame!.GetSymbolFromRedoList();
    }
    selTool.RebuildSelection();

    return 0;
  }

  protected override setTransitions(): void {
    this.Go(SYNC_HANDLER(this.Undo), ACTIONS.undo.MakeEvent());
    this.Go(SYNC_HANDLER(this.Redo), ACTIONS.redo.MakeEvent());

    this.Go(SYNC_HANDLER(this.Rotate), SCH_ACTIONS.rotateCW.MakeEvent());
    this.Go(SYNC_HANDLER(this.Rotate), SCH_ACTIONS.rotateCCW.MakeEvent());
    this.Go(SYNC_HANDLER(this.Mirror), SCH_ACTIONS.mirrorV.MakeEvent());
    this.Go(SYNC_HANDLER(this.Mirror), SCH_ACTIONS.mirrorH.MakeEvent());
    this.Go(SYNC_HANDLER(this.Swap), SCH_ACTIONS.swap.MakeEvent());
    this.Go(SYNC_HANDLER(this.DoDelete), ACTIONS.doDelete.MakeEvent());
    this.Go(SYNC_HANDLER(this.InteractiveDelete), ACTIONS.deleteTool.MakeEvent());

    this.Go(SYNC_HANDLER(this.Increment), ACTIONS.increment.MakeEvent());
    this.Go(SYNC_HANDLER(this.Increment), ACTIONS.incrementPrimary.MakeEvent());
    this.Go(SYNC_HANDLER(this.Increment), ACTIONS.decrementPrimary.MakeEvent());
    this.Go(SYNC_HANDLER(this.Increment), ACTIONS.incrementSecondary.MakeEvent());
    this.Go(SYNC_HANDLER(this.Increment), ACTIONS.decrementSecondary.MakeEvent());
  }
}
