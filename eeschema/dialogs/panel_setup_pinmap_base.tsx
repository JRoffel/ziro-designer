// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `PANEL_SETUP_PINMAP_BASE` (eeschema/dialogs/panel_setup_pinmap_base.cpp): one wxPanel,
 * m_matrixPanel, at its 500 x 424 minimum. PANEL_SETUP_PINMAP::reBuildMatrixPanel fills it with
 * the row labels, the column labels and callouts, and the button matrix, at absolute positions.
 */
import type { JSX, ReactNode } from 'react';
import { Panel } from '@ziroeda/wx/controls.js';
import { wxALL, wxEXPAND, wxHORIZONTAL, wxTOP, wxVERTICAL } from '@ziroeda/wx/defs.js';
import { BoxSizer, SizerItem } from '@ziroeda/wx/sizer.js';

export function PANEL_SETUP_PINMAP_BASE({
  m_matrixPanel,
}: {
  m_matrixPanel: ReactNode;
}): JSX.Element {
  return (
    // bSizer2
    <BoxSizer orient={wxHORIZONTAL}>
      <SizerItem proportion={1} flag={wxEXPAND | wxTOP} border={5}>
        {/* m_panelMatrixSizer */}
        <BoxSizer orient={wxVERTICAL}>
          <SizerItem proportion={1} flag={wxEXPAND | wxALL} border={5} minSize={[500, 424]}>
            <Panel>{m_matrixPanel}</Panel>
          </SizerItem>
        </BoxSizer>
      </SizerItem>
    </BoxSizer>
  );
}
