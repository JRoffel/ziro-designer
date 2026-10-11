// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `cvpcb/cvpcb.cpp`: the cvpcb KIFACE - here only `IfaceOrAddress`, and the one address it
 * serves outside CvPcb: `KIFACE_TEST_FOOTPRINT_LINK`, the footprint-link test the schematic
 * editor's ERC calls (`ERC_TESTER::TestFootprintLinkIssues`).
 *
 * `PROJECT_PCB::FootprintLibAdapter( aProject )` is the store the host builds and hands in
 * (`pcbnew/project_pcb.ts` says why), so IFACE is constructed with it, as the CvPcb frames
 * have theirs handed in. `CreateKiWindow` / `OnKifaceStart` stay with the program, which mounts
 * the frames itself.
 */
import type { KIFACE } from '@ziroeda/common/kiway.js';
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import type { PROJECT } from '@ziroeda/common/project.js';
import { KIFACE_ADDR_ID } from '@ziroeda/include/kiface_ids.js';
import type { FOOTPRINT_LIBRARY_ADAPTER } from '@ziroeda/pcbnew/footprint_library_adapter.js';

/** `testFootprintLink( aFootprint, aProject )` (cvpcb.cpp:40), against the project's adapter. */
export function testFootprintLink(aFootprint: string, aAdapter: FOOTPRINT_LIBRARY_ADAPTER): number {
  const fpID = new LIB_ID();

  fpID.Parse(aFootprint);

  const libName = fpID.GetLibNickname();
  const fpName = fpID.GetLibItemName();

  // Libraries may not be present at this point if nothing has triggered a load yet.
  if (!aAdapter.IsLibraryLoaded(libName)) aAdapter.LoadOne(libName);

  if (!aAdapter.HasLibrary(libName, false))
    return KIFACE_ADDR_ID.KIFACE_TEST_FOOTPRINT_LINK_NO_LIBRARY;
  else if (!aAdapter.HasLibrary(libName, true))
    return KIFACE_ADDR_ID.KIFACE_TEST_FOOTPRINT_LINK_LIBRARY_NOT_ENABLED;
  else if (!aAdapter.FootprintExists(libName, fpName))
    return KIFACE_ADDR_ID.KIFACE_TEST_FOOTPRINT_LINK_NO_FOOTPRINT;

  return 0;
}

/** The cvpcb `IFACE` (cvpcb.cpp:67). */
export class IFACE implements KIFACE {
  constructor(private readonly m_footprintLibAdapter: FOOTPRINT_LIBRARY_ADAPTER) {}

  /** `IfaceOrAddress( aDataId )` (cvpcb.cpp:100): null for an id this face does not serve. */
  IfaceOrAddress(aDataId: KIFACE_ADDR_ID): unknown {
    switch (aDataId) {
      case KIFACE_ADDR_ID.KIFACE_TEST_FOOTPRINT_LINK:
        // int (*)( const wxString& aFootprint, PROJECT* aProject )
        return (aFootprint: string, _aProject: PROJECT | null): number =>
          testFootprintLink(aFootprint, this.m_footprintLibAdapter);

      default:
        return null;
    }
  }
}
