// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from wxWidgets (wxWindows Library Licence).
/**
 * `wxGetStockLabel` (wx/stockitem.h): the labels GTK's stock buttons carry, which wx gives a
 * button made from a stock id (wxID_OK, wxID_CANCEL, wxID_YES, wxID_NO) and wxMessageDialog uses
 * unless `SetYesNoLabels` / `SetOKCancelLabels` renames them.
 */

/** `wxID_YES` / `wxID_NO`. */
export const YES_LABEL = 'Yes';
export const NO_LABEL = 'No';
/** …and the one `wxOK` gets: the only button a bare wxMessageBox has, and the
 *  only button `DisplayErrorMessage` has. */
export const OK_LABEL = 'OK';
/**
 * …and `wxCANCEL`'s. NOT `NO_LABEL`: `wxOK | wxCANCEL` and `wxYES_NO` are
 * different style words with different stock labels, and a dialog that says
 * "No" where GTK says "Cancel" is the wrong dialog. [px] the probe reads
 * `&Cancel` off the built widget (`qa/probes/kidialog_probe.cpp`).
 */
export const CANCEL_LABEL = 'Cancel';
