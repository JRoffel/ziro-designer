// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_UNUSED_PAD_LAYERS' window (dialog_unused_pad_layers.cpp) on its base: the four boxes,
 * SetupStandardButtons' labels, syncImages swapping the picture, and the buttons reaching
 * onOK / onApply. What those do to the board is dialog_unused_pad_layers.test.ts's.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { COMMIT } from '@ziroeda/common/commit.js';
import {
  DIALOG_UNUSED_PAD_LAYERS,
  DialogUnusedPadLayers,
} from '@ziroeda/pcbnew/dialogs/dialog_unused_pad_layers.js';
import type { PCB_BASE_FRAME } from '@ziroeda/pcbnew/pcb_base_frame.js';

afterEach(cleanup);

function show() {
  const dialog = new DIALOG_UNUSED_PAD_LAYERS(
    {} as unknown as PCB_BASE_FRAME,
    [],
    {} as unknown as COMMIT,
  );
  const onOK = vi.spyOn(dialog, 'OnOK').mockImplementation(() => {});
  const onApply = vi.spyOn(dialog, 'OnApply').mockImplementation(() => {});
  const onClose = vi.fn();
  const view = render(<DialogUnusedPadLayers dialog={dialog} onClose={onClose} />);
  return { dialog, onOK, onApply, onClose, view };
}

const img = (c: HTMLElement) => c.querySelector('img')!.getAttribute('src') ?? '';

describe('DIALOG_UNUSED_PAD_LAYERS window', () => {
  it('has the four boxes, Keep outside layers on, and the renamed buttons', () => {
    show();

    expect((screen.getByLabelText('Vias') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Pads') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Selected only') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Keep outside layers') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Remove Unused Layers' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore All Layers' })).toBeTruthy();
  });

  it('syncImages: Keep outside layers swaps the picture', () => {
    const { view } = show();

    expect(img(view.container)).toContain('pads_remove_unused_keep_bottom');
    fireEvent.click(screen.getByLabelText('Keep outside layers'));
    expect(img(view.container)).not.toContain('keep_bottom');
    expect(img(view.container)).toContain('pads_remove_unused');
  });

  it('Remove Unused Layers is onOK, Restore All Layers is onApply', () => {
    const first = show();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Unused Layers' }));
    expect(first.onOK).toHaveBeenCalled();
    expect(first.onClose).toHaveBeenCalled();
    cleanup();

    const second = show();
    fireEvent.click(screen.getByRole('button', { name: 'Restore All Layers' }));
    expect(second.onApply).toHaveBeenCalled();
    expect(second.onOK).not.toHaveBeenCalled();
  });
});
