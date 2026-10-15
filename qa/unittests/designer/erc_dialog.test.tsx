// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The Electrical Rules Checker dialog: `DIALOG_ERC` on a live SCH_EDIT_FRAME, rendered through
 * `dialog_erc_base.tsx`, against dialog_erc.cpp and the `dialog_erc_base.cpp` it derives from.
 *
 * Each assertion is one structural fact with one line of C++ behind it. The control-set
 * assertions are EQUALITIES over what the dialog renders, so an extra control fails too.
 *
 * What a side-by-side against KiCad and the manual's own capture (kicad-docs
 * images/en/dialog_erc.png) turned up, and what is therefore pinned here:
 *
 *   1. the All box forces Errors on whichever way it moves (dialog_erc.cpp:1118-1129);
 *   2. Delete Marker and Delete All Markers are live with no selection and no markers - DIALOG_ERC
 *      disables them only during a run;
 *   3. the exclusions badge is hidden at zero, and counts cap at "999+";
 *   4. a marker shows up to four item rows, its exclusion comment after them;
 *   5. the config button carries BITMAPS::config and its menu is the three checks.
 */
import { resolve } from 'node:path';
import { bitmapUrl } from '@ziroeda/common/bitmap_store.js';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { RPT_SEVERITY_IGNORE, RPT_SEVERITY_WARNING } from '@ziroeda/common/reporter.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import {
  DIALOG_ERC,
  type DIALOG_ERC_WINDOW,
  DialogErc,
  ERC_BADGE_MAX,
  ercBadge,
} from '@ziroeda/eeschema/dialogs/dialog_erc.js';
import { ERC_ITEM } from '@ziroeda/eeschema/erc/erc_item.js';
import { ERCE_T } from '@ziroeda/eeschema/erc/erc_settings.js';
import { SCH_MARKER } from '@ziroeda/eeschema/sch_marker.js';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openProject, schFrame } from '../eeschema/support/sch_tool_harness.js';

const DIR = resolve(__dirname, '../../data/eeschema/erc_cases/quirks');

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => {
  cleanup();
  SetPgm(null);
});

function open(aWindow: Partial<DIALOG_ERC_WINDOW> = {}) {
  const frame = schFrame();
  openProject(frame, DIR, 'quirks', ['quirks.kicad_sch', 'quirks.kicad_pro']);
  const window: DIALOG_ERC_WINDOW = {
    textEntry: async () => null,
    askDeleteExclusions: async () => 'yes',
    saveReport: async () => null,
    displayError: () => {},
    blockUntilLoaded: async () => {},
    show: () => {},
    raise: () => {},
    isShownOnScreen: () => true,
    destroy: () => {},
    projectModified: () => {},
    ercDialogSettings: () => ({
      crossprobe: true,
      scroll_on_crossprobe: true,
      show_all_errors: false,
    }),
    saveErcDialogSettings: () => {},
    ...aWindow,
  };
  const dialog = new DIALOG_ERC(frame, window);
  render(<DialogErc dialog={dialog} />);
  const run = () =>
    act(async () => {
      await dialog.OnRunERCClick();
    });
  return { frame, dialog, run };
}

/** The "Show:" row's four checkboxes, in the order bSeveritySizer adds them. */
const severityRow = (): { label: string; checked: boolean }[] =>
  Array.from(document.querySelectorAll('label.ze-check')).map((l) => ({
    label: l.textContent ?? '',
    checked: (l.querySelector('input') as HTMLInputElement | null)?.checked ?? false,
  }));

const checkbox = (i: number) => document.querySelectorAll('label.ze-check input')[i]!;

const buttonRow = (): { label: string; disabled: boolean }[] =>
  // m_buttonsSizer: the sizer row Delete Marker sits in.
  Array.from(
    screen.getByText('Delete Marker').closest('.ze-sizer')?.querySelectorAll('button') ?? [],
  ).map((b) => ({
    label: b.textContent ?? '',
    disabled: (b as HTMLButtonElement).disabled,
  }));

