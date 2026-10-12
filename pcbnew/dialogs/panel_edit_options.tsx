// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `PANEL_EDIT_OPTIONS` (`pcbnew/dialogs/panel_edit_options.cpp` and its
 * `_base.cpp`): ONE class both pcbnew frames build, told apart by
 * `isFootprintEditor`. It is written here as the two pages' bodies in the file
 * upstream keeps them in, each under the header it had as a module of its own,
 * plus `FOOTPRINT_EDITOR_SETTINGS::m_ArcEditMode` which the footprint page
 * loads and stores.
 *
 * The pages read the Preferences working copy through the narrow structural
 * contexts below; the app's `PrefsContext` satisfies both and this module
 * names nothing of the designer.
 */
import { type JSX, useState, useSyncExternalStore } from 'react';
import { PANEL_EDIT_OPTIONS_BASE } from './panel_edit_options_base.js';
import { unitLabel } from '@ziroeda/common/eda_units.js';

// ---------------------------------------------------------------------------
// FOOTPRINT_EDITOR_SETTINGS::m_ArcEditMode, session only
// ---------------------------------------------------------------------------
/**
 * `FOOTPRINT_EDITOR_SETTINGS::m_ArcEditMode` — a member of the settings object
 * that is **not one of its params**, and therefore never reaches the file.
 *
 * This is upstream's, not ours. The constructor seeds it
 * (`pcbnew/footprint_editor_settings.cpp:56`), `PANEL_EDIT_OPTIONS` loads and
 * stores it in the footprint branch like any other control
 * (`panel_edit_options.cpp:150`, `:177`), and `EDIT_TOOL`'s point editor reads
 * it — but `m_params.emplace_back( … "editing.arc_edit_mode" … )` appears only
 * in `PCBNEW_SETTINGS` (`pcbnew_settings.cpp:183-185`). So in the Footprint
 * Editor the choice applies for the session and is back to
 * `KEEP_CENTER_ADJUST_ANGLE_RADIUS` at the next launch.
 *
 * A key in `fpedit.json` would be a different settings file from KiCad's, and
 * greying the control would be a different dialog. A module-level value with a
 * subscription is the third thing: the same lifetime the C++ member has, which
 * is the frame's, and something outside the Preferences dialog reads it.
 *
 * Not in `prefs/settings.ts` because everything there is persisted; that is the
 * whole contract of that module.
 */

/**
 * `ARC_EDIT_MODE` (`include/tool/edit_points.h`), in the order
 * `arcEditModeToComboIndex` maps it to the wxChoice
 * (`panel_edit_options.cpp:75-98`): the enum's own order and the combo's agree,
 * which is why upstream can cast between them and still writes the two
 * switches out.
 */
export type ArcEditMode = 0 | 1 | 2;

/** `ARC_EDIT_MODE::KEEP_CENTER_ADJUST_ANGLE_RADIUS`, the constructor's seed. */
export const DEFAULT_ARC_EDIT_MODE: ArcEditMode = 0;

let mode: ArcEditMode = DEFAULT_ARC_EDIT_MODE;
const listeners = new Set<() => void>();

/** The current mode, for a non-React reader (the point editor). */
export function sessionArcEditMode(): ArcEditMode {
  return mode;
}

/** `PANEL_EDIT_OPTIONS::TransferDataFromWindow`'s one line for this control. */
export function setSessionArcEditMode(next: ArcEditMode): void {
  if (next === mode) return;
  mode = next;
  for (const l of listeners) l();
}

