// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `eeschema/symbol_editor/symbol_editor.cpp`: the pieces of `SYMBOL_EDIT_FRAME`
 * that are plain data/logic rather than wx UI — the delete-symbol confirmation
 * prompts and the frame title. Merged into one file here because both are a
 * handful of lines split out of the same C++ file for testability; KiCad has
 * no `delete_symbol_prompt.cpp` or `frame_title.cpp` of its own.
 */

// ============================================================================
// Delete-symbol confirmation prompts
//
// What `SYMBOL_EDIT_FRAME::DeleteSymbolFromLibrary` asks before it deletes
// (`eeschema/symbol_editor/symbol_editor.cpp:1252-1301`).
//
// Two prompts, in this order, and **neither fires for an unmodified leaf
// symbol** — upstream deletes that one without asking at all. Ours always
// asked, with a string of our own invention ("Delete symbol 'R' from library
// 'Device'?"), and never warned that deleting a base takes its children.
//
// 1. MODIFIED (`:1261-1266`)
//
// ```cpp
// if( m_libMgr->IsSymbolModified( … )
//     && !IsOK( this, wxString::Format( _( "The symbol '%s' has been modified.\n"
//                                          "Do you want to remove it from the library?" ),
//                                       libId.GetUniStringLibItemName() ) ) )
//     continue;
// ```
//
// 2. HAS DERIVED SYMBOLS (`:1269-1286`)
//
// ```cpp
// wxString msg = _( "Deleting a base symbol will delete all symbols derived from it.\n\n" );
// msg += libId.GetLibItemName().wx_str() + _( " (base)\n" );
//
// for( const wxString& name : derived )
//     msg += name + wxT( "\n" );
// ```
//
// shown as a `KICAD_MESSAGE_DIALOG` titled "Warning", `wxYES_NO | wxICON_WARNING`,
// with `SetYesNoLabels( _( "Delete All Listed Symbols" ), _( "Cancel" ) )`.
//
// Both are `continue` on refusal — that symbol is skipped, the loop goes on.
// ============================================================================

/** One prompt to put in front of the user before a delete proceeds. */
export interface DeletePrompt {
  /** `wxMessageDialog`'s caption; upstream leaves the modified one to `IsOK`. */
  title?: string;
  /** The message body, newlines and all, exactly as upstream builds it. */
  message: string;
  /** `SetYesNoLabels`' first argument, where upstream sets one. */
  confirmLabel?: string;
  /** `SetYesNoLabels`' second argument. */
  cancelLabel?: string;
}

/**
 * The prompts for deleting `symName`, in the order upstream raises them.
 *
 * An empty array means delete without asking — which is what upstream does for
 * an unmodified symbol with no children.
 */
export function deleteSymbolPrompts(opts: {
  /** `libId.GetUniStringLibItemName()`. */
  symName: string;
  /** `m_libMgr->IsSymbolModified( … )`. */
  modified: boolean;
  /** `m_libMgr->GetDerivedSymbolNames( … )`, in the order it returns them. */
  derived: readonly string[];
}): DeletePrompt[] {
  const prompts: DeletePrompt[] = [];

  if (opts.modified) {
    prompts.push({
      message: `The symbol '${opts.symName}' has been modified.\nDo you want to remove it from the library?`,
    });
  }

  if (opts.derived.length > 0) {
    // `msg += libId.GetLibItemName().wx_str() + _( " (base)\n" )`, then one
    // line per derived name — each with its OWN trailing newline, so the body
    // ends with one.
    let message = 'Deleting a base symbol will delete all symbols derived from it.\n\n';
    message += `${opts.symName} (base)\n`;
    for (const name of opts.derived) message += `${name}\n`;
    prompts.push({
      title: 'Warning',
      message,
      confirmLabel: 'Delete All Listed Symbols',
      cancelLabel: 'Cancel',
    });
  }

  return prompts;
}

