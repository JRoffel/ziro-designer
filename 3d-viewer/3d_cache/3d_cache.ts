// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `S3D_CACHE`'s side of `3d-viewer/3d_cache/3d_cache.cpp` that finds model files: `load()`
 * resolves a model name through FILENAME_RESOLVER onto the stock 3D directory, here the hosted
 * library mounted there and listed by its catalogue, or onto the project's files mounted at its
 * directory. No renderer in this file, so the migration and the editors can resolve model paths
 * without loading three.js.
 */
import { PATHS } from '@ziroeda/common/paths.js';
import { type wxFileSystemMount, wxMountFileSystem } from '@ziroeda/wx/filefn.js';

/** The model extensions KiCad's 3D plugins register (plugins/3d/vrml, oce). */
export const MODEL_FILE = /\.(wrl|wrz|x3d|step|stp|stpz|step\.gz|stp\.gz|iges|igs)$/i;

/**
 * The hosted 3D library's catalogue (tools/models3d/catalog.mjs): library folder -> its model
 * files. Null until LoadHosted3DCatalog has fetched it.
 */
let s_hostedCatalog: ReadonlyMap<string, readonly string[]> | null = null;
let s_hostedCatalogLoad: Promise<void> | null = null;

/**
 * Fetch the catalogue once. The library is a bucket that cannot be listed from a page, so this
 * is the walk of the stock 3D directory KiCad's STEP_CATALOG makes, done when the library was
 * built. A failed fetch leaves the library unlisted, as an unreadable directory is upstream.
 */
export function LoadHosted3DCatalog(aUrl: string): Promise<void> {
  s_hostedCatalogLoad ??= fetch(aUrl)
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, string[]>>) : {}))
    .then((json) => {
      s_hostedCatalog = new Map(Object.entries(json));
    })
    .catch(() => {});
  return s_hostedCatalogLoad;
}

/** The catalogue, set directly: for a caller that already holds it. */
export function SetHosted3DCatalog(aCatalog: Record<string, readonly string[]> | null): void {
  s_hostedCatalog = aCatalog ? new Map(Object.entries(aCatalog)) : null;
  s_hostedCatalogLoad = aCatalog ? Promise.resolve() : null;
}

/**
 * The hosted 3D library, mounted where the Linux build installs it -
 * `${KICAD10_3DMODEL_DIR}` (`PATHS::GetStock3dmodelsPath`) - so a model path
 * resolves as it does on that machine. Until the catalogue is loaded any
 * STEP-shaped name is taken to exist: a model that is not there fails its
 * fetch, as a missing file fails its load upstream. A `.wrl` never exists:
 * KiCad 10's packages3D ships STEP only, which is why DIALOG_MIGRATE_3D_MODELS
 * exists.
 */
class HOSTED_3D_LIBRARY implements wxFileSystemMount {
  FileExists(aRelPath: string): boolean {
    if (!MODEL_FILE.test(aRelPath) || /\.(wrl|wrz)$/i.test(aRelPath)) return false;
    if (!s_hostedCatalog) return true;
    const slash = aRelPath.indexOf('/');
    return (
      s_hostedCatalog.get(aRelPath.slice(0, slash))?.includes(aRelPath.slice(slash + 1)) ?? false
    );
  }

  DirExists(aRelPath: string): boolean {
    if (aRelPath === '') return true;
    if (s_hostedCatalog) return s_hostedCatalog.has(aRelPath);
    return /^[^/]+\.3dshapes$/i.test(aRelPath);
  }

  List(aRelDir: string): { name: string; isDir: boolean }[] | null {
    if (!s_hostedCatalog) return null;
    if (aRelDir === '') return [...s_hostedCatalog.keys()].map((name) => ({ name, isDir: true }));
    const models = s_hostedCatalog.get(aRelDir);
    return models ? models.map((name) => ({ name, isDir: false })) : null;
  }
}

const s_hostedLibrary = new HOSTED_3D_LIBRARY();
let s_libraryMounted = false;

/** The mount itself, so a caller can tell a hosted path from a project one. */
export function HostedLibraryMount(): wxFileSystemMount {
  return s_hostedLibrary;
}

export function mountHostedLibrary(): void {
  if (s_libraryMounted) return;
  wxMountFileSystem(PATHS.GetStock3dmodelsPath(), s_hostedLibrary);
  s_libraryMounted = true;
}

/** The open project's files, mounted at its directory (`Prj().GetProjectPath()`). */
export class PROJECT_FILES_MOUNT implements wxFileSystemMount {
  constructor(private readonly m_names: ReadonlySet<string>) {}

  FileExists(aRelPath: string): boolean {
    return this.m_names.has(aRelPath);
  }

  DirExists(aRelPath: string): boolean {
    const dir = `${aRelPath}/`;
    for (const n of this.m_names) if (n.startsWith(dir)) return true;
    return false;
  }

  List(aRelDir: string): { name: string; isDir: boolean }[] | null {
    const dir = aRelDir === '' ? '' : `${aRelDir}/`;
    const seen = new Map<string, boolean>();
    for (const n of this.m_names) {
      if (!n.startsWith(dir)) continue;
      const rest = n.slice(dir.length);
      const slash = rest.indexOf('/');
      seen.set(slash < 0 ? rest : rest.slice(0, slash), slash >= 0);
    }
    if (seen.size === 0 && aRelDir !== '') return null;
    return [...seen].map(([name, isDir]) => ({ name, isDir }));
  }
}
