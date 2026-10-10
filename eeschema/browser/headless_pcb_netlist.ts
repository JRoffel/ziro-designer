// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * The board's netlist when no board frame is running - what KiCad gets by opening pcbnew off
 * screen in `BACK_ANNOTATE::FetchNetlistFromPCB` (`Kiway().Player( FRAME_PCB_EDITOR, true )` +
 * OpenProjectFiles) so that MAIL_PCB_GET_NETLIST always has a recipient. A frame here mounts
 * asynchronously, and the board reader is too big to load before it is wanted, so the window
 * reads the board when Update Schematic from PCB opens and registers the answer here; the
 * dialog's dry runs then read it synchronously, as upstream's mail answers. The other direction
 * is pcbnew/browser/headless_netlist.ts.
 *
 * Browser-only: no KiCad file. The KIWAY-mail half is `BACK_ANNOTATE::FetchNetlistFromPCB`.
 */

/**
 * `pcbnew/cross-probing.ts`'s `formatPcbNetlist` on the project's board, the MAIL_PCB_GET_NETLIST
 * answer an off-screen `PCB_EDIT_FRAME` would give; null when there is no board to read.
 */
let headlessPcbNetlistProvider: () => string | null = () => null;

/** The window's registration, made when it has read the board. */
export function setHeadlessPcbNetlistProvider(fn: () => string | null): void {
  headlessPcbNetlistProvider = fn;
}

export function headlessPcbNetlist(): string | null {
  return headlessPcbNetlistProvider();
}
