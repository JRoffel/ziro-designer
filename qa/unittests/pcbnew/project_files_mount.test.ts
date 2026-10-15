// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * PROJECT_FILES_MOUNT: the open project's files on the mounted file system,
 * brought up to date after every autosave by writing only what changed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  wxFileExists,
  wxFileModificationTime,
  wxReadFileSync,
  wxWriteFileSync,
} from '@ziroeda/wx/filefn.js';
import {
  IsDesignBlockTableInput,
  type PROJECT_FILE_TEXT,
  PROJECT_FILES_MOUNT,
} from '@ziroeda/pcbnew/browser/project_files_mount.js';

const text = (aPath: string): string | null => {
  const data = wxReadFileSync(aPath);
  return data ? new TextDecoder().decode(data) : null;
};

const board = (n: number): PROJECT_FILE_TEXT => ({ name: 'p.kicad_pcb', text: `(kicad_pcb ${n})` });
const table: PROJECT_FILE_TEXT = {
  name: 'design-block-lib-table',
  text: '(design_block_lib_table)',
};
const block: PROJECT_FILE_TEXT = { name: 'b.kicad_blocks/x.kicad_block/x.json', text: '{}' };

let mount: PROJECT_FILES_MOUNT;
afterEach(() => mount.Unmount());

describe('PROJECT_FILES_MOUNT', () => {
  it('mounts the files at the project directory, and asks for the tables the first time', () => {
    mount = new PROJECT_FILES_MOUNT();
    expect(mount.Sync('/p', [board(1), table])).toBe(true);
    expect(text('/p/p.kicad_pcb')).toBe('(kicad_pcb 1)');
    expect(text('/p/design-block-lib-table')).toBe('(design_block_lib_table)');
  });

  it('a new board text is written, alone, and does not ask for the tables', () => {
    mount = new PROJECT_FILES_MOUNT();
    mount.Sync('/p', [board(1), table]);
    const tableStamp = wxFileModificationTime('/p/design-block-lib-table');
    const boardStamp = wxFileModificationTime('/p/p.kicad_pcb');

    expect(mount.Sync('/p', [board(2), table])).toBe(false);
    expect(text('/p/p.kicad_pcb')).toBe('(kicad_pcb 2)');
    expect(wxFileModificationTime('/p/p.kicad_pcb')).not.toBe(boardStamp);
    expect(wxFileModificationTime('/p/design-block-lib-table')).toBe(tableStamp);
  });

  it('asks for the tables when the table or a library changes, comes or goes', () => {
    mount = new PROJECT_FILES_MOUNT();
    mount.Sync('/p', [board(1)]);
    expect(mount.Sync('/p', [board(1), table])).toBe(true);
    expect(mount.Sync('/p', [board(1), { ...table, text: '(design_block_lib_table (lib))' }])).toBe(
      true,
    );
    expect(mount.Sync('/p', [board(1), table, block])).toBe(true);
    expect(mount.Sync('/p', [board(1), table])).toBe(true);
    expect(wxFileExists('/p/b.kicad_blocks/x.kicad_block/x.json')).toBe(false);
    expect(mount.Sync('/p', [board(1)])).toBe(true);
    expect(wxFileExists('/p/design-block-lib-table')).toBe(false);
  });

  it('a new project directory is a new mount; the old one is gone', () => {
    mount = new PROJECT_FILES_MOUNT();
    mount.Sync('/p', [board(1)]);
    expect(mount.Sync('/q', [board(3)])).toBe(true);
    expect(wxFileExists('/p/p.kicad_pcb')).toBe(false);
    expect(text('/q/p.kicad_pcb')).toBe('(kicad_pcb 3)');
  });

  it("reports KiCad's writes, not its own, and does not write back the page's echo", () => {
    mount = new PROJECT_FILES_MOUNT();
    const written: PROJECT_FILE_TEXT[] = [];
    mount.SetWriteListener((f) => written.push(f));
    mount.Sync('/p', [board(1), table]);
    expect(written).toEqual([]);

    wxWriteFileSync('/p/design-block-lib-table', new TextEncoder().encode('(new)'));
    expect(written).toEqual([{ name: 'design-block-lib-table', text: '(new)' }]);

    // The page stores the write and hands it back: nothing to write, no table reload.
    const stamp = wxFileModificationTime('/p/design-block-lib-table');
    expect(mount.Sync('/p', [board(1), { ...table, text: '(new)' }])).toBe(false);
    expect(wxFileModificationTime('/p/design-block-lib-table')).toBe(stamp);
    expect(written).toHaveLength(1);

    // A later autosave's board is the page's own file arriving, not a write to report.
    mount.Sync('/p', [board(2), { ...table, text: '(new)' }]);
    expect(text('/p/p.kicad_pcb')).toBe('(kicad_pcb 2)');
    expect(written).toHaveLength(1);
  });

  it('knows the table and the libraries from the other project files', () => {
    expect(IsDesignBlockTableInput('design-block-lib-table')).toBe(true);
    expect(IsDesignBlockTableInput('libs/design-block-lib-table')).toBe(true);
    expect(IsDesignBlockTableInput('b.kicad_blocks/x.kicad_block/x.kicad_sch')).toBe(true);
    expect(IsDesignBlockTableInput('p.kicad_pcb')).toBe(false);
    expect(IsDesignBlockTableInput('sym-lib-table')).toBe(false);
    expect(IsDesignBlockTableInput('my-design-block-lib-table.bak')).toBe(false);
  });
});
