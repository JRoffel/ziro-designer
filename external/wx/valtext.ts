// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from wxWidgets (wxWindows Library Licence).
/**
 * `wxTextValidator` (wx/valtext.h), the base KiCad's text validators (common/validators.cpp)
 * derive from. A DOM input has no validator of its own, so the filter is applied to what a field
 * would hold, as typing it would.
 */

/** `wxFILTER_EMPTY` (wx/valtext.h): an empty value is not valid. */
export const wxFILTER_EMPTY = 0x1;
/** `wxFILTER_EXCLUDE_CHAR_LIST` (wx/valtext.h): the excluded characters are not valid. */
export const wxFILTER_EXCLUDE_CHAR_LIST = 0x200;

/** `wxTextValidator( wxFILTER_EXCLUDE_CHAR_LIST )`, as far as KiCad uses it. */
export class wxTextValidator {
  private m_charExcludes = '';
  private m_style: number;

  constructor(aStyle = wxFILTER_EXCLUDE_CHAR_LIST) {
    this.m_style = aStyle;
  }

  GetStyle(): number {
    return this.m_style;
  }

  SetStyle(aStyle: number): void {
    this.m_style = aStyle;
  }

  HasFlag(aFlag: number): boolean {
    return (this.m_style & aFlag) !== 0;
  }

  SetCharExcludes(aChars: string): void {
    this.m_charExcludes = aChars;
  }

  GetCharExcludes(): string {
    return this.m_charExcludes;
  }

  /** The text with every excluded character dropped, as typing it would. */
  Filter(aText: string): string {
    return [...aText].filter((c) => !this.m_charExcludes.includes(c)).join('');
  }
}
