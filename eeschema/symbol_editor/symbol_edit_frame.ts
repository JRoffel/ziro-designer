// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `SYMBOL_EDIT_FRAME` (eeschema/symbol_editor/symbol_edit_frame.h), on
 * `SCH_BASE_FRAME` — so far its KIWAY half: the mail it takes in. `SymbolEditor.tsx` is the window
 * and owns the library tree and canvas each command changes, so the frame
 * reaches them through {@link SYMBOL_EDIT_FRAME_HOOKS}.
 */
import type { LIB_SYMBOL } from '../lib_symbol.js';
import { ACTIONS } from '@ziroeda/common/tool/actions.js';
import { COMMON_CONTROL } from '@ziroeda/common/tool/common_control.js';
import { COMMON_TOOLS } from '@ziroeda/common/tool/common_tools.js';
import { EMBED_TOOL } from '@ziroeda/common/tool/embed_tool.js';
import { PICKER_TOOL } from '@ziroeda/common/tool/picker_tool.js';
import { PROPERTIES_TOOL } from '@ziroeda/common/tool/properties_tool.js';
import { RESET_REASON } from '@ziroeda/common/tool/tool_base.js';
import { TOOL_DISPATCHER } from '@ziroeda/common/tool/tool_dispatcher.js';
import { TOOL_MANAGER } from '@ziroeda/common/tool/tool_manager.js';
import { ZOOM_TOOL } from '@ziroeda/common/tool/zoom_tool.js';
import { RSTRING_T } from '@ziroeda/common/project.js';
import { VIEW_UPDATE_FLAGS } from '@ziroeda/common/view/view_item.js';
import type { BASE_SCREEN } from '@ziroeda/common/base_screen.js';
import type { wxEvent } from '@ziroeda/wx/wx_event.js';
import { SymbolLibAdapter } from '../project_sch.js';
import { SCH_SCREEN } from '../sch_screen.js';
import { SCH_FIND_REPLACE_TOOL } from '../tools/sch_find_replace_tool.js';
import { SCH_INSPECTION_TOOL } from '../tools/sch_inspection_tool.js';
import { SCH_POINT_EDITOR } from '../tools/sch_point_editor.js';
import { SCH_SELECTION_TOOL } from '../tools/sch_selection_tool.js';
import { SYMBOL_EDITOR_EDIT_TOOL } from '../tools/symbol_editor_edit_tool.js';
import { SYMBOL_EDITOR_PIN_TOOL } from '../tools/symbol_editor_pin_tool.js';
import type { EDA_ITEM } from '@ziroeda/common/eda_item.js';
import type { KiDialogRequest } from '@ziroeda/common/kidialog.js';
import type { KiDialogResult } from '@ziroeda/common/kidialog_do_not_show.js';
import { wxID_CANCEL } from '@ziroeda/wx/menu.js';
import { SYMBOL_EDITOR_MOVE_TOOL } from '../tools/symbol_editor_move_tool.js';
import { LIB_SYMBOL_LIBRARY_MANAGER } from './lib_symbol_library_manager.js';
import { SYMBOL_EDITOR_UNDO_REDO_MIXIN } from './symbol_editor_undo_redo.js';
import { applyMixins } from '@ziroeda/core/mixins.js';
import type { LIB_ID } from '@ziroeda/common/lib_id.js';
import type { SCH_SYMBOL } from '../sch_symbol.js';
import {
  currentSymbolEditorSettings,
  symbolEditorKifaceSettings,
  type SymbolEditorSettings,
} from './symbol_editor_settings.js';
import type { APP_SETTINGS_BASE } from '@ziroeda/common/settings/app_settings.js';
import { LIB_EDIT_FRAME_NAME } from '@ziroeda/common/eda_draw_frame.js';
import { UNDO_REDO_LIST } from '@ziroeda/common/eda_base_frame.js';
import { FRAME_T } from '@ziroeda/common/frame_type.js';
import type { KIWAY_MAIL_EVENT } from '@ziroeda/common/kiway_mail.js';
import { MAIL_T } from '@ziroeda/common/mail_type.js';
import { SCH_BASE_FRAME } from '../sch_base_frame.js';

