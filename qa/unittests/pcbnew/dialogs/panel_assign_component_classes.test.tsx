// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * PANEL_ASSIGN_COMPONENT_CLASSES and its assignment / condition panels
 * (pcbnew/dialogs/panel_assign_component_classes.cpp) on their bases, and the rule they compile.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CONDITION_TYPE } from '@ziroeda/common/project/component_class_settings.js';
import { COMPONENT_CLASS_MANAGER } from '@ziroeda/pcbnew/component_classes/component_class_manager.js';
import {
  type ComponentClassesData,
  GenerateAssignmentData,
  PANEL_ASSIGN_COMPONENT_CLASSES,
  PanelPcbComponentClasses,
} from '@ziroeda/pcbnew/dialogs/panel_assign_component_classes.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';

afterEach(cleanup);

let last: ComponentClassesData = { assignPerSheet: false, assignments: [] };
function Harness({ start }: { start?: ComponentClassesData }): JSX.Element {
  const [v, setV] = useState<ComponentClassesData>(
    start ?? { assignPerSheet: false, assignments: [] },
  );
  last = v;
  return <PanelPcbComponentClasses value={v} onChange={setV} />;
}

const MENU = [
  'Add Reference Condition',
  'Add Footprint Condition',
  'Add Side Condition',
  'Add Rotation Condition',
  'Add Footprint Field Value Condition',
  'Add Sheet Condition',
  'Add Custom Expression Condition',
];

describe('PANEL_COMPONENT_CLASS_ASSIGNMENT', () => {
  it('offers the seven conditions in OnAddConditionClick order, each its own panel', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Custom Assignment' }));
    for (const item of MENU) {
      fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));
      const labels = [...document.querySelectorAll('.ze-context > *')].map((e) =>
        e.textContent?.trim(),
      );
      expect(labels).toEqual(MENU);
      fireEvent.click(screen.getByText(item));
    }
    expect(last.assignments[0]!.conditions.map((c) => c.type)).toEqual([
      CONDITION_TYPE.REFERENCE,
      CONDITION_TYPE.FOOTPRINT,
      CONDITION_TYPE.SIDE,
      CONDITION_TYPE.ROTATION,
      CONDITION_TYPE.FOOTPRINT_FIELD,
      CONDITION_TYPE.SHEET_NAME,
      CONDITION_TYPE.CUSTOM,
    ]);
    // The side and rotation panels start on "Any".
    expect(last.assignments[0]!.conditions[2]!.primary).toBe('Any');
    expect(last.assignments[0]!.conditions[3]!.primary).toBe('Any');
    for (const title of [
      'Reference:',
      'Footprint:',
      'Side:',
      'Rotation:',
      'Footprint field:',
      'Field value:',
      'Sheet name:',
      'Custom:',
    ])
      expect(screen.getByText(title)).toBeTruthy();
  });

  it('deletes the condition its own trash button belongs to', () => {
    render(
      <Harness
        start={{
          assignPerSheet: false,
          assignments: [
            {
              componentClass: 'HV',
              matchMode: 'all',
              conditions: [
                { type: CONDITION_TYPE.REFERENCE, primary: 'R*', secondary: '' },
                { type: CONDITION_TYPE.CUSTOM, primary: 'x', secondary: '' },
              ],
            },
          ],
        }}
      />,
    );
    // The first Delete row is the assignment's own; then the two conditions'. Delete the second.
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete row' })[2]!);
    expect(last.assignments[0]!.conditions.map((c) => c.type)).toEqual([CONDITION_TYPE.REFERENCE]);
  });

  it('Match any sets the operator', () => {
    render(
      <Harness
        start={{
          assignPerSheet: false,
          assignments: [{ componentClass: 'A', matchMode: 'all', conditions: [] }],
        }}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Match any' }));
    expect(last.assignments[0]!.matchMode).toBe('any');
  });

  it('greys Import references from selection when nothing is selected', () => {
    render(
      <Harness
        start={{
          assignPerSheet: false,
          assignments: [
            {
              componentClass: 'A',
              matchMode: 'all',
              conditions: [{ type: CONDITION_TYPE.REFERENCE, primary: '', secondary: '' }],
            },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import references' }));
    const item = screen.getByText('Import references from selection');
    expect(item.closest('[aria-disabled="true"], .disabled')).not.toBeNull();
  });
});

describe('CONDITION_DATA and the compiled rule', () => {
  it('trims and drops quotes, except in a custom expression', () => {
    const data = GenerateAssignmentData({
      componentClass: 'HV',
      matchMode: 'any',
      conditions: [
        { type: CONDITION_TYPE.FOOTPRINT_FIELD, primary: ' "Volt" ', secondary: " '5V' " },
        { type: CONDITION_TYPE.CUSTOM, primary: " A.Reference == 'R1' ", secondary: '' },
      ],
    });
    expect(data.GetConditions()).toEqual([
      [CONDITION_TYPE.FOOTPRINT_FIELD, 'Volt', '5V'],
      [CONDITION_TYPE.CUSTOM, "A.Reference == 'R1'", ''],
    ]);
  });

  it('a reference rule compiles and matches only its footprints', () => {
    const board = ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (5 "F.SilkS" user "F.Silkscreen"))
  (net 0 "")
  (footprint "R" (layer "F.Cu") (at 0 0) (uuid "00000000-0000-4000-8000-000000000001")
    (property "Reference" "R1" (at 0 0 0) (layer "F.SilkS") (uuid "00000000-0000-4000-8000-000000000011")
      (effects (font (size 1 1) (thickness 0.15)))))
  (footprint "C" (layer "F.Cu") (at 5 0) (uuid "00000000-0000-4000-8000-000000000002")
    (property "Reference" "C1" (at 0 0 0) (layer "F.SilkS") (uuid "00000000-0000-4000-8000-000000000012")
      (effects (font (size 1 1) (thickness 0.15))))))`);
    const rule = COMPONENT_CLASS_MANAGER.CompileAssignmentRule(
      GenerateAssignmentData({
        componentClass: 'HV',
        matchMode: 'all',
        conditions: [{ type: CONDITION_TYPE.REFERENCE, primary: 'R*', secondary: '' }],
      }),
    );
    expect(rule).not.toBeNull();
    expect(board.Footprints().map((fp) => rule!.Matches(fp))).toEqual([true, false]);
  });

  it('Validate names the assignment whose rule does not compile', () => {
    expect(
      PANEL_ASSIGN_COMPONENT_CLASSES.Validate({
        assignPerSheet: false,
        assignments: [
          {
            componentClass: 'OK',
            matchMode: 'all',
            conditions: [{ type: CONDITION_TYPE.REFERENCE, primary: 'R*', secondary: '' }],
          },
          {
            componentClass: 'Bad',
            matchMode: 'all',
            conditions: [{ type: CONDITION_TYPE.CUSTOM, primary: '(((', secondary: '' }],
          },
        ],
      }),
    ).toEqual({ index: 1, message: 'Error with conditions for component class assignment Bad' });
  });
});
