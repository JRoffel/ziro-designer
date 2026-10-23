// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * `SYMBOL_EDIT_FRAME::LoadSymbolFromSchematic` (symbol_edit_frame.cpp:1990-2090): a placement's
 * own library symbol opened for editing - flattened, its fields brought back from the placement's
 * rotation and mirroring into library space, the unit and body style the placement's, and the
 * library tree hidden for the edit with its restore remembered.
 */
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import { SCH_SYMBOL } from '@ziroeda/eeschema/sch_symbol.js';
import { SYMBOL_EDIT_FRAME } from '@ziroeda/eeschema/symbol_editor/symbol_edit_frame.js';
import { SYMBOL_ORIENTATION_T } from '@ziroeda/eeschema/symbol.js';
import { FIELD_T } from '@ziroeda/common/template_fieldnames.js';
import { afterEach, describe, expect, it } from 'vitest';
import { G, type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

const { SYM_ORIENT_90, SYM_ORIENT_180, SYM_ORIENT_270, SYM_MIRROR_X, SYM_MIRROR_Y } =
  SYMBOL_ORIENTATION_T;

let t: SYMBOL_EDIT_HARNESS;
afterEach(() => t?.dispose());

/** A placement of the harness's U at (100, 40) grid with its Value field at +(3, 1) grid. */
function placement(aOrientation: number, aUnit = 2) {
  let shown = true;
  const paneCalls: boolean[] = [];
  t = symbolEditHarness(undefined, {
    isLibraryTreeShown: () => shown,
    showLibraryTreePane: (aShow) => {
      paneCalls.push(aShow);
      shown = aShow;
    },
  });
  const lib = t.open('U');
  const pos = { x: 100 * G, y: 40 * G };
  // Placed under another library's name: the editor takes the placement's, not the symbol's own.
  const sym = new SCH_SYMBOL(lib, new LIB_ID('placed', 'U'), null, aUnit, 1, pos);
  sym.SetOrientation(aOrientation);
  sym.GetField(FIELD_T.VALUE)!.SetPosition({ x: pos.x + 3 * G, y: pos.y + 1 * G });
  sym.GetField(FIELD_T.VALUE)!.SetText('47k');
  return { sym, paneCalls, isShown: () => shown };
}

const valuePos = () => t.frame.GetCurSymbol()!.GetField(FIELD_T.VALUE)!.GetPosition();

describe('LoadSymbolFromSchematic', () => {
  it('opens the placement as the symbol from the schematic', () => {
    const { sym } = placement(SYM_ORIENT_90 & 0, 2);
    t.frame.LoadSymbolFromSchematic(sym);
    const cur = t.frame.GetCurSymbol()!;
    expect(cur === sym.GetLibSymbolRef()).toBe(false);
    expect(t.frame.IsSymbolFromSchematic()).toBe(true);
    expect(t.frame.m_schematicSymbolUUID).toBe(sym.m_Uuid);
    expect(t.frame.GetUnit()).toBe(2);
    expect(t.frame.GetBodyStyle()).toBe(1);
    expect(cur.GetLibId().Format()).toBe('placed:U');
    expect(cur.GetField(FIELD_T.VALUE)!.GetText()).toBe('47k');
    expect(t.frame.m_reference).toBe(cur.GetReferenceField().GetText());
    expect(valuePos()).toEqual({ x: 3 * G, y: 1 * G });
  });

  it('a unit or body style of 0 opens on 1', () => {
    const { sym } = placement(0, 0);
    t.frame.LoadSymbolFromSchematic(sym);
    expect(t.frame.GetUnit()).toBe(1);
  });

  it.each([
    ['90', SYM_ORIENT_90, { x: -1 * G, y: 3 * G }],
    ['270', SYM_ORIENT_270, { x: 1 * G, y: -3 * G }],
    ['180', SYM_ORIENT_180, { x: -3 * G, y: -1 * G }],
    ['mirror X', SYM_MIRROR_X, { x: 3 * G, y: -1 * G }],
    ['mirror Y', SYM_MIRROR_Y, { x: -3 * G, y: 1 * G }],
    ['mirror X then 90', SYM_MIRROR_X | SYM_ORIENT_90, { x: 1 * G, y: 3 * G }],
  ])('fields come back from a placement at %s', (_aName, aOrientation, aExpected) => {
    const { sym } = placement(aOrientation);
    t.frame.LoadSymbolFromSchematic(sym);
    expect(valuePos()).toEqual(aExpected);
  });

  it('hides the tree for the edit and remembers to restore it; a user toggle forgets that', () => {
    const { sym, paneCalls } = placement(0);
    t.frame.LoadSymbolFromSchematic(sym);
    expect(paneCalls).toEqual([false]);
    expect(t.frame.m_libTreeAutoHiddenForSchematicEdit).toBe(true);
    // A second schematic edit finds it hidden and keeps the pending restore.
    t.frame.LoadSymbolFromSchematic(sym);
    expect(paneCalls).toEqual([false]);
    expect(t.frame.m_libTreeAutoHiddenForSchematicEdit).toBe(true);
    t.frame.ToggleLibraryTree();
    expect(t.frame.m_libTreeAutoHiddenForSchematicEdit).toBe(false);
  });

  it('libTreeAutoHiddenForSchematicEdit', () => {
    const f = SYMBOL_EDIT_FRAME.libTreeAutoHiddenForSchematicEdit;
    expect(f(false, false, true)).toBe(true);
    expect(f(true, true, false)).toBe(true);
    expect(f(true, false, false)).toBe(false);
    expect(f(false, true, false)).toBe(false);
  });
});
