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
 *
 * The selection (a VIEW_GROUP on LAYER_SELECT_OVERLAY) is drawn by the worker too, which keeps
 * each selected item's drawing (VIEW_GROUP::ViewDraw) instead of redrawing a whole selection on
 * every zoom step on the window's thread. A drag moves items without telling the VIEW, so a
 * group holding a moving item is drawn by the window, every frame, as KiCad draws it.
 */
import { BRIGHTENED, ENTERED, IS_MOVING, SELECTED } from '@ziroeda/common/eda_item_flags.js';
import { BASE_SET } from '@ziroeda/common/base_set.js';
import { RECURSE_MODE } from '@ziroeda/common/eda_item.js';
import type { GAL } from '@ziroeda/common/gal/graphics_abstraction_layer.js';
import { BOX2I } from '@ziroeda/kimath/src/math/box2.js';
import { EDA_ITEM } from '@ziroeda/common/eda_item.js';
import { LAYER_RATSNEST, LAYER_SELECT_OVERLAY } from '@ziroeda/common/layer_id.js';
import type { VIEW, VIEW_MIRROR } from '@ziroeda/common/view/view.js';
import { VIEW_GROUP } from '@ziroeda/common/view/view_group.js';
import type { VIEW_ITEM } from '@ziroeda/common/view/view_item.js';
import { VIEW_UPDATE_FLAGS, VIEW_VISIBILITY_FLAGS } from '@ziroeda/common/view/view_item.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { BOARD } from '../board.js';
import type { BOARD_ITEM } from '../board_item.js';
import type { PCB_RENDER_SETTINGS } from '../pcb_painter.js';
import { PCB_SELECTION } from '../tools/pcb_selection.js';
import {
  ApplyRenderSync,
  ApplyRenderSyncSheet,
  FormatRenderSyncItems,
  FormatRenderSyncSheet,
} from './render_sync.js';

/** The item flags the painter reads (IsSelected, IsBrightened, IsEntered, IsMoving). */
const STATUS_MASK = SELECTED | BRIGHTENED | ENTERED | IS_MOVING;

export type RENDER_VIEW_OP =
  /** `invalidateItem( item, flags )` for an item whose content did not change. */
  | { op: 'update'; id: string; flags: number; status: number }
  | { op: 'hide'; id: string; hide: boolean; overlay: boolean }
  | { op: 'visible'; id: string; visible: boolean }
  /** PCB_RENDER_SETTINGS, as `snapshotRenderSettings` wrote it. */
  | { op: 'settings'; settings: Record<string, unknown> }
  | { op: 'call'; name: string; args: unknown[] }
  /** The board outline (the Board Area Shadow) changed: UpdateBoardOutline, as BOARD_COMMIT. */
  | { op: 'outline' }
  /** The page and title block changed (Page Settings): FormatRenderSyncSheet's text. */
  | { op: 'sheet'; text: string }
  /** The project file changed (Board Setup: net classes, design settings): its text. */
  | { op: 'project'; text: string | null }
  /**
   * A selection group the worker draws: its layer, its items (none: the window draws it), and
   * whether it is a PCB_SELECTION, which draws a footprint's children with it.
   */
  | { op: 'group'; group: number; layer: number; pcbSelection: boolean; ids: string[] }
  /** What a recorded layer's items drew in the window (RECORDED_LAYERS), for the worker to draw. */
  | { op: 'layer'; layer: number; calls: RENDER_GAL_CALL[] };

/**
 * The overlay layers the window's items draw and the worker shows: the ratsnest, which KiCad
 * draws under the selection - and the selection is the worker's. Its connectivity, its dynamic
 * lines mid-move and the frame's settings it reads stay the window's; only the drawing moves.
 */
export const RECORDED_LAYERS: readonly number[] = [LAYER_RATSNEST];

/** One GAL call: its name and arguments. SetLineWidth's width is in pixels (see recordingGal). */
export type RENDER_GAL_CALL = [string, ...unknown[]];

