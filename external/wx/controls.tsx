// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from wxWidgets (wxWindows Library Licence).
/**
 * The wx core controls every dialog's `_base` is built from - wxButton, wxCheckBox,
 * wxRadioButton, wxTextCtrl, wxStaticBox, wxStaticLine, wxHyperlinkCtrl - with wxChoice and
 * wxComboBox re-exported from `combobox.tsx`. ONE file for wx's core controls, by decision
 * (10-10): wx is outside KiCad's tree, so splitting it per wx header buys no KiCad match.
 */
import type { JSX, MouseEvent, ReactNode, Ref } from 'react';

/** wxChoice and wxComboBox, part of the wx layer like the controls below. */
import { Combo } from './combobox.js';

export { Combo, TextCombo } from './combobox.js';

export function Button({
  label,
  onClick,
  isDefault,
  disabled,
  title,
  className,
  buttonRef,
}: {
  label: string;
  /** wxEVT_BUTTON; the event's target is GetEventObject(), e.g. to anchor a popup at it. */
  onClick?: (aEvent: MouseEvent<HTMLButtonElement>) => void;
  isDefault?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
  /** The button element, e.g. as a dialog's initialFocus. */
  buttonRef?: Ref<HTMLButtonElement>;
}): JSX.Element {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`ze-btn${isDefault ? ' primary' : ''}${className ? ` ${className}` : ''}`}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/**
 * `wxCheckBox` in a dialog. The indicator is the shared checkbox rule and the row is
 * `.ze-check` (a GtkCheckButton's height and indicator spacing); `className` carries the
 * caller's sizer position and border only. The Preferences panels' bordered variant is
 * {@link Check}.
 */
export function CheckBox({
  label,
  checked,
  onChange,
  check,
  disabled,
  title,
  className,
}: {
  label: string;
  checked?: boolean;
  onChange?: (aChecked: boolean) => void;
  /** The `_base` member instead of `checked` / `onChange` / `disabled`. */
  check?: CHECK;
  disabled?: boolean;
  title?: string;
  className?: string;
}): JSX.Element {
  const value = check ? check.value : (checked ?? false);
  const off = check ? check.enabled === false : disabled;
  const change = check ? check.onChange : onChange;

  return (
    <label className={`ze-check${className ? ` ${className}` : ''}`} title={title}>
      <input
        type="checkbox"
        checked={value}
        disabled={off}
        onChange={(e) => change?.(e.target.checked)}
      />
      {label}
    </label>
  );
}

/**
 * `wxChoice` bound to its `_base` member: the base's strings, the selection (-1 is wxNOT_FOUND,
 * an empty face) and the enable. `ariaLabel` is the label beside it.
 */
export function Choice({
  choices,
  choice,
  ariaLabel,
  title,
}: {
  choices: readonly string[];
  choice: CHOICE;
  ariaLabel: string;
  title?: string;
}): JSX.Element {
  return (
    <span title={title}>
      <Combo
        value={choice.value < 0 ? '' : String(choice.value)}
        options={choices.map((label, i) => ({ value: String(i), label }))}
        onChange={(v) => choice.onChange(Number(v))}
        disabled={choice.enabled === false}
        ariaLabel={ariaLabel}
      />
    </span>
  );
}

/**
 * `wxRadioButton`. The indicator is the shared drawn radio (`.ze-app input[type="radio"]`,
 * measured off a live pcb_calculator) and the row is `.ze-check`, a GtkRadioButton being the
 * same row as a GtkCheckButton. Buttons sharing `name` are one group (wxRB_GROUP).
 */
export function RadioButton({
  label,
  checked,
  onChange,
  name,
  disabled,
  title,
  className,
}: {
  label: string;
  checked: boolean;
  /** Selecting it; a radio button is never unselected by its own click. */
  onChange: () => void;
  name?: string;
  disabled?: boolean;
  title?: string;
  className?: string;
}): JSX.Element {
  return (
    <label className={`ze-check${className ? ` ${className}` : ''}`} title={title}>
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.checked) onChange();
        }}
      />
      {label}
    </label>
  );
}

