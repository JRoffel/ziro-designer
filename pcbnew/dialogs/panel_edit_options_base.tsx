// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `PANEL_EDIT_OPTIONS_BASE` (pcbnew/dialogs/panel_edit_options_base.cpp): the board and footprint
 * editors' Editing Options page, Add() for Add(). The left column is shared - Editing Options, the
 * board-only m_sizerBoardEdit, and the Left Click Mouse Commands for Windows/Linux and for macOS,
 * one of which the class hides. On the right m_optionsBook: page 0 the footprint editor's Magnetic
 * Points, page 1 the board editor's Magnetic Points, Ratsnest and Miscellaneous. The behaviour is
 * PANEL_EDIT_OPTIONS's (panel_edit_options.tsx).
 */
import type { JSX } from 'react';
import {
  type CHECK,
  type CHOICE,
  CheckBox,
  Choice,
  Panel,
  RadioButton,
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
import { Simplebook } from '@ziroeda/wx/simplebook.js';
import { BoxSizer, FlexGridSizer, SizerItem, Spacer } from '@ziroeda/wx/sizer.js';
import { SpinCtrl } from '@ziroeda/wx/spin_ctrl.js';

/** A radio pair: which of the two is set. */
type PAIR = { first: boolean; onFirst: () => void; onSecond: () => void };

export interface PANEL_EDIT_OPTIONS_BASE_PROPS {
  m_cbConstrainHV45Mode: CHECK;
  /** m_rotationAngle, a UNIT_BINDER in DEGREES. */
  m_rotationAngleCtrl: {
    value: string;
    onChange: (aText: string) => void;
    onBlur: () => void;
    units: string;
  };
  m_arcEditMode: CHOICE;
  /** m_sizerBoardEdit->Show( !m_isFootprintEditor ). */
  boardEditShown: boolean;
  m_trackMouseDragCtrl: CHOICE;
  /** m_rbFlipLeftRight / m_rbFlipTopBottom: first is left/right. */
  flip: PAIR;
  m_allowFreePads: CHECK;
  /** __WXOSX_MAC__: the macOS mouse commands instead of the Windows/Linux ones. */
  mac: boolean;
  /** m_rbToggleSel / m_rbHighlightNet (and the Mac pair): first is toggle selection. */
  ctrlClick: PAIR;
  /** m_rbHighlightNet->Show( false ) in the footprint editor. */
  highlightNetShown: boolean;
  /** m_optionsBook->SetSelection( isFootprintEditor ? 0 : 1 ). */
  optionsPage: 0 | 1;
  m_magneticPads: CHECK;
  m_magneticGraphics: CHECK;
  m_magneticPadChoice: CHOICE;
  m_magneticTrackChoice: CHOICE;
  m_magneticGraphicsChoice: CHOICE;
  m_showSelectedRatsnest: CHECK;
  m_OptDisplayCurvedRatsnestLines: CHECK;
  m_ratsnestThickness: { value: number; onChange: (aValue: number) => void };
  m_escClearsNetHighlight: CHECK;
  m_showPageLimits: CHECK;
  m_cbCourtyardCollisions: CHECK;
  m_autoRefillZones: CHECK;
}

const CV = wxALIGN_CENTER_VERTICAL;

function Heading({
  label,
  flag = wxTOP | wxRIGHT | wxLEFT,
}: {
  label: string;
  flag?: number;
}): JSX.Element {
  return (
    <>
      <SizerItem flag={flag} border={13}>
        <StaticText label={label} />
      </SizerItem>
      <SizerItem flag={wxEXPAND | wxTOP | wxBOTTOM} border={2}>
        <StaticLine />
      </SizerItem>
    </>
  );
}

export function PANEL_EDIT_OPTIONS_BASE(p: PANEL_EDIT_OPTIONS_BASE_PROPS): JSX.Element {
  /** One fgSizerCmds* label / action pair, each Add()ed wxRIGHT|wxLEFT, 5. */
  const cmd = (aKey: string, aAction: string, aFlag = wxRIGHT | wxLEFT) => (
    <>
      <SizerItem flag={aFlag} border={5}>
        <StaticText label={aKey} />
      </SizerItem>
      <SizerItem flag={aFlag} border={5}>
        <StaticText label={aAction} />
      </SizerItem>
    </>
  );
  const ctrlPair = (aGroup: string) => (
    <SizerItem proportion={1} flag={wxEXPAND | wxLEFT} border={5}>
      <BoxSizer orient={wxVERTICAL}>
        <SizerItem border={5}>
          <RadioButton
            label="Toggle selection"
            name={aGroup}
            checked={p.ctrlClick.first}
            onChange={p.ctrlClick.onFirst}
          />
        </SizerItem>
        <SizerItem flag={wxTOP} border={2} shown={p.highlightNetShown}>
          <RadioButton
            label="Highlight net (for pads/tracks)"
            name={aGroup}
            checked={!p.ctrlClick.first}
            onChange={p.ctrlClick.onSecond}
          />
        </SizerItem>
      </BoxSizer>
    </SizerItem>
  );
  const hint = (aText: string) => (
    <SizerItem flag={wxALL} border={5}>
      {/* the class's SetFont( KIUI::GetSmallInfoFont( this ).Italic() ) */}
      <StaticText label={aText} font="smallInfo" italic />
    </SizerItem>
  );
  const magnetic = ['Never', 'When routing tracks', 'Always'];

  const fpPage = (
    // fpOptionsSizer
    <BoxSizer orient={wxVERTICAL}>
      <Heading label="Magnetic Points" />
      <SizerItem flag={wxEXPAND | wxTOP | wxRIGHT | wxLEFT} border={5}>
        {/* bSizer13 */}
        <BoxSizer orient={wxVERTICAL}>
          <SizerItem flag={wxTOP | wxBOTTOM | wxLEFT} border={5}>
            <CheckBox label="Magnetic pads" check={p.m_magneticPads} />
          </SizerItem>
          <SizerItem flag={wxBOTTOM | wxLEFT} border={5}>
            <CheckBox label="Magnetic graphics" check={p.m_magneticGraphics} />
          </SizerItem>
        </BoxSizer>
      </SizerItem>
    </BoxSizer>
  );

  const pcbPage = (
    // pcbOptionsSizer
    <BoxSizer orient={wxVERTICAL}>
      <Heading label="Magnetic Points" flag={wxTOP | wxLEFT} />
      <SizerItem flag={wxEXPAND | wxALL} border={5}>
        {/* fgMagneticPoints = wxFlexGridSizer( 0, 2, 5, 0 ) */}
        <FlexGridSizer cols={2} vgap={5}>
          <SizerItem flag={CV | wxTOP | wxRIGHT | wxLEFT} border={5}>
            <StaticText
              label="Snap to pads:"
              title="Capture cursor when the mouse enters a pad area"
            />
          </SizerItem>
          <SizerItem flag={CV | wxEXPAND | wxTOP | wxRIGHT | wxLEFT} border={5}>
            <Choice
              choices={magnetic}
              choice={p.m_magneticPadChoice}
              ariaLabel="Snap to pads"
              title="Capture cursor when the mouse enters a pad area"
            />
          </SizerItem>
          <SizerItem flag={CV | wxRIGHT | wxLEFT} border={5}>
            <StaticText
              label="Snap to tracks and vias:"
              title="Capture cursor when the mouse approaches a track"
            />
          </SizerItem>
          <SizerItem flag={CV | wxEXPAND | wxLEFT | wxRIGHT} border={5}>
            <Choice
              choices={magnetic}
              choice={p.m_magneticTrackChoice}
              ariaLabel="Snap to tracks and vias"
              title="Capture cursor when the mouse approaches a track"
            />
          </SizerItem>
          <SizerItem flag={CV | wxBOTTOM | wxRIGHT | wxLEFT} border={5}>
            <StaticText
              label="Snap to graphics:"
              title="Capture cursor when the mouse approaches graphical control points"
            />
          </SizerItem>
          <SizerItem flag={CV | wxEXPAND | wxBOTTOM | wxRIGHT | wxLEFT} border={5}>
            <Choice
              choices={['Always', 'Never']}
              choice={p.m_magneticGraphicsChoice}
              ariaLabel="Snap to graphics"
              title="Capture cursor when the mouse approaches graphical control points"
            />
          </SizerItem>
        </FlexGridSizer>
      </SizerItem>
      <Spacer width={0} height={5} flag={wxEXPAND} border={5} />
      <Heading label="Ratsnest" flag={wxTOP | wxLEFT} />
      <SizerItem flag={wxEXPAND | wxALL} border={5}>
        {/* bRatsnest */}
        <BoxSizer orient={wxVERTICAL}>
          <SizerItem flag={wxALL} border={5}>
            <CheckBox label="Always show selected ratsnest" check={p.m_showSelectedRatsnest} />
          </SizerItem>
          <SizerItem flag={wxBOTTOM | wxRIGHT | wxLEFT} border={5}>
            <CheckBox
              label="Show ratsnest with curved lines"
              check={p.m_OptDisplayCurvedRatsnestLines}
            />
          </SizerItem>
          <SizerItem proportion={1} flag={wxEXPAND | wxBOTTOM} border={5}>
            {/* bRatsnestLineThickness */}
            <BoxSizer orient={wxHORIZONTAL}>
              <SizerItem flag={CV | wxBOTTOM | wxRIGHT | wxLEFT} border={5}>
                <StaticText label="Ratsnest line thickness:" />
              </SizerItem>
              <SizerItem flag={CV | wxBOTTOM | wxRIGHT | wxLEFT} border={5}>
                {/* wxSpinCtrlDouble( …, 0.5, 10, 0.5, 0.5 ), SetDigits( 1 ) */}
                <SpinCtrl
                  value={p.m_ratsnestThickness.value}
                  onChange={p.m_ratsnestThickness.onChange}
                  min={0.5}
                  max={10}
                  step={0.5}
                  digits={1}
                  ariaLabel="Ratsnest line thickness"
                />
              </SizerItem>
            </BoxSizer>
          </SizerItem>
        </BoxSizer>
      </SizerItem>
      <Heading label="Miscellaneous" />
      <SizerItem proportion={1} flag={wxEXPAND | wxALL} border={5}>
        {/* bMiscellaneous */}
        <BoxSizer orient={wxVERTICAL}>
          <SizerItem flag={wxTOP | wxBOTTOM | wxLEFT} border={5}>
            <CheckBox label="<ESC> clears net highlighting" check={p.m_escClearsNetHighlight} />
          </SizerItem>
          <SizerItem flag={wxBOTTOM | wxRIGHT | wxLEFT} border={5}>
            <CheckBox
              label="Show page limits"
              title="Draw an outline to show the sheet size."
              check={p.m_showPageLimits}
            />
          </SizerItem>
          <SizerItem flag={wxBOTTOM | wxRIGHT | wxLEFT} border={5}>
            <CheckBox
              label="Show courtyard collisions when moving/dragging"
              check={p.m_cbCourtyardCollisions}
            />
          </SizerItem>
          <SizerItem flag={wxBOTTOM | wxRIGHT | wxLEFT} border={5}>
            <CheckBox
              label="Automatically refill zones"
              title="If checked, zones will be re-filled after each edit operation"
              check={p.m_autoRefillZones}
            />
          </SizerItem>
        </BoxSizer>
      </SizerItem>
    </BoxSizer>
  );

  return (
    // bPanelSizer
    <BoxSizer orient={wxHORIZONTAL}>
      <SizerItem proportion={1} flag={wxRIGHT} border={5}>
        {/* bMargins */}
        <BoxSizer orient={wxHORIZONTAL}>
          <SizerItem flag={wxEXPAND | wxRIGHT} border={10}>
            {/* bMiddleLeftSizer */}
            <BoxSizer orient={wxVERTICAL}>
              <Heading label="Editing Options" />
              <SizerItem flag={wxEXPAND | wxALL} border={5}>
                {/* bSizerUniversal */}
                <BoxSizer orient={wxVERTICAL}>
                  <SizerItem flag={wxTOP | wxBOTTOM | wxLEFT} border={5}>
                    <CheckBox
                      label="Constrain actions to H, V, 45 degrees"
                      check={p.m_cbConstrainHV45Mode}
                    />
                  </SizerItem>
                  <SizerItem flag={wxEXPAND} border={5}>
                    {/* bSizerRotationStep */}
                    <BoxSizer orient={wxHORIZONTAL}>
                      <SizerItem flag={CV | wxBOTTOM | wxRIGHT | wxLEFT} border={5}>
                        {/* _("Step for &rotate commands:"): the & is the mnemonic. */}
                        <StaticText label="Step for rotate commands:" />
                      </SizerItem>
                      <SizerItem
                        flag={CV | wxBOTTOM | wxRIGHT | wxLEFT}
                        border={5}
                        minSize={[60, -1]}
                      >
                        <TextCtrl
                          value={p.m_rotationAngleCtrl.value}
                          onChange={p.m_rotationAngleCtrl.onChange}
                          onBlur={p.m_rotationAngleCtrl.onBlur}
                          title="Set increment (in degrees) for context menu and hotkey rotation."
                          ariaLabel="Step for rotate commands"
                        />
                      </SizerItem>
                      <SizerItem flag={CV | wxBOTTOM | wxRIGHT} border={5}>
                        <StaticText label={p.m_rotationAngleCtrl.units} />
                      </SizerItem>
                    </BoxSizer>
                  </SizerItem>
                  <Spacer width={0} height={3} border={5} />
                  <SizerItem flag={wxLEFT} border={5}>
                    <StaticText label="Arc editing mode:" />
                  </SizerItem>
                  <Spacer width={0} height={3} flag={wxEXPAND} border={5} />
                  <SizerItem flag={wxEXPAND | wxBOTTOM | wxRIGHT | wxLEFT} border={5}>
                    <Choice
                      choices={[
                        'Keep center, adjust radius',
                        'Keep endpoints or direction of starting point',
                        'Keep center and radius, adjust endpoints',
                      ]}
                      choice={p.m_arcEditMode}
                      ariaLabel="Arc editing mode"
                    />
                  </SizerItem>
                </BoxSizer>
              </SizerItem>
              <SizerItem
                flag={wxEXPAND | wxBOTTOM | wxRIGHT | wxLEFT}
                border={5}
                shown={p.boardEditShown}
              >
                {/* m_sizerBoardEdit */}
                <BoxSizer orient={wxVERTICAL}>
                  <Spacer width={0} height={3} flag={wxEXPAND} border={5} />
                  <SizerItem flag={wxRIGHT | wxLEFT} border={5}>
                    <StaticText label="Track mouse-drag mode:" />
                  </SizerItem>
                  <Spacer width={0} height={3} flag={wxEXPAND} border={5} />
                  <SizerItem flag={wxBOTTOM | wxRIGHT | wxLEFT | wxEXPAND} border={5}>
                    <Choice
                      choices={['Move', 'Drag (45 degree mode)', 'Drag (free angle)']}
                      choice={p.m_trackMouseDragCtrl}
                      ariaLabel="Track mouse-drag mode"
                    />
                  </SizerItem>
                  <SizerItem proportion={1} flag={wxEXPAND | wxTOP | wxBOTTOM} border={5}>
                    {/* bSizerFlip */}
                    <BoxSizer orient={wxHORIZONTAL}>
                      <SizerItem flag={wxALL | CV} border={5}>
                        <StaticText label="Flip board items:" />
                      </SizerItem>
                      <SizerItem flag={CV | wxRIGHT | wxLEFT} border={10}>
                        <RadioButton
                          label="Left/right"
                          name="ze-edit-flip"
                          checked={p.flip.first}
                          onChange={p.flip.onFirst}
                        />
                      </SizerItem>
                      <SizerItem flag={CV | wxRIGHT | wxLEFT} border={10}>
                        <RadioButton
                          label="Top/bottom"
                          name="ze-edit-flip"
                          checked={!p.flip.first}
                          onChange={p.flip.onSecond}
                        />
                      </SizerItem>
                    </BoxSizer>
                  </SizerItem>
                  <SizerItem flag={wxTOP | wxBOTTOM | wxLEFT} border={5}>
                    <CheckBox
                      label="Allow free pads"
                      title="If checked, pads can be moved with respect to the rest of the footprint."
                      check={p.m_allowFreePads}
                    />
                  </SizerItem>
                </BoxSizer>
              </SizerItem>
              <Heading label="Left Click Mouse Commands" />
              <SizerItem
                proportion={1}
                flag={wxEXPAND | wxTOP | wxRIGHT | wxLEFT}
                border={5}
                shown={!p.mac}
              >
                {/* m_mouseCmdsWinLin */}
                <BoxSizer orient={wxVERTICAL}>
                  {hint('Left click (and drag) actions depend on 2 modifier keys:\nShift and Ctrl')}
                  <SizerItem proportion={1} flag={wxEXPAND | wxTOP} border={5}>
                    {/* fgSizerCmdsWinLin = wxFlexGridSizer( 0, 2, 8, 0 ) */}
                    <FlexGridSizer cols={2} vgap={8}>
                      {cmd('Click:', 'Select item(s)')}
                      {cmd('Long Click:', 'Clarify selection from menu')}
                      {cmd('Shift:', 'Add item(s) to selection')}
                      {cmd('Ctrl+Shift:', 'Remove item(s) from selection')}
                      <SizerItem flag={wxRIGHT | wxLEFT} border={5}>
                        <StaticText label="Ctrl:" />
                      </SizerItem>
                      {ctrlPair('ze-edit-ctrl')}
                    </FlexGridSizer>
                  </SizerItem>
                </BoxSizer>
              </SizerItem>
              <SizerItem proportion={1} flag={wxEXPAND | wxALL} border={5} shown={p.mac}>
                {/* m_mouseCmdsOSX */}
                <BoxSizer orient={wxVERTICAL}>
                  {hint(
                    'Left click (and drag) actions depend on 3 modifier keys:\nOption, Shift and Cmd',
                  )}
                  <SizerItem proportion={1} flag={wxEXPAND | wxTOP} border={5}>
                    {/* fgSizerCmdsOSX */}
                    <FlexGridSizer cols={2} vgap={8}>
                      {cmd('Click:', 'Select item(s)')}
                      {cmd('Long Click:', 'Clarify selection from menu')}
                      {cmd('Shift:', 'Add item(s) to selection')}
                      {cmd('Shift+Cmd:', 'Remove item(s) from selection')}
                      <SizerItem flag={wxRIGHT | wxLEFT} border={5}>
                        <StaticText label="Cmd:" />
                      </SizerItem>
                      {ctrlPair('ze-edit-ctrl-mac')}
                      {cmd('Option:', 'Clarify selection from menu', wxBOTTOM | wxLEFT | wxRIGHT)}
                    </FlexGridSizer>
                  </SizerItem>
                </BoxSizer>
              </SizerItem>
            </BoxSizer>
          </SizerItem>
          <Spacer width={20} height={0} flag={wxEXPAND} border={5} />
          <SizerItem flag={wxEXPAND | wxBOTTOM | wxRIGHT | wxLEFT} border={5}>
            {/* m_optionsBook: fpPage and pcbPage */}
            <Simplebook
              selection={p.optionsPage}
              pages={[<Panel key="fp">{fpPage}</Panel>, <Panel key="pcb">{pcbPage}</Panel>]}
            />
          </SizerItem>
        </BoxSizer>
      </SizerItem>
    </BoxSizer>
  );
}
