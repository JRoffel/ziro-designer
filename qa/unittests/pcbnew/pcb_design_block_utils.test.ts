// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * `pcbnew/pcb_design_block_utils.cpp` on the live BOARD: the four design block
 * commands of `PCB_EDIT_FRAME`, over a real design block library on the page's
 * temp mount, with the pane's modals answered by the test.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@ziroeda/common/design_block_library_adapter.js';
import type { EDA_ITEM } from '@ziroeda/common/eda_item.js';
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import {
  LIBRARY_TABLE,
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from '@ziroeda/common/libraries/library_table.js';
import { PGM_BASE, Pgm, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import type { DESIGN_BLOCK_PANE_DIALOGS } from '@ziroeda/common/widgets/design_block_pane.js';
import { wxGetTempDir, wxMkdir, wxReadFileSync } from '@ziroeda/wx/filefn.js';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import { PCB_EDIT_FRAME, type PCB_EDIT_FRAME_HOOKS } from '@ziroeda/pcbnew/pcb_edit_frame.js';
import { PCB_GROUP } from '@ziroeda/pcbnew/pcb_group.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { PCB_SCREEN } from '@ziroeda/pcbnew/pcb_screen.js';
import { PCBNEW_SETTINGS } from '@ziroeda/pcbnew/pcbnew_settings.js';
import {
  designBlockItemBBox,
  fitDesignBlockView,
  loadDesignBlockBoard,
} from '@ziroeda/pcbnew/widgets/pcb_design_block_preview_widget.js';
import { PCB_DESIGN_BLOCK_PANE } from '@ziroeda/pcbnew/widgets/pcb_design_block_pane.js';
import { PCB_ACTIONS } from '@ziroeda/pcbnew/tools/pcb_actions.js';
import type { FOOTPRINT } from '@ziroeda/pcbnew/footprint.js';
import type { PCB_CONTROL } from '@ziroeda/pcbnew/tools/pcb_control.js';
import { harnessCanvas } from './support/pcb_tool_harness.js';

/** The frame on \a aBoard with a VIEW and its controls, as the tools need for a placement. */
function onBoard(aFrame: PCB_EDIT_FRAME, aBoard: BOARD): void {
  aFrame.SetBoard(aBoard, false);
  const { view, controls } = harnessCanvas(aBoard, aFrame, { mouse: { x: 0, y: 0 }, forced: null });
  aFrame
    .GetToolManager()!
    .SetEnvironment(aBoard, view, controls, new PCBNEW_SETTINGS() as never, aFrame);
}

let seq = 0;
const U = (): string => `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, '0')}`;
let n = 0;
let lib = '';

beforeEach(() => {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  lib = `${wxGetTempDir()}/pcbdb${++n}/Blocks.kicad_blocks`;
  wxMkdir(lib);
  Pgm()
    .GetLibraryManager()
    .SetTable(
      LIBRARY_TABLE_TYPE.DESIGN_BLOCK,
      LIBRARY_TABLE_SCOPE.PROJECT,
      LIBRARY_TABLE.FromFile(
        '/p/design-block-lib-table',
        `(design_block_lib_table (version 7) (lib (name "Blocks")(type "KiCad")(uri "${lib}")(options "")(descr "")))`,
        LIBRARY_TABLE_SCOPE.PROJECT,
        LIBRARY_TABLE_TYPE.DESIGN_BLOCK,
      ),
    );
});

afterEach(() => SetPgm(null));

const track = (x: number, net: number, name: string): string =>
  `(segment (start ${x} 0) (end ${x + 5} 0) (width 0.25) (layer "F.Cu") (net "${name}") (uuid "${U()}"))`;

const footprint = (): string =>
  `(footprint "L:R" (layer "F.Cu") (uuid "${U()}") (at 20 0)
    (property "Reference" "R1" (at 0 -2 0) (layer "F.SilkS") (uuid "${U()}")
      (effects (font (size 1.27 1.27) (thickness 0.15))))
    (property "Value" "v" (at 0 2 0) (layer "F.Fab") (uuid "${U()}")
      (effects (font (size 1.27 1.27) (thickness 0.15))))
    (pad "1" smd rect (at -1 0) (size 1 1) (layers "F.Cu" "F.Mask" "F.Paste") (net "VCC") (uuid "${U()}")))`;

const board = (): BOARD => {
  const b = ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (5 "F.SilkS" user "F.Silkscreen") (7 "F.Fab" user))
  (setup)
  (net 0 "") (net 1 "GND") (net 2 "VCC")
  ${track(0, 1, 'GND')}
  ${track(10, 1, 'GND')}
  ${track(30, 2, 'VCC')}
  ${footprint()}
)`);
  b.SetFileName('/p/power.kicad_pcb');
  return b;
};

function setup(aDialogs: Partial<DESIGN_BLOCK_PANE_DIALOGS> = {}, aBoard: () => BOARD = board) {
  const infobar: string[] = [];
  const reports: { caption: string; messages: readonly string[] }[] = [];
  const hooks: PCB_EDIT_FRAME_HOOKS = {
    showInfoBarError: (m) => infobar.push(`error: ${m}`),
    showInfoBarWarning: (m) => infobar.push(`warning: ${m}`),
    showInfoBarMsg: (m) => infobar.push(`info: ${m}`),
    showHtmlMessage: async (caption, messages) => {
      reports.push({ caption, messages });
    },
    settings: () => new PCBNEW_SETTINGS(),
    onModify: () => {},
    onUndoRedoIncomplete: () => {},
    createDrcDialog: () => {
      throw new Error('no DRC dialog here');
    },
    isSingle: () => true,
    fetchNetlistFromSchematic: () => false,
    schematicNetlistText: () => null,
    projectText: () => null,
    showExchangeFootprintsDialog: () => {},
    findDialogRects: () => [],
    setViewCenter: () => {},
    editZoneParams: () => {},
    selectCopperLayerPair: () => {},
    updatePcbFromSchematic: () => {},
  };
  const frame = new PCB_EDIT_FRAME(hooks);
  const b = aBoard();
  frame.SetBoard(b, false);
  frame.SetScreen(new PCB_SCREEN({ x: 297000000, y: 210000000 }));

  const errors: string[] = [];
  const asked: string[] = [];
  const written: unknown[] = [];
  const libs = frame.Prj().DesignBlockLibs();
  libs.LoadOneByName('Blocks');
  const pane = new PCB_DESIGN_BLOCK_PANE(
    {
      DesignBlockLibs: () => libs,
      GetLibraryManager: () => Pgm().GetLibraryManager(),
      NormalizePath: (p) => p,
      ShowInfoBarError: (m) => errors.push(m),
      SetStatusText: () => {},
    },
    {
      IsOK: async () => true,
      OKOrCancel: async (m) => {
        asked.push(m);
        return true;
      },
      ConfirmOverwriteLibrary: async () => true,
      DisplayError: (m) => errors.push(m),
      GetTextFromUser: async () => '',
      NewLibraryBrowser: async () => null,
      DesignBlockProperties: async () => true,
      ...aDialogs,
    },
    [],
    () => ({ repeated_placement: false, place_as_group: true, keep_annotations: false }),
    (o) => written.push(o),
  );
  frame.m_designBlocksPane = pane;
  pane.SetSelectedLibId(new LIB_ID('Blocks', ''));

  return {
    frame,
    board: b,
    infobar,
    reports,
    libs,
    errors,
    asked,
    written,
    /** What the selection tool holds after the command (`selectionClear`, `selectItem`). */
    selected: (): EDA_ITEM[] => frame.GetSelectionTool().GetSelection().GetItems(),
    select: (items: EDA_ITEM[]) => {
      frame.GetSelectionTool().ClearSelection(true);
      frame.GetSelectionTool().AddItemsToSel(items, true);
    },
  };
}

const blockPath = (name: string): string => `${lib}/${name}.kicad_block/${name}.kicad_pcb`;
const blockText = (name: string): string =>
  new TextDecoder().decode(wxReadFileSync(blockPath(name))!);

describe('SaveBoardAsDesignBlock', () => {
  it('saves the board under its file name and selects the new block', async () => {
    const t = setup();
    expect(await t.frame.SaveBoardAsDesignBlock('Blocks')).toBe(true);
    expect(t.libs.DesignBlockExists('Blocks', 'power')).toBe(true);
    expect(blockText('power').match(/\(segment/g)).toHaveLength(3);
    expect(blockText('power')).toContain('(footprint "L:R"');
    expect(t.frame.GetDesignBlockPane()!.GetSelectedLibId().Format()).toBe('Blocks:power');
  });

  it('needs a library selected', async () => {
    const t = setup();
    t.frame.GetDesignBlockPane()!.SetSelectedLibId(new LIB_ID());
    expect(await t.frame.SaveBoardAsDesignBlock('Blocks')).toBe(false);
    expect(t.errors).toEqual(['Please select a library to save the design block to.']);
  });

  it('asks before overwriting, and a cancelled properties dialog saves nothing', async () => {
    const t = setup();
    await t.frame.SaveBoardAsDesignBlock('Blocks');
    expect(await t.frame.SaveBoardAsDesignBlock('Blocks')).toBe(true);
    expect(t.asked).toEqual(["Design block 'power' already exists in library 'Blocks'."]);
  });

  it('a cancelled properties dialog saves nothing', async () => {
    const u = setup({ DesignBlockProperties: async () => false });
    expect(await u.frame.SaveBoardAsDesignBlock('Blocks')).toBe(false);
    expect(u.libs.DesignBlockExists('Blocks', 'power')).toBe(false);
  });
});

describe('UpdateDesignBlockFromBoard', () => {
  it('needs an existing block, and asks before replacing its layout', async () => {
    const t = setup();
    expect(await t.frame.UpdateDesignBlockFromBoard(new LIB_ID('Blocks', 'nope'))).toBe(false);
    expect(t.errors).toEqual(["Design block 'nope' does not exist."]);

    await t.frame.SaveBoardAsDesignBlock('Blocks');
    t.board.Remove(t.board.Tracks()[0]!);
    expect(await t.frame.UpdateDesignBlockFromBoard(new LIB_ID('Blocks', 'power'))).toBe(true);
    expect(t.asked).toEqual(["Design block 'power' already has a layout."]);
    expect(blockText('power').match(/\(segment/g)).toHaveLength(2);
  });
});

describe('SaveSelectionAsDesignBlock', () => {
  it('saves copies of the selection with its nets, and groups the originals under the block', async () => {
    const t = setup();
    const [a, b, other] = t.board.Tracks();
    t.select([a!, b!]);

    expect(await t.frame.SaveSelectionAsDesignBlock('Blocks')).toBe(true);
    expect(t.libs.DesignBlockExists('Blocks', 'power')).toBe(true);
    const text = blockText('power');
    expect(text.match(/\(segment/g)).toHaveLength(2);
    expect(text).toContain('(net "GND")');
    expect(text).not.toContain('VCC');
    expect(text).not.toContain('(footprint');

    const groups = t.board.Groups();
    expect(groups).toHaveLength(1);
    expect(groups[0]!.GetName()).toBe('power');
    expect(groups[0]!.GetDesignBlockLibId().Format()).toBe('Blocks:power');
    expect(groups[0]!.GetItems().size).toBe(2);
    expect(groups[0]!.GetItems().has(a!) && groups[0]!.GetItems().has(b!)).toBe(true);
    expect(other!.GetParentGroup()).toBeNull();
    expect(t.selected()).toEqual([groups[0]]);
  });

  it('a footprint saves with the nets of its pads and is grouped whole', async () => {
    const t = setup();
    const fp = t.board.Footprints()[0]!;
    t.select([fp]);

    expect(await t.frame.SaveSelectionAsDesignBlock('Blocks')).toBe(true);
    expect(blockText('power')).toContain('(net "VCC")');
    const group = t.board.Groups()[0]!;
    expect([...group.GetItems()].map((i) => i === fp)).toEqual([true]);
  });

  it('a single named group names the block and is linked, not regrouped', async () => {
    const t = setup();
    const a = t.board.Tracks()[0]!;
    const group = new PCB_GROUP(t.board);
    group.SetName('filter');
    group.AddItem(a);
    t.board.Add(group);
    t.select([group]);

    expect(await t.frame.SaveSelectionAsDesignBlock('Blocks')).toBe(true);
    expect(t.libs.DesignBlockExists('Blocks', 'filter')).toBe(true);
    expect(blockText('filter').match(/\(segment/g)).toHaveLength(1);
    expect(group.GetDesignBlockLibId().Format()).toBe('Blocks:filter');
    expect(t.board.Groups()).toHaveLength(1);
  });

  it('refuses an empty selection, and needs a library', async () => {
    const t = setup();
    expect(await t.frame.SaveSelectionAsDesignBlock('Blocks')).toBe(false);
    expect(t.errors).toEqual(['Please select some items to save as a design block.']);

    const u = setup();
    u.frame.GetDesignBlockPane()!.SetSelectedLibId(new LIB_ID());
    u.select([u.board.Tracks()[0]!]);
    expect(await u.frame.SaveSelectionAsDesignBlock('Blocks')).toBe(false);
    expect(u.errors).toEqual(['Please select a library to save the design block to.']);
  });
});

describe('UpdateDesignBlockFromSelection', () => {
  it('replaces the layout with the selection and groups it under the block', async () => {
    const t = setup();
    await t.frame.SaveBoardAsDesignBlock('Blocks');
    t.select([t.board.Tracks()[2]!]);
    expect(await t.frame.UpdateDesignBlockFromSelection(new LIB_ID('Blocks', 'power'))).toBe(true);
    expect(t.asked).toEqual(["Design block 'power' already has a layout."]);
    expect(blockText('power').match(/\(segment/g)).toHaveLength(1);
    expect(blockText('power')).toContain('(net "VCC")');
    expect(t.board.Groups().map((g) => g.GetDesignBlockLibId().Format())).toEqual(['Blocks:power']);
  });

  it('a selected group is stripped to its children, then reselected and linked', async () => {
    const t = setup();
    await t.frame.SaveBoardAsDesignBlock('Blocks');
    const [a, b] = t.board.Tracks();
    const group = new PCB_GROUP(t.board);
    group.AddItem(a!);
    group.AddItem(b!);
    t.board.Add(group);
    t.select([group]);
    expect(await t.frame.UpdateDesignBlockFromSelection(new LIB_ID('Blocks', 'power'))).toBe(true);
    expect(blockText('power').match(/\(segment/g)).toHaveLength(2);
    expect(group.GetDesignBlockLibId().Format()).toBe('Blocks:power');
    expect(t.selected()).toEqual([group]);
    expect(t.board.Groups()).toHaveLength(1);
  });

  it('refuses an invalid id and an empty selection', async () => {
    const t = setup();
    expect(await t.frame.UpdateDesignBlockFromSelection(new LIB_ID())).toBe(false);
    expect(await t.frame.UpdateDesignBlockFromSelection(new LIB_ID('Blocks', 'x'))).toBe(false);
    expect(t.errors).toEqual([
      'Please select a library to save the design block to.',
      'Please select some items to save as a design block.',
    ]);
  });
});

describe('PCB_DESIGN_BLOCK_PREVIEW_WIDGET', () => {
  it('previews the saved board; nothing for no block or a block without one', async () => {
    const t = setup();
    await t.frame.SaveBoardAsDesignBlock('Blocks');
    const blk = t.libs.LoadDesignBlock('Blocks', 'power')!;
    expect(loadDesignBlockBoard(blk)?.Tracks()).toHaveLength(3);
    expect(loadDesignBlockBoard(null)).toBeNull();
    blk.SetBoardFile('');
    expect(loadDesignBlockBoard(blk)).toBeNull();
  });

  it('fits the items with a fifth of whitespace, centred on their box', () => {
    const b = board();
    const box = designBlockItemBBox(b);
    expect(box.GetWidth()).toBeGreaterThan(0);
    const v = fitDesignBlockView({ x: 600, y: 300 }, box);
    const fit = Math.min(600 / box.GetWidth(), 300 / box.GetHeight());
    expect(v.scale).toBeCloseTo(fit / 1.2, 12);
    expect(v.center).toEqual(box.Centre());
  });
});

describe('PCB_DESIGN_BLOCK_PANE options', () => {
  it('reads the three options as stored', () => {
    const t = setup();
    const pane = t.frame.GetDesignBlockPane()!;
    expect(pane.UpdateCheckboxes()).toEqual({
      repeated_placement: false,
      place_as_group: true,
      keep_annotations: false,
    });
  });

  it('writes all three options back at once', () => {
    const t = setup();
    const o = { repeated_placement: true, place_as_group: false, keep_annotations: true };
    t.frame.GetDesignBlockPane()!.OnCheckBox(o);
    expect(t.written).toEqual([o]);
  });
});

/**
 * `PCB_CONTROL::ApplyDesignBlockLayout` (pcb_control.cpp:1462-1835), end to end: a block saved
 * from one board, applied to a group linked to it on another. R1 and C1 are distinct parts so
 * the topology match is unique; net A joins R1.2 to C1.1 and carries the block's one track.
 */
const part = (aRef: string, aFpid: string, x: number, y: number, n1: string, n2: string): string =>
  `(footprint "${aFpid}" (layer "F.Cu") (uuid "${U()}") (at ${x} ${y})
    (property "Reference" "${aRef}" (at 0 -2 0) (layer "F.SilkS") (uuid "${U()}")
      (effects (font (size 1.27 1.27) (thickness 0.15))))
    (property "Value" "v" (at 0 2 0) (layer "F.Fab") (uuid "${U()}")
      (effects (font (size 1.27 1.27) (thickness 0.15))))
    (pad "1" smd rect (at -1 0) (size 1 1) (layers "F.Cu" "F.Mask" "F.Paste") (net "${n1}") (uuid "${U()}"))
    (pad "2" smd rect (at 1 0) (size 1 1) (layers "F.Cu" "F.Mask" "F.Paste") (net "${n2}") (uuid "${U()}")))`;

const pcb = (aBody: string, aFile: string, aTopName = ''): BOARD => {
  const b = ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal${aTopName ? ` "${aTopName}"` : ''}) (2 "B.Cu" signal) (5 "F.SilkS" user "F.Silkscreen") (7 "F.Fab" user))
  (setup)
  (net 0 "") (net 1 "A") (net 2 "B") (net 3 "Net-(C1-Pad2)")
  ${aBody}
)`);
  b.SetFileName(aFile);
  return b;
};

