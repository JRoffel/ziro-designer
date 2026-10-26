// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `NET_SETTINGS::SetNetclassPatternAssignment` on a plain assignment list, for the PCB app's
 * record board. The schematic's Assign Netclass is `SCH_EDITOR_CONTROL::AssignNetclass` on the
 * live connection graph (tools/sch_editor_control.ts).
 */

import { parseBusVector, parseBusGroup } from '../connectivity/bus.js';

/** One `(pattern, netclass)` row of NET_SETTINGS' assignment list. */
export interface NetclassAssignment {
  pattern: string;
  netClass: string;
}

/**
 * `NET_SETTINGS::ForEachBusMember`: the patterns a bus pattern stands for.
 *
 * A vector bus expands to its members; a group expands to its members and each
 * of those is expanded again, since a group member may itself be a vector.
 * Anything else yields itself.
 *
 * The expansion exists because the matchers read `[` and `{` as regex, not as
 * bus notation — an unexpanded `D[0..7]` would be matched as a character class
 * and would never hit `D0`.
 */
export function busMemberPatterns(pattern: string): string[] {
  const vector = parseBusVector(pattern);
  if (vector) return [...vector.members];
  const group = parseBusGroup(pattern);
  if (group) return group.members.flatMap((m) => busMemberPatterns(m));
  return [pattern];
}

/**
 * `NET_SETTINGS::SetNetclassPatternAssignment` — add one assignment, bus
 * patterns expanded.
 *
 * Note what upstream does *not* do: it never replaces an existing assignment
 * for the same pattern. `addSinglePatternAssignment` skips only an **exact**
 * duplicate — same pattern *and* same netclass — and otherwise appends, so one
 * pattern may legitimately carry several assignments and later de-duplication
 * decides which wins. Replacing would be the intuitive guess and would silently
 * drop a user's earlier rule.
 */
export function addNetclassAssignment(
  assignments: readonly NetclassAssignment[],
  pattern: string,
  netClass: string,
): NetclassAssignment[] {
  const out = [...assignments];
  for (const member of busMemberPatterns(pattern)) {
    if (out.some((a) => a.pattern === member && a.netClass === netClass)) continue;
    out.push({ pattern: member, netClass });
  }
  return out;
}
