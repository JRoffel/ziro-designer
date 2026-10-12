// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * `wxStyledTextCtrl` (wx/stc/stc.h). Ours is a multi-line wxTextCtrl; what it keeps from
 * Scintilla is the size a sizer gives it.
 */
import { type JSX, type RefObject, useRef } from 'react';
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
  lineNumbers,
  inputRef,
}: {
  value: string;
  onChange: (aText: string) => void;
  autoFocus?: boolean;
  ariaLabel: string;
  /**
   * `SetMarginType( 0, wxSTC_MARGIN_NUMBER )` with `SetMarginWidth( 0, TextWidth(
   * wxSTC_STYLE_LINENUMBER, "_99999" ) )`: the line-number margin, in a fixed-pitch face with
   * a 4-column tab, as a code editor is built.
   */
  lineNumbers?: boolean;
  /** The text area, for `GotoPos()` / `SetFocus()`. */
  inputRef?: RefObject<HTMLTextAreaElement>;
}): JSX.Element {
  const gutterRef = useRef<HTMLDivElement>(null);
  if (!lineNumbers)
    return (
      <TextCtrl
        multiLine
        value={value}
        onChange={onChange}
        autoFocus={autoFocus}
        ariaLabel={ariaLabel}
      />
    );

  const lineCount = Math.max(1, value.split('\n').length);
  return (
    <div className="ze-stc">
      <div ref={gutterRef} className="ze-stc-margin" aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
      </div>
      <textarea
        ref={inputRef}
        className="ze-stc-text"
        aria-label={ariaLabel}
        spellCheck={false}
        autoFocus={autoFocus}
        value={value}
        // The margin scrolls with the text.
        onScroll={(e) => {
          if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** `GotoPos( PositionFromLine( aLine - 1 ) + aColumn - 1 )` and `SetFocus()`. */
export function StcGotoLine(aText: HTMLTextAreaElement, aLine: number, aColumn: number): void {
  const lines = aText.value.split('\n');
  let pos = 0;
  for (let i = 0; i < Math.min(aLine - 1, lines.length); ++i) pos += lines[i]!.length + 1;
  pos = Math.min(aText.value.length, pos + Math.max(0, aColumn - 1));
  aText.focus();
  aText.setSelectionRange(pos, pos);
}
