// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * BACK_ANNOTATE (eeschema/tools/backannotate.cpp) on the live model, against KiCad's own
 * complex_hierarchy project. The board is the schematic's own kicad-cli netlist re-formatted as
 * the `pcb_netlist` MAIL_PCB_GET_NETLIST sends, with each net shortened to what a pad's
 * GetShortNetname() answers - so the untouched board matches exactly, and each case edits it
 * the way a board edit would. Messages are read off the C++.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CTL_OMIT_FILTERS } from '@ziroeda/common/ctl_flags.js';
import { COMPONENT, type NETLIST } from '@ziroeda/common/netlist_reader/netlist.js';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import {
  RPT_SEVERITY_ACTION,
  RPT_SEVERITY_ERROR,
  RPT_SEVERITY_INFO,
  RPT_SEVERITY_WARNING,
  Reporter,
} from '@ziroeda/common/reporter.js';
import { STRING_FORMATTER } from '@ziroeda/common/richio.js';
import { FIELD_T } from '@ziroeda/common/template_fieldnames.js';
import type { SCH_EDIT_FRAME } from '@ziroeda/eeschema/sch_edit_frame.js';
import { SCH_FIELD } from '@ziroeda/eeschema/sch_field.js';
import { SCH_REFERENCE_LIST } from '@ziroeda/eeschema/sch_reference_list.js';
import { SYMBOL_FILTER } from '@ziroeda/eeschema/sch_sheet_path.js';
import type { SCH_SYMBOL } from '@ziroeda/eeschema/sch_symbol.js';
import { BACK_ANNOTATE } from '@ziroeda/eeschema/tools/backannotate.js';
import { formatPcbNetlist } from '@ziroeda/pcbnew/cross-probing.js';
import { loadKicadNetlist } from '@ziroeda/pcbnew/netlist_reader/kicad_netlist_reader.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openProject, schFrame } from './support/sch_tool_harness.js';

const DIR = resolve(__dirname, '../../data/eeschema/netlist_oracle/complex_hierarchy');

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => SetPgm(null));

function open(): SCH_EDIT_FRAME {
  const frame = schFrame();
  expect(
    openProject(frame, DIR, 'complex_hierarchy', [
      'complex_hierarchy.kicad_sch',
      'ampli_ht.kicad_sch',
      'complex_hierarchy.kicad_pro',
    ]),
  ).toBe(true);
  return frame;
}

/** The board: the schematic's netlist with pad nets as GetShortNetname(), edited by \a aEdit. */
function board(aEdit: (aNetlist: NETLIST) => void = () => {}): string {
  const nl = loadKicadNetlist(
    readFileSync(resolve(DIR, 'complex_hierarchy.kicad-cli.net'), 'utf8'),
  );

  for (let i = 0; i < nl.GetCount(); i++) {
    const c = nl.GetComponent(i)!;
    const nets = [...Array(c.GetNetCount()).keys()].map((k) => c.GetNetAt(k));
    c.ClearNets();

    for (const n of nets) {
      const name = n.GetNetName();
      c.AddNet(
        n.GetPinName(),
        name.slice(name.lastIndexOf('/') + 1),
        n.GetPinFunction(),
        n.GetPinType(),
      );
    }
  }

  aEdit(nl);

  // formatPcbNetlist sends every footprint field by canonical name, Reference and Value too.
  for (let i = 0; i < nl.GetCount(); i++) {
    const c = nl.GetComponent(i)!;
    c.GetFields().set('Reference', c.GetReference());
    c.GetFields().set('Value', c.GetValue());
  }

  const sf = new STRING_FORMATTER();
  nl.Format('pcb_netlist', sf, 0, CTL_OMIT_FILTERS);
  return sf.GetString();
}

const ref = (aNetlist: NETLIST, aRef: string): COMPONENT => aNetlist.GetComponentByReference(aRef)!;

/** Every option on, as the dialog opens, re-link off. */
const ALL = {
  relink: false,
  footprints: true,
  values: true,
  references: true,
  netNames: true,
  attributes: true,
  otherFields: true,
  unitSwaps: true,
  pinSwaps: true,
};

