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
import { SYMBOL_EDITOR_CONTROL } from '../tools/symbol_editor_control.js';
import { SYMBOL_EDITOR_PIN_TOOL } from '../tools/symbol_editor_pin_tool.js';
import { SYMBOL_EDITOR_DRAWING_TOOLS } from '../tools/symbol_editor_drawing_tools.js';
import type { EDA_ITEM } from '@ziroeda/common/eda_item.js';
import type { KiDialogRequest } from '@ziroeda/common/kidialog.js';
import type { KiDialogResult } from '@ziroeda/common/kidialog_do_not_show.js';
import { wxID_CANCEL } from '@ziroeda/wx/menu.js';
import { SYMBOL_EDITOR_MOVE_TOOL } from '../tools/symbol_editor_move_tool.js';
import { LIB_SYMBOL_LIBRARY_MANAGER } from './lib_symbol_library_manager.js';
import { wxCopyFile, wxFileExists, wxRemoveFile } from '@ziroeda/wx/filefn.js';
import { niluuid, type KIID } from '@ziroeda/common/kiid.js';
import {
  DisplayErrorMessage,
  ShowKicadMessageDialog,
  type UnsavedChangesResult,
} from '@ziroeda/common/confirm.js';
import {
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from '@ziroeda/common/libraries/library_table.js';
import { NormalizePath } from '@ziroeda/common/env_paths.js';
import {
  GetUseGlobalTable,
  MakeFileDlgHookNewLibrary,
} from '@ziroeda/common/widgets/filedlg_hook_new_library.js';
import {
  KiCadSymbolLibFileExtension,
  kicadSymbolLibWildcard,
} from '@ziroeda/common/wildcards_and_files_ext.js';
import { Pgm } from '@ziroeda/common/pgm_base.js';
import type { ChooserFilter } from '@ziroeda/wx/filedlg.js';
import { wxICON_ERROR, wxOK } from '@ziroeda/wx/defs.js';
import { SCH_IO_MGR } from '../sch_io/sch_io_mgr.js';
import type { SYMBOL_LIBRARY_SAVE_AS_FILEDLG_HOOK } from '../widgets/symbol_library_save_as_filedlg_hook.js';
import { SYMBOL_EDITOR_UNDO_REDO_MIXIN } from './symbol_editor_undo_redo.js';
import { SYMBOL_EDITOR_FILES_MIXIN, SYMBOL_EDITOR_MIXIN } from './symbol_editor.js';
import { SYMBOL_EDITOR_IMPORT_EXPORT_MIXIN } from './symbol_editor_import_export.js';
import { applyMixins } from '@ziroeda/core/mixins.js';
import { LIB_ID } from '@ziroeda/common/lib_id.js';
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
  /**
   * `Kiway().Player( FRAME_SCH, false )->SaveSymbolToSchematic( *m_symbol, uuid )`: the edited
   * symbol back into the open schematic. False when no schematic editor is open.
   */
  saveSymbolToSchematic?(aSymbol: LIB_SYMBOL, aSchematicSymbolUUID: KIID): boolean;
  /**
   * `UnsavedChangesDialog( this, aMessage, aApplyToAll )`: Save / Discard / Cancel. With
   * \a aApplyToAll the dialog shows its "apply to all" box and reports it there.
   */
  unsavedChangesDialog?(
    aMessage: string,
    aApplyToAll?: { value: boolean },
  ): Promise<UnsavedChangesResult>;
  /**
   * `wxFileDialog( this, aTitle, aDefaultDir, aDefaultFile, aWildcard, aStyle )` with its
   * customize hook, then `GetPath()`. Null is wxID_CANCEL.
   */
  fileDialog?(
    aTitle: string,
    aDefaultDir: string,
    aDefaultFile: string,
    aWildcard: ChooserFilter | readonly ChooserFilter[],
    aStyle: number,
    aCustomizeHook?: SYMBOL_LIBRARY_SAVE_AS_FILEDLG_HOOK,
  ): Promise<string | null>;
  /** `SyncLibraries( aShowProgress, aPreloadCancelled, aForceRefresh )`: the tree rebuilt. */
  syncLibraries?(aShowProgress: boolean, aPreloadCancelled: boolean, aForceRefresh: string): void;
  /** `m_treePane->GetLibTree()->RefreshLibTree()`. */
  refreshLibTree?(): void;
  /** `GetLibTree()->GetSelectedLibIds( aSelection )`: every symbol / library selected. */
  getSelectedLibIds?(): LIB_ID[];
  /** `ReCreateMenuBar()` / `RecreateToolbars()`: the window's menu and toolbars rebuilt. */
  reCreateMenuBar?(): void;
  recreateToolbars?(): void;
  /** `FreezeLibraryTree()` / `ThawLibraryTree()`. */
  freezeLibraryTree?(): void;
  thawLibraryTree?(): void;
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
  /**
   * `GetLibTree()->GetSelectedLibId( aUnit )`: the symbol the library tree has selected, and in
   * \a aUnit the unit node's unit (0 for a symbol or library node).
   */
  getTreeLibId?(aUnit?: { value: number }): LIB_ID | null;
  /** `UpdateLibraryTree( aTreeItem, aSymbol )`: the tree node shows the symbol's new name/text. */
  updateLibraryTree?(aLibId: LIB_ID, aSymbol: LIB_SYMBOL): void;
  /** `ToggleProperties()`: the properties pane shown or hidden, its width remembered. */
  toggleProperties?(): void;
}

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: TS multiple inheritance (see libs/core/mixins.ts)
export interface SYMBOL_EDIT_FRAME
  extends SYMBOL_EDITOR_UNDO_REDO_MIXIN,
    SYMBOL_EDITOR_MIXIN,
    SYMBOL_EDITOR_FILES_MIXIN,
    SYMBOL_EDITOR_IMPORT_EXPORT_MIXIN {}

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: TS multiple inheritance (see libs/core/mixins.ts)
export class SYMBOL_EDIT_FRAME extends SCH_BASE_FRAME {
  /** `Kiface().KifaceSettings()`: SYMBOL_EDITOR_SETTINGS. */
  override config(): APP_SETTINGS_BASE | null {
    return symbolEditorKifaceSettings();
  }

