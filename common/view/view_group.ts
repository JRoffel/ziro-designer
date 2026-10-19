// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `KIGFX::VIEW_GROUP` (include/view/view_group.h, common/view/view_group.cpp):
 * a set of VIEW_ITEMs drawn as one item on one layer — the selection, a
 * preview. `ViewDraw` is the painter's walk over the group and lands with
 * `KIGFX::VIEW` (issue 636, stage 5).
 */
import { BOX2I } from '@ziroeda/kimath/src/math/box2.js';
import { GAL_SCOPED_ATTRS, GAL_SCOPED_ATTRS_FLAGS } from '../gal/graphics_abstraction_layer.js';
import {
  IsClearanceLayer,
  IsPadCopperLayer,
  IsPointsLayer,
  IsViaCopperLayer,
  IsZoneFillLayer,
  LAYER_CLEARANCE_START,
  LAYER_ID_COUNT,
  LAYER_PAD_COPPER_START,
  LAYER_PAD_HOLEWALLS,
  LAYER_PAD_PLATEDHOLES,
  LAYER_POINT_START,
  LAYER_SELECT_OVERLAY,
  LAYER_VIA_COPPER_START,
  LAYER_ZONE_START,
} from '../layer_id.js';
import type { VIEW } from './view.js';
import { VIEW_ITEM } from './view_item.js';

export class VIEW_GROUP extends VIEW_ITEM {
  protected m_layer: number;
  protected m_groupItems: VIEW_ITEM[] = []; // No ownership.
  /// Not KiCad's: the items whose drawing this group keeps in the VIEW (see ViewDraw).
  private m_keptItems = new Set<VIEW_ITEM>();

  constructor(_aView: VIEW | null = null) {
    super();
    this.m_layer = LAYER_SELECT_OVERLAY;
  }

  GetClass(): string {
    return 'VIEW_GROUP';
  }

  /**
   * Return the number of stored items.
   */
  GetSize(): number {
    return this.m_groupItems.length;
  }

  /**
   * Add an item to the group.
   */
  Add(aItem: VIEW_ITEM | null): void {
    if (!aItem) return;

    this.m_groupItems.push(aItem);
  }

  /**
   * Remove an item from the group.
   */
  Remove(aItem: VIEW_ITEM): void {
    this.m_groupItems = this.m_groupItems.filter((i) => i !== aItem);
  }

  /**
   * Remove all the stored items from the group.
   */
  Clear(): void {
    this.m_groupItems = [];
  }

  GetItem(aIdx: number): VIEW_ITEM | null {
    return this.m_groupItems[aIdx] ?? null;
  }

  /**
   * Return the bounding box for all stored items covering all its layers.
   */
  ViewBBox(): BOX2I {
    let bb = new BOX2I();

    if (!this.m_groupItems.length) {
      bb.SetMaximum();
    } else {
      bb = this.m_groupItems[0]!.ViewBBox();

      for (const item of this.m_groupItems) bb.Merge(item.ViewBBox());
    }

    return bb;
  }

