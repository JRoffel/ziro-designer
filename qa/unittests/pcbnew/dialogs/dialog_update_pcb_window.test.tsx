// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_UPDATE_PCB's window (dialog_update_pcb.cpp) on its base: a dry run on open, every option
 * re-running it, Update PCB running for real, relabelling the report for good and greying itself
 * until an option changes, and the design-block box following the groups box.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RPT_SEVERITY_ACTION } from '@ziroeda/common/reporter.js';
import {
  DialogUpdatePcb,
  type UpdatePcbOptions,
} from '@ziroeda/pcbnew/dialogs/dialog_update_pcb.js';

afterEach(cleanup);

function show(aDesignBlocks = false) {
  const runs: { options: UpdatePcbOptions; dryRun: boolean }[] = [];
  const onPerformUpdate = vi.fn((options: UpdatePcbOptions, dryRun: boolean) => {
    runs.push({ options, dryRun });
    return [
      {
        message: dryRun ? 'Add R1' : 'Added R1',
        severity: RPT_SEVERITY_ACTION,
        location: 'body' as const,
      },
    ];
  });
  const onClose = vi.fn();
  render(
    <DialogUpdatePcb
      onPerformUpdate={onPerformUpdate}
      onClose={onClose}
      designBlocksSupported={aDesignBlocks}
    />,
  );
  return { runs, onClose };
}

const box = (aLabel: string) => screen.getByLabelText(aLabel) as HTMLInputElement;
const ok = () => screen.getByRole('button', { name: 'Update PCB' }) as HTMLButtonElement;

describe('DIALOG_UPDATE_PCB window', () => {
  it('opens on a dry run with the base defaults', () => {
    const { runs } = show();

    expect(runs).toHaveLength(1);
    expect(runs[0]!.dryRun).toBe(true);
    expect(runs[0]!.options.updateFootprints).toBe(true);
    expect(runs[0]!.options.updateFields).toBe(true);
    expect(screen.getByText('Changes to Be Applied')).toBeTruthy();
  });

  it('every option re-runs the dry run with the new value', () => {
    const { runs } = show();

    fireEvent.click(box('Override locks'));
    expect(runs.at(-1)).toMatchObject({ dryRun: true, options: { overrideLocks: true } });
  });

  it('Update PCB runs for real, relabels the report for good, and greys until an option changes', () => {
    const { runs } = show();

    fireEvent.click(ok());
    expect(runs.at(-1)!.dryRun).toBe(false);
    expect(screen.getByText('Changes Applied to PCB')).toBeTruthy();
    expect(ok().disabled).toBe(true);

    fireEvent.click(box('Override locks'));
    expect(ok().disabled).toBe(false);
    // OnOptionChanged re-runs the dry run but never puts the label back.
    expect(screen.getByText('Changes Applied to PCB')).toBeTruthy();
  });

  it('design block layouts follow the groups box, and clear when it clears', () => {
    show(true);
    const layouts = () => box('Apply design block layouts to new groups');

    expect(layouts().disabled).toBe(true);
    fireEvent.click(box('Group footprints based on symbol group'));
    expect(layouts().disabled).toBe(false);
    fireEvent.click(layouts());
    expect(layouts().checked).toBe(true);
    fireEvent.click(box('Group footprints based on symbol group'));
    expect(layouts().checked).toBe(false);
    expect(layouts().disabled).toBe(true);
  });

  it('Close closes', () => {
    const { onClose } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
