// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * A live SYMBOL_VIEWER_FRAME on schToolHarness's canvas, over two libraries in an in-memory project
 * table, for the symbol browser's tests.
 */
import {
  LIBRARY_TABLE,
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from '@ziroeda/common/libraries/library_table.js';
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import { PGM_BASE, Pgm, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { SymbolLibAdapter } from '@ziroeda/eeschema/project_sch.js';
import type { SCH_EDIT_FRAME } from '@ziroeda/eeschema/sch_edit_frame.js';
import {
  SYMBOL_VIEWER_FRAME,
  type SYMBOL_VIEWER_FRAME_HOOKS,
} from '@ziroeda/eeschema/symbol_viewer_frame.js';
import { MEMORY_FILESYSTEM, wxMountFileSystem } from '@ziroeda/wx/filefn.js';
import { type SCH_HARNESS, schToolHarness } from './sch_tool_harness.js';

const prop = (aName: string, aValue: string) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))))`;

const pin = (aNumber: string, aY: number) =>
  `(pin input line (at -7.62 ${aY} 0) (length 2.54) (name "P${aNumber}" (effects (font (size 1.27 1.27)))) (number "${aNumber}" (effects (font (size 1.27 1.27)))))`;

/**
 * "Alpha": R - one unit, two pins, a datasheet; U - two units, each with a De Morgan alternate, four
 * pins. "Beta": GND - a power symbol; Q - three pins.
 */
export const ALPHA = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "R" (in_bom yes) (on_board yes)
    ${prop('Reference', 'R')} ${prop('Value', 'R')} ${prop('Datasheet', 'https://example.test/r.pdf')}
    ${prop('Description', 'Resistor')} ${prop('ki_keywords', 'res passive')}
    (symbol "R_1_1" (rectangle (start -1.016 -2.54) (end 1.016 2.54) (stroke (width 0.254) (type default)) (fill (type none)))
      ${pin('1', 2.54)} ${pin('2', -2.54)}))
  (symbol "U" (in_bom yes) (on_board yes)
    ${prop('Reference', 'U')} ${prop('Value', 'U')} ${prop('Description', 'Quad gate')}
    (symbol "U_1_1" (rectangle (start -5.08 -5.08) (end 5.08 5.08) (stroke (width 0) (type default)) (fill (type none))) ${pin('1', 2.54)})
    (symbol "U_1_2" (rectangle (start -2.54 -2.54) (end 2.54 2.54) (stroke (width 0) (type default)) (fill (type none))) ${pin('1', 2.54)})
    (symbol "U_2_1" (rectangle (start -10.16 -5.08) (end 10.16 5.08) (stroke (width 0) (type default)) (fill (type none))) ${pin('2', 0)})
    (symbol "U_2_2" ${pin('2', 0)} ${pin('3', -2.54)} ${pin('4', -5.08)})))`;

export const BETA = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "GND" (power) (in_bom yes) (on_board yes)
    ${prop('Reference', '#PWR')} ${prop('Value', 'GND')}
    (symbol "GND_0_1" (polyline (pts (xy 0 0) (xy 0 -1.27)) (stroke (width 0) (type default)) (fill (type none))))
    (symbol "GND_1_1" (pin power_in line (at 0 0 270) (length 0) (name "GND" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))))
  (symbol "Q" (in_bom yes) (on_board yes)
    ${prop('Reference', 'Q')} ${prop('Value', 'Q')} ${prop('Description', 'Transistor')}
    (symbol "Q_1_1" ${pin('1', 2.54)} ${pin('2', 0)} ${pin('3', -2.54)})))`;

export interface SYMBOL_VIEWER_HARNESS {
  frame: SYMBOL_VIEWER_FRAME;
  harness: SCH_HARNESS;
  titles: string[];
  dispose(): void;
}

/**
 * The program, the two libraries and the frame; call dispose() in afterEach. The frame's statics
 * (the last symbol, unit and body style) are reset first, as a new program would have them.
 * \a aBeforeFrame runs once the libraries are in place, before the frame is made.
 */
export function symbolViewerHarness(
  aHooks: SYMBOL_VIEWER_FRAME_HOOKS = {},
  aBeforeFrame: () => void = () => {},
): SYMBOL_VIEWER_HARNESS {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  const fs = new MEMORY_FILESYSTEM();
  const unmount = wxMountFileSystem('/libs', fs);
  fs.Write('Alpha.kicad_sym', new TextEncoder().encode(ALPHA));
  fs.Write('Beta.kicad_sym', new TextEncoder().encode(BETA));

  const rows = ['Alpha', 'Beta']
    .map(
      (n) => `(lib (name "${n}")(type "KiCad")(uri "/libs/${n}.kicad_sym")(options "")(descr ""))`,
    )
    .join('');

  Pgm()
    .GetLibraryManager()
    .SetTable(
      LIBRARY_TABLE_TYPE.SYMBOL,
      LIBRARY_TABLE_SCOPE.PROJECT,
      LIBRARY_TABLE.FromFile(
        '/libs/sym-lib-table',
        `(sym_lib_table (version 7) ${rows})`,
        LIBRARY_TABLE_SCOPE.PROJECT,
        LIBRARY_TABLE_TYPE.SYMBOL,
      ),
    );
  SymbolLibAdapter(null).LoadOne('Alpha');
  SymbolLibAdapter(null).LoadOne('Beta');

  SYMBOL_VIEWER_FRAME.m_currentSymbol = new LIB_ID();
  SYMBOL_VIEWER_FRAME.m_unit = 1;
  SYMBOL_VIEWER_FRAME.m_bodyStyle = 1;

  aBeforeFrame();

  const titles: string[] = [];
  const frame = new SYMBOL_VIEWER_FRAME({
    setTitle: (aTitle) => titles.push(aTitle),
    ...aHooks,
  });
  const harness = schToolHarness(frame as unknown as SCH_EDIT_FRAME);

  return {
    frame,
    harness,
    titles,
    dispose() {
      unmount();
      SetPgm(null);
    },
  };
}
