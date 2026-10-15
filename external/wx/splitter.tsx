// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from wxWidgets (wxWindows Library Licence).
/**
 * `wxSplitterWindow` (wx/splitter.h) with wxSP_LIVE_UPDATE: two panes and a draggable sash
 * between them. SplitVertically puts the panes side by side, SplitHorizontally one above the
 * other; Unsplit( window1 ) shows window2 alone. The sash never lets a pane fall below
 * SetMinimumPaneSize.
 */
import type { JSX, ReactNode } from 'react';

export function SplitterWindow({
  split,
  sashPosition,
  onSashPosition,
  minimumPaneSize,
  window1,
  window2,
  unsplit,
}: {
  /** SplitVertically (side by side) or SplitHorizontally (stacked). */
  split: 'vertical' | 'horizontal';
  /** GetSashPosition(): window1's extent, in px. */
  sashPosition: number;
  /** wxEVT_SPLITTER_SASH_POS_CHANGED, live. */
  onSashPosition: (aPos: number) => void;
  minimumPaneSize: number;
  window1: ReactNode;
  window2: ReactNode;
  /** Unsplit( window1 ): window2 fills the splitter alone. */
  unsplit?: boolean;
}): JSX.Element {
  const vertical = split === 'vertical';

  return (
    <div className={`ze-wxsplitter ${vertical ? 'vertical' : 'horizontal'}`}>
      {!unsplit && (
        <>
          <div
            className="ze-wxsplitter-pane"
            style={vertical ? { width: sashPosition } : { height: sashPosition }}
          >
            {window1}
          </div>
          <div
            className="ze-wxsplitter-sash"
            role="separator"
            aria-orientation={vertical ? 'vertical' : 'horizontal'}
            onMouseDown={(e) => {
              const start = vertical ? e.clientX : e.clientY;
              const startPos = sashPosition;
              const move = (ev: MouseEvent): void =>
                onSashPosition(
                  Math.max(
                    minimumPaneSize,
                    startPos + (vertical ? ev.clientX : ev.clientY) - start,
                  ),
                );
              const up = (): void => {
                window.removeEventListener('mousemove', move);
                window.removeEventListener('mouseup', up);
              };
              window.addEventListener('mousemove', move);
              window.addEventListener('mouseup', up);
            }}
          />
        </>
      )}
      <div className="ze-wxsplitter-pane grow">{window2}</div>
    </div>
  );
}
