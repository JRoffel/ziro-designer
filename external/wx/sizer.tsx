// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from wxWidgets (wxWindows Library Licence).
/**
 * The wx sizers, so a dialog's window is a transcription of its `_base.cpp` and nothing else.
 * KiCad never lays a dialog out by hand: the form builder emits
 * `sizer->Add( item, proportion, flag, border )` on wx's generic sizers and wx owns the layout.
 * Here the same: a dialog writes the tree with these components and the numbers from its
 * `_base.cpp`; it carries no CSS of its own.
 *
 *     bSizerTop->Add( m_outputFileName, 1, wxALL|wxEXPAND, 5 );
 *     <SizerItem proportion={1} flag={wxALL | wxEXPAND} border={5}><TextCtrl … /></SizerItem>
 *
 * What wx does, and so what this does:
 *
 * - An item's `border` is a margin on the sides its flag names. Borders of neighbours add
 *   (5 + 5 is 10); a sizer has no gap of its own.
 * - `wxBoxSizer`: every item gets its minimum along the main axis; `proportion` shares only the
 *   EXTRA space among the items that have one. Proportion 0 is the minimum, never a share.
 * - Across, `wxEXPAND` stretches the item; otherwise `wxALIGN_*` places it (left / top when
 *   none). Along the main axis a box item always fills the space it was given.
 * - `wxFlexGridSizer`: each column is as wide as its widest item IN THIS SIZER, each row as tall
 *   as its tallest; growable columns and rows share the extra space by their proportion. A
 *   cell's item is placed in its cell by `wxEXPAND` / `wxALIGN_*`, both ways.
 * - `wxGridBagSizer`: the same tracks, items at explicit positions and spans; a row or column
 *   with no item is `SetEmptyCellSize` (10 x 20 unless stated).
 * - `wxStaticBoxSizer`: a box sizer inside the static box, children flush inside its frame
 *   (`GetBordersForSizer` is the label line on top and nothing elsewhere).
 * - A hidden item takes no space (`Layout` skips it).
 * - A sizer never shrinks an item below its minimum, and a label never wraps.
 */
import { Children, cloneElement, createContext, Fragment, isValidElement, useContext } from 'react';
import type { CSSProperties, JSX, ReactElement, ReactNode } from 'react';
import { Button, StaticBox } from './controls.js';
import {
  wxALIGN_BOTTOM,
  wxALIGN_CENTER_HORIZONTAL,
  wxALIGN_CENTER_VERTICAL,
  wxALIGN_RIGHT,
  wxBOTH,
  wxBOTTOM,
  wxEXPAND,
  wxHORIZONTAL,
  wxLEFT,
  wxRESERVE_SPACE_EVEN_IF_HIDDEN,
  wxRIGHT,
  wxTOP,
  wxVERTICAL,
} from './defs.js';

/** What kind of sizer an item is in: a box lays out along one axis, a grid in cells. */
interface SIZER_CONTEXT {
  grid: boolean;
  vertical: boolean;
}

const SizerContext = createContext<SIZER_CONTEXT>({ grid: false, vertical: true });

/** The item's border: `flag`'s direction bits say which sides take `border`. */
function borderMargin(aFlag: number, aBorder: number): string {
  const side = (aBit: number): string => (aFlag & aBit ? `${aBorder}px` : '0');
  return `${side(wxTOP)} ${side(wxRIGHT)} ${side(wxBOTTOM)} ${side(wxLEFT)}`;
}

/** `wxALIGN_*` across a box: horizontal in a vertical sizer, vertical in a horizontal one. */
function crossAlign(aVertical: boolean, aFlag: number): CSSProperties['alignItems'] {
  if (aFlag & wxEXPAND) return 'stretch';

  if (aVertical) {
    if (aFlag & wxALIGN_CENTER_HORIZONTAL) return 'center';
    if (aFlag & wxALIGN_RIGHT) return 'flex-end';
  } else {
    if (aFlag & wxALIGN_CENTER_VERTICAL) return 'center';
    if (aFlag & wxALIGN_BOTTOM) return 'flex-end';
  }

  return 'flex-start';
}