  private readonly hooks: SYMBOL_EDIT_FRAME_HOOKS;

  /** `m_libMgr`: the library buffers the editor works on. */
  private readonly m_libMgr: LIB_SYMBOL_LIBRARY_MANAGER;
  /**
   * `m_dummyScreen`: the screen shown when no symbol is loaded. Public for the frame's mixins
   * (symbol_editor.ts), which are this class split across files.
   */
  readonly m_dummyScreen = new SCH_SCREEN();
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

  /**
   * `GetTreeLIBID( aUnit )` (symbol_edit_frame.cpp:1328): the library tree's selection. The tree is
   * the window's; with none, an empty LIB_ID.
   */
  GetTreeLIBID(aUnit?: { value: number }): LIB_ID {
    return this.hooks.getTreeLibId?.(aUnit) ?? new LIB_ID();
  }

  /**
   * `GetTargetLibId()` (symbol_edit_frame.cpp:1359): the tree's selection when the tree is shown,
   * else (or when it names no library) the loaded symbol's.
   */
  override GetTargetLibId(): LIB_ID {
    let id = new LIB_ID();

    if (this.IsLibraryTreeShown()) id = this.GetTreeLIBID();

    if (id.GetLibNickname() === '' && this.m_symbol) id = this.m_symbol.GetLibId();

    return id;
  }

  /** `ToggleProperties()` (:790): the window's AUI pane. */
  override ToggleProperties(): void {
    this.hooks.toggleProperties?.();
  }

  /** `GetTreeLIBIDs( aSelection )` (:1339): the tree's selection, how many. */
  GetTreeLIBIDs(aSelection: LIB_ID[]): number {
    aSelection.push(...(this.hooks.getSelectedLibIds?.() ?? []));
    return aSelection.length;
  }

  /** `GetSelectedLibIds()` (:1373). */
  GetSelectedLibIds(): LIB_ID[] {
    const ids: LIB_ID[] = [];
    this.GetTreeLIBIDs(ids);
    return ids;
  }

  /** `GetTreeSelectionCount()` (:1334). */
  GetTreeSelectionCount(): number {
    return this.hooks.getSelectedLibIds?.().length ?? 0;
  }

  /**
   * `IsCurrentSymbol( aLibId )` (:1536): whether \a aLibId is the symbol shown - an alias by its
   * root.
   */
  IsCurrentSymbol(aLibId: LIB_ID): boolean {
    // This will return the root symbol of any alias
    const symbol = this.m_libMgr.GetBufferedSymbol(
      aLibId.GetLibItemName(),
      aLibId.GetLibNickname(),
    );

    // Now we can compare the libId of the current symbol and the root symbol
    return !!symbol && !!this.m_symbol && symbol.GetLibId().equals(this.m_symbol.GetLibId());
  }