export interface SYMBOL_EDIT_FRAME_HOOKS {
  /**
   * `MAIL_LIB_EDIT`'s body: resolve the library URI through the symbol
   * library table (refusing one no row names, or a disabled one, with
   * upstream's messages), make it the current library and show it.
   */
  libEdit(aUri: string): void;
  /**
   * `LoadSymbolFromSchematic( aSymbol )` (symbol_edit_frame.cpp): open a schematic symbol's
   * library symbol for editing in place. The window's symbol editor does it.
   */
  loadSymbolFromSchematic?(aSymbol: SCH_SYMBOL): void;
  /** `LoadSymbol( aLibId, aUnit, aBodyStyle )` (symbol_edit_frame.cpp): open a library symbol. */
  loadSymbol?(aLibId: LIB_ID, aUnit: number, aBodyStyle: number): boolean;
  /** `IsLibraryTreeShown()`. */
  isLibraryTreeShown?(): boolean;
  /** `ToggleLibraryTree()`. */
  toggleLibraryTree?(): void;
  /** `FocusOnLibId( aLibID )`: the library tree selects and shows it. */
  focusOnLibId?(aLibId: LIB_ID): void;
  /** `RebuildSymbolUnitAndBodyStyleLists()`: the unit and body style choosers. */
  rebuildSymbolUnitAndBodyStyleLists?(): void;
  /** `UpdateTitle()`. */
  updateTitle?(): void;
  /** The window's dialogs by class name (DIALOG_PIN_PROPERTIES, ...): wxID_OK / wxID_CANCEL. */
  showModal?(aDialog: string, aItems: readonly EDA_ITEM[], aArg?: unknown): Promise<number>;
  /** `KIDIALOG( frame, ... ).ShowModal()`. */
  askKiDialog?(aRequest: KiDialogRequest): Promise<KiDialogResult>;
}

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: TS multiple inheritance (see libs/core/mixins.ts)
export interface SYMBOL_EDIT_FRAME extends SYMBOL_EDITOR_UNDO_REDO_MIXIN {}

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: TS multiple inheritance (see libs/core/mixins.ts)
export class SYMBOL_EDIT_FRAME extends SCH_BASE_FRAME {
  /** `Kiface().KifaceSettings()`: SYMBOL_EDITOR_SETTINGS. */
  override config(): APP_SETTINGS_BASE | null {
    return symbolEditorKifaceSettings();
  }

  private readonly hooks: SYMBOL_EDIT_FRAME_HOOKS;

  /** `m_libMgr`: the library buffers the editor works on. */
  private readonly m_libMgr: LIB_SYMBOL_LIBRARY_MANAGER;
  /** `m_dummyScreen`: the screen shown when no symbol is loaded. */
  private readonly m_dummyScreen = new SCH_SCREEN();
  /** `m_SyncPinEdit`: pins of interchangeable units are edited together. */
  m_SyncPinEdit = false;

  constructor(hooks: SYMBOL_EDIT_FRAME_HOOKS) {
    super(FRAME_T.FRAME_SCH_SYMBOL_EDITOR);
    this.hooks = hooks;
    this.m_libMgr = new LIB_SYMBOL_LIBRARY_MANAGER(this);
    this.SetScreen(this.m_dummyScreen);
  }

  /** `FocusOnLibId( aLibID )` (:1490). */
  FocusOnLibId(aLibId: LIB_ID): void {
    this.hooks.focusOnLibId?.(aLibId);
  }

  /** `RebuildSymbolUnitAndBodyStyleLists()` (:735): the window's choosers. */
  RebuildSymbolUnitAndBodyStyleLists(): void {
    this.hooks.rebuildSymbolUnitAndBodyStyleLists?.();
  }

