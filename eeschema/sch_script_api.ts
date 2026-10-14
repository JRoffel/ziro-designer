// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
import type { SCH_EDIT_FRAME } from './sch_edit_frame.js';
import type { SCH_SCREEN } from './sch_screen.js';
import { ERC_TESTER } from './erc/erc.js';
import { SHEETLIST_ERC_ITEMS_PROVIDER } from './erc/erc_settings.js';
import { RPT_SEVERITY_ERROR, RPT_SEVERITY_WARNING } from '@ziroeda/common/reporter.js';
import { UNITS_PROVIDER } from '@ziroeda/common/units_provider.js';
import { schIUScale } from '@ziroeda/common/eda_units.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { SCHEMATIC } from './schematic.js';
import { SCH_SHEET_PATH } from './sch_sheet_path.js';
import type { SCH_PIN } from './sch_pin.js';
import type { SCH_SYMBOL } from './sch_symbol.js';
import type { SCH_ITEM } from './sch_item.js';
import type { EditCommand } from './tools/command.js';
import type { LibSymbol, SchSymbol, Schematic } from './types.js';

/** What a host may do to the open sheet (SchematicEditor's `registerScriptApi`). */
export interface SchScriptApi {
  doc(): Schematic | null;
  runCommand(cmd: EditCommand): void;
  annotatePlacement(sym: SchSymbol, lib: LibSymbol): SchSymbol;
  loadSymbol(library: string, symbolName: string): Promise<LibSymbol | undefined>;
  /** ERC on the hierarchy as it is now, with the project's own ERC settings. */
  erc(): SchErcLine[];
  /** The hosted symbol libraries: library nickname to symbol names. */
  symbolIndex(): Promise<readonly { name: string; symbols: readonly string[] }[]>;
  /** The hosted footprint libraries: library nickname to footprint names. */
  footprintIndex(): Promise<readonly { name: string; footprints: readonly string[] }[]>;
  /** The whole sheet as a PNG (base64, no data: prefix), as the user sees it. */
  snapshot(): string;
  /** Edit > Undo: the last edit on the sheet, whoever made it. */
  undo(): void;
  /** Every sheet file's record (the one on screen as it is now), by its project file name. */
  docs?(): ReadonlyMap<string, Schematic>;
  /** The file name of the sheet on screen. */
  currentFile?(): string;
  /** An edit on another sheet's file, as one undo step. */
  runCommandOn?(file: string, cmd: EditCommand): void;
  /**
   * An edit on the live model (KiCad's own classes): the frame brought up to date with the
   * window, \a aEdit run on it with its questions answered yes and its messages collected, and
   * the screens it returns written back into the window as one undo step. Returns what the
   * frame said (empty when all went well), or null when there is no live model to edit. An edit
   * that throws changes nothing in the window, and the throw reaches the caller.
   */
  editLive?(
    aEdit: (aFrame: SCH_EDIT_FRAME) => Promise<Iterable<SCH_SCREEN> | null>,
  ): Promise<string[] | null>;
  /** Read the live model, brought up to date with the window; null when there is none. */
  readLive?<T>(aRead: (aFrame: SCH_EDIT_FRAME) => T): T | null;
}

/** One ERC marker as a host reads it: its severity, settings key, message and named items. */
export interface SchErcLine {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  /** Pins as REF.PIN (the pin's name when it is a plain word unique on its symbol), symbols by
   *  reference, labels, wires and no-connects by kind and position in mm. */
  items: string[];
}

const mm = (aIU: number): string => String(Math.round((aIU / schIUScale.IU_PER_MM) * 100) / 100);

/**
 * ERC_TESTER run on \a aSchematic - a schematic loaded for the purpose, as kicad-cli loads one,
 * so the editor's screens get no markers - and its errors and warnings read back.
 */
export function schErcLines(aSchematic: SCHEMATIC, aShowAllErrors = false): SchErcLine[] {
  new ERC_TESTER(aSchematic, aShowAllErrors).RunTests();

  const provider = new SHEETLIST_ERC_ITEMS_PROVIDER(aSchematic);
  provider.SetSeverities(RPT_SEVERITY_ERROR | RPT_SEVERITY_WARNING);

  const units = new UNITS_PROVIDER(schIUScale, 'mm');
  const settings = aSchematic.ErcSettings();

  const name = (aId: string): string => {
    const sheet = new SCH_SHEET_PATH();
    const item = aSchematic.ResolveItem(aId, sheet, true) as SCH_ITEM | null;

    if (!item) return '';

    const pos = item.GetPosition();
    const at = `@${mm(pos.x)},${mm(pos.y)}`;

    switch (item.Type()) {
      case KICAD_T.SCH_PIN_T: {
        const pin = item as unknown as SCH_PIN;
        const symbol = pin.GetParentSymbol() as SCH_SYMBOL | null;
        const ref = symbol ? symbol.GetRef(sheet) : '?';
        const pinName = pin.GetShownName();
        const named =
          pinName !== '' &&
          pinName !== '~' &&
          /^[\w+\-/]+$/.test(pinName) &&
          (symbol?.GetPins(sheet).filter((p) => p.GetShownName() === pinName).length ?? 0) === 1;

        return `${ref}.${named ? pinName : pin.GetShownNumber()}`;
      }
      case KICAD_T.SCH_SYMBOL_T:
        return (item as unknown as SCH_SYMBOL).GetRef(sheet);
      case KICAD_T.SCH_LABEL_T:
      case KICAD_T.SCH_GLOBAL_LABEL_T:
      case KICAD_T.SCH_HIER_LABEL_T:
      case KICAD_T.SCH_DIRECTIVE_LABEL_T:
        return `label ${(item as unknown as { GetText(): string }).GetText()} ${at}`;
      case KICAD_T.SCH_LINE_T: {
        const line = item as unknown as { GetStartPoint(): VEC; GetEndPoint(): VEC };
        const a = line.GetStartPoint();
        const b = line.GetEndPoint();
        return `wire @${mm(a.x)},${mm(a.y)} @${mm(b.x)},${mm(b.y)}`;
      }
      case KICAD_T.SCH_NO_CONNECT_T:
        return `no-connect ${at}`;
      default:
        return item.GetItemDescription(units, false);
    }
  };

  const out: SchErcLine[] = [];

  for (let i = 0; i < provider.GetCount(); i++) {
    const rcItem = provider.GetItem(i)!;
    const severity = settings.GetSeverity(rcItem.GetErrorCode());

    out.push({
      severity: severity === RPT_SEVERITY_ERROR ? 'error' : 'warning',
      code: rcItem.GetSettingsKey(),
      message: rcItem.GetErrorMessage(false),
      items: [...new Set(rcItem.GetIDs().map(name).filter(Boolean))],
    });
  }

  return out;
}

interface VEC {
  x: number;
  y: number;
}