function run(
  aFrame: SCH_EDIT_FRAME,
  aBoard: string,
  aDryRun = true,
  o: Partial<typeof ALL> = {},
): { ok: boolean; changes: number; lines: [number, string][] } {
  const p = { ...ALL, ...o };
  const reporter = new Reporter();
  const ba = new BACK_ANNOTATE(
    aFrame,
    reporter,
    p.relink,
    p.footprints,
    p.values,
    p.references,
    p.netNames,
    p.attributes,
    p.otherFields,
    p.unitSwaps,
    p.pinSwaps,
    aDryRun,
  );
  const ok = ba.BackAnnotateSymbols(aBoard);
  return {
    ok,
    changes: ba.GetChangesCount(),
    lines: reporter.lines.map((l) => [l.severity, l.message]),
  };
}

function symbol(aFrame: SCH_EDIT_FRAME, aRef: string): SCH_SYMBOL {
  const refs = new SCH_REFERENCE_LIST();
  aFrame.Schematic().Hierarchy().GetSymbols(refs, SYMBOL_FILTER.SYMBOL_FILTER_ALL);
  return refs.at(refs.FindRef(aRef)).GetSymbol();
}

describe('BACK_ANNOTATE: the untouched board', () => {
  it('matches the schematic: no changes, nothing reported', () => {
    expect(run(open(), board())).toEqual({ ok: true, changes: 0, lines: [] });
  });

  it('runs with Attributes the only option on', () => {
    const b = board((nl) =>
      nl.GetComponentByReference('C1')!.SetProperties(new Map([['dnp', '']])),
    );
    const only = {
      footprints: false,
      values: false,
      references: false,
      netNames: false,
      otherFields: false,
    };
    expect(run(open(), b, true, only)).toEqual({
      ok: true,
      changes: 1,
      lines: [[RPT_SEVERITY_ACTION, "Change C1 'Do not populate' from 'false' to 'true'."]],
    });
  });

  it('refuses with every option off', () => {
    const none = {
      footprints: false,
      values: false,
      references: false,
      netNames: false,
      attributes: false,
      otherFields: false,
    };
    expect(run(open(), board(), true, none)).toEqual({
      ok: false,
      changes: 0,
      lines: [[RPT_SEVERITY_ERROR, 'Select at least one property to back annotate.']],
    });
  });
});

