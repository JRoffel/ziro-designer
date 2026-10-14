// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * What each control on the selection filter, Board Finish and Physical Stackup writes, and the
 * stackup's labels: a sublayer's "(i/n)", thicknesses in the frame's units, Remove's enable.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type JSX, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type BoardFinish,
  PanelPcbBoardFinish,
} from '@ziroeda/pcbnew/board_stackup_manager/panel_board_finish.js';
import {
  PanelPcbStackup,
  type PhysicalStackup,
} from '@ziroeda/pcbnew/board_stackup_manager/panel_board_stackup.js';
import {
  DEFAULT_SELECTION_FILTER_OPTIONS,
  SelectionFilterPanel,
} from '@ziroeda/pcbnew/widgets/panel_selection_filter.js';
import { freshBoardSetup } from '../../designer/board_setup_test_utils.js';

afterEach(cleanup);

const pick = (aCombo: HTMLElement, aLabel: string): void => {
  fireEvent.click(aCombo.closest('.ze-combo') as HTMLElement);
  const option = [...document.querySelectorAll('[role="option"]')].find(
    (o) => o.textContent === aLabel,
  );
  fireEvent.mouseDown(option as HTMLElement);
};

describe('PANEL_SELECTION_FILTER', () => {
  it('All items turns every category off, and Vias is vias alone', () => {
    let last = new Set(DEFAULT_SELECTION_FILTER_OPTIONS);
    render(<SelectionFilterPanel filter={last} onChange={(n) => (last = n)} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'All items' }));
    expect(last.size).toBe(0);
    cleanup();
    last = new Set(DEFAULT_SELECTION_FILTER_OPTIONS);
    render(<SelectionFilterPanel filter={last} onChange={(n) => (last = n)} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Vias' }));
    expect(last.has('vias')).toBe(false);
    expect(last.has('tracks')).toBe(true);
  });
});

describe('PANEL_SETUP_BOARD_FINISH', () => {
  it('Edge card connectors writes its choice', () => {
    let last: BoardFinish = {
      platedBoardEdge: false,
      copperFinish: 'None',
      edgeCardConnectors: 'None',
    };
    render(<PanelPcbBoardFinish value={last} onChange={(v) => (last = v)} />);
    pick(screen.getByLabelText('Edge card connectors'), 'Yes, bevelled');
    expect(last.edgeCardConnectors).toBe('Yes, bevelled');
  });
});

describe('PANEL_SETUP_BOARD_STACKUP', () => {
  function Harness({
    initial,
    units = 'mm',
  }: {
    initial: PhysicalStackup;
    units?: 'mm' | 'mils';
  }): JSX.Element {
    const [v, setV] = useState(initial);
    return <PanelPcbStackup value={v} onChange={setV} units={units} />;
  }
  const withSublayer = (): PhysicalStackup => {
    const v = freshBoardSetup().physicalStackup;
    const i = v.layers.findIndex((l) => l.type === 'Core' || l.type === 'Prepreg');
    v.layers[i] = { ...v.layers[i]!, sublayers: [{ material: 'FR4', thicknessMM: 0.1 }] };
    return v;
  };

  it('names a dielectric of several sublayers "(i/n)"', () => {
    render(<Harness initial={withSublayer()} />);
    expect(screen.getByText('Dielectric 1  (1/2)', { normalizer: (t) => t })).toBeTruthy();
    expect(screen.getByText('Dielectric 1  (2/2)', { normalizer: (t) => t })).toBeTruthy();
  });

  it('shows thicknesses in the frame units', () => {
    render(<Harness initial={freshBoardSetup().physicalStackup} units="mils" />);
    expect(
      (screen.getByRole('textbox', { name: 'F.Cu thickness' }) as HTMLInputElement).value,
    ).toMatch(/mils$/);
  });

  it('Remove Dielectric Layer is enabled only while a dielectric has sublayers', () => {
    render(<Harness initial={freshBoardSetup().physicalStackup} />);
    expect(
      (screen.getByRole('button', { name: 'Remove Dielectric Layer...' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    cleanup();
    render(<Harness initial={withSublayer()} />);
    expect(
      (screen.getByRole('button', { name: 'Remove Dielectric Layer...' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