const badges = (): { text: string; kind: string }[] =>
  Array.from(document.querySelectorAll('.ze-badge')).map((b) => ({
    text: b.textContent ?? '',
    kind: Array.from(b.classList)
      .filter((c) => c !== 'ze-badge')
      .join(' '),
  }));

const rows = (): string[] =>
  Array.from(document.querySelectorAll('.ze-erc-row .msg')).map((m) => m.textContent ?? '');

describe('DIALOG_ERC: the Show: severity row', () => {
  /** dialog_erc_base.cpp builds exactly m_showLabel, m_showAll .. m_showExclusions, m_saveReport. */
  it('is Show: All Errors Warnings Exclusions and nothing else', () => {
    open();
    expect(screen.getByText('Show:').textContent).toBe('Show:');
    expect(severityRow().map((c) => c.label)).toStrictEqual([
      'All',
      'Errors',
      'Warnings',
      'Exclusions',
    ]);
    expect(screen.getByText('Save...')).toBeTruthy();
  });

  /**
   * The generated base leaves all four unchecked, which opens the dialog showing nothing; the
   * manual settles it: errors and warnings are reported, and "Excluded violations are hidden
   * unless the Exclusions checkbox is enabled".
   */
  it('opens with Errors and Warnings on, Exclusions and All off', () => {
    open();
    expect(severityRow()).toStrictEqual([
      { label: 'All', checked: false },
      { label: 'Errors', checked: true },
      { label: 'Warnings', checked: true },
      { label: 'Exclusions', checked: false },
    ]);
  });

  /** DIALOG_ERC::OnSeverity: m_showErrors->SetValue( true ) whichever way All moves. */
  it('All forces Errors on in both directions', () => {
    open();
    fireEvent.click(checkbox(0));
    expect(severityRow()).toStrictEqual([
      { label: 'All', checked: true },
      { label: 'Errors', checked: true },
      { label: 'Warnings', checked: true },
      { label: 'Exclusions', checked: true },
    ]);

    fireEvent.click(checkbox(0));
    expect(severityRow()).toStrictEqual([
      { label: 'All', checked: false },
      { label: 'Errors', checked: true },
      { label: 'Warnings', checked: false },
      { label: 'Exclusions', checked: false },
    ]);
  });

  /** m_showAll is never written from the other three. */
  it('All is not driven by the other three', () => {
    open();
    fireEvent.click(checkbox(3));
    expect(severityRow()[0]).toStrictEqual({ label: 'All', checked: false });
  });

  /**
   * getSeverities() feeds SHEETLIST_ERC_ITEMS_PROVIDER::SetSeverities, which files an excluded
   * marker under EXCLUSION rather than its own severity.
   */
  it('filters the tree by severity, and an excluded marker only under Exclusions', async () => {
    // No cross-probe: the headless frame has no canvas for FocusOnItem to scroll.
    const { dialog, run } = open({
      ercDialogSettings: () => ({
        crossprobe: false,
        scroll_on_crossprobe: false,
        show_all_errors: false,
      }),
    });
    await run();
    const all = rows();
    expect(all.some((r) => r.startsWith('Error: '))).toBe(true);
    expect(all.some((r) => r.startsWith('Warning: '))).toBe(true);

    act(() => {
      fireEvent.click(checkbox(2)); // Warnings off
    });
    expect(rows().every((r) => r.startsWith('Error: '))).toBe(true);

    const first = rows()[0]!;
    const count = (aRow: string) => rows().filter((r) => r === aRow).length;
    const before = count(first);
    act(() => {
      dialog.m_markerDataView.Select(dialog.m_markerTreeModel.GetTree()[0]!);
      dialog.ExcludeMarker();
    });
    expect(count(first)).toBe(before - 1);

    act(() => {
      fireEvent.click(checkbox(3)); // Exclusions on
    });
    expect(rows()).toContain(`Excluded error: ${first.slice('Error: '.length)}`);
  });
});

