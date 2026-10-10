// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from wxWidgets (wxWindows Library Licence).
/**
 * `wxSimplebook`: a book with no tabs and no frame, showing one page. Every page stays in the
 * layout, sharing one grid cell, so the book is as large as its largest page - as wx sizes a
 * simplebook - and switching pages never resizes the dialog. The pages are on the dialog's own
 * face, unlike a wxNotebook's.
 */
import type { JSX, ReactNode } from 'react';

export function Simplebook({
  pages,
  selection,
}: {
  /** `AddPage( page, text )`: the pages' contents; the text is never shown. */
  pages: readonly ReactNode[];
  /** `SetSelection()`. */
  selection: number;
}): JSX.Element {
  return (
    <div className="ze-simplebook">
      {pages.map((content, i) => (
        // The page order is fixed for the book's life; the index is its identity.
        // biome-ignore lint/suspicious/noArrayIndexKey: AddPage order is the page's identity
        <div key={i} className="ze-simplebook-page" data-hide={i === selection ? undefined : ''}>
          {content}
        </div>
      ))}
    </div>
  );
}
