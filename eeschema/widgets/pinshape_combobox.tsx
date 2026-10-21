// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `PINSHAPE_COMBOBOX` (eeschema/widgets/pinshape_combobox.cpp): a WX_BITMAP_COMBOBOX of the graphic pin shapes, each
 * with its icon, in enum order; the selection is the GRAPHIC_PINSHAPE (`GetPinShapeSelection()`).
 */
import { bitmapUrl } from '@ziroeda/common/bitmap_store.js';
import type { GRAPHIC_PINSHAPE } from '@ziroeda/common/pin_type.js';
import { Combo } from '@ziroeda/wx/combobox.js';
import type { JSX } from 'react';
import { PinShapeIcons, PinShapeNames } from '../pin_type.js';

export function PinShapeComboBox({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: GRAPHIC_PINSHAPE;
  onChange: (aValue: GRAPHIC_PINSHAPE) => void;
  disabled?: boolean;
  ariaLabel?: string;
}): JSX.Element {
  const icons = PinShapeIcons();
  const options = PinShapeNames().map((name, ii) => {
    const bitmap = ii < icons.length ? bitmapUrl(icons[ii]!) : undefined;

    return bitmap === undefined
      ? { value: String(ii), label: name }
      : { value: String(ii), label: name, bitmap };
  });

  return (
    <Combo
      value={String(value)}
      options={options}
      onChange={(v) => onChange(Number(v) as GRAPHIC_PINSHAPE)}
      disabled={disabled}
      ariaLabel={ariaLabel}
    />
  );
}