// ============================================================================
// Frame title
//
// `SYMBOL_EDIT_FRAME::UpdateTitle` (eeschema/symbol_editor/symbol_editor.cpp:58-88),
// row 3 of `docs/frame-titles.md`.
//
// The shape — star, document, suffixes, em dash, frame name — is shared and
// lives in `frameTitle()` in `ui/useDocumentTitle.ts`. This section states only
// the three decisions that are the symbol editor's own, and states nothing the
// shared function already states.
//
// The C++, in full:
//
//     wxString title;
//
//     if( GetCurSymbol() && IsSymbolFromSchematic() )
//     {
//         if( GetScreen() && GetScreen()->IsContentModified() )
//             title = wxT( "*" );
//
//         title += m_reference;
//         title += wxS( " " ) + _( "[from schematic]" );
//     }
//     else if( GetCurSymbol() )
//     {
//         if( GetScreen() && GetScreen()->IsContentModified() )
//             title = wxT( "*" );
//
//         title += UnescapeString( GetCurSymbol()->GetLibId().Format() );
//
//         if( m_libMgr && m_libMgr->LibraryExists( GetCurLib() )
//                 && m_libMgr->IsLibraryReadOnly( GetCurLib() ) )
//             title += wxS( " " ) + _( "[Read Only Library]" );
//     }
//     else
//     {
//         title = _( "[no symbol loaded]" );
//     }
//
//     title += wxT( " — " ) + _( "Symbol Editor" );
//
// Four things that are easy to get wrong, and ours had all four wrong:
//
//  - **The document is the symbol, never the project.** Ours printed
//    `Prj().GetProjectName()` where the LIB_ID goes, which is not a formatting
//    slip but the wrong document entirely: a user editing `Device:R` read
//    `MyProject`. `UpdateTitle` does not mention the project in any branch.
//  - **The read-only suffix is a different string here.** Five frames say
//    `[Read Only]`; this one alone says `[Read Only Library]`, because the
//    thing that is not writable is the library, not a file
//    (`docs/frame-titles.md` note C). {@link READ_ONLY_SUFFIX} is the wrong
//    constant to reach for.
//  - **There is no `[Unsaved]` branch**, unlike the footprint editor's. An
//    unsaved symbol still has a LIB_ID and takes the second branch.
//  - **The empty branch cannot carry a star.** `title = _( "[no symbol
//    loaded]" )` is an assignment, and the two `title = wxT( "*" )` lines are
//    both inside branches that ran already. So a modified library with no
//    symbol open reads `[no symbol loaded]`, never `*[no symbol loaded]`.
// ============================================================================

