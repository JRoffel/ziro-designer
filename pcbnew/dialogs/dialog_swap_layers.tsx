// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `DIALOG_SWAP_LAYERS` (pcbnew/dialogs/dialog_swap_layers.cpp): the grid of
 * "Move items on:" / "To layer:", one row per enabled copper layer, filling the
 * layer map GLOBAL_EDIT_TOOL::SwapLayers applies. `DialogSwapLayers` below is its window,
 * DIALOG_SWAP_LAYERS_BASE over LAYER_GRID_TABLE.
 *
 * ## It is a one-way map, not a swap
 *
 * There is no swap operator upstream. Each row is "move items on X to Y", so
 * the result is any function from the enabled copper layers onto themselves;
 * mapping two layers onto one merges them without asking. A real swap is two
 * rows (F.Cu → B.Cu, B.Cu → F.Cu), which works because SwapLayers maps each
 * item's original layer set in one pass.
 */
import { type JSX, useEffect, useState } from 'react';
import { LSET } from '@ziroeda/common/lset.js';
import { WX_GRID, WX_GRID_TABLE_BASE } from '@ziroeda/common/widgets/wx_grid.js';
import { wxGRID_VALUE_NUMBER, wxGridCellAttr, wxGridSelectionModes } from '@ziroeda/wx/grid.js';
import { PCB_LAYER_ID } from '@ziroeda/common/layer_id.js';
import type { BOARD } from '../board.js';
import {
  GRID_CELL_LAYER_RENDERER,
  GRID_CELL_LAYER_SELECTOR,
  choiceOf,
} from '../grid_layer_box_helpers.js';
import { DIALOG_SWAP_LAYERS_BASE } from './dialog_swap_layers_base.js';

/** One grid row: `LAYER_GRID_TABLE`'s `std::pair<PCB_LAYER_ID, PCB_LAYER_ID>`. */
export interface SWAP_LAYERS_ROW {
  /** Column 0, read-only: the layer items are moved from. */
  from: PCB_LAYER_ID;
  /** Column 1: the layer they go to; a GRID_CELL_LAYER_SELECTOR over copper. */
  to: PCB_LAYER_ID;
}

export class DIALOG_SWAP_LAYERS {
  private m_rows: SWAP_LAYERS_ROW[] = [];

  /**
   * @param m_parent the frame; only its board is read.
   * @param m_layerMap filled by TransferDataFromWindow, as the C++ dialog's reference is.
   */
  constructor(
    private readonly m_parent: { GetBoard(): BOARD | null },
    private readonly m_layerMap: Map<PCB_LAYER_ID, PCB_LAYER_ID>,
  ) {}

  private enabledCopperLayers(): LSET {
    return LSET.AllCuMask(this.m_parent.GetBoard()!.GetCopperLayerCount());
  }

  /** One row per enabled copper layer in UI order (front, inners, back), each to itself. */
  TransferDataToWindow(): boolean {
    this.m_rows = [];

    for (const layer of this.enabledCopperLayers().UIOrder()) {
      this.m_rows.push({ from: layer, to: layer });
    }

    return true;
  }

  GetRows(): readonly SWAP_LAYERS_ROW[] {
    return this.m_rows;
  }

  /** The column-1 editor's `SetValueAsLong( row, 1, layer )`. */
  SetDestination(aRow: number, aLayer: PCB_LAYER_ID): void {
    const row = this.m_rows[aRow];

    if (row) row.to = aLayer;
  }

  /**
   * The layers the "To layer:" editor offers: the editor is built with
   * `LSET::AllNonCuMask()` as the layers it must NOT offer.
   */
  GetNotAllowedLayers(): LSET {
    return LSET.AllNonCuMask();
  }

  /** Every row whose destination is an enabled copper layer goes into the map. */
  TransferDataFromWindow(): boolean {
    const enabledCopperLayers = this.enabledCopperLayers();
    let row = 0;

    for (const layer of enabledCopperLayers.UIOrder()) {
      const dest = this.m_rows[row++]?.to ?? -1;

      if (dest >= 0 && dest < PCB_LAYER_ID.PCB_LAYER_ID_COUNT && enabledCopperLayers.Contains(dest))
        this.m_layerMap.set(layer, dest);
    }

    return true;
  }
}

/** `LAYER_GRID_TABLE` (dialog_swap_layers.cpp:35-85), over the dialog's rows. */
class LAYER_GRID_TABLE extends WX_GRID_TABLE_BASE {
  constructor(private readonly m_dialog: DIALOG_SWAP_LAYERS) {
    super();
  }

  GetNumberRows(): number {
    return this.m_dialog.GetRows().length;
  }

  GetNumberCols(): number {
    return 2;
  }

  override GetColLabelValue(aCol: number): string {
    switch (aCol) {
      case 0:
        return 'Move items on:';
      case 1:
        return 'To layer:';
      default:
        return '';
    }
  }

  override CanGetValueAs(_aRow: number, _aCol: number, aTypeName: string): boolean {
    return aTypeName === wxGRID_VALUE_NUMBER;
  }

  override CanSetValueAs(aRow: number, aCol: number, aTypeName: string): boolean {
    return this.CanGetValueAs(aRow, aCol, aTypeName);
  }

  GetValue(): string {
    return 'undefined';
  }

  SetValue(): void {}

  override GetValueAsLong(aRow: number, aCol: number): number {
    const row = this.m_dialog.GetRows()[aRow];

    if (!row || aCol < 0 || aCol >= 2) return -1;

    return aCol === 0 ? row.from : row.to;
  }

  override SetValueAsLong(aRow: number, aCol: number, aValue: number): void {
    if (aCol === 1) this.m_dialog.SetDestination(aRow, aValue);
  }
}

export function DialogSwapLayers({
  dialog,
  copperLayerCount,
  onResult,
}: {
  dialog: DIALOG_SWAP_LAYERS;
  /** The board's copper layer count: the selector offers its enabled copper layers. */
  copperLayerCount: number;
  onResult: (aOk: boolean) => void;
}): JSX.Element {
  const [grid] = useState(() => {
    const g = new WX_GRID();
    g.SetTable(new LAYER_GRID_TABLE(dialog), true, wxGridSelectionModes.wxGridSelectCells);

    const notAllowed = dialog.GetNotAllowedLayers();
    const offered = LSET.AllCuMask(copperLayerCount)
      .UIOrder()
      .filter((l) => !notAllowed.Contains(l));

    const from = new wxGridCellAttr();
    from.SetRenderer(new GRID_CELL_LAYER_RENDERER(choiceOf));
    from.SetReadOnly();
    g.SetColAttr(0, from);

    const to = new wxGridCellAttr();
    to.SetRenderer(new GRID_CELL_LAYER_RENDERER(choiceOf));
    to.SetEditor(
      new GRID_CELL_LAYER_SELECTOR(() =>
        offered.map((layer) => {
          const c = choiceOf(layer);
          return { layer, label: c.label, swatch: c.swatch };
        }),
      ),
    );
    g.SetColAttr(1, to);

    return g;
  });

  useEffect(() => {
    grid.ForceRefresh();
  }, [grid]);

  const ok = (): void => {
    if (!grid.CommitPendingChanges()) return;

    if (dialog.TransferDataFromWindow()) onResult(true);
  };

  return <DIALOG_SWAP_LAYERS_BASE m_grid={grid} onOK={ok} onCancel={() => onResult(false)} />;
}