/** The GAL state a recorded item sets before it draws; every Draw* call is recorded too. */
const RECORDED_STATE = new Set(['SetIsStroke', 'SetIsFill', 'SetStrokeColor', 'SetFillColor']);

/**
 * \a aGal, but every drawing call goes to \a aCalls instead; what the items ask of it (its world
 * scale, ...) it answers. A line width is world units at the window's zoom: recorded in pixels,
 * it stays the same recording at any zoom and the worker sets it at its own.
 */
function recordingGal(aGal: GAL, aCalls: RENDER_GAL_CALL[]): GAL {
  return new Proxy(aGal, {
    get(aTarget, aKey) {
      const value = Reflect.get(aTarget, aKey, aTarget) as unknown;

      if (typeof aKey !== 'string' || typeof value !== 'function') return value;

      if (aKey === 'SetLineWidth')
        return (aWidth: number) => aCalls.push(['SetLineWidth', aWidth * aTarget.GetWorldScale()]);

      if (RECORDED_STATE.has(aKey) || aKey.startsWith('Draw'))
        return (...aArgs: unknown[]) => aCalls.push([aKey, ...aArgs]);

      return (value as (...a: unknown[]) => unknown).bind(aTarget);
    },
  });
}

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

/** The drawing sheet's proxy item: the window's and the worker's are each their own. */
function isDrawingSheet(aItem: VIEW_ITEM): boolean {
  return aItem.GetClass() === 'DS_PROXY_VIEW_ITEM';
}

