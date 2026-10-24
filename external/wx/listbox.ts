// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `wxListBox` (`wx/listbox.h`) as a model: the strings and the selected rows, filled and read by
 * the dialog's own code. `wxLB_MULTIPLE` keeps a set of rows; single-selection keeps one. The page
 * draws it through `WxListBox` (common/widgets/wx_listbox.tsx).
 *
 * A change listener stands in for the repaint wx does on its own.
 */

/** `wxNOT_FOUND`. */
export const wxNOT_FOUND = -1;

export class wxListBox {
  private m_strings: string[] = [];
  /** The selected rows, ascending. */
  private m_selections: number[] = [];
  private m_onChange: (() => void) | null = null;
  private m_ensureVisible = wxNOT_FOUND;
  private m_hasFocus = false;
  private m_focusRequested = false;

  /** @param aMultiple `wxLB_MULTIPLE`. */
  constructor(readonly m_multiple = false) {}

  /** The page's repaint hook. */
  SetChangeListener(aListener: (() => void) | null): void {
    this.m_onChange = aListener;
  }

  private changed(): void {
    this.m_onChange?.();
  }

  GetCount(): number {
    return this.m_strings.length;
  }

  GetString(n: number): string {
    return this.m_strings[n] ?? '';
  }

  SetString(n: number, aString: string): void {
    if (n < 0 || n >= this.m_strings.length) return;

    this.m_strings[n] = aString;
    this.changed();
  }

  GetStrings(): string[] {
    return [...this.m_strings];
  }

  Append(aItems: string | readonly string[]): void {
    if (typeof aItems === 'string') this.m_strings.push(aItems);
    else this.m_strings.push(...aItems);

    this.changed();
  }

  /** `Insert( item, pos )`: the rows at and after \a aPos, and their selection, move down one. */
  Insert(aItem: string, aPos: number): void {
    this.InsertItems([aItem], aPos);
  }

  InsertItems(aItems: readonly string[], aPos: number): void {
    this.m_strings.splice(aPos, 0, ...aItems);
    this.m_selections = this.m_selections.map((s) => (s >= aPos ? s + aItems.length : s));
    this.changed();
  }

  /** `Delete( n )`: the selection of the rows after it moves up one; its own is dropped. */
  Delete(n: number): void {
    if (n < 0 || n >= this.m_strings.length) return;

    this.m_strings.splice(n, 1);
    this.m_selections = this.m_selections.filter((s) => s !== n).map((s) => (s > n ? s - 1 : s));
    this.changed();
  }

  Clear(): void {
    this.m_strings = [];
    this.m_selections = [];
    this.changed();
  }

  /** `IsEmpty()`. */
  IsEmpty(): boolean {
    return this.GetCount() === 0;
  }

  /**
   * `FindString( s, bCase )` (wxItemContainerImmutable): the first row that `IsSameAs( s, bCase )`,
   * a whole-string compare, case-folded unless \a bCase; wxNOT_FOUND when none is.
   */
  FindString(s: string, bCase = false): number {
    const want = bCase ? s : s.toLowerCase();

    return this.m_strings.findIndex((item) => (bCase ? item : item.toLowerCase()) === want);
  }

  /** `GetStringSelection()`: the selected row's text, or "" with none selected. */
  GetStringSelection(): string {
    const sel = this.GetSelection();

    return sel === wxNOT_FOUND ? '' : this.GetString(sel);
  }

  /** `SetStringSelection( s, select )`: select (or deselect) the row FindString finds. */
  SetStringSelection(s: string, select = true): boolean {
    const sel = this.FindString(s);

    if (sel === wxNOT_FOUND) return false;

    this.SetSelection(sel, select);
    return true;
  }

  /** `EnsureVisible( n )`: the row the page scrolls into view. */
  EnsureVisible(n: number): void {
    this.m_ensureVisible = n;
    this.changed();
  }

  /** The row EnsureVisible last asked for, for the page. */
  GetEnsureVisible(): number {
    return this.m_ensureVisible;
  }

  /** `HasFocus()`: the page reports focus in and out through SetHasFocus. */
  HasFocus(): boolean {
    return this.m_hasFocus;
  }

  /** `SetFocus()`: the page moves the keyboard focus here on its next paint. */
  SetFocus(): void {
    this.m_hasFocus = true;
    this.m_focusRequested = true;
    this.changed();
  }

  /** The page's answer: the list gained or lost the keyboard focus. */
  SetHasFocus(aFocus: boolean): void {
    this.m_hasFocus = aFocus;
  }

  /** The page's question: did the frame ask for the focus since the last paint? Clears it. */
  TakeFocusRequest(): boolean {
    const requested = this.m_focusRequested;
    this.m_focusRequested = false;
    return requested;
  }

  /**
   * `SetSelection( n, select )`: wxNOT_FOUND clears every selection; otherwise a single-selection
   * box moves to \a n, and a wxLB_MULTIPLE one adds \a n to what is selected. With \a aSelect
   * false, \a n is deselected instead.
   */
  SetSelection(n: number, aSelect = true): void {
    if (!aSelect) {
      this.Deselect(n);
      return;
    }

    if (n === wxNOT_FOUND) this.m_selections = [];
    else if (n >= 0 && n < this.m_strings.length) {
      if (!this.m_multiple) this.m_selections = [n];
      else if (!this.m_selections.includes(n))
        this.m_selections = [...this.m_selections, n].sort((a, b) => a - b);
    }

    this.changed();
  }

  /** `Deselect( n )`. */
  Deselect(n: number): void {
    this.m_selections = this.m_selections.filter((s) => s !== n);
    this.changed();
  }

  /** `GetSelections( aSelections )`: the selected rows, ascending. */
  GetSelections(): number[] {
    return [...this.m_selections];
  }

  /** `GetSelection()`: the selected row of a single-selection box, or wxNOT_FOUND. */
  GetSelection(): number {
    return this.m_selections[0] ?? wxNOT_FOUND;
  }

  IsSelected(n: number): boolean {
    return this.m_selections.includes(n);
  }
}