import { frameTitle, type FrameTitleParts } from '@ziroeda/common/use_document_title.js';
import { unescapeString } from '@ziroeda/common/string_utils.js';
import type { SYMBOL_EDIT_FRAME } from './symbol_edit_frame.js';
import { DisplayErrorMessage, OKOrCancelDialog } from '@ziroeda/common/confirm.js';
import { IO_ERROR } from '@ziroeda/common/exceptions.js';
import type { LIB_ID } from '@ziroeda/common/lib_id.js';
import {
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from '@ziroeda/common/libraries/library_table.js';
import { Pgm } from '@ziroeda/common/pgm_base.js';
import { RSTRING_T } from '@ziroeda/common/project.js';
import { ACTIONS } from '@ziroeda/common/tool/actions.js';
import { RESET_REASON } from '@ziroeda/common/tool/tool_base.js';
import { VIEW_UPDATE_FLAGS } from '@ziroeda/common/view/view_item.js';
import {
  KiCadSymbolLibFileExtension,
  kicadSymbolLibWildcard,
} from '@ziroeda/common/wildcards_and_files_ext.js';
import { wxFD_OVERWRITE_PROMPT, wxFD_SAVE } from '@ziroeda/wx/defs.js';
import { wxID_OK } from '@ziroeda/wx/menu.js';
import { LIB_SYMBOL } from '../lib_symbol.js';
import { SymbolLibAdapter } from '../project_sch.js';
import { SCH_FILE_T, SCH_IO_MGR } from '../sch_io/sch_io_mgr.js';
import type { SYMBOL_EDITOR_DRAWING_TOOLS } from '../tools/symbol_editor_drawing_tools.js';
import {
  SYMBOL_LIBRARY_SAVE_AS_FILEDLG_HOOK,
  SYMBOL_SAVEAS_TYPE,
} from '../widgets/symbol_library_save_as_filedlg_hook.js';

/** `_( "Symbol Editor" )`, the half after the dash. */
export const SYM_FRAME_NAME = 'Symbol Editor';

/** `_( "[no symbol loaded]" )` — symbol_editor.cpp:83. */
export const SYM_NO_DOCUMENT = '[no symbol loaded]';

/**
 * `_( "[Read Only Library]" )` — symbol_editor.cpp:79.
 *
 * Deliberately not `READ_ONLY_SUFFIX`: this frame is the only one of the
 * thirteen that says "Library" (`docs/frame-titles.md` note C), and collapsing
 * the two would silently retitle it.
 */
export const READ_ONLY_LIBRARY_SUFFIX = '[Read Only Library]';

/** `_( "[from schematic]" )` — symbol_editor.cpp:66. Frame 3 only. */
export const FROM_SCHEMATIC_SUFFIX = '[from schematic]';

export interface SymFrameTitleSpec {
  /**
   * `GetCurSymbol()`. False is the `[no symbol loaded]` branch, and it is the
   * guard on BOTH other branches — `IsSymbolFromSchematic()` alone does not
   * select the first one.
   */
  hasSymbol: boolean;
  /** `IsSymbolFromSchematic()`. */
  fromSchematic?: boolean;
  /**
   * `m_reference` — the document half of the from-schematic branch.
   *
   * Note it is NOT run through `UnescapeString`, where the LIB_ID below is.
   */
  reference?: string;
  /**
   * `GetCurSymbol()->GetLibId().Format()` — `lib:name`, still escaped.
   * {@link symFrameTitle} applies `UnescapeString` itself, so pass the raw
   * LIB_ID rather than unescaping at the call site.
   */
  libId?: string;
  /**
   * `m_libMgr->LibraryExists( GetCurLib() ) && m_libMgr->IsLibraryReadOnly( GetCurLib() )`.
   * Both halves: a library that does not exist is not read-only.
   */
  readOnlyLibrary?: boolean;
  /** `GetScreen() && GetScreen()->IsContentModified()`. */
  modified?: boolean;
}

/**
 * `UnescapeString`, for the subset a LIB_ID can contain.
 *
 * Passed in rather than imported so this module stays free of the symbol
 * editor's library layer; the call site hands it
 * `@ziroeda/common/string_utils.js`'s `unescapeString`, which is the port
 * of `common/string_utils.cpp`.
 */
export type Unescape = (s: string) => string;

export function symFrameTitle(spec: SymFrameTitleSpec, unescapeString: Unescape): FrameTitleParts {
  // `else { title = _( "[no symbol loaded]" ); }` — an assignment, so no star.
  if (!spec.hasSymbol) {
    return frameTitle({
      frameName: SYM_FRAME_NAME,
      document: null,
      placeholder: SYM_NO_DOCUMENT,
      modified: false,
    });
  }

  // `if( GetCurSymbol() && IsSymbolFromSchematic() )` — m_reference, unescaped
  // by nobody, with its own suffix.
  if (spec.fromSchematic) {
    return frameTitle({
      frameName: SYM_FRAME_NAME,
      document: spec.reference ?? '',
      modified: spec.modified,
      suffixes: [FROM_SCHEMATIC_SUFFIX],
    });
  }

  return frameTitle({
    frameName: SYM_FRAME_NAME,
    document: unescapeString(spec.libId ?? ''),
    modified: spec.modified,
    suffixes: spec.readOnlyLibrary ? [READ_ONLY_LIBRARY_SUFFIX] : [],
  });
}

// ============================================================================
// SYMBOL_EDIT_FRAME's methods that live in symbol_editor.cpp, mixed into the frame by
// symbol_edit_frame.ts (the pattern of symbol_editor_undo_redo.ts).
// ============================================================================

export class SYMBOL_EDITOR_MIXIN {
  /** `UpdateSymbolMsgPanelInfo()` (symbol_editor.cpp): the symbol's name, parent, type and text. */
  UpdateSymbolMsgPanelInfo(this: SYMBOL_EDIT_FRAME): void {
    this.ClearMsgPanel();

    const symbol = this.m_symbol;

    if (!symbol) return;

    let msg = symbol.GetName();

    this.AppendMsgPanel('Name', unescapeString(msg), 8);

    if (symbol.IsDerived()) {
      const parent = symbol.GetLibParent();

      msg = parent ? parent.GetName() : 'Undefined!';
      this.AppendMsgPanel('Parent', unescapeString(msg), 8);
    }

    if (symbol.IsGlobalPower()) msg = 'Power Symbol';
    else if (symbol.IsLocalPower()) msg = 'Power Symbol (Local)';
    else msg = 'Symbol';

    this.AppendMsgPanel('Type', msg, 8);
    this.AppendMsgPanel('Description', symbol.GetDescription(), 8);
    this.AppendMsgPanel('Keywords', symbol.GetKeyWords());
    this.AppendMsgPanel('Datasheet', symbol.GetDatasheetField().GetText());
  }
}

/**
 * SYMBOL_EDIT_FRAME's loading and saving (symbol_editor.cpp), mixed into the frame with
 * SYMBOL_EDITOR_MIXIN. Every dialog is the window's; upstream's modal calls return here as awaited
 * promises, so the methods that ask are async.
 */
export class SYMBOL_EDITOR_FILES_MIXIN {
  /** `SelectActiveLibrary( aLibrary )`: ask for one when none is given. */
  async SelectActiveLibrary(this: SYMBOL_EDIT_FRAME, aLibrary = ''): Promise<void> {
    let selectedLib = aLibrary;

    if (selectedLib === '')
      selectedLib = await this.SelectLibrary('Select Symbol Library', 'Library:');

    if (selectedLib !== '') this.SetCurLib(selectedLib);

    this.UpdateTitle();
  }

  /** `saveCurrentSymbol()`: back into the schematic it came from, or its library saved. */
  async saveCurrentSymbol(this: SYMBOL_EDIT_FRAME): Promise<boolean> {
    if (this.GetCurSymbol()) {
      if (this.IsSymbolFromSchematic()) {
        if (!this.SaveSymbolToSchematic(this.m_symbol!, this.m_schematicSymbolUUID)) {
          // happens when the schematic editor has been closed
          DisplayErrorMessage('No schematic currently open.');
          return false;
        }

        this.GetScreen()?.SetContentModified(false);
        return true;
      }

      const libName = this.GetCurSymbol()!.GetLibId().GetLibNickname();

      if (this.GetLibManager().IsLibraryReadOnly(libName)) {
        const msg = `Symbol library '${libName}' is not writable.`;
        const msg2 = 'You must save to a different location.';

        if ((await OKOrCancelDialog('Warning', msg, msg2)) === wxID_OK)
          return this.saveLibrary(libName, true);
      } else {
        return this.saveLibrary(libName, false);
      }
    }

    return false;
  }

  /**
   * `LoadSymbol( aLibId, aUnit, aBodyStyle )` and `LoadSymbol( aAlias, aLibrary, aUnit )`, the two
   * overloads upstream keeps.
   */
  LoadSymbol(
    this: SYMBOL_EDIT_FRAME,
    aLibId: LIB_ID,
    aUnit: number,
    aBodyStyle: number,
  ): Promise<boolean>;
  LoadSymbol(
    this: SYMBOL_EDIT_FRAME,
    aAlias: string,
    aLibrary: string,
    aUnit: number,
  ): Promise<void>;
  async LoadSymbol(
    this: SYMBOL_EDIT_FRAME,
    a: LIB_ID | string,
    b: number | string,
    c: number,
  ): Promise<boolean | void> {
    if (typeof a === 'string') return this.loadSymbolByName(a, b as string, c);

    return this.loadSymbolById(a, b as number, c);
  }

  /** `LoadSymbol( const LIB_ID& aLibId, int aUnit, int aBodyStyle )`. */
  async loadSymbolById(
    this: SYMBOL_EDIT_FRAME,
    aLibId: LIB_ID,
    aUnit: number,
    aBodyStyle: number,
  ): Promise<boolean> {
    let libId = aLibId;
    const manager = Pgm().GetLibraryManager();
    const adapter = SymbolLibAdapter(this.Prj());

    // Some libraries can't be edited, so load the underlying chosen symbol
    const row = manager.GetRow(LIBRARY_TABLE_TYPE.SYMBOL, aLibId.GetLibNickname());

    if (row) {
      const type = SCH_IO_MGR.EnumFromStr(row.Type());

      if (
        type === SCH_FILE_T.SCH_DATABASE ||
        type === SCH_FILE_T.SCH_CADSTAR_ARCHIVE ||
        type === SCH_FILE_T.SCH_HTTP
      ) {
        try {
          const readOnlySym = adapter.LoadSymbol(aLibId);

          if (readOnlySym?.GetSourceLibId().IsValid()) libId = readOnlySym.GetSourceLibId();
        } catch (ioe) {
          if (!(ioe instanceof IO_ERROR)) throw ioe;

          DisplayErrorMessage(
            `Error loading symbol ${aLibId.GetUniStringLibId()} from library '${aLibId.GetLibItemName()}'.`,
            ioe.What(),
          );
          return false;
        }
      }
    }

    if (
      this.GetCurSymbol() &&
      !this.IsSymbolFromSchematic() &&
      this.GetCurSymbol()!.GetLibId().equals(libId) &&
      this.GetUnit() === aUnit &&
      this.GetBodyStyle() === aBodyStyle
    ) {
      return true;
    }

    if (
      this.GetCurSymbol() &&
      this.IsSymbolFromSchematic() &&
      this.GetScreen()?.IsContentModified()
    ) {
      if (!(await this.handleUnsavedSymbol())) return false;
    }

    await this.SelectActiveLibrary(libId.GetLibNickname());

    if (this.LoadSymbolFromCurrentLib(libId.GetLibItemName(), aUnit, aBodyStyle)) {
      // m_treePane->GetLibTree()->SelectLibId / ExpandLibId, and CenterLibId on idle.
      this.FocusOnLibId(libId);

      // setSymWatcher( &libId ): no file watcher in a browser.
      return true;
    }

    return false;
  }

  /**
   * `HandleUnsavedChanges( this, "The current symbol has been modified.  Save changes?",
   * saveCurrentSymbol )`: false when the user cancels or the save fails.
   */
  async handleUnsavedSymbol(this: SYMBOL_EDIT_FRAME): Promise<boolean> {
    const result = await this.UnsavedChangesDialog(
      'The current symbol has been modified.  Save changes?',
    );

    if (result === 'save') return this.saveCurrentSymbol();

    return result === 'discard';
  }

  /** `LoadSymbolFromCurrentLib( aSymbolName, aUnit, aBodyStyle )`. */
  LoadSymbolFromCurrentLib(
    this: SYMBOL_EDIT_FRAME,
    aSymbolName: string,
    aUnit: number,
    aBodyStyle: number,
  ): boolean {
    let symbol: LIB_SYMBOL | null = null;

    try {
      symbol = SymbolLibAdapter(this.Prj()).LoadSymbol(this.GetCurLib(), aSymbolName);
    } catch (ioe) {
      if (!(ioe instanceof IO_ERROR)) throw ioe;

      DisplayErrorMessage(
        `Error loading symbol ${aSymbolName} from library '${this.GetCurLib()}'.`,
        ioe.What(),
      );
      return false;
    }

    if (!symbol || !this.LoadOneLibrarySymbolAux(symbol, this.GetCurLib(), aUnit, aBodyStyle))
      return false;

    // Enable synchronized pin edit mode for symbols with interchangeable units
    this.m_SyncPinEdit = this.GetCurSymbol()!.IsMultiUnit() && !this.GetCurSymbol()!.UnitsLocked();

    this.ClearUndoRedoList();
    this.GetToolManager()?.RunAction(ACTIONS.zoomFitScreen);

    this.RebuildSymbolUnitAndBodyStyleLists();

    return true;
  }

  /** `LoadOneLibrarySymbolAux( aEntry, aLibrary, aUnit, aBodyStyle )`. */
  LoadOneLibrarySymbolAux(
    this: SYMBOL_EDIT_FRAME,
    aEntry: LIB_SYMBOL | null,
    aLibrary: string,
    aUnit: number,
    aBodyStyle: number,
  ): boolean {
    let rebuildMenuAndToolbar = false;

    if (!aEntry || aLibrary === '') return false;

    if (aEntry.GetName() === '') {
      console.warn(`Symbol in library '${aLibrary}' has empty name field.`);
      return false;
    }

    this.GetToolManager()?.RunAction(ACTIONS.cancelInteractive);

    // Symbols from the schematic are edited in place and not managed by the library manager.
    if (this.IsSymbolFromSchematic()) {
      this.m_symbol = null;

      this.SetScreen(this.m_dummyScreen);
      this.SetSymbolOrigin(false, this.IsSymbolFromLegacyLibrary());
      rebuildMenuAndToolbar = true;
    }

    const libMgr = this.GetLibManager();
    const lib_symbol = libMgr.GetBufferedSymbol(aEntry.GetName(), aLibrary);

    if (!lib_symbol) return false; // wxCHECK

    this.m_unit = aUnit > 0 ? aUnit : 1;
    this.m_bodyStyle = aBodyStyle > 0 ? aBodyStyle : 1;

    // The buffered screen for the symbol
    const symbol_screen = libMgr.GetScreen(lib_symbol.GetName(), aLibrary);

    this.SetScreen(symbol_screen);
    this.SetCurSymbol(LIB_SYMBOL.copyOf(lib_symbol), true);
    this.SetCurLib(aLibrary);

    if (rebuildMenuAndToolbar) {
      this.ReCreateMenuBar();
      this.RecreateToolbars();
      this.GetInfoBar()?.Dismiss();
    }

    this.UpdateTitle();
    this.RebuildSymbolUnitAndBodyStyleLists();

    this.ClearUndoRedoList();

    // setSymWatcher( &libId ): no file watcher in a browser.

    // Let tools add things to the view if necessary
    this.GetToolManager()?.ResetTools(RESET_REASON.MODEL_RELOAD);

    this.GetCanvas()?.GetView().UpdateAllItems(VIEW_UPDATE_FLAGS.ALL);

    // Display the document information based on the entry selected just in
    // case the entry is an alias.
    this.UpdateMsgPanel();
    this.GetCanvas()?.Refresh();

    return true;
  }

  /** `LoadSymbol( const wxString& aAlias, const wxString& aLibrary, int aUnit )`. */
  async loadSymbolByName(
    this: SYMBOL_EDIT_FRAME,
    aAlias: string,
    aLibrary: string,
    aUnit: number,
  ): Promise<void> {
    if (
      this.GetCurSymbol() &&
      this.IsSymbolFromSchematic() &&
      this.GetScreen()?.IsContentModified()
    ) {
      if (!(await this.handleUnsavedSymbol())) return;
    }

    const symbol = this.GetLibManager().GetBufferedSymbol(aAlias, aLibrary);

    if (!symbol) {
      DisplayErrorMessage(`Symbol ${aAlias} not found in library '${aLibrary}'.`);
      this.RefreshLibTree();
      return;
    }

    // Optimize default edit options for this symbol
    // Usually if units are locked, graphic items are specific to each unit
    // and if units are interchangeable, graphic items are common to units
    // GetTool<SYMBOL_EDITOR_DRAWING_TOOLS>(), by the tool's name: importing the class here would
    // close an import cycle (the tools reach SYMBOL_EDIT_FRAME, which mixes this file in).
    const tools = this.GetToolManager()?.FindTool(
      'eeschema.SymbolDrawing',
    ) as SYMBOL_EDITOR_DRAWING_TOOLS | null;
    tools?.SetDrawSpecificUnit(symbol.UnitsLocked());

    this.LoadOneLibrarySymbolAux(symbol, aLibrary, aUnit, 0);
  }

  /** `SaveAll()`. */
  async SaveAll(this: SYMBOL_EDIT_FRAME): Promise<void> {
    await this.saveAllLibraries(false);
    this.RefreshLibTree();
  }

  /** `Save()`: the tree's library, else the loaded symbol. */
  async Save(this: SYMBOL_EDIT_FRAME): Promise<void> {
    let libName = '';

    if (this.IsLibraryTreeShown()) libName = this.GetTreeLIBID().GetLibNickname();

    if (libName === '') {
      await this.saveCurrentSymbol();
    } else if (this.GetLibManager().IsLibraryReadOnly(libName)) {
      const msg = `Symbol library '${libName}' is not writable.`;
      const msg2 = 'You must save to a different location.';

      if ((await OKOrCancelDialog('Warning', msg, msg2)) === wxID_OK)
        await this.saveLibrary(libName, true);
    } else {
      await this.saveLibrary(libName, false);
    }

    if (this.IsLibraryTreeShown()) this.RefreshLibTree();

    this.UpdateTitle();
  }

  /** `SaveLibraryAs()`. */
  async SaveLibraryAs(this: SYMBOL_EDIT_FRAME): Promise<void> {
    const libName = this.GetTargetLibId().GetLibNickname();

    if (libName !== '') {
      await this.saveLibrary(libName, true);
      this.RefreshLibTree();
    }
  }

  /** `saveLibrary( aLibrary, aNewFile )`: write it, or write it somewhere new (Save As). */
  async saveLibrary(
    this: SYMBOL_EDIT_FRAME,
    aLibrary: string,
    aNewFile: boolean,
  ): Promise<boolean> {
    let fn: string;
    let type = SYMBOL_SAVEAS_TYPE.NORMAL_SAVE_AS;
    let fileType = SCH_FILE_T.SCH_KICAD;
    const prj = this.Prj();
    const adapter = SymbolLibAdapter(prj);
    const libMgr = this.GetLibManager();

    this.GetToolManager()?.RunAction(ACTIONS.cancelInteractive);

    if (!aNewFile && (aLibrary === '' || !adapter.HasLibrary(aLibrary))) {
      this.ShowInfoBarError('No library specified.');
      return false;
    }

    if (aNewFile) {
      // Get a new name for the library
      const default_path = prj.GetRString(RSTRING_T.SCH_LIB_PATH);
      const saveAsHook = new SYMBOL_LIBRARY_SAVE_AS_FILEDLG_HOOK(type);

      const path = await this.FileDialog(
        `Save Library '${aLibrary}' As...`,
        default_path,
        `${aLibrary}.${KiCadSymbolLibFileExtension}`,
        kicadSymbolLibWildcard(),
        wxFD_SAVE | wxFD_OVERWRITE_PROMPT,
        saveAsHook,
      );

      if (path === null) return false;

      fn = path;

      prj.SetRString(RSTRING_T.SCH_LIB_PATH, fn.slice(0, Math.max(0, fn.lastIndexOf('/'))));

      // if( fn.GetExt().IsEmpty() ) fn.SetExt( FILEEXT::KiCadSymbolLibFileExtension );
      const leaf = fn.slice(fn.lastIndexOf('/') + 1);

      if (!leaf.includes('.')) fn = `${fn}.${KiCadSymbolLibFileExtension}`;

      type = saveAsHook.GetOption();
    } else {
      const manager = Pgm().GetLibraryManager();
      const row = manager.GetRow(LIBRARY_TABLE_TYPE.SYMBOL, aLibrary);

      if (!row) return false; // wxCHECK

      fn = manager.GetFullURI(row, true);
      fileType = SCH_IO_MGR.GuessPluginTypeFromLibPath(fn);

      if (fileType === SCH_FILE_T.SCH_FILE_UNKNOWN) fileType = SCH_FILE_T.SCH_KICAD;
    }

    // Verify the user has write privileges before attempting to save the library file.
    if (!aNewFile && libMgr.IsLibraryReadOnly(aLibrary)) return false;

    this.ClearMsgPanel();

    // Copy .kicad_symb file to .bak.
    if (!this.backupFile(fn, 'bak')) return false;

    if (!libMgr.SaveLibrary(aLibrary, fn, fileType)) {
      DisplayErrorMessage(
        'Error Saving Library',
        `Failed to save changes to symbol library file '${fn}'.`,
      );
      return false;
    }

    if (!aNewFile) {
      libMgr.ClearLibraryModified(aLibrary);

      // Upstream then records the file's modification time for the library watcher, so a save
      // is not read back as an outside change; there is no watcher in a browser.
    } else {
      let resyncLibTree = false;
      const originalLibNickname = this.getTargetLib();
      let forceRefresh = '';

      switch (type) {
        case SYMBOL_SAVEAS_TYPE.REPLACE_TABLE_ENTRY:
          resyncLibTree = this.replaceLibTableEntry(originalLibNickname, fn);
          forceRefresh = originalLibNickname;
          break;

        case SYMBOL_SAVEAS_TYPE.ADD_GLOBAL_TABLE_ENTRY:
          resyncLibTree = this.addLibTableEntry(fn);
          break;

        case SYMBOL_SAVEAS_TYPE.ADD_PROJECT_TABLE_ENTRY:
          resyncLibTree = this.addLibTableEntry(fn, LIBRARY_TABLE_SCOPE.PROJECT);
          break;

        default:
          break;
      }

      if (resyncLibTree) {
        this.FreezeLibraryTree();
        this.SyncLibraries(true, false, forceRefresh);
        this.ThawLibraryTree();
      }
    }

    this.ClearMsgPanel();
    this.RebuildSymbolUnitAndBodyStyleLists();

    return true;
  }

  /**
   * `saveAllLibraries( aRequireConfirmation )`: every modified library saved, Save As where it
   * cannot be written; false if any could not be or the user cancelled.
   */
  async saveAllLibraries(this: SYMBOL_EDIT_FRAME, aRequireConfirmation: boolean): Promise<boolean> {
    let doSave = true;
    let dirtyCount = 0;
    const applyToAll = { value: false };
    let retv = true;
    const libMgr = this.GetLibManager();

    for (const libNickname of libMgr.GetLibraryNames()) {
      if (libMgr.IsLibraryModified(libNickname)) dirtyCount++;
    }

    for (const libNickname of libMgr.GetLibraryNames()) {
      if (!libMgr.IsLibraryModified(libNickname)) continue;

      if (aRequireConfirmation && !applyToAll.value) {
        const msg = `Save changes to '${libNickname}' before closing?`;

        switch (await this.UnsavedChangesDialog(msg, dirtyCount > 1 ? applyToAll : undefined)) {
          case 'save':
            doSave = true;
            break;
          case 'discard':
            doSave = false;
            break;
          default:
            return false;
        }
      }

      if (doSave) {
        // If saving under existing name fails then do a Save As..., and if that
        // fails then cancel close action.
        if (libMgr.IsLibraryReadOnly(libNickname)) {
          const msg = `Symbol library '${libNickname}' is not writable.`;
          const msg2 = 'You must save to a different location.';

          if (dirtyCount === 1) {
            if ((await OKOrCancelDialog('Warning', msg, msg2)) !== wxID_OK) {
              retv = false;
              continue;
            }
          } else {
            // m_infoBar->ShowMessageFor( msg + "  " + msg2, 2000, wxICON_EXCLAMATION ), then
            // wxSafeYield until it closes: the message is shown and the loop goes on.
            this.GetInfoBar()?.Dismiss();
            this.ShowInfoBarError(`${msg}  ${msg2}`);

            retv = false;
            continue;
          }
        } else if (await this.saveLibrary(libNickname, false)) {
          continue;
        }

        if (!(await this.saveLibrary(libNickname, true))) retv = false;
      }
    }

    this.UpdateTitle();
    return retv;
  }
}
