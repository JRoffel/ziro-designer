// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `PINTYPE_COMBOBOX` (eeschema/widgets/pintype_combobox.cpp): a WX_BITMAP_COMBOBOX of the electrical pin types, each
 * with its icon, in enum order; the selection is the ELECTRICAL_PINTYPE (`GetPinTypeSelection()`).
 */
import { bitmapUrl } from '@ziroeda/common/bitmap_store.js';
import type { ELECTRICAL_PINTYPE } from '@ziroeda/common/pin_type.js';
import { Combo } from '@ziroeda/wx/combobox.js';
import type { JSX } from 'react';
import { PinTypeIcons, PinTypeNames } from '../pin_type.js';

export function PinTypeComboBox({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: ELECTRICAL_PINTYPE;
  onChange: (aValue: ELECTRICAL_PINTYPE) => void;
  disabled?: boolean;
  ariaLabel?: string;
}): JSX.Element {
  const icons = PinTypeIcons();
  const options = PinTypeNames().map((name, ii) => {
    const bitmap = ii < icons.length ? bitmapUrl(icons[ii]!) : undefined;

    return bitmap === undefined
      ? { value: String(ii), label: name }
      : { value: String(ii), label: name, bitmap };
  });

  return (
    <Combo
      value={String(value)}
      options={options}
      onChange={(v) => onChange(Number(v) as ELECTRICAL_PINTYPE)}
      disabled={disabled}
      ariaLabel={ariaLabel}
    />
  );
}
