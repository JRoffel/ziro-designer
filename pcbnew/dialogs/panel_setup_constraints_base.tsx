// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `PANEL_SETUP_CONSTRAINTS_BASE` (pcbnew/dialogs/panel_setup_constraints_base.cpp): Board Setup's
 * Constraints page, Add() for Add(). A vertical-scrolling window holding, side by side, the
 * four-column fgFeatureConstraints (bitmap | label | control | units, four headed sections) and
 * sbFeatureRules (arc approximation, zone fill strategy, length tuning). The rows' Add() flags
 * differ one from another, so each is stated in the table below. The behaviour is
 * PANEL_SETUP_CONSTRAINTS's (panel_setup_constraints.tsx).
 */
import type { JSX } from 'react';
import {
  type CHECK,
  CheckBox,
  StaticBitmap,
  StaticLine,
  StaticText,
  TextCtrl,
} from '@ziroeda/wx/controls.js';
import {
  wxALIGN_CENTER_HORIZONTAL,
  wxALIGN_CENTER_VERTICAL,
  wxALIGN_LEFT,
  wxALL,
  wxBOTTOM,
  wxEXPAND,
  wxHORIZONTAL,
  wxLEFT,
  wxRIGHT,
  wxTOP,
  wxVERTICAL,
} from '@ziroeda/wx/defs.js';
import { ScrolledWindow } from '@ziroeda/wx/scrolwin.js';
import { BoxSizer, FlexGridSizer, SizerItem, Spacer } from '@ziroeda/wx/sizer.js';
import { SpinCtrl } from '@ziroeda/wx/spin_ctrl.js';

/** A UNIT_BINDER's control: its text, and the id PAGED_DIALOG focuses on an error. */
export type FIELD = { value: string; onChange: (aText: string) => void; id: string };

/** The rows of fgFeatureConstraints, keyed as the class names its UNIT_BINDERs. */
export type CONSTRAINT_ROW =
  | 'minClearance'
  | 'trackMinWidth'
  | 'minConn'
  | 'viaMinAnnulus'
  | 'viaMinSize'
  | 'holeClearance'
  | 'edgeClearance'
  | 'minGrooveWidth'
  | 'throughHoleMin'
  | 'holeToHoleMin'
  | 'uviaMinSize'
  | 'uviaMinDrill'
  | 'silkClearance'
  | 'minTextHeight'
  | 'minTextThickness';

export interface PANEL_SETUP_CONSTRAINTS_BASE_PROPS {
  fields: Record<CONSTRAINT_ROW, FIELD>;
  /** The units label every binder shows. */
  units: string;
  /** The class's SetBitmap( KiBitmapBundle( BITMAPS::…, 24 ) ), by row; a row absent has none. */
  bitmaps: Partial<Record<CONSTRAINT_ROW | 'fillet' | 'spoke', string | undefined>>;
  /** Show( false ) on the groove row unless ADVANCED_CFG::m_EnableCreepageSlot. */
  grooveShown: boolean;
  m_maxError: FIELD;
  /** m_stCircleToPolyWarning, after TransferDataToWindow's Printf. */
  m_stCircleToPolyWarning: string;
  m_allowExternalFilletsOpt: CHECK;
  m_minResolvedSpokeCountCtrl: { value: number; onChange: (aValue: number) => void };
  m_useHeightForLengthCalcs: CHECK;
}

const CV = wxALIGN_CENTER_VERTICAL;
const CH = wxALIGN_CENTER_HORIZONTAL;
const AL = wxALIGN_LEFT;

/** One row: [key, label, tooltip, bitmap flag, label flag, control flag, units flag]. */
type ROW = readonly [CONSTRAINT_ROW, string, string | undefined, number, number, number, number];

