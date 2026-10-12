// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Board Setup > Solder Mask/Paste: KiCad 10 enters the paste clearance and its
 * ratio in ONE field through MARGIN_OFFSET_BINDER, and hides the old ratio row
 * (pcbnew/dialogs/panel_setup_mask_and_paste.cpp:38-56, 68-69, 86-87).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type MaskPaste,
  PanelPcbMaskPaste,
} from '@ziroeda/pcbnew/dialogs/panel_setup_mask_and_paste.js';
import { freshBoardSetup } from './board_setup_test_utils.js';

afterEach(cleanup);

const field = (): HTMLInputElement =>
  screen.getByRole('textbox', { name: 'Solder paste clearance' }) as HTMLInputElement;

describe('the solder paste clearance field', () => {
  it('is one field; there is no relative-clearance row', () => {
    render(
      <PanelPcbMaskPaste value={freshBoardSetup().maskPaste} units="mm" onChange={() => {}} />,
    );
    expect(field()).toBeTruthy();
    expect(document.body.textContent).not.toContain('relative clearance');
  });

  it('shows the margin and the ratio together', () => {
    const value: MaskPaste = {
      ...freshBoardSetup().maskPaste,
      pasteClearanceMM: -0.1,
      pasteRelativePct: -5,
    };
    render(<PanelPcbMaskPaste value={value} units="mm" onChange={() => {}} />);
    expect(field().value).toBe('-0.1 - 5%');
  });

  it('writes both halves back from what was typed', () => {
    let last: MaskPaste | null = null;
    render(
      <PanelPcbMaskPaste
        value={freshBoardSetup().maskPaste}
        units="mm"
        onChange={(v) => (last = v)}
      />,
    );
    fireEvent.change(field(), { target: { value: '0.05mm+2%' } });
    fireEvent.blur(field());
    expect(field().value).toBe('0.05 + 2%');
    expect(last!.pasteClearanceMM).toBeCloseTo(0.05);
    expect(last!.pasteRelativePct).toBeCloseTo(2);
  });
});

describe('the solder mask fields', () => {
  it('are UNIT_BINDERs in the frame units', () => {
    const value: MaskPaste = { ...freshBoardSetup().maskPaste, maskExpansionMM: 0.0508 };
    render(<PanelPcbMaskPaste value={value} units="mils" onChange={() => {}} />);
    const ctrl = screen.getByRole('textbox', { name: 'Solder mask expansion' }) as HTMLInputElement;
    expect(ctrl.value).toBe('2');
    expect(screen.getAllByText('mils').length).toBe(3);
  });

  it('a typed value is read back in mm, each to its own field', () => {
    let last: MaskPaste | null = null;
    render(
      <PanelPcbMaskPaste
        value={freshBoardSetup().maskPaste}
        units="mm"
        onChange={(v) => (last = v)}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Solder mask minimum web width' }), {
      target: { value: '0.1' },
    });
    expect(last!.maskMinWebMM).toBeCloseTo(0.1);
    expect(last!.maskExpansionMM).toBe(freshBoardSetup().maskPaste.maskExpansionMM);
  });

  it('Tent vias Back sets tentBack alone', () => {
    let last: MaskPaste | null = null;
    const start = { ...freshBoardSetup().maskPaste, tentFront: false, tentBack: false };
    render(<PanelPcbMaskPaste value={start} units="mm" onChange={(v) => (last = v)} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Back' }));
    expect(last).toEqual({ ...start, tentBack: true });
  });
});
