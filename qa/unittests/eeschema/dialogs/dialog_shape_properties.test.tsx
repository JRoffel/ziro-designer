// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_SHAPE_PROPERTIES over its _base, schematic editor: the title from the shape, the
 * rule-area block only for a rule area, the border controls following the Border box, the fill
 * colour following the fill choice (onFillChoice), and the schematic page of m_fillBook shown.
 */
import { SHAPE_T } from '@ziroeda/common/eda_shape.js';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import {
  DIALOG_SHAPE_PROPERTIES,
  DialogShapeProperties,
} from '@ziroeda/eeschema/dialogs/dialog_shape_properties.js';
import { SCH_RULE_AREA } from '@ziroeda/eeschema/sch_rule_area.js';
import { SCH_SHAPE } from '@ziroeda/eeschema/sch_shape.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schFrame, schToolHarness } from '../support/sch_tool_harness.js';

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => {
  cleanup();
  SetPgm(null);
});

function open(aShape: SCH_SHAPE, aTitle?: string) {
  const h = schToolHarness(schFrame({}));
  h.frame.AddToScreen(aShape, h.frame.GetScreen());
  const dlg = new DIALOG_SHAPE_PROPERTIES(h.frame, aShape);
  return render(
    <DialogShapeProperties
      dlg={dlg}
      initial={dlg.TransferDataToWindow()}
      title={aTitle}
      units="mm"
      onOk={() => {}}
      onCancel={() => {}}
    />,
  );
}

const rect = () => {
  const s = new SCH_SHAPE(SHAPE_T.RECTANGLE);
  s.SetStart({ x: 0, y: 0 });
  s.SetEnd({ x: 12700, y: 12700 });
  return s;
};

describe('DIALOG_SHAPE_PROPERTIES_BASE', () => {
  it('a rectangle: its title, no rule-area block, the schematic fill page', () => {
    open(rect());
    expect(screen.getByText('Rectangle Properties')).toBeTruthy();
    expect(screen.queryByLabelText('Do not populate')).toBeNull();
    expect(screen.getByLabelText('Fill')).toBeTruthy();
  });

  it('a rule area: the caller titles it, and its flags show', () => {
    const area = new SCH_RULE_AREA();
    area.AddPoint({ x: 0, y: 0 });
    area.AddPoint({ x: 12700, y: 0 });
    area.AddPoint({ x: 0, y: 12700 });
    open(area, 'Rule Area Properties');
    expect(screen.getByText('Rule Area Properties')).toBeTruthy();
    expect(screen.getByLabelText('Do not populate')).toBeTruthy();
  });

  it('unticking Border greys the width', () => {
    const s = rect();
    const stroke = s.GetStroke();
    stroke.SetWidth(2540);
    s.SetStroke(stroke);
    open(s);
    const width = screen.getByLabelText('Border width') as HTMLInputElement;
    expect([width.disabled, width.value]).toEqual([false, '0.254']);
    fireEvent.click(screen.getByLabelText('Border'));
    expect(width.disabled).toBe(true);
  });
});