/** The block: R1 at (0,0), C1 at (10,0), one track on A from R1.2 to C1.1. */
const blockBoard = (): BOARD =>
  pcb(
    `${part('R1', 'L:R', 0, 0, 'B', 'A')}
  ${part('C1', 'L:C', 10, 0, 'A', 'Net-(C1-Pad2)')}
  (segment (start 1 0) (end 9 0) (width 0.25) (layer "F.Cu") (net "A") (uuid "${U()}"))`,
    '/p/rc.kicad_pcb',
  );

/** The placed instance: the same two parts, scattered, no routing. */
const instanceBoard = (): BOARD =>
  pcb(
    `${part('R1', 'L:R', 50, 50, 'B', 'A')}
  ${part('C1', 'L:C', 80, 70, 'A', 'Net-(C1-Pad2)')}`,
    '/p/main.kicad_pcb',
  );

async function savedBlockOnInstance(
  aLink = true,
  aBlock: () => BOARD = blockBoard,
  aInstance: () => BOARD = instanceBoard,
) {
  const t = setup({}, aBlock);
  expect(await t.frame.SaveBoardAsDesignBlock('Blocks')).toBe(true);

  const b = aInstance();
  onBoard(t.frame, b);

  const group = new PCB_GROUP(b);
  group.SetName('rc');
  for (const fp of b.Footprints()) group.AddItem(fp);
  if (aLink)
    group.SetDesignBlockLibId(
      new LIB_ID(
        'Blocks',
        aBlock()
          .GetFileName()
          .replace(/^.*\/|\.kicad_pcb$/g, ''),
      ),
    );
  b.Add(group);
  t.select([group]);

  const at = (aRef: string): FOOTPRINT => b.Footprints().find((f) => f.GetReference() === aRef)!;
  return { ...t, b, group, at };
}

