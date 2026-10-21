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

  /**
   * `SetSelection( n )`: wxNOT_FOUND clears every selection; otherwise a single-selection box
   * moves to \a n, and a wxLB_MULTIPLE one adds \a n to what is selected.
   */
  SetSelection(n: number): void {
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
