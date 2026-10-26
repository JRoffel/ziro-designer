// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * FILEDLG_IMPORT_SHEET_CONTENTS::AddCustomControls (sch_design_block_pane.cpp:181): the four boxes
 * under the Import Sheet chooser, in upstream's order and with its labels, seeded from the hook;
 * drawing them attaches the hook, and a click is held in it for TransferDataFromCustomControls.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MakeFileDlgImportSheetContents,
  TransferImportSheetContents,
} from '@ziroeda/eeschema/widgets/sch_design_block_pane.js';
import { FiledlgImportSheetContentsControls } from '@ziroeda/eeschema/widgets/sch_design_block_pane_ui.js';

afterEach(cleanup);

const settings = () => ({
  repeated_placement: false,
  place_as_group: true,
  place_as_sheet: false,
  keep_annotations: true,
});

describe('FiledlgImportSheetContentsControls', () => {
  it("draws upstream's four boxes in its order, seeded from the settings", () => {
    const hook = MakeFileDlgImportSheetContents(settings());
    render(<FiledlgImportSheetContentsControls hook={hook} />);

    const boxes = [...document.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    expect(boxes.map((b) => b.closest('label')?.textContent?.trim())).toEqual([
      'Place repeated copies',
      'Place as group',
      'Place as sheet',
      'Keep annotations',
    ]);
    expect(boxes.map((b) => b.checked)).toEqual([false, true, false, true]);
  });

  it('attaches the hook, and a click reaches the settings through TransferDataFromCustomControls', () => {
    const cfg = settings();
    const hook = MakeFileDlgImportSheetContents(cfg);
    expect(hook.attached).toBe(false);

    render(<FiledlgImportSheetContentsControls hook={hook} />);
    fireEvent.click(screen.getByLabelText('Place as sheet'));
    fireEvent.click(screen.getByLabelText('Keep annotations'));

    expect(hook.attached).toBe(true);
    TransferImportSheetContents(hook, cfg);
    expect(cfg).toEqual({
      repeated_placement: false,
      place_as_group: true,
      place_as_sheet: true,
      keep_annotations: false,
    });
  });
});