describe('BACK_ANNOTATE: what the board changes', () => {
  it('a value: reported dry, applied for real', () => {
    const frame = open();
    const b = board((nl) => ref(nl, 'C1').SetValue('100uF'));
    expect(run(frame, b).lines).toEqual([
      [RPT_SEVERITY_ACTION, "Change C1 value from '47uF' to '100uF'."],
    ]);
    expect(symbol(frame, 'C1').GetField(FIELD_T.VALUE)!.GetText()).toBe('47uF');
    expect(run(frame, b, false).changes).toBe(1);
    expect(symbol(frame, 'C1').GetField(FIELD_T.VALUE)!.GetText()).toBe('100uF');
    expect(run(frame, b)).toEqual({ ok: true, changes: 0, lines: [] });
  });

  it('a footprint, escaped, and the Footprint field that follows it', () => {
    const frame = open();
    // A footprint changed on the board carries its LIB_ID in its Footprint field too, and that
    // field is compared by "Other fields" (only Reference and Value are skipped there).
    const b = board((nl) => {
      ref(nl, 'C1').SetFPID('Lib:A<B');
      ref(nl, 'C1').GetFields().set('Footprint', 'Lib:A<B');
    });
    expect(run(frame, b).lines).toEqual([
      [
        RPT_SEVERITY_ACTION,
        "Change C1 footprint assignment from 'Capacitor_THT:CP_Axial_L10.0mm_D4.5mm_P15.00mm_Horizontal' to 'Lib:A&lt;B'.",
      ],
      [RPT_SEVERITY_ACTION, "Change C1 field 'Footprint' value to 'Lib:A&lt;B'."],
    ]);
    run(frame, b, false);
    expect(symbol(frame, 'C1').GetField(FIELD_T.FOOTPRINT)!.GetText()).toBe('Lib:A<B');
  });

  it('a reference, matched by path', () => {
    const frame = open();
    const b = board((nl) => ref(nl, 'C1').SetReference('C100'));
    expect(run(frame, b).lines).toEqual([
      [RPT_SEVERITY_ACTION, "Change C1 reference designator to 'C100'."],
    ]);
    run(frame, b, false);
    expect(symbol(frame, 'C100')).toBeTruthy();
  });

  it('only what is switched on', () => {
    const b = board((nl) => {
      ref(nl, 'C1').SetValue('100uF');
      ref(nl, 'C1').SetReference('C100');
    });
    expect(run(open(), b, true, { values: false }).lines).toEqual([
      [RPT_SEVERITY_ACTION, "Change C1 reference designator to 'C100'."],
    ]);
  });

  it('Do not populate, from the dnp property', () => {
    const frame = open();
    const b = board((nl) => ref(nl, 'C1').SetProperties(new Map([['dnp', '']])));
    expect(run(frame, b).lines).toEqual([
      [RPT_SEVERITY_ACTION, "Change C1 'Do not populate' from 'false' to 'true'."],
    ]);
    run(frame, b, false);
    expect(symbol(frame, 'C1').GetDNP()).toBe(true);
  });

  it('Exclude from position files, the third property', () => {
    const b = board((nl) => ref(nl, 'C1').SetProperties(new Map([['exclude_from_pos_files', '']])));
    expect(run(open(), b).lines).toEqual([
      [RPT_SEVERITY_ACTION, "Change C1 'Exclude from position files' from 'false' to 'true'."],
    ]);
  });

  it('a field the footprint gained is added, hidden', () => {
    const frame = open();
    const b = board((nl) => ref(nl, 'C1').GetFields().set('MPN', 'X1'));
    expect(run(frame, b).lines).toEqual([
      [RPT_SEVERITY_ACTION, "Add C1 field 'MPN' with value 'X1'."],
    ]);
    run(frame, b, false);
    const f = symbol(frame, 'C1').GetField('MPN')!;
    expect([f.GetText(), f.IsVisible()]).toEqual(['X1', false]);
  });

  it('a user field the footprint lacks is deleted', () => {
    const frame = open();
    const c1 = symbol(frame, 'C1');
    const note = new SCH_FIELD(c1, FIELD_T.USER, 'Note');
    note.SetText('n');
    c1.AddField(note);
    expect(run(frame, board()).lines).toEqual([[RPT_SEVERITY_ACTION, "Delete C1 field 'Note.'"]]);
    run(frame, board(), false);
    expect(symbol(frame, 'C1').GetField('Note')).toBeNull();
  });

  it('a net renamed on the board renames its label', () => {
    const frame = open();
    const b = board((nl) => {
      const p2 = ref(nl, 'P2');
      const nets = [...Array(p2.GetNetCount()).keys()].map((k) => p2.GetNetAt(k));
      p2.ClearNets();
      for (const n of nets)
        p2.AddNet(n.GetPinName(), n.GetPinName() === '1' ? 'EXT' : n.GetNetName(), '', '');
    });
    expect(run(frame, b).lines).toEqual([
      [RPT_SEVERITY_ACTION, "Change P2 pin 1 net label from '12Vext' to 'EXT'."],
    ]);
    run(frame, b, false);
    const labels = [...frame.Schematic().RootScreen()!.Items()]
      .filter((i) => i.GetClass?.() === 'SCH_LABEL')
      .map((i) => (i as unknown as { GetText(): string }).GetText());
    expect(labels).toContain('EXT');
    expect(labels).not.toContain('12Vext');
  });

  it('two pads swapped: the swap is refused while unconstrained swaps are off, then labels', () => {
    const b = board((nl) => {
      const d1 = ref(nl, 'D1');
      d1.ClearNets();
      d1.AddNet('1', '12Vext', '', '');
      d1.AddNet('2', '+12C', '', '');
    });
    expect(run(open(), b).lines).toEqual([
      [
        RPT_SEVERITY_INFO,
        'Would swap D1 pins 1 and 2 to match PCB, but unconstrained pin swaps are disabled in the schematic preferences.',
      ],
      [
        RPT_SEVERITY_ERROR,
        'Net +12C cannot be changed to 12Vext because it is driven by a power pin.',
      ],
      [RPT_SEVERITY_ACTION, "Change D1 pin 2 net label from '12Vext' to '+12C'."],
    ]);
  });
});

