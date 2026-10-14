// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `MODEL_SUBSTITUTION` (3d-viewer/3d_cache/model_substitution_helpers.cpp): finding the STEP
 * model that replaced a `.wrl` reference KiCad 10's library no longer ships.
 */
import type { FILENAME_RESOLVER } from '@ziroeda/common/filename_resolver.js';
import { CollectFilesLoopSafe } from '@ziroeda/common/gestfich.js';
import { wxDirExists, wxNormalizePath } from '@ziroeda/wx/filefn.js';

/** `stepExtensions()`: the STEP-family extensions, without the dot. */
export const STEP_EXTENSIONS: readonly string[] = [
  'step',
  'stp',
  'stpz',
  'step.gz',
  'stp.gz',
  'iges',
  'igs',
];

/** `hasStepExtension`. */
export function HasStepExtension(aPath: string): boolean {
  const lower = aPath.toLowerCase();
  return STEP_EXTENSIONS.some((ext) => lower.length > ext.length + 1 && lower.endsWith(`.${ext}`));
}

/** `IsWrlExtension`: true iff the name ends in `.wrl` or `.wrz` (case-insensitive). */
export function IsWrlExtension(aFilename: string): boolean {
  const ext = aFilename.slice(aFilename.lastIndexOf('.') + 1).toLowerCase();
  return aFilename.includes('.') && (ext === 'wrl' || ext === 'wrz');
}

/** `wxFileName( aPath ).GetFullName()`. */
export function FullName(aPath: string): string {
  return aPath.slice(Math.max(aPath.lastIndexOf('/'), aPath.lastIndexOf('\\')) + 1);
}

/**
 * `normalizeStem`: the name without a known model extension, lower case, with `-` and ` ` read
 * as `_`, so "R_0603_1608Metric" and "R-0603-1608Metric" collide.
 */
export function NormalizeStem(aName: string): string {
  let stem = aName;

  // Strip known extensions (case-insensitive), including doubled-up .gz
  // forms that don't round-trip through wxFileName::GetName.
  for (const ext of [
    '.step.gz',
    '.stp.gz',
    '.wrl',
    '.wrz',
    '.step',
    '.stp',
    '.stpz',
    '.iges',
    '.igs',
  ]) {
    if (stem.length > ext.length && stem.slice(-ext.length).toLowerCase() === ext) {
      stem = stem.slice(0, -ext.length);
      break;
    }
  }

  return stem.toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
}

/**
 * `parentDirName`: the basename of the path's directory, e.g.
 * "/foo/Resistor_SMD.3dshapes/R_0603.wrl" -> "Resistor_SMD.3dshapes".
 */
export function ParentDirName(aPath: string): string {
  const dirs = aPath
    .split(/[/\\]/)
    .slice(0, -1)
    .filter((d) => d !== '');
  return dirs[dirs.length - 1] ?? '';
}

/**
 * `gatherScanDirs`: the resolver's search paths, the project's `3dshapes/`, and the extra
 * directories, each once and only if it exists.
 */
export function GatherScanDirs(
  aProjectPath: string,
  aResolver: FILENAME_RESOLVER | null,
  aExtraDirs: readonly string[] = [],
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const addDir = (aDir: string): void => {
    if (aDir === '') return;
    const norm = wxNormalizePath(aDir).replace(/\/+$/, '');
    if (seen.has(norm.toLowerCase())) return;
    seen.add(norm.toLowerCase());
    if (wxDirExists(norm)) result.push(norm);
  };

  for (const sp of aResolver?.GetPaths() ?? []) addDir(sp.m_Pathexp);

  if (aProjectPath !== '') addDir(`${aProjectPath.replace(/\/+$/, '')}/3dshapes`);

  for (const dir of aExtraDirs) addDir(dir);

  return result;
}

/** `MODEL_SUBSTITUTION::STEP_CATALOG`. */
export class STEP_CATALOG {
  /** Normalised stem -> list of absolute STEP-family paths sharing that stem. */
  private m_byStem = new Map<string, string[]>();

  /**
   * `Build`: every STEP-family file under the resolver's search paths, the project's
   * `3dshapes/`, and the extra search directories, indexed by normalised stem.
   */
  Build(
    aProjectPath: string,
    aResolver: FILENAME_RESOLVER | null,
    aExtraDirs: readonly string[] = [],
  ): void {
    this.m_byStem.clear();

    for (const dir of GatherScanDirs(aProjectPath, aResolver, aExtraDirs)) {
      const files: string[] = [];
      CollectFilesLoopSafe(dir, files);

      for (const file of files) {
        if (!HasStepExtension(file)) continue;

        const stem = NormalizeStem(FullName(file));

        if (stem === '') continue;

        const list = this.m_byStem.get(stem);
        if (list) list.push(file);
        else this.m_byStem.set(stem, [file]);
      }
    }
  }

  /**
   * `FindMatchFor`: the best STEP replacement for a missing `.wrl`, preferring one in a folder
   * of the same name; empty when there is none or the name is not a `.wrl`.
   */
  FindMatchFor(aMissingWrl: string): string {
    if (!IsWrlExtension(aMissingWrl)) return '';

    const stem = NormalizeStem(FullName(aMissingWrl));

    if (stem === '') return '';

    const list = this.m_byStem.get(stem);

    if (!list || list.length === 0) return '';

    const wrlParent = ParentDirName(aMissingWrl);

    if (wrlParent !== '') {
      for (const candidate of list) {
        if (ParentDirName(candidate).toLowerCase() === wrlParent.toLowerCase()) return candidate;
      }
    }

    return list[0]!;
  }

  Empty(): boolean {
    return this.m_byStem.size === 0;
  }
}