  /** `UpdateTitle()`. */
  UpdateTitle(): void {
    this.hooks.updateTitle?.();
  }

  /** `SynchronizePins()` (:1174): pins of interchangeable units are edited together. */
  SynchronizePins(): boolean {
    return (
      this.m_SyncPinEdit &&
      !!this.m_symbol &&
      this.m_symbol.IsMultiUnit() &&
      !this.m_symbol.UnitsLocked()
    );
  }

  /** The window's half of the dialogs the symbol editor opens; with no window, cancelled. */
  override ShowModalDialog(
    aDialog: string,
    aItems: readonly EDA_ITEM[],
    aArg?: unknown,
  ): Promise<number> {
    return this.hooks.showModal?.(aDialog, aItems, aArg) ?? Promise.resolve(wxID_CANCEL);
  }

  /** `KIDIALOG( this, ... ).ShowModal()`; with no window, cancelled. */
  ShowKiDialog(aRequest: KiDialogRequest): Promise<KiDialogResult> {
    return this.hooks.askKiDialog?.(aRequest) ?? Promise.resolve('cancel');
  }

  /** `GetLibManager()`. */
  GetLibManager(): LIB_SYMBOL_LIBRARY_MANAGER {
    return this.m_libMgr;
  }

  /** `setupTools()` (symbol_edit_frame.cpp:413-446), with the tools ported so far. */
  setupTools(): void {
    const canvas = this.GetCanvas()!;

    // Create the manager and dispatcher & route draw panel events to the dispatcher
    this.m_toolManager = new TOOL_MANAGER();
    this.m_toolManager.SetEnvironment(
      this.GetScreen(),
      canvas.GetView(),
      canvas.GetViewControls(),
      this.config(),
      this,
    );
    // The frame's wxEVT_IDLE follows each canvas event: a page has no idle event of its own.
    const frame = this;
    this.m_toolDispatcher = new (class extends TOOL_DISPATCHER {
      override DispatchWxEvent(aEvent: wxEvent): void {
        super.DispatchWxEvent(aEvent);
        frame.OnIdle();
      }
    })(this.m_toolManager);

    // Register tools
    this.m_toolManager.RegisterTool(new COMMON_CONTROL());
    this.m_toolManager.RegisterTool(new COMMON_TOOLS());
    this.m_toolManager.RegisterTool(new ZOOM_TOOL());
    this.m_toolManager.RegisterTool(new SCH_SELECTION_TOOL());
    this.m_toolManager.RegisterTool(new PICKER_TOOL());
    this.m_toolManager.RegisterTool(new SCH_INSPECTION_TOOL());
    this.m_toolManager.RegisterTool(new SYMBOL_EDITOR_PIN_TOOL());
    // SYMBOL_EDITOR_DRAWING_TOOLS: stage 3.
    this.m_toolManager.RegisterTool(new SCH_POINT_EDITOR());
    this.m_toolManager.RegisterTool(new SCH_FIND_REPLACE_TOOL());
    this.m_toolManager.RegisterTool(new SYMBOL_EDITOR_MOVE_TOOL());
    this.m_toolManager.RegisterTool(new SYMBOL_EDITOR_EDIT_TOOL());
    // LIBRARY_EDITOR_CONTROL and
    // SYMBOL_EDITOR_CONTROL: stage 4.
    this.m_toolManager.RegisterTool(new PROPERTIES_TOOL());
    this.m_toolManager.RegisterTool(new EMBED_TOOL());
    this.m_toolManager.InitTools();

    // Run the selection tool, it is supposed to be always active
    this.m_toolManager.InvokeTool('common.InteractiveSelection');

    canvas.SetEventDispatcher(this.m_toolDispatcher);
  }

