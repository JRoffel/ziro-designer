// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Schematic Setup > Annotation: `PANEL_EESCHEMA_ANNOTATION_OPTIONS`
 * (eeschema/dialogs/panel_eeschema_annotation_options.cpp) over its _base. loadEEschemaSettings and
 * TransferDataFromWindow map the settings onto the controls and back; here they read and write
 * the draft Schematic Setup hands the page, so Cancel discards them.
 */
import type { JSX } from 'react';
import type {
  AnnotateNumbering,
  AnnotateSortOrder,
  AnnotationSettings,
} from '../schematic_settings.js';
import { PANEL_EESCHEMA_ANNOTATION_OPTIONS_BASE } from './panel_eeschema_annotation_options_base.js';

// The data model lives in schematic_settings.ts (KiCad's data/UI split);
// re-exported here so the panel stays the import site for its slice.
export {
  SYMBOL_UNIT_NOTATIONS,
  defaultAnnotation,
  type AnnotateSortOrder,
  type AnnotateNumbering,
  type AnnotationSettings,
} from '../schematic_settings.js';

/** m_rbSortBy_X_Position, m_rbSortBy_Y_Position. */
const SORT_ORDERS: readonly AnnotateSortOrder[] = ['x', 'y'];
/** m_rbFirstFree, m_rbSheetX100, m_rbSheetX1000. */
const NUMBERINGS: readonly AnnotateNumbering[] = ['firstFree', 'sheetX100', 'sheetX1000'];

export function PanelEeschemaAnnotationOptions({
  value,
  onChange,
}: {
  value: AnnotationSettings;
  onChange: (next: AnnotationSettings) => void;
}): JSX.Element {
  const set = (patch: Partial<AnnotationSettings>): void => onChange({ ...value, ...patch });

  return (
    <PANEL_EESCHEMA_ANNOTATION_OPTIONS_BASE
      m_choiceSeparatorRefId={{
        value: value.symbolUnitNotation,
        onChange: (i) => set({ symbolUnitNotation: i }),
      }}
      sortOrder={Math.max(0, SORT_ORDERS.indexOf(value.sortOrder))}
      onSortOrder={(i) => set({ sortOrder: SORT_ORDERS[i]! })}
      numbering={Math.max(0, NUMBERINGS.indexOf(value.numbering))}
      onNumbering={(i) => set({ numbering: NUMBERINGS[i]! })}
      m_textNumberAfter={String(value.firstFreeAfter)}
      // EDA_UNIT_UTILS::UI::ValueFromString: digits only, anything else reads as 0.
      onNumberAfter={(t) => set({ firstFreeAfter: Number.parseInt(t, 10) || 0 })}
      m_checkReuseRefdes={{ value: value.allowReuse, onChange: (on) => set({ allowReuse: on }) }}
    />
  );
}