describe('ApplyDesignBlockLayout', () => {
  it('lays the group out as the block is: placement, then routing in the group', async () => {
    const t = await savedBlockOnInstance();
    t.frame.GetToolManager()!.RunAction(PCB_ACTIONS.applyDesignBlockLayout);

    const r1 = t.at('R1').GetPosition();
    const c1 = t.at('C1').GetPosition();
    expect({ x: c1.x - r1.x, y: c1.y - r1.y }).toEqual({ x: 10_000_000, y: 0 });

    // The temporary block is reverted: only the instance's two parts remain, and the one copied
    // track, which joins them on A and belongs to the group.
    expect(t.b.Footprints()).toHaveLength(2);
    const tracks = t.b.Tracks();
    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.GetNetname()).toBe('A');
    expect(tracks[0]!.GetLength()).toBe(8_000_000);
    expect(tracks[0]!.GetStart()).toEqual({ x: r1.x + 1_000_000, y: r1.y });
    expect(tracks[0]!.GetParentGroup()).toBe(t.group);
    expect(t.b.Groups()).toEqual([t.group]);
    // The block's auto-named net was given a private name for the match (issue 24767); that
    // net goes with the temporary block.
    expect(
      [...t.b.GetNetInfo().NetsByName().keys()].filter((n) => n.startsWith('__dbapply')),
    ).toEqual([]);
    expect(t.at('C1').FindPadByNumber('2')!.GetNetname()).toBe('Net-(C1-Pad2)');
    expect(t.infobar).toEqual([]);
    expect(t.reports).toEqual([]);
  });

  /**
   * KiCad's TopoMatchCollidingAutoNetName (test_multichannel.cpp:2456, issue 24767): the
   * block's auto net Net-(D3-A) is on LED_A, and in the copy the same name is on LED_B, a
   * different part. Without private names for the block's auto nets the two fuse and the
   * match fails; with them every copy applies.
   */
  it('a block auto net named like a different part of the copy still applies (issue 24767)', async () => {
    const led = (aRef: string, aFpid: string, x: number, anode: string): string =>
      part(aRef, aFpid, x, 0, 'GND', anode);
    const res = (aRef: string, x: number, anode: string): string =>
      part(aRef, 'L:R', x, 5, anode, '+3V3');
    const nets = (names: string[]): string =>
      names.map((n, i) => `(net ${i + 1} "${n}")`).join(' ');
    const ledBoard = (aBody: string, aNets: string[], aFile: string): BOARD => {
      const b = ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (5 "F.SilkS" user "F.Silkscreen") (7 "F.Fab" user))
  (setup)
  (net 0 "") ${nets(aNets)}
  ${aBody})`);
      b.SetFileName(aFile);
      return b;
    };
    const blockNets = ['GND', '+3V3', 'Net-(D3-A)', 'Net-(D4-A)'];
    const block = (): BOARD =>
      ledBoard(
        `${led('D3', 'L:LED_A', 0, 'Net-(D3-A)')} ${res('R27', 0, 'Net-(D3-A)')}
         ${led('D4', 'L:LED_B', 10, 'Net-(D4-A)')} ${res('R30', 10, 'Net-(D4-A)')}`,
        blockNets,
        '/p/leds.kicad_pcb',
      );
    const copy = (): BOARD =>
      ledBoard(
        `${led('D2', 'L:LED_A', 50, 'Net-(D2-A)')} ${res('R1', 40, 'Net-(D2-A)')}
         ${led('D3', 'L:LED_B', 70, 'Net-(D3-A)')} ${res('R2', 90, 'Net-(D3-A)')}`,
        ['GND', '+3V3', 'Net-(D3-A)', 'Net-(D2-A)'],
        '/p/main.kicad_pcb',
      );

    const t = await savedBlockOnInstance(true, block, copy);
    t.frame.GetToolManager()!.RunAction(PCB_ACTIONS.applyDesignBlockLayout);

    expect(t.reports).toEqual([]);
    // Placed as the block is: LED_B 10 mm right of LED_A, each resistor 5 mm under its LED.
    const p = (r: string) => t.at(r).GetPosition();
    expect(p('D3').x - p('D2').x).toBe(10_000_000);
    expect(p('R1').y - p('D2').y).toBe(5_000_000);
    expect(p('R2').x - p('D3').x).toBe(0);
  });

  it('is one undo step', async () => {
    const t = await savedBlockOnInstance();
    const before = t.frame.GetUndoCommandCount();
    t.frame.GetToolManager()!.RunAction(PCB_ACTIONS.applyDesignBlockLayout);
    expect(t.frame.GetUndoCommandCount()).toBe(before + 1);
  });

  it('needs a group linked to a block', async () => {
    const t = await savedBlockOnInstance(false);
    t.frame.GetToolManager()!.RunAction(PCB_ACTIONS.applyDesignBlockLayout);
    expect(t.infobar).toEqual(['error: No groups with a linked design block are selected.']);
    expect(t.b.Tracks()).toHaveLength(0);
  });

  it('refuses a group holding a locked footprint unless locks are overridden', async () => {
    const t = await savedBlockOnInstance();
    t.at('C1').SetLocked(true);
    t.frame.GetToolManager()!.RunAction(PCB_ACTIONS.applyDesignBlockLayout);
    expect(t.infobar).toEqual([
      "warning: Selection contains locked items. Enable 'Override locks' to operate on them.",
    ]);
    expect(t.b.Tracks()).toHaveLength(0);
  });

  it('reports a group whose block is not in the libraries, and changes nothing', async () => {
    const t = await savedBlockOnInstance();
    t.group.SetDesignBlockLibId(new LIB_ID('Blocks', 'gone'));
    t.frame.GetToolManager()!.RunAction(PCB_ACTIONS.applyDesignBlockLayout);
    expect(t.reports).toEqual([
      {
        caption: 'Apply Design Block Layout',
        messages: [
          'Applied design block layout to 0 of 1 group(s).',
          'The following groups could not be processed:',
          '<b>rc</b>: design block is not in the loaded libraries',
        ],
      },
    ]);
    expect(t.at('C1').GetPosition()).toEqual({ x: 80_000_000, y: 70_000_000 });
    expect(t.b.Footprints()).toHaveLength(2);
  });
});

describe('AppendBoard (PCB_CONTROL::AppendBoard)', () => {
  it("appends the block's board, unmoved, as one group linked to the block", async () => {
    const t = setup({}, blockBoard);
    expect(await t.frame.SaveBoardAsDesignBlock('Blocks')).toBe(true);
    const b = instanceBoard();
    onBoard(t.frame, b);

    const block = t.frame
      .GetDesignBlockPane()!
      .GetDesignBlock(new LIB_ID('Blocks', 'rc'), true, true)!;
    const control = t.frame.GetToolManager()!.FindTool('pcbnew.Control') as unknown as PCB_CONTROL;
    const before = t.frame.GetUndoCommandCount();
    const run = control.AppendBoard(block.GetBoardFile(), block, null, true);
    let step = run.next();
    while (!step.done) step = run.next();
    expect(step.value).toBe(0);

    expect(b.Footprints()).toHaveLength(4);
    expect(b.Tracks()).toHaveLength(1);
    const groups = b.Groups();
    expect(groups).toHaveLength(1);
    expect(groups[0]!.GetName()).toBe('rc');
    expect(groups[0]!.GetDesignBlockLibId().Format()).toBe('Blocks:rc');
    // R1, C1 and the track: everything not inside a footprint.
    expect(groups[0]!.GetItems().size).toBe(3);
    expect(t.selected()).toEqual([groups[0]]);
    expect(t.frame.GetUndoCommandCount()).toBe(before + 1);
    // The destination's page and file name are kept.
    expect(b.GetFileName()).toBe('/p/main.kicad_pcb');
  });

  it("keeps the destination's layer names: APPEND_PRESERVE_DESTINATION_STACKUP", async () => {
    const t = setup({}, () =>
      pcb(part('R1', 'L:R', 0, 0, 'B', 'A'), '/p/rc.kicad_pcb', 'TopCopper'),
    );
    expect(await t.frame.SaveBoardAsDesignBlock('Blocks')).toBe(true);
    const b = instanceBoard();
    onBoard(t.frame, b);

    const block = t.frame
      .GetDesignBlockPane()!
      .GetDesignBlock(new LIB_ID('Blocks', 'rc'), true, true)!;
    expect(new TextDecoder().decode(wxReadFileSync(block.GetBoardFile())!)).toContain(
      '"TopCopper"',
    );
    const control = t.frame.GetToolManager()!.FindTool('pcbnew.Control') as unknown as PCB_CONTROL;
    const run = control.AppendBoard(block.GetBoardFile(), block, null, true);
    while (!run.next().done);

    expect(b.Footprints()).toHaveLength(3);
    expect(b.GetLayerName(0)).toBe('F.Cu');
  });
});
