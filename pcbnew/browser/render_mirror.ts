// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Stage 3 of the render worker (not KiCad's): the window's VIEW, mirrored into the worker's.
 *
 * The window keeps its PCB_VIEW - the tools hit-test through its R-trees and draw their
 * overlays with it - but in overlay-only mode it caches and draws nothing else. Every call that
 * changes what KiCad's VIEW would draw reaches RENDER_VIEW_MIRROR (VIEW_MIRROR) and is batched,
 * once per task, into a RENDER_VIEW_BATCH for the worker's VIEW, which then does exactly what
 * the window's would have done: an added or reshaped item travels as text (render_sync.ts's
 * format, a child as its footprint); a repaint, a hide or a selection travels as its uuid and
 * flags; a view-wide call (layer visibility, the top layer, a recolour, a recache) travels by
 * name, after the painter's settings it reads.
 */
import { BRIGHTENED, ENTERED, IS_MOVING, SELECTED } from '@ziroeda/common/eda_item_flags.js';
import { BASE_SET } from '@ziroeda/common/base_set.js';
import { RECURSE_MODE } from '@ziroeda/common/eda_item.js';
import type { VIEW, VIEW_MIRROR } from '@ziroeda/common/view/view.js';
import type { VIEW_ITEM } from '@ziroeda/common/view/view_item.js';
import { VIEW_UPDATE_FLAGS } from '@ziroeda/common/view/view_item.js';
import type { BOARD } from '../board.js';
import type { BOARD_ITEM } from '../board_item.js';
import type { PCB_RENDER_SETTINGS } from '../pcb_painter.js';
import { ApplyRenderSync, FormatRenderSyncItems } from './render_sync.js';

/** The item flags the painter reads (IsSelected, IsBrightened, IsEntered, IsMoving). */
const STATUS_MASK = SELECTED | BRIGHTENED | ENTERED | IS_MOVING;

export type RENDER_VIEW_OP =
  /** `invalidateItem( item, flags )` for an item whose content did not change. */
  | { op: 'update'; id: string; flags: number; status: number }
  | { op: 'hide'; id: string; hide: boolean; overlay: boolean }
  | { op: 'visible'; id: string; visible: boolean }
  /** PCB_RENDER_SETTINGS, as `snapshotRenderSettings` wrote it. */
  | { op: 'settings'; settings: Record<string, unknown> }
  | { op: 'call'; name: string; args: unknown[] };

/** One task's worth of what the window's VIEW did. */
export interface RENDER_VIEW_BATCH {
  /** The items added or reshaped, as render_sync writes them; empty for none. */
  upsert: string;
  remove: string[];
  ops: RENDER_VIEW_OP[];
}

/** The calls whose result depends on the painter's settings: those travel first. */
const READS_SETTINGS = new Set([
  'UpdateAllLayersColor',
  'UpdateLayerColor',
  'RecacheAllItems',
  'UpdateAllItems',
]);

/**
 * PCB_RENDER_SETTINGS as data: every own field `structuredClone` carries (Maps and Sets as such,
 * colours are plain), and a layer set (BASE_SET) as its words. A field holding any other object
 * (the pad being edited) is left out: the worker keeps its own.
 */
export function snapshotRenderSettings(aSettings: PCB_RENDER_SETTINGS): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(aSettings)) {
    if (typeof value === 'function') continue;

    if (value instanceof BASE_SET) {
      out[key] = { __words: [...(value as unknown as { m_words: number[] }).m_words] };
      continue;
    }

    if (value !== null && typeof value === 'object') {
      const proto = Object.getPrototypeOf(value);

      if (
        proto !== Object.prototype &&
        proto !== Array.prototype &&
        !(value instanceof Map) &&
        !(value instanceof Set)
      )
        continue;
    }

    out[key] = value;
  }

  return out;
}

