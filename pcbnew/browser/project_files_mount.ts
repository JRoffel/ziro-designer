// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * Not KiCad's: the open project's files on the mounted file system at its
 * directory, where KiCad finds them on disk. `LIBRARY_MANAGER::LoadProjectTables`
 * reads the project's design-block-lib-table there, and the design block
 * libraries it names are read (and saved) there.
 *
 * The page hands the board editor its project's files again after every
 * autosave, the board itself among them. Rebuilding the mount from all of them
 * then re-encoded every file and reloaded the tables after every edit, a
 * 600 ms stall on CM5. This keeps one mount per project directory, writes only
 * the files whose text changed, and says when a file the tables read did.
 */
import { MEMORY_FILESYSTEM, wxMountFileSystem } from '@ziroeda/wx/filefn.js';

/** A project file as the page holds it. */
export interface PROJECT_FILE_TEXT {
  readonly name: string;
  readonly text: string;
}

/** The files `LoadProjectTables` reads for design blocks: the table and the libraries. */
export function IsDesignBlockTableInput(aName: string): boolean {
  return /(^|\/)design-block-lib-table$/.test(aName) || /\.kicad_blocks(\/|$)/.test(aName);
}

export class PROJECT_FILES_MOUNT {
  private m_dir = '';
  private m_fs: MEMORY_FILESYSTEM | null = null;
  private m_unmount: (() => void) | null = null;
  /** The text each mounted file was written from. */
  private readonly m_texts = new Map<string, string>();
  private readonly m_encoder = new TextEncoder();
  private readonly m_decoder = new TextDecoder();
  /** Told of a write KiCad's code makes, never of the ones Sync makes. */
  private m_onWrite: ((aFile: PROJECT_FILE_TEXT) => void) | null = null;

  /** Where KiCad's writes into the mount are reported. */
  SetWriteListener(aListener: ((aFile: PROJECT_FILE_TEXT) => void) | null): void {
    this.m_onWrite = aListener;
  }

  /**
   * Bring the mount at `aDir` to `aFiles`. True when the design block tables must be
   * loaded again: a new mount, or a file they read changed, came or went.
   */
  Sync(aDir: string, aFiles: readonly PROJECT_FILE_TEXT[]): boolean {
    let tablesChanged = false;

    if (!this.m_fs || this.m_dir !== aDir) {
      this.Unmount();
      this.m_dir = aDir;
      this.m_fs = new MEMORY_FILESYSTEM();
      this.m_unmount = wxMountFileSystem(aDir, this.m_fs);
      tablesChanged = true;
    }

    const fs = this.m_fs;
    // Sync's own writes are the page's files arriving, not KiCad writing one.
    fs.SetWriteListener(null);

    const present = new Set<string>();

    for (const f of aFiles) {
      present.add(f.name);

      if (this.m_texts.get(f.name) === f.text) continue;

      fs.Write(f.name, this.m_encoder.encode(f.text));
      this.m_texts.set(f.name, f.text);

      if (IsDesignBlockTableInput(f.name)) tablesChanged = true;
    }

    for (const name of [...this.m_texts.keys()]) {
      if (present.has(name)) continue;

      fs.Remove(name);
      this.m_texts.delete(name);

      if (IsDesignBlockTableInput(name)) tablesChanged = true;
    }

    fs.SetWriteListener((aRel, aData) => {
      const text = this.m_decoder.decode(aData);
      this.m_texts.set(aRel, text);
      this.m_onWrite?.({ name: aRel, text });
    });

    return tablesChanged;
  }

  Unmount(): void {
    this.m_unmount?.();
    this.m_unmount = null;
    this.m_fs = null;
    this.m_dir = '';
    this.m_texts.clear();
  }
}