/** `ResetPanel`: default-construct a `FOOTPRINT_EDITOR_SETTINGS` and reload. */
export function resetSessionArcEditMode(): void {
  setSessionArcEditMode(DEFAULT_ARC_EDIT_MODE);
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The React binding, so the page and the canvas see the same value. */
export function useSessionArcEditMode(): ArcEditMode {
  return useSyncExternalStore(subscribe, sessionArcEditMode, sessionArcEditMode);
}

// ---------------------------------------------------------------------------
// The PCB Editor's page
// ---------------------------------------------------------------------------
/**
 * Preferences > PCB Editor > Editing Options — `PANEL_EDIT_OPTIONS`
 * (`pcbnew/dialogs/panel_edit_options.cpp` and its `_base.cpp`) with
 * `isFootprintEditor = false` (`pcbnew/pcbnew.cpp:425-439`).
 *
 * ONE class both pcbnew frames build; the constructor is the whole of the
 * difference (`panel_edit_options.cpp:41-72`):
 *
 *     m_magneticPads->Show( m_isFootprintEditor );      // the fp checkboxes
 *     m_magneticGraphics->Show( m_isFootprintEditor );
 *     m_sizerBoardEdit->Show( !m_isFootprintEditor );   // shown HERE
 *     m_optionsBook->SetSelection( isFootprintEditor ? 0 : 1 );
 *
 * so this page has everything the footprint editor's has, plus `m_sizerBoardEdit`
 * (Track mouse-drag mode, Flip board items, Allow free pads), plus the Ctrl
 * row's second radio, plus the book's page 1 instead of its page 0 — Magnetic
 * Points as three choices rather than two checkboxes, then Ratsnest and
 * Miscellaneous.
 *
 *     bMiddleLeftSizer (V)
 *       "Editing Options" + rule
 *         m_cbConstrainHV45Mode
 *         "Step for rotate commands:" + entry + °
 *         "Arc editing mode:" (stacked)
 *       m_sizerBoardEdit                     shown here, hidden in fpedit
 *         "Track mouse-drag mode:" (stacked)
 *         "Flip board items:" + two radios ON ONE ROW
 *         m_allowFreePads
 *       "Left Click Mouse Commands" + rule
 *         m_stHint1 + fgSizerCmdsWinLin, whose Ctrl row is a RADIO PAIR here
 *     (20, 0)
 *     m_optionsBook -> pcbPage (V)
 *       "Magnetic Points" + rule      Snap to pads / tracks and vias / graphics
 *       "Ratsnest" + rule             selected, curved, line thickness
 *       "Miscellaneous" + rule        ESC clears, page limits, courtyard, refill
 *
 * **What reads each control.**
 *
 *  - Constrain to H, V, 45 is `m_AngleSnapMode`, which the left toolbar's Line
 *    mode group is the other control over — one value, two controls.
 *  - Step for rotate commands is what `PCB_ACTIONS::rotateCw/rotateCcw` turn by.
 *  - Arc editing mode is `EDIT_TOOL`'s point editor; unlike the footprint
 *    editor's, this one IS stored (`editing.arc_edit_mode` exists only on
 *    `PCBNEW_SETTINGS`, `pcbnew_settings.cpp:183-185`).
 *  - Track mouse-drag mode is `ROUTER_TOOL`'s `m_TrackDragAction`.
 *  - Flip board items is `FLIP_DIRECTION`, which `EDIT_TOOL::Flip` mirrors about.
 *  - The three Magnetic Points choices are `PCB_GRID_HELPER`'s item classes.
 *  - Ratsnest's three and Show page limits are `PcbDrawOptions` fields.
 *  - Automatically refill zones is `ZONE_FILLER_TOOL`'s post-edit hook.
 *  - `<ESC> clears net highlighting` is the Escape handler's branch.
 */

/** The `PCBNEW_SETTINGS` members this page reads. */
export interface PANEL_EDIT_OPTIONS_PCB_SLICE {
  editing: {
    pcb_angle_snap_mode: number;
    rotation_angle: number;
    arc_edit_mode: number;
    track_drag_action: number;
    flip_left_right: boolean;
    allow_free_pads: boolean;
    ctrl_click_highlight: boolean;
    magnetic_pads: number;
    magnetic_tracks: number;
    magnetic_graphics: boolean;
    esc_clears_net_highlight: boolean;
    show_courtyard_collisions: boolean;
    auto_fill_zones: boolean;
  };
  pcb_display: {
    ratsnest_footprint: boolean;
    ratsnest_curved: boolean;
    ratsnest_thickness: number;
    show_page_borders: boolean;
  };
}

export interface PANEL_EDIT_OPTIONS_PCB_CTX {
  pcbnew: PANEL_EDIT_OPTIONS_PCB_SLICE;
  upP: (fn: (s: PANEL_EDIT_OPTIONS_PCB_SLICE) => void) => void;
}

const check = (aValue: boolean, aOn: (v: boolean) => void) => ({ value: aValue, onChange: aOn });

/**
 * m_rotationAngle: a UNIT_BINDER in DEGREES over the setting's tenths of a degree. The text is held
 * while it is typed; a zero step is refused, as TransferDataFromWindow's `if( angle != 0 )` does.
 */
function useRotationStep(aTenths: number, aSet: (aTenths: number) => void) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(aTenths / 10);
  return {
    value: shown,
    onChange: (aText: string) => {
      setText(aText);
      const n = Number(aText);
      const tenths = Math.round(n * 10);
      if (aText.trim() !== '' && Number.isFinite(n) && tenths !== 0) aSet(tenths);
    },
    onBlur: () => setText(null),
    units: unitLabel('degrees'),
  };
}

