// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * ARRAY_TOOL (array_tool.cpp) as a tool: Create Array on the selection, the dialog's options
 * handed back by the frame, onDialogClosed in one BOARD_COMMIT - the board editor's branch and
 * the footprint editor's - and BOARD_REANNOTATE_TOOL::ReannotateDuplicates.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { ARRAY_OPTIONS } from '@ziroeda/common/array_options.js';
import { FRAME_T } from '@ziroeda/common/frame_type.js';
import { FIELD_T } from '@ziroeda/common/template_fieldnames.js';
import type { PCB_FIELD } from '@ziroeda/pcbnew/pcb_field.js';
import type { EDA_ITEM } from '@ziroeda/common/eda_item.js';
import { ARRAY_CIRCULAR_OPTIONS, ARRAY_GRID_OPTIONS } from '@ziroeda/common/array_options.js';
import { pcbIUScale } from '@ziroeda/common/eda_units.js';
import { EDA_ANGLE } from '@ziroeda/kimath/src/geometry/eda_angle.js';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import {
  DIALOG_CREATE_ARRAY,
  ResetCreateArrayOptions,
} from '@ziroeda/pcbnew/dialogs/dialog_create_array.js';
import type { FOOTPRINT } from '@ziroeda/pcbnew/footprint.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import type { PCB_TRACK } from '@ziroeda/pcbnew/pcb_track.js';
import { ARRAY_TOOL } from '@ziroeda/pcbnew/tools/array_tool.js';
import { BOARD_REANNOTATE_TOOL } from '@ziroeda/pcbnew/tools/board_reannotate_tool.js';
import { PCB_SELECTION } from '@ziroeda/pcbnew/tools/pcb_selection.js';
import { PCB_ACTIONS } from '@ziroeda/pcbnew/tools/pcb_actions.js';
import { type TOOL_HARNESS, toolHarness } from '../support/pcb_tool_harness.js';
import { TEST_PCB_FRAME } from '../support/test_pcb_frame.js';

const MM = (n: number): number => pcbIUScale.mmToIU(n);
const P = (x: number, y: number) => ({ x: MM(x), y: MM(y) });
const FP_UUID = '80000000-0000-4000-8000-000000000001';
const TRACK_UUID = '80000000-0000-4000-8000-000000000011';

/** The frame, whose Create Array dialog answers with the test's options. */
class ARRAY_FRAME extends TEST_PCB_FRAME {
  answer: ARRAY_OPTIONS | null = null;
  asked: DIALOG_CREATE_ARRAY[] = [];

  override ShowCreateArrayDialog(aDialog: DIALOG_CREATE_ARRAY): Promise<ARRAY_OPTIONS | null> {
    this.asked.push(aDialog);
    return Promise.resolve(this.answer);
  }
}

const BOARD_TEXT = `(kicad_pcb (version 20241229) (generator "test")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal))
  (net 0 "")
  (footprint "Lib:R" (layer "F.Cu") (uuid "${FP_UUID}") (at 10 10)
    (property "Reference" "R1" (at 0 0 0) (layer "F.SilkS") (hide yes) (uuid "80000000-0000-4000-8000-000000000002"))
    (pad "1" smd rect (at 1 0) (size 1 1) (layers "F.Cu") (uuid "80000000-0000-4000-8000-000000000003")))
  (segment (start 0 0) (end 2 0) (width 0.2) (layer "F.Cu") (net 0) (uuid "${TRACK_UUID}")))`;

