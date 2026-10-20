// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from wxWidgets (wxWindows Library Licence).
/**
 * `wxDirDialog` (wx/dirdlg.h), as the browser has it: where KiCad asks GTK for a folder on the
 * disk (a fabrication output's folder, the folder of a file it is about to save), every output
 * here lands in the project's file manager, so the folders on offer are the project's. A dialog
 * whose upstream Browse button opens a `wxFileDialog( wxFD_SAVE )` asks this for the folder and
 * keeps its own file name, which is all that dialog decides in a browser.
 *
 * `WxDirDialog`, not `wxDirDialog`: a JSX tag in lower case is an HTML element.
 */
import { useState, type JSX } from 'react';
import { Dialog } from './dialog.js';
import { StdDialogButtonSizer } from './sizer.js';

export interface WxDirDialogProps {
  /** The dialog's title (`wxDirSelectorPromptStr` unless the caller says). */
  title?: string;
  /** The folders that exist in the project, project-relative; the root is always first. */
  folders: readonly string[];
  /** The folder to start on (`defaultPath`); '' is the project root. */
  initial?: string;
  /** The chosen folder ('' for the project root), or null for `wxID_CANCEL`. */
  onDone: (aFolder: string | null) => void;
}

/** The project root's row. */
const ROOT_LABEL = 'Project folder';

export function WxDirDialog({
  title = 'Select a folder',
  folders,
  initial = '',
  onDone,
}: WxDirDialogProps): JSX.Element {
  const choices = [
    '',
    ...[...new Set(folders.filter(Boolean))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  ];
  const [selected, setSelected] = useState(choices.includes(initial) ? initial : '');

  return (
    <Dialog title={title} onClose={() => onDone(null)}>
      <div className="ze-gridlist" role="listbox" aria-label={title}>
        {choices.map((f) => (
          <div
            key={f || '.'}
            role="option"
            aria-selected={f === selected}
            className={`ze-gridlist-row${f === selected ? ' selected' : ''}`}
            onClick={() => setSelected(f)}
            onDoubleClick={() => onDone(f)}
          >
            {f || ROOT_LABEL}
          </div>
        ))}
      </div>
      <StdDialogButtonSizer onCancel={() => onDone(null)} onOk={() => onDone(selected)} />
    </Dialog>
  );
}

/** One file of a folder read off the computer, relative to that folder. */
export interface LocalFolderFile {
  /** `sub/name.ext`, below the chosen folder. */
  path: string;
  bytes: Uint8Array;
}

/** A folder read off the computer: its name and every file under it. */
export interface LocalFolder {
  name: string;
  files: LocalFolderFile[];
}

interface DirHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<DirHandle | { kind: 'file'; name: string; getFile(): Promise<File> }>;
}

async function walk(aDir: DirHandle, aPrefix: string, aOut: LocalFolderFile[]): Promise<void> {
  for await (const entry of aDir.values()) {
    if (entry.kind === 'directory') await walk(entry, `${aPrefix}${entry.name}/`, aOut);
    else
      aOut.push({
        path: `${aPrefix}${entry.name}`,
        bytes: new Uint8Array(await (await entry.getFile()).arrayBuffer()),
      });
  }
}

/**
 * `wxDirDialog` over the computer's own disk, where KiCad's opens on it: the folder a library
 * lives in (a footprint library is a `.pretty` folder). The browser's directory picker where it
 * has one, else a folder `<input>`; null for `wxID_CANCEL`. The whole folder is read, as a
 * library folder is a handful of small text files.
 */
export async function ChooseLocalFolder(): Promise<LocalFolder | null> {
  const picker = (globalThis as { showDirectoryPicker?: () => Promise<DirHandle> })
    .showDirectoryPicker;

  if (typeof picker === 'function') {
    try {
      const dir = await picker();
      const files: LocalFolderFile[] = [];
      await walk(dir, '', files);
      return { name: dir.name, files };
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return null;
      // Anything else (an insecure context, a refused system folder): the input below.
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
    input.addEventListener('cancel', () => resolve(null));
    input.addEventListener('change', () => {
      void (async () => {
        const list = Array.from(input.files ?? []);

        if (list.length === 0) {
          resolve(null);
          return;
        }

        // `webkitRelativePath` is `<folder>/<path below it>`.
        const rel = (f: File): string =>
          (f as File & { webkitRelativePath: string }).webkitRelativePath || f.name;
        const name = rel(list[0]!).split('/')[0] ?? '';
        const files = await Promise.all(
          list.map(async (f) => ({
            path: rel(f).split('/').slice(1).join('/'),
            bytes: new Uint8Array(await f.arrayBuffer()),
          })),
        );
        resolve({ name, files });
      })();
    });
    input.click();
  });
}
