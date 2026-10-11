// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_CHANGE_SYMBOLS' chrome, against the numbers wxWidgets itself reports
 * on this desktop.
 *
 * `qa/probes/change_symbols_probe.cpp` transcribes `dialog_change_symbols_base.cpp`
 * and `wx_html_report_panel_base.cpp` into real widgets, runs them under the
 * live GTK theme and prints what the toolkit decides:
 *
 *     dialog GetClientSize                    956 x 753
 *     m_mainSizer CalcMin                     956 x 753
 *     bSizerUpdate CalcMin                    956          <- the width driver
 *     m_updateFieldsSizer CalcMin             246
 *     m_updateOptionsSizer CalcMin            624
 *     wxRadioButton GetBestSize               239 x 22
 *     wxTextCtrl GetBestSize                   98 x 34
 *     wxCheckBox GetBestSize                  180 x 22
 *     match row centres                        d=30, 36, 37, 37
 *     wxSYS_COLOUR_LISTBOX                    #272727
 *     wxSYS_COLOUR_WINDOW                     #272727
 *     wxSYS_COLOUR_3DFACE                     #373737
 *
 * Three things this file pins, each of which was wrong:
 *
 *  1. Both inset surfaces — the wxCheckListBox of fields and the report panel's
 *     HTML window — were filled with --ctl-face (#373737), the BUTTON face, so
 *     they read as raised where KiCad's are sunken. They are LISTBOX / WINDOW,
 *     both #272727.
 *  2. The five match rows had their bottom borders folded into the grid's row
 *     gap, which gave every row the same pitch. Only the top two rows carry
 *     `wxBOTTOM 5`; rows 2-4 carry no vertical border at all, and their height
 *     is an entry's (34) against a radio's (22). That is what makes wx's
 *     30 / 36 / 37 / 37 rather than one number.
 *  3. The dialog's width is `bSizerUpdate`'s minimum and nothing else, so the
 *     boxes' 10 px borders and the 2:4 proportions have to be exact; a blanket
 *     body padding sitting outside them cannot be there.
 *
 * happy-dom implements no layout, so every assertion here is on the stated
 * declaration, never on a measured box. Since the dialog became its _base.cpp pair the
 * sizer numbers live in dialog_change_symbols_base.tsx as Add() flags and borders, so the
 * layout half of this file reads them there; the colour and font half reads shell.css.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SHELL = readFileSync(join(__dirname, '../../../common/widgets/shell.css'), 'utf8');
const BASE = readFileSync(
  join(__dirname, '../../../eeschema/dialogs/dialog_change_symbols_base.tsx'),
  'utf8',
);

/** The `<SizerItem ...>` opening tag that encloses the first line containing `marker`. */
function itemAround(marker: string): string {
  const at = BASE.indexOf(marker);
  if (at < 0) throw new Error(`no ${marker} in the base`);
  const open = BASE.lastIndexOf('<SizerItem', at);
  return BASE.slice(open, BASE.indexOf('>', BASE.indexOf('border=', open)) + 1);
}

/** The declarations of one rule, by exact selector, comments stripped. */
function rule(selector: string): string {
  const at = SHELL.indexOf(`\n${selector} {`);
  if (at < 0) throw new Error(`no rule for ${selector}`);
  const open = SHELL.indexOf('{', at);
  const body = SHELL.slice(open + 1, SHELL.indexOf('}', open));
  return body.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** One declaration's value, or undefined when the rule does not state it. */
function decl(selector: string, prop: string): string | undefined {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(rule(selector));
  return m?.[1]?.trim();
}

/** A `--token: value` from :root. */
function token(name: string): string {
  const m = new RegExp(`\\n\\s*${name}\\s*:\\s*([^;]+)`).exec(SHELL);
  if (!m?.[1]) throw new Error(`no token ${name}`);
  return m[1].trim().split('/*')[0]!.trim();
}

describe('the inset surfaces take the listbox/window colour, not the button face', () => {
  it('the tokens still hold what wx reports for those three system colours', () => {
    // The probe: LISTBOX and WINDOW are both #272727; 3DFACE is #373737.
    expect(token('--chrome-bg2')).toBe('#272727');
    expect(token('--ctl-face')).toBe('#373737');
  });

  it('m_fieldsBox, a wxCheckListBox, is wxSYS_COLOUR_LISTBOX', () => {
    // m_fieldsBox is external/wx/checklst's CheckListBox, drawn as `.ze-gridlist`; its ground
    // is the view's #272727 under the --panel-bg name.
    const bg = decl('.ze-gridlist', 'background');
    expect(bg).toBe('var(--panel-bg)');
    expect(token('--panel-bg')).toBe('#272727');
  });

  it('the report panel’s message view is wxSYS_COLOUR_WINDOW', () => {
    // HTML_WINDOW::onThemeChanged sets it explicitly, which is why it is the
    // one surface a GTK backdrop does not shift (html_window.cpp:59).
    expect(decl('.ze-report-view', 'background')).toBe('var(--chrome-bg2)');
  });

  it('and neither one is the button face', () => {
    for (const sel of ['.ze-gridlist', '.ze-report-view'])
      expect(decl(sel, 'background')).not.toBe('var(--ctl-face)');
  });
});

describe('the five match rows keep wx’s uneven pitch', () => {
  it('the row gap is the wxGridBagSizer’s vgap alone', () => {
    // `new wxGridBagSizer( 3, 0 )`, and the derived SetEmptyCellSize( wxSize( 0, 0 ) ).
    expect(BASE).toMatch(/<GridBagSizer\s+vgap=\{3\}\s+hgap=\{0\}\s+emptyCellSize=\{\[0, 0\]\}/);
  });

  it('and only the two rows that carry wxBOTTOM 5 add anything to it', () => {
    // m_matchAll (:29) and m_matchBySelection (:32); rows 2-4 state no vertical border.
    for (const r of ['{radio(0)}', '{radio(1)}']) {
      expect(itemAround(r)).toContain('wxALIGN_CENTER_VERTICAL | wxBOTTOM');
      expect(itemAround(r)).toContain('border={5}');
    }
    for (const r of ['{radio(2)}', '{radio(3)}', '{radio(4)}'])
      expect(itemAround(r)).not.toContain('wxBOTTOM');
  });
});

describe('the width is bSizerUpdate’s minimum, so its borders must be exact', () => {
  it('the two boxes carry the proportions 2 and 4, with wxTOP|wxRIGHT|wxLEFT 10 and wxTOP|wxRIGHT 10', () => {
    const fields = itemAround('{/* m_updateFieldsSizer */}');
    expect(fields).toContain('proportion={2}');
    expect(fields).toContain('wxEXPAND | wxTOP | wxRIGHT | wxLEFT');
    expect(fields).toContain('border={10}');
    const options = itemAround('{/* m_updateOptionsSizer, wxHORIZONTAL */}');
    expect(options).toContain('proportion={4}');
    expect(options).toContain('wxEXPAND | wxTOP | wxRIGHT}');
    expect(options).toContain('border={10}');
  });

  it('and the 5 px spacer between them', () => {
    // `bSizerUpdate->Add( 5, 0, 0, wxEXPAND, 5 )`.
    expect(BASE).toContain('<Spacer width={5} height={0} flag={wxEXPAND} border={5} />');
  });

  it('the wxRIGHT 10 is on the left option column only', () => {
    // `Add( bSizer8, 1, wxEXPAND|wxRIGHT, 10 )`; bSizer9 is added wxEXPAND, 5.
    expect(itemAround('{/* bSizer8 */}')).toContain('wxEXPAND | wxRIGHT}');
    expect(itemAround('{/* bSizer8 */}')).toContain('border={10}');
    expect(itemAround('{/* bSizer9 */}')).not.toContain('wxRIGHT');
  });
});

/**
 * The bug that actually kept this dialog narrow, and the reason it survived a
 * fix: there are TWO copies of the label-column rule.
 *
 *     .ze-label-dialog-body .row > span   { width: 56px; flex: 0 0 auto }
 *     .ze-props-group label.row > span    { width: 56px; flex: 0 0 auto }
 *
 * The first was scoped to `:first-child` when the match radios came out one
 * word per line. The second was not — and it is the one that applies inside a
 * group box, so every checkbox in Update Options was still being crushed into
 * a 56 px column. At (0,2,2) it beat `.ze-chsym-opt > span`'s `nowrap` at
 * (0,1,1), so the labels could neither wrap nor size, and they printed on top
 * of the box beside them.
 *
 * Measured against the real build with the label column freed, the dialog goes
 * from 728 px to 977 against the 956 wx reports.
 *
 * A caption span is the one BEFORE the control. A checkbox or radio carries
 * its label inside the one control, so a span that is not `:first-child` is
 * never a caption — and that is per-rule, not per-file, so every copy is
 * checked rather than just the first.
 */
describe('a control that carries its own label is never given a label column', () => {
  const labelColumnRules = (): string[] => {
    const hits: string[] = [];
    // Every selector whose body fixes a span at the 56 px caption width.
    const re = /\n([^\n{}]*>\s*span[^\n{}]*)\{([^}]*)\}/g;
    for (const m of SHELL.matchAll(re))
      if (/width:\s*56px/.test(m[2] ?? '')) hits.push((m[1] ?? '').trim());
    return hits;
  };

  it('both copies of the rule exist and both are :first-child scoped', () => {
    const rules = labelColumnRules();
    // If a third copy is ever added, it is caught here rather than by a user.
    expect(rules.length).toBeGreaterThanOrEqual(2);
    for (const sel of rules) expect(sel).toContain(':first-child');
  });

  it('the indicator-to-label gap beats the shared .row rule that states 10px', () => {
    // `.ze-label-dialog-body .row { gap: 10px }` is (0,2,0) and outranks both
    // `.ze-chsym-opt` (0,1,0) and `.ze-props-group label` (0,1,1), so the fix
    // has to match its specificity — and still consume the token, not restate
    // a number.
    expect(decl('.ze-props-group label', 'gap')).toBe('var(--check-inset)');
  });
});

/**
 * WX_HTML_REPORT_PANEL's own chrome. It is a shared widget, so these six
 * dialogs get the same answer — ERC, DRC, Annotate, Plot, Export Netlist and
 * Update PCB from Schematic.
 *
 * A dialog has ONE font size, the GUI font, unless upstream asks for another
 * BY NAME. This panel restated three: 12px on the legend, 12px on the message
 * view, 12px on the Show: strip and 11px on the badges, against a dialog of
 * 14.67. Only two of those have a citation, and both are a POINT size:
 *
 *     NUMBER_BADGE::m_textSize( 10 )                          number_badge.cpp:33
 *
 * so the badge is --ui-font-size-info and EVERYTHING else inherits, the
 * message view included.
 *
 * The view was the second exception here, on the strength of
 *
 *     m_htmlView->SetFont( KIUI::GetInfoFont( m_htmlView ) )  wx_html_report_panel.cpp:47
 *     KIUI::GetInfoFont = getGUIFont( win, -1 )               ui_common.cpp:156
 *
 * and that reading is wrong. SetFont sets the WINDOW's font; a wxHtmlWindow
 * lays its content out through the parser's standard font sizes, which this
 * panel never sets — it calls no SetStandardFonts — and generateHtml emits
 * every line at `<font size=3>`, the parser's "normal". The rendered size is
 * the default GUI font.
 *
 * [px] Akshay's capture of the real dialog inks a 15 px band on that line;
 * ours inked 13 at 10pt. Ubuntu Sans 11pt is 14.67 px and its
 * ascender-to-descender lands at 15. The build does not render what the C++
 * appeared to promise, so the measurement wins.
 */
describe('the report panel has one font size, and names its one exception', () => {
  it('the Show: strip and the box label state no size of their own', () => {
    expect(decl('.ze-report-filters', 'font-size')).toBeUndefined();
    expect(decl('.ze-report-panel > legend', 'font-size')).toBeUndefined();
  });

  it("the message view states no size either, so it takes the dialog's", () => {
    // Not --ui-font-size-info: see the note above. A wxHtmlWindow's content
    // size does not follow SetFont, and the real dialog renders this line at
    // the GUI font.
    expect(decl('.ze-report-view', 'font-size')).toBeUndefined();
  });

  it("and the badge is NUMBER_BADGE's own 10 point", () => {
    expect(decl('.ze-badge', 'font-size')).toBe('var(--ui-font-size-info)');
  });

  it('with the token holding the point size, not a pixel count', () => {
    expect(token('--ui-font-size-info')).toBe('10pt');
    expect(token('--ui-font-size')).toBe('11pt');
  });

  it('no rule in the panel states a px font size at all', () => {
    // Per-rule, so a fourth one added later is caught rather than averaged out.
    const from = SHELL.indexOf('/* WX_HTML_REPORT_PANEL:');
    const block = SHELL.slice(from, SHELL.indexOf('.ze-mitem', from)).replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect([...block.matchAll(/font-size:\s*(\d+px)/g)].map((m) => m[1])).toStrictEqual([]);
  });
});

/** `m_messagePanel->SetMinSize( wxSize( -1,200 ) )`: the report panel's 200 px floor. */
describe('the output box keeps the 200 px upstream reserves for it', () => {
  it('as the sizer item’s minimum', () => {
    expect(itemAround('<HtmlReportPanel')).toContain('minSize={[-1, 200]}');
  });
});