/**
 * `wxTextCtrl`. Its fill, border, radius, padding, font and height are the GTK entry's
 * (`.ze-app input`, `--ctl-height`), so a call site states none of them. `onEnter` is
 * `wxTE_PROCESS_ENTER`: the entry takes Enter itself; without it Enter goes on to the dialog's
 * default button. `multiLine` is wxTE_MULTILINE. `readOnly` is SetEditable( false ), which keeps
 * ordinary text; `disabled` is Enable( false ), which dims it.
 */
export function TextCtrl({
  value,
  onChange,
  onEnter,
  onBlur,
  multiLine,
  readOnly,
  disabled,
  title,
  hint,
  className,
  inputRef,
  textAreaRef,
  id,
  ariaLabel,
  autoFocus,
}: {
  value: string;
  onChange?: (aValue: string) => void;
  onEnter?: () => void;
  /** wxEVT_KILL_FOCUS. */
  onBlur?: () => void;
  multiLine?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  title?: string;
  /** `wxTextEntry::SetHint`: the grey text an empty entry shows. */
  hint?: string;
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
  textAreaRef?: Ref<HTMLTextAreaElement>;
  id?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}): JSX.Element {
  const common = {
    id,
    value,
    readOnly,
    disabled,
    title,
    className,
    placeholder: hint,
    autoFocus,
    // A GtkEntry does not spell-check.
    spellCheck: false,
    'aria-label': ariaLabel,
    onBlur,
    onChange: (e: { target: { value: string } }) => onChange?.(e.target.value),
  };
  if (multiLine) return <textarea ref={textAreaRef} {...common} />;
  return (
    <input
      ref={inputRef}
      type="text"
      {...common}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
    />
  );
}

/**
 * `wxStaticBoxSizer`'s box: `fieldset.ze-sbox` (staticbox_inset_probe: the label line on top, a
 * 1 px frame in --ctl-border, the children flush inside). `className` is the sizer inside it.
 */
export function StaticBox({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <fieldset className={`ze-sbox${className ? ` ${className}` : ''}`}>
      <legend>{label}</legend>
      {children}
    </fieldset>
  );
}

/**
 * `wxStaticText`: a label. `Enable( false )` greys it as GTK's `label:disabled`; `Wrap( n )` breaks
 * it at n pixels, otherwise it never wraps.
 */
export function StaticText({
  label,
  disabled,
  wrap,
  title,
  font,
  italic,
}: {
  label: string;
  disabled?: boolean;
  /** `Wrap( width )`, in pixels; -1 or absent never wraps. */
  wrap?: number;
  title?: string;
  /** `SetFont( KIUI::GetInfoFont( this ) )` or `KIUI::GetSmallInfoFont( this )`. */
  font?: 'info' | 'smallInfo';
  /** `.Italic()` on the font. */
  italic?: boolean;
}): JSX.Element {
  return (
    <span
      className={`ze-statictext${disabled ? ' disabled' : ''}${wrap && wrap > 0 ? ' wrapped' : ''}${font === 'info' ? ' info' : font === 'smallInfo' ? ' small-info' : ''}${italic ? ' italic' : ''}`}
      style={wrap && wrap > 0 ? { maxWidth: wrap } : undefined}
      title={title}
    >
      {label}
    </span>
  );
}

/**
 * `wxStaticBitmap`: an image. `bitmap` is the bundle `SetBitmap()` was given - a URL here, which
 * is what `KiBitmapBundle()` answers - or null for `wxNullBitmap`, which draws nothing but keeps
 * the stated `size`. `Enable( false )` draws it as GTK's insensitive image.
 */
export function StaticBitmap({
  bitmap,
  size,
  disabled,
}: {
  bitmap: string | null | undefined;
  /** The constructor's `wxSize( w, h )` / `SetMinSize`; absent, the bitmap's own. */
  size?: readonly [number, number];
  disabled?: boolean;
}): JSX.Element {
  const style = size ? { width: size[0], height: size[1] } : undefined;

  if (!bitmap) return <span className="ze-staticbitmap" style={style} />;

  return (
    <img
      className={`ze-staticbitmap${disabled ? ' disabled' : ''}`}
      src={bitmap}
      alt=""
      style={style}
    />
  );
}

