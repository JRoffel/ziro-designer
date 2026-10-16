// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `LIBRARY_MANAGER_ADAPTER` (common/libraries/library_manager.cpp,
 * include/libraries/library_manager.h), as far as the library-table dialogs
 * reach it: the load status of a library, `CheckTableRow` (which a grid's
 * status column shows), `LibraryError`, and the per-library configuration
 * dialog hooks.
 *
 * Not here: the global tables' loading and the async loads. Project tables
 * load through `LoadProjectTables`; footprint and symbol libraries still
 * resolve through the editors' own stores (`common/fp_lib_table.ts`'s plain
 * records), not through this class (design blocks are the one caller of `Rows`). Upstream keeps a second, process-wide map for
 * the global libraries (`globalLibs()`); an adapter here has the one map,
 * which is where both scopes' statuses are looked up in the same order.
 */
import { ExpandEnvVarSubstitutions } from '../common.js';
import { strNumCmp } from '../string_utils.js';
import { PgmOrNull } from '../pgm_base.js';
import { wxFileExists, wxReadFileSync } from '@ziroeda/wx/filefn.js';
import type { PROJECT } from '../project.js';
import {
  LIBRARY_ERROR,
  type LIBRARY_RESULT,
  LIBRARY_TABLE,
  LIBRARY_TABLE_OK,
  type LIBRARY_TABLE_ROW,
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from './library_table.js';

/**
 * `LIBRARY_MANAGER` (common/libraries/library_manager.{h,cpp}), the part an
 * adapter asks: the global and project tables by type, their rows merged
 * (`Rows`, a project row overriding a global one of the same nickname), one
 * row by nickname, and a row's URI expanded. The tables themselves are loaded
 * by the host (a page reads the project's and the hosted global tables),
 * handed over with `SetTable`.
 *
 * [gap] Nested tables: upstream's `loadNestedTables` reads each `Table` row's
 * file into `m_childTables` and `Rows` recurses into it, hiding a hidden
 * parent's rows and skipping a disabled one (library_manager.cpp:139-189,
 * :784-812). Neither is ported - a `Table` row contributes nothing here.
 * `ApplyLibOverrides` (the `kicad` settings' per-library overrides on a
 * read-only table) is not ported either.
 */
export class LIBRARY_MANAGER {
  private readonly m_tables = new Map<LIBRARY_TABLE_TYPE, LIBRARY_TABLE>();
  private readonly m_projectTables = new Map<LIBRARY_TABLE_TYPE, LIBRARY_TABLE>();
  private readonly m_adapters = new Map<LIBRARY_TABLE_TYPE, LIBRARY_MANAGER_ADAPTER>();

  /** `RegisterAdapter( aType, aAdapter )`: once per type. */
  RegisterAdapter(aType: LIBRARY_TABLE_TYPE, aAdapter: LIBRARY_MANAGER_ADAPTER): void {
    // wxCHECK_MSG: "You should only register an adapter once!"
    if (this.m_adapters.has(aType)) return;

    this.m_adapters.set(aType, aAdapter);
  }

  /** `RemoveAdapter( aType, aAdapter )`: only the adapter registered for the type. */
  RemoveAdapter(aType: LIBRARY_TABLE_TYPE, aAdapter: LIBRARY_MANAGER_ADAPTER): boolean {
    if (this.m_adapters.get(aType) !== aAdapter) return false;

    this.m_adapters.delete(aType);
    return true;
  }

  /** `Adapter( aType )`: the registered adapter, if any. */
  Adapter(aType: LIBRARY_TABLE_TYPE): LIBRARY_MANAGER_ADAPTER | undefined {
    return this.m_adapters.get(aType);
  }

  /** `tableFileName( aType )` (library_manager.cpp:268-283): the FILEEXT table file name. [data] */
  static TableFileName(aType: LIBRARY_TABLE_TYPE): string {
    switch (aType) {
      case LIBRARY_TABLE_TYPE.SYMBOL:
        return 'sym-lib-table';
      case LIBRARY_TABLE_TYPE.FOOTPRINT:
        return 'fp-lib-table';
      case LIBRARY_TABLE_TYPE.DESIGN_BLOCK:
        return 'design-block-lib-table';
      default:
        return '';
    }
  }

  /**
   * `LoadProjectTables( aProjectPath, aTablesToLoad )` (library_manager.cpp:893-935): each
   * named table (all three when none is named) read from the project directory, replacing the
   * project table of that type; a table file that is missing, or of another type, leaves none.
   * The adapters drop their project libraries first and reconcile after, as upstream's two
   * phases do. Nested tables are not followed (see the class comment).
   */
  LoadProjectTables(aProjectPath: string, aTablesToLoad: readonly LIBRARY_TABLE_TYPE[] = []): void {
    for (const adapter of this.m_adapters.values()) adapter.ProjectTablesChanged(aTablesToLoad);

    const types =
      aTablesToLoad.length === 0
        ? [LIBRARY_TABLE_TYPE.SYMBOL, LIBRARY_TABLE_TYPE.FOOTPRINT, LIBRARY_TABLE_TYPE.DESIGN_BLOCK]
        : aTablesToLoad;

    for (const type of types) {
      this.m_projectTables.delete(type);

      const fn = `${aProjectPath.replace(/\/+$/, '')}/${LIBRARY_MANAGER.TableFileName(type)}`;

      if (!wxFileExists(fn)) continue;

      const bytes = wxReadFileSync(fn);

      if (!bytes) continue;

      const table = LIBRARY_TABLE.FromFile(
        fn,
        new TextDecoder().decode(bytes),
        LIBRARY_TABLE_SCOPE.PROJECT,
      );

      // "Library table '%s' has type %s but expected %s; skipping"
      if (table.Type() !== type) {
        console.warn(
          `Library table '${fn}' has type ${table.Type()} but expected ${type}; skipping`,
        );
        continue;
      }

      this.m_projectTables.set(type, table);
    }

    for (const adapter of this.m_adapters.values()) adapter.ProjectTablesReloaded(aTablesToLoad);
  }

  /**
   * `ProjectChanged()` (library_manager.cpp:655-668): the active project changed, so its tables
   * are read from its directory and every adapter drops what it had loaded from the old one.
   * `SETTINGS_MANAGER::LoadProject` calls it for an active project.
   */
  ProjectChanged(): void {
    // Abort any running async library loads before reloading project tables.
    this.AbortAsyncLoads();

    const pgm = PgmOrNull();

    if (pgm) this.LoadProjectTables(pgm.GetSettingsManager().Prj().GetProjectDirectory());

    for (const adapter of this.m_adapters.values()) adapter.ProjectChanged();
  }

  /** `AbortAsyncLoads()` (:671-677). */
  AbortAsyncLoads(): void {
    for (const adapter of this.m_adapters.values()) adapter.AbortAsyncLoad();
  }

  /** Install (or with null, drop) the table of \a aType in \a aScope. */
  SetTable(
    aType: LIBRARY_TABLE_TYPE,
    aScope: LIBRARY_TABLE_SCOPE,
    aTable: LIBRARY_TABLE | null,
  ): void {
    const map = aScope === LIBRARY_TABLE_SCOPE.PROJECT ? this.m_projectTables : this.m_tables;

    if (aTable) map.set(aType, aTable);
    else map.delete(aType);
  }

  /** `Table( aType, aScope )`: the table itself, or null. */
  Table(aType: LIBRARY_TABLE_TYPE, aScope: LIBRARY_TABLE_SCOPE): LIBRARY_TABLE | null {
    const map = aScope === LIBRARY_TABLE_SCOPE.PROJECT ? this.m_projectTables : this.m_tables;
    return map.get(aType) ?? null;
  }

  /**
   * `Rows( aType, aScope, aIncludeInvalid )` (library_manager.cpp:756-833):
   * global then project rows, a later row replacing an earlier one of the same
   * nickname in place; rows (and tables) that are not OK only when asked.
   */
  Rows(
    aType: LIBRARY_TABLE_TYPE,
    aScope: LIBRARY_TABLE_SCOPE = LIBRARY_TABLE_SCOPE.BOTH,
    aIncludeInvalid = false,
  ): LIBRARY_TABLE_ROW[] {
    const rows = new Map<string, LIBRARY_TABLE_ROW>();
    const rowOrder: string[] = [];
    const tables: (LIBRARY_TABLE | undefined)[] =
      aScope === LIBRARY_TABLE_SCOPE.GLOBAL
        ? [this.m_tables.get(aType)]
        : aScope === LIBRARY_TABLE_SCOPE.PROJECT
          ? [this.m_projectTables.get(aType)]
          : [this.m_tables.get(aType), this.m_projectTables.get(aType)];

    for (const table of tables) {
      if (!table || table.Type() !== aType) continue;

      if (!table.IsOk() && !aIncludeInvalid) continue;

      for (const row of table.Rows()) {
        if (!row.IsOk() && !aIncludeInvalid) continue;

        // A nested table's libraries are not followed here.
        if (row.Type() === 'Table') continue;

        if (!rows.has(row.Nickname())) rowOrder.push(row.Nickname());

        rows.set(row.Nickname(), row);
      }
    }

    return rowOrder.map((n) => rows.get(n)!);
  }

  /** `GetRow( aType, aNickname, aScope )` (:836-859), invalid rows included. */
  GetRow(
    aType: LIBRARY_TABLE_TYPE,
    aNickname: string,
    aScope: LIBRARY_TABLE_SCOPE = LIBRARY_TABLE_SCOPE.BOTH,
  ): LIBRARY_TABLE_ROW | null {
    return this.Rows(aType, aScope, true).find((r) => r.Nickname() === aNickname) ?? null;
  }

  /** `ExpandURI( aShortURI, aProject )` (:972-979): variables expanded against the project. */
  static ExpandURI(aShortURI: string, aProject: PROJECT | null): string {
    return ExpandEnvVarSubstitutions(
      aShortURI,
      aProject ? (token) => aProject.TextVarResolver(token) : null,
    );
  }

  /** `GetFullURI( aRow, aSubstituted )`. */
  GetFullURI(aRow: LIBRARY_TABLE_ROW, aSubstituted = false): string {
    if (!aSubstituted) return aRow.URI();

    return LIBRARY_MANAGER.ExpandURI(aRow.URI(), PgmOrNull()?.GetSettingsManager().Prj() ?? null);
  }
}

/** `LOAD_STATUS`: the status of a library load managed by an adapter. */
export enum LOAD_STATUS {
  INVALID,
  LOADING,
  LOADED,
  LOAD_ERROR,
}

/** `LIB_STATUS`: the overall status of a loaded or loading library. */
export interface LIB_STATUS {
  load_status: LOAD_STATUS;
  error?: LIBRARY_ERROR;
}

/** `LIB_DATA`: a loaded library - the row it came from and how it went. */
export interface LIB_DATA {
  /** The IO plugin that loaded it (opaque here; the editor's). */
  plugin: unknown;
  row: LIBRARY_TABLE_ROW;
  status: LIB_STATUS;
  /** The plugin's modify hash when `available_fields_cache` was filled. */
  modify_hash?: number;
  available_fields_cache?: string[];
}

/** `LIBRARY_MANAGER_ADAPTER`. */
export abstract class LIBRARY_MANAGER_ADAPTER {
  /** `m_libraries`, keyed by nickname. */
  protected m_libraries = new Map<string, LIB_DATA>();

  /** `m_manager`: the tables this adapter's rows come from (null for the table dialogs' use). */
  protected readonly m_manager: LIBRARY_MANAGER | null;

  constructor(aManager: LIBRARY_MANAGER | null = null) {
    this.m_manager = aManager;
  }

  /** The type of library table this adapter works with. */
  abstract Type(): LIBRARY_TABLE_TYPE;

  /**
   * `LoadOne( aLib )`: load one library through its plugin; undefined when
   * nothing could be tried.
   */
  abstract LoadOne(aLib: LIB_DATA): LIB_STATUS | undefined;

  /**
   * `createPlugin( aRow )`: the IO plugin for a row's type, or the error.
   * `LIBRARY_TABLE_OK` is the "error" for a row that names a nested table.
   */
  protected abstract createPlugin(aRow: LIBRARY_TABLE_ROW): LIBRARY_RESULT<unknown>;

  /** `abortLoad()`: stop a background load; there is none to stop by default. */
  protected abortLoad(): void {}

  /**
   * `CheckTableRow( aRow )`: try the row the way a load would and write the
   * answer onto it (`SetOk`, `SetErrorDescription`). Skipped when a library of
   * the same nickname, URI and type is already loaded - its answer is reused.
   */
  CheckTableRow(aRow: LIBRARY_TABLE_ROW): void {
    // Testing is expensive; skip it if we already have a library with the same
    // nickname and URI as the row under test
    const libData = this.fetchIfLoaded(aRow.Nickname());

    if (libData) {
      const loadedRow = libData.row;

      if (loadedRow.URI() === aRow.URI() && loadedRow.Type() === aRow.Type()) {
        aRow.SetOk(loadedRow.IsOk());
        return;
      }
    }

    this.abortLoad();

    const plugin = this.createPlugin(aRow);

    if (plugin.ok) {
      const lib: LIB_DATA = {
        plugin: plugin.value,
        row: aRow,
        status: { load_status: LOAD_STATUS.INVALID },
      };
      const status = this.LoadOne(lib);

      if (status !== undefined) {
        aRow.SetOk(status.load_status === LOAD_STATUS.LOADED);

        if (status.error !== undefined) aRow.SetErrorDescription(status.error.message);
      }
    } else if (plugin.error.message === new LIBRARY_TABLE_OK().message) {
      aRow.SetOk(true);
      aRow.SetErrorDescription('');
    } else {
      aRow.SetOk(false);
      aRow.SetErrorDescription(plugin.error.message);
    }
  }

  /**
   * `ProjectTablesChanged( aChangedTables )` (library_manager.cpp:1157-1174): before the
   * project tables are replaced, `resetProjectCache` drops the libraries loaded from them.
   */
  ProjectTablesChanged(aChangedTables: readonly LIBRARY_TABLE_TYPE[]): void {
    if (aChangedTables.length > 0 && !aChangedTables.includes(this.Type())) return;

    for (const nickname of [...this.m_libraries.keys()]) {
      if (this.m_manager?.GetRow(this.Type(), nickname, LIBRARY_TABLE_SCOPE.PROJECT))
        this.m_libraries.delete(nickname);
    }
  }

  /**
   * `ProjectChanged()` (library_manager.cpp:1103-1106): `resetProjectCache()`, which drops the
   * libraries loaded from the project tables. Upstream resets them in place and keeps the
   * global libraries in a second map; this adapter has one map, so the project's entries are
   * erased, as `ProjectTablesChanged` does.
   */
  ProjectChanged(): void {
    this.abortLoad();

    for (const nickname of [...this.m_libraries.keys()]) {
      if (this.m_manager?.GetRow(this.Type(), nickname, LIBRARY_TABLE_SCOPE.PROJECT))
        this.m_libraries.delete(nickname);
    }
  }

  /** `AbortAsyncLoad()` (:1126-1129). */
  AbortAsyncLoad(): void {
    this.abortLoad();
  }

  /**
   * `AsyncLoad()` (library_manager.cpp:1796-1960): load every row of this adapter's type that is
   * not disabled and not already LOADED or LOADING, which is what `IFACE::PreloadLibraries` runs
   * when a project opens and what `fetchIfLoaded` (so `LoadSymbol`) then depends on.
   *
   * Upstream resolves each row's URI on the calling thread and hands the loads to the thread
   * pool, reporting progress through `AsyncLoadProgress`. Here they run in turn on the caller's
   * thread: the rows reach this adapter as files already in memory (a project's own libraries),
   * and the hosted set loads through its own worker preload.
   */
  AsyncLoad(): void {
    if (!this.m_manager) return;

    for (const row of this.m_manager.Rows(this.Type())) {
      // Disabled libraries must never be contacted
      if (row.Disabled()) continue;

      const status = this.m_libraries.get(row.Nickname())?.status.load_status;

      if (status === LOAD_STATUS.LOADED || status === LOAD_STATUS.LOADING) continue;

      const result = this.loadIfNeeded(row.Nickname());

      if (result.ok) this.LoadOne(result.value);
    }
  }

  /**
   * `ProjectTablesReloaded( aChangedTables )` (:1177-1209): upstream erases the sentinels
   * `resetProjectCache` left; this adapter keeps one map and leaves none, so there is nothing
   * to reconcile.
   */
  ProjectTablesReloaded(_aChangedTables: readonly LIBRARY_TABLE_TYPE[]): void {}

  /** `GetLibraryStatus( aNickname )`: undefined when not loaded (yet). */
  GetLibraryStatus(aNickname: string): LIB_STATUS | undefined {
    return this.m_libraries.get(aNickname)?.status;
  }

  /** `IsLibraryLoaded( aNickname )`. */
  IsLibraryLoaded(aNickname: string): boolean {
    return this.GetLibraryStatus(aNickname)?.load_status === LOAD_STATUS.LOADED;
  }

  SupportsConfigurationDialog(_aNickname: string): boolean {
    return false;
  }

  ShowConfigurationDialog(_aNickname: string): void {}

  /** `LibraryError( aNickname )`: the load error of a library, if it has one. */
  LibraryError(aNickname: string): LIBRARY_ERROR | undefined {
    return this.m_libraries.get(aNickname)?.status.error;
  }

  /**
   * `GetLibraryNames()` (library_manager.cpp:1294-1314): the nicknames of the
   * loaded libraries among this type's rows, `StrNumCmp` case-insensitive.
   */
  GetLibraryNames(): string[] {
    const ret: string[] = [];

    for (const row of this.m_manager?.Rows(this.Type()) ?? []) {
      if (this.fetchIfLoaded(row.Nickname())) ret.push(row.Nickname());
    }

    return ret.sort((a, b) => strNumCmp(a, b, true));
  }

  /** `HasLibrary( aNickname, aCheckEnabled )` (:1317-1325). */
  HasLibrary(aNickname: string, aCheckEnabled = false): boolean {
    const r = this.fetchIfLoaded(aNickname);

    if (r) return !aCheckEnabled || !r.row.Disabled();

    return false;
  }

  /** `GetLibraryDescription( aNickname )`: the loaded row's description. */
  GetLibraryDescription(aNickname: string): string | undefined {
    return this.fetchIfLoaded(aNickname)?.row.Description();
  }

  /**
   * `DeleteLibrary( aNickname )` (:1328-1350): the plugin's `DeleteLibrary` on
   * the row's URI; false on any failure.
   */
  DeleteLibrary(aNickname: string): boolean {
    const result = this.loadIfNeeded(aNickname);

    if (result.ok) {
      const plugin = result.value.plugin as { DeleteLibrary(aPath: string): boolean };

      try {
        return plugin.DeleteLibrary(this.getUri(result.value.row));
      } catch {
        return false;
      }
    }

    return false;
  }

  /** `ProjectTable()`: this type's project library table, if there is one. */
  ProjectTable(): LIBRARY_TABLE | null {
    return this.m_manager?.Table(this.Type(), LIBRARY_TABLE_SCOPE.PROJECT) ?? null;
  }

  /** `GetRow( aNickname, aScope )` (:1369-1373): this type's row of that nickname. */
  GetRow(
    aNickname: string,
    aScope: LIBRARY_TABLE_SCOPE = LIBRARY_TABLE_SCOPE.BOTH,
  ): LIBRARY_TABLE_ROW | null {
    return this.m_manager?.GetRow(this.Type(), aNickname, aScope) ?? null;
  }

  /** `IsWritable( aNickname )` (:1592-1606): the loaded library's plugin says it can be written. */
  IsWritable(aNickname: string): boolean {
    const rowData = this.fetchIfLoaded(aNickname);

    if (rowData) {
      const plugin = rowData.plugin as { IsLibraryWritable(aPath: string): boolean };

      return plugin.IsLibraryWritable(this.getUri(rowData.row));
    }

    return false;
  }

  /** `CreateLibrary( aNickname )` (:1609-1640): the plugin makes the row's (empty) library. */
  CreateLibrary(aNickname: string): boolean {
    const result = this.loadIfNeeded(aNickname);

    if (result.ok) {
      const data = result.value;
      const options = data.row.GetOptionsMap();
      const plugin = data.plugin as {
        CreateLibrary(aPath: string, aProperties: ReadonlyMap<string, string>): void;
      };

      try {
        plugin.CreateLibrary(this.getUri(data.row), options);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  /** `getUri( aRow )` (:1643-1646): the row's URI, expanded against the open project. */
  protected getUri(aRow: LIBRARY_TABLE_ROW): string {
    return LIBRARY_MANAGER.ExpandURI(aRow.URI(), PgmOrNull()?.GetSettingsManager().Prj() ?? null);
  }

  /**
   * `loadIfNeeded( aNickname )` (:1753-1770, with `loadFromScope`): the library
   * already known, or its row (project first, then global) with a new plugin,
   * marked LOADING; "Library %s not found" when no table has it.
   */
  protected loadIfNeeded(aNickname: string): LIBRARY_RESULT<LIB_DATA> {
    const known = this.m_libraries.get(aNickname);

    if (known?.plugin) return { ok: true, value: known };

    for (const scope of [LIBRARY_TABLE_SCOPE.PROJECT, LIBRARY_TABLE_SCOPE.GLOBAL]) {
      const row = this.m_manager?.GetRow(this.Type(), aNickname, scope);

      if (row) {
        const plugin = this.createPlugin(row);

        if (!plugin.ok) return plugin;

        const lib: LIB_DATA = {
          plugin: plugin.value,
          row,
          status: { load_status: LOAD_STATUS.LOADING },
        };
        this.m_libraries.set(row.Nickname(), lib);
        return { ok: true, value: lib };
      }
    }

    return { ok: false, error: new LIBRARY_ERROR(`Library ${aNickname} not found`) };
  }

  /**
   * `ReloadLibraryEntry( aNickname, aScope )` (library_manager.cpp:1537): forget a library
   * that had been loaded and make its entry again from the table, so the next use reads the
   * library afresh (after its file was rewritten). Upstream keeps the project and global
   * libraries in two maps and reloads from the scope asked; ours are one map, so the entry is
   * remade from the first of the asked scopes that has the row.
   */
  ReloadLibraryEntry(
    aNickname: string,
    aScope: LIBRARY_TABLE_SCOPE = LIBRARY_TABLE_SCOPE.BOTH,
  ): void {
    // Drain the async load before erasing.
    this.abortLoad();

    const known = this.m_libraries.get(aNickname);

    if (!known?.plugin) return; // nothing was loaded: nothing to reload

    this.m_libraries.delete(aNickname);

    const scopes =
      aScope === LIBRARY_TABLE_SCOPE.GLOBAL
        ? [LIBRARY_TABLE_SCOPE.GLOBAL]
        : aScope === LIBRARY_TABLE_SCOPE.PROJECT
          ? [LIBRARY_TABLE_SCOPE.PROJECT]
          : [LIBRARY_TABLE_SCOPE.PROJECT, LIBRARY_TABLE_SCOPE.GLOBAL];

    for (const scope of scopes) {
      const row = this.m_manager?.GetRow(this.Type(), aNickname, scope);

      if (!row) continue;

      const plugin = this.createPlugin(row);

      if (!plugin.ok) return; // wxLogTrace: failed to reload

      this.m_libraries.set(row.Nickname(), {
        plugin: plugin.value,
        row,
        status: { load_status: LOAD_STATUS.LOADING },
      });
      return;
    }
  }

  /** `fetchIfLoaded`: the library, only when it loaded. */
  protected fetchIfLoaded(aNickname: string): LIB_DATA | undefined {
    const lib = this.m_libraries.get(aNickname);

    return lib?.status.load_status === LOAD_STATUS.LOADED ? lib : undefined;
  }
}
