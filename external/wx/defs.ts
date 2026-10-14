// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * Style bits from wxWidgets 3.2 headers that the ported code passes through to the window's
 * dialogs. [data] Each value is the header's own.
 */

/** `wxOK` (wx/defs.h). */
export const wxOK = 0x00000004;
/** `wxICON_ERROR` (wx/defs.h). */
export const wxICON_ERROR = 0x00000200;
/** `wxCANCEL` (wx/defs.h). */
export const wxCANCEL = 0x00000010;
/** `wxOK_DEFAULT` (wx/defs.h). */
export const wxOK_DEFAULT = 0x00000000;
/** `wxCANCEL_DEFAULT` (wx/defs.h). */
export const wxCANCEL_DEFAULT = 0x80000000;
/** `wxYES` / `wxNO` / `wxYES_NO` (wx/defs.h). */
export const wxYES = 0x00000002;
export const wxNO = 0x00000008;
export const wxYES_NO = wxYES | wxNO;
/** `wxYES_DEFAULT` / `wxNO_DEFAULT` (wx/defs.h). */
export const wxYES_DEFAULT = 0x00000000;
export const wxNO_DEFAULT = 0x00000080;
/** `wxICON_EXCLAMATION` / `wxICON_WARNING` (wx/defs.h): the same bit. */
export const wxICON_EXCLAMATION = 0x00000100;
export const wxICON_WARNING = wxICON_EXCLAMATION;
/** `wxICON_QUESTION` (wx/defs.h). */
export const wxICON_QUESTION = 0x00000400;
/** `wxCENTER` (wx/defs.h). */
export const wxCENTER = 0x0001;

/** `wxFD_OPEN` (wx/filedlg.h). */
export const wxFD_OPEN = 0x0001;
/** `wxFD_FILE_MUST_EXIST` (wx/filedlg.h). */
export const wxFD_FILE_MUST_EXIST = 0x0010;
/** `wxFD_SAVE` (wx/filedlg.h). */
export const wxFD_SAVE = 0x0002;
/** `wxFD_OVERWRITE_PROMPT` (wx/filedlg.h). */
export const wxFD_OVERWRITE_PROMPT = 0x0004;
/** `wxFD_CHANGE_DIR` (wx/filedlg.h). */
export const wxFD_CHANGE_DIR = 0x0080;
/** `wxDD_DIR_MUST_EXIST` (wx/dirdlg.h). */
export const wxDD_DIR_MUST_EXIST = 0x0200;
/** `wxDD_DEFAULT_STYLE` (wx/dirdlg.h): wxDEFAULT_DIALOG_STYLE | wxRESIZE_BORDER. */
export const wxDD_DEFAULT_STYLE = 0x20000000 | 0x0800 | 0x1000 | 0x0040;

/** Sizer orientation (wx/defs.h `wxOrientation`). */
export const wxHORIZONTAL = 0x0004;
export const wxVERTICAL = 0x0008;
export const wxBOTH = wxVERTICAL | wxHORIZONTAL;

/** Border directions of a sizer item (wx/defs.h `wxDirection`): which sides `border` applies to. */
export const wxLEFT = 0x0010;
export const wxRIGHT = 0x0020;
export const wxTOP = 0x0040;
export const wxBOTTOM = 0x0080;
export const wxALL = wxTOP | wxBOTTOM | wxRIGHT | wxLEFT;

/** Sizer item flags (wx/defs.h `wxStretch`, `wxAlignment`). Left and top are 0. */
export const wxEXPAND = 0x2000;
/** `wxGROW`: defs.h spells it as `wxEXPAND`. */
export const wxGROW = wxEXPAND;
export const wxSHAPED = 0x4000;
export const wxFIXED_MINSIZE = 0x8000;
/** `wxRESERVE_SPACE_EVEN_IF_HIDDEN`: a hidden item keeps its room (wx/defs.h `wxSizerFlagBits`). */
export const wxRESERVE_SPACE_EVEN_IF_HIDDEN = 0x0002;
export const wxALIGN_LEFT = 0;
export const wxALIGN_TOP = 0;
export const wxALIGN_CENTER_HORIZONTAL = 0x0100;
export const wxALIGN_RIGHT = 0x0200;
export const wxALIGN_BOTTOM = 0x0400;
export const wxALIGN_CENTER_VERTICAL = 0x0800;
export const wxALIGN_CENTER = wxALIGN_CENTER_HORIZONTAL | wxALIGN_CENTER_VERTICAL;