/** Install a snapshot on the worker's PCB_RENDER_SETTINGS. */
export function applyRenderSettings(
  aSettings: PCB_RENDER_SETTINGS,
  aSnapshot: Record<string, unknown>,
): void {
  const target = aSettings as unknown as Record<string, unknown>;

  for (const [key, value] of Object.entries(aSnapshot)) {
    const current = target[key];

    if (current instanceof BASE_SET && value && typeof value === 'object' && '__words' in value) {
      (current as unknown as { m_words: number[] }).m_words = [
        ...(value as { __words: number[] }).__words,
      ];
      continue;
    }

    target[key] = value;
  }
}

/** The top-level item that carries \a aItem: itself, or its footprint. */
function topLevel(aItem: BOARD_ITEM): BOARD_ITEM {
  return (aItem.GetParentFootprint() as BOARD_ITEM | null) ?? aItem;
}

/**
 * The window's side: a VIEW_MIRROR that batches what the VIEW did and posts it once per task.
 * Only items of the board are mirrored - previews, the ratsnest, markers and the selection live
 * on the overlay, which the window draws itself.
 */
export class RENDER_VIEW_MIRROR implements VIEW_MIRROR {
  private readonly m_board: BOARD;
  private readonly m_settings: () => PCB_RENDER_SETTINGS;
  private readonly m_post: (aBatch: RENDER_VIEW_BATCH) => void;
  /** The items the worker has: the board's when attached, and every one added since. */
  private readonly m_mirrored = new WeakSet<VIEW_ITEM>();
  private m_upsert = new Map<string, BOARD_ITEM>();
  private m_remove = new Set<string>();
  private m_ops: RENDER_VIEW_OP[] = [];
  private m_scheduled = false;

  /**
   * \a aBoard's items are the worker's already (it parsed the same board); \a aSettings answers
   * the window painter's settings when a call needs them.
   */
  constructor(
    aBoard: BOARD,
    aSettings: () => PCB_RENDER_SETTINGS,
    aPost: (aBatch: RENDER_VIEW_BATCH) => void,
  ) {
    this.m_board = aBoard;
    this.m_settings = aSettings;
    this.m_post = aPost;

    for (const item of aBoard.GetItemSet()) {
      this.m_mirrored.add(item);
      item.RunOnChildren((c: BOARD_ITEM) => this.m_mirrored.add(c), RECURSE_MODE.RECURSE);
    }
  }

  private isBoardItem(aItem: VIEW_ITEM): aItem is BOARD_ITEM {
    const item = aItem as Partial<BOARD_ITEM>;

    return typeof item.GetBoard === 'function' && item.GetBoard() === this.m_board;
  }

  ItemAdded(aItem: VIEW_ITEM): void {
    if (!this.isBoardItem(aItem)) return;

    this.m_mirrored.add(aItem);
    this.upsert(aItem);
  }

  ItemRemoved(aItem: VIEW_ITEM): void {
    if (!this.m_mirrored.has(aItem)) return;

    this.m_mirrored.delete(aItem);

    const item = aItem as BOARD_ITEM;
    const top = topLevel(item);

    if (top !== item) {
      this.upsert(top);
      return;
    }

    this.m_upsert.delete(item.m_Uuid);
    this.m_remove.add(item.m_Uuid);
    this.schedule();
  }

  ItemInvalidated(aItem: VIEW_ITEM, aUpdateFlags: number): void {
    if (!this.m_mirrored.has(aItem)) return;

    // VIEW::Add's own first update: the item reached the worker with ItemAdded (or with the board).
    if (aUpdateFlags === VIEW_UPDATE_FLAGS.INITIAL_ADD) return;

    aUpdateFlags &= ~VIEW_UPDATE_FLAGS.INITIAL_ADD;

    const item = aItem as BOARD_ITEM;

    if (aUpdateFlags & (VIEW_UPDATE_FLAGS.GEOMETRY | VIEW_UPDATE_FLAGS.LAYERS)) {
      this.upsert(item);
      return;
    }

    this.pushOp({
      op: 'update',
      id: item.m_Uuid,
      flags: aUpdateFlags,
      status: item.GetFlags() & STATUS_MASK,
    });
  }

