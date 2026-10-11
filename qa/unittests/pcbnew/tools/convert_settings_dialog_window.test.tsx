// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * CONVERT_SETTINGS_DIALOG's window (pcbnew/tools/convert_tool.cpp:66-237): the radios the caller
 * shows, onRadioButton's gap and width greying, and OK writing the settings back.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONVERT_SETTINGS, CONVERT_STRATEGY } from '@ziroeda/pcbnew/pcbnew_settings.js';
import {
  CONVERT_SETTINGS_DIALOG,
  ConvertSettingsDialog,
} from '@ziroeda/pcbnew/tools/convert_settings_dialog.js';

afterEach(cleanup);

function show(aShown = { copyLineWidth: true, centerline: true, boundingHull: true }) {
  const settings = new CONVERT_SETTINGS();
  const onClose = vi.fn();
  render(
    <ConvertSettingsDialog
      dialog={new CONVERT_SETTINGS_DIALOG(settings, aShown)}
      units="mm"
      onClose={onClose}
    />,
  );
  return { settings, onClose };
}

const textbox = (aName: string) => screen.getByRole('textbox', { name: aName }) as HTMLInputElement;

describe('CONVERT_SETTINGS_DIALOG window', () => {
  it('the gap and width are live only for the bounding hull', () => {
    show();
    expect(textbox('Gap').disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Create bounding hull'));
    expect(textbox('Gap').disabled).toBe(false);
    expect(textbox('Line width').disabled).toBe(false);
  });

  it('a hidden option is not offered', () => {
    show({ copyLineWidth: false, centerline: true, boundingHull: false });
    expect(screen.queryByLabelText('Copy line width of first object')).toBeNull();
    expect(screen.queryByLabelText('Create bounding hull')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Gap' })).toBeNull();
  });

  it('OK writes the strategy, the gap and Delete source objects back', () => {
    const { settings, onClose } = show();
    fireEvent.click(screen.getByLabelText('Create bounding hull'));
    fireEvent.change(textbox('Gap'), { target: { value: '0.5' } });
    fireEvent.click(screen.getByLabelText('Delete source objects after conversion'));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(settings.m_Strategy).toBe(CONVERT_STRATEGY.BOUNDING_HULL);
    expect(settings.m_Gap).toBe(500_000);
    expect(settings.m_DeleteOriginals).toBe(true);
    expect(onClose).toHaveBeenCalledWith(true);
  });
});
