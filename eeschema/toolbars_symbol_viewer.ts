// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `eeschema/toolbars_symbol_viewer.cpp`: `SYMBOL_VIEWER_TOOLBAR_SETTINGS::DefaultToolbarConfig`
 * (`TOOLBAR_LOC::TOP_MAIN`) and `SYMBOL_VIEWER_FRAME::doReCreateMenuBar`. Upstream keeps both in
 * the same file, so this does too, beside `symbol_viewer_frame_ui.tsx` (the window).
 */
import type { ToolEntry } from '@ziroeda/common/tool/action_toolbar.js';
import type { Menu, MenuItem } from '@ziroeda/wx/menu.js';
import { addClose } from '@ziroeda/common/tool/action_menu.js';
import { standardHelpMenu } from '@ziroeda/common/eda_base_frame_help_menu.js';

/** SYMBOL_VIEWER_TOOLBAR_SETTINGS::DefaultToolbarConfig( TOOLBAR_LOC::TOP_MAIN ). */
export const TOP_TOOLBAR: ToolEntry[] = [
  { id: 'previousSymbol', icon: 'previousSymbol', title: 'Display previous symbol' },
  { id: 'nextSymbol', icon: 'nextSymbol', title: 'Display next symbol' },
  'sep',
  { id: 'zoomRedraw', icon: 'zoomRedraw', title: 'Refresh' },
  { id: 'zoomInCenter', icon: 'zoomIn', title: 'Zoom In' },
  { id: 'zoomOutCenter', icon: 'zoomOut', title: 'Zoom Out' },
  { id: 'zoomFitScreen', icon: 'zoomFit', title: 'Zoom to Fit' },
  'sep',
  {
    id: 'showElectricalTypes',
    icon: 'showElectricalTypes',
    title: 'Show Pin Electrical Types',
    toggle: true,
  },
  { id: 'showPinNumbers', icon: 'showPinNumbers', title: 'Show Pin Numbers', toggle: true },
  'sep',
  { control: 'bodyStyleSelector' },
  'sep',
  { control: 'unitSelector' },
  'sep',
  { id: 'showDatasheet', icon: 'showDatasheet', title: 'Show Datasheet' },
  'sep',
  { id: 'addSymbolToSchematic', icon: 'addSymbolToSchematic', title: 'Add Symbol to Schematic' },
];

/**
 * `ACTION_TOOLBAR_CONTROLS::unitSelector` / `bodyStyleSelector`'s factories in `configureToolbars`:
 * `new wxChoice( m_tbTopMain, ..., wxDefaultPosition, wxSize( 150, -1 ) )`. [data]
 */
export const SYMBOL_VIEWER_CHOICE_WIDTH = 150;

/** What the menu rows run: the window's close, an action id, and the Help menu's two windows. */
export interface SymbolViewerMenuHandlers {
  close: () => void;
  action: (id: string) => void;
  showHotkeys: () => void;
  showAbout: () => void;
  /** The CHECK conditions of the two render toggles (`setupUIConditions`). */
  electricalTypesShown: boolean;
  pinNumbersShown: boolean;
}

/**
 * `SYMBOL_VIEWER_FRAME::doReCreateMenuBar`, transcribed. File carries `AddClose( _( "Symbol
 * Viewer" ) )` alone; View has the four zooms, two separators in a row as upstream appends them,
 * and the two render toggles as CHECK rows; then `AddStandardHelpMenu( menuBar )`. Accelerators are
 * the actions' `DefaultHotkey`s: Home and F5 on Zoom to Fit and Refresh, none on the rest.
 */
export function symbolViewerMenus(h: SymbolViewerMenuHandlers): Menu[] {
  const act = (label: string, id: string, extra: Partial<MenuItem> = {}): MenuItem => ({
    label,
    action: () => h.action(id),
    ...extra,
  });

  return [
    { label: 'File', items: [addClose('Symbol Viewer', h.close)] },
    {
      label: 'View',
      items: [
        act('Zoom In', 'zoomInCenter', { icon: 'zoomIn' }),
        act('Zoom Out', 'zoomOutCenter', { icon: 'zoomOut' }),
        act('Zoom to Fit', 'zoomFitScreen', { icon: 'zoomFit', shortcut: 'Home' }),
        act('Refresh', 'zoomRedraw', { icon: 'zoomRedraw', shortcut: 'F5' }),
        { sep: true },
        { sep: true },
        act('Show Pin Electrical Types', 'showElectricalTypes', {
          checked: h.electricalTypesShown,
        }),
        act('Show Pin Numbers', 'showPinNumbers', { checked: h.pinNumbersShown }),
      ],
    },
    standardHelpMenu({ showHotkeys: h.showHotkeys, showAbout: h.showAbout }),
  ];
}