/** Where a grid item sits in its cell, across (horizontal) and down (vertical). */
function cellAlign(aFlag: number): Pick<CSSProperties, 'justifyContent' | 'alignItems'> {
  if (aFlag & wxEXPAND) return { justifyContent: 'stretch', alignItems: 'stretch' };

  const across =
    aFlag & wxALIGN_CENTER_HORIZONTAL
      ? 'center'
      : aFlag & wxALIGN_RIGHT
        ? 'flex-end'
        : 'flex-start';
  const down =
    aFlag & wxALIGN_CENTER_VERTICAL ? 'center' : aFlag & wxALIGN_BOTTOM ? 'flex-end' : 'flex-start';
  return { justifyContent: across, alignItems: down };
}

export interface SizerItemProps {
  /** `proportion`: a box item's share of the extra main-axis space; 0 keeps it at its minimum. */
  proportion?: number;
  /** `flag`: border sides, `wxEXPAND`, `wxALIGN_*`. */
  flag?: number;
  /** `border`, in pixels, on the sides `flag` names. */
  border?: number;
  /** `Show( false )` / `Hide()`: the item and its space are gone. */
  shown?: boolean;
  /**
   * The window's `SetMinSize( wxSize( w, h ) )`, which the sizer honours for its item; -1 leaves
   * that axis to the window's best size. Data from the `_base.cpp`, never chrome.
   */
  minSize?: readonly [number, number];
  /** Grid bag only: `wxGBPosition( row, col )`. */
  pos?: readonly [number, number];
  /** Grid bag only: `wxGBSpan( rows, cols )`. */
  span?: readonly [number, number];
  /** The window or the sizer added. */
  children: ReactNode;
}

/**
 * `sizer->Add( item, proportion, flag, border )`: one item of the enclosing sizer. Inside a
 * `GridBagSizer` it is `Add( item, wxGBPosition, wxGBSpan, flag, border )`.
 */
export function SizerItem({
  proportion = 0,
  flag = 0,
  border = 0,
  shown = true,
  minSize,
  pos,
  span,
  children,
}: SizerItemProps): JSX.Element | null {
  const ctx = useContext(SizerContext);
  // wxRESERVE_SPACE_EVEN_IF_HIDDEN: the hidden item is still laid out, just not drawn.
  const reserved = (flag & wxRESERVE_SPACE_EVEN_IF_HIDDEN) !== 0;

  if (!shown && !reserved) return null;

  const style: CSSProperties = { margin: borderMargin(flag, border) };

  if (!shown) style.visibility = 'hidden';

  if (minSize && minSize[0] >= 0) style.minWidth = minSize[0];
  if (minSize && minSize[1] >= 0) style.minHeight = minSize[1];

  // A box item fills its main-axis slot; a grid item fills its cell only with wxEXPAND.
  let fill = true;
  // A box item with wxEXPAND is stretched across: a control with its own best width
  // (an entry's) is widened to the slot, as wx's sizer does, not left at it.
  let across = false;

  if (ctx.grid) {
    Object.assign(style, cellAlign(flag));
    fill = (flag & wxEXPAND) !== 0;

    if (pos) {
      const [rows, cols] = span ?? [1, 1];
      style.gridRow = `${pos[0] + 1} / span ${rows}`;
      style.gridColumn = `${pos[1] + 1} / span ${cols}`;
    }
  } else {
    style.flexGrow = proportion;
    style.flexDirection = ctx.vertical ? 'column' : 'row';
    style.alignItems = crossAlign(ctx.vertical, flag);
    across = (flag & wxEXPAND) !== 0;
  }

  // GetEffectiveMinSize: an axis the window's SetMinSize states replaces its best size there.
  // Marked, so a scrolled window (a grid) in the item takes the floor and scrolls, rather than
  // asking for its whole extent.
  const minW = minSize !== undefined && minSize[0] >= 0;
  const minH = minSize !== undefined && minSize[1] >= 0;

  return (
    <div
      className={`ze-szi${fill ? ' ze-szi-fill' : ''}${across ? ' ze-szi-across' : ''}${
        minW ? ' ze-szi-minw' : ''
      }${minH ? ' ze-szi-minh' : ''}`}
      style={style}
    >
      {children}
    </div>
  );
}

