// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The page layout editor's `DS_DATA_MODEL::GetTheInstance()`.
 *
 * KiCad links common into every kiface, so `wksTheInstance` is a static per kiface: pl_editor's
 * model - in edit mode (`m_EditMode`, formats shown as `${...}`) and holding the sheet being
 * edited - is not the one eeschema and pcbnew draw their title blocks from. One browser realm
 * has one static, so pl_editor keeps its own here. Its warm-up turning the shared model's edit
 * mode on was why ERC flagged every title block field of a correct schematic as an unresolved
 * text variable.
 */
import { DS_DATA_MODEL } from '@ziroeda/common/drawing_sheet/ds_data_model.js';

let s_model: DS_DATA_MODEL | null = null;

export function PlDataModel(): DS_DATA_MODEL {
  s_model ??= new DS_DATA_MODEL();
  return s_model;
}

/** Install \a aModel as pl_editor's model, or forget it (null): what a test gives each case. */
export function SetPlDataModel(aModel: DS_DATA_MODEL | null): void {
  s_model = aModel;
}