describe('DIALOG_ERC::ExcludeMarker', () => {
  /** `if( !marker || marker->IsExcluded() ) return;` - excluding twice keeps the comment. */
  it('leaves an already excluded marker, and its comment, alone', async () => {
    const { dialog, run } = open({
      ercDialogSettings: () => ({
        crossprobe: false,
        scroll_on_crossprobe: false,
        show_all_errors: false,
      }),
    });
    await run();
    const marker = dialog.m_markerTreeModel.GetTree()[0]!.m_RcItem!.GetParent() as SCH_MARKER;
    act(() => dialog.m_markerProvider.SetMarkerExcluded(marker, true, 'reviewed'));
    act(() => dialog.ExcludeMarker(marker));
    expect(marker.GetComment()).toBe('reviewed');
  });
});

describe('DIALOG_ERC: NUMBER_BADGE', () => {
  /** NUMBER_BADGE::UpdateNumber: zero is green for an error or warning, invisible otherwise. */
  it('UpdateNumber hides a negative, and hides a zero exclusion count', () => {
    expect(ercBadge(-1, 'error')).toBeNull();
    expect(ercBadge(-1, 'warning')).toBeNull();
    expect(ercBadge(0, 'exclusion')).toBeNull();
    expect(ercBadge(0, 'error')).toStrictEqual({ text: '0', kind: 'zero' });
    expect(ercBadge(0, 'warning')).toStrictEqual({ text: '0', kind: 'zero' });
    expect(ercBadge(3, 'exclusion')).toStrictEqual({ text: '3', kind: 'excl' });
  });

  /** SetMaximumNumber( 999 ) + number_badge.cpp:177-180. */
  it('caps at the maximum with a trailing +', () => {
    expect(ERC_BADGE_MAX).toBe(999);
    expect(ercBadge(999, 'error')).toStrictEqual({ text: '999', kind: 'err' });
    expect(ercBadge(1000, 'error')).toStrictEqual({ text: '999+', kind: 'err' });
    expect(ercBadge(1000, 'warning')).toStrictEqual({ text: '999+', kind: 'warn' });
  });

  /** updateDisplayedCounts passes -1 for errors and warnings only while !m_ercRun. */
  it('draws nothing before ERC has been run', () => {
    open();
    expect(badges()).toStrictEqual([]);
  });

  /**
   * GetCount( aSeverity ) totals every marker of that severity whatever the filter shows, while
   * the tab counts the filtered list: the two disagree on purpose.
   */
  it('badges count every marker while the tab counts the shown ones', async () => {
    const { dialog, run } = open();
    await run();
    const errors = dialog.m_markerProvider.GetCount(0x20);
    const warnings = dialog.m_markerProvider.GetCount(0x10);
    act(() => {
      fireEvent.click(checkbox(2)); // Warnings off
    });
    expect(badges()).toStrictEqual([
      { text: `${errors}`, kind: 'err' },
      { text: `${warnings}`, kind: 'warn' },
    ]);
    expect(screen.getByText(`Violations (${errors})`)).toBeTruthy();
  });
});

describe('DIALOG_ERC: the button row', () => {
  /** SetupStandardButtons relabels wxID_OK / wxID_CANCEL; GTK orders Cancel then OK. */
  it('is Delete Marker / Delete All Markers / Close / Run ERC', () => {
    open();
    expect(buttonRow().map((b) => b.label)).toStrictEqual([
      'Delete Marker',
      'Delete All Markers',
      'Close',
      'Run ERC',
    ]);
  });

  /** DIALOG_ERC touches Enable() only inside OnRunERCClick. */
  it('leaves both delete buttons live with no selection and no markers', () => {
    open();
    expect(buttonRow()).toStrictEqual([
      { label: 'Delete Marker', disabled: false },
      { label: 'Delete All Markers', disabled: false },
      { label: 'Close', disabled: false },
      { label: 'Run ERC', disabled: false },
    ]);
  });

  /** m_sdbSizer1Cancel->SetLabel( _( "Cancel" ) ) and the rest disabled while a run is in flight. */
  it('disables all but Cancel during a run, and shows the running page', async () => {
    let release: () => void = () => {};
    const { dialog } = open({
      blockUntilLoaded: () => new Promise<void>((r) => (release = r)),
    });
    const done = dialog.OnRunERCClick();
    try {
      await act(async () => {});
      expect(buttonRow()).toStrictEqual([
        { label: 'Delete Marker', disabled: true },
        { label: 'Delete All Markers', disabled: true },
        { label: 'Cancel', disabled: false },
        { label: 'Run ERC', disabled: true },
      ]);
      expect(screen.getByText('Save...').hasAttribute('disabled')).toBe(true);
    } finally {
      release();
      await act(async () => {
        await done;
      });
    }
    expect(buttonRow().map((b) => b.label)).toStrictEqual([
      'Delete Marker',
      'Delete All Markers',
      'Close',
      'Run ERC',
    ]);
  });
});

