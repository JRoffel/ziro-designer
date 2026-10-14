// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `DIALOG_FOOTPRINT_CHECKER` (pcbnew/dialogs/dialog_footprint_checker.cpp), the footprint
 * editor's modeless checker on DIALOG_FOOTPRINT_CHECKER_BASE: Run Checks puts a PCB_MARKER on the
 * board for each problem the footprint's own checks report (courtyards, attributes, pads, shorting
 * pads, net ties, clipped silk), and the markers tree selects, focuses and deletes them.
 */
import { type JSX, useEffect, useReducer, useState } from 'react';
import { MALFORMED_B_COURTYARD, MALFORMED_F_COURTYARD } from '@ziroeda/common/eda_item_flags.js';
import { PCB_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { LSET } from '@ziroeda/common/lset.js';
import { MARKER_T } from '@ziroeda/common/marker_base.js';
import { RC_TREE_MODEL, type RC_TREE_NODE, RC_TREE_VIEW_STATE } from '@ziroeda/common/rc_item.js';
import {
  RPT_SEVERITY_ERROR,
  RPT_SEVERITY_EXCLUSION,
  RPT_SEVERITY_WARNING,
} from '@ziroeda/common/reporter.js';
import { ACTIONS } from '@ziroeda/common/tool/actions.js';
import type { VECTOR2I } from '@ziroeda/kimath/src/math/vector2.js';
import type { BOARD_ITEM } from '../board_item.js';
import { DRC_ITEM, DRC_ITEMS_PROVIDER, PCB_DRC_CODE } from '../drc/drc_item.js';
import type { FOOTPRINT } from '../footprint.js';
import type { FOOTPRINT_EDIT_FRAME } from '../footprint_edit_frame.js';
import { PCB_MARKER } from '../pcb_marker.js';
import { DIALOG_FOOTPRINT_CHECKER_BASE } from './dialog_footprint_checker_base.js';

/** `g_lastFootprint` / `g_lastChecksRun`: a reopened checker on the same footprint remembers. */
let g_lastFootprint: FOOTPRINT | null = null;
let g_lastChecksRun = false;

export class DIALOG_FOOTPRINT_CHECKER {
  readonly m_frame: FOOTPRINT_EDIT_FRAME;
  m_checksRun = false;
  readonly m_markersDataView = new RC_TREE_VIEW_STATE();
  readonly m_markersProvider: DRC_ITEMS_PROVIDER;
  readonly m_markersTreeModel: RC_TREE_MODEL;
  m_showErrors = true;
  m_showWarnings = true;
  m_showExclusions = false;
  m_showAll = false;
  /** The window's repaint. */
  onChange: () => void = () => {};

  constructor(aParent: FOOTPRINT_EDIT_FRAME) {
    this.m_frame = aParent;
    this.m_markersProvider = new DRC_ITEMS_PROVIDER(aParent.GetBoard()!, MARKER_T.MARKER_DRC);
    this.m_markersTreeModel = new RC_TREE_MODEL(aParent, this.m_markersDataView);
    this.m_markersDataView.onSelectionChanged = (aNode) => this.OnSelectItem(aNode);

    if (aParent.GetBoard()!.GetFirstFootprint() === g_lastFootprint)
      this.m_checksRun = g_lastChecksRun;
  }

  /** The destructor. */
  Destroy(): void {
    this.m_frame.ClearFocus();
    g_lastFootprint = this.m_frame.GetBoard()!.GetFirstFootprint();
    g_lastChecksRun = this.m_checksRun;
  }

  getSeverities(): number {
    let severities = 0;
    if (this.m_showErrors) severities |= RPT_SEVERITY_ERROR;
    if (this.m_showWarnings) severities |= RPT_SEVERITY_WARNING;
    if (this.m_showExclusions) severities |= RPT_SEVERITY_EXCLUSION;
    return severities;
  }

  updateData(): void {
    this.m_markersTreeModel.Update(this.m_markersProvider, this.getSeverities());
    this.onChange();
  }

  TransferDataToWindow(): boolean {
    this.updateData();
    return true;
  }

  runChecks(): void {
    const board = this.m_frame.GetBoard()!;
    const footprint = board.GetFirstFootprint();

    this.deleteAllMarkers();

    if (!footprint) return;

    const errorHandler = (
      aItemA: BOARD_ITEM | null,
      aItemB: BOARD_ITEM | null,
      aItemC: BOARD_ITEM | null,
      aErrorCode: number,
      aMsg: string,
      aPt: VECTOR2I,
    ): void => {
      const drcItem = DRC_ITEM.Create(aErrorCode)!;
      if (aMsg !== '') drcItem.SetErrorDetail(aMsg);
      drcItem.SetItems(aItemA, aItemB, aItemC);
      const marker = new PCB_MARKER(drcItem, aPt);
      board.Add(marker);
      this.m_frame.GetCanvas()?.GetView()?.Add(marker);
    };

    // OUTLINE_ERROR_HANDLER: with a single item, it is item A.
    footprint.BuildCourtyardCaches((aMsg, aItemA, aItemB, aPt) => {
      let a = aItemA;
      let b = aItemB;
      if (!a) [a, b] = [b, a];
      errorHandler(a, b, null, PCB_DRC_CODE.DRCE_MALFORMED_COURTYARD, aMsg, aPt);
    });

    if (
      !footprint.AllowMissingCourtyard() &&
      footprint.GetCourtyard(PCB_LAYER_ID.F_CrtYd).OutlineCount() === 0 &&
      footprint.GetCourtyard(PCB_LAYER_ID.B_CrtYd).OutlineCount() === 0
    ) {
      errorHandler(footprint, null, null, PCB_DRC_CODE.DRCE_MISSING_COURTYARD, '', { x: 0, y: 0 });
    }

    footprint.CheckFootprintAttributes((aMsg) =>
      errorHandler(footprint, null, null, PCB_DRC_CODE.DRCE_FOOTPRINT_TYPE_MISMATCH, aMsg, {
        x: 0,
        y: 0,
      }),
    );

    footprint.CheckPads(this.m_frame.GetUnitsProvider(), (aPad, aErrorCode, aMsg) =>
      errorHandler(aPad, null, null, aErrorCode, aMsg, aPad.GetPosition()),
    );

    footprint.CheckShortingPads((aPadA, aPadB, aErrorCode, aPosition) =>
      errorHandler(aPadA, aPadB, null, aErrorCode, '', aPosition),
    );

    if (footprint.IsNetTie()) {
      footprint.CheckNetTiePadGroups((aMsg) =>
        errorHandler(footprint, null, null, PCB_DRC_CODE.DRCE_FOOTPRINT, aMsg, { x: 0, y: 0 }),
      );

      footprint.CheckNetTies((aItemA, aItemB, aItemC, aPt) =>
        errorHandler(aItemA, aItemB, aItemC, PCB_DRC_CODE.DRCE_SHORTING_ITEMS, '', aPt),
      );
    }

    footprint.CheckClippedSilk((aItemA, aItemB, aPt) =>
      errorHandler(aItemA, aItemB, null, PCB_DRC_CODE.DRCE_SILK_MASK_CLEARANCE, '', aPt),
    );

    this.m_checksRun = true;
    this.updateData();
    this.refreshEditor();
  }

  /** OnSelectItem: focus the violation's item and show its layer. */
  OnSelectItem(aNode: RC_TREE_NODE | null): void {
    const board = this.m_frame.GetBoard()!;
    const item = aNode ? board.ResolveItem(RC_TREE_MODEL.ToUUID(aNode), true) : null;

    if (!aNode || !item) return;

    let principalLayer: PCB_LAYER_ID = PCB_LAYER_ID.UNDEFINED_LAYER;
    let violationLayers = new LSET();
    const rc_item = aNode.m_RcItem!;

    if (item.GetLayerSet().count() > 0) principalLayer = item.GetLayerSet().Seq()[0]!;

    if (rc_item.GetErrorCode() === PCB_DRC_CODE.DRCE_MALFORMED_COURTYARD) {
      const a = board.ResolveItem(rc_item.GetMainItemID(), true);
      principalLayer =
        a &&
        (a.GetFlags() & MALFORMED_B_COURTYARD) > 0 &&
        (a.GetFlags() & MALFORMED_F_COURTYARD) === 0
          ? PCB_LAYER_ID.B_CrtYd
          : PCB_LAYER_ID.F_CrtYd;
    } else if (rc_item.GetErrorCode() === PCB_DRC_CODE.DRCE_INVALID_OUTLINE) {
      principalLayer = PCB_LAYER_ID.Edge_Cuts;
    } else {
      const items = [
        rc_item.GetMainItemID(),
        rc_item.GetAuxItemID(),
        rc_item.GetAuxItem2ID(),
        rc_item.GetAuxItem3ID(),
      ]
        .map((id) => board.ResolveItem(id, true))
        .filter((x): x is BOARD_ITEM => x !== null);
      if (items.length > 0) violationLayers = LSET.AllLayersMask();
      for (const it of items) violationLayers = violationLayers.and(it.GetLayerSet());
    }

    if (violationLayers.count()) principalLayer = violationLayers.Seq()[0]!;
    else if (principalLayer >= 0) violationLayers.set(principalLayer);

    this.m_frame.FocusOnItem(item);
    this.m_frame.GetCanvas()?.Refresh();

    if (!violationLayers.and(board.GetVisibleLayers()).any()) {
      this.m_frame.GetAppearancePanel()?.SetLayerVisible?.(principalLayer, true);
      this.m_frame.GetCanvas()?.Refresh();
    }

    if (board.GetVisibleLayers().test(principalLayer)) this.m_frame.SetActiveLayer(principalLayer);
  }

  /** OnSeverity: All sets Errors and takes Warnings and Exclusions with it. */
  OnSeverity(aWhich: 'all' | 'errors' | 'warnings' | 'exclusions', aOn: boolean): void {
    if (aWhich === 'all') {
      this.m_showAll = aOn;
      this.m_showErrors = true;
      this.m_showWarnings = aOn;
      this.m_showExclusions = aOn;
    } else if (aWhich === 'errors') this.m_showErrors = aOn;
    else if (aWhich === 'warnings') this.m_showWarnings = aOn;
    else this.m_showExclusions = aOn;
    this.updateData();
  }

  refreshEditor(): void {
    this.m_frame.GetCanvas()?.Refresh();
  }

  OnDeleteOneClick(): void {
    // Clear the selection. It may be the selected DRC marker.
    this.m_frame.GetToolManager()?.RunAction(ACTIONS.selectionClear);
    this.m_markersTreeModel.DeleteCurrentItem(true);
    this.refreshEditor();
    this.onChange();
  }

  OnDeleteAllClick(): void {
    this.deleteAllMarkers();
    this.m_checksRun = false;
    this.refreshEditor();
    this.onChange();
  }

  deleteAllMarkers(): void {
    // Clear current selection list to avoid selection of deleted items.
    this.m_frame.GetToolManager()?.RunAction(ACTIONS.selectionClear);
    this.m_markersTreeModel.DeleteItems(false, true, false);
    this.m_frame.GetBoard()!.DeleteMARKERs(true, true);
  }

  /** updateDisplayedCounts: -1 is "never run", which the badge draws as nothing. */
  counts(): { errors: number; warnings: number; exclusions: number } {
    let errors = this.m_markersProvider.GetCount(RPT_SEVERITY_ERROR);
    let warnings = this.m_markersProvider.GetCount(RPT_SEVERITY_WARNING);
    let exclusions = this.m_markersProvider.GetCount(RPT_SEVERITY_EXCLUSION);
    if (!this.m_checksRun && errors === 0) errors = -1;
    if (!this.m_checksRun && warnings === 0) warnings = -1;
    if (!this.m_checksRun && exclusions === 0) exclusions = -1;
    return { errors, warnings, exclusions };
  }
}

/** The modeless window, which FOOTPRINT_EDITOR_CONTROL::CheckFootprint shows. */
export function DialogFootprintChecker({
  frame,
  onClose,
  onHide,
}: {
  frame: FOOTPRINT_EDIT_FRAME;
  /** OnCancelClick: DestroyCheckerDialog. */
  onClose: () => void;
  /** `Show( false )`: hidden, not destroyed, so the list keeps its cursor. */
  onHide: () => void;
}): JSX.Element {
  const [, repaint] = useReducer((n: number) => n + 1, 0);
  const [d] = useState(() => new DIALOG_FOOTPRINT_CHECKER(frame));

  // biome-ignore lint/correctness/useExhaustiveDependencies: the dialog object is created once; this is its lifetime
  useEffect(() => {
    d.onChange = repaint;
    d.TransferDataToWindow();
    return () => d.Destroy();
  }, []);

  const c = d.counts();
  const check = (aValue: boolean, aWhich: 'all' | 'errors' | 'warnings' | 'exclusions') => ({
    value: aValue,
    onChange: (aOn: boolean) => d.OnSeverity(aWhich, aOn),
  });

  return (
    <DIALOG_FOOTPRINT_CHECKER_BASE
      m_markersDataView={{
        model: d.m_markersTreeModel,
        view: d.m_markersDataView,
        // OnLeftDClickItem: turn control over to the frame and hide this window, no destruction
        // so we can preserve the listbox cursor.
        onDClick: () => {
          if (d.m_markersDataView.GetCurrentItem()) onHide();
        },
        onRClick: () => {},
      }}
      m_showAll={check(d.m_showAll, 'all')}
      m_showErrors={check(d.m_showErrors, 'errors')}
      m_errorsBadge={{ number: c.errors, max: -1 }}
      m_showWarnings={check(d.m_showWarnings, 'warnings')}
      m_warningsBadge={{ number: c.warnings, max: -1 }}
      m_showExclusions={check(d.m_showExclusions, 'exclusions')}
      m_exclusionsBadge={{ number: c.exclusions, max: -1 }}
      onDeleteOneClick={() => d.OnDeleteOneClick()}
      onDeleteAllClick={() => d.OnDeleteAllClick()}
      onRunChecksClick={() => d.runChecks()}
      onCancelClick={() => {
        frame.ClearFocus();
        onClose();
      }}
    />
  );
}
