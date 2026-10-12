// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * PANEL_SETUP_RULES (pcbnew/dialogs/panel_setup_rules.cpp): OnCompile through DRC_RULES_PARSER
 * and checkPlausibility into the errors report, and a parse error's line:offset link.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PanelPcbCustomRules, compileRules } from '@ziroeda/pcbnew/dialogs/panel_setup_rules.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';

afterEach(cleanup);

const board = () =>
  ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (25 "Edge.Cuts" user))
  (net 0 ""))`);

const RULE = (aName: string, aCond: string, aLayer = '') =>
  `(rule "${aName}" ${aLayer}(condition "${aCond}") (constraint clearance (min 0.2mm)))\n`;

describe('PANEL_SETUP_RULES::OnCompile', () => {
  it('a clean file reports No errors found.', () => {
    expect(compileRules(`(version 1)\n${RULE('a', "A.Type == 'Via'")}`, board())).toEqual([
      'No errors found.',
    ]);
  });

  it('two rules on one condition are a warning naming both', () => {
    const out = compileRules(
      `(version 1)\n${RULE('a', "A.Type == 'Via'")}${RULE('b', "A.Type == 'Via'")}`,
      board(),
    );
    expect(out).toContain("Rules 'b' and 'a' share the same condition.");
  });

  it('the same condition on different layers is not', () => {
    const out = compileRules(
      `(version 1)\n${RULE('a', "A.Type == 'Via'", '(layer "F.Cu") ')}${RULE('b', "A.Type == 'Via'", '(layer "B.Cu") ')}`,
      board(),
    );
    expect(out.join('\n')).not.toContain('share the same condition');
  });

  it('an undefined netclass is named', () => {
    const out = compileRules(`(version 1)\n${RULE('a', "A.NetClass == 'Power'")}`, board());
    expect(out).toContain("Rule 'a' references undefined netclass 'Power'.");
  });

  it('a layer the board does not enable is named', () => {
    const out = compileRules(
      `(version 1)\n${RULE('a', "A.Type == 'Via'", '(layer "In1.Cu") ')}`,
      board(),
    );
    expect(out).toContain("Rule 'a' references undefined layer(s): In1.Cu.");
  });
});

describe('the page', () => {
  it('Check rule syntax fills the report, and an error link puts the caret on the line', () => {
    let text = '(version 1)\n(rule "a"\n  (constraint clearance (min 0.2mm))\n  (bogus))\n';
    render(
      <PanelPcbCustomRules value={{ text }} onChange={(v) => (text = v.text)} board={board()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check rule syntax' }));
    const link = document.querySelector('.ze-html-report-box a') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    const [line] = (link.getAttribute('href') ?? '').split(':');
    fireEvent.click(link);
    const editor = screen.getByRole('textbox', { name: 'DRC Rules' }) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(editor);
    const before = editor.value.slice(0, editor.selectionStart);
    expect(before.split('\n').length).toBe(Number(line));
  });

  it('draws a line-number margin', () => {
    render(<PanelPcbCustomRules value={{ text: 'a\nb\nc' }} onChange={() => {}} />);
    expect(document.querySelector('.ze-stc-margin')?.textContent).toBe('1\n2\n3');
  });
});