export interface SpacerProps {
  /** `Add( width, height, … )`. */
  width?: number;
  height?: number;
  /** `AddStretchSpacer( proportion )` / `Add( 0, 0, proportion, … )`. */
  proportion?: number;
  flag?: number;
  border?: number;
  pos?: readonly [number, number];
  span?: readonly [number, number];
}

/** `sizer->Add( width, height, proportion, flag, border )`: empty space. */
export function Spacer({
  width = 0,
  height = 0,
  proportion = 0,
  flag = 0,
  border = 0,
  pos,
  span,
}: SpacerProps): JSX.Element {
  const ctx = useContext(SizerContext);
  const style: CSSProperties = {
    margin: borderMargin(flag, border),
    minWidth: width,
    minHeight: height,
  };

  if (!ctx.grid) style.flexGrow = proportion;
  else if (pos) {
    const [rows, cols] = span ?? [1, 1];
    style.gridRow = `${pos[0] + 1} / span ${rows}`;
    style.gridColumn = `${pos[1] + 1} / span ${cols}`;
  }

  return <div className="ze-szspacer" style={style} />;
}

/** `AddStretchSpacer( proportion = 1 )`. */
export function StretchSpacer({ proportion = 1 }: { proportion?: number }): JSX.Element {
  return <Spacer proportion={proportion} />;
}

/**
 * A sizer's items: its children with fragments opened, as wx sees one Add() per item.
 *
 * Every child of a sizer is an `Add()`: a `SizerItem` or a `Spacer`. Anything else is a
 * helper that returns them - a `_base` file's `UnitRow` or `Heading` standing for the
 * label, entry and units one `Add()` each - so it is opened like a fragment. Left closed,
 * it was ONE item: a grid sizer placed its three cells wherever the browser put them (the
 * Footprint Properties Position box), and a box sizer could not see a `proportion` set
 * inside it. Helpers are called here, during the sizer's render, so they must not use hooks
 * (qa `sizer_helpers_are_pure` holds that).
 */
function sizerItems(aChildren: ReactNode, aKey = ''): ReactElement[] {
  const out: ReactElement[] = [];

  for (const c of Children.toArray(aChildren)) {
    if (!isValidElement(c)) continue;

    // Children.toArray restarts its keys inside every fragment and helper; the path keeps
    // the items of two of them apart.
    const key = `${aKey}${String(c.key)}`;

    if (c.type === Fragment)
      out.push(...sizerItems((c.props as { children?: ReactNode }).children, `${key}/`));
    else if (
      typeof c.type === 'function' &&
      c.type !== SizerItem &&
      c.type !== Spacer &&
      !(c.type.prototype as { isReactComponent?: unknown } | undefined)?.isReactComponent
    )
      out.push(...sizerItems((c.type as (aProps: unknown) => ReactNode)(c.props), `${key}/`));
    else out.push(aKey ? cloneElement(c, { key }) : c);
  }

  return out;
}

/** `IsShown()`: an item rendered with `shown={false}` is hidden. */
const isShown = (aItem: ReactElement): boolean => {
  const props = aItem.props as { shown?: boolean; flag?: number };

  return props.shown !== false || ((props.flag ?? 0) & wxRESERVE_SPACE_EVEN_IF_HIDDEN) !== 0;
};

/** `proportion` of an item (a spacer or a window), 0 when unstated. */
const proportionOf = (aItem: ReactElement): number =>
  (aItem.props as { proportion?: number }).proportion ?? 0;

export interface BoxSizerProps {
  /** `wxBoxSizer( wxVERTICAL | wxHORIZONTAL )`. */
  orient: number;
  children?: ReactNode;
}

/**
 * `wxBoxSizer`. With any proportional item it is a one-track grid along its orientation, so the
 * fr tracks come out as wx's `CalcMin` sizes them: `max( min_i / prop_i ) * prop_i` for each, which
 * is why two proportion-1 panes with different contents open at equal widths. A flexbox would give
 * each its own minimum instead. With none it is a plain flex row or column.
 */
