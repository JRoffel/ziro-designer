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