let h: TOOL_HARNESS<ARRAY_FRAME>;
let board: BOARD;
let frame: ARRAY_FRAME;
const fps = (): FOOTPRINT[] => board.Footprints();
const original = (): FOOTPRINT => fps().find((f) => f.m_Uuid === FP_UUID)!;
const tracks = (): PCB_TRACK[] => board.Tracks() as PCB_TRACK[];
const sel = (...items: Parameters<PCB_SELECTION['Add']>[0][]) => {
  const s = new PCB_SELECTION();
  for (const i of items) s.Add(i);
  return s;
};
const grid = (nx: number, ny: number, dx: number, dy: number) => {
  const g = new ARRAY_GRID_OPTIONS();
  g.m_nx = nx;
  g.m_ny = ny;
  g.m_delta = P(dx, dy);
  g.SetSShouldReannotateFootprints(true);
  return g;
};
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function harness(aType = FRAME_T.FRAME_PCB_EDITOR): void {
  h = toolHarness(
    BOARD_TEXT,
    (b) => new ARRAY_FRAME(b, aType),
    () => {
      const tool = new ARRAY_TOOL();
      tool.SetIsFootprintEditor(aType === FRAME_T.FRAME_FOOTPRINT_EDITOR);
      return [tool];
    },
  );
  board = h.board;
  frame = h.frame;
}

/** Select \a aItems, run Create Array, and press OK on the dialog with \a aOptions. */
async function createArray(aItems: EDA_ITEM[], aOptions: ARRAY_OPTIONS | null): Promise<void> {
  for (const item of aItems) h.sel.AddItemToSel(item, true);
  frame.answer = aOptions;
  h.mgr.RunAction(PCB_ACTIONS.createArray);
  await flush();
}

beforeEach(() => harness());