export function BoxSizer({ orient, children }: BoxSizerProps): JSX.Element {
  const vertical = orient === wxVERTICAL;
  const items = sizerItems(children).filter(isShown);
  const proportional = items.some((it) => proportionOf(it) > 0);
  let style: CSSProperties = { flexDirection: vertical ? 'column' : 'row' };

  if (proportional) {
    const main = items
      .map((it) => {
        const p = proportionOf(it);
        return p > 0 ? `minmax(max-content, ${p}fr)` : 'max-content';
      })
      .join(' ');
    // The cross axis: one track as wide as the widest item, stretched with the sizer.
    style = vertical
      ? { display: 'grid', gridTemplateRows: main, gridTemplateColumns: 'minmax(max-content, 1fr)' }
      : {
          display: 'grid',
          gridAutoFlow: 'column',
          gridTemplateColumns: main,
          gridTemplateRows: 'minmax(max-content, 1fr)',
        };
  }

  return (
    <SizerContext.Provider value={{ grid: false, vertical }}>
      <div className="ze-sizer" style={style}>
        {items}
      </div>
    </SizerContext.Provider>
  );
}

export interface StaticBoxSizerProps {
  /** `wxStaticBoxSizer( new wxStaticBox( this, wxID_ANY, label ), orient )`. */
  label: string;
  orient: number;
  children?: ReactNode;
}

/** `wxStaticBoxSizer`: a box sizer inside a `wxStaticBox`, flush inside its frame. */
export function StaticBoxSizer({ label, orient, children }: StaticBoxSizerProps): JSX.Element {
  return (
    <StaticBox label={label} className="ze-sbox-sizer">
      <BoxSizer orient={orient}>{children}</BoxSizer>
    </StaticBox>
  );
}

/** One track list of a flexible grid: each track its content, the growable ones sharing slack. */
function tracks(
  aCount: number,
  aGrowable: ReadonlyMap<number, number>,
  aFlexible: boolean,
  aFixed: ReadonlyMap<number, string> = new Map(),
): string {
  const out: string[] = [];

  for (let i = 0; i < aCount; i++) {
    const grow = aGrowable.get(i);

    if (grow !== undefined) out.push(`minmax(max-content, ${grow}fr)`);
    // Not flexible along this axis (wxGridSizer): every track the size of the largest, which is
    // what a plain fr track gives at the intrinsic size.
    else if (!aFlexible) out.push('1fr');
    else out.push(aFixed.get(i) ?? 'max-content');
  }

  return out.join(' ');
}

/** `AddGrowableCol( idx, proportion )` as a list: an index, or `[index, proportion]`. */
export type GROWABLE = number | readonly [number, number];

const growableMap = (aList: readonly GROWABLE[] = []): Map<number, number> =>
  new Map(aList.map((g) => (typeof g === 'number' ? [g, 1] : [g[0], g[1]])));

export interface FlexGridSizerProps {
  /** `wxFlexGridSizer( rows, cols, vgap, hgap )`: the row count follows from the items. */
  cols: number;
  vgap?: number;
  hgap?: number;
  /** `AddGrowableCol` / `AddGrowableRow`. */
  growableCols?: readonly GROWABLE[];
  growableRows?: readonly GROWABLE[];
  /**
   * `SetFlexibleDirection`: the axes along which tracks size to their own content. A direction
   * left out gives every track along it the size of the largest (a plain `wxGridSizer`).
   */
  flexibleDirection?: number;
  children?: ReactNode;
}

