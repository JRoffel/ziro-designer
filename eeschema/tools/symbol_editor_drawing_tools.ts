// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `SYMBOL_EDITOR_DRAWING_TOOLS` (eeschema/tools/symbol_editor_drawing_tools.{h,cpp}): the tool
 * responsible for drawing / placing items in the symbol editor - pins, text, the anchor - and
 * Repeat Last Item.
 *
 * Still to come: doDrawShape (DrawShape, DrawSymbolTextBox) and ImportGraphics; their actions
 * are not bound until they are.
 */
import { type KIID, niluuid } from '@ziroeda/common/kiid.js';
import { type EDA_ITEM } from '@ziroeda/common/eda_item.js';
import { IS_MOVING, IS_NEW } from '@ziroeda/common/eda_item_flags.js';
import { schIUScale } from '@ziroeda/common/eda_units.js';
import { GR_TEXT_H_ALIGN_T } from '@ziroeda/common/font/text_attributes.js';
import { KICURSOR } from '@ziroeda/common/gal/cursors.js';
import { SCH_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { PgmOrNull } from '@ziroeda/common/pgm_base.js';
import { NoPrintableChars } from '@ziroeda/common/string_utils.js';
import { ACTIONS, type INCREMENT } from '@ziroeda/common/tool/actions.js';
import type { COROUTINE_BODY } from '@ziroeda/common/tool/coroutine.js';
import type { SELECTION } from '@ziroeda/common/tool/selection.js';
import { BUT_LEFT, BUT_RIGHT, MD_SHIFT, type TOOL_EVENT } from '@ziroeda/common/tool/tool_event.js';
import type { VIEW_CONTROLS } from '@ziroeda/common/view/view_controls.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import { ANGLE_HORIZONTAL, type EDA_ANGLE } from '@ziroeda/kimath/src/geometry/eda_angle.js';
import type { VECTOR2I } from '@ziroeda/kimath/src/math/vector2.js';
import { wxID_OK } from '@ziroeda/wx/menu.js';
import type { LIB_SYMBOL } from '../lib_symbol.js';
import { SCH_COMMIT } from '../sch_commit.js';
import { SCH_ITEM } from '../sch_item.js';
import type { SCH_PIN } from '../sch_pin.js';
import { SCH_TEXT } from '../sch_text.js';
import { currentSymbolEditorSettings } from '../symbol_editor/symbol_editor_settings.js';
import type { SYMBOL_EDIT_FRAME } from '../symbol_editor/symbol_edit_frame.js';
import { EE_GRID_HELPER } from './ee_grid_helper.js';
import { SCH_ACTIONS } from './sch_actions.js';
import { SCH_TOOL_BASE } from './sch_tool_base.js';
import { SYMBOL_EDITOR_PIN_TOOL } from './symbol_editor_pin_tool.js';

export class SYMBOL_EDITOR_DRAWING_TOOLS extends SCH_TOOL_BASE<SYMBOL_EDIT_FRAME> {
  private m_lastTextBold = false;
  private m_lastTextItalic = false;
  private m_lastTextAngle: EDA_ANGLE = ANGLE_HORIZONTAL;
  private m_lastTextJust = GR_TEXT_H_ALIGN_T.GR_TEXT_H_ALIGN_LEFT;
  private m_drawSpecificBodyStyle = true;
  private m_drawSpecificUnit = false;

  ///< Re-entrancy guards
  private m_inPlaceAnchor = false;
  private m_inTwoClickPlace = false;

  /** `g_lastPin`: the pin Repeat Last Item repeats. */
  static g_lastPin: KIID = niluuid;

  constructor() {
    super('eeschema.SymbolDrawing');
  }

  override Init(): boolean {
    super.Init();

    const isDrawingCondition = (aSel: SELECTION): boolean => {
      const item = aSel.Front();
      return item instanceof SCH_ITEM && item.IsNew();
    };

    this.m_menu.GetMenu().AddItem(ACTIONS.finishInteractive, isDrawingCondition, 2);

    return true;
  }

  SetLastTextAngle(aAngle: EDA_ANGLE): void {
    this.m_lastTextAngle = aAngle;
  }

  GetLastTextAngle(): EDA_ANGLE {
    return this.m_lastTextAngle;
  }

  SetDrawSpecificBodyStyle(aSpecific: boolean): void {
    this.m_drawSpecificBodyStyle = aSpecific;
  }

  GetDrawSpecificBodyStyle(): boolean {
    return this.m_drawSpecificBodyStyle;
  }

  SetDrawSpecificUnit(aSpecific: boolean): void {
    this.m_drawSpecificUnit = aSpecific;
  }

  GetDrawSpecificUnit(): boolean {
    return this.m_drawSpecificUnit;
  }

  *TwoClickPlace(aEvent: TOOL_EVENT): COROUTINE_BODY<number> {
    const type = aEvent.Parameter<KICAD_T>();
    const cfg = currentSymbolEditorSettings();
    const pinTool =
      type === KICAD_T.SCH_PIN_T ? this.m_toolMgr!.GetTool(SYMBOL_EDITOR_PIN_TOOL) : null;

    if (this.m_inTwoClickPlace) return 0;

    // REENTRANCY_GUARD guard( &m_inTwoClickPlace )
    this.m_inTwoClickPlace = true;

    try {
      const frame = this.m_frame!;
      const controls = this.controls();
      const grid = new EE_GRID_HELPER(this.m_toolMgr!);
      let cursorPos: VECTOR2I = { x: 0, y: 0 };
      let ignorePrimePosition = false;
      let item: SCH_ITEM | null = null;
      const isText = aEvent.IsAction(SCH_ACTIONS.placeSymbolText);
      const common_settings = PgmOrNull()?.GetCommonSettings() ?? null;

      this.m_toolMgr!.RunAction(ACTIONS.selectionClear);

      frame.PushTool(aEvent);

      const setCursor = (): void => {
        if (item) frame.GetCanvas()!.SetCurrentCursor(KICURSOR.PLACE);
        else if (isText) frame.GetCanvas()!.SetCurrentCursor(KICURSOR.TEXT);
        else frame.GetCanvas()!.SetCurrentCursor(KICURSOR.PENCIL);
      };

      const cleanup = (): void => {
        this.m_toolMgr!.RunAction(ACTIONS.selectionClear);
        this.m_view!.ClearPreview();
        item = null;
      };

      this.Activate();
      // Must be done after Activate() so that it gets set into the correct context
      controls.ShowCursor(true);
      // Set initial cursor
      setCursor();

      if (aEvent.HasPosition()) {
        this.m_toolMgr!.PrimeTool(aEvent.Position());
      } else if ((common_settings?.m_Input.immediate_actions ?? true) && !aEvent.IsReactivate()) {
        this.m_toolMgr!.PrimeTool({ x: 0, y: 0 });
        ignorePrimePosition = true;
      }

      const commit = new SCH_COMMIT(this.m_toolMgr!);

      // Main loop: keep receiving events
      for (let evt = yield* this.Wait(); evt; evt = yield* this.Wait()) {
        setCursor();
        grid.SetSnap(!evt.Modifier(MD_SHIFT));
        grid.SetUseGrid(this.getView()!.GetGAL()!.GetGridSnapping() && !evt.DisableGridSnapping());

        cursorPos = grid.Align(controls.GetMousePosition(), grid.GetItemGrid(item));
        controls.ForceCursorPosition(true, cursorPos);

        // The tool hotkey is interpreted as a click when drawing
        const isSyntheticClick =
          !!item && evt.IsActivate() && evt.HasPosition() && evt.Matches(aEvent);

        if (evt.IsCancelInteractive()) {
          frame.GetInfoBar()?.Dismiss();

          if (item) {
            cleanup();
          } else {
            frame.PopTool(aEvent);
            break;
          }
        } else if (evt.IsActivate() && !isSyntheticClick) {
          if (item && evt.IsMoveTool()) {
            // we're already moving our own item; ignore the move tool
            evt.SetPassEvent(false);
            continue;
          }

          if (item) {
            frame.ShowInfoBarMsg('Press <ESC> to cancel item creation.');
            evt.SetPassEvent(false);
            continue;
          }

          if (evt.IsPointEditor()) {
            // don't exit (the point editor runs in the background)
          } else if (evt.IsMoveTool()) {
            break;
          } else {
            frame.PopTool(aEvent);
            break;
          }
        } else if (evt.IsClick(BUT_LEFT) || evt.IsDblClick(BUT_LEFT) || isSyntheticClick) {
          const symbol = frame.GetCurSymbol();

          if (!symbol) continue;

          // First click creates...
          if (!item) {
            this.m_toolMgr!.RunAction(ACTIONS.selectionClear);

            switch (type) {
              case KICAD_T.SCH_PIN_T: {
                item = yield* pinTool!.CreatePin(cursorPos, symbol, this);

                if (item) SYMBOL_EDITOR_DRAWING_TOOLS.g_lastPin = item.m_Uuid;

                break;
              }

              case KICAD_T.SCH_TEXT_T: {
                const text = new SCH_TEXT(cursorPos, '', SCH_LAYER_ID.LAYER_DEVICE);

                text.SetParent(symbol);

                if (this.m_drawSpecificUnit) text.SetUnit(frame.GetUnit());

                if (this.m_drawSpecificBodyStyle) text.SetBodyStyle(frame.GetBodyStyle());

                const size = schIUScale.milsToIU(cfg.defaults.text_size);
                text.SetTextSize({ x: size, y: size });

                text.SetTextAngle(this.m_lastTextAngle);

                // DIALOG_TEXT_PROPERTIES dlg( m_frame, text ): the window's.
                const ret = yield* this.RunMainStackModal(() =>
                  frame.ShowModalDialog('DIALOG_TEXT_PROPERTIES', [text]),
                );

                if (ret === wxID_OK && !NoPrintableChars(text.GetText())) item = text;

                break;
              }

              default:
                console.assert(false, 'TwoClickPlace(): unknown type');
            }

            // If we started with a hotkey which has a position then warp back to that.
            // Otherwise update to the current mouse position pinned inside the autoscroll
            // boundaries.
            if (evt.IsPrime() && !ignorePrimePosition) {
              cursorPos = grid.Align(evt.Position(), grid.GetItemGrid(item));
              controls.WarpMouseCursor(cursorPos, true);
            } else {
              controls.PinCursorInsideNonAutoscrollArea(true);
              cursorPos = grid.Align(controls.GetMousePosition(), grid.GetItemGrid(item));
            }

            if (item) {
              item.SetPosition({ x: cursorPos.x, y: -cursorPos.y });

              item.SetFlags(IS_NEW | IS_MOVING);
              this.m_view!.ClearPreview();
              this.m_view!.AddToPreview(item, false);
              this.m_selectionTool!.AddItemToSel(item);

              // update the cursor so it looks correct before another event
              setCursor();
            }

            if (frame.GetMoveWarpsCursor()) controls.SetCursorPosition(cursorPos, false);

            this.m_toolMgr!.PostAction(ACTIONS.refreshPreview);
          }
          // ... and second click places:
          else {
            commit.Modify(symbol, frame.GetScreen());

            switch (item.Type()) {
              case KICAD_T.SCH_PIN_T:
                yield* pinTool!.PlacePin(commit, item as SCH_PIN, this);
                item.ClearEditFlags();
                commit.Push('Place Pin');
                break;

              case KICAD_T.SCH_TEXT_T:
                symbol.AddDrawItem(item as SCH_TEXT);
                item.ClearEditFlags();
                commit.Push('Draw Text');
                break;

              default:
                console.assert(false, 'TwoClickPlace(): unknown type');
            }

            item = null;
            this.m_view!.ClearPreview();
            frame.RebuildView();
          }
        } else if (evt.IsClick(BUT_RIGHT)) {
          // Warp after context menu only if dragging...
          if (!item) this.m_toolMgr!.VetoContextMenuMouseWarp();

          this.m_menu.ShowContextMenu(this.m_selectionTool!.GetSelection());
        } else if (evt.IsAction(ACTIONS.increment)) {
          const param: INCREMENT = evt.HasParameter()
            ? evt.Parameter<INCREMENT>()
            : { Delta: 1, Index: 0 };

          yield* this.RunSynchronousActionWait(ACTIONS.increment, commit, param);
        } else if (item && (evt.IsAction(ACTIONS.refreshPreview) || evt.IsMotion())) {
          item.SetPosition({ x: cursorPos.x, y: cursorPos.y });
          this.m_view!.ClearPreview();
          this.m_view!.AddToPreview(item, false);
        } else {
          evt.SetPassEvent();
        }

        // Enable autopanning and cursor capture only when there is an item to be placed
        controls.SetAutoPan(item !== null);
        controls.CaptureCursor(item !== null);
      }

      controls.SetAutoPan(false);
      controls.CaptureCursor(false);
      controls.ForceCursorPosition(false);
      frame.GetCanvas()!.SetCurrentCursor(KICURSOR.ARROW);
      return 0;
    } finally {
      this.m_inTwoClickPlace = false;
    }
  }

  *PlaceAnchor(aEvent: TOOL_EVENT): COROUTINE_BODY<number> {
    if (this.m_inPlaceAnchor) return 0;

    // REENTRANCY_GUARD guard( &m_inPlaceAnchor )
    this.m_inPlaceAnchor = true;

    try {
      const frame = this.m_frame!;
      frame.PushTool(aEvent);

      const setCursor = (): void => {
        frame.GetCanvas()!.SetCurrentCursor(KICURSOR.BULLSEYE);
      };

      this.Activate();
      // Must be done after Activate() so that it gets set into the correct context
      this.controls().ShowCursor(true);
      // Set initial cursor
      setCursor();

      // Main loop: keep receiving events
      for (let evt = yield* this.Wait(); evt; evt = yield* this.Wait()) {
        setCursor();

        if (evt.IsCancelInteractive()) {
          frame.PopTool(aEvent);
          break;
        } else if (evt.IsActivate()) {
          frame.PopTool(aEvent);
          break;
        } else if (evt.IsClick(BUT_LEFT) || evt.IsDblClick(BUT_LEFT)) {
          const symbol = frame.GetCurSymbol();

          if (!symbol) continue;

          const cursorPos = this.controls().GetCursorPosition(!evt.DisableGridSnapping());

          symbol.Move({ x: -cursorPos.x, y: -cursorPos.y });

          // Refresh the view without changing the viewport
          const center = this.m_view!.GetCenter();
          this.m_view!.SetCenter({ x: center.x + cursorPos.x, y: center.y + cursorPos.y });
          this.m_view!.RecacheAllItems();
          frame.OnModify();
        } else if (evt.IsClick(BUT_RIGHT)) {
          this.m_menu.ShowContextMenu(this.m_selectionTool!.GetSelection());
        } else {
          evt.SetPassEvent();
        }
      }

      frame.GetCanvas()!.SetCurrentCursor(KICURSOR.ARROW);
      return 0;
    } finally {
      this.m_inPlaceAnchor = false;
    }
  }

  *RepeatDrawItem(_aEvent: TOOL_EVENT): COROUTINE_BODY<number> {
    const pinTool = this.m_toolMgr!.GetTool(SYMBOL_EDITOR_PIN_TOOL)!;
    const symbol: LIB_SYMBOL | null = this.m_frame!.GetCurSymbol();
    let sourcePin: SCH_PIN | null = null;

    if (!symbol) return 0;

    for (const test of symbol.GetPins()) {
      if (test.m_Uuid === SYMBOL_EDITOR_DRAWING_TOOLS.g_lastPin) {
        sourcePin = test;
        break;
      }
    }

    if (sourcePin) {
      const pin = yield* pinTool.RepeatPin(sourcePin, this);

      if (pin) SYMBOL_EDITOR_DRAWING_TOOLS.g_lastPin = pin.m_Uuid;

      this.m_toolMgr!.RunAction(ACTIONS.selectionClear);

      if (pin) this.m_toolMgr!.RunAction<EDA_ITEM>(ACTIONS.selectItem, pin);
    }

    return 0;
  }

  /** `getViewControls()`, with the VIEW_CONTROLS methods the TOOL_MANAGER's interface leaves out. */
  private controls(): VIEW_CONTROLS {
    return this.getViewControls() as unknown as VIEW_CONTROLS;
  }

  protected override setTransitions(): void {
    this.Go(this.TwoClickPlace, SCH_ACTIONS.placeSymbolPin.MakeEvent());
    this.Go(this.TwoClickPlace, SCH_ACTIONS.placeSymbolText.MakeEvent());
    // DrawShape (drawRectangle, drawCircle, drawArc, drawBezier, drawSymbolLines,
    // drawSymbolPolygon), DrawSymbolTextBox and ImportGraphics: with doDrawShape.
    this.Go(this.PlaceAnchor, SCH_ACTIONS.placeSymbolAnchor.MakeEvent());
    this.Go(this.RepeatDrawItem, SCH_ACTIONS.repeatDrawItem.MakeEvent());
  }
}
