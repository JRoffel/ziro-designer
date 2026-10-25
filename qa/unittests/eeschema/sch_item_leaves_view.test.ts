// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `~VIEW_ITEM()` (view_item.cpp:32) runs `VIEW::OnDestroy( this )`, so an item deleted while a
 * view still holds it is gone from the canvas too. ERC's Delete All Markers relies on exactly
 * that: `SCH_SCREENS::DeleteAllMarkers` deletes the markers from their screens and nothing else,
 * and ours left every one of them drawn.
 */
import { describe, expect, it } from 'vitest';
import { MARKER_T } from '@ziroeda/common/marker_base.js';
import { VIEW } from '@ziroeda/common/view/view.js';
import type { VIEW_ITEM } from '@ziroeda/common/view/view_item.js';
import { ERC_ITEM } from '@ziroeda/eeschema/erc/erc_item.js';
import { ERCE_T } from '@ziroeda/eeschema/erc/erc_settings.js';
import { SCH_MARKER } from '@ziroeda/eeschema/sch_marker.js';
import { SCH_SCREEN, SCH_SCREENS } from '@ziroeda/eeschema/sch_screen.js';
import { SCHEMATIC } from '@ziroeda/eeschema/schematic.js';

/** Whether \a aView still holds \a aItem: its own list of everything Add() put in it. */
function inView(aItem: VIEW_ITEM, aView: VIEW): boolean {
  return (aView as unknown as { m_allItems: (VIEW_ITEM | null)[] }).m_allItems.includes(aItem);
}

function markerOn(aScreen: SCH_SCREEN, aView: VIEW): SCH_MARKER {
  const marker = new SCH_MARKER(ERC_ITEM.Create(ERCE_T.ERCE_PIN_NOT_CONNECTED), {
    x: 1000,
    y: 2000,
  });
  aScreen.Append(marker);
  aView.Add(marker);
  return marker;
}

/** A one-sheet schematic: a marker has no layers - nothing to draw - without one. */
function oneSheet(): { schematic: SCHEMATIC; screen: SCH_SCREEN } {
  const schematic = new SCHEMATIC(null);
  schematic.CreateDefaultScreens();
  return { schematic, screen: schematic.Hierarchy()[0]!.LastScreen()! };
}

describe('a deleted SCH_ITEM leaves the view that drew it', () => {
  it('SCH_SCREEN::DeleteItem takes a marker off the canvas', () => {
    const { screen } = oneSheet();
    const view = new VIEW();
    const marker = markerOn(screen, view);
    expect(inView(marker, view)).toBe(true);

    screen.DeleteItem(marker);

    expect(inView(marker, view)).toBe(false);
  });

  it("SCH_SCREENS::DeleteAllMarkers - the ERC dialog's Delete All Markers - clears them all", () => {
    const { schematic, screen } = oneSheet();
    const view = new VIEW();
    const a = markerOn(screen, view);
    const b = markerOn(screen, view);
    expect([inView(a, view), inView(b, view)]).toEqual([true, true]);

    // DIALOG_ERC::deleteAllMarkers (dialog_erc.cpp:1142-1143), word for word.
    new SCH_SCREENS(schematic.Root()).DeleteAllMarkers(MARKER_T.MARKER_ERC, true);

    expect([inView(a, view), inView(b, view)]).toEqual([false, false]);
  });
});
