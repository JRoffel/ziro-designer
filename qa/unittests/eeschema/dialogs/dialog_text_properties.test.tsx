// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_TEXT_PROPERTIES over its _base: the text box rows only for a box, onBorderChecked
 * (enables the border controls, a ticked border with no width takes the default thickness),
 * onFillChecked, the Link handlers (typing ticks Link, unticking clears and ticking restores),
 * m_hyperlinkCombo's pages / separator / schemes, and Syntax help opening the frame's window.
 */
import { resolve } from 'node:path';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import {
  DIALOG_TEXT_PROPERTIES,
  DialogTextProperties,
} from '@ziroeda/eeschema/dialogs/dialog_text_properties.js';
import { SCH_TEXT } from '@ziroeda/eeschema/sch_text.js';
import { SCH_TEXTBOX } from '@ziroeda/eeschema/sch_textbox.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openProject, schFrame, schToolHarness } from '../support/sch_tool_harness.js';

const ORACLE = resolve(__dirname, '../../../data/eeschema/netlist_oracle/complex_hierarchy');
const SHEETS = ['complex_hierarchy.kicad_sch', 'ampli_ht.kicad_sch', 'complex_hierarchy.kicad_pro'];

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => {
  cleanup();
  SetPgm(null);
});

function open(aBox: boolean) {
  const h = schToolHarness(schFrame({}));
  openProject(h.frame, ORACLE, 'complex_hierarchy', SHEETS);
  h.frame.SetCurrentSheet(h.frame.Schematic().Hierarchy()[0]!);
  const item = aBox ? new SCH_TEXTBOX() : new SCH_TEXT({ x: 0, y: 0 }, 'hello');
  if (aBox) item.SetText('box');
  h.frame.AddToScreen(item, h.frame.GetScreen());
  const help = vi.fn();
  h.frame.SetBusSyntaxHelpPresenter(help);
  const dlg = new DIALOG_TEXT_PROPERTIES(h.frame, item);
  const onOk = vi.fn();
  render(
    <DialogTextProperties
      dlg={dlg}
      initial={dlg.TransferDataToWindow()}
      units="mm"
      onOk={onOk}
      onCancel={() => {}}
    />,
  );
  return { dlg, help, onOk };
}

const link = () => screen.getByLabelText('Link') as HTMLInputElement;
const linkCb = () => screen.getByLabelText('Link:') as HTMLInputElement;

describe('DIALOG_TEXT_PROPERTIES_BASE', () => {
  it('a text has no border or fill rows; a box does, titled Text Box Properties', () => {
    open(false);
    expect(screen.getByRole('dialog', { name: 'Text Properties' })).toBeTruthy();
    expect(screen.queryByLabelText('Border')).toBeNull();
    expect(screen.queryByLabelText('Background fill')).toBeNull();
    cleanup();
    open(true);
    expect(screen.getByRole('dialog', { name: 'Text Box Properties' })).toBeTruthy();
    expect(screen.getByLabelText('Background fill')).toBeTruthy();
  });

  it('onBorderChecked: the width follows the box and a ticked border takes the default width', () => {
    open(true);
    const width = screen.getByLabelText('Border width') as HTMLInputElement;
    const border = screen.getByLabelText('Border') as HTMLInputElement;
    if (border.checked) fireEvent.click(border);
    expect(width.disabled).toBe(true);
    fireEvent.change(width, { target: { value: '' } });
    fireEvent.click(border);
    expect(width.disabled).toBe(false);
    // default_line_thickness 6 mils = 0.1524 mm.
    expect(width.value).toBe('0.1524');
  });

  it('onHyperlinkText ticks Link; unticking clears it and ticking puts it back', () => {
    open(false);
    expect(linkCb().checked).toBe(false);
    fireEvent.change(link(), { target: { value: '#2' } });
    expect(linkCb().checked).toBe(true);
    fireEvent.click(linkCb());
    expect(link().value).toBe('');
    fireEvent.click(linkCb());
    expect(link().value).toBe('#2');
  });

  it('the link list: one "Page n (name)" per sheet, a separator, then the three schemes', () => {
    const { dlg } = open(false);
    const choices = dlg.HyperlinkChoices();
    expect(choices[0]).toEqual({ text: '#1', menuText: 'Page 1 (<root sheet>)' });
    const sep = choices.findIndex((c) => c.text === '---');
    expect(sep).toBeGreaterThan(0);
    expect(choices.slice(sep + 1).map((c) => c.menuText)).toEqual([
      'file://...',
      'http://...',
      'https://...',
    ]);
  });

  it('Syntax help opens the frame syntax help', () => {
    const { help } = open(false);
    fireEvent.click(screen.getByText('Syntax help'));
    expect(help).toHaveBeenCalledTimes(1);
  });
});
