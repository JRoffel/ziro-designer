// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * `wxScrolledWindow` (wx/scrolwin.h): a panel whose sizer may be larger than the window, scrolled
 * along the axes its style names. The scroll rate is a wheel/arrow step the browser decides; the
 * window's own minimum is nothing, which is what lets the page around it hold its stated size.
 */
import type { JSX, ReactNode } from 'react';

export function ScrolledWindow({
  hscroll = true,
  vscroll = true,
  children,
}: {
  /** `wxHSCROLL` */
  hscroll?: boolean;
  /** `wxVSCROLL` */
  vscroll?: boolean;
  /** The window's sizer, `SetSizer()`. */
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      className="ze-scrolledwindow"
      style={{ overflowX: hscroll ? 'auto' : 'hidden', overflowY: vscroll ? 'auto' : 'hidden' }}
    >
      {children}
    </div>
  );
}
