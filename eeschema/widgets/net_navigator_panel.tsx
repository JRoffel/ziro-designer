// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The Net Navigator pane: what `SCH_EDIT_FRAME::createHighlightedNetNavigator` builds
 * (sch_edit_frame.cpp:2519) - the "Filter nets" search box with the gear button beside it, and
 * under them `m_netNavigator`, a wxGenericTreeCtrl.
 *
 * Everything in it is the frame's: the tree model and the filter model are SCH_EDIT_FRAME's
 * members, filled by its net_navigator.cpp methods (eeschema/net_navigator.ts) from the live
 * connection graph. This only draws them and hands the events back - a row click is
 * `wxEVT_TREE_SEL_CHANGED` (`onNetNavigatorSelection`), a right click `wxEVT_TREE_ITEM_MENU` or,
 * off any row, `wxEVT_CONTEXT_MENU`, a key in the filter or the tree `onNetNavigatorKey`, and the
 * gear its `wxEVT_LEFT_DOWN` menu.
 */

import {
  type CSSProperties,
  type JSX,
  type MouseEvent,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { BitmapButton } from '@ziroeda/common/widgets/bitmap_button.js';
import type { MenuItem } from '@ziroeda/wx/menu.js';
import { ContextMenu, wxMenuContextItems } from '@ziroeda/wx/menu_ui.js';
import { type wxGenericTreeItem, wxTreeItemId } from '@ziroeda/wx/treectrl.js';
import { WxSearchCtrl } from '@ziroeda/wx/wx_search_ctrl.js';
import type { SCH_EDIT_FRAME } from '../sch_edit_frame.js';

interface Props {
  frame: SCH_EDIT_FRAME;
}

export function NetNavigatorPanel({ frame }: Props): JSX.Element {
  const navigator = frame.GetNetNavigator();
  const filter = frame.GetNetNavigatorFilter();
  const [, repaint] = useReducer((n: number) => n + 1, 0);
  const [menu, setMenu] = useState<{ items: MenuItem[]; x: number; y: number } | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const rows = useRef(new Map<wxGenericTreeItem, HTMLDivElement>());

  useLayoutEffect(() => {
    navigator.SetChangeListener(repaint);
    filter.SetChangeListener(repaint);
    navigator.SetPopupMenuPresenter((aMenu, aOnSelect) =>
      setMenu({
        items: wxMenuContextItems(aMenu, (aId) => {
          setMenu(null);
          aOnSelect(aId);
        }),
        x: pointer.current.x,
        y: pointer.current.y,
      }),
    );
    return () => {
      navigator.SetChangeListener(null);
      filter.SetChangeListener(null);
      navigator.SetPopupMenuPresenter(null);
    };
  }, [navigator, filter]);

  // `EnsureVisible`'s scroll half: the row the frame asked for, once it is drawn.
  useEffect(() => {
    const id = navigator.TakeEnsureVisible();

    if (id.m_item) rows.current.get(id.m_item)?.scrollIntoView({ block: 'nearest' });
  });

  const selected = navigator.GetSelection().m_item;

  const at = (e: MouseEvent): void => {
    pointer.current = { x: e.clientX, y: e.clientY };
  };

  /**
   * One row and, while it is expanded, its subtree: `.ze-gentree-*`, wxGenericTreeCtrl's own
   * arithmetic for this style word (shell.css; qa/probes/net_navigator_probe.cpp).
   */
  const renderItem = (aItem: wxGenericTreeItem, aLevel: number): JSX.Element => {
    const id = new wxTreeItemId(aItem);
    const hasChildren = aItem.m_children.length > 0;

    return (
      <div
        key={rowKey(aItem)}
        className="ze-gentree-node"
        style={{ '--lvl': aLevel } as CSSProperties}
      >
        <div
          ref={(el) => {
            if (el) rows.current.set(aItem, el);
            else rows.current.delete(aItem);
          }}
          className="ze-gentree-row"
          onClick={() => {
            // wxEVT_TREE_SEL_CHANGING, then the selection, then wxEVT_TREE_SEL_CHANGED.
            if (navigator.IsFrozen()) return;

            navigator.SelectItem(id);
            frame.onNetNavigatorSelection(id);
          }}
          onDoubleClick={() => navigator.Toggle(id)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            at(e);
            frame.onNetNavigatorItemMenu(id);
          }}
        >
          {hasChildren && (
            <span
              className={`ze-gentree-button${aItem.m_isExpanded ? ' open' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                navigator.Toggle(id);
              }}
            />
          )}
          <span className={`ze-gentree-label${aItem === selected ? ' sel' : ''}`}>
            {aItem.m_text}
          </span>
        </div>
        {aItem.m_isExpanded && aItem.m_children.map((c) => renderItem(c, aLevel + 1))}
      </div>
    );
  };

  const root = navigator.GetRootItem().m_item;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* searchSizer: the filter (proportion 1, wxRIGHT 2) and the gear, inside wxALL 2. */}
      {/* [data] sizer->Add( searchSizer, 0, wxEXPAND | wxALL, FromDIP( 2 ) ) */}
      <div style={{ display: 'flex', alignItems: 'center', margin: 2 }}>
        {/* [data] searchSizer->Add( m_netNavigatorFilter, 1, wxEXPAND | wxRIGHT, FromDIP( 2 ) ) */}
        <div style={{ flex: 1, marginRight: 2 }}>
          <WxSearchCtrl
            value={filter.GetValue()}
            onChange={(v) => filter.SetValue(v)}
            descriptiveText={filter.GetDescriptiveText()}
            disabled={!filter.IsEnabled()}
            onKeyDown={(e) => {
              if (frame.onNetNavigatorKey(e.key)) e.preventDefault();
            }}
          />
        </div>
        <span
          onMouseDown={(e) => {
            // `m_netNavigatorMenuButton->Bind( wxEVT_LEFT_DOWN, ... )`: the menu on the press.
            if (e.button !== 0) return;
            at(e);
            frame.showNetNavigatorSearchMenu();
          }}
        >
          <BitmapButton bitmap="config" tooltip="" onClick={() => {}} />
        </span>
      </div>
      <div
        className="ze-gentree"
        // [data] sizer->Add( m_netNavigator, 1, wxEXPAND | wxLEFT | wxRIGHT | wxBOTTOM, FromDIP( 2 ) )
        style={{ flex: 1, minHeight: 0, margin: '0 2px 2px' }}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (frame.onNetNavigatorKey(e.key)) e.preventDefault();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          at(e);
          frame.onNetNavigatorContextMenu(new wxTreeItemId());
        }}
      >
        {root && renderItem(root, 0)}
      </div>
      {menu && (
        <ContextMenu items={menu.items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}

/** A React key for a tree item: a number given to each item the first time it is drawn. */
const keys = new WeakMap<wxGenericTreeItem, string>();
let s_nextKey = 0;

function rowKey(aItem: wxGenericTreeItem): string {
  let key = keys.get(aItem);

  if (!key) {
    key = String(s_nextKey++);
    keys.set(aItem, key);
  }

  return key;
}
