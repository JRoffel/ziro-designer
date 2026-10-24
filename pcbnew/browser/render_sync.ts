// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Stage 2 of the render worker (not KiCad's): the worker's copy of the board kept equal to the
 * window's, edit by edit.
 *
 * The window's board is the one the tools edit; every edit reaches it through BOARD_COMMIT,
 * which tells the board's BOARD_LISTENERs what it added, removed and changed. RENDER_SYNC is
 * such a listener: it writes the touched items as the clipboard writes a selection - a
 * `(kicad_pcb ...)` holding just them, in the board's own format, uuids and net names and all -
 * and `ApplyRenderSync` on the other side swaps them into its board by uuid.
 *
 * A child (a pad, a footprint's field or graphic) travels as its whole footprint, as the
 * clipboard copies it, so the worker never has to patch a footprint piecemeal.
 */
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import { PRETTIFIED_STRING_FORMATTER } from '@ziroeda/common/richio.js';
import type { VIEW } from '@ziroeda/common/view/view.js';
import { BOARD_LISTENER, type BOARD } from '../board.js';
import type { BOARD_CONNECTED_ITEM } from '../board_connected_item.js';
import type { BOARD_ITEM } from '../board_item.js';
import type { FOOTPRINT } from '../footprint.js';
import { NETINFO_ITEM } from '../netinfo_item.js';
import {
  CTL_ENUMERATE_LAYERS,
  CTL_FOR_BOARD,
  PCB_IO_KICAD_SEXPR,
} from '../pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import {
  PCB_IO_KICAD_SEXPR_PARSER,
  SEXPR_BOARD_FILE_VERSION,
} from '../pcb_io/kicad_sexpr/pcb_io_kicad_sexpr_parser.js';
import type { ZONE } from '../zone.js';

/** What the window posts the worker for one push of edits. */
export interface RENDER_SYNC_MESSAGE {
  /** The added and changed items, as a `(kicad_pcb ...)` holding just them; empty for none. */
  upsert: string;
  /** The uuids of the removed items. */
  remove: string[];
}

/** The item the sync carries for \a aItem: itself, or the footprint it belongs to. */
function topLevel(aItem: BOARD_ITEM): BOARD_ITEM {
  return (aItem.GetParentFootprint() as BOARD_ITEM | null) ?? aItem;
}

/** The items as the clipboard writes a selection: a `.kicad_pcb` holding just them. */
export function FormatRenderSyncItems(aBoard: BOARD, aItems: Iterable<BOARD_ITEM>): string {
  const formatter = new PRETTIFIED_STRING_FORMATTER();
  // A transport, as the DRC and fill jobs' board text: nets by name, every layer spelled out.
  const io = new PCB_IO_KICAD_SEXPR(CTL_FOR_BOARD | CTL_ENUMERATE_LAYERS);
  io.SetOutputFormatter(formatter);

  io.SetBoard(aBoard);
  formatter.Print(`(kicad_pcb (version ${SEXPR_BOARD_FILE_VERSION})`);
  io.FormatBoardLayers(aBoard);

  for (const item of aItems) io.Format(item);

  formatter.Print(')');

  return formatter.Finish();
}

/**
 * A BOARD_LISTENER that turns each BOARD_COMMIT push into one RENDER_SYNC_MESSAGE. The items are
 * collected as the listener calls arrive and written once, when the commit is done (the next
 * microtask): a push reports added, removed and changed separately.
 */
export class RENDER_SYNC extends BOARD_LISTENER {
  private readonly m_board: BOARD;
  private readonly m_post: (aMessage: RENDER_SYNC_MESSAGE) => void;
  private m_upsert = new Map<string, BOARD_ITEM>();
  private m_remove = new Set<string>();
  private m_scheduled = false;

  constructor(aBoard: BOARD, aPost: (aMessage: RENDER_SYNC_MESSAGE) => void) {
    super();
    this.m_board = aBoard;
    this.m_post = aPost;
  }

  /** BOARD_COMMIT::Push's one call per push. */
  override OnBoardCompositeUpdate(
    aBoard: BOARD,
    aAdded: BOARD_ITEM[],
    aRemoved: BOARD_ITEM[],
    aChanged: BOARD_ITEM[],
  ): void {
    this.OnBoardItemsAdded(aBoard, aAdded);
    this.OnBoardItemsRemoved(aBoard, aRemoved);
    this.OnBoardItemsChanged(aBoard, aChanged);
  }

  override OnBoardItemAdded(aBoard: BOARD, aItem: BOARD_ITEM): void {
    this.OnBoardItemsAdded(aBoard, [aItem]);
  }

  override OnBoardItemRemoved(aBoard: BOARD, aItem: BOARD_ITEM): void {
    this.OnBoardItemsRemoved(aBoard, [aItem]);
  }

  override OnBoardItemChanged(aBoard: BOARD, aItem: BOARD_ITEM): void {
    this.OnBoardItemsChanged(aBoard, [aItem]);
  }