  /** `UpdateLibraryTree( aTreeItem, aSymbol )`: the window's tree. */
  UpdateLibraryTree(aLibId: LIB_ID, aSymbol: LIB_SYMBOL): void {
    this.hooks.updateLibraryTree?.(aLibId, aSymbol);
  }

  /** `m_schematicSymbolUUID`: the schematic symbol a symbol from the schematic came from. */
  m_schematicSymbolUUID: KIID = niluuid;

  /**
   * `UnsavedChangesDialog( this, aMessage, aApplyToAll )` (common/confirm.cpp): the window's;
   * with none the answer is Cancel, the one that loses nothing.
   */
  UnsavedChangesDialog(
    aMessage: string,
    aApplyToAll?: { value: boolean },
  ): Promise<UnsavedChangesResult> {
    return this.hooks.unsavedChangesDialog?.(aMessage, aApplyToAll) ?? Promise.resolve('cancel');
  }

  /** `wxFileDialog( ... ).ShowModal()` then `GetPath()`: the window's; null is Cancel. */
  FileDialog(
    aTitle: string,
    aDefaultDir: string,
    aDefaultFile: string,
    aWildcard: ChooserFilter | readonly ChooserFilter[],
    aStyle: number,
    aCustomizeHook?: SYMBOL_LIBRARY_SAVE_AS_FILEDLG_HOOK,
  ): Promise<string | null> {
    return (
      this.hooks.fileDialog?.(
        aTitle,
        aDefaultDir,
        aDefaultFile,
        aWildcard,
        aStyle,
        aCustomizeHook,
      ) ?? Promise.resolve(null)
    );
  }

  /**
   * `Kiway().Player( FRAME_SCH, false )->SaveSymbolToSchematic( aSymbol, aUuid )`: false when no
   * schematic editor is open to take it.
   */
  SaveSymbolToSchematic(aSymbol: LIB_SYMBOL, aSchematicSymbolUUID: KIID): boolean {
    return this.hooks.saveSymbolToSchematic?.(aSymbol, aSchematicSymbolUUID) ?? false;
  }

  /**
   * `getTargetSymbol()` (symbol_edit_frame.cpp:1345): the symbol selected in the tree when it is
   * shown, else the one being edited.
   */
  getTargetSymbol(): LIB_SYMBOL | null {
    if (this.IsLibraryTreeShown()) {
      const libId = this.GetTreeLIBID();

      if (libId.IsValid())
        return this.m_libMgr.GetSymbol(libId.GetLibItemName(), libId.GetLibNickname());
    }

    return this.m_symbol;
  }

  /**
   * `AddLibraryFile( aCreateNew )` (symbol_edit_frame.cpp:1180): a library file chosen - or a new
   * one made - and added to the global or project table; its full path, or empty.
   */
  async AddLibraryFile(aCreateNew: boolean): Promise<string> {
    const fn = { value: this.m_libMgr.GetUniqueLibraryName() };
    const tableChooser = MakeFileDlgHookNewLibrary(true);

    if (
      !(await this.LibraryFileBrowser(
        aCreateNew ? 'New Symbol Library' : 'Add Symbol Library',
        !aCreateNew,
        fn,
        [kicadSymbolLibWildcard()],
        KiCadSymbolLibFileExtension,
        false,
        Pgm().GetSettingsManager().IsProjectOpenNotDummy() ? tableChooser : undefined,
      ))
    ) {
      return '';
    }

    const scope = GetUseGlobalTable(tableChooser)
      ? LIBRARY_TABLE_SCOPE.GLOBAL
      : LIBRARY_TABLE_SCOPE.PROJECT;

    const manager = Pgm().GetLibraryManager();

    if (!manager.Table(LIBRARY_TABLE_TYPE.SYMBOL, scope)) return ''; // wxCHECK

    // fn.GetName()
    const leaf = fn.value.slice(fn.value.lastIndexOf('/') + 1);
    const libName = leaf.includes('.') ? leaf.slice(0, leaf.lastIndexOf('.')) : leaf;

    if (libName === '') return '';

    const adapter = SymbolLibAdapter(this.Prj());

    if (adapter.HasLibrary(libName)) {
      DisplayErrorMessage(`Library '${libName}' already exists.`);
      return '';
    }

    if (aCreateNew) {
      // The file browser already asked to overwrite, so drop the old file here.
      // CreateLibrary fails on an existing path.
      if (wxFileExists(fn.value) && !wxRemoveFile(fn.value)) {
        DisplayErrorMessage(
          `Could not overwrite the library file '${fn.value}'.\n` +
            'Make sure you have write permissions and try again.',
        );
        return '';
      }

      if (!this.m_libMgr.CreateLibrary(fn.value, scope)) {
        DisplayErrorMessage(
          `Could not create the library file '${fn.value}'.\n` +
            'Make sure you have write permissions and try again.',
        );
        return '';
      }
    } else {
      if (!this.m_libMgr.AddLibrary(fn.value, scope)) {
        DisplayErrorMessage('Could not open the library file.');
        return '';
      }
    }

    let success = true;

    // Tables are reinitialized by m_libMgr->AddLibrary(). So reinit table reference.
    const table = manager.Table(LIBRARY_TABLE_TYPE.SYMBOL, scope);

    if (!table) return ''; // wxCHECK

    const result = table.Save();

    if (!result.ok) {
      await ShowKicadMessageDialog({
        message: 'Error saving library table.',
        caption: 'File Save Error',
        style: wxOK | wxICON_ERROR,
        extended: result.error.message,
      });
      success = false;
    }

    if (success) adapter.LoadOne(libName);

    this.SyncLibraries(false);
    this.SetCurLib(libName);

    // GetLibTree()->SelectLibId( libId ); GetLibTree()->CenterLibId( libId ): the window's tree.
    this.FocusOnLibId(new LIB_ID(libName, ''));

    return fn.value;
  }