describe('BACK_ANNOTATE: matching and guards', () => {
  it('re-link matches by reference, so a footprint with a stale path still finds its symbol', () => {
    const b = board((nl) => {
      const c1 = ref(nl, 'C1');
      nl.AddComponent(
        new COMPONENT(c1.GetFPID(), 'C1', '100uF', '/', ['00000000-0000-0000-0000-0000deadbeef']),
      );
      // drop the original C1 so only the stale-path one is left
      (nl as unknown as { m_components: COMPONENT[] }).m_components.splice(
        (nl as unknown as { m_components: COMPONENT[] }).m_components.indexOf(c1),
        1,
      );
    });
    expect(run(open(), b, true, { relink: true, references: false }).lines).toEqual([
      [RPT_SEVERITY_ACTION, "Change C1 value from '47uF' to '100uF'."],
    ]);
    expect(run(open(), b).lines).toEqual([
      [RPT_SEVERITY_ERROR, "Cannot find symbol for footprint 'C1'."],
    ]);
  });

  it('a value held in a text variable is left alone', () => {
    const frame = open();
    symbol(frame, 'C1').GetField(FIELD_T.VALUE)!.SetText('${CAP}');
    const b = board((nl) => ref(nl, 'C1').SetValue('100uF'));
    expect(run(frame, b).lines).toEqual([]);
  });

  it('with unconstrained swaps allowed, the two pins swap and their labels stay', () => {
    const frame = open();
    frame.eeconfig()!.input.allow_unconstrained_pin_swaps = true;
    const b = board((nl) => {
      const d1 = ref(nl, 'D1');
      d1.ClearNets();
      d1.AddNet('1', '12Vext', '', '');
      d1.AddNet('2', '+12C', '', '');
    });
    expect(run(frame, b)).toEqual({
      ok: true,
      changes: 1,
      lines: [[RPT_SEVERITY_ACTION, 'Swap D1 pins 1 and 2 to match PCB.']],
    });
  });
});

describe('BACK_ANNOTATE: what the board gets wrong', () => {
  it('a footprint with no symbol path is warned about', () => {
    const b = board((nl) => nl.AddComponent(new COMPONENT('Lib:H', 'H1', 'v', '', [])));
    expect(run(open(), b).lines).toEqual([
      [RPT_SEVERITY_WARNING, "Footprint 'H1' has no assigned symbol."],
    ]);
  });

  it('two footprints on one symbol is an error, naming the first', () => {
    const b = board((nl) => {
      const c1 = ref(nl, 'C1');
      nl.AddComponent(new COMPONENT(c1.GetFPID(), 'C1b', '47uF', c1.path, c1.kiids));
    });
    expect(run(open(), b).lines).toContainEqual([
      RPT_SEVERITY_ERROR,
      "Footprints 'C1' and 'C1b' linked to same symbol.",
    ]);
  });

  it('a footprint whose symbol is gone', () => {
    const b = board((nl) =>
      nl.AddComponent(
        new COMPONENT('Lib:R', 'R99', '1k', '/', ['00000000-0000-0000-0000-0000deadbeef']),
      ),
    );
    expect(run(open(), b).lines).toEqual([
      [RPT_SEVERITY_ERROR, "Cannot find symbol for footprint 'R99'."],
    ]);
  });
});

describe('BACK_ANNOTATE: a board KiCad wrote, through MAIL_PCB_GET_NETLIST', () => {
  it('Arduino Uno: only the Description fields an old schematic never filled', () => {
    const dir = resolve(__dirname, '../designer/fixtures/Arduino_Uno_kicad6');
    const frame = schFrame();
    openProject(frame, dir, 'Arduino_Uno', ['Arduino_Uno.kicad_sch', 'Arduino_Uno.kicad_pro']);
    const text = formatPcbNetlist(
      ParseBoard(readFileSync(resolve(dir, 'Arduino_Uno.kicad_pcb'), 'utf8')),
    );

    // The 20221018 board stores the symbol's description as a `ki_description` property, which
    // the parser makes the footprint's Description field (pcb_io_kicad_sexpr_parser.cpp). The
    // 20221206 schematic keeps it on the library symbol only, so each instance's Description
    // field is empty and "Other fields" fills it - every value, footprint, reference and net
    // matches.
    expect(symbol(frame, 'J1').GetField(FIELD_T.DESCRIPTION)!.GetText()).toBe('');
    const generic = (n: string) =>
      `Generic connector, single row, 01x${n}, script generated (kicad-library-utils/schlib/autogen/connector/)`;
    expect(run(frame, text).lines).toEqual([
      [RPT_SEVERITY_ACTION, `Change J1 field 'Description' value to '${generic('08')}'.`],
      [RPT_SEVERITY_ACTION, `Change J2 field 'Description' value to '${generic('10')}'.`],
      [RPT_SEVERITY_ACTION, `Change J3 field 'Description' value to '${generic('06')}'.`],
      [RPT_SEVERITY_ACTION, `Change J4 field 'Description' value to '${generic('08')}'.`],
    ]);
  });
});