const SECTIONS: readonly (readonly [string, number, readonly ROW[]])[] = [
  [
    'Copper',
    wxTOP | wxLEFT,
    [
      [
        'minClearance',
        'Minimum clearance:',
        'The minimum clearance between copper items which do not belong to the same net. If set, this can only be reduced by custom rules.',
        CH | CV | wxRIGHT | wxLEFT,
        CV | wxRIGHT,
        CV | wxEXPAND | wxTOP | wxBOTTOM,
        CV | wxLEFT,
      ],
      [
        'trackMinWidth',
        'Minimum track width:',
        'The minimum track width. If set, this can only be reduced by custom rules.',
        CH | CV | wxRIGHT | wxLEFT,
        CV | AL | wxRIGHT,
        AL | wxEXPAND | CV | wxTOP | wxBOTTOM,
        CV | AL | wxLEFT,
      ],
      [
        'minConn',
        'Minimum connection width:',
        'The minimum copper width of connected copper items.',
        CH | CV | wxLEFT | wxRIGHT,
        CV | AL | wxRIGHT,
        CV | AL | wxBOTTOM | wxEXPAND | wxTOP,
        CV | AL | wxLEFT,
      ],
      [
        'viaMinAnnulus',
        'Minimum annular width:',
        'The minimum annular ring width. If set, this can only be reduced by custom rules.',
        CH | CV | wxRIGHT | wxLEFT,
        CV | wxRIGHT,
        CV | wxEXPAND | wxTOP | wxBOTTOM,
        CV | wxLEFT,
      ],
      [
        'viaMinSize',
        'Minimum via diameter:',
        'The minimum via diameter. If set, this can only be reduced by custom rules.',
        CH | CV | wxRIGHT | wxLEFT,
        CV | AL | wxRIGHT,
        CV | wxEXPAND | wxTOP | wxBOTTOM,
        CV | AL | wxLEFT,
      ],
      [
        'holeClearance',
        'Copper to hole clearance:',
        'The minimum clearance between a hole and an unassociated copper item. If set, this can only be reduced by custom rules.',
        CH | CV | wxRIGHT | wxLEFT,
        CV | wxRIGHT,
        wxEXPAND | CV | wxTOP | wxBOTTOM,
        wxALL | CV,
      ],
      [
        'edgeClearance',
        'Copper to edge clearance:',
        'The minimum clearance between the board edge and any copper item. If set, this can only be reduced by custom rules.',
        CH | CV | wxRIGHT | wxLEFT,
        CV | wxRIGHT,
        wxEXPAND | CV | wxTOP | wxBOTTOM,
        CV | wxLEFT,
      ],
      [
        'minGrooveWidth',
        'Minimum groove for creepage:',
        'The minimum slot width from DRC creepage checks',
        CH | CV | wxLEFT | wxRIGHT,
        CV | wxRIGHT,
        CV | wxBOTTOM | wxEXPAND | wxTOP,
        CV | wxLEFT,
      ],
    ],
  ],
  [
    'Holes',
    CH | wxTOP | wxLEFT,
    [
      [
        'throughHoleMin',
        'Minimum drill size:',
        'The minimum drill size. If set, this can only be reduced by custom rules.',
        CH | CV | wxRIGHT | wxLEFT,
        CV | AL | wxRIGHT,
        wxEXPAND | CV | wxTOP | wxBOTTOM,
        CV | AL | wxLEFT,
      ],
      [
        'holeToHoleMin',
        'Hole to hole clearance:',
        'The minimum clearance between two drilled holes. If set, this can only be reduced by custom rules. (Note: does not apply to milled holes.)',
        CH | CV | wxRIGHT | wxLEFT,
        CV | wxRIGHT,
        wxEXPAND | CV | wxTOP | wxBOTTOM,
        CV | wxLEFT,
      ],
    ],
  ],
  [
    'uVias',
    CH | wxTOP | wxLEFT,
    [
      [
        'uviaMinSize',
        'Minimum uVia diameter:',
        'The minimum diameter for micro-vias. If set, this can only be reduced by custom rules.',
        CH | CV | wxRIGHT | wxLEFT,
        CV | AL | wxRIGHT,
        wxEXPAND | CV | wxTOP | wxBOTTOM,
        CV | AL | wxLEFT,
      ],
      [
        'uviaMinDrill',
        'Minimum uVia hole:',
        'The minimum micro-via hole size. If set, this can only be reduced by custom rules.',
        CH | CV | wxRIGHT | wxLEFT,
        CV | AL | wxRIGHT,
        wxEXPAND | CV | wxTOP | wxBOTTOM,
        CV | AL | wxLEFT,
      ],
    ],
  ],
  [
    'Silk',
    CH | wxTOP | wxLEFT,
    [
      [
        'silkClearance',
        'Minimum item clearance:',
        'Minimum clearance between two items on the same silkscreen layer. If set this can improve legibility.  (Note: does not apply to multiple shapes within a single footprint.)',
        0,
        CV | wxTOP | wxRIGHT,
        CV | wxEXPAND | wxTOP,
        CV | wxTOP | wxLEFT,
      ],
      [
        'minTextHeight',
        'Minimum text height:',
        undefined,
        0,
        CV | wxTOP | wxRIGHT,
        wxEXPAND | CV | wxTOP,
        CV | wxTOP | wxLEFT,
      ],
      [
        'minTextThickness',
        'Minimum text thickness:',
        undefined,
        0,
        CV | wxTOP | wxRIGHT,
        wxEXPAND | CV | wxTOP,
        CV | wxTOP | wxLEFT,
      ],
    ],
  ],
];