/** PANEL_EDIT_OPTIONS for the board editor: its base, the board edit sizer shown, book page 1. */
export function PanelPcbEditingOptions({ ctx }: { ctx: PANEL_EDIT_OPTIONS_PCB_CTX }): JSX.Element {
  const { pcbnew, upP } = ctx;
  const editing = pcbnew.editing;
  const display = pcbnew.pcb_display;
  const upE = (patch: Partial<typeof editing>): void =>
    upP((s) => {
      Object.assign(s.editing, patch);
    });
  const upD = (patch: Partial<typeof display>): void =>
    upP((s) => {
      Object.assign(s.pcb_display, patch);
    });
  const rotation = useRotationStep(editing.rotation_angle, (t) => upE({ rotation_angle: t }));

  return (
    <PANEL_EDIT_OPTIONS_BASE
      // LEADER_MODE::DEG45 when checked, DIRECT when clear.
      m_cbConstrainHV45Mode={check(editing.pcb_angle_snap_mode !== 0, (v) =>
        upE({ pcb_angle_snap_mode: v ? 1 : 0 }),
      )}
      m_rotationAngleCtrl={rotation}
      m_arcEditMode={{ value: editing.arc_edit_mode, onChange: (i) => upE({ arc_edit_mode: i }) }}
      boardEditShown
      m_trackMouseDragCtrl={{
        value: editing.track_drag_action,
        onChange: (i) => upE({ track_drag_action: i as 0 | 1 | 2 }),
      }}
      flip={{
        first: editing.flip_left_right,
        onFirst: () => upE({ flip_left_right: true }),
        onSecond: () => upE({ flip_left_right: false }),
      }}
      m_allowFreePads={check(editing.allow_free_pads, (v) => upE({ allow_free_pads: v }))}
      mac={false}
      ctrlClick={{
        first: !editing.ctrl_click_highlight,
        onFirst: () => upE({ ctrl_click_highlight: false }),
        onSecond: () => upE({ ctrl_click_highlight: true }),
      }}
      highlightNetShown
      optionsPage={1}
      m_magneticPads={check(false, () => {})}
      m_magneticGraphics={check(false, () => {})}
      m_magneticPadChoice={{
        value: editing.magnetic_pads,
        onChange: (i) => upE({ magnetic_pads: i as 0 | 1 | 2 }),
      }}
      m_magneticTrackChoice={{
        value: editing.magnetic_tracks,
        onChange: (i) => upE({ magnetic_tracks: i as 0 | 1 | 2 }),
      }}
      // m_magneticGraphicsChoice: 0 is Always, 1 Never.
      m_magneticGraphicsChoice={{
        value: editing.magnetic_graphics ? 0 : 1,
        onChange: (i) => upE({ magnetic_graphics: i === 0 }),
      }}
      m_showSelectedRatsnest={check(display.ratsnest_footprint, (v) =>
        upD({ ratsnest_footprint: v }),
      )}
      m_OptDisplayCurvedRatsnestLines={check(display.ratsnest_curved, (v) =>
        upD({ ratsnest_curved: v }),
      )}
      m_ratsnestThickness={{
        value: display.ratsnest_thickness,
        onChange: (v) => upD({ ratsnest_thickness: v }),
      }}
      m_escClearsNetHighlight={check(editing.esc_clears_net_highlight, (v) =>
        upE({ esc_clears_net_highlight: v }),
      )}
      m_showPageLimits={check(display.show_page_borders, (v) => upD({ show_page_borders: v }))}
      m_cbCourtyardCollisions={check(editing.show_courtyard_collisions, (v) =>
        upE({ show_courtyard_collisions: v }),
      )}
      m_autoRefillZones={check(editing.auto_fill_zones, (v) => upE({ auto_fill_zones: v }))}
    />
  );
}

