// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_TUNING_PATTERN_PROPERTIES's window (dialog_tuning_pattern_properties.cpp) on its base: the
 * legend the mode picks, the skew labels, and the amplitude / spacing UNIT_BINDERs reading what is
 * typed in the frame's units (the old form read a typed 0.5 as half an internal unit).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pcbMmToIU } from '@ziroeda/common/eda_units.js';
import {
  DialogTuningPatternProperties,
  type TuningPatternMode,
} from '@ziroeda/pcbnew/dialogs/dialog_tuning_pattern_properties.js';
import {
  type MeanderSettings,
  defaultMeanderSettings,
} from '@ziroeda/pcbnew/router/pns_meander.js';
import { PnsRouterMode } from '@ziroeda/pcbnew/router/pns_router.js';

afterEach(cleanup);

function show(aMode: TuningPatternMode = PnsRouterMode.PNS_MODE_TUNE_SINGLE) {
  const onOk = vi.fn<(s: MeanderSettings) => void>();
  const { container } = render(
    <DialogTuningPatternProperties
      units="mm"
      settings={defaultMeanderSettings()}
      mode={aMode}
      onOk={onOk}
      onClose={() => {}}
    />,
  );
  return { onOk, container };
}

const field = (aName: string) => screen.getByRole('textbox', { name: aName }) as HTMLInputElement;

describe('DIALOG_TUNING_PATTERN_PROPERTIES window', () => {
  it('shows the legend for the mode', () => {
    const { container } = show();
    expect(container.ownerDocument.body.innerHTML).toContain('tune_single_track_length_legend');
    cleanup();
    const skew = show(PnsRouterMode.PNS_MODE_TUNE_DIFF_PAIR_SKEW);
    expect(skew.container.ownerDocument.body.innerHTML).toContain('tune_diff_pair_skew_legend');
    expect(screen.getByText('Target Skew:')).toBeTruthy();
  });

  it('reads a typed spacing and amplitude in the frame’s units', () => {
    const { onOk } = show();
    fireEvent.change(field('Spacing'), { target: { value: '0.5' } });
    fireEvent.change(field('Maximum amplitude'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    const s = onOk.mock.calls[0]![0];
    expect(s.spacing).toBe(pcbMmToIU(0.5));
    expect(s.maxAmplitude).toBe(pcbMmToIU(2));
  });
});