  /** `GetCurLib()` (symbol_edit_frame.cpp:909): the project's current library, if it still exists. */
  GetCurLib(): string {
    const prj = this.Prj();
    let libNickname = prj?.GetRString(RSTRING_T.SCH_LIBEDIT_CUR_LIB) ?? '';

    if (libNickname !== '' && !SymbolLibAdapter(prj).HasLibrary(libNickname)) {
      prj?.SetRString(RSTRING_T.SCH_LIBEDIT_CUR_LIB, '');
      libNickname = '';
    }

    return libNickname;
  }

  /** `SetCurLib( aLibNickname )` (:926): returns the previous one. */
  SetCurLib(aLibNickname: string): string {
    const old = this.GetCurLib();
    const prj = this.Prj();

    if (aLibNickname === '' || !SymbolLibAdapter(prj).HasLibrary(aLibNickname))
      prj?.SetRString(RSTRING_T.SCH_LIBEDIT_CUR_LIB, '');
    else prj?.SetRString(RSTRING_T.SCH_LIBEDIT_CUR_LIB, aLibNickname);

    return old;
  }

  /**
   * `SetCurSymbol( aSymbol, aUpdateZoom )` (:939-1105): take ownership of \a aSymbol and show it.
   * The library tree's selection and the info bar messages are the window's (stage 5).
   */
  SetCurSymbol(aSymbol: LIB_SYMBOL | null, aUpdateZoom: boolean): void {
    if (!this.m_toolManager) return; // wxCHECK

    this.m_toolManager.RunAction(ACTIONS.selectionClear);
    this.GetCanvas()?.GetView().Clear();

    this.m_symbol = aSymbol;

    // retain in case this wxFrame is re-opened later on the same PROJECT
    this.Prj()?.SetRString(RSTRING_T.SCH_LIBEDIT_CUR_SYMBOL, aSymbol ? aSymbol.GetName() : '');

    // Ensure synchronized pin edit can be enabled only symbols with interchangeable units
    this.m_SyncPinEdit =
      !!aSymbol && aSymbol.IsRoot() && aSymbol.IsMultiUnit() && !aSymbol.UnitsLocked();

    this.m_toolManager.ResetTools(RESET_REASON.MODEL_RELOAD);

    this.applyRenderSettings();
    this.GetCanvas()?.DisplaySymbol(this.m_symbol);
    this.GetCanvas()?.GetView().HideDrawingSheet();
    this.GetCanvas()?.GetView().ClearHiddenFlags();

    if (aUpdateZoom) this.m_toolManager.RunAction(ACTIONS.zoomFitScreen);

    this.GetCanvas()?.Refresh();
  }

  /** The render settings' unit, body style and disabled states, as SetCurSymbol and RebuildView set them. */
  private applyRenderSettings(): void {
    const settings = this.GetRenderSettings();

    if (!settings) return;

    settings.m_ShowUnit = this.m_unit;
    settings.m_ShowBodyStyle = this.m_bodyStyle;
    settings.m_ShowDisabled = this.IsSymbolFromLegacyLibrary() && !this.IsSymbolFromSchematic();
    settings.m_ShowGraphicsDisabled = this.IsSymbolAlias() && !this.IsSymbolFromSchematic();
  }

  /** `SetUnit( aUnit )` (:1131). */
  SetUnit(aUnit: number): void {
    const symbol = this.GetCurSymbol();

    if (!symbol || aUnit <= 0 || aUnit > symbol.GetUnitCount()) return; // wxCHECK

    if (this.m_unit === aUnit) return;

    this.m_toolManager?.RunAction(ACTIONS.cancelInteractive);
    this.m_toolManager?.RunAction(ACTIONS.selectionClear);

    this.m_unit = aUnit;

    this.m_toolManager?.ResetTools(RESET_REASON.MODEL_RELOAD);
    this.RebuildView();
  }

