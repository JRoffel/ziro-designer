// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * KIDIALOG as wxGenericRichMessageDialog: `ShowDetailedText` is a collapsed "See details" pane
 * that opens to the text and relabels itself "Hide details" (wx/richmsgdlg.h), and a wxOK-only
 * style draws one button. MULTICHANNEL_TOOL's topology mismatch is its caller.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KiDialog } from '@ziroeda/common/kidialog.js';

afterEach(cleanup);

describe('KIDIALOG ShowDetailedText', () => {
  it('keeps the details behind See details until it is opened, then offers Hide details', () => {
    let answer: string | null = null;
    render(
      <KiDialog
        request={{
          caption: 'Topology mismatch',
          message: 'Rule Area topologies do not match: R1 -> R2: different pad count',
          icon: 'error',
          okOnly: true,
          detailedText: 'R1 -> R2: different pad count\nReference area total components: 3',
        }}
        onResult={(r) => (answer = r)}
      />,
    );
    expect(screen.queryByText(/Reference area total components: 3/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'See details' }));
    expect(screen.getByText(/Reference area total components: 3/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide details' })).toBeTruthy();

    // wxOK alone: no Cancel.
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(answer).toBe('ok');
  });

  it('draws no details pane for a dialog that sets none', () => {
    render(
      <KiDialog request={{ caption: 'C', message: 'M', icon: 'warning' }} onResult={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: 'See details' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });
});
