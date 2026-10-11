// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `DIALOG_EXPORT_NETLIST` (eeschema/dialogs/dialog_export_netlist.cpp): the
 * seven built-in pages in the constructor's order, and the SPICE Model page
 * writing a `.subckt` named after the project.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from '@ziroeda/sexpr/index.js';
import { readSchematic } from '@ziroeda/eeschema';
import { DialogExportNetlist } from '@ziroeda/eeschema/dialogs/dialog_export_netlist.js';

afterEach(cleanup);

const SCH = `(kicad_sch (version 20230121) (generator eeschema)
  (lib_symbols
    (symbol "Device:R" (property "Reference" "R" (at 0 0 0))
      (symbol "R_1_1"
        (pin passive line (at 0 2.54 270) (length 0)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 0 -2.54 90) (length 0)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))))))
  (symbol (lib_id "Device:R") (at 10 10 90) (unit 1) (uuid "r1")
    (property "Reference" "R1" (at 0 0 0))
    (property "Value" "10k" (at 0 0 0)))
  (wire (pts (xy 0 10) (xy 7.46 10)) (uuid "wa"))
  (wire (pts (xy 12.54 10) (xy 20 10)) (uuid "wb"))
  (hierarchical_label "VIN" (shape input) (at 0 10 180) (uuid "ha"))
  (hierarchical_label "OUT" (shape output) (at 20 10 0) (uuid "hb")))`;

function open(): { written: { path: string; text: string }[] } {
  const doc = readSchematic(parse(SCH));
  const written: { path: string; text: string }[] = [];
  render(
    <DialogExportNetlist
      doc={doc}
      libById={new Map(doc.libSymbols.map((l) => [l.libId, l]))}
      baseName="amp_sheet"
      projectName="amp"
      onOutputFile={(path, bytes) => written.push({ path, text: new TextDecoder().decode(bytes) })}
      onClose={() => {}}
    />,
  );
  return { written };
}

const tabs = (): string[] => screen.queryAllByRole('tab').map((t) => t.textContent ?? '');

describe('DialogExportNetlist', () => {
  it('installs the seven built-in pages in the constructor s order', () => {
    // KiCad, OrcadPCB2, Allegro, CadStar, PADS (:270-294), then
    // InstallPageSpice and InstallPageSpiceModel (:296-297).
    open();
    expect(tabs()).toStrictEqual([
      'KiCad',
      'OrcadPCB2',
      'Allegro',
      'CadStar',
      'PADS',
      // wxT( "SPICE" ) (dialog_export_netlist.cpp:347); this said 'Spice'.
      'SPICE',
      'SPICE Model',
    ]);
  });

  it('the SPICE Model page writes a .subckt named after the PROJECT, to a bare file name', () => {
    // `.subckt %s` is `Project().GetProjectName()` (netlist_exporter_spice_model.cpp:37),
    // not the sheet; and NET_TYPE_SPICE_MODEL has no FilenamePrms case, so the
    // proposed name carries no extension.
    const { written } = open();
    fireEvent.click(screen.getByText('SPICE Model'));
    fireEvent.click(screen.getByRole('button', { name: /Export Netlist/ }));
    expect(written).toHaveLength(1);
    expect(written[0]!.path).toBe('amp_sheet');
    expect(
      written[0]!.text.startsWith('*\n\n.subckt amp\n+       OUT ; output\n+       VIN ; input\n'),
    ).toBe(true);
    expect(written[0]!.text).toContain('R1 VIN OUT 10k');
    expect(written[0]!.text.endsWith('\n.ends\n')).toBe(true);
  });

  it('each page carries the label its Install* adds', () => {
    open();
    expect(screen.getByText('Export netlist in KiCad format')).toBeTruthy();
    expect(screen.getByText('Export netlist in SPICE format')).toBeTruthy();
    expect(screen.getByText('Export netlist as a SPICE .subckt model')).toBeTruthy();
  });

  it('the SPICE page: the save options live, the sheet-root and event boxes ticked and greyed', () => {
    open();
    fireEvent.click(screen.getByRole('tab', { name: 'SPICE' }));
    const root = screen.getAllByLabelText('Use current sheet as root')[0] as HTMLInputElement;
    expect([root.checked, root.disabled]).toEqual([true, true]);
    const events = screen.getByLabelText('Save all digital event data') as HTMLInputElement;
    expect([events.checked, events.disabled]).toEqual([true, true]);
    expect((screen.getByLabelText('Save all voltages') as HTMLInputElement).disabled).toBe(false);
  });

  it('writes into the output path, with Save all voltages in the SPICE text', () => {
    const { written } = open();
    fireEvent.change(screen.getByLabelText('Output path'), { target: { value: 'out' } });
    expect((screen.getByLabelText('Output path') as HTMLInputElement).value).toBe('out');
    fireEvent.click(screen.getByRole('tab', { name: 'SPICE' }));
    fireEvent.click(screen.getByLabelText('Save all voltages'));
    fireEvent.click(screen.getByRole('button', { name: 'Export Netlist' }));
    expect(written[0]!.path).toBe('out/amp_sheet.cir');
    expect(written[0]!.text).toContain('.save all');
  });
});