/** The three spacer cells after a heading: Holes and uVias add them with wxTOP, the others not. */
const HEAD_SPACERS: Record<string, readonly [number, number][]> = {
  Copper: [
    [wxEXPAND, 5],
    [wxEXPAND, 5],
    [wxEXPAND, 5],
  ],
  Holes: [
    [wxEXPAND | wxTOP, 5],
    [wxEXPAND | wxTOP, 5],
    [wxEXPAND | wxTOP, 5],
  ],
  uVias: [
    [wxEXPAND | wxTOP, 2],
    [wxEXPAND | wxTOP, 5],
    [wxEXPAND | wxTOP, 5],
  ],
  Silk: [
    [wxEXPAND, 5],
    [wxEXPAND, 5],
    [wxEXPAND, 5],
  ],
};

export function PANEL_SETUP_CONSTRAINTS_BASE(p: PANEL_SETUP_CONSTRAINTS_BASE_PROPS): JSX.Element {
  const row = ([key, label, tip, bmpFlag, labelFlag, ctrlFlag, unitsFlag]: ROW) => {
    const shown = key !== 'minGrooveWidth' || p.grooveShown;
    const f = p.fields[key];
    const bitmap = p.bitmaps[key];
    return (
      <>
        {bitmap !== undefined || bmpFlag !== 0 ? (
          <SizerItem flag={bmpFlag} border={5} shown={shown}>
            <StaticBitmap bitmap={bitmap} />
          </SizerItem>
        ) : (
          // The Silk rows' first cell: Add( 0, 0, 1, wxEXPAND, 5 ).
          <Spacer width={0} height={0} proportion={1} flag={wxEXPAND} border={5} />
        )}
        <SizerItem flag={labelFlag} border={5} shown={shown}>
          <StaticText label={label} />
        </SizerItem>
        <SizerItem
          flag={ctrlFlag}
          border={5}
          shown={shown}
          minSize={key === 'trackMinWidth' || key === 'minConn' ? [120, -1] : undefined}
        >
          <TextCtrl
            id={f.id}
            value={f.value}
            onChange={f.onChange}
            title={tip}
            ariaLabel={label.replace(/:$/, '')}
          />
        </SizerItem>
        <SizerItem flag={unitsFlag} border={5} shown={shown}>
          <StaticText label={p.units} />
        </SizerItem>
      </>
    );
  };

  const section = ([title, headFlag, rows]: (typeof SECTIONS)[number]) => (
    <>
      <SizerItem flag={headFlag} border={13}>
        <StaticText label={title} />
      </SizerItem>
      {HEAD_SPACERS[title]!.map(([flag, border], i) => (
        <Spacer key={i} width={0} height={0} proportion={1} flag={flag} border={border} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        // Holes' fourth line is Add()ed wxEXPAND alone.
        <SizerItem
          key={i}
          flag={title === 'Holes' && i === 3 ? wxEXPAND : wxEXPAND | wxTOP | wxBOTTOM}
          border={2}
        >
          <StaticLine />
        </SizerItem>
      ))}
      {rows.map((r) => row(r))}
    </>
  );

  const heading = (aTitle: string) => (
    <>
      <SizerItem flag={wxTOP | wxLEFT} border={13}>
        <StaticText label={aTitle} />
      </SizerItem>
      <SizerItem flag={wxEXPAND | wxTOP | wxBOTTOM} border={2}>
        <StaticLine />
      </SizerItem>
    </>
  );

  return (
    // bMainSizer
    <BoxSizer orient={wxHORIZONTAL}>
      <SizerItem proportion={1} flag={wxEXPAND} border={5}>
        {/* m_scrolledWindow, wxVSCROLL */}
        <ScrolledWindow hscroll={false}>
          {/* bScrolledSizer */}
          <BoxSizer orient={wxHORIZONTAL}>
            <SizerItem flag={wxEXPAND | wxRIGHT} border={5}>
              {/* sbFeatureConstraints */}
              <BoxSizer orient={wxVERTICAL}>
                <SizerItem proportion={1} flag={wxEXPAND} border={5}>
                  {/* fgFeatureConstraints = wxFlexGridSizer( 0, 4, 0, 0 ) */}
                  <FlexGridSizer cols={4}>{SECTIONS.map((s) => section(s))}</FlexGridSizer>
                </SizerItem>
              </BoxSizer>
            </SizerItem>
            <Spacer width={0} height={0} flag={wxEXPAND | wxRIGHT | wxLEFT} border={15} />
            <SizerItem flag={wxEXPAND | wxRIGHT} border={5}>
              {/* sbFeatureRules */}
              <BoxSizer orient={wxVERTICAL}>
                <SizerItem flag={wxEXPAND} border={5}>
                  {/* bSizerArcToPoly */}
                  <BoxSizer orient={wxVERTICAL}>
                    {heading('Arc/Circle Approximations')}
                    <SizerItem flag={wxEXPAND | wxBOTTOM} border={5}>
                      {/* fgSizer2 = wxFlexGridSizer( 0, 4, 3, 0 ), AddGrowableCol( 2 ) */}
                      <FlexGridSizer cols={4} vgap={3} growableCols={[2]}>
                        <SizerItem flag={CV | AL | wxLEFT} border={5}>
                          <StaticText
                            label="Maximum allowed deviation:"
                            title={
                              'This is the maximum distance between a circle and the polygonal shape that approximate it.\nThe error max defines the number of segments of this polygon.'
                            }
                          />
                        </SizerItem>
                        <SizerItem flag={CV | wxALL | wxEXPAND | wxLEFT | wxRIGHT} border={5}>
                          <TextCtrl
                            id={p.m_maxError.id}
                            value={p.m_maxError.value}
                            onChange={p.m_maxError.onChange}
                            ariaLabel="Maximum allowed deviation"
                            title="The maximum allowed deviation between a true arc or circle and segments used to approximate it.  Smaller values produce smoother graphics at the expense of performance."
                          />
                        </SizerItem>
                        <SizerItem flag={CV | wxRIGHT} border={5}>
                          <StaticText label={p.units} />
                        </SizerItem>
                      </FlexGridSizer>
                    </SizerItem>
                    <SizerItem flag={wxBOTTOM | wxRIGHT | wxLEFT} border={5}>
                      {/* the class's SetFont( KIUI::GetSmallInfoFont( this ).Italic() ) */}
                      <StaticText label={p.m_stCircleToPolyWarning} font="smallInfo" italic />
                    </SizerItem>
                  </BoxSizer>
                </SizerItem>
                <SizerItem flag={wxEXPAND | wxTOP} border={10}>
                  {/* m_bSizerPolygonFillOption */}
                  <BoxSizer orient={wxVERTICAL}>
                    {heading('Zone Fill Strategy')}
                    <SizerItem flag={wxEXPAND | wxTOP} border={7}>
                      {/* bSizer9 */}
                      <BoxSizer orient={wxHORIZONTAL}>
                        <SizerItem flag={CV | wxRIGHT | wxLEFT} border={5}>
                          <StaticBitmap bitmap={p.bitmaps.fillet} />
                        </SizerItem>
                        <SizerItem flag={wxALL | CV} border={5}>
                          <CheckBox
                            label="Allow fillets/chamfers outside zone outline"
                            check={p.m_allowExternalFilletsOpt}
                          />
                        </SizerItem>
                      </BoxSizer>
                    </SizerItem>
                    <SizerItem proportion={1} flag={wxEXPAND | wxTOP | wxBOTTOM} border={5}>
                      {/* bSizer111 */}
                      <BoxSizer orient={wxHORIZONTAL}>
                        <SizerItem flag={wxRIGHT | wxLEFT | CV} border={5}>
                          <StaticBitmap bitmap={p.bitmaps.spoke} />
                        </SizerItem>
                        <SizerItem flag={CV | wxLEFT} border={5}>
                          <StaticText label="Minimum thermal relief spoke count:" />
                        </SizerItem>
                        <SizerItem flag={wxALL | CV} border={5}>
                          <SpinCtrl
                            value={p.m_minResolvedSpokeCountCtrl.value}
                            onChange={p.m_minResolvedSpokeCountCtrl.onChange}
                            min={0}
                            max={10}
                            ariaLabel="Minimum thermal relief spoke count"
                          />
                        </SizerItem>
                      </BoxSizer>
                    </SizerItem>
                  </BoxSizer>
                </SizerItem>
                <SizerItem proportion={1} flag={wxEXPAND} border={5}>
                  {/* bSizer11 */}
                  <BoxSizer orient={wxVERTICAL}>
                    {heading('Length Tuning')}
                    <SizerItem flag={wxALL} border={5}>
                      <CheckBox
                        label="Include stackup height in track length calculations"
                        title="When enabled, the distance between copper layers will be included in track length calculations for tracks with vias.  When disabled, via stackup height is ignored."
                        check={p.m_useHeightForLengthCalcs}
                      />
                    </SizerItem>
                  </BoxSizer>
                </SizerItem>
              </BoxSizer>
            </SizerItem>
            <Spacer width={0} height={0} proportion={1} flag={wxEXPAND} border={0} />
          </BoxSizer>
        </ScrolledWindow>
      </SizerItem>
    </BoxSizer>
  );
}
