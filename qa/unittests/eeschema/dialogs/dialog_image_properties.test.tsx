// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_IMAGE_PROPERTIES over its _base: the units labels are the binders' (the frame's units,
 * not a fixed "mm"), PANEL_IMAGE_EDITOR sits in m_imageSizer, and OK hands back the edited text.
 */
import { DialogImageProperties } from '@ziroeda/eeschema/dialogs/dialog_image_properties.js';
import { WX_IMAGE } from '@ziroeda/wx/wx_image.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

const png = (): string => {
  let bin = '';
  for (const b of new WX_IMAGE(64, 48).SaveFilePng()!) bin += String.fromCharCode(b);
  return btoa(bin);
};

describe('DIALOG_IMAGE_PROPERTIES_BASE', () => {
  it('labels both positions in the frame units and returns the edited text on OK', () => {
    const onOk = vi.fn();
    render(
      <DialogImageProperties
        posX="10"
        posY="20"
        units="mils"
        scale={1}
        data={png()}
        ppi={300}
        pixelSize={{ w: 64, h: 48 }}
        onOk={onOk}
        onCancel={() => {}}
      />,
    );
    expect(screen.getAllByText('mils')).toHaveLength(2);
    expect(screen.queryByText('mm')).toBeNull();
    fireEvent.change(screen.getByLabelText('Position X'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onOk).toHaveBeenCalledWith({ posX: '50', posY: '20', scale: 1 });
  });
});