describe('ARRAY_TOOL', () => {
  it('lays a grid of copies; the original takes the last position', async () => {
    await createArray([tracks()[0]!], grid(3, 1, 5, 0));
    const starts = tracks().map((t) => t.GetStart());
    expect(starts).toHaveLength(3);
    expect(starts).toContainEqual(P(0, 0));
    expect(starts).toContainEqual(P(5, 0));
    expect(starts).toContainEqual(P(10, 0));
    // Walked in reverse: the original gets array position 2 (:224-231).
    const orig = tracks().find((t) => t.m_Uuid === TRACK_UUID)!;
    expect(orig.GetStart()).toEqual(P(10, 0));
    expect(new Set(tracks().map((t) => t.m_Uuid)).size).toBe(3);
  });

  it('is one undo step, "Create Array"', async () => {
    await createArray([tracks()[0]!], grid(2, 2, 5, 5));
    expect(tracks()).toHaveLength(4);
    expect(frame.GetUndoCommandCount()).toBe(1);
    frame.RestoreCopyFromUndoList();
    expect(tracks()).toHaveLength(1);
    expect(tracks()[0]!.GetStart()).toEqual(P(0, 0));
  });

  it('selects every copy and the originals', async () => {
    const t = tracks()[0]!;
    await createArray([t], grid(3, 1, 5, 0));
    // selectionClear, then selectItems( all_added_items ) (:395-396).
    // By uuid: a failing comparison of the items themselves prints the whole board.
    const selected = h.sel
      .GetSelection()
      .Items()
      .map((i) => i.m_Uuid);
    expect(new Set(selected)).toEqual(new Set(tracks().map((t) => t.m_Uuid)));
  });

  it('a cancelled dialog changes nothing', async () => {
    await createArray([tracks()[0]!], null);
    expect(tracks()).toHaveLength(1);
    expect(frame.GetUndoCommandCount()).toBe(0);
  });

  it("asks the dialog with the item's position, or the selection's centre", async () => {
    await createArray([original()], null);
    expect(frame.asked[0]!.m_originalItemPosition).toEqual(P(10, 10));
    expect(frame.asked[0]!.m_isFootprintEditor).toBe(false);

    h.sel.ClearSelection();
    await createArray([original(), tracks()[0]!], null);
    expect(frame.asked[1]!.m_originalItemPosition).toEqual(h.sel.GetSelection().GetCenter());
  });

  it('a selected pad stands for its footprint', async () => {
    const pad = original().Pads()[0]!;
    await createArray([pad], grid(1, 2, 0, 5));
    expect(fps()).toHaveLength(2);
    expect(fps().map((f) => f.GetPosition())).toEqual(
      expect.arrayContaining([P(10, 10), P(10, 15)]),
    );
  });

  it('reannotates every block but the first processed, as upstream', async () => {
    await createArray([original()], grid(3, 1, 5, 0));
    // Reverse walk: block 2 (copy at position 0, not reannotated) keeps R1; block 1 climbs
    // past the board's R1 to R2; the original, clashing with block 2's R1,
    // climbs past R2 to R3 (array_tool.cpp:373-379).
    const refAt = (x: number) =>
      fps()
        .find((f) => f.GetPosition().x === MM(x))!
        .GetReference();
    expect(refAt(10)).toBe('R1');
    expect(refAt(15)).toBe('R2');
    expect(refAt(20)).toBe('R3');
    expect(original().GetPosition()).toEqual(P(20, 10));
  });

  it('keeps references with reannotation off', async () => {
    const g = grid(3, 1, 5, 0);
    g.SetSShouldReannotateFootprints(false);
    await createArray([original()], g);
    expect(fps().map((f) => f.GetReference())).toEqual(['R1', 'R1', 'R1']);
  });

  it('turns each copy about its own position on a circle', async () => {
    const c = new ARRAY_CIRCULAR_OPTIONS();
    c.m_nPts = 4;
    c.m_centre = P(-10, 0);
    c.m_angle = new EDA_ANGLE(90);
    c.m_rotateItems = true;
    await createArray([tracks()[0]!], c);
    expect(tracks()).toHaveLength(4);
    // Every start sits 10 mm from the centre, and each track turned with its
    // position: start (0, 0) -> end (2, 0) is a fifth of centre -> start.
    const quadrants = new Set<string>();
    for (const t of tracks()) {
      const v = { x: t.GetStart().x + MM(10), y: t.GetStart().y };
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(MM(10), -1);
      expect(t.GetEnd().x - t.GetStart().x).toBeCloseTo(v.x / 5, -1);
      expect(t.GetEnd().y - t.GetStart().y).toBeCloseTo(v.y / 5, -1);
      quadrants.add(`${Math.sign(Math.round(v.x / 1000))},${Math.sign(Math.round(v.y / 1000))}`);
    }
    expect(quadrants.size).toBe(4);
  });

  it('arranges the selection instead of copying it', async () => {
    const g = grid(3, 1, 5, 0);
    g.SetShouldArrangeSelection(true);
    const t = tracks()[0]!;
    // Selection order: the footprint first, then the track.
    await createArray([original(), t], g);
    expect(fps()).toHaveLength(1);
    expect(tracks()).toHaveLength(1);
    // Both start from the first item's position; item n takes array position n.
    expect(original().GetPosition()).toEqual(P(10, 10));
    expect(t.GetPosition()).toEqual(P(15, 10));
    expect(frame.GetUndoCommandCount()).toBe(1);
  });

  describe('in the footprint editor', () => {
    beforeEach(() => harness(FRAME_T.FRAME_FOOTPRINT_EDITOR));

    it('copies a pad inside the footprint and numbers the copies, the original last', async () => {
      const pad = original().Pads()[0]!;
      const g = grid(3, 1, 2, 0);
      g.SetShouldNumber(true);
      // The dialog's "1" for the first number; ARRAY_AXIS starts at 0 otherwise (array_axis.cpp:42).
      g.m_pri_axis.SetOffset(1);
      await createArray([pad], g);

      expect(fps()).toHaveLength(1);
      const pads = original().Pads();
      expect(pads).toHaveLength(3);
      // Positions 0, 1, 2 along x from the pad; numbered 1, 2, 3 in that order (:357-367).
      const byX = [...pads].sort((a, b) => a.GetPosition().x - b.GetPosition().x);
      expect(byX.map((p) => p.GetNumber())).toEqual(['1', '2', '3']);
      expect(byX[2]).toBe(pad);
      expect(frame.asked[0]!.m_isFootprintEditor).toBe(true);
    });

    it('duplicates no field: a field is unique to its footprint (:306-309)', async () => {
      const fields = (): number => {
        const out: PCB_FIELD[] = [];
        original().GetFields(out, false);
        return out.length;
      };
      const before = fields();
      const reference = original().GetField(FIELD_T.REFERENCE);

      await createArray([reference, original().Pads()[0]!], grid(2, 1, 5, 0));

      expect(fields()).toBe(before);
      // The pad was copied; the reference only moved, and kept its text (no reannotation).
      expect(original().Pads()).toHaveLength(2);
      expect(original().GetReference()).toBe('R1');
    });
  });

  it('the dialog settings default to reannotating and copying', () => {
    ResetCreateArrayOptions();
    const dlg = new DIALOG_CREATE_ARRAY(false, { x: 0, y: 0 });
    const ctrls = dlg.RestoreConfigToControls();
    const spec = dlg.TransferDataFromWindow(ctrls);
    if (!spec.ok) throw new Error(spec.error);
    expect(spec.settings.ShouldReannotateFootprints()).toBe(true);
    expect(spec.settings.ShouldArrangeSelection()).toBe(false);
    const flipped = dlg.TransferDataFromWindow({
      ...ctrls,
      arrangeSelection: true,
      uniqueRefs: false,
    });
    if (!flipped.ok) throw new Error(flipped.error);
    expect(flipped.settings.ShouldReannotateFootprints()).toBe(false);
    expect(flipped.settings.ShouldArrangeSelection()).toBe(true);
  });
});