/** A DRC marker: drawn on the window's overlay, and not an item the board file holds. */
function isOverlayItem(aItem: BOARD_ITEM): boolean {
  return aItem.Type() === KICAD_T.PCB_MARKER_T;
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
  /** The selection groups the worker has heard of, and what it was last told each holds. */
  private m_groups = new Map<VIEW_GROUP, { id: number; items: VIEW_ITEM[] }>();
  private m_nextGroup = 1;
  /** The page and title block the worker has, as FormatRenderSyncSheet writes them. */
  private m_sheet: string;
  /** The project file's text, as the window has it now, and as the worker last had it. */
  private readonly m_projectText: () => string | null;
  private m_project: string | null;
  /** RECORDED_LAYERS: the calls being recorded, and what the worker last drew, as JSON. */
  private m_recording = new Map<number, RENDER_GAL_CALL[]>();
  private m_recorded = new Map<number, string>();

  /**
   * \a aBoard's items are the worker's already (it parsed the same board); \a aSettings answers
   * the window painter's settings when a call needs them.
   */
  constructor(
    aBoard: BOARD,
    aSettings: () => PCB_RENDER_SETTINGS,
    aPost: (aBatch: RENDER_VIEW_BATCH) => void,
    aProjectText: () => string | null = () => null,
  ) {
    this.m_board = aBoard;
    this.m_settings = aSettings;
    this.m_post = aPost;
    this.m_sheet = FormatRenderSyncSheet(aBoard);
    this.m_projectText = aProjectText;
    this.m_project = aProjectText();

    for (const item of aBoard.GetItemSet()) {
      if (isOverlayItem(item)) continue;

      this.m_mirrored.add(item);
      item.RunOnChildren((c: BOARD_ITEM) => this.m_mirrored.add(c), RECURSE_MODE.RECURSE);
    }
  }

  private isBoardItem(aItem: VIEW_ITEM): aItem is BOARD_ITEM {
    const item = aItem as Partial<BOARD_ITEM>;

    return (
      typeof item.GetBoard === 'function' &&
      item.GetBoard() === this.m_board &&
      !isOverlayItem(item as BOARD_ITEM)
    );
  }

  ItemAdded(aItem: VIEW_ITEM): void {
    if (isDrawingSheet(aItem)) {
      this.schedule();
      return;
    }

    if (aItem === this.m_board.BoardOutline()) {
      this.pushOp({ op: 'outline' });
      return;
    }

    if (!this.isBoardItem(aItem)) return;

    this.m_mirrored.add(aItem);
    this.upsert(aItem);
  }

  ItemRemoved(aItem: VIEW_ITEM): void {
    if (aItem instanceof VIEW_GROUP && this.m_groups.has(aItem)) {
      this.sendGroup(aItem, []);
      this.m_groups.delete(aItem);
      return;
    }

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
    // Page Settings: the page or title block may have changed (Flush compares them).
    if (isDrawingSheet(aItem)) {
      this.schedule();
      return;
    }

    // Not one of the board's items: the worker's board computes its own from its edges.
    if (aItem === this.m_board.BoardOutline() && aUpdateFlags !== VIEW_UPDATE_FLAGS.INITIAL_ADD) {
      this.pushOp({ op: 'outline' });
      return;
    }

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

  ItemsConditionallyUpdated(): void {
    // The items' updates arrive one by one (ItemInvalidated); what they are drawn with goes first.
    this.pushOp({ op: 'settings', settings: snapshotRenderSettings(this.m_settings()) });
  }

  LayerRecorder(aLayer: number, aGal: GAL): GAL | null {
    if (!RECORDED_LAYERS.includes(aLayer)) return null;

    const calls: RENDER_GAL_CALL[] = [];

    this.m_recording.set(aLayer, calls);

    return recordingGal(aGal, calls);
  }

  LayerRecorded(aLayer: number): void {
    const calls = this.m_recording.get(aLayer);

    if (!calls) return;

    this.m_recording.delete(aLayer);

    // The overlay redraws for a moved cursor or preview as well: send only a changed drawing.
    const key = JSON.stringify(calls);

    if (key === this.m_recorded.get(aLayer)) return;

    this.m_recorded.set(aLayer, key);
    this.pushOp({ op: 'layer', layer: aLayer, calls: JSON.parse(key) as RENDER_GAL_CALL[] });
  }

  DrawsGroup(aGroup: VIEW_GROUP): boolean {
    if (aGroup.ViewGetLayers()[0] !== LAYER_SELECT_OVERLAY) return false;

    const items = this.drawableItems(aGroup);

    this.sendGroup(aGroup, items ?? []);

    return items !== null;
  }

  /**
   * \a aGroup's items, when the worker can draw every one as it is: items it has, none of them
   * moving. Null when the window must draw the group.
   */
  private drawableItems(aGroup: VIEW_GROUP): VIEW_ITEM[] | null {
    const items: VIEW_ITEM[] = [];

    for (let i = 0; i < aGroup.GetSize(); i++) {
      const item = aGroup.GetItem(i)!;

      if (!this.m_mirrored.has(item) || (item as BOARD_ITEM).IsMoving()) return null;

      items.push(item);
    }

    return items;
  }

  /** Tell the worker \a aGroup now holds \a aItems, unless it already knows. */
  private sendGroup(aGroup: VIEW_GROUP, aItems: VIEW_ITEM[]): void {
    let sent = this.m_groups.get(aGroup);

    if (!sent) {
      if (aItems.length === 0) return;

      sent = { id: this.m_nextGroup++, items: [] };
      this.m_groups.set(aGroup, sent);
    }

    if (sent.items.length === aItems.length && sent.items.every((it, i) => it === aItems[i]))
      return;

    sent.items = aItems;
    this.pushOp({
      op: 'group',
      group: sent.id,
      layer: aGroup.ViewGetLayers()[0]!,
      pcbSelection: aGroup instanceof PCB_SELECTION,
      ids: aItems.map((i) => (i as BOARD_ITEM).m_Uuid),
    });
  }

  /** Post what has been collected now, rather than at the end of the task. */
  Flush(): void {
    // A group emptied or changed since it was last drawn: an empty group is never drawn, so
    // the worker would keep showing the last selection.
    for (const group of this.m_groups.keys())
      this.sendGroup(group, this.drawableItems(group) ?? []);

    // Ahead of anything drawn with them: text variables read the title block.
    const sheet = FormatRenderSyncSheet(this.m_board);

    if (sheet !== this.m_sheet) {
      this.m_sheet = sheet;
      this.m_ops.unshift({ op: 'sheet', text: sheet });
    }

    // Board Setup writes the project file; net classes and clearances are drawn from it.
    const project = this.m_projectText();

    if (project !== this.m_project) {
      this.m_project = project;
      this.m_ops.unshift({ op: 'project', text: project });
    }

    this.m_scheduled = false;

    if (this.m_upsert.size === 0 && this.m_remove.size === 0 && this.m_ops.length === 0) return;

    const upsert = [...this.m_upsert.values()];
    const batch: RENDER_VIEW_BATCH = {
      upsert: upsert.length > 0 ? FormatRenderSyncItems(this.m_board, upsert) : '',
      remove: [...this.m_remove],
      ops: [...upsert.flatMap((i) => this.viewState(i)), ...this.m_ops],
    };

    this.m_upsert.clear();
    this.m_remove.clear();
    this.m_ops = [];

    this.m_post(batch);
  }

  /**
   * An upserted item arrives as the board writes it, a new object that knows nothing of the
   * view: its status (selected, brightened, moving) and whether the view hides it - a selected
   * item is hidden, drawn by the selection instead - follow, for it and every child.
   */
  private viewState(aTop: BOARD_ITEM): RENDER_VIEW_OP[] {
    const ops: RENDER_VIEW_OP[] = [];

    const state = (aItem: BOARD_ITEM, aAlways: boolean): void => {
      const status = aItem.GetFlags() & STATUS_MASK;

      if (aAlways || status !== 0)
        ops.push({ op: 'update', id: aItem.m_Uuid, flags: VIEW_UPDATE_FLAGS.COLOR, status });

      const flags = aItem.viewPrivData()?.m_flags ?? VIEW_VISIBILITY_FLAGS.VISIBLE;

      if (!(flags & VIEW_VISIBILITY_FLAGS.VISIBLE))
        ops.push({ op: 'visible', id: aItem.m_Uuid, visible: false });
      else if (flags & (VIEW_VISIBILITY_FLAGS.HIDDEN | VIEW_VISIBILITY_FLAGS.OVERLAY_HIDDEN))
        ops.push({
          op: 'hide',
          id: aItem.m_Uuid,
          hide: (flags & VIEW_VISIBILITY_FLAGS.HIDDEN) !== 0,
          overlay: (flags & VIEW_VISIBILITY_FLAGS.OVERLAY_HIDDEN) !== 0,
        });
    };

    state(aTop, true);
    aTop.RunOnChildren((c: BOARD_ITEM) => state(c, false), RECURSE_MODE.RECURSE);

    return ops;
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

/** A selection group as the worker draws it: its VIEW_GROUP, and its items by uuid. */
interface RENDER_GROUP {
  group: VIEW_GROUP;
  ids: string[];
}

const RENDER_GROUPS = new WeakMap<VIEW, Map<number, RENDER_GROUP>>();

/** A recorded layer, in the worker's VIEW: draws the window's calls again (RECORDED_LAYERS). */
export class RENDER_LAYER_REPLAY extends EDA_ITEM {
  private readonly m_layer: number;
  m_calls: RENDER_GAL_CALL[] = [];

  constructor(aLayer: number) {
    super(KICAD_T.NOT_USED);
    this.m_layer = aLayer;
  }

  override ViewBBox(): BOX2I {
    const bbox = new BOX2I();
    bbox.SetMaximum();

    return bbox;
  }

  override ViewGetLayers(): number[] {
    return [this.m_layer];
  }

  override ViewDraw(_aLayer: number, aView: VIEW): void {
    const gal = aView.GetGAL();
    const calls = gal as unknown as Record<string, (...a: unknown[]) => void>;

    for (const [name, ...args] of this.m_calls) {
      if (name === 'SetLineWidth') gal.SetLineWidth((args[0] as number) / gal.GetWorldScale());
      else calls[name]!.call(gal, ...args);
    }
  }

  override GetClass(): string {
    return 'RENDER_LAYER_REPLAY';
  }
}

const RENDER_REPLAYS = new WeakMap<VIEW, Map<number, RENDER_LAYER_REPLAY>>();

/** The recorded layers the worker's \a aView draws, by layer. */
export function RenderReplaysOf(aView: VIEW): ReadonlyMap<number, RENDER_LAYER_REPLAY> {
  return RENDER_REPLAYS.get(aView) ?? new Map();
}

/** The selection groups the worker's \a aView draws, by the window's id. */
export function RenderGroupsOf(aView: VIEW): ReadonlyMap<number, RENDER_GROUP> {
  return RENDER_GROUPS.get(aView) ?? new Map();
}

/** Fill \a aGroup's VIEW_GROUP with the board's items of its uuids. */
function fillRenderGroup(aBoard: BOARD, aView: VIEW, aGroup: RENDER_GROUP): void {
  aGroup.group.Clear();

  for (const id of aGroup.ids) {
    const item = aBoard.ResolveItem(id, true);

    if (item) aGroup.group.Add(item);
  }

  aView.Update(aGroup.group);
}

/** The worker's side: apply a batch to its board, its VIEW and its painter's settings. */
/** What a batch asks of the worker beyond its board and VIEW. */
export interface RENDER_VIEW_HOOKS {
  /** The board's page and title block changed in place: the drawing sheet follows. */
  sheetChanged?(): void;
  /** The project file changed: take it into the board (ApplyProjectToBoard). */
  projectChanged?(aText: string | null): void;
}

export function ApplyRenderViewBatch(
  aBoard: BOARD,
  aView: VIEW,
  aSettings: PCB_RENDER_SETTINGS,
  aBatch: RENDER_VIEW_BATCH,
  aHooks: RENDER_VIEW_HOOKS = {},
): void {
  ApplyRenderSync(aBoard, aView, { upsert: aBatch.upsert, remove: aBatch.remove });

  let groups = RENDER_GROUPS.get(aView);

  if (!groups) {
    groups = new Map();
    RENDER_GROUPS.set(aView, groups);
  }

  // An upserted item is a new object: a group still holding the old one draws a ghost.
  if (aBatch.upsert !== '' || aBatch.remove.length > 0)
    for (const g of groups.values()) fillRenderGroup(aBoard, aView, g);

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
      case 'sheet':
        ApplyRenderSyncSheet(aBoard, op.text);
        aHooks.sheetChanged?.();
        break;
      case 'project':
        aHooks.projectChanged?.(op.text);
        break;
      case 'outline': {
        const outline = aBoard.BoardOutline();

        aBoard.UpdateBoardOutline();

        if (aView.HasItem(outline)) aView.Update(outline);
        else aView.Add(outline);
        break;
      }
      case 'group': {
        let g = groups.get(op.group);

        if (!g) {
          g = { group: op.pcbSelection ? new PCB_SELECTION() : new VIEW_GROUP(), ids: [] };
          g.group.SetLayer(op.layer);
          groups.set(op.group, g);
          aView.Add(g.group);
        }

        g.ids = op.ids;
        fillRenderGroup(aBoard, aView, g);
        break;
      }
      case 'layer': {
        let replays = RENDER_REPLAYS.get(aView);

        if (!replays) {
          replays = new Map();
          RENDER_REPLAYS.set(aView, replays);
        }

        let replay = replays.get(op.layer);

        if (!replay) {
          replay = new RENDER_LAYER_REPLAY(op.layer);
          replays.set(op.layer, replay);
          replay.m_calls = op.calls;
          aView.Add(replay);
        } else {
          replay.m_calls = op.calls;
          aView.Update(replay);
        }
        break;
      }
    }
  }
}
