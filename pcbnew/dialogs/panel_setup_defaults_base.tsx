// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `PANEL_SETUP_DEFAULTS_BASE` (pcbnew/dialogs/panel_setup_defaults_base.cpp): a scrolled window
 * whose m_scrollSizer is empty in the base. PANEL_SETUP_DEFAULTS adds the three panels to it.
 */
import type { JSX, ReactNode } from 'react';
import { wxALL, wxEXPAND, wxVERTICAL } from '@ziroeda/wx/defs.js';
import { ScrolledWindow } from '@ziroeda/wx/scrolwin.js';
import { BoxSizer, SizerItem } from '@ziroeda/wx/sizer.js';

export interface PANEL_SETUP_DEFAULTS_BASE_PROPS {
  /** What the class Add()s to m_scrollSizer. */
  m_scrollSizer: ReactNode;
}

export function PANEL_SETUP_DEFAULTS_BASE(p: PANEL_SETUP_DEFAULTS_BASE_PROPS): JSX.Element {
  return (
    // mainSizer
    <BoxSizer orient={wxVERTICAL}>
      <SizerItem proportion={1} flag={wxEXPAND | wxALL} border={5}>
        {/* m_scrolledWindow, wxHSCROLL|wxVSCROLL */}
        <ScrolledWindow>
          {/* m_scrollSizer */}
          <BoxSizer orient={wxVERTICAL}>{p.m_scrollSizer}</BoxSizer>
        </ScrolledWindow>
      </SizerItem>
    </BoxSizer>
  );
}
