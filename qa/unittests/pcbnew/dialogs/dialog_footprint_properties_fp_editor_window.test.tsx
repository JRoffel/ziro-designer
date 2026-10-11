// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_FOOTPRINT_PROPERTIES_FP_EDITOR's window on its base: the solder paste field the
 * constructor turns into one offset-and-ratio entry (the ratio row hidden), the copper count
 * following Use custom stackup, and the page remembered in m_page.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import {
  DIALOG_FOOTPRINT_PROPERTIES_FP_EDITOR,
  DialogFootprintPropertiesFpEditor,
} from '@ziroeda/pcbnew/dialogs/dialog_footprint_properties_fp_editor.js';
import type { FOOTPRINT } from '@ziroeda/pcbnew/footprint.js';
import { FOOTPRINT_EDIT_FRAME } from '@ziroeda/pcbnew/footprint_edit_frame.js';
import { FOOTPRINT_LIBRARY_STORE } from '@ziroeda/pcbnew/footprint_library_adapter.js';
import { attachFootprintFrameCanvas } from '../support/footprint_frame_canvas.js';

afterEach(() => {
  cleanup();
  SetPgm(null);
});

const U = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const FP_TEXT = `(footprint "R" (layer "F.Cu") (uuid "${U(10)}")
  (descr "A resistor") (tags "R res")
  (attr smd)
  (property "Reference" "R1" (at 0 0 0) (layer "F.SilkS") (uuid "${U(11)}"))
  (property "Value" "R" (at 0 1 0) (layer "F.Fab") (uuid "${U(12)}"))
  (pad "1" smd rect (at -1 0) (size 1 1) (layers "F.Cu") (uuid "${U(13)}")))`;

let frame: FOOTPRINT_EDIT_FRAME;

beforeEach(async () => {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  DIALOG_FOOTPRINT_PROPERTIES_FP_EDITOR.m_page = 0;
  const store = new FOOTPRINT_LIBRARY_STORE({
    footprintText: () => Promise.reject(new Error('none')),
    flipLeftRight: () => false,
  });
  store.AddProjectLibrary('Lib', 'Lib.pretty', [{ fileName: 'R.kicad_mod', text: FP_TEXT }]);
  frame = new FOOTPRINT_EDIT_FRAME({ fpEdit: () => {} });
  frame.SetFootprintLibAdapter(store);
  attachFootprintFrameCanvas(frame);
  await frame.LoadFootprintFromLibrary(new LIB_ID('Lib', 'R'));
});

const fp = (): FOOTPRINT => frame.GetBoard()!.GetFirstFootprint()!;

function show() {
  const onClose = vi.fn();
  render(
    <DialogFootprintPropertiesFpEditor
      dialog={new DIALOG_FOOTPRINT_PROPERTIES_FP_EDITOR(frame, fp())}
      units="mm"
      onClose={onClose}
    />,
  );
  return { onClose };
}

const textbox = (aName: string) => screen.getByRole('textbox', { name: aName }) as HTMLInputElement;

describe('DIALOG_FOOTPRINT_PROPERTIES_FP_EDITOR window', () => {
  it('one solder paste field takes an offset and a percentage; there is no ratio row', async () => {
    const { onClose } = show();
    fireEvent.click(screen.getByRole('tab', { name: 'Clearance Overrides' }));
    expect(screen.queryByText('Solder paste relative clearance:')).toBeNull();
    fireEvent.change(textbox('Solder paste clearance'), { target: { value: '-0.1mm - 5%' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
    expect(fp().GetLocalSolderPasteMargin()).toBe(-100_000);
    expect(fp().GetLocalSolderPasteMarginRatio()).toBeCloseTo(-0.05);
  });

  it('the copper layer count follows Use custom stackup', () => {
    show();
    fireEvent.click(screen.getByRole('tab', { name: 'Layers' }));
    expect(
      (screen.getByRole('button', { name: 'Copper layers' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByLabelText('Use custom stackup'));
    expect(
      (screen.getByRole('button', { name: 'Copper layers' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('opens again on the page it was left on', () => {
    show();
    fireEvent.click(screen.getByRole('tab', { name: 'Pad Connections' }));
    cleanup();
    show();
    expect(screen.getByRole('tab', { name: 'Pad Connections' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});
