// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * qa/tests/eeschema/test_backannotate_unit_swap.cpp, case for case: PlanBackannotateUnitSwaps.
 */
import {
  type BACKANNOTATE_UNIT_SWAP_CANDIDATE,
  type BACKANNOTATE_UNIT_SWAP_PLAN,
  PlanBackannotateUnitSwaps,
} from '@ziroeda/eeschema/tools/backannotate.js';
import { describe, expect, it } from 'vitest';

function make_candidate(
  aRef: string,
  aUnit: number,
  aPins: string[],
  aNets: [string, string][],
): BACKANNOTATE_UNIT_SWAP_CANDIDATE {
  return {
    m_ref: aRef,
    m_currentUnit: aUnit,
    m_unitPinNumbers: [...aPins],
    m_schNetsByPin: new Map(aNets),
  };
}

const make_pin_map = (aNets: [string, string][]): Map<string, string> => new Map(aNets);

function check_plan(
  aPlan: BACKANNOTATE_UNIT_SWAP_PLAN,
  aMappingOk: boolean,
  aIdentity: boolean,
  aExpectedSwappedCandidateIndices: number[],
): void {
  expect(aPlan.m_mappingOk).toBe(aMappingOk);
  expect(aPlan.m_identity).toBe(aIdentity);
  expect([...aPlan.m_swappedCandidateIndices].sort()).toEqual(
    [...aExpectedSwappedCandidateIndices].sort(),
  );
}

function check_final_units(
  aCandidates: BACKANNOTATE_UNIT_SWAP_CANDIDATE[],
  aPlan: BACKANNOTATE_UNIT_SWAP_PLAN,
  aExpectedUnits: number[],
): void {
  const finalUnits = aCandidates.map((c) => c.m_currentUnit);

  for (const step of aPlan.m_steps) {
    const t = finalUnits[step.m_firstIndex]!;
    finalUnits[step.m_firstIndex] = finalUnits[step.m_secondIndex]!;
    finalUnits[step.m_secondIndex] = t;
  }

  expect(finalUnits).toEqual(aExpectedUnits);
}

describe('BackannotateUnitSwapPlanner', () => {
  it('DetectsIdentityMapping', () => {
    const candidates = [
      make_candidate(
        'U1A',
        1,
        ['1', '2', '3'],
        [
          ['1', 'Aout'],
          ['2', 'Net-(U1A--)'],
          ['3', 'A+'],
        ],
      ),
      make_candidate(
        'U1B',
        2,
        ['5', '6', '7'],
        [
          ['5', 'B+'],
          ['6', 'B-'],
          ['7', 'Bout'],
        ],
      ),
    ];
    const plan = PlanBackannotateUnitSwaps(
      candidates,
      make_pin_map([
        ['1', 'Aout'],
        ['2', 'Net-(U1A--)'],
        ['3', 'A+'],
        ['5', 'B+'],
        ['6', 'B-'],
        ['7', 'Bout'],
      ]),
    );
    check_plan(plan, true, true, []);
    check_final_units(candidates, plan, [1, 2]);
  });

  it('DetectsSimpleUnitSwap', () => {
    const candidates = [
      make_candidate(
        'U1A',
        1,
        ['1', '2', '3'],
        [
          ['1', 'A1'],
          ['2', 'A2'],
          ['3', 'A3'],
        ],
      ),
      make_candidate(
        'U1B',
        2,
        ['4', '5', '6'],
        [
          ['4', 'B1'],
          ['5', 'B2'],
          ['6', 'B3'],
        ],
      ),
    ];
    const plan = PlanBackannotateUnitSwaps(
      candidates,
      make_pin_map([
        ['1', 'B1'],
        ['2', 'B2'],
        ['3', 'B3'],
        ['4', 'A1'],
        ['5', 'A2'],
        ['6', 'A3'],
      ]),
    );
    check_plan(plan, true, false, [0, 1]);
    check_final_units(candidates, plan, [2, 1]);
  });

  it('DetectsBAS16TWGateRotation', () => {
    const candidates = [
      make_candidate(
        'D1',
        1,
        ['6', '1'],
        [
          ['6', 'K1'],
          ['1', 'A1'],
        ],
      ),
      make_candidate(
        'D1',
        2,
        ['5', '2'],
        [
          ['5', 'K2'],
          ['2', 'A2'],
        ],
      ),
      make_candidate(
        'D1',
        3,
        ['4', '3'],
        [
          ['4', 'K3'],
          ['3', 'A3'],
        ],
      ),
    ];
    const plan = PlanBackannotateUnitSwaps(
      candidates,
      make_pin_map([
        ['6', 'K2'],
        ['1', 'A2'],
        ['5', 'K3'],
        ['2', 'A3'],
        ['4', 'K1'],
        ['3', 'A1'],
      ]),
    );
    check_plan(plan, true, false, [0, 1, 2]);
    check_final_units(candidates, plan, [3, 1, 2]);
  });

  it('DetectsRN1GateRotationWithSharedCommonPin', () => {
    const candidates = [
      make_candidate(
        'RN1',
        1,
        ['1', '2'],
        [
          ['1', 'R1'],
          ['2', 'R1.2'],
        ],
      ),
      make_candidate(
        'RN1',
        2,
        ['1', '3'],
        [
          ['1', 'R1'],
          ['3', 'R2.2'],
        ],
      ),
      make_candidate(
        'RN1',
        3,
        ['1', '4'],
        [
          ['1', 'R1'],
          ['4', 'R3.2'],
        ],
      ),
    ];
    const plan = PlanBackannotateUnitSwaps(
      candidates,
      make_pin_map([
        ['1', 'R1'],
        ['2', 'R2.2'],
        ['3', 'R3.2'],
        ['4', 'R1.2'],
      ]),
    );
    check_plan(plan, true, false, [0, 1, 2]);
    check_final_units(candidates, plan, [3, 1, 2]);
  });

  it('DoesNotTreatHybridBAS16TWGateAndPinSwapAsPureUnitRotation', () => {
    const candidates = [
      make_candidate(
        'D1',
        1,
        ['6', '1'],
        [
          ['6', 'K1'],
          ['1', 'A1'],
        ],
      ),
      make_candidate(
        'D1',
        2,
        ['5', '2'],
        [
          ['5', 'K2'],
          ['2', 'A2'],
        ],
      ),
      make_candidate(
        'D1',
        3,
        ['4', '3'],
        [
          ['4', 'K3'],
          ['3', 'A3'],
        ],
      ),
    ];
    const plan = PlanBackannotateUnitSwaps(
      candidates,
      make_pin_map([
        ['1', 'A1'],
        ['2', 'K3'],
        ['3', 'A2'],
        ['4', 'K2'],
        ['5', 'A3'],
        ['6', 'K1'],
      ]),
    );
    expect(plan.m_mappingOk).toBe(false);
    expect(plan.m_steps).toEqual([]);
    expect(plan.m_swappedCandidateIndices.size).toBe(0);
  });
});