/** `wxGauge( …, range, …, wxGA_HORIZONTAL )`: the GtkProgressBar the shell styles as `.ze-gauge`. */
export function Gauge({ value, range }: { value: number; range: number }): JSX.Element {
  return <progress className="ze-gauge" max={range} value={value} />;
}

/**
 * `wxListCtrl( …, wxLC_REPORT | wxLC_NO_HEADER )`: rows of columns at the widths
 * `InsertColumn` / `SetColumnWidth` gave them. `onRightClick` is wxEVT_LIST_ITEM_RIGHT_CLICK.
 */
export function ListCtrl({
  rows,
  columnWidths,
  onRightClick,
  ariaLabel,
}: {
  rows: readonly (readonly string[])[];
  columnWidths: readonly number[];
  onRightClick?: (aRow: number, aEvent: MouseEvent) => void;
  ariaLabel?: string;
}): JSX.Element {
  const columns = { gridTemplateColumns: columnWidths.map((w) => `${w}px`).join(' ') };

  return (
    <div className="ze-listctrl" role="list" aria-label={ariaLabel}>
      {rows.map((row, i) => (
        // A row is its index, as wxListCtrl items are.
        // biome-ignore lint/suspicious/noArrayIndexKey: InsertItem order is the row's identity
        <div
          key={i}
          role="listitem"
          className="ze-listctrl-row"
          style={columns}
          onContextMenu={(e) => {
            if (!onRightClick) return;
            e.preventDefault();
            onRightClick(i, e);
          }}
        >
          {row.map((cell, c) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the column index is the cell's identity
            <span key={c}>{cell}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * A dialog's own `wxStatusBar` with `SetFieldsCount( n )` and `SetStatusWidths`: a width of -1
 * takes the rest, as wx's variable fields do.
 */
export function StatusBar({
  widths,
  texts,
}: {
  widths: readonly number[];
  texts: readonly string[];
}): JSX.Element {
  return (
    <div className="ze-wxstatusbar">
      {widths.map((w, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: SetFieldsCount order is the field's identity
        <span key={i} style={w < 0 ? { flex: -w } : { width: w, flex: '0 0 auto' }}>
          {texts[i] ?? ''}
        </span>
      ))}
    </div>
  );
}

/** `wxStaticLine`: a GtkSeparator, horizontal unless `vertical` (wxLI_VERTICAL). */
export function StaticLine({
  vertical,
  className,
}: {
  vertical?: boolean;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={`ze-staticline${vertical ? ' vertical' : ''}${className ? ` ${className}` : ''}`}
    />
  );
}

/**
 * `wxPanel`: a child window that holds its own sizer. `border="simple"` is `wxBORDER_SIMPLE`, the
 * one-pixel frame wxFormBuilder puts around a COLOR_SWATCH (`m_panelBorderColor`), which the
 * swatch itself does not draw.
 */
export function Panel({
  border,
  title,
  children,
}: {
  border?: 'simple';
  /** `SetToolTip()`. */
  title?: string;
  children?: ReactNode;
}): JSX.Element {
  return (
    <div className={`ze-panel${border === 'simple' ? ' border-simple' : ''}`} title={title}>
      {children}
    </div>
  );
}

/** `wxHyperlinkCtrl`: a GtkLinkButton in the theme's link colour, on the dialog's own font. */
export function HyperlinkCtrl({
  label,
  onClick,
  disabled,
  title,
  className,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`ze-hyperlink${className ? ` ${className}` : ''}`}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/**
 * A wxCheckBox member as a `_base` takes it: its value, the enable its onUpdateUI handler (or
 * `Enable()`) gives it, and the change.
 */
export interface CHECK {
  value: boolean;
  enabled?: boolean;
  onChange: (aOn: boolean) => void;
}

/** A wxChoice member as a `_base` takes it: its selection, enable, and change. */
export interface CHOICE {
  value: number;
  enabled?: boolean;
  onChange: (aIndex: number) => void;
}
