// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * WX_INFOBAR's close button (`AddCloseButton`, wx_infobar.cpp:375-382): it hides the bar, and a
 * caller that keeps state of its own about the message - the app's new-version notice, which
 * yields the strip back to the demo's message - hears that it did.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Infobar } from '@ziroeda/common/widgets/wx_infobar.js';

afterEach(cleanup);

describe('Infobar', () => {
  it('hides on its close button, and tells the caller', () => {
    const onClose = vi.fn();
    const onAction = vi.fn();
    render(
      <Infobar
        icon="information"
        message="A new version of ZiroEDA is available."
        actionLabel="Reload Now"
        onAction={onAction}
        closable
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByText('Reload Now'));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Hide this message.'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('still hides with no one listening', () => {
    render(<Infobar message="Schematic is read only." closable />);

    fireEvent.click(screen.getByLabelText('Hide this message.'));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
