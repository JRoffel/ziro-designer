// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * What `SchematicEditor` hands the clipboard: the browser's clipboard events run the live
 * SCH_EDITOR_CONTROL, and no record paste path is left.
 *
 * The file is read as text because `qa`'s tsconfig cannot compile a `.tsx`;
 * `canvas_props_wired.test.ts` covers the same blind spot the same way.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EDITOR = readFileSync(
  fileURLToPath(new URL('../../../eeschema/sch_edit_frame_ui.tsx', import.meta.url)),
  'utf8',
);

describe('no record paste path is left in the window', () => {
  it('nothing parses pasted text into records: every paste is SCH_EDITOR_CONTROL::Paste', () => {
    // Ctrl+V, Paste, Paste Special and Duplicate run the live tool, and Import Sheet runs
    // SCH_DRAWING_TOOLS::ImportSheet; the paste mode, the hierarchy and the annotation settings
    // are what the live Paste reads off the frame (sch_editor_control.cpp:2199-2257).
    expect(EDITOR).not.toContain('parsePastedText(');
    expect(EDITOR).not.toContain('pasteOptions(');
  });
});

describe('the browser clipboard events run the live SCH_EDITOR_CONTROL', () => {
  // Cut, Copy and Paste are the live tool's, as pcbnew's frame wires them: doCopy carries a cut
  // sheet in m_supplementaryClipboard (:1667), so the record era's refusal to cut a sheet is gone.
  const handler = (aName: string): string => {
    const i = EDITOR.indexOf(`const ${aName} = (e: ClipboardEvent)`);
    expect(i, `the frame must install ${aName}`).toBeGreaterThan(-1);
    return EDITOR.slice(i, EDITOR.indexOf('\n    };', i));
  };

  it('copies and cuts through the live actions', () => {
    expect(handler('onCopy')).toContain('runLiveAction(ACTIONS.copy)');
    expect(handler('onCut')).toContain('runLiveAction(ACTIONS.cut)');
  });

  it('pastes the event\u2019s clipboard through the live Paste', () => {
    const body = handler('onPaste');
    expect(body).toContain('SetClipboardFromPaste(e.clipboardData)');
    expect(body).toContain('runLiveAction(ACTIONS.paste)');
  });

  it('leaves the system clipboard alone when the copy saved nothing', () => {
    expect(handler('onCopy')).toContain('if (!text) return;');
  });
});
