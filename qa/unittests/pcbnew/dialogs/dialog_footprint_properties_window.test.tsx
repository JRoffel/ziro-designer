// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_FOOTPRINT_PROPERTIES's window (dialog_footprint_properties.cpp) on
 * DIALOG_FOOTPRINT_PROPERTIES_BASE: the notebook and its 3D Models page (:73-75), the fields
 * grid with OnAddField / OnDeleteField (:776-814), the binders read back at OK, Validate's
 * refusal, and the return value each button closes with.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pcbIUScale } from '@ziroeda/common/eda_units.js';
import { FILENAME_RESOLVER } from '@ziroeda/common/filename_resolver.js';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import {
  DIALOG_FOOTPRINT_PROPERTIES,
  DialogFootprintProperties,
  FP_PROPS_RETVALUE,
} from '@ziroeda/pcbnew/dialogs/dialog_footprint_properties.js';
import { FP_3DMODEL } from '@ziroeda/pcbnew/footprint.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { TEST_PCB_FRAME } from '../support/test_pcb_frame.js';

afterEach(cleanup);

const MM = (n: number): number => pcbIUScale.mmToIU(n);

let board: BOARD;
let frame: TEST_PCB_FRAME;
const fp = () => board.Footprints()[0]!;

beforeEach(() => {
  DIALOG_FOOTPRINT_PROPERTIES.m_page = 0;
  board = ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (5 "F.SilkS" user "F.Silkscreen") (7 "B.SilkS" user "B.Silkscreen")
    (35 "F.Fab" user) (33 "B.Fab" user))
  (net 0 "")
  (footprint "Lib:R_0805" (layer "F.Cu") (uuid "10000000-0000-4000-8000-000000000001") (at 10 20 90)
    (attr smd)
    (property "Reference" "R1" (at 0 0 0) (layer "F.SilkS") (uuid "10000000-0000-4000-8000-000000000002"))
    (property "Value" "10k" (at 0 1 0) (layer "F.SilkS") (uuid "10000000-0000-4000-8000-000000000003"))
    (pad "1" smd rect (at -1 0) (size 1 1.2) (layers "F.Cu") (uuid "10000000-0000-4000-8000-000000000004"))))`);
  frame = new TEST_PCB_FRAME(board);
  frame.SetUserUnits('mm');
});

function show(withModels = false) {
  const dlg = new DIALOG_FOOTPRINT_PROPERTIES(frame, fp());
  const onClose = vi.fn();
  const resolver = new FILENAME_RESOLVER();
  vi.spyOn(resolver, 'ResolvePath').mockImplementation((n) => n);
  render(
    <DialogFootprintProperties
      dlg={dlg}
      onClose={onClose}
      model3d={
        withModels
          ? {
              host: {
                resolver: () => resolver,
                footprintBasePath: () => '',
                embeddedFilesStack: () => [],
                addEmbeddedFile: () => null,
                removeEmbeddedFile: () => {},
                isFileReadable: () => true,
                onModify: () => {},
              },
              renderPreview: () => <div data-testid="preview" />,
              pickModel: async () => null,
            }
          : undefined
      }
    />,
  );
  return { dlg, onClose };
}

const tab = (aName: string) => screen.getByRole('tab', { name: aName });
const panelHidden = (aName: string): boolean =>
  screen.getByRole('tabpanel', { name: aName, hidden: true }).hasAttribute('data-nbhide');
const entry = (aLabel: string) => screen.getByLabelText(aLabel) as HTMLInputElement;

describe('DIALOG_FOOTPRINT_PROPERTIES window', () => {
  it('the notebook: General, Clearance Overrides & Pad Connections, then 3D Models when supplied', () => {
    show(false);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'General',
      'Clearance Overrides & Pad Connections',
    ]);
    cleanup();
    show(true);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toContain('3D Models');
  });

  it('every page stays laid out; only the selected one shows', () => {
    show(true);
    expect(panelHidden('General')).toBe(false);
    expect(panelHidden('3D Models')).toBe(true);
    fireEvent.click(tab('3D Models'));
    expect(panelHidden('3D Models')).toBe(false);
    expect(panelHidden('General')).toBe(true);
  });

  it('m_page: the dialog reopens on the page it was closed on', () => {
    show(false);
    fireEvent.click(tab('Clearance Overrides & Pad Connections'));
    cleanup();
    show(false);
    expect(tab('Clearance Overrides & Pad Connections').getAttribute('aria-selected')).toBe('true');
  });

  it('the 3D Models list survives leaving the page and coming back', () => {
    const m = new FP_3DMODEL();
    m.m_Filename = '/ok/a.wrl';
    fp().Models().push(m);
    show(true);
    fireEvent.click(tab('3D Models'));
    fireEvent.click(screen.getByRole('button', { name: 'Add 3D model' }));
    fireEvent.click(tab('General'));
    fireEvent.click(tab('3D Models'));
    expect(document.querySelectorAll('.ze-fp3d-grid tbody tr')).toHaveLength(2);
  });

  it('the position reads in the frame units, and OK writes what was typed', () => {
    const { dlg, onClose } = show();
    expect(entry('X').value).toBe('10');
    fireEvent.change(entry('X'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(fp().GetPosition()).toEqual({ x: MM(15), y: MM(20) });
    expect(dlg.GetReturnValue()).toBe(FP_PROPS_RETVALUE.FP_PROPS_OK);
    expect(onClose).toHaveBeenCalled();
  });

  it('OnDeleteField will not take a mandatory row', () => {
    const { dlg } = show();
    const fields = dlg.TransferDataToWindow().fields;
    const mandatory = fields.filter((f) => f.IsMandatory()).length;
    expect(mandatory).toBeGreaterThan(0);
    expect(dlg.CanDeleteField(mandatory - 1, fields)).toBe(
      `The first ${mandatory} fields are mandatory.`,
    );
    expect(dlg.CanDeleteField(mandatory, fields)).toBeNull();
  });

  it('OnAddField appends a hidden user field on the Fab layer', () => {
    show();
    const before = fp().GetFields().length;
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(fp().GetFields()).toHaveLength(before + 1);
    expect(fp().GetFields().at(-1)!.IsVisible()).toBe(false);
    expect(fp().GetFields().at(-1)!.GetLayerName()).toBe('F.Fab');
  });

  it('Update Footprint from Library closes with FP_PROPS_UPDATE_FP, having applied the window', () => {
    const { dlg, onClose } = show();
    fireEvent.change(entry('Y'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Footprint from Library...' }));
    expect(dlg.GetReturnValue()).toBe(FP_PROPS_RETVALUE.FP_PROPS_UPDATE_FP);
    expect(fp().GetPosition().y).toBe(MM(25));
    expect(onClose).toHaveBeenCalled();
  });

  it('Validate refuses a negative pad clearance and the dialog stays open', () => {
    const { onClose } = show();
    fireEvent.click(tab('Clearance Overrides & Pad Connections'));
    fireEvent.change(entry('Pad clearance'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(fp().GetLocalClearance()).toBeUndefined();
  });

  it('jumper groups read "none" when the footprint has none', () => {
    show();
    expect(screen.getByText('none', { selector: '.ze-statictext.italic' })).toBeDefined();
  });
});