  /** `getTargetLib()` (symbol_edit_frame.cpp:1381). */
  getTargetLib(): string {
    return this.GetTargetLibId().GetLibNickname();
  }

  /**
   * `backupFile( aOriginalFile, aBackupExt )` (symbol_edit_frame.cpp:1507): copy the file beside
   * itself under \a aBackupExt before it is overwritten.
   */
  backupFile(aOriginalFile: string, aBackupExt: string): boolean {
    if (wxFileExists(aOriginalFile)) {
      // wxFileName backupFileName( aOriginalFile ); backupFileName.SetExt( aBackupExt );
      const dot = aOriginalFile.lastIndexOf('.');
      const slash = aOriginalFile.lastIndexOf('/');
      const stem = dot > slash ? aOriginalFile.slice(0, dot) : aOriginalFile;
      const backupFileName = `${stem}.${aBackupExt}`;

      if (wxFileExists(backupFileName)) wxRemoveFile(backupFileName);

      if (!wxCopyFile(aOriginalFile, backupFileName)) {
        DisplayErrorMessage(`Failed to save backup to '${backupFileName}'.`);
        return false;
      }
    }

    return true;
  }

  /** `SyncLibraries( aShowProgress, aPreloadCancelled, aForceRefresh )` (:1387): the window's tree. */
  SyncLibraries(aShowProgress: boolean, aPreloadCancelled = false, aForceRefresh = ''): void {
    this.hooks.syncLibraries?.(aShowProgress, aPreloadCancelled, aForceRefresh);
  }

  /** `m_treePane->GetLibTree()->RefreshLibTree()`. */
  RefreshLibTree(): void {
    this.hooks.refreshLibTree?.();
  }

  /** `ReCreateMenuBar()`: the window's. */
  ReCreateMenuBar(): void {
    this.hooks.reCreateMenuBar?.();
  }

  /** `RecreateToolbars()`: the window's. */
  RecreateToolbars(): void {
    this.hooks.recreateToolbars?.();
  }

  FreezeLibraryTree(): void {
    this.hooks.freezeLibraryTree?.();
  }

  ThawLibraryTree(): void {
    this.hooks.thawLibraryTree?.();
  }

  /** `UpdateMsgPanel()` (symbol_edit_frame.h:262). */
  override UpdateMsgPanel(): void {
    this.UpdateSymbolMsgPanelInfo();
  }

