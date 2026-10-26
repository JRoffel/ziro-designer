// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * File > Import > Sheet (`SCH_ACTIONS::importSheet`).
 *
 * Upstream's `SCH_DRAWING_TOOLS::ImportSheet` loads another schematic, selects
 * everything it brought in and moves it to the cursor; the editor runs that tool.
 *
 * The guard that matters is the menubar one: an entry implemented but left
 * `disabled` is unreachable, and nothing else in the suite would notice.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildMenus } from '@ziroeda/eeschema/menubar.js';
import type { Menu, MenuItem } from '@ziroeda/wx/menu.js';

const EDITOR = readFileSync(
  fileURLToPath(new URL('../../../eeschema/sch_edit_frame_ui.tsx', import.meta.url)),
  'utf8',
);

/** Every handler is a no-op; we are inspecting structure, not behaviour. */
const handlers = new Proxy({}, { get: () => () => {} }) as Parameters<typeof buildMenus>[0];

function walk(items: readonly MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const it of items) {
    out.push(it);
    const sub = it.submenu ?? it.items;
    if (sub) out.push(...walk(sub));
  }
  return out;
}

const entry = (label: string): MenuItem | undefined => {
  const menus: Menu[] = buildMenus(handlers);
  return menus.flatMap((m) => walk(m.items)).find((i) => i.label === label);
};

describe('the menu entry', () => {
  it('exists and is reachable', () => {
    // It was `stub('Import Sheet...')` — present, greyed out, doing nothing.
    const e = entry('Import Sheet...');
    expect(e).toBeDefined();
    expect(e?.disabled ?? false).toBe(false);
  });

  it('dispatches the id the editor listens for', () => {
    // The id is captured in the item's closure rather than stored on it, so the
    // only honest check is to fire it and see what comes out. That also pins
    // the half that a rename would otherwise break silently: the menu and the
    // editor's `else if (id === …)` are matched by string alone.
    const seen: string[] = [];
    const spy = new Proxy({}, { get: () => (id: string) => seen.push(id) }) as Parameters<
      typeof buildMenus
    >[0];
    const menus: Menu[] = buildMenus(spy);
    const item = menus.flatMap((m) => walk(m.items)).find((i) => i.label === 'Import Sheet...');
    item?.action?.();
    expect(seen).toEqual(['importSheet']);
  });
});

describe('what the editor does with it', () => {
  it('runs SCH_DRAWING_TOOLS::ImportSheet, which asks for the file itself', () => {
    // ImportSheet's own ShowFileDialog, with FILEDLG_IMPORT_SHEET_CONTENTS' boxes under it; the
    // placement is tested live in qa/unittests/eeschema/sch_import_sheet_live.test.ts.
    expect(EDITOR).toContain(
      "else if (id === 'importSheet') runLiveAction(SCH_ACTIONS.importSheet);",
    );
    expect(EDITOR).toContain(
      '<FiledlgImportSheetContentsControls hook={fileDialogRequest.hook} />',
    );
  });
});
