// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_GLOBAL_EDIT_TEXT_AND_GRAPHICS over its _base: Scope / Filter Items / Set To, the small
 * italic "(fields only)" notes, typing a filter ticking its option, the tri-state boxes and the
 * choices reaching TransferDataFromWindow, and OK / Apply / Cancel.
 */
import { resolve } from 'node:path';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import {
  DIALOG_GLOBAL_EDIT_TEXT_AND_GRAPHICS,
  DialogGlobalEditTextAndGraphics,
  type GLOBAL_EDIT_VALUES,
} from '@ziroeda/eeschema/dialogs/dialog_global_edit_text_and_graphics.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openProject, schToolHarness } from '../support/sch_tool_harness.js';

const ORACLE = resolve(__dirname, '../../../data/eeschema/netlist_oracle/complex_hierarchy');
const SHEETS = ['complex_hierarchy.kicad_sch', 'ampli_ht.kicad_sch', 'complex_hierarchy.kicad_pro'];

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => {
  cleanup();
  SetPgm(null);
});

function open() {
  const h = schToolHarness();
  openProject(h.frame, ORACLE, 'complex_hierarchy', SHEETS);
  h.frame.SetCurrentSheet(h.frame.Schematic().Hierarchy()[0]!);
  h.frame.SetUserUnits('mm');
  const dlg = new DIALOG_GLOBAL_EDIT_TEXT_AND_GRAPHICS(h.frame);
  const seen: GLOBAL_EDIT_VALUES[] = [];
  vi.spyOn(dlg, 'TransferDataFromWindow').mockImplementation((v) => {
    seen.push(v);
    return true;
  });
  const onClose = vi.fn();
  render(
    <DialogGlobalEditTextAndGraphics
      dlg={dlg}
      initial={dlg.TransferDataToWindow()}
      units="mm"
      onClose={onClose}
    />,
  );
  return { seen, onClose };
}

describe('DIALOG_GLOBAL_EDIT_TEXT_AND_GRAPHICS_BASE', () => {
  it('lays out Scope, Filter Items and Set To, with the small italic notes', () => {
    open();
    for (const box of ['Scope', 'Filter Items', 'Set To'])
      expect(screen.getByText(box)).toBeTruthy();
    const notes = screen.getAllByText('(fields only)');
    expect(notes.length).toBe(4);
    expect(notes[0]!.className).toMatch(/small-info/);
    expect(notes[0]!.className).toMatch(/italic/);
    expect(screen.getByText('(labels only)')).toBeTruthy();
  });

  it('typing a filter ticks its option (OnReferenceFilterText)', () => {
    const { seen } = open();
    fireEvent.change(screen.getByLabelText('Reference filter'), { target: { value: 'R*' } });
    fireEvent.click(screen.getByText('Apply'));
    expect(seen[0]!.referenceFilter).toBe('R*');
    expect(seen[0]!.referenceFilterOpt).toBe(true);
  });

  it('hands scope, tri-state and choices to TransferDataFromWindow', () => {
    const { seen, onClose } = open();
    fireEvent.click(screen.getByLabelText('Values'));
    fireEvent.click(screen.getByLabelText('Bold'));
    fireEvent.click(screen.getByText('OK'));
    expect(seen.length).toBe(1);
    expect(seen[0]!.values).toBe(true);
    expect(seen[0]!.bold).not.toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Apply keeps the dialog open; Cancel closes it without applying', () => {
    const { seen, onClose } = open();
    fireEvent.click(screen.getByText('Apply'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(seen.length).toBe(1);
  });
});