  /**
   * Draw all the stored items in the group on the given layer.
   */
  override ViewDraw(aLayer: number, aView: VIEW): void {
    const gal = aView.GetGAL();
    const painter = aView.GetPainter();
    const isSelection = this.m_layer === LAYER_SELECT_OVERLAY;

    const drawList = this.updateDrawList();

    // Not KiCad's. The selection is on TARGET_OVERLAY, which is redrawn from scratch every
    // frame, so upstream re-tessellates every selected item on every zoom and pan step - with
    // a whole board selected, millions of vertices a frame. What the painter draws for an item
    // on a layer the VIEW caches does not depend on the view (that is why the VIEW can cache
    // it), so the drawing is kept per item and layer, as a GAL overlay group, and dropped
    // whenever the VIEW re-draws that item's cached layers (VIEW::invalidateItem) or recolours
    // them. The frame that reaches the screen is the same.
    const keep = isSelection && gal.SupportsOverlayGroups();

    if (keep) {
      const live = new Set(drawList);

      for (const item of this.m_keptItems) {
        if (!live.has(item)) {
          aView.DropOverlayGroups(item);
          this.m_keptItems.delete(item);
        }
      }
    }

    // A std::map: iterated by key, so the layers come out in id order below.
    const layer_item_map = new Map<number, VIEW_ITEM[]>();

    // Build a list of layers used by the items in the group
    for (const item of drawList) {
      if (aView.IsHiddenOnOverlay(item)) continue;

      const layers = item.ViewGetLayers();

      for (const layer of layers) {
        // wxCHECK2_MSG( layer <= LAYER_ID_COUNT, continue, "Invalid item layer" )
        if (!(layer <= LAYER_ID_COUNT)) continue;

        let list = layer_item_map.get(layer);

        if (!list) {
          list = [];
          layer_item_map.set(layer, list);
        }

        list.push(item);
      }
    }

    if (layer_item_map.size === 0) return;

    const layers: number[] = [...layer_item_map.keys()].sort((a, b) => a - b);

    aView.SortLayers(layers);

    // Now draw the layers in sorted order
    GAL_SCOPED_ATTRS(gal, GAL_SCOPED_ATTRS_FLAGS.LAYER_DEPTH, () => {
      for (const layer of layers) {
        let draw = aView.IsLayerVisible(layer);

        if (IsZoneFillLayer(layer)) {
          // The visibility of solid areas must follow the visiblility of the zone layer
          const zone_main_layer = layer - LAYER_ZONE_START;
          draw = aView.IsLayerVisible(zone_main_layer);
        } else if (IsPadCopperLayer(layer)) {
          draw = aView.IsLayerVisible(layer - LAYER_PAD_COPPER_START);
        } else if (IsViaCopperLayer(layer)) {
          draw = aView.IsLayerVisible(layer - LAYER_VIA_COPPER_START);
        } else if (IsClearanceLayer(layer)) {
          draw = aView.IsLayerVisible(layer - LAYER_CLEARANCE_START);
        } else if (IsPointsLayer(layer)) {
          draw = aView.IsLayerVisible(layer - LAYER_POINT_START);
        }

        if (isSelection) {
          switch (layer) {
            case LAYER_PAD_PLATEDHOLES:
            case LAYER_PAD_HOLEWALLS:
              draw = true;
              break;
            default:
              break;
          }
        }

        if (draw) {
          gal.AdvanceDepth();

          const keepLayer = keep && aView.IsCached(layer);

          for (const item of layer_item_map.get(layer)!) {
            // Ignore LOD scale for selected items, but don't ignore things explicitly
            // hidden.
            if (item.ViewGetLOD(layer, aView) === VIEW_ITEM.LOD_HIDE) continue;

            // Only an item the VIEW owns: its invalidation is what drops the kept drawing.
            if (keepLayer && item.viewPrivData()?.m_view === aView) {
              this.drawKept(item, layer, aView);
              continue;
            }

            if (!painter.Draw(item, layer)) item.ViewDraw(layer, aView); // Alternative drawing method
          }
        }
      }
    });
  }

  /**
   * Draw \a aItem on \a aLayer from its kept overlay group, or draw it into a new one. A
   * group drawn from another starting depth is redrawn: the painter may advance the depth
   * inside an item (the backdrill indicators), so its vertices cannot simply be moved.
   */
  private drawKept(aItem: VIEW_ITEM, aLayer: number, aView: VIEW): void {
    const gal = aView.GetGAL();
    const depthIn = gal.getLayerDepth();
    const kept = aView.GetOverlayGroup(aItem, aLayer);

    if (kept && kept.depthIn === depthIn && gal.DrawOverlayGroup(kept.group)) {
      if (kept.depthOut !== depthIn) gal.SetLayerDepth(kept.depthOut);

      return;
    }

    const group = gal.BeginOverlayGroup();

    if (!aView.GetPainter().Draw(aItem, aLayer)) aItem.ViewDraw(aLayer, aView); // Alternative drawing method

    gal.EndOverlayGroup();

    aView.SetOverlayGroup(aItem, aLayer, { group, depthIn, depthOut: gal.getLayerDepth() });
    this.m_keptItems.add(aItem);
    gal.DrawOverlayGroup(group);
  }

  /**
   * Return all the layers used by the stored items.
   */
  ViewGetLayers(): number[] {
    // Everything is displayed on a single layer
    return [this.m_layer];
  }

  /**
   * Set layer used to draw the group.
   */
  SetLayer(aLayer: number): void {
    this.m_layer = aLayer;
  }

  /**
   * Free all the items that were added to the group.
   */
  FreeItems(): void {
    // delete GetItem( i ): the garbage collector's
    this.Clear();
  }

  protected updateDrawList(): VIEW_ITEM[] {
    return this.m_groupItems;
  }
}
