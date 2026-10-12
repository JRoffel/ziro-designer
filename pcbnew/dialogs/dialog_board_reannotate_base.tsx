// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `DIALOG_BOARD_REANNOTATE_BASE` (pcbnew/dialogs/dialog_board_reannotate_base.cpp): the sizer tree,
 * Add() for Add(). The members are props; the behaviour is DIALOG_BOARD_REANNOTATE's
 * (dialog_board_reannotate.tsx).
 */
import type { JSX } from 'react';
import { bitmapUrl } from '@ziroeda/common/bitmap_store.js';
import { DialogShim } from '@ziroeda/common/dialog_shim.js';
import type { ReportLine, Severity } from '@ziroeda/common/reporter.js';
import { HtmlReportPanel } from '@ziroeda/common/widgets/wx_html_report_panel.js';
import {
  type CHECK,
  type CHOICE,
  CheckBox,
  Choice,
  RadioButton,
  StaticBitmap,
  StaticLine,
  StaticText,
  TextCtrl,
} from '@ziroeda/wx/controls.js';
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
import {
  BoxSizer,
  FlexGridSizer,
  GridBagSizer,
  SizerItem,
  Spacer,
  StdDialogButtonSizer,
} from '@ziroeda/wx/sizer.js';

type ENTRY = { value: string; onChange: (aText: string) => void };

/**
 * The eight m_Down_Right .. m_Left_Up radios, in Add() order, with the bitmap the constructor
 * puts beside each (it pairs them crosswise: m_Down_Right shows reannotate_right_down) and the
 * static bitmap's tooltip.
 */
export const REANNOTATE_SORT_BUTTONS: readonly { bitmap: string; tooltip: string }[] = [
  { bitmap: 'reannotate_right_down', tooltip: 'Horizontally: top left to bottom right' },
  { bitmap: 'reannotate_left_down', tooltip: 'Horizontally: top right to bottom left' },
  { bitmap: 'reannotate_right_up', tooltip: 'Horizontally: bottom left to top right' },
  { bitmap: 'reannotate_left_up', tooltip: 'Horizontally:: bottom right to top left' },
  { bitmap: 'reannotate_down_left', tooltip: 'Vertically: top left to bottom right' },
  { bitmap: 'reannotate_up_left', tooltip: 'Vertically: bottom left to top right' },
  { bitmap: 'reannotate_down_right', tooltip: 'Vertically: top right to bottom left' },
  { bitmap: 'reannotate_up_right', tooltip: 'Vertically: bottom right to top left' },
];

export interface DIALOG_BOARD_REANNOTATE_BASE_PROPS {
  /** Which of the eight order radios is set. */
  sortCode: number;
  onSortCode: (aCode: number) => void;
  m_locationChoice: CHOICE;
  m_GridChoice: CHOICE & { choices: readonly string[] };
  /** All / Front / Back / Selection. */
  scope: number;
  onScope: (aScope: number) => void;
  m_ExcludeLocked: CHECK;
  m_ExcludeList: ENTRY;
  m_FrontRefDesStart: ENTRY;
  m_BackRefDesStart: ENTRY;
  m_FrontPrefix: ENTRY;
  m_BackPrefix: ENTRY;
  m_RemoveFrontPrefix: CHECK;
  m_RemoveBackPrefix: CHECK;
  /** `m_MessageWindow`, a WX_HTML_REPORT_PANEL. */
  messages: readonly ReportLine[];
  visibleSeverities: Severity;
  onVisibleSeveritiesChange: (aMask: Severity) => void;
  onOK: () => void;
  onCancel: () => void;
}

const CV = wxALIGN_CENTER_VERTICAL;
const GRID_TIP =
  'Component position will be rounded\nto this grid before sorting.\nThis helps with misaligned parts.';
const EXCLUDE_TIP = 'Do not re-annotate this type \nof reference (R means R*)';

