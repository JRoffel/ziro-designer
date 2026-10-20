// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `SYMBOL_EDITOR_EDIT_TOOL` (eeschema/tools/symbol_editor_edit_tool.{h,cpp}): the symbol editor's
 * rotate, mirror, swap, delete, undo and redo,
 *
 * the item properties dialogs and the pin table.
 *
 * Every dialog is the window's, through the frame's ShowModalDialog; with no window each is
 * cancelled.
 *
 * The clipboard (Cut, Copy, CopyAsText, Paste) and Duplicate. Copy carries the symbol text only:
 * the SVG and PNG copies (plotSymbolToSvg, renderSymbolToImageWithAlpha) need SCH_ITEM::Plot and
 * the print GAL on the live model, as SCH_EDITOR_CONTROL's Copy notes.
 *
 * Still to come: ConvertStackedPins, ExplodeStackedPin and UpdateSymbolFields - their menu
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
import type { COROUTINE_BODY } from '@ziroeda/common/tool/coroutine.js';
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import { strNumCmp, titleCaps } from '@ziroeda/common/string_utils.js';
import type { MSG_PANEL_ITEM } from '@ziroeda/common/widgets/msgpanel.js';
import { wxID_CANCEL, wxID_OK } from '@ziroeda/wx/menu.js';
import { SYNC_HANDLER } from '@ziroeda/common/tool/tool_interactive.js';
import { UNDO_REDO } from '@ziroeda/common/undo_redo_container.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { VECTOR2I } from '@ziroeda/kimath/src/math/vector2.js';
import { LIB_SYMBOL } from '../lib_symbol.js';
import { SCH_COMMIT } from '../sch_commit.js';
import { SCH_IO_KICAD_SEXPR } from '../sch_io/kicad_sexpr/sch_io_kicad_sexpr.js';
import { SCH_TEXT } from '../sch_text.js';
import { GetSelectedItemsAsText } from './sch_tool_utils.js';
import { GetClipboardUTF8, SaveClipboard } from '@ziroeda/common/clipboard.js';
import { FORMAT_MODE, Prettify } from '@ziroeda/common/io/kicad/kicad_io_utils.js';
import { IO_ERROR } from '@ziroeda/common/exceptions.js';
import { PARSE_ERROR } from '@ziroeda/common/dsnlexer.js';
import { SCH_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { STRING_FORMATTER } from '@ziroeda/common/richio.js';
import { IS_NEW, IS_PASTED, SELECTED, STRUCT_DELETED } from '@ziroeda/common/eda_item_flags.js';
import { LexicographicalCompare } from '@ziroeda/kimath/src/math/vector2.js';
import type { SCH_SHAPE } from '../sch_shape.js';
import type { SCH_FIELD } from '../sch_field.js';
import type { SCH_ITEM } from '../sch_item.js';
import type { SCH_PIN } from '../sch_pin.js';
import type { SYMBOL_EDIT_FRAME } from '../symbol_editor/symbol_edit_frame.js';
import { SCH_ACTIONS } from './sch_actions.js';
import { SCH_CONDITIONS, SCH_SELECTION_TOOL } from './sch_selection_tool.js';
import { SCH_TOOL_BASE } from './sch_tool_base.js';
import { SYMBOL_EDITOR_DRAWING_TOOLS } from './symbol_editor_drawing_tools.js';
import { SYMBOL_EDITOR_MOVE_TOOL } from './symbol_editor_move_tool.js';
import { SYMBOL_EDITOR_PIN_TOOL } from './symbol_editor_pin_tool.js';

const veq = (a: VECTOR2I, b: VECTOR2I): boolean => a.x === b.x && a.y === b.y;

const nonFields: readonly KICAD_T[] = [
  KICAD_T.LIB_SYMBOL_T,
  KICAD_T.SCH_SHAPE_T,
  KICAD_T.SCH_TEXT_T,
  KICAD_T.SCH_TEXTBOX_T,
  KICAD_T.SCH_PIN_T,
];

/** `wxString::IsNumber()`: an optional sign, then digits and nothing else. [data] wx's own rule. */
const isNumber = (aText: string): boolean => /^[+-]?\d+$/.test(aText);

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

    const canCopyText = S_C.OnlyTypes([
      KICAD_T.SCH_TEXT_T,
      KICAD_T.SCH_TEXTBOX_T,
      KICAD_T.SCH_FIELD_T,
      KICAD_T.SCH_PIN_T,
      KICAD_T.SCH_TABLE_T,
      KICAD_T.SCH_TABLECELL_T,
    ]);

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
      moveMenu.AddItem(SCH_ACTIONS.properties, And(canEdit, S_C.Count(1)), 200);

      moveMenu.AddSeparator(300);
      moveMenu.AddItem(ACTIONS.cut, S_C.IdleSelection, 300);
      moveMenu.AddItem(ACTIONS.copy, S_C.IdleSelection, 300);
      moveMenu.AddItem(ACTIONS.copyAsText, And(canCopyText, S_C.IdleSelection), 300);
      moveMenu.AddItem(ACTIONS.duplicate, And(canEdit, S_C.NotEmpty), 300);
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
    selToolMenu.AddItem(SCH_ACTIONS.properties, And(canEdit, S_C.Count(1)), 200);

    selToolMenu.AddSeparator(300);
    selToolMenu.AddItem(ACTIONS.cut, S_C.IdleSelection, 300);
    selToolMenu.AddItem(ACTIONS.copy, S_C.IdleSelection, 300);
    selToolMenu.AddItem(ACTIONS.copyAsText, And(canCopyText, S_C.IdleSelection), 300);
    selToolMenu.AddItem(ACTIONS.paste, And(canEdit, S_C.Idle), 300);
    selToolMenu.AddItem(ACTIONS.duplicate, And(canEdit, S_C.NotEmpty), 300);
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

  *Properties(aEvent: TOOL_EVENT): COROUTINE_BODY<number> {
    const frame = this.m_frame!;
    const selection = this.m_selectionTool!.RequestSelection();

    if (selection.Empty() || aEvent.IsAction(SCH_ACTIONS.symbolProperties)) {
      // If called from tree context menu, edit properties without loading into canvas
      if (aEvent.IsAction(SCH_ACTIONS.symbolProperties)) {
        const treeLibId = frame.GetTreeLIBID();

        // Check if the selected symbol in tree is different from the currently loaded one
        if (
          treeLibId.IsValid() &&
          (!frame.GetCurSymbol() || !frame.GetCurSymbol()!.GetLibId().equals(treeLibId))
        ) {
          // Edit properties directly from library buffer without loading to canvas
          yield* this.editSymbolPropertiesFromLibrary(treeLibId);
          return 0;
        }
      }

      if (frame.GetCurSymbol()) yield* this.editSymbolProperties();
    } else if (selection.Size() === 1) {
      const item = selection.Front() as SCH_ITEM;

      // Save copy for undo if not in edit (edit command already handle the save copy)
      if (item.GetEditFlags() === 0) this.saveCopyInUndoList(item.GetParent()!, UNDO_REDO.LIBEDIT);

      switch (item.Type()) {
        case KICAD_T.SCH_PIN_T: {
          const pin = item as SCH_PIN;

          // Mouse, not cursor, as grid points may well not be under any text
          const mousePos = this.m_toolMgr!.GetMousePosition();
          const layout = pin.GetLayoutCache();

          let mouseOverNumber = false;
          const numberBox = layout.GetPinNumberBBox();

          if (numberBox) mouseOverNumber = numberBox.Contains(mousePos);

          const pinTool = this.m_toolMgr!.GetTool(SYMBOL_EDITOR_PIN_TOOL);

          if (pinTool) yield* pinTool.EditPinProperties(pin, mouseOverNumber, this);

          break;
        }
        case KICAD_T.SCH_SHAPE_T:
          yield* this.editShapeProperties(item as SCH_SHAPE);
          break;

        case KICAD_T.SCH_TEXT_T:
          yield* this.editTextProperties(item);
          break;

        case KICAD_T.SCH_TEXTBOX_T:
          yield* this.editTextBoxProperties(item);
          break;

        case KICAD_T.SCH_FIELD_T:
          yield* this.editFieldProperties(item as SCH_FIELD);
          break;

        default:
          console.assert(false, `Unhandled item <${item.GetClass()}>`);
          break;
      }
    }

    if (selection.IsHover()) this.m_toolMgr!.RunAction(ACTIONS.selectionClear);

    return 0;
  }

  private *editShapeProperties(aShape: SCH_SHAPE): COROUTINE_BODY<void> {
    const frame = this.m_frame!;
    // DIALOG_SHAPE_PROPERTIES dlg( m_frame, aShape ): the window's, which reports its two
    // "apply to all" boxes back here.
    const dlg = { applyToAllConversions: false, applyToAllUnits: false };

    if (
      (yield* this.RunMainStackModal(() =>
        frame.ShowModalDialog('DIALOG_SHAPE_PROPERTIES', [aShape], dlg),
      )) !== wxID_OK
    )
      return;

    this.updateItem(aShape, true);
    frame.GetCanvas()?.Refresh();
    frame.OnModify();

    const drawingTools = this.m_toolMgr!.GetTool(SYMBOL_EDITOR_DRAWING_TOOLS)!;
    drawingTools.SetDrawSpecificBodyStyle(!dlg.applyToAllConversions);
    drawingTools.SetDrawSpecificUnit(!dlg.applyToAllUnits);

    const items: MSG_PANEL_ITEM[] = [];
    aShape.GetMsgPanelInfo(frame.AsDrawFrameLike(), items);
    frame.SetMsgPanel(items);
  }

  private *editTextProperties(aItem: SCH_ITEM): COROUTINE_BODY<void> {
    if (aItem.Type() !== KICAD_T.SCH_TEXT_T) return;

    const frame = this.m_frame!;

    if (
      (yield* this.RunMainStackModal(() =>
        frame.ShowModalDialog('DIALOG_TEXT_PROPERTIES', [aItem]),
      )) !== wxID_OK
    )
      return;

    this.updateItem(aItem, true);
    frame.GetCanvas()?.Refresh();
    frame.OnModify();
  }

  private *editTextBoxProperties(aItem: SCH_ITEM): COROUTINE_BODY<void> {
    if (aItem.Type() !== KICAD_T.SCH_TEXTBOX_T) return;

    const frame = this.m_frame!;

    if (
      (yield* this.RunMainStackModal(() =>
        frame.ShowModalDialog('DIALOG_TEXT_PROPERTIES', [aItem]),
      )) !== wxID_OK
    )
      return;

    this.updateItem(aItem, true);
    frame.GetCanvas()?.Refresh();
    frame.OnModify();
  }

  private *editFieldProperties(aField: SCH_FIELD | null): COROUTINE_BODY<void> {
    if (aField === null) return;

    const frame = this.m_frame!;
    let caption: string;

    if (aField.IsMandatory()) caption = `Edit ${titleCaps(aField.GetName())} Field`;
    else caption = `Edit '${aField.GetName()}' Field`;

    // DIALOG_FIELD_PROPERTIES dlg( m_frame, caption, aField ): the window's. The dialog may invoke
    // a kiway player for footprint fields, so upstream uses a quasimodal dialog. On OK the window
    // does what follows ShowQuasiModal upstream before the push: commit.Modify( aField ) and
    // dlg.UpdateField( aField ), on the commit it is handed.
    const commit = new SCH_COMMIT(this.m_toolMgr!);

    if (
      (yield* this.RunMainStackModal(() =>
        frame.ShowModalDialog('DIALOG_FIELD_PROPERTIES', [aField], { caption, commit }),
      )) !== wxID_OK
    )
      return;

    commit.Push(caption);

    frame.GetCanvas()?.Refresh();
    frame.UpdateSymbolMsgPanelInfo();
  }

  private *editSymbolPropertiesFromLibrary(aLibId: LIB_ID): COROUTINE_BODY<void> {
    const frame = this.m_frame!;
    const libMgr = frame.GetLibManager();
    const libName = aLibId.GetLibNickname();
    const symbolName = aLibId.GetLibItemName();

    // Get the symbol from the library buffer (without loading it into the editor)
    const bufferedSymbol = libMgr.GetBufferedSymbol(symbolName, libName);

    if (!bufferedSymbol) return;

    // Create a copy to work with
    const tempSymbol = LIB_SYMBOL.copyOf(bufferedSymbol);

    this.m_toolMgr!.RunAction(ACTIONS.cancelInteractive);
    this.m_toolMgr!.RunAction(ACTIONS.selectionClear);

    // DIALOG_LIB_SYMBOL_PROPERTIES dlg( m_frame, &tempSymbol ): the window's (quasimodal).
    if (
      (yield* this.RunMainStackModal(() =>
        frame.ShowModalDialog('DIALOG_LIB_SYMBOL_PROPERTIES', [tempSymbol]),
      )) !== wxID_OK
    )
      return;

    const newName = tempSymbol.GetName();

    // Update the buffered symbol with the changes.  A rename has to be keyed on the old name so
    // the existing buffer is renamed in place rather than a duplicate being created under the
    // new name.
    if (newName !== symbolName) libMgr.UpdateSymbolAfterRename(tempSymbol, symbolName, libName);
    else libMgr.UpdateSymbol(tempSymbol, libName);

    // Mark the library as modified
    libMgr.SetSymbolModified(newName, libName);

    // Update the tree view
    const newLibId = new LIB_ID(libName, newName);
    frame.UpdateLibraryTree(newLibId, tempSymbol);
    frame.FocusOnLibId(newLibId);
  }

  private *editSymbolProperties(): COROUTINE_BODY<void> {
    const frame = this.m_frame!;
    const symbol = frame.GetCurSymbol()!;
    const partLocked = symbol.UnitsLocked();

    this.m_toolMgr!.RunAction(ACTIONS.cancelInteractive);
    this.m_toolMgr!.RunAction(ACTIONS.selectionClear);

    // DIALOG_LIB_SYMBOL_PROPERTIES dlg( m_frame, symbol ): the window's (quasimodal).
    if (
      (yield* this.RunMainStackModal(() =>
        frame.ShowModalDialog('DIALOG_LIB_SYMBOL_PROPERTIES', [symbol]),
      )) !== wxID_OK
    )
      return;

    frame.RebuildSymbolUnitAndBodyStyleLists();
    frame.OnModify();

    // Update the library tree node so the description and other metadata reflect the changes
    // immediately without requiring the editor to be reopened.
    frame.UpdateLibraryTree(symbol.GetLibId(), symbol);

    // if m_UnitSelectionLocked has changed, set some edit options or defaults
    // to the best value
    if (partLocked !== symbol.UnitsLocked()) {
      const tools = this.m_toolMgr!.GetTool(SYMBOL_EDITOR_DRAWING_TOOLS)!;

      // Enable synchronized pin edit mode for symbols with interchangeable units
      frame.m_SyncPinEdit = !symbol.UnitsLocked();

      // also set default edit options to the better value
      // Usually if units are locked, graphic items are specific to each unit
      // and if units are interchangeable, graphic items are common to units
      tools.SetDrawSpecificUnit(symbol.UnitsLocked());
    }
  }

  *PinTable(_aEvent: TOOL_EVENT): COROUTINE_BODY<number> {
    const frame = this.m_frame!;
    const commit = new SCH_COMMIT(frame);
    const symbol = frame.GetCurSymbol();

    if (!symbol) return 0;

    commit.Modify(symbol, frame.GetScreen());

    const selTool = this.m_toolMgr!.GetTool(SCH_SELECTION_TOOL);

    if (!selTool) return -1; // wxCHECK

    const selectedPins: SCH_PIN[] = [];

    for (const item of selTool.GetSelection()) {
      if (item.Type() === KICAD_T.SCH_PIN_T) selectedPins.push(item as SCH_PIN);
    }

    // And now clear the selection so if we change the pins we don't have dangling pointers
    // in the selection.
    this.m_toolMgr!.RunAction(ACTIONS.selectionClear);

    // DIALOG_LIB_EDIT_PIN_TABLE dlg( m_frame, symbol, selectedPins ): the window's.
    if (
      (yield* this.RunMainStackModal(() =>
        frame.ShowModalDialog('DIALOG_LIB_EDIT_PIN_TABLE', [symbol, ...selectedPins]),
      )) === wxID_CANCEL
    )
      return -1;

    commit.Push('Edit Pins');
    frame.RebuildView();

    return 0;
  }

  Cut(aEvent: TOOL_EVENT): number {
    let retVal = this.Copy(aEvent);

    if (retVal === 0) retVal = this.DoDelete(aEvent);

    return retVal;
  }

  Copy(_aEvent: TOOL_EVENT): number {
    const symbol = this.m_frame!.GetCurSymbol();
    const selection = this.m_selectionTool!.RequestSelection(nonFields);

    if (!symbol || !selection.GetSize()) return 0;

    for (const item of symbol.GetDrawItems()) {
      if (item.Type() === KICAD_T.SCH_FIELD_T) continue;

      console.assert(!item.HasFlag(STRUCT_DELETED));

      if (!item.IsSelected()) item.SetFlags(STRUCT_DELETED);
    }

    // The copy constructor leaves out what is flagged STRUCT_DELETED: the selection is all it
    // carries.
    const partCopy = LIB_SYMBOL.copyOf(symbol);

    const formatter = new STRING_FORMATTER();
    SCH_IO_KICAD_SEXPR.FormatLibSymbol(partCopy, formatter);

    for (const item of symbol.GetDrawItems()) item.ClearFlags(STRUCT_DELETED);

    const prettyData = Prettify(formatter.GetString(), FORMAT_MODE.COMPACT_TEXT_PROPERTIES);

    // Upstream also offers an SVG and a PNG of the selection here; see the file comment.
    if (SaveClipboard(prettyData)) return 0;
    else return -1;
  }

  CopyAsText(_aEvent: TOOL_EVENT): number {
    const selTool = this.m_toolMgr!.GetTool(SCH_SELECTION_TOOL)!;
    const selection = selTool.RequestSelection();

    if (selection.Empty()) return 0;

    const itemsAsText = GetSelectedItemsAsText(selection);

    if (selection.IsHover()) this.m_toolMgr!.RunAction(ACTIONS.selectionClear);

    return SaveClipboard(itemsAsText) ? 1 : 0;
  }

  *Paste(_aEvent: TOOL_EVENT): COROUTINE_BODY<number> {
    const frame = this.m_frame!;
    const symbol = frame.GetCurSymbol();
    let newPart: LIB_SYMBOL | null = null;

    if (!symbol || symbol.IsDerived()) return 0;

    const clipboardData = GetClipboardUTF8();

    try {
      const newParts = SCH_IO_KICAD_SEXPR.ParseLibSymbols(clipboardData, 'Clipboard');

      if (newParts.length === 0 || !newParts[0]) return -1;

      newPart = newParts[0];
    } catch (e) {
      // catch( IO_ERROR& ): upstream's PARSE_ERROR is an IO_ERROR, ours does not derive from it
      // yet, so both are named.
      if (!(e instanceof IO_ERROR) && !(e instanceof PARSE_ERROR)) throw e;

      // If it's not a symbol then paste as text
      newPart = new LIB_SYMBOL('dummy_part');

      let pasteText = clipboardData;

      // Limit of 5000 is totally arbitrary.  Without a limit, pasting a bitmap image from
      // eeschema makes KiCad appear to hang.
      if (pasteText.length > 5000) pasteText = `${pasteText.slice(0, 5000)}...`;

      const newText = new SCH_TEXT({ x: 0, y: 0 }, pasteText, SCH_LAYER_ID.LAYER_DEVICE);
      newPart.AddDrawItem(newText);
    }

    const commit = new SCH_COMMIT(this.m_toolMgr!);

    commit.Modify(symbol, frame.GetScreen());
    this.m_selectionTool!.ClearSelection();

    for (const item of symbol.GetDrawItems()) item.ClearFlags(IS_NEW | IS_PASTED | SELECTED);

    for (const item of newPart.GetDrawItems()) {
      if (item.Type() === KICAD_T.SCH_FIELD_T) continue;

      const newItem = item.Duplicate(true, commit);
      newItem.SetParent(symbol);
      newItem.SetFlags(IS_NEW | IS_PASTED | SELECTED);

      newItem.SetUnit(newItem.GetUnit() ? frame.GetUnit() : 0);
      newItem.SetBodyStyle(newItem.GetBodyStyle() ? frame.GetBodyStyle() : 0);

      symbol.AddDrawItem(newItem);
      this.getView()!.Add(newItem);
    }

    this.m_selectionTool!.RebuildSelection();

    const selection = this.m_selectionTool!.GetSelection();

    if (!selection.Empty()) {
      selection.SetReferencePoint(this.getViewControls()!.GetCursorPosition(true));

      if (yield* this.RunSynchronousActionWait(SCH_ACTIONS.move, commit)) commit.Push('Paste');
      else commit.Revert();
    }

    return 0;
  }

  *Duplicate(_aEvent: TOOL_EVENT): COROUTINE_BODY<number> {
    const frame = this.m_frame!;
    const symbol = frame.GetCurSymbol()!;
    const selection = this.m_selectionTool!.RequestSelection(nonFields);
    const commit = new SCH_COMMIT(this.m_toolMgr!);

    if (selection.GetSize() === 0) return 0;

    commit.Modify(symbol, frame.GetScreen());

    const oldItems: EDA_ITEM[] = [...selection];
    const newItems: EDA_ITEM[] = [];

    oldItems.sort((a, b) => {
      if (a.Type() !== b.Type()) return a.Type() - b.Type();

      // Create the new pins in the same order as the old pins
      if (a.Type() === KICAD_T.SCH_PIN_T) {
        const aNum = (a as SCH_PIN).GetNumber();
        const bNum = (b as SCH_PIN).GetNumber();

        const cmp = strNumCmp(aNum, bNum);

        // If the pin numbers are not numeric, then just number them by their position
        // on the screen.
        if (isNumber(aNum) && isNumber(bNum) && cmp !== 0) return cmp;
      }

      const cmp = LexicographicalCompare(a.GetPosition(), b.GetPosition());

      if (cmp !== 0) return cmp;

      return a.m_Uuid < b.m_Uuid ? -1 : a.m_Uuid > b.m_Uuid ? 1 : 0;
    });

    for (const item of oldItems) {
      const oldItem = item as SCH_ITEM;
      const newItem = oldItem.Duplicate(true, commit);

      if (newItem.Type() === KICAD_T.SCH_PIN_T) {
        const newPin = newItem as SCH_PIN;

        if (newPin.GetNumber() !== '') newPin.SetNumber(String(symbol.GetMaxPinNumber() + 1));
      }

      oldItem.ClearFlags(IS_NEW | IS_PASTED | SELECTED);
      newItem.SetFlags(IS_NEW | IS_PASTED | SELECTED);
      newItem.SetParent(symbol);
      newItems.push(newItem);

      symbol.AddDrawItem(newItem);
      this.getView()!.Add(newItem);
    }

    this.m_toolMgr!.RunAction(ACTIONS.selectionClear);
    this.m_toolMgr!.RunAction(ACTIONS.selectItems, newItems);

    selection.SetReferencePoint(this.getViewControls()!.GetCursorPosition(true));

    if (yield* this.RunSynchronousActionWait(SCH_ACTIONS.move, commit)) commit.Push('Duplicate');
    else commit.Revert();

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
    this.Go(SYNC_HANDLER(this.Cut), ACTIONS.cut.MakeEvent());
    this.Go(SYNC_HANDLER(this.Copy), ACTIONS.copy.MakeEvent());
    this.Go(SYNC_HANDLER(this.CopyAsText), ACTIONS.copyAsText.MakeEvent());
    this.Go(this.Paste, ACTIONS.paste.MakeEvent());
    this.Go(this.Duplicate, ACTIONS.duplicate.MakeEvent());

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

    this.Go(this.Properties, SCH_ACTIONS.properties.MakeEvent());
    this.Go(this.Properties, SCH_ACTIONS.symbolProperties.MakeEvent());
    this.Go(this.PinTable, SCH_ACTIONS.pinTable.MakeEvent());
  }
}