  /**
   * `addLibTableEntry( aLibFile, aScope )` (symbol_edit_frame.cpp:2095): a row for \a aLibFile in
   * the scope's table, its nickname made unique, the table saved.
   */
  addLibTableEntry(aLibFile: string, aScope = LIBRARY_TABLE_SCOPE.GLOBAL): boolean {
    const leaf = aLibFile.slice(aLibFile.lastIndexOf('/') + 1);
    const fnName = leaf.includes('.') ? leaf.slice(0, leaf.lastIndexOf('.')) : leaf;
    let libNickname = fnName;
    const adapter = SymbolLibAdapter(this.Prj());
    const manager = Pgm().GetLibraryManager();
    const envVars = Pgm().GetLocalEnvVariables();

    if (adapter.HasLibrary(libNickname)) {
      let suffix = 1;

      while (adapter.HasLibrary(libNickname)) {
        libNickname = `${fnName}${suffix}`;
        suffix += 1;
      }
    }

    const table = manager.Table(LIBRARY_TABLE_TYPE.SYMBOL, aScope);

    if (!table) return false; // wxCHECK

    const row = table.InsertRow();

    row.SetNickname(libNickname);

    // We cannot normalize against the current project path when saving to global table.
    const normalizedPath = NormalizePath(
      aLibFile,
      envVars,
      aScope === LIBRARY_TABLE_SCOPE.PROJECT ? this.Prj().GetProjectPath() : '',
    );

    row.SetURI(normalizedPath);
    row.SetType(SCH_IO_MGR.ShowType(SCH_IO_MGR.GuessPluginTypeFromLibPath(normalizedPath)));

    const result = table.Save();

    if (!result.ok) {
      void ShowKicadMessageDialog({
        message: 'Error saving library table.',
        caption: 'File Save Error',
        style: wxOK | wxICON_ERROR,
        extended: result.error.message,
      });

      return false;
    }

    // manager.ReloadTables( aScope, { SYMBOL } ): the table was edited in memory and is the
    // manager's own, so there is nothing to read back.
    adapter.LoadOne(libNickname);

    return true;
  }

  /**
   * `replaceLibTableEntry( aLibNickname, aLibFile )` (symbol_edit_frame.cpp:2156): point the
   * library's existing row, global first, at \a aLibFile.
   */
  replaceLibTableEntry(aLibNickname: string, aLibFile: string): boolean {
    const adapter = SymbolLibAdapter(this.Prj());
    const manager = Pgm().GetLibraryManager();
    let table = null;
    let scope = LIBRARY_TABLE_SCOPE.GLOBAL;

    // Check the global library table first because checking the project library table
    // checks the global library table as well due to library chaining.
    if (manager.GetRow(LIBRARY_TABLE_TYPE.SYMBOL, aLibNickname, scope)) {
      table = manager.Table(LIBRARY_TABLE_TYPE.SYMBOL, scope);
    } else {
      scope = LIBRARY_TABLE_SCOPE.PROJECT;

      if (manager.GetRow(LIBRARY_TABLE_TYPE.SYMBOL, aLibNickname, scope))
        table = manager.Table(LIBRARY_TABLE_TYPE.SYMBOL, scope);
    }

    if (!table) return false; // wxCHECK

    const row = manager.GetRow(LIBRARY_TABLE_TYPE.SYMBOL, aLibNickname, scope);

    if (!row) return false; // wxCHECK

    const envVars = Pgm().GetLocalEnvVariables();
    const projectPath = scope === LIBRARY_TABLE_SCOPE.PROJECT ? this.Prj().GetProjectPath() : '';
    const normalizedPath = NormalizePath(aLibFile, envVars, projectPath);

    row.SetURI(normalizedPath);
    row.SetType('KiCad');

    const result = table.Save();

    if (!result.ok) {
      void ShowKicadMessageDialog({
        message: 'Error saving library table.',
        caption: 'File Save Error',
        style: wxOK | wxICON_ERROR,
        extended: result.error.message,
      });

      return false;
    }

    adapter.LoadOne(aLibNickname);

    return true;
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
    this.m_toolManager.RegisterTool(new SYMBOL_EDITOR_DRAWING_TOOLS());
    this.m_toolManager.RegisterTool(new SCH_POINT_EDITOR());
    this.m_toolManager.RegisterTool(new SCH_FIND_REPLACE_TOOL());
    this.m_toolManager.RegisterTool(new SYMBOL_EDITOR_MOVE_TOOL());
    this.m_toolManager.RegisterTool(new SYMBOL_EDITOR_EDIT_TOOL());
    // LIBRARY_EDITOR_CONTROL: with the library tree (stage 5).
    this.m_toolManager.RegisterTool(new SYMBOL_EDITOR_CONTROL());
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
  // Public for the frame's mixins (symbol_editor.ts), as m_symbol is.
  m_unit = 1;
  m_bodyStyle = 1;

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

applyMixins(SYMBOL_EDIT_FRAME, [
  SYMBOL_EDITOR_UNDO_REDO_MIXIN,
  SYMBOL_EDITOR_MIXIN,
  SYMBOL_EDITOR_FILES_MIXIN,
  SYMBOL_EDITOR_IMPORT_EXPORT_MIXIN,
]);