export function DIALOG_BOARD_REANNOTATE_BASE(p: DIALOG_BOARD_REANNOTATE_BASE_PROPS): JSX.Element {
  // A section heading: the label at wxTOP|wxRIGHT|wxLEFT 13, a wxStaticLine under it.
  const heading = (aLabel: string) => (
    <>
      <SizerItem flag={wxTOP | wxRIGHT | wxLEFT} border={13}>
        <StaticText label={aLabel} />
      </SizerItem>
      <SizerItem flag={wxEXPAND | wxTOP | wxBOTTOM} border={2}>
        <StaticLine />
      </SizerItem>
    </>
  );

  const scopes = ['All', 'Front', 'Back', 'Selection'];

  return (
    <DialogShim title="Geographical Reannotation" onClose={p.onCancel}>
      {/* bmainSizer */}
      <BoxSizer orient={wxVERTICAL}>
        <SizerItem flag={wxEXPAND | wxRIGHT | wxLEFT} border={5}>
          {/* bSizerOpts */}
          <BoxSizer orient={wxVERTICAL}>
            {heading('Footprint Order')}
            <SizerItem flag={wxEXPAND | wxRIGHT | wxLEFT} border={10}>
              {/* fgSizerButtons = wxFlexGridSizer( 2, 23, 0, 0 ) */}
              <FlexGridSizer cols={23} growableCols={[2, 5, 8, 11, 14, 17, 20]}>
                {REANNOTATE_SORT_BUTTONS.flatMap((b, i) => [
                  <SizerItem
                    key={`r${i}`}
                    flag={CV | wxTOP | wxBOTTOM | (i > 0 ? wxLEFT : 0)}
                    border={5}
                  >
                    <RadioButton
                      label=""
                      name="m_sortOrder"
                      checked={p.sortCode === i}
                      onChange={() => p.onSortCode(i)}
                      title={b.tooltip}
                    />
                  </SizerItem>,
                  <SizerItem key={`b${i}`} flag={wxALL | CV} border={5}>
                    <StaticBitmap bitmap={bitmapUrl(b.bitmap)} title={b.tooltip} />
                  </SizerItem>,
                  ...(i < REANNOTATE_SORT_BUTTONS.length - 1
                    ? [
                        <Spacer
                          key={`s${i}`}
                          width={10}
                          height={0}
                          proportion={1}
                          flag={wxEXPAND}
                          border={5}
                        />,
                      ]
                    : []),
                ])}
              </FlexGridSizer>
            </SizerItem>
            <SizerItem flag={wxEXPAND | wxALL} border={10}>
              {/* fgSizerLocations = wxFlexGridSizer( 0, 4, 0, 0 ) */}
              <FlexGridSizer cols={4}>
                <SizerItem flag={CV} border={5}>
                  <StaticText label="Based on location of:" />
                </SizerItem>
                <SizerItem flag={CV | wxRIGHT | wxLEFT} border={5}>
                  <Choice
                    choices={['Footprint', 'Reference']}
                    choice={p.m_locationChoice}
                    ariaLabel="Based on location of"
                  />
                </SizerItem>
                <SizerItem flag={CV | wxLEFT} border={25}>
                  <StaticText label="Round locations to:" title={GRID_TIP} />
                </SizerItem>
                <SizerItem flag={CV | wxRIGHT | wxLEFT} border={5}>
                  <Choice
                    choices={p.m_GridChoice.choices}
                    choice={p.m_GridChoice}
                    title={GRID_TIP}
                    ariaLabel="Round locations to"
                  />
                </SizerItem>
              </FlexGridSizer>
            </SizerItem>
            {heading('Reannotation Scope')}
            <SizerItem flag={wxBOTTOM | wxLEFT} border={5}>
              {/* fgSizer6111 = wxFlexGridSizer( 0, 5, 0, 0 ) */}
              <FlexGridSizer cols={5}>
                {scopes.map((label, i) => (
                  <SizerItem key={label} flag={CV | wxTOP | wxRIGHT | wxLEFT} border={5}>
                    <RadioButton
                      label={label}
                      name="m_scope"
                      checked={p.scope === i}
                      onChange={() => p.onScope(i)}
                    />
                  </SizerItem>
                ))}
              </FlexGridSizer>
            </SizerItem>
            <SizerItem flag={wxTOP | wxRIGHT | wxLEFT} border={10}>
              <CheckBox
                label="Exclude locked footprints"
                check={p.m_ExcludeLocked}
                title="Locked footprints will not be reannotated"
              />
            </SizerItem>
            <SizerItem flag={wxEXPAND | wxBOTTOM | wxRIGHT | wxLEFT} border={5}>
              {/* bSizerExclusions */}
              <BoxSizer orient={wxHORIZONTAL}>
                <SizerItem flag={wxALL | CV} border={5}>
                  <StaticText label="Exclude references:" title={EXCLUDE_TIP} />
                </SizerItem>
                <SizerItem proportion={1} flag={wxALL | CV} border={5}>
                  <TextCtrl
                    value={p.m_ExcludeList.value}
                    onChange={p.m_ExcludeList.onChange}
                    title={EXCLUDE_TIP}
                    ariaLabel="Exclude references"
                  />
                </SizerItem>
              </BoxSizer>
            </SizerItem>
            {heading('Reference Designators')}
            <SizerItem proportion={1} flag={wxEXPAND | wxBOTTOM | wxRIGHT | wxLEFT} border={5}>
              {/* gbSizer1, SetEmptyCellSize( wxSize( 40,10 ) ) */}
              <GridBagSizer emptyCellSize={[40, 10]} growableCols={[1, 4]}>
                <SizerItem pos={[0, 0]} flag={CV | wxTOP | wxBOTTOM | wxLEFT} border={5}>
                  <StaticText
                    label="Front reference start:"
                    title="Starting reference designation for front."
                  />
                </SizerItem>
                <SizerItem pos={[0, 1]} flag={wxALL | wxEXPAND} border={5} minSize={[100, -1]}>
                  <TextCtrl
                    value={p.m_FrontRefDesStart.value}
                    onChange={p.m_FrontRefDesStart.onChange}
                    title="Default is 1"
                    ariaLabel="Front reference start"
                  />
                </SizerItem>
                <SizerItem pos={[0, 3]} flag={CV | wxTOP | wxBOTTOM | wxLEFT} border={5}>
                  <StaticText
                    label="Back reference start:"
                    title="Blank continues from front or enter a number greater than the highest reference designation on the front."
                  />
                </SizerItem>
                <SizerItem pos={[0, 4]} flag={wxALL | wxEXPAND} border={5} minSize={[100, -1]}>
                  <TextCtrl
                    value={p.m_BackRefDesStart.value}
                    onChange={p.m_BackRefDesStart.onChange}
                    title="Leave blank or zero, or enter a number greater than the highest reference designation on the front."
                    ariaLabel="Back reference start"
                  />
                </SizerItem>
                <SizerItem pos={[1, 0]} flag={CV | wxBOTTOM | wxLEFT} border={5}>
                  <StaticText
                    label="Front prefix:"
                    title="Optional prefix for component side reference designations (e.g. F_)"
                  />
                </SizerItem>
                <SizerItem pos={[1, 1]} flag={wxEXPAND | wxBOTTOM | wxRIGHT | wxLEFT} border={5}>
                  <TextCtrl
                    value={p.m_FrontPrefix.value}
                    onChange={p.m_FrontPrefix.onChange}
                    title="Optional prefix for component side reference designations (e.g. F_)"
                    ariaLabel="Front prefix"
                  />
                </SizerItem>
                <SizerItem pos={[1, 3]} flag={CV | wxBOTTOM | wxLEFT} border={5}>
                  <StaticText
                    label="Back prefix:"
                    title="Optional prefix for solder side reference designations (e.g. B_)"
                  />
                </SizerItem>
                <SizerItem pos={[1, 4]} flag={wxEXPAND | wxBOTTOM | wxRIGHT | wxLEFT} border={5}>
                  <TextCtrl
                    value={p.m_BackPrefix.value}
                    onChange={p.m_BackPrefix.onChange}
                    title="Optional prefix for solder side reference designations (e.g. B_)"
                    ariaLabel="Back prefix"
                  />
                </SizerItem>
                <SizerItem
                  pos={[2, 0]}
                  span={[1, 2]}
                  flag={wxBOTTOM | wxRIGHT | wxLEFT | wxEXPAND}
                  border={5}
                >
                  <CheckBox
                    label="Remove front prefix"
                    check={p.m_RemoveFrontPrefix}
                    title={
                      'If checked will remove the front side prefix\nin the front prefix box if present'
                    }
                  />
                </SizerItem>
                <SizerItem
                  pos={[2, 3]}
                  span={[1, 2]}
                  flag={wxBOTTOM | wxRIGHT | wxLEFT | wxEXPAND}
                  border={5}
                >
                  <CheckBox
                    label="Remove back prefix"
                    check={p.m_RemoveBackPrefix}
                    title={
                      'If checked will remove the Back side prefix\nin the back prefix box if present'
                    }
                  />
                </SizerItem>
              </GridBagSizer>
            </SizerItem>
          </BoxSizer>
        </SizerItem>
        <SizerItem proportion={1} flag={wxEXPAND | wxTOP} border={15}>
          {/* bSizerMessages */}
          <BoxSizer orient={wxVERTICAL}>
            <SizerItem proportion={1} flag={wxEXPAND | wxLEFT | wxRIGHT} border={10}>
              <HtmlReportPanel
                lines={p.messages}
                fileName="report.txt"
                minHeight={300}
                visibleSeverities={p.visibleSeverities}
                onVisibleSeveritiesChange={p.onVisibleSeveritiesChange}
              />
            </SizerItem>
          </BoxSizer>
        </SizerItem>
        <SizerItem flag={wxEXPAND | wxLEFT} border={5}>
          {/* m_buttonsSizer */}
          <BoxSizer orient={wxHORIZONTAL}>
            <SizerItem proportion={1} flag={wxALL | wxEXPAND} border={5}>
              <StdDialogButtonSizer
                okLabel="Reannotate PCB"
                cancelLabel="Close"
                onOk={p.onOK}
                onCancel={p.onCancel}
              />
            </SizerItem>
          </BoxSizer>
        </SizerItem>
      </BoxSizer>
    </DialogShim>
  );
}