  /** `SetBodyStyle( aBodyStyle )` (:1152). */
  SetBodyStyle(aBodyStyle: number): void {
    const symbol = this.GetCurSymbol();

    if (!symbol || aBodyStyle <= 0 || aBodyStyle > symbol.GetBodyStyleCount()) return; // wxCHECK

    if (this.m_bodyStyle === aBodyStyle) return;

    this.m_toolManager?.RunAction(ACTIONS.cancelInteractive);
    this.m_toolManager?.RunAction(ACTIONS.selectionClear);

    this.m_bodyStyle = aBodyStyle;

    this.m_toolManager?.ResetTools(RESET_REASON.MODEL_RELOAD);
    this.RebuildView();
  }

  /** `RebuildView()` (:1631). */
  RebuildView(): void {
    this.applyRenderSettings();
    this.GetCanvas()?.DisplaySymbol(this.m_symbol);
    this.GetCanvas()?.GetView().HideDrawingSheet();
    this.GetCanvas()?.GetView().ClearHiddenFlags();

    // Let tools add things to the view if necessary
    this.m_toolManager?.ResetTools(RESET_REASON.MODEL_RELOAD);

    this.GetCanvas()?.GetView().UpdateAllItems(VIEW_UPDATE_FLAGS.ALL);
    this.GetCanvas()?.Refresh();
  }

  /** `OnModify()` (:1112): the screen is modified and the buffer takes the symbol. */
  override OnModify(): void {
    super.OnModify();

    this.GetScreen()?.SetContentModified();

    if (!this.IsSymbolFromSchematic()) this.storeCurrentSymbol();
  }

  /** `storeCurrentSymbol()` (:1529): the edited symbol into the library buffer. */
  protected storeCurrentSymbol(): void {
    if (this.m_symbol && this.GetCurLib() !== '' && this.GetScreen()?.IsContentModified())
      this.m_libMgr.UpdateSymbol(this.m_symbol, this.GetCurLib()); // UpdateSymbol() makes a copy
  }

  /** `SetScreen( aScreen )` (:1621): tools add things to the view for the new screen. */
  override SetScreen(aScreen: BASE_SCREEN | null): void {
    super.SetScreen(aScreen);

    // Let tools add things to the view if necessary
    this.m_toolManager?.ResetTools(RESET_REASON.MODEL_RELOAD);
  }

  /** `ClearUndoORRedoList( whichList, aItemCount )` (:1939): the oldest \a aItemCount, or all. */
  override ClearUndoORRedoList(whichList: UNDO_REDO_LIST, aItemCount = -1): void {
    if (aItemCount === 0) return;

    const list = whichList === UNDO_REDO_LIST.UNDO_LIST ? this.m_undoList : this.m_redoList;

    if (aItemCount < 0) {
      list.ClearCommandList();
    } else {
      for (let ii = 0; ii < aItemCount; ii++) {
        if (list.m_CommandsList.length === 0) break;

        const curr_cmd = list.m_CommandsList.shift()!;

        curr_cmd.ClearListAndDeleteItems(() => {});
      }
    }
  }

  /** `emptyScreen()` (:1546): no library, no symbol, the dummy screen. */
  emptyScreen(): void {
    this.SetCurLib('');
    this.SetCurSymbol(null, false);
    this.SetScreen(this.m_dummyScreen);
    this.ClearUndoRedoList();
    this.m_toolManager?.RunAction(ACTIONS.zoomFitScreen);
  }

  // The live symbol editor's state (symbol_edit_frame.h): the symbol being edited and the unit and
  // body style shown. `m_symbol` is public for the frame's mixins (symbol_editor_undo_redo.ts),
  // which set it as upstream's split methods do.
  m_symbol: LIB_SYMBOL | null = null;
  private m_unit = 1;
  private m_bodyStyle = 1;

  /** `GetCurSymbol()`. */
  GetCurSymbol(): LIB_SYMBOL | null {
    return this.m_symbol;
  }

  /** `GetUnit()`. */
  GetUnit(): number {
    return this.m_unit;
  }