describe('DIALOG_ERC: the marker tree', () => {
  /**
   * RC_TREE_MODEL::rebuildModel: one child per non-null item id - MAIN_ITEM, AUX_ITEM, AUX_ITEM2,
   * AUX_ITEM3 - and the COMMENT node pushed AFTER them.
   */
  it('gives a marker four item rows and puts the comment last', () => {
    const { frame, dialog } = open();
    const screenItems = [...frame.GetScreen()!.Items()].filter(
      (i) => i.Type() === KICAD_T.SCH_LINE_T,
    );
    const ercItem = ERC_ITEM.Create(ERCE_T.ERCE_WIRE_DANGLING)!;
    ercItem.SetItems(
      screenItems[0]!.m_Uuid,
      screenItems[1]!.m_Uuid,
      screenItems[2]!.m_Uuid,
      screenItems[3]!.m_Uuid,
    );
    const marker = new SCH_MARKER(ercItem, { x: 0, y: 0 });
    marker.SetExcluded(true, 'reviewed');
    frame.GetScreen()!.Append(marker);
    act(() => {
      fireEvent.click(checkbox(3)); // Exclusions on
    });
    act(() => dialog.UpdateData());

    const item = document.querySelector('.ze-erc-item')!;
    const children = Array.from(item.querySelectorAll('.ze-erc-subrow'));
    expect(children.length).toBe(5);
    expect(children[4]!.textContent).toBe('reviewed');
  });

  /** GetValue builds the row as text: "Error: " / "Warning: " ahead of the message; no glyph. */
  it('prefixes the heading with its severity as text and draws no icon', async () => {
    const { run } = open();
    await run();
    expect(rows().every((r) => /^(Error|Warning): /.test(r))).toBe(true);
    expect(document.querySelectorAll('.ze-erc-row img').length).toBe(0);
  });

  /** updateDisplayedCounts strips "(%s)" from both titles until m_ercRun. */
  it('is a two-page notebook whose counts appear only after a run', async () => {
    const tabs = (): string[] =>
      Array.from(
        screen.getByRole('tab', { name: /^Violations/ }).closest('[role=tablist]')!.children,
      ).map((t) => t.textContent ?? '');
    const { dialog, run } = open();
    expect(tabs()).toStrictEqual(['Violations', 'Ignored Tests']);
    await run();
    expect(tabs()).toStrictEqual([
      `Violations (${dialog.m_markerProvider.GetCount()})`,
      'Ignored Tests (' + dialog.m_ignoredList.length + ')',
    ]);
  });

  /** Each ignored row is wxT( " • " ) + GetErrorText(); the page offers "Edit ignored tests". */
  it('bullets each ignored test and offers Edit ignored tests', async () => {
    const { frame, run } = open();
    frame.Schematic().ErcSettings().SetSeverity(ERCE_T.ERCE_PIN_NOT_CONNECTED, RPT_SEVERITY_IGNORE);
    await run();
    const ignored = screen.getByRole('tab', { name: /^Ignored Tests/ });
    act(() => {
      fireEvent.click(ignored);
    });
    expect(screen.getByText('• Pin not connected')).toBeTruthy();
    expect(screen.getByText('Edit ignored tests')).toBeTruthy();
  });

  /**
   * OnIgnoredItemRClick: a radio Error / Warning / Ignore menu checked at the code's severity;
   * a different choice goes into ERC_SETTINGS and modifies the project, the same one does not.
   */
  it('right-clicking an ignored test offers its severity and sets it', async () => {
    let modified = 0;
    const { frame, dialog, run } = open({ projectModified: () => modified++ });
    const settings = frame.Schematic().ErcSettings();
    // Pin not connected heads allItemTypes, so the row clicked (Pin not driven) is the second.
    settings.SetSeverity(ERCE_T.ERCE_PIN_NOT_CONNECTED, RPT_SEVERITY_IGNORE);
    settings.SetSeverity(ERCE_T.ERCE_PIN_NOT_DRIVEN, RPT_SEVERITY_IGNORE);
    await run();
    expect(dialog.m_ignoredList.slice(0, 2).map((r) => r.code)).toStrictEqual([
      ERCE_T.ERCE_PIN_NOT_CONNECTED,
      ERCE_T.ERCE_PIN_NOT_DRIVEN,
    ]);
    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: /^Ignored Tests/ }));
    });
    const menu = () =>
      Array.from(document.querySelectorAll('.ze-mitem')).map(
        (m) => `${m.querySelector('.mcheck') ? '✓' : ' '}${m.querySelector('.lbl')!.textContent}`,
      );
    const pick = (aLabel: string) =>
      act(() => {
        const item = Array.from(document.querySelectorAll('.ze-mitem')).find(
          (m) => m.querySelector('.lbl')!.textContent === aLabel,
        )!;
        fireEvent.click(item);
      });
    fireEvent.contextMenu(screen.getByText('• Input pin not driven by any Output pins'));
    expect(menu()).toStrictEqual([' Error', ' Warning', '✓Ignore']);
    pick('Ignore');
    expect(modified).toBe(0);
    fireEvent.contextMenu(screen.getByText('• Input pin not driven by any Output pins'));
    pick('Warning');
    expect(settings.GetSeverity(ERCE_T.ERCE_PIN_NOT_DRIVEN)).toBe(RPT_SEVERITY_WARNING);
    expect(modified).toBe(1);
    fireEvent.contextMenu(screen.getByText('• Input pin not driven by any Output pins'));
    expect(menu()).toStrictEqual([' Error', '✓Warning', ' Ignore']);
  });
});