/** The `FOOTPRINT_EDITOR_SETTINGS` members this page reads. */
export interface PANEL_EDIT_OPTIONS_FP_SLICE {
  editing: {
    fp_angle_snap_mode: number;
    rotation_angle: number;
    magnetic_pads: number;
    magnetic_graphics: boolean;
  };
}

export interface PANEL_EDIT_OPTIONS_FP_CTX {
  fpEdit: PANEL_EDIT_OPTIONS_FP_SLICE;
  upFp: (fn: (s: PANEL_EDIT_OPTIONS_FP_SLICE) => void) => void;
}

/**
 * PANEL_EDIT_OPTIONS for the footprint editor: m_sizerBoardEdit hidden, Highlight net hidden with
 * Toggle selection set, book page 0. The arc edit mode is the session's.
 */
export function PanelFpEditingOptions({ ctx }: { ctx: PANEL_EDIT_OPTIONS_FP_CTX }): JSX.Element {
  const { fpEdit, upFp } = ctx;
  const arcMode = useSessionArcEditMode();
  const upE = (patch: Partial<PANEL_EDIT_OPTIONS_FP_SLICE['editing']>): void =>
    upFp((s) => {
      Object.assign(s.editing, patch);
    });
  const rotation = useRotationStep(fpEdit.editing.rotation_angle, (t) =>
    upE({ rotation_angle: t }),
  );
  const off = check(false, () => {});
  const none = { value: 0, onChange: () => {} };

  return (
    <PANEL_EDIT_OPTIONS_BASE
      m_cbConstrainHV45Mode={check(fpEdit.editing.fp_angle_snap_mode !== 0, (v) =>
        upE({ fp_angle_snap_mode: v ? 1 : 0 }),
      )}
      m_rotationAngleCtrl={rotation}
      m_arcEditMode={{ value: arcMode, onChange: (i) => setSessionArcEditMode(i as ArcEditMode) }}
      boardEditShown={false}
      m_trackMouseDragCtrl={none}
      flip={{ first: true, onFirst: () => {}, onSecond: () => {} }}
      m_allowFreePads={off}
      mac={false}
      // m_rbToggleSel->SetValue( true ); m_rbHighlightNet->Show( false ).
      ctrlClick={{ first: true, onFirst: () => {}, onSecond: () => {} }}
      highlightNetShown={false}
      optionsPage={0}
      // CAPTURE_ALWAYS when checked, NO_EFFECT when clear.
      m_magneticPads={check(fpEdit.editing.magnetic_pads === 2, (v) =>
        upE({ magnetic_pads: v ? 2 : 0 }),
      )}
      m_magneticGraphics={check(fpEdit.editing.magnetic_graphics, (v) =>
        upE({ magnetic_graphics: v }),
      )}
      m_magneticPadChoice={none}
      m_magneticTrackChoice={none}
      m_magneticGraphicsChoice={none}
      m_showSelectedRatsnest={off}
      m_OptDisplayCurvedRatsnestLines={off}
      m_ratsnestThickness={{ value: 0.5, onChange: () => {} }}
      m_escClearsNetHighlight={off}
      m_showPageLimits={off}
      m_cbCourtyardCollisions={off}
      m_autoRefillZones={off}
    />
  );
}