  ItemHidden(aItem: VIEW_ITEM, aHide: boolean, aHideOverlay: boolean): void {
    if (!this.m_mirrored.has(aItem)) return;

    this.pushOp({
      op: 'hide',
      id: (aItem as BOARD_ITEM).m_Uuid,
      hide: aHide,
      overlay: aHideOverlay,
    });
  }

  ItemVisible(aItem: VIEW_ITEM, aVisible: boolean): void {
    if (!this.m_mirrored.has(aItem)) return;

    this.pushOp({ op: 'visible', id: (aItem as BOARD_ITEM).m_Uuid, visible: aVisible });
  }

  Call(aName: string, aArgs: unknown[]): void {
    if (READS_SETTINGS.has(aName))
      this.pushOp({ op: 'settings', settings: snapshotRenderSettings(this.m_settings()) });

    this.pushOp({ op: 'call', name: aName, args: aArgs });
  }

  /** Post what has been collected now, rather than at the end of the task. */
  Flush(): void {
    this.m_scheduled = false;

    if (this.m_upsert.size === 0 && this.m_remove.size === 0 && this.m_ops.length === 0) return;

    const upsert = [...this.m_upsert.values()];
    const batch: RENDER_VIEW_BATCH = {
      upsert: upsert.length > 0 ? FormatRenderSyncItems(this.m_board, upsert) : '',
      remove: [...this.m_remove],
      // An upserted item arrives as the board writes it, which knows nothing of the view's
      // selection: its status follows.
      ops: [
        ...upsert.map(
          (i): RENDER_VIEW_OP => ({
            op: 'update',
            id: i.m_Uuid,
            flags: VIEW_UPDATE_FLAGS.COLOR,
            status: i.GetFlags() & STATUS_MASK,
          }),
        ),
        ...this.m_ops,
      ],
    };

    this.m_upsert.clear();
    this.m_remove.clear();
    this.m_ops = [];

    this.m_post(batch);
  }

  private upsert(aItem: BOARD_ITEM): void {
    const top = topLevel(aItem);

    this.m_remove.delete(top.m_Uuid);
    this.m_upsert.set(top.m_Uuid, top);
    this.schedule();
  }

  private pushOp(aOp: RENDER_VIEW_OP): void {
    this.m_ops.push(aOp);
    this.schedule();
  }

  private schedule(): void {
    if (this.m_scheduled) return;

    this.m_scheduled = true;
    queueMicrotask(() => {
      if (this.m_scheduled) this.Flush();
    });
  }
}

/** The worker's side: apply a batch to its board, its VIEW and its painter's settings. */
export function ApplyRenderViewBatch(
  aBoard: BOARD,
  aView: VIEW,
  aSettings: PCB_RENDER_SETTINGS,
  aBatch: RENDER_VIEW_BATCH,
): void {
  ApplyRenderSync(aBoard, aView, { upsert: aBatch.upsert, remove: aBatch.remove });

  const find = (aId: string): BOARD_ITEM | null => aBoard.ResolveItem(aId, true);

  for (const op of aBatch.ops) {
    switch (op.op) {
      case 'update': {
        const item = find(op.id);

        if (!item) break;

        item.ClearFlags(STATUS_MASK);
        item.SetFlags(op.status);
        aView.Update(item, op.flags);
        break;
      }
      case 'hide': {
        const item = find(op.id);

        if (item) aView.Hide(item, op.hide, op.overlay);
        break;
      }
      case 'visible': {
        const item = find(op.id);

        if (item) aView.SetVisible(item, op.visible);
        break;
      }
      case 'settings':
        applyRenderSettings(aSettings, op.settings);
        break;
      case 'call':
        (aView as unknown as Record<string, (...a: unknown[]) => void>)[op.name]!(...op.args);
        break;
    }
  }
}