/** `wxFlexGridSizer`; with `flexibleDirection={0}` it is a `wxGridSizer`. */
export function FlexGridSizer({
  cols,
  vgap = 0,
  hgap = 0,
  growableCols,
  growableRows,
  flexibleDirection = wxBOTH,
  children,
}: FlexGridSizerProps): JSX.Element {
  // Every item, hidden or not, takes its cell in Add() order; a hidden item's cell stays empty.
  // A row or column whose items are ALL hidden collapses, its gap with it.
  const all = sizerItems(children);
  const rowsAll = Math.max(1, Math.ceil(all.length / cols));
  const rowShown = new Array<boolean>(rowsAll).fill(false);
  const colShown = new Array<boolean>(cols).fill(false);

  all.forEach((it, i) => {
    if (!isShown(it)) return;
    rowShown[Math.floor(i / cols)] = true;
    colShown[i % cols] = true;
  });

  // An empty sizer still has its one row of columns.
  if (all.length === 0) rowShown[0] = true;

  const compact = (aShown: boolean[]): number[] => {
    let n = 0;
    return aShown.map((s) => (s ? n++ : -1));
  };
  const rowAt = compact(rowShown);
  const colAt = compact(colShown);
  const remap = (aList: readonly GROWABLE[] | undefined, aAt: number[]): GROWABLE[] =>
    (aList ?? []).flatMap((g) => {
      const [idx, prop] = typeof g === 'number' ? [g, 1] : g;
      const at = aAt[idx];
      return at === undefined || at < 0 ? [] : [[at, prop] as const];
    });

  const placed = all.flatMap((it, i) => {
    const r = rowAt[Math.floor(i / cols)]!;
    const c = colAt[i % cols]!;
    if (!isShown(it) || r < 0 || c < 0) return [];
    // An item's identity IS its Add() index, which is also its cell.
    return [cloneElement(it as ReactElement<SizerItemProps>, { key: it.key ?? i, pos: [r, c] })];
  });

  const style: CSSProperties = {
    gridTemplateColumns: tracks(
      colAt.filter((c) => c >= 0).length,
      growableMap(remap(growableCols, colAt)),
      (flexibleDirection & wxHORIZONTAL) !== 0,
    ),
    gridTemplateRows: tracks(
      rowAt.filter((r) => r >= 0).length,
      growableMap(remap(growableRows, rowAt)),
      (flexibleDirection & wxVERTICAL) !== 0,
    ),
    rowGap: vgap,
    columnGap: hgap,
  };

  return (
    <SizerContext.Provider value={{ grid: true, vertical: false }}>
      <div className="ze-sizer ze-gridsizer" style={style}>
        {placed}
      </div>
    </SizerContext.Provider>
  );
}

export interface GridBagSizerProps {
  /** `wxGridBagSizer( vgap, hgap )`. */
  vgap?: number;
  hgap?: number;
  /** `SetEmptyCellSize( wxSize( w, h ) )`; wx's default is 10 x 20. */
  emptyCellSize?: readonly [number, number];
  growableCols?: readonly GROWABLE[];
  growableRows?: readonly GROWABLE[];
  children?: ReactNode;
}

/** `wxGridBagSizer`: items at `pos` with `span`; an empty row or column is the empty-cell size. */
export function GridBagSizer({
  vgap = 0,
  hgap = 0,
  emptyCellSize = [10, 20], // [data] wxGridBagSizer's m_emptyCellSize default (gbsizer.cpp)
  growableCols,
  growableRows,
  children,
}: GridBagSizerProps): JSX.Element {
  const usedRows = new Set<number>();
  const usedCols = new Set<number>();
  let nRows = 0;
  let nCols = 0;

  for (const c of sizerItems(children)) {
    const p = (c as ReactElement<SizerItemProps>).props;

    if (p.shown === false || !p.pos) continue;

    const [r, col] = p.pos;
    const [rs, cs] = p.span ?? [1, 1];

    for (let i = 0; i < rs; i++) usedRows.add(r + i);
    for (let i = 0; i < cs; i++) usedCols.add(col + i);

    nRows = Math.max(nRows, r + rs);
    nCols = Math.max(nCols, col + cs);
  }

  const empty = (aCount: number, aUsed: Set<number>, aSize: number): Map<number, string> => {
    const m = new Map<number, string>();
    for (let i = 0; i < aCount; i++) if (!aUsed.has(i)) m.set(i, `${aSize}px`);
    return m;
  };

  const style: CSSProperties = {
    gridTemplateColumns: tracks(
      nCols,
      growableMap(growableCols),
      true,
      empty(nCols, usedCols, emptyCellSize[0]),
    ),
    gridTemplateRows: tracks(
      nRows,
      growableMap(growableRows),
      true,
      empty(nRows, usedRows, emptyCellSize[1]),
    ),
    rowGap: vgap,
    columnGap: hgap,
  };

  return (
    <SizerContext.Provider value={{ grid: true, vertical: false }}>
      <div className="ze-sizer ze-gridsizer" style={style}>
        {children}
      </div>
    </SizerContext.Provider>
  );
}