describe('DIALOG_ERC: chrome', () => {
  /** m_bMenu->SetBitmap( KiBitmapBundle( BITMAPS::config ) ). */
  it('puts KiCad config bitmap on the options button', () => {
    open();
    const img = screen.getByLabelText('Options').querySelector('img');
    expect(img?.getAttribute('src')).toBe(bitmapUrl('config'));
  });

  /** The gear opens a three-item wxMenu, all wxITEM_CHECK. */
  it('offers exactly the three config toggles', () => {
    open();
    fireEvent.click(screen.getByLabelText('Options'));
    expect(
      Array.from(document.querySelectorAll('.ze-mitem .lbl')).map((m) => m.textContent),
    ).toStrictEqual(['Cross-probe Selected Items', 'Center on Cross-probe', 'Show all errors']);
  });

  /** wxDEFAULT_DIALOG_STYLE|wxRESIZE_BORDER: DialogShim's eight resize grips. */
  it('carries the wxRESIZE_BORDER as resize grips', () => {
    open();
    expect(document.querySelectorAll('.ze-shim-grip').length).toBe(8);
  });

  /** The report the dialog writes is ERC_REPORT's, text or JSON by the chosen extension. */
  it('saves the ERC_REPORT text or JSON by extension', async () => {
    const written: string[] = [];
    const { run, dialog } = open({
      saveReport: async (_name, aWrite) => {
        written.push(aWrite('ERC.rpt')!, aWrite('ERC.json')!);
        return 'ERC.rpt';
      },
    });
    await run();
    await act(async () => {
      await dialog.OnSaveReport();
    });
    expect(written[0]).toMatch(/^ERC report \(/);
    expect(JSON.parse(written[1]!).$schema).toBe('https://schemas.kicad.org/erc.v1.json');
    expect(dialog.m_messages.at(-1)).toBe("Report file 'ERC.rpt' created.");
  });
});
