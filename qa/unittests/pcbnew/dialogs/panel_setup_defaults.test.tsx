// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * PANEL_SETUP_DEFAULTS (pcbnew/dialogs/panel_setup_defaults.cpp): text & graphics, dimensions and
 * zones, in that order, in one scrolled window; every length in the frame's units.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { pcbMmToIU } from '@ziroeda/common/eda_units.js';
import type { DimensionDefaults } from '@ziroeda/pcbnew/dialogs/panel_setup_dimensions.js';
import { PanelSetupDefaults } from '@ziroeda/pcbnew/dialogs/panel_setup_defaults.js';
import { freshBoardSetup } from '../../designer/board_setup_test_utils.js';

afterEach(cleanup);

function renderPage(aUnits: 'mm' | 'mils', aOnDims: (d: DimensionDefaults) => void = () => {}) {
  const v = freshBoardSetup();
  v.dimensions.arrow_length = pcbMmToIU(1.27);
  render(
    <PanelSetupDefaults
      textGraphics={v.textGraphics}
      onTextGraphics={() => {}}
      dimensions={v.dimensions}
      onDimensions={(fn) => {
        const d = { ...v.dimensions };
        fn(d);
        aOnDims(d);
      }}
      zones={v.zones}
      onZones={() => {}}
      units={aUnits}
    />,
  );
}

describe('PANEL_SETUP_DEFAULTS', () => {
  it('stacks the three panels in KiCad order inside the scrolled window', () => {
    renderPage('mm');
    const sw = document.querySelector('.ze-scrolledwindow') as HTMLElement;
    const text = sw.textContent ?? '';
    const at = (s: string) => text.indexOf(s);
    expect(at('Default Properties for New Graphics and Text')).toBeGreaterThanOrEqual(0);
    expect(at('Default Properties for New Graphics and Text')).toBeLessThan(
      at('Default Properties for New Dimension Objects'),
    );
    expect(at('Default Properties for New Dimension Objects')).toBeLessThan(
      at('Default Properties for New Zones'),
    );
  });

  it('the dimension lengths are in the frame units', () => {
    renderPage('mils');
    expect((screen.getByRole('textbox', { name: 'Arrow length' }) as HTMLInputElement).value).toBe(
      '50',
    );
  });

  it('the text & graphics grid shows its cells in the frame units', () => {
    // m_grid->SetUnitsProvider( m_Frame ).
    renderPage('mils');
    const grid = screen.getByRole('table', {
      name: 'Default properties for new graphics and text',
    }) as HTMLElement;
    const first = grid.querySelector('tbody td[data-col="0"]') as HTMLElement;
    expect(first.textContent).toMatch(/mils$/);
  });

  it('a typed length is stored in IU', () => {
    let d: DimensionDefaults | null = null;
    renderPage('mm', (x) => (d = x));
    fireEvent.change(screen.getByRole('textbox', { name: 'Extension line offset' }), {
      target: { value: '0.4' },
    });
    expect(d!.extension_offset).toBe(pcbMmToIU(0.4));
  });
});