/**
 * Counterpart: `wxStdDialogButtonSizer`, which is what every KiCad dialog uses —
 * wxFormBuilder emits `m_sdbSizer1` / `m_sdbSizer1OK` / `m_sdbSizer1Cancel` and
 * a `Realize()` into each `*_base.cpp`, so no dialog upstream states the row
 * itself.
 *
 * Here, eighty-nine dialogs each wrote their own `<div className="ze-modal-footer">`
 * with two hand-made buttons, and they had already drifted: some gave the
 * buttons `className="ze-btn"` and some nothing, some set `type="button"` and
 * some left it to default to `submit`. That is the whole reason wx has a sizer
 * for this.
 *
 * ## Order is the platform's, not the call site's
 *
 * `Realize()` is where wx applies the platform convention, and the two disagree:
 * GTK follows the GNOME HIG and puts the affirmative button **last**
 * (Cancel, then OK), Windows puts it first. Our parity target is the GTK build
 * on this machine, so Cancel comes first — and it is settled here once rather
 * than at each call site, which is exactly what stopped the 89 copies agreeing.
 *
 * The OK button is the dialog's default: `SetAffirmativeButton` is what makes
 * Enter activate it.
 */
export interface StdDialogButtonSizerProps {
  /**
   * `wxID_CANCEL`'s handler. Absent, no Cancel button: wx's sizer draws only the buttons the
   * base `AddButton`s (DIALOG_FOOTPRINT_ASSOCIATIONS has wxID_OK alone).
   */
  onCancel?: () => void;
  /**
   * `wxID_OK`'s handler — the affirmative, and the dialog's default button. Absent, no OK: a
   * sizer the base gave wxID_CANCEL alone (DIALOG_BOARD_STATISTICS' Close).
   */
  onOk?: () => void;
  /**
   * Stock label overrides. wx takes these from the stock ids (`wxID_OK` → "OK",
   * `wxID_CANCEL` → "Cancel"); a dialog that renames one does it deliberately,
   * as `DIALOG_SHIM`'s `SetOKCancelLabels` callers do.
   */
  okLabel?: string;
  cancelLabel?: string;
  /** `m_sdbSizerOK->Enable( false )`. */
  okDisabled?: boolean;
  /** A tooltip on Cancel — `SetToolTip` on the stock button. */
  cancelTitle?: string;
  /**
   * A `wxID_APPLY` button. `wxStdDialogButtonSizer::Realize` on GTK puts it
   * between Cancel and the affirmative button: Cancel, Apply, OK.
   */
  onApply?: () => void;
  applyLabel?: string;
  /**
   * Anything the dialog puts at the *left* of the row — a Help button, a
   * "Reset to Defaults", a status line. `wxStdDialogButtonSizer` grows a
   * stretch spacer between those and the affirmative pair.
   */
  children?: ReactNode;
}

export function StdDialogButtonSizer({
  onCancel,
  onOk,
  okLabel = 'OK',
  cancelLabel = 'Cancel',
  okDisabled,
  cancelTitle,
  onApply,
  applyLabel = 'Apply',
  children,
}: StdDialogButtonSizerProps): JSX.Element {
  return (
    <div className="ze-modal-footer">
      {children}
      {children ? <span className="ze-sdb-spacer" /> : null}
      {onCancel ? <Button label={cancelLabel} title={cancelTitle} onClick={onCancel} /> : null}
      {onApply ? <Button label={applyLabel} onClick={onApply} /> : null}
      {onOk ? <Button label={okLabel} isDefault disabled={okDisabled} onClick={onOk} /> : null}
    </div>
  );
}
