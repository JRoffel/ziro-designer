// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `include/kiface_ids.h`: IDs of objects that may be returned by KIFACE::IfaceOrAddress.
 */
export enum KIFACE_ADDR_ID {
  KIFACE_ID_INVALID,

  KIFACE_FOOTPRINT_LIBRARY_ADAPTER,

  /// Function pointer type: wxString (*)(const wxString& aFilterJson)
  /// Input JSON: {"pin_count": N, "filters": ["pattern1", ...], "zero_filters": bool, "max_results": N}
  /// Output JSON: ["lib:footprint1", "lib:footprint2", ...]
  KIFACE_FILTER_FOOTPRINTS,

  KIFACE_LOAD_SCHEMATIC,
  KIFACE_NETLIST_SCHEMATIC,
  KIFACE_SCRIPTING_LEGACY,
  KIFACE_SCRIPTING,

  KIFACE_TEST_FOOTPRINT_LINK,
  KIFACE_TEST_FOOTPRINT_LINK_NO_LIBRARY,
  KIFACE_TEST_FOOTPRINT_LINK_LIBRARY_NOT_ENABLED,
  KIFACE_TEST_FOOTPRINT_LINK_NO_FOOTPRINT,
}
