// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `DIALOG_SCH_IMPORT_SETTINGS_BASE` (eeschema/dialogs/dialog_sch_import_settings_base.cpp): the
 * sizer tree, Add() for Add(). The controls' values and events are props; the behaviour is
 * DIALOG_SCH_IMPORT_SETTINGS's (dialog_sch_import_settings.tsx).
 */
import type { JSX } from 'react';
import { DialogShim } from '@ziroeda/common/dialog_shim.js';
import { StdBitmapButton } from '@ziroeda/common/widgets/std_bitmap_button.js';
import { Button, type CHECK, CheckBox, TextCtrl } from '@ziroeda/wx/controls.js';
import {
  wxALIGN_CENTER_VERTICAL,
  wxALL,
  wxBOTTOM,
  wxEXPAND,
  wxHORIZONTAL,
  wxLEFT,
  wxRIGHT,
  wxTOP,
  wxVERTICAL,
} from '@ziroeda/wx/defs.js';
import { BoxSizer, SizerItem, StdDialogButtonSizer } from '@ziroeda/wx/sizer.js';

export interface DIALOG_SCH_IMPORT_SETTINGS_BASE_PROPS {
  m_filePathCtrl: string;
  onFilePath: (aValue: string) => void;
  onBrowseClicked: () => void;
  m_FormattingOpt: CHECK;
  m_annotationOpt: CHECK;
  m_FieldNameTemplatesOpt: CHECK;
  m_BomPresetsOpt: CHECK;
  m_BomFmtPresetsOpt: CHECK;
  m_SeveritiesOpt: CHECK;
  m_PinMapOpt: CHECK;
  m_NetClassesOpt: CHECK;
  m_BusAliasesOpt: CHECK;
  m_TextVarsOpt: CHECK;
  onSelectAll: () => void;
  /** `SetupStandardButtons( { { wxID_OK, … } } )`. */
  okLabel: string;
  onOK: () => void;
  onCancel: () => void;
}

function Opt({ label, c, first }: { label: string; c: CHECK; first?: boolean }): JSX.Element {
  // m_FormattingOpt is added wxALL, every one after it wxBOTTOM|wxLEFT|wxRIGHT, all with 5.
  return (
    <SizerItem flag={first ? wxALL : wxBOTTOM | wxLEFT | wxRIGHT} border={5}>
      <CheckBox
        label={label}
        checked={c.value}
        disabled={c.enabled === false}
        onChange={c.onChange}
      />
    </SizerItem>
  );
}

export function DIALOG_SCH_IMPORT_SETTINGS_BASE(
  p: DIALOG_SCH_IMPORT_SETTINGS_BASE_PROPS,
): JSX.Element {
  return (
    <DialogShim title="Import Settings" onClose={p.onCancel}>
      {/* m_MainSizer */}
      <BoxSizer orient={wxVERTICAL}>
        <SizerItem flag={wxEXPAND | wxTOP | wxRIGHT | wxLEFT} border={5}>
          {/* bupperSizer */}
          <BoxSizer orient={wxHORIZONTAL}>
            <SizerItem flag={wxALIGN_CENTER_VERTICAL | wxLEFT} border={5}>
              {/* importFromLabel */}
              <span>Import from:</span>
            </SizerItem>
            <SizerItem
              proportion={1}
              flag={wxBOTTOM | wxEXPAND | wxLEFT | wxTOP}
              border={5}
              minSize={[300, -1]}
            >
              {/* m_filePathCtrl; its tooltip is upstream's, copied from the plot dialog */}
              <span
                style={{ display: 'contents' }}
                title="Target directory for plot files. Can be absolute or relative to the board file location."
              >
                <TextCtrl
                  value={p.m_filePathCtrl}
                  onChange={p.onFilePath}
                  ariaLabel="Import from"
                />
              </span>
            </SizerItem>
            <SizerItem flag={wxALIGN_CENTER_VERTICAL | wxRIGHT} border={5}>
              {/* m_browseButton, SetBitmap( small_folder ) */}
              <StdBitmapButton
                bitmap="small_folder"
                title="Browse"
                tooltip={null}
                onClick={p.onBrowseClicked}
              />
            </SizerItem>
          </BoxSizer>
        </SizerItem>
        <SizerItem flag={wxEXPAND | wxBOTTOM | wxRIGHT | wxLEFT} border={10}>
          {/* bmiddleSizer */}
          <BoxSizer orient={wxVERTICAL}>
            <SizerItem flag={wxTOP | wxBOTTOM | wxRIGHT} border={5}>
              {/* importLabel */}
              <span>Import:</span>
            </SizerItem>
            <Opt label="Formatting preferences" c={p.m_FormattingOpt} first />
            <Opt label="Annotation preferences" c={p.m_annotationOpt} />
            <Opt label="Field name templates" c={p.m_FieldNameTemplatesOpt} />
            <Opt label="BOM presets" c={p.m_BomPresetsOpt} />
            <Opt label="BOM format presets" c={p.m_BomFmtPresetsOpt} />
            <Opt label="Violation severities" c={p.m_SeveritiesOpt} />
            <Opt label="Pin conflict map" c={p.m_PinMapOpt} />
            <Opt label="Net classes" c={p.m_NetClassesOpt} />
            <Opt label="Bus alias definitions" c={p.m_BusAliasesOpt} />
            <Opt label="Text variables" c={p.m_TextVarsOpt} />
          </BoxSizer>
        </SizerItem>
        <SizerItem flag={wxEXPAND} border={5}>
          {/* m_buttonsSizer */}
          <BoxSizer orient={wxHORIZONTAL}>
            <SizerItem flag={wxALIGN_CENTER_VERTICAL | wxRIGHT | wxLEFT} border={10}>
              {/* m_selectAllButton */}
              <Button label="Select All" onClick={p.onSelectAll} />
            </SizerItem>
            <SizerItem proportion={1} flag={wxBOTTOM | wxEXPAND | wxTOP} border={5}>
              {/* m_sdbSizer1: OK, Cancel */}
              <StdDialogButtonSizer okLabel={p.okLabel} onOk={p.onOK} onCancel={p.onCancel} />
            </SizerItem>
          </BoxSizer>
        </SizerItem>
      </BoxSizer>
    </DialogShim>
  );
}