describe('BOARD_REANNOTATE_TOOL::ReannotateDuplicates', () => {
  it('leaves a unique reference alone', () => {
    new BOARD_REANNOTATE_TOOL(board).ReannotateDuplicates(sel(original()), []);
    expect(original().GetReference()).toBe('R1');
  });

  it('climbs past references held by the additional footprints', () => {
    const extra = original().Duplicate(false) as FOOTPRINT;
    extra.SetReference('R2');
    const dup = original().Duplicate(false) as FOOTPRINT;
    new BOARD_REANNOTATE_TOOL(board).ReannotateDuplicates(sel(dup), [extra]);
    // R1 is the board's, R2 the additional footprint's.
    expect(dup.GetReference()).toBe('R3');
  });

  it('numbers an unnumbered duplicate from 1', () => {
    original().SetReference('R');
    const dup = original().Duplicate(false) as FOOTPRINT;
    new BOARD_REANNOTATE_TOOL(board).ReannotateDuplicates(sel(dup), []);
    expect(dup.GetReference()).toBe('R1');
  });

  it('sorts the selection by reference first', () => {
    const extra = original().Duplicate(false) as FOOTPRINT;
    extra.SetReference('R2');
    const a = original().Duplicate(false) as FOOTPRINT;
    const b = original().Duplicate(false) as FOOTPRINT;
    a.SetReference('R2');
    // b (R1) sorts first: R1 -> R2 (taken) -> R3; then a: R2 -> R3 (b's) -> R4.
    new BOARD_REANNOTATE_TOOL(board).ReannotateDuplicates(sel(a, b), [extra]);
    expect(b.GetReference()).toBe('R3');
    expect(a.GetReference()).toBe('R4');
  });

  it('sorts the selection by reference, then y descending', () => {
    const a = original().Duplicate(false) as FOOTPRINT;
    const b = original().Duplicate(false) as FOOTPRINT;
    a.SetPosition(P(0, 0));
    b.SetPosition(P(0, 5));
    new BOARD_REANNOTATE_TOOL(board).ReannotateDuplicates(sel(a, b), []);
    // b (larger y) goes first and takes R2.
    expect(b.GetReference()).toBe('R2');
    expect(a.GetReference()).toBe('R3');
  });
});