  override OnBoardItemsAdded(_aBoard: BOARD, aItems: BOARD_ITEM[]): void {
    for (const item of aItems) this.upsert(item);
  }

  override OnBoardItemsChanged(_aBoard: BOARD, aItems: BOARD_ITEM[]): void {
    for (const item of aItems) this.upsert(item);
  }

  override OnBoardItemsRemoved(_aBoard: BOARD, aItems: BOARD_ITEM[]): void {
    for (const item of aItems) {
      const top = topLevel(item);

      // A child removed from a footprint changes the footprint; the footprint itself goes.
      if (top !== item) {
        this.upsert(top);
        continue;
      }

      this.m_upsert.delete(item.m_Uuid);
      this.m_remove.add(item.m_Uuid);
    }

    this.schedule();
  }

  /** Write what has been collected now, rather than at the end of the task. */
  Flush(): void {
    this.m_scheduled = false;

    if (this.m_upsert.size === 0 && this.m_remove.size === 0) return;

    const upsert = [...this.m_upsert.values()];
    const remove = [...this.m_remove];

    this.m_upsert.clear();
    this.m_remove.clear();

    this.m_post({
      upsert: upsert.length > 0 ? FormatRenderSyncItems(this.m_board, upsert) : '',
      remove,
    });
  }

  private upsert(aItem: BOARD_ITEM): void {
    const top = topLevel(aItem);

    // Nets are carried by name on the items that use them; the net items themselves are not drawn.
    if (top.Type() === KICAD_T.PCB_NETINFO_T) return;

    this.m_remove.delete(top.m_Uuid);
    this.m_upsert.set(top.m_Uuid, top);
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

/** `aItem`'s connected items, its own and (for a footprint) its pads', for re-binding nets. */
function connectedItems(aItem: BOARD_ITEM): BOARD_CONNECTED_ITEM[] {
  if (aItem.Type() === KICAD_T.PCB_FOOTPRINT_T)
    return (aItem as unknown as FOOTPRINT).Pads() as unknown as BOARD_CONNECTED_ITEM[];

  return aItem.IsConnected() ? [aItem as BOARD_CONNECTED_ITEM] : [];
}

/**
 * The board's page and title block, which the drawing sheet and every text variable read: not
 * items, so no commit carries them. The same transport, a header-only `kicad_pcb`.
 */
export function FormatRenderSyncSheet(aBoard: BOARD): string {
  const formatter = new PRETTIFIED_STRING_FORMATTER();

  formatter.Print(`(kicad_pcb (version ${SEXPR_BOARD_FILE_VERSION})`);
  aBoard.GetPageSettings().Format(formatter);
  aBoard.GetTitleBlock().Format(formatter);
  formatter.Print(')');

  return formatter.Finish();
}

/** Take FormatRenderSyncSheet's page and title block into \a aBoard, in place. */
export function ApplyRenderSyncSheet(aBoard: BOARD, aText: string): void {
  const scratch = new PCB_IO_KICAD_SEXPR_PARSER(aText, 'render sync').Parse() as BOARD;

  aBoard.SetPageSettings(scratch.GetPageSettings());
  aBoard.SetTitleBlock(scratch.GetTitleBlock());
}

/**
 * Install a RENDER_SYNC_MESSAGE on \a aBoard (the worker's copy) and its \a aView: each item
 * replaces the one with its uuid, or is added; each removed uuid leaves.
 */
export function ApplyRenderSync(
  aBoard: BOARD,
  aView: VIEW | null,
  aMessage: RENDER_SYNC_MESSAGE,
): void {
  const byId = new Map(aBoard.GetItemSet().map((i) => [i.m_Uuid, i]));

  const drop = (aId: string): void => {
    const old = byId.get(aId);

    if (!old) return;

    aView?.Remove(old);
    aBoard.Remove(old);
    byId.delete(aId);
  };

  for (const id of aMessage.remove) drop(id);

  if (!aMessage.upsert) return;

  const scratch = new PCB_IO_KICAD_SEXPR_PARSER(aMessage.upsert, 'render sync').Parse() as BOARD;

  for (const item of [...scratch.GetItemSet()]) {
    if (item.Type() === KICAD_T.PCB_NETINFO_T) continue;

    // The parser made its own nets; this board's of the same names take their place.
    const netNames = connectedItems(item).map((c) => c.GetNetname());

    scratch.Remove(item);
    drop(item.m_Uuid);

    connectedItems(item).forEach((c, i) => {
      const name = netNames[i]!;

      if (!name) {
        c.SetNetCode(0);
        return;
      }

      let net = aBoard.FindNet(name);

      if (!net) {
        net = new NETINFO_ITEM(aBoard, name, aBoard.GetNetInfo().GetNetCount());
        aBoard.Add(net);
      }

      c.SetNet(net);
    });

    aBoard.Add(item);

    if (item.Type() === KICAD_T.PCB_ZONE_T) (item as unknown as ZONE).CacheTriangulation();

    aView?.Add(item);
  }
}
