// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from wxWidgets (wxWindows Library Licence).
/**
 * `wxFilePickerCtrl` / `wxDirPickerCtrl` (wx/filepicker.h) with `wxFLP_USE_TEXTCTRL`: an entry
 * holding the path and wx's generic picker button, labelled `wxFilePickerWidgetLabel` ("Browse"),
 * beside it. The button opens the dialog its owner gives it (`onBrowse`); with none it is greyed.
 */
import type { JSX } from 'react';
import { Button, TextCtrl } from './controls.js';

/** `wxFilePickerWidgetLabel` / `wxDirPickerWidgetLabel`. */
export const wxFilePickerWidgetLabel = 'Browse';

export interface FilePickerCtrlProps {
  /** `GetPath()` / `SetPath()`. */
  value: string;
  onChange: (aPath: string) => void;
  /** The picker's dialog: `message`, the title it opens with. */
  message?: string;
  /** Opens the chooser; the button is greyed without one. */
  onBrowse?: () => void;
  ariaLabel?: string;
}

export function FilePickerCtrl({
  value,
  onChange,
  message,
  onBrowse,
  ariaLabel,
}: FilePickerCtrlProps): JSX.Element {
  return (
    <span className="ze-filepicker">
      <TextCtrl value={value} onChange={onChange} ariaLabel={ariaLabel} />
      <Button
        label={wxFilePickerWidgetLabel}
        title={message}
        disabled={!onBrowse}
        onClick={() => onBrowse?.()}
      />
    </span>
  );
}
