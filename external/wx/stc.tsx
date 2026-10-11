// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * `wxStyledTextCtrl` (wx/stc/stc.h). Ours is a multi-line wxTextCtrl; what it keeps from
 * Scintilla is the size a sizer gives it.
 */
import type { JSX } from 'react';
import { TextCtrl } from './controls.js';

/**
 * `GetBestSize()` of a wxStyledTextCtrl built with wxDefaultSize, measured on GTK by
 * qa/probes/stc_bestsize_probe.cpp: 200 x 100. A dialog that states no SetMinSize gets this.
 */
export const STC_BEST_SIZE: readonly [number, number] = [200, 100];

export function StyledTextCtrl({
  value,
  onChange,
  autoFocus,
  ariaLabel,
}: {
  value: string;
  onChange: (aText: string) => void;
  autoFocus?: boolean;
  ariaLabel: string;
}): JSX.Element {
  return (
    <TextCtrl
      multiLine
      value={value}
      onChange={onChange}
      autoFocus={autoFocus}
      ariaLabel={ariaLabel}
    />
  );
}