  /** `GetBodyStyle()`. */
  GetBodyStyle(): number {
    return this.m_bodyStyle;
  }

  /** `IsSymbolAlias()` (symbol_edit_frame.cpp:2225): the symbol is derived from another. */
  IsSymbolAlias(): boolean {
    return !!this.m_symbol && !this.m_symbol.IsRoot();
  }

  // `IsSymbolFromSchematic()` / `IsSymbolFromLegacyLibrary()` (symbol_edit_frame.{h:273,cpp:892}):
  // the window knows where its symbol came from and which library row holds it, and sets them.
  private m_isSymbolFromSchematic = false;
  private m_isSymbolFromLegacyLibrary = false;

  SetSymbolOrigin(aFromSchematic: boolean, aFromLegacyLibrary: boolean): void {
    this.m_isSymbolFromSchematic = aFromSchematic;
    this.m_isSymbolFromLegacyLibrary = aFromLegacyLibrary;
  }

  IsSymbolFromSchematic(): boolean {
    return this.m_isSymbolFromSchematic;
  }

  IsSymbolFromLegacyLibrary(): boolean {
    return !!this.m_symbol && this.m_isSymbolFromLegacyLibrary;
  }

  /** `IsSymbolEditable()` (symbol_edit_frame.cpp:2231). */
  IsSymbolEditable(): boolean {
    return !!this.m_symbol && (!this.IsSymbolFromLegacyLibrary() || this.IsSymbolFromSchematic());
  }

  /** `GetSettings()` (symbol_edit_frame.h:221): the frame's SYMBOL_EDITOR_SETTINGS. */
  GetSettings(): SymbolEditorSettings | null {
    return this.libeditconfig();
  }

  /** `GetShowInvisibleFields()` (symbol_edit_frame.cpp:2264): libeditconfig()->m_ShowHiddenFields. */
  GetShowInvisibleFields(): boolean {
    return currentSymbolEditorSettings().show_hidden_lib_fields;
  }

  /** `GetShowInvisiblePins()` (symbol_edit_frame.cpp:2271): libeditconfig()->m_ShowHiddenPins. */
  GetShowInvisiblePins(): boolean {
    return currentSymbolEditorSettings().show_hidden_lib_pins;
  }

  /** `LoadSymbolFromSchematic( aSymbol )`: the window's editor opens it. */
  LoadSymbolFromSchematic(aSymbol: SCH_SYMBOL): void {
    this.hooks.loadSymbolFromSchematic?.(aSymbol);
  }

  /** `LoadSymbol( aLibId, aUnit, aBodyStyle )`: false when the window cannot. */
  LoadSymbol(aLibId: LIB_ID, aUnit: number, aBodyStyle: number): boolean {
    return this.hooks.loadSymbol?.(aLibId, aUnit, aBodyStyle) ?? false;
  }

  /** `IsLibraryTreeShown()`. */
  override IsLibraryTreeShown(): boolean {
    return this.hooks.isLibraryTreeShown?.() ?? false;
  }

  /** `ToggleLibraryTree()`. */
  override ToggleLibraryTree(): void {
    this.hooks.toggleLibraryTree?.();
  }

  /** `LIB_EDIT_FRAME_NAME`, the name wx gives this frame. */
  override GetName(): string {
    return LIB_EDIT_FRAME_NAME;
  }

  /** `SYMBOL_EDIT_FRAME::KiwayMailIn` (symbol_edit_frame.cpp:1753). */
  override KiwayMailIn(mail: KIWAY_MAIL_EVENT): void {
    const payload = mail.GetPayload();

    switch (mail.Command()) {
      case MAIL_T.MAIL_LIB_EDIT:
        if (payload !== '') this.hooks.libEdit(payload);

        break;

      default:
        break;
    }
  }
}

applyMixins(SYMBOL_EDIT_FRAME, [SYMBOL_EDITOR_UNDO_REDO_MIXIN]);
