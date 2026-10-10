// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `include/view/wx_view_controls.h` + `common/view/wx_view_controls.cpp`:
 * `KIGFX::WX_VIEW_CONTROLS`, the VIEW_CONTROLS that reads the panel's mouse
 * events. The panel makes `wxMouseEvent`s out of the DOM's and runs them
 * through the same handler chain wx would.
 */

import { WXK } from '@ziroeda/wx/wx_keycodes.js';
import { GetClampedCoords } from '@ziroeda/kimath/src/geometry/geometry_utils.js';
import { BOX2I } from '@ziroeda/kimath/src/math/box2.js';
import {
  EuclideanNorm,
  ResizeD,
  type Vec2 as VECTOR2D,
  type VECTOR2I,
} from '@ziroeda/kimath/src/math/vector2.js';
import { FRAME_T } from '../frame_type.js';
import type { ScrollModifier } from '../settings/common_settings.js';
import * as KIPLATFORM_UI from '@ziroeda/kiplatform/ui.js';
import { MOUSE_DRAG_ACTION } from '../mouse_drag_action.js';
import { Pgm } from '../pgm_base.js';
import { KIUI_IsInputControlFocused, KIUI_IsModalDialogFocused } from '../widgets/ui_common.js';
import {
  type wxEvent,
  wxEVT_ENTER_WINDOW,
  wxEVT_GESTURE_PAN,
  wxEVT_GESTURE_ZOOM,
  wxEVT_LEAVE_WINDOW,
  wxEVT_LEFT_DOWN,
  wxEVT_LEFT_UP,
  wxEVT_MAGNIFY,
  wxEVT_MIDDLE_DOWN,
  wxEVT_MIDDLE_UP,
  wxEVT_MOTION,
  wxEVT_MOUSEWHEEL,
  wxEVT_RIGHT_DOWN,
  wxEVT_RIGHT_UP,
  wxEVT_SCROLLWIN_BOTTOM,
  wxEVT_SCROLLWIN_LINEDOWN,
  wxEVT_SCROLLWIN_LINEUP,
  wxEVT_SCROLLWIN_PAGEDOWN,
  wxEVT_SCROLLWIN_PAGEUP,
  wxEVT_SCROLLWIN_THUMBRELEASE,
  wxEVT_SCROLLWIN_THUMBTRACK,
  wxEVT_SCROLLWIN_TOP,
  wxEVT_TIMER,
  wxGetKeyState,
  wxMouseEvent,
  wxMouseWheelAxis,
  wxNewEventType,
  wxOrientation,
  type wxPanGestureEvent,
  type wxScrollWinEvent,
  wxTimer,
  type wxTimerEvent,
  type wxZoomGestureEvent,
} from '@ziroeda/wx/wx_event.js';
import type { VIEW } from './view.js';
import { VIEW_CONTROLS } from './view_controls.js';
import {
  ACCELERATING_ZOOM_CONTROLLER,
  CONSTANT_ZOOM_CONTROLLER,
  type ZOOM_CONTROLLER,
} from './zoom_controller.js';

/**
 * `EDA_DRAW_PANEL_GAL` as the view controls reach it: the wx window calls
 * (client size, focus, the event table) and the frame it belongs to.
 */
export interface WX_VIEW_CONTROLS_PANEL extends KIPLATFORM_UI.KIPLATFORM_WINDOW {
  /** `wxWindow::Connect( eventType, handler )`: a dynamic handler, searched most-recent first. */
  Connect(aEventType: number, aHandler: (aEvent: wxEvent) => void): void;
  /** `wxPostEvent( panel, event )`: queue the event for the panel's handler chain. */
  PostEvent(aEvent: wxEvent): void;
  /** `wxWindow::ScreenToClient`. */
  ScreenToClient(aPoint: { x: number; y: number }): { x: number; y: number };
  /** `wxWindow::GetClientSize`. */
  GetClientSize(): VECTOR2I;
  /** `wxWindow::Refresh()`. */
  Refresh(): void;
  /** `wxWindow::GetParent()`: null for a top-level window. */
  GetParent(): unknown;
  /** `EDA_DRAW_PANEL_GAL::GetParentEDAFrame()`. */
  GetParentEDAFrame(): WX_VIEW_CONTROLS_FRAME | null;
  /** `EDA_DRAW_PANEL_GAL::StatusPopupHasFocus()`. */
  StatusPopupHasFocus(): boolean;
  /** `wxWindow::EnableTouchEvents`: true when the platform delivers gestures. */
  EnableTouchEvents(aFlags: number): boolean;
  /** `wxScrolledCanvas::GetScrollThumb( orient )`. */
  GetScrollThumb(aOrientation: wxOrientation): number;
  /** `wxScrolledCanvas::GetScrollRange( orient )`. */
  GetScrollRange(aOrientation: wxOrientation): number;
  /** `wxScrolledCanvas::SetScrollbars( ... )`. */
  SetScrollbars(
    aPixelsPerUnitX: number,
    aPixelsPerUnitY: number,
    aNoUnitsX: number,
    aNoUnitsY: number,
    aXPos: number,
    aYPos: number,
    aNoRefresh: boolean,
  ): void;
  /** `m_MouseCapturedLost`. */
  m_MouseCapturedLost: boolean;
}

/** `EDA_DRAW_FRAME` as `onMotion`'s focus-follow reads it. */
export interface WX_VIEW_CONTROLS_FRAME {
  IsType(aFrameType: FRAME_T): boolean;
  /** `Kiway().Player( aFrameType, false )`: the sibling frame, if open. */
  KiwayPlayer(aFrameType: FRAME_T): unknown;
  Raise(): void;
}

/** `wxTOUCH_ZOOM_GESTURE`, `wxTOUCH_PAN_GESTURES`. */
export const wxTOUCH_ZOOM_GESTURE = 0x0004;
export const wxTOUCH_PAN_GESTURES = 0x0001 | 0x0002;

/** `USE_MOUSE_CAPTURE` is MSW only. */
const USE_MOUSE_CAPTURE = false;

/**
 * `GetZoomControllerForPlatform`: GTK3 is the platform this build mirrors
 * (the designer runs on a GTK3 desktop's metrics throughout).
 */
function GetZoomControllerForPlatform(_aAcceleration: boolean): ZOOM_CONTROLLER {
  // GTK3 is similar, but the scale constant is smaller
  return new CONSTANT_ZOOM_CONTROLLER(CONSTANT_ZOOM_CONTROLLER.GTK3_SCALE);
}

/// Possible states for WX_VIEW_CONTROLS.
enum STATE {
  IDLE = 1, ///< Nothing is happening.
  DRAG_PANNING, ///< Panning with mouse button pressed.
  AUTO_PANNING, ///< Panning on approaching borders of the frame.
  DRAG_ZOOMING, ///< Zooming with mouse button pressed.
}

// `static bool justWarped` in onMotion's DRAG_PANNING and DRAG_ZOOMING branches
let s_justWarpedPanning = false;
let s_justWarpedZooming = false;

/**
 * An implementation of class VIEW_CONTROLS for wxWidgets library.
 */
export class WX_VIEW_CONTROLS extends VIEW_CONTROLS {
  /// Event that forces mouse move event in the dispatcher (eg. used in autopanning, when
  /// mouse cursor does not move in screen coordinates, but does in world coordinates)
  static readonly EVT_REFRESH_MOUSE = wxNewEventType();

  /// Current state of VIEW_CONTROLS.
  private m_state: STATE;

  /// Panel that is affected by VIEW_CONTROLS.
  private m_parentPanel: WX_VIEW_CONTROLS_PANEL;

  /// Store information about point where dragging has started.
  private m_dragStartPoint: VECTOR2D;

  /// Current direction of panning (only autopanning mode).
  private m_panDirection: VECTOR2D;

  /// Timer responsible for handling autopanning.
  private m_panTimer: wxTimer;

  /// Ratio used for scaling world coordinates to scrollbar position.
  private m_scrollScale: VECTOR2D;

  /// Current scrollbar position.
  private m_scrollPos: VECTOR2I;

  /// The mouse position when a drag zoom started.
  private m_zoomStartPoint: VECTOR2D;

  /// Current cursor position (world coordinates).
  private m_cursorPos: VECTOR2D;

  /// Flag deciding whether the cursor position should be calculated using the mouse position.
  private m_updateCursor: boolean;

  /// True if we are panning via the meta key.
  private m_metaPanning: boolean;

  /// Last mouse position when panning via the meta key.
  private m_metaPanStart: VECTOR2D;

  /// Flag to indicate if infinite panning works on this platform.
  private m_infinitePanWorks: boolean;

  /// A #ZOOM_CONTROLLER that determines zoom steps. This is platform-specific.
  private m_zoomController: ZOOM_CONTROLLER | null = null;

  /// Used to track gesture events.
  private m_gestureLastZoomFactor: number;
  private m_gestureLastPos: VECTOR2D;

  /** `PROF_COUNTER( "Mouse motion events" )`. */
  m_MotionEventCounter = 0;

  constructor(aView: VIEW, aParentPanel: WX_VIEW_CONTROLS_PANEL) {
    super(aView);
    this.m_state = STATE.IDLE;
    this.m_parentPanel = aParentPanel;
    this.m_dragStartPoint = { x: 0, y: 0 };
    this.m_panDirection = { x: 0, y: 0 };
    this.m_scrollScale = { x: 1.0, y: 1.0 };
    this.m_scrollPos = { x: 0, y: 0 };
    this.m_zoomStartPoint = { x: 0, y: 0 };
    this.m_cursorPos = { x: 0, y: 0 };
    this.m_updateCursor = true;
    this.m_metaPanning = false;
    this.m_metaPanStart = { x: 0, y: 0 };
    this.m_infinitePanWorks = false;
    this.m_gestureLastZoomFactor = 1.0;
    this.m_gestureLastPos = { x: 0, y: 0 };

    this.LoadSettings();

    const panel = this.m_parentPanel;
    const mouse = (aHandler: (aEvent: wxMouseEvent) => void) => (aEvent: wxEvent) =>
      aHandler(aEvent as wxMouseEvent);
    const scroll = (aEvent: wxEvent) => this.onScroll(aEvent as wxScrollWinEvent);

    panel.Connect(
      wxEVT_MOTION,
      mouse((e) => this.onMotion(e)),
    );
    panel.Connect(
      wxEVT_MAGNIFY,
      mouse((e) => this.onMagnify(e)),
    );
    panel.Connect(
      wxEVT_MOUSEWHEEL,
      mouse((e) => this.onWheel(e)),
    );
    panel.Connect(
      wxEVT_MIDDLE_UP,
      mouse((e) => this.onButton(e)),
    );
    panel.Connect(
      wxEVT_MIDDLE_DOWN,
      mouse((e) => this.onButton(e)),
    );
    panel.Connect(
      wxEVT_LEFT_UP,
      mouse((e) => this.onButton(e)),
    );
    panel.Connect(
      wxEVT_LEFT_DOWN,
      mouse((e) => this.onButton(e)),
    );
    panel.Connect(
      wxEVT_RIGHT_UP,
      mouse((e) => this.onButton(e)),
    );
    panel.Connect(
      wxEVT_RIGHT_DOWN,
      mouse((e) => this.onButton(e)),
    );
    // wxEVT_ENTER_WINDOW is connected on __WXMSW__ only
    panel.Connect(
      wxEVT_LEAVE_WINDOW,
      mouse((e) => this.onLeave(e)),
    );
    panel.Connect(wxEVT_SCROLLWIN_THUMBTRACK, scroll);
    panel.Connect(wxEVT_SCROLLWIN_PAGEUP, scroll);
    panel.Connect(wxEVT_SCROLLWIN_PAGEDOWN, scroll);
    panel.Connect(wxEVT_SCROLLWIN_BOTTOM, scroll);
    panel.Connect(wxEVT_SCROLLWIN_TOP, scroll);
    panel.Connect(wxEVT_SCROLLWIN_LINEUP, scroll);
    panel.Connect(wxEVT_SCROLLWIN_LINEDOWN, scroll);
    // wxEVT_MOUSE_CAPTURE_LOST is connected under USE_MOUSE_CAPTURE only

    if (panel.EnableTouchEvents(wxTOUCH_ZOOM_GESTURE | wxTOUCH_PAN_GESTURES)) {
      panel.Connect(wxEVT_GESTURE_ZOOM, (e) => this.onZoomGesture(e as wxZoomGestureEvent));
      panel.Connect(wxEVT_GESTURE_PAN, (e) => this.onPanGesture(e as wxPanGestureEvent));
    }

    this.m_cursorWarped = false;

    this.m_panTimer = new wxTimer((e) => this.onTimer(e));

    this.m_settings.m_lastKeyboardCursorPositionValid = false;
    this.m_settings.m_lastKeyboardCursorPosition = { x: 0.0, y: 0.0 };
    this.m_settings.m_lastKeyboardCursorCommand = 0;
  }

  /** `~WX_VIEW_CONTROLS`: the pan timer must not outlive the panel. */
  Destroy(): void {
    this.m_panTimer.Stop();
  }

  /// Applies VIEW_CONTROLS settings from the program #COMMON_SETTINGS.
  override LoadSettings(): void {
    const cfg = Pgm().GetCommonSettings()!;

    this.m_settings.m_warpCursor = cfg.m_Input.center_on_zoom;
    this.m_settings.m_focusFollowSchPcb = cfg.m_Input.focus_follow_sch_pcb;
    this.m_settings.m_autoPanSettingEnabled = cfg.m_Input.auto_pan;
    this.m_settings.m_autoPanAcceleration = cfg.m_Input.auto_pan_acceleration;
    this.m_settings.m_horizontalPan = cfg.m_Input.horizontal_pan;
    this.m_settings.m_zoomAcceleration = cfg.m_Input.zoom_acceleration;
    this.m_settings.m_zoomSpeed = cfg.m_Input.zoom_speed;
    this.m_settings.m_zoomSpeedAuto = cfg.m_Input.zoom_speed_auto;
    this.m_settings.m_scrollModifierZoom = cfg.m_Input.scroll_modifier_zoom;
    this.m_settings.m_scrollModifierPanH = cfg.m_Input.scroll_modifier_pan_h;
    this.m_settings.m_scrollModifierPanV = cfg.m_Input.scroll_modifier_pan_v;
    this.m_settings.m_dragLeft = cfg.m_Input.drag_left;
    this.m_settings.m_dragMiddle = cfg.m_Input.drag_middle;
    this.m_settings.m_dragRight = cfg.m_Input.drag_right;
    this.m_settings.m_scrollReverseZoom = cfg.m_Input.reverse_scroll_zoom;
    this.m_settings.m_scrollReversePanH = cfg.m_Input.reverse_scroll_pan_h;
    this.m_settings.m_motionPanModifier = cfg.m_Input.motion_pan_modifier;

    this.m_zoomController = null;

    if (cfg.m_Input.zoom_speed_auto) {
      this.m_zoomController = GetZoomControllerForPlatform(cfg.m_Input.zoom_acceleration);
    } else {
      if (cfg.m_Input.zoom_acceleration) {
        this.m_zoomController = new ACCELERATING_ZOOM_CONTROLLER(cfg.m_Input.zoom_speed);
      } else {
        const scale = CONSTANT_ZOOM_CONTROLLER.MANUAL_SCALE_FACTOR * cfg.m_Input.zoom_speed;
        this.m_zoomController = new CONSTANT_ZOOM_CONTROLLER(scale);
      }
    }
  }

  /// Handler functions
  onMotion(aEvent: wxMouseEvent): void {
    this.m_MotionEventCounter++;

    // Because Weston sends a motion event to previous location after warping the pointer
    const mouseRel = this.m_parentPanel.ScreenToClient(KIPLATFORM_UI.GetMousePosition());

    let isAutoPanning = false;
    const x = mouseRel.x;
    const y = mouseRel.y;
    const mousePos: VECTOR2D = { x, y };

    // Clear keyboard cursor position flag when actual mouse motion is detected
    // (i.e., not from cursor warping and position has changed)
    if (!this.m_cursorWarped && this.m_settings.m_lastKeyboardCursorPositionValid) {
      const screenPos: VECTOR2I = { x, y };
      const kp = this.m_view.ToScreen(this.m_settings.m_lastKeyboardCursorPosition);
      const keyboardScreenPos: VECTOR2I = { x: Math.trunc(kp.x), y: Math.trunc(kp.y) };

      // If mouse has moved to a different position than the keyboard cursor position,
      // clear the keyboard position flag to allow mouse control
      if (screenPos.x !== keyboardScreenPos.x || screenPos.y !== keyboardScreenPos.y) {
        this.m_settings.m_lastKeyboardCursorPositionValid = false;
        this.m_settings.m_lastKeyboardCursorPosition = { x: 0.0, y: 0.0 };
      }
    }

    // Automatic focus switching between SCH and PCB windows on canvas mouse motion
    if (this.m_settings.m_focusFollowSchPcb) {
      const frame = this.m_parentPanel.GetParentEDAFrame();

      if (frame) {
        let otherFrame: unknown = null;

        if (frame.IsType(FRAME_T.FRAME_PCB_EDITOR)) {
          otherFrame = frame.KiwayPlayer(FRAME_T.FRAME_SCH);
        } else if (frame.IsType(FRAME_T.FRAME_SCH)) {
          otherFrame = frame.KiwayPlayer(FRAME_T.FRAME_PCB_EDITOR);
        }

        if (
          otherFrame &&
          KIPLATFORM_UI.IsWindowActive(otherFrame) &&
          !KIPLATFORM_UI.IsWindowActive(frame)
        ) {
          frame.Raise();
        }
      }
    }

    if (
      this.m_settings.m_motionPanModifier !== WXK.WXK_NONE &&
      wxGetKeyState(this.m_settings.m_motionPanModifier)
    ) {
      if (!this.m_metaPanning) {
        this.m_metaPanning = true;
        this.m_metaPanStart = mousePos;
        aEvent.StopPropagation();
      } else {
        const d: VECTOR2D = {
          x: this.m_metaPanStart.x - mousePos.x,
          y: this.m_metaPanStart.y - mousePos.y,
        };
        this.m_metaPanStart = mousePos;

        const delta = this.m_view.ToWorld(d, false);
        const c = this.m_view.GetCenter();
        this.m_view.SetCenter({ x: c.x + delta.x, y: c.y + delta.y });
        aEvent.StopPropagation();
      }

      if (this.m_updateCursor) this.m_cursorPos = GetClampedCoords(this.m_view.ToWorld(mousePos));
      else this.m_updateCursor = true;

      aEvent.Skip();
      return;
    }

    this.m_metaPanning = false;

    if (this.m_state !== STATE.DRAG_PANNING && this.m_state !== STATE.DRAG_ZOOMING)
      this.handleCursorCapture(x, y);

    if (this.m_settings.m_autoPanEnabled && this.m_settings.m_autoPanSettingEnabled)
      isAutoPanning = this.handleAutoPanning(aEvent);

    if (!isAutoPanning && aEvent.Dragging()) {
      if (this.m_state === STATE.DRAG_PANNING) {
        let warpX = 0;
        let warpY = 0;
        const parentSize = this.m_parentPanel.GetClientSize();

        if (x < 0) {
          warpX = parentSize.x;
        } else if (x >= parentSize.x) {
          warpX = -parentSize.x;
        }

        if (y < 0) {
          warpY = parentSize.y;
        } else if (y >= parentSize.y) {
          warpY = -parentSize.y;
        }

        if (!s_justWarpedPanning) {
          const d: VECTOR2D = {
            x: this.m_dragStartPoint.x - mousePos.x,
            y: this.m_dragStartPoint.y - mousePos.y,
          };
          this.m_dragStartPoint = mousePos;
          const delta = this.m_view.ToWorld(d, false);
          const c = this.m_view.GetCenter();
          this.m_view.SetCenter({ x: c.x + delta.x, y: c.y + delta.y });
          aEvent.StopPropagation();
        }

        if (warpX || warpY) {
          if (!s_justWarpedPanning) {
            if (
              this.m_infinitePanWorks &&
              KIPLATFORM_UI.WarpPointer(this.m_parentPanel, x + warpX, y + warpY)
            ) {
              this.m_dragStartPoint = {
                x: this.m_dragStartPoint.x + warpX,
                y: this.m_dragStartPoint.y + warpY,
              };
              s_justWarpedPanning = true;
            }
          } else {
            s_justWarpedPanning = false;
          }
        } else {
          s_justWarpedPanning = false;
        }
      } else if (this.m_state === STATE.DRAG_ZOOMING) {
        let warpY = 0;
        const parentSize = this.m_parentPanel.GetClientSize();

        if (y < 0) {
          warpY = parentSize.y;
        } else if (y >= parentSize.y) {
          warpY = -parentSize.y;
        }

        if (!s_justWarpedZooming) {
          const d: VECTOR2D = {
            x: this.m_dragStartPoint.x - mousePos.x,
            y: this.m_dragStartPoint.y - mousePos.y,
          };
          this.m_dragStartPoint = mousePos;

          const scale = Math.exp(d.y * this.m_settings.m_zoomSpeed * 0.001);

          this.m_view.SetScale(
            this.m_view.GetScale() * scale,
            this.m_view.ToWorld(this.m_zoomStartPoint),
          );
          aEvent.StopPropagation();
        }

        if (warpY) {
          if (!s_justWarpedZooming) {
            KIPLATFORM_UI.WarpPointer(this.m_parentPanel, x, y + warpY);
            this.m_dragStartPoint = {
              x: this.m_dragStartPoint.x,
              y: this.m_dragStartPoint.y + warpY,
            };
            s_justWarpedZooming = true;
          } else s_justWarpedZooming = false;
        } else {
          s_justWarpedZooming = false;
        }
      }
    }

    if (this.m_updateCursor)
      // do not update the cursor position if it was explicitly set
      this.m_cursorPos = GetClampedCoords(this.m_view.ToWorld(mousePos));
    else this.m_updateCursor = true;

    aEvent.Skip();
  }

  onWheel(aEvent: wxMouseEvent): void {
    const wheelPanSpeed = 0.001;
    const axis = aEvent.GetWheelAxis();

    // Native horizontal wheel events (from mice with tilt wheels, side-button scroll combos, or
    // touchpads) are always handled as horizontal pan. The m_horizontalPan setting only controls
    // whether a keyboard modifier can convert vertical scroll into horizontal pan.
    if (axis === wxMouseWheelAxis.wxMOUSE_WHEEL_HORIZONTAL) {
      const ss = this.m_view.ToWorld(this.m_view.GetScreenPixelSize(), false);
      const k = aEvent.GetWheelRotation() * wheelPanSpeed;
      const scrollVec: VECTOR2D = { x: ss.x * k, y: ss.y * k };

      const c = this.m_view.GetCenter();
      this.m_view.SetCenter({ x: c.x + scrollVec.x, y: c.y + 0.0 });
      this.refreshMouse(true);
      return;
    }

    // Pick the modifier, if any.  Shift beats control beats alt, we don't support more than one.
    let nMods = 0;
    let modifiers = 0;

    if (aEvent.ShiftDown()) {
      nMods += 1;
      modifiers = WXK.WXK_SHIFT;
    }

    if (aEvent.ControlDown()) {
      nMods += 1;
      modifiers = modifiers === 0 ? WXK.WXK_CONTROL : modifiers;
    }

    if (aEvent.AltDown()) {
      nMods += 1;
      modifiers = modifiers === 0 ? WXK.WXK_ALT : modifiers;
    }

    // Zero or one modifier is view control
    if (nMods <= 1) {
      // Restrict zoom handling to the vertical axis, otherwise horizontal
      // scrolling events (e.g. touchpads and some mice) end up interpreted
      // as vertical scroll events and confuse the user.
      if (
        modifiers === this.m_settings.m_scrollModifierZoom &&
        axis === wxMouseWheelAxis.wxMOUSE_WHEEL_VERTICAL
      ) {
        const rotation = aEvent.GetWheelRotation() * (this.m_settings.m_scrollReverseZoom ? -1 : 1);
        const zoomScale = this.m_zoomController!.GetScaleForRotation(rotation);

        if (this.IsCursorWarpingEnabled()) {
          this.CenterOnCursor();
          this.m_view.SetScale(this.m_view.GetScale() * zoomScale);
        } else {
          const anchor = this.m_view.ToWorld({ x: aEvent.GetX(), y: aEvent.GetY() });
          this.m_view.SetScale(this.m_view.GetScale() * zoomScale, anchor);
        }

        aEvent.Skip();

        // Refresh the zoom level and mouse position on message panel
        // (mouse position has not changed, only the zoom level has changed):
        this.refreshMouse(true);
      } else {
        // Scrolling
        const ss = this.m_view.ToWorld(this.m_view.GetScreenPixelSize(), false);
        const k = aEvent.GetWheelRotation() * wheelPanSpeed;
        const scrollVec: VECTOR2D = { x: ss.x * k, y: ss.y * k };
        let scrollX = 0.0;
        let scrollY = 0.0;
        const hReverse = this.m_settings.m_scrollReversePanH;

        if (modifiers === this.m_settings.m_scrollModifierPanH) {
          scrollX = hReverse ? scrollVec.x : -scrollVec.x;
        } else {
          scrollY = -scrollVec.y;
        }

        const delta: VECTOR2D = { x: scrollX, y: scrollY };

        const c = this.m_view.GetCenter();
        this.m_view.SetCenter({ x: c.x + delta.x, y: c.y + delta.y });
        this.refreshMouse(true);
      }

      // Do not skip this event, otherwise wxWidgets will fire
      // 3 wxEVT_SCROLLWIN_LINEUP or wxEVT_SCROLLWIN_LINEDOWN (normal wxWidgets behavior)
      // and we do not want that.
    } else {
      // When we have multiple mods, forward it for tool handling
      aEvent.Skip();
    }
  }

  onMagnify(aEvent: wxMouseEvent): void {
    // Scale based on the magnification from our underlying magnification event.
    const anchor = this.m_view.ToWorld({ x: aEvent.GetX(), y: aEvent.GetY() });
    this.m_view.SetScale(
      this.m_view.GetScale() * (Math.fround(aEvent.GetMagnification()) + 1.0),
      anchor,
    );

    aEvent.Skip();
  }

  private setState(aNewState: STATE): void {
    this.m_state = aNewState;
  }

  onButton(aEvent: wxMouseEvent): void {
    switch (this.m_state) {
      case STATE.IDLE:
      case STATE.AUTO_PANNING:
        if (
          (aEvent.MiddleDown() && this.m_settings.m_dragMiddle === MOUSE_DRAG_ACTION.PAN) ||
          (aEvent.RightDown() && this.m_settings.m_dragRight === MOUSE_DRAG_ACTION.PAN)
        ) {
          this.m_dragStartPoint = { x: aEvent.GetX(), y: aEvent.GetY() };
          this.setState(STATE.DRAG_PANNING);
          this.m_infinitePanWorks = KIPLATFORM_UI.InfiniteDragPrepareWindow(this.m_parentPanel);
        } else if (
          (aEvent.MiddleDown() && this.m_settings.m_dragMiddle === MOUSE_DRAG_ACTION.ZOOM) ||
          (aEvent.RightDown() && this.m_settings.m_dragRight === MOUSE_DRAG_ACTION.ZOOM)
        ) {
          this.m_dragStartPoint = { x: aEvent.GetX(), y: aEvent.GetY() };
          this.m_zoomStartPoint = this.m_dragStartPoint;
          this.setState(STATE.DRAG_ZOOMING);
        }

        if (aEvent.LeftUp()) this.setState(STATE.IDLE); // Stop autopanning when user release left mouse button

        break;

      case STATE.DRAG_ZOOMING:
      case STATE.DRAG_PANNING:
        if (aEvent.MiddleUp() || aEvent.LeftUp() || aEvent.RightUp()) {
          this.setState(STATE.IDLE);
          KIPLATFORM_UI.InfiniteDragReleaseWindow();
        }

        break;
    }

    aEvent.Skip();
  }

  onEnter(_aEvent: wxMouseEvent): void {
    // Avoid stealing focus from text controls
    // This is particularly important for users using On-Screen-Keyboards
    // They may move the mouse over the canvas to reach the keyboard
    if (KIUI_IsInputControlFocused()) {
      return;
    }

    // Win32 and some *nix WMs transmit mouse move and wheel events to all controls below the
    // mouse regardless of focus.  Forcing the focus here will cause the EDA FRAMES to immediately
    // become the top level active window.
    if (this.m_parentPanel.GetParent() !== null) {
      // this assumes the parent panel's parent is the eda window
      if (KIPLATFORM_UI.IsWindowActive(this.m_parentPanel.GetParent())) {
        this.m_parentPanel.SetFocus();
      }
    }
  }

  onLeave(aEvent: wxMouseEvent): void {
    if (!USE_MOUSE_CAPTURE) this.onMotion(aEvent);
  }

  onCaptureLost(_aEvent: wxMouseEvent): void {
    // This method must be present to suppress the capture-lost assertion

    // Set the flag to allow calling m_parentPanel->CaptureMouse()
    // Note: One cannot call m_parentPanel->CaptureMouse() twice, this is not accepted
    // by wxWidgets (MSW specific) so we need this guard
    this.m_parentPanel.m_MouseCapturedLost = true;
  }

  onTimer(_aEvent: wxTimerEvent): void {
    switch (this.m_state) {
      case STATE.AUTO_PANNING: {
        if (!this.m_settings.m_autoPanEnabled) {
          this.setState(STATE.IDLE);
          return;
        }

        if (!this.m_parentPanel.HasFocus() && !this.m_parentPanel.StatusPopupHasFocus()) {
          this.setState(STATE.IDLE);
          return;
        }

        const borderSize = Math.min(
          this.m_settings.m_autoPanMargin * this.m_view.GetScreenPixelSize().x,
          this.m_settings.m_autoPanMargin * this.m_view.GetScreenPixelSize().y,
        );

        // When the mouse cursor is outside the area with no pan,
        // m_panDirection is the dist to this area limit ( in pixels )
        // It will be used also as pan value (the pan speed depends on this dist).
        let dir: VECTOR2D = { ...this.m_panDirection };

        // When the mouse cursor is outside the area with no pan, the pan value
        // is accelerated depending on the dist between the area and the cursor
        const accel = Math.fround(0.5 + Math.fround(this.m_settings.m_autoPanAcceleration / 5.0));

        // For a small mouse cursor dist to area, just use the distance.
        // But for a dist > borderSize / 2, use an accelerated pan value
        if (EuclideanNorm(dir) >= borderSize)
          // far from area limits
          dir = ResizeD(dir, borderSize * accel);
        else if (EuclideanNorm(dir) > borderSize / 2)
          // Near from area limits
          dir = ResizeD(dir, borderSize);

        dir = this.m_view.ToWorld(dir, false);
        const c = this.m_view.GetCenter();
        this.m_view.SetCenter({ x: c.x + dir.x, y: c.y + dir.y });

        this.refreshMouse(true);

        this.m_panTimer.Start();
        break;
      }

      case STATE.IDLE: // Just remove unnecessary warnings
      case STATE.DRAG_PANNING:
      case STATE.DRAG_ZOOMING:
        break;
    }
  }

  onZoomGesture(aEvent: wxZoomGestureEvent): void {
    if (aEvent.IsGestureStart()) {
      this.m_gestureLastZoomFactor = 1.0;
      this.m_gestureLastPos = { x: aEvent.GetPosition().x, y: aEvent.GetPosition().y };
    }

    const evtPos: VECTOR2D = { x: aEvent.GetPosition().x, y: aEvent.GetPosition().y };
    const deltaWorld = this.m_view.ToWorld(
      { x: evtPos.x - this.m_gestureLastPos.x, y: evtPos.y - this.m_gestureLastPos.y },
      false,
    );

    const c = this.m_view.GetCenter();
    this.m_view.SetCenter({ x: c.x - deltaWorld.x, y: c.y - deltaWorld.y });

    this.m_view.SetScale(
      (this.m_view.GetScale() * aEvent.GetZoomFactor()) / this.m_gestureLastZoomFactor,
      this.m_view.ToWorld(evtPos),
    );

    this.m_gestureLastZoomFactor = aEvent.GetZoomFactor();
    this.m_gestureLastPos = evtPos;

    this.refreshMouse(true);
  }

  onPanGesture(aEvent: wxPanGestureEvent): void {
    const screenDelta: VECTOR2I = { x: aEvent.GetDelta().x, y: aEvent.GetDelta().y };
    const deltaWorld = this.m_view.ToWorld(screenDelta, false);

    const c = this.m_view.GetCenter();
    this.m_view.SetCenter({ x: c.x - deltaWorld.x, y: c.y - deltaWorld.y });

    this.refreshMouse(true);
  }

  onScroll(aEvent: wxScrollWinEvent): void {
    const linePanDelta = 0.05;
    const pagePanDelta = 0.5;

    const type = aEvent.GetEventType();
    const dir = aEvent.GetOrientation();

    if (type === wxEVT_SCROLLWIN_THUMBTRACK) {
      const center = { ...this.m_view.GetCenter() };
      const boundary = this.m_view.GetBoundary();

      // Flip scroll direction in flipped view
      const xstart = this.m_view.IsMirroredX() ? boundary.GetRight() : boundary.GetLeft();
      const xdelta = this.m_view.IsMirroredX() ? -1 : 1;

      if (dir === wxOrientation.wxHORIZONTAL)
        center.x = xstart + xdelta * (aEvent.GetPosition() / this.m_scrollScale.x);
      else center.y = boundary.GetTop() + aEvent.GetPosition() / this.m_scrollScale.y;

      this.m_view.SetCenter(center);
    } else if (
      type === wxEVT_SCROLLWIN_THUMBRELEASE ||
      type === wxEVT_SCROLLWIN_TOP ||
      type === wxEVT_SCROLLWIN_BOTTOM
    ) {
      // Do nothing on thumb release, we don't care about it.
      // We don't have a concept of top or bottom in our viewport, so ignore those events.
    } else {
      let dist = 0;

      if (type === wxEVT_SCROLLWIN_PAGEUP) {
        dist = pagePanDelta;
      } else if (type === wxEVT_SCROLLWIN_PAGEDOWN) {
        dist = -pagePanDelta;
      } else if (type === wxEVT_SCROLLWIN_LINEUP) {
        dist = linePanDelta;
      } else if (type === wxEVT_SCROLLWIN_LINEDOWN) {
        dist = -linePanDelta;
      } else {
        console.assert(false, 'Unhandled event type');
        return;
      }

      const ss = this.m_view.ToWorld(this.m_view.GetScreenPixelSize(), false);
      const scroll: VECTOR2D = { x: ss.x * dist, y: ss.y * dist };

      let scrollX = 0.0;
      let scrollY = 0.0;

      if (dir === wxOrientation.wxHORIZONTAL) scrollX = -scroll.x;
      else scrollY = -scroll.y;

      const delta: VECTOR2D = { x: scrollX, y: scrollY };

      const c = this.m_view.GetCenter();
      this.m_view.SetCenter({ x: c.x + delta.x, y: c.y + delta.y });
    }

    this.m_parentPanel.Refresh();
  }

  override CaptureCursor(aEnabled: boolean): void {
    // USE_MOUSE_CAPTURE is MSW only
    super.CaptureCursor(aEnabled);
  }

  /// End any mouse drag action still in progress.
  CancelDrag(): void {
    if (this.m_state === STATE.DRAG_PANNING || this.m_state === STATE.DRAG_ZOOMING) {
      this.setState(STATE.IDLE);
    }

    this.m_metaPanning = false;
  }

  /// @copydoc VIEW_CONTROLS::GetMousePosition()
  override GetMousePosition(aWorldCoordinates = true): VECTOR2D {
    const msp = this.getMouseScreenPosition();
    const screenPos: VECTOR2D = { x: msp.x, y: msp.y };

    return aWorldCoordinates ? GetClampedCoords(this.m_view.ToWorld(screenPos)) : screenPos;
  }

  /// @copydoc VIEW_CONTROLS::GetRawCursorPosition()
  override GetRawCursorPosition(aEnableSnapping = true): VECTOR2D {
    const gal = this.m_view.GetGAL();

    if (aEnableSnapping && gal.GetGridSnapping()) {
      return gal.GetGridPoint(this.m_cursorPos);
    }

    return this.m_cursorPos;
  }

  /// @copydoc VIEW_CONTROLS::GetCursorPosition()
  protected override getCursorPosition(aEnableSnapping: boolean): VECTOR2D {
    if (this.m_settings.m_forceCursorPosition) {
      return this.m_settings.m_forcedPosition;
    }

    return GetClampedCoords(this.GetRawCursorPosition(aEnableSnapping));
  }

  override SetCursorPosition(
    aPosition: VECTOR2D,
    aWarpView = true,
    aTriggeredByArrows = false,
    aArrowCommand = 0,
  ): void {
    this.m_updateCursor = false;

    const clampedPosition = GetClampedCoords(aPosition);

    if (aTriggeredByArrows) {
      this.m_settings.m_lastKeyboardCursorPositionValid = true;
      this.m_settings.m_lastKeyboardCursorPosition = clampedPosition;
      this.m_settings.m_lastKeyboardCursorCommand = aArrowCommand;
      this.m_cursorWarped = false;
    } else {
      this.m_settings.m_lastKeyboardCursorPositionValid = false;
      this.m_settings.m_lastKeyboardCursorPosition = { x: 0.0, y: 0.0 };
      this.m_settings.m_lastKeyboardCursorCommand = 0;
      this.m_cursorWarped = true;
    }

    this.WarpMouseCursor(clampedPosition, true, aWarpView);
    this.m_cursorPos = clampedPosition;
  }

  /// @copydoc VIEW_CONTROLS::SetCrossHairCursorPosition()
  override SetCrossHairCursorPosition(aPosition: VECTOR2D, aWarpView = true): void {
    this.m_updateCursor = false;

    const clampedPosition = GetClampedCoords(aPosition);

    const screenSize = this.m_view.GetGAL().GetScreenPixelSize();
    const screen = new BOX2I({ x: 0, y: 0 }, screenSize);
    const screenPos = this.m_view.ToScreen(clampedPosition);

    if (aWarpView && !screen.Contains(screenPos)) this.m_view.SetCenter(clampedPosition);

    this.m_cursorPos = clampedPosition;
  }

  /// @copydoc VIEW_CONTROLS::CursorWarp()
  override WarpMouseCursor(
    aPosition: VECTOR2D,
    aWorldCoordinates = false,
    aWarpView = false,
  ): void {
    if (aWorldCoordinates) {
      const screenSize = this.m_view.GetGAL().GetScreenPixelSize();
      const screen = new BOX2I({ x: 0, y: 0 }, screenSize);
      const clampedPosition = GetClampedCoords(aPosition);
      const screenPos = this.m_view.ToScreen(clampedPosition);

      if (!screen.Contains(screenPos)) {
        if (aWarpView) {
          this.m_view.SetCenter(clampedPosition);
          KIPLATFORM_UI.WarpPointer(
            this.m_parentPanel,
            Math.trunc(screenSize.x / 2),
            Math.trunc(screenSize.y / 2),
          );
        }
      } else {
        KIPLATFORM_UI.WarpPointer(this.m_parentPanel, screenPos.x, screenPos.y);
      }
    } else {
      KIPLATFORM_UI.WarpPointer(this.m_parentPanel, aPosition.x, aPosition.y);
    }

    // If we are not refreshing because of mouse movement, don't set the modifiers because we
    // are refreshing for keyboard movement, which uses the same modifiers for other actions
    this.refreshMouse(this.m_updateCursor);
  }

  /// @copydoc VIEW_CONTROLS::CenterOnCursor()
  override CenterOnCursor(): void {
    const screenSize = this.m_view.GetGAL().GetScreenPixelSize();
    // VECTOR2I / 2, then to VECTOR2D
    const screenCenter: VECTOR2D = {
      x: Math.trunc(screenSize.x / 2),
      y: Math.trunc(screenSize.y / 2),
    };

    const mp = this.GetMousePosition(false);

    if (mp.x !== screenCenter.x || mp.y !== screenCenter.y) {
      const newCenter = this.GetCursorPosition();

      if (KIPLATFORM_UI.WarpPointer(this.m_parentPanel, screenCenter.x, screenCenter.y)) {
        this.m_view.SetCenter(newCenter);
        this.m_dragStartPoint = screenCenter;
      }
    }
  }

  override PinCursorInsideNonAutoscrollArea(aWarpMouseCursor: boolean): void {
    let border = Math.trunc(
      Math.min(
        this.m_settings.m_autoPanMargin * this.m_view.GetScreenPixelSize().x,
        this.m_settings.m_autoPanMargin * this.m_view.GetScreenPixelSize().y,
      ),
    );
    border += 2;

    let topLeft: VECTOR2D = { x: border, y: border };
    let botRight: VECTOR2D = {
      x: this.m_view.GetScreenPixelSize().x - border,
      y: this.m_view.GetScreenPixelSize().y - border,
    };

    topLeft = this.m_view.ToWorld(topLeft);
    botRight = this.m_view.ToWorld(botRight);

    const pos = { ...this.GetMousePosition(true) };

    if (pos.x < topLeft.x) pos.x = topLeft.x;
    else if (pos.x > botRight.x) pos.x = botRight.x;

    if (pos.y < topLeft.y) pos.y = topLeft.y;
    else if (pos.y > botRight.y) pos.y = botRight.y;

    this.SetCursorPosition(pos, false, false, 0);

    if (aWarpMouseCursor) this.WarpMouseCursor(pos, true);
  }

  private handleAutoPanning(aEvent: wxMouseEvent): boolean {
    const p: VECTOR2I = { x: aEvent.GetX(), y: aEvent.GetY() };
    const pk = this.m_view.ToScreen(this.m_settings.m_lastKeyboardCursorPosition);
    const pKey: VECTOR2I = { x: Math.trunc(pk.x), y: Math.trunc(pk.y) };

    if (
      this.m_cursorWarped ||
      (this.m_settings.m_lastKeyboardCursorPositionValid && p.x === pKey.x && p.y === pKey.y)
    ) {
      // last cursor move event came from keyboard cursor control. If auto-panning is enabled
      // and the next position is inside the autopan zone, check if it really came from a mouse
      // event, otherwise disable autopan temporarily. Also temporarily disable autopan if the
      // cursor is in the autopan zone because the application warped the cursor.

      this.m_cursorWarped = false;
      return true;
    }

    this.m_cursorWarped = false;

    // Compute areas where autopanning is active
    let borderStart = Math.trunc(
      Math.min(
        this.m_settings.m_autoPanMargin * this.m_view.GetScreenPixelSize().x,
        this.m_settings.m_autoPanMargin * this.m_view.GetScreenPixelSize().y,
      ),
    );
    borderStart = Math.max(borderStart, 2);
    const borderEndX = this.m_view.GetScreenPixelSize().x - borderStart;
    const borderEndY = this.m_view.GetScreenPixelSize().y - borderStart;

    const panDirection = { ...this.m_panDirection };

    if (p.x < borderStart) panDirection.x = -(borderStart - p.x);
    else if (p.x > borderEndX) panDirection.x = p.x - borderEndX;
    else panDirection.x = 0;

    if (p.y < borderStart) panDirection.y = -(borderStart - p.y);
    else if (p.y > borderEndY) panDirection.y = p.y - borderEndY;
    else panDirection.y = 0;

    this.m_panDirection = panDirection;

    const borderHit = panDirection.x !== 0 || panDirection.y !== 0;

    switch (this.m_state) {
      case STATE.AUTO_PANNING:
        if (!borderHit) {
          this.m_panTimer.Stop();
          this.setState(STATE.IDLE);

          return false;
        }

        return true;

      case STATE.IDLE:
        if (borderHit) {
          this.setState(STATE.AUTO_PANNING);
          this.m_panTimer.Start(Math.trunc(250.0 / 60.0), true);

          return true;
        }

        return false;

      case STATE.DRAG_PANNING:
      case STATE.DRAG_ZOOMING:
        return false;
    }

    console.assert(false, 'This line should never be reached');
    return false;
  }

  private handleCursorCapture(x: number, y: number): void {
    if (this.m_settings.m_cursorCaptured) {
      let warp = false;
      const parentSize = this.m_parentPanel.GetClientSize();

      if (x < 0) {
        x = 0;
        warp = true;
      } else if (x >= parentSize.x) {
        x = parentSize.x - 1;
        warp = true;
      }

      if (y < 0) {
        y = 0;
        warp = true;
      } else if (y >= parentSize.y) {
        y = parentSize.y - 1;
        warp = true;
      }

      if (warp) KIPLATFORM_UI.WarpPointer(this.m_parentPanel, x, y);
    }
  }

  private refreshMouse(aSetModifiers: boolean): void {
    // Notify tools that the cursor position has changed in the world coordinates
    const moveEvent = new wxMouseEvent(WX_VIEW_CONTROLS.EVT_REFRESH_MOUSE);
    const msp = this.getMouseScreenPosition();
    moveEvent.SetX(msp.x);
    moveEvent.SetY(msp.y);

    if (aSetModifiers) {
      // Set the modifiers state
      moveEvent.SetControlDown(wxGetKeyState(WXK.WXK_CONTROL));
      moveEvent.SetShiftDown(wxGetKeyState(WXK.WXK_SHIFT));
      moveEvent.SetAltDown(wxGetKeyState(WXK.WXK_ALT));
    }

    this.m_cursorPos = GetClampedCoords(this.m_view.ToWorld({ x: msp.x, y: msp.y }));
    this.m_parentPanel.PostEvent(moveEvent);
  }

  private getMouseScreenPosition(): { x: number; y: number } {
    const msp = KIPLATFORM_UI.GetMousePosition();
    return this.m_parentPanel.ScreenToClient(msp);
  }

  /// Adjusts the scrollbars position to match the current viewport.
  UpdateScrollbars(): void {
    const viewport = this.m_view.GetViewport();
    const boundary = this.m_view.GetBoundary();

    this.m_scrollScale = {
      x: 2e3 / viewport.GetWidth(), // TODO it does not have to be updated so often
      y: 2e3 / viewport.GetHeight(),
    };
    const newScroll: VECTOR2I = {
      x: Math.trunc((viewport.Centre().x - boundary.GetLeft()) * this.m_scrollScale.x),
      y: Math.trunc((viewport.Centre().y - boundary.GetTop()) * this.m_scrollScale.y),
    };

    // We add the width of the scroll bar thumb to the range because the scroll range is given by
    // the full bar while the position is given by the left/top position of the thumb
    const newRange: VECTOR2I = {
      x: Math.trunc(
        this.m_scrollScale.x * boundary.GetWidth() +
          this.m_parentPanel.GetScrollThumb(wxOrientation.wxHORIZONTAL),
      ),
      y: Math.trunc(
        this.m_scrollScale.y * boundary.GetHeight() +
          this.m_parentPanel.GetScrollThumb(wxOrientation.wxVERTICAL),
      ),
    };

    // Flip scroll direction in flipped view
    if (this.m_view.IsMirroredX())
      newScroll.x = Math.trunc((boundary.GetRight() - viewport.Centre().x) * this.m_scrollScale.x);

    // Adjust scrollbars only if it is needed. Otherwise there are cases when canvas is continuously
    // refreshed (Windows)
    if (
      this.m_scrollPos.x !== newScroll.x ||
      this.m_scrollPos.y !== newScroll.y ||
      newRange.x !== this.m_parentPanel.GetScrollRange(wxOrientation.wxHORIZONTAL) ||
      newRange.y !== this.m_parentPanel.GetScrollRange(wxOrientation.wxVERTICAL)
    ) {
      this.m_parentPanel.SetScrollbars(
        1,
        1,
        newRange.x,
        newRange.y,
        newScroll.x,
        newScroll.y,
        true,
      );
      this.m_scrollPos = newScroll;

      // Trigger a mouse refresh to get the canvas update in GTK (re-draws the scrollbars).
      // Note that this causes an infinite loop on OSX and Windows (in certain cases) as it
      // generates a paint event.
      this.refreshMouse(false);
    }
  }

  override ForceCursorPosition(aEnabled: boolean, aPosition: VECTOR2D = { x: 0, y: 0 }): void {
    const clampedPosition = GetClampedCoords(aPosition);

    this.m_settings.m_forceCursorPosition = aEnabled;
    this.m_settings.m_forcedPosition = clampedPosition;
  }
}

// ---------------------------------------------------------------------------------------------
// The input preferences WX_VIEW_CONTROLS::LoadSettings reads (COMMON_SETTINGS::INPUT,
// wx_view_controls.cpp:170-214), and the wheel logic as a pure function of the event and them,
// so each canvas applies the returned zoom factor or pan delta to its own viewport.

export interface InputPrefs {
  zoomSpeed: number; // 1..10 (input.zoom_speed)
  zoomSpeedAuto: boolean;
  /** `input.zoom_acceleration` — ACCELERATING_ZOOM_CONTROLLER instead of the
   *  constant one. Only consulted when `zoomSpeedAuto` is off; see
   *  {@link zoomControllerFor}. */
  zoomAcceleration: boolean;
  centerOnZoom: boolean;
  reverseZoom: boolean;
  scrollModZoom: ScrollModifier;
  scrollModPanH: ScrollModifier;
  scrollModPanV: ScrollModifier;
  reverseScrollPanH: boolean;
  horizontalPan: boolean;
  /** `input.motion_pan_modifier` — the key that pans on a bare pointer move. */
  motionPanModifier: ScrollModifier;
  /** `input.auto_pan` — `m_autoPanSettingEnabled`, the Preferences half of the
   *  gate at `wx_view_controls.cpp:304`. */
  autoPan: boolean;
  /** `input.auto_pan_acceleration` — `m_autoPanAcceleration`, 1..10. */
  autoPanAcceleration: number;
  mouseLeft: 'select' | 'drag_selected' | 'drag_any';
  mouseMiddle: 'pan' | 'zoom' | 'none';
  mouseRight: 'pan' | 'zoom' | 'none';
  /** eeschema input.drag_is_move: the mouse-drag gesture performs a Move
   *  (leave wires behind) instead of a Drag (rubber-band them along). */
  dragIsMove: boolean;
  autoStartWires: boolean;
  crosshair: 'small' | 'full' | '45';
  alwaysShowCrosshair: boolean;
}

export const DEFAULT_INPUT_PREFS: InputPrefs = {
  zoomSpeed: 1,
  zoomSpeedAuto: true,
  zoomAcceleration: false,
  centerOnZoom: true,
  reverseZoom: false,
  scrollModZoom: 'none',
  scrollModPanH: 'ctrl',
  scrollModPanV: 'shift',
  reverseScrollPanH: false,
  horizontalPan: false,
  motionPanModifier: 'none',
  autoPan: false,
  // `view_controls.cpp:71`, and the PARAM's own default (`common_settings.cpp:245`).
  autoPanAcceleration: 5,
  mouseLeft: 'drag_selected',
  mouseMiddle: 'pan',
  mouseRight: 'pan',
  dragIsMove: false,
  autoStartWires: true,
  // KiCad's defaults (app_settings.cpp): SMALL_CROSS, and the crosshair shown
  // whatever tool is active.
  crosshair: 'small',
  alwaysShowCrosshair: true,
};

/**
 * The live `COMMON_SETTINGS::m_Input` read behind {@link commonInputPrefs}.
 * `common/` may not read an app's settings singleton, so — the same shape
 * `common/gal/kicursors.ts`'s `setCustomCursorsEnabledProvider` and
 * `pcbnew/pcbTheme.ts`'s `setColorSettingsByIdProvider` use — it is a
 * swappable hook, defaulting to {@link DEFAULT_INPUT_PREFS} until an app
 * registers a live getter.
 */
let commonInputPrefsProvider: () => InputPrefs = () => DEFAULT_INPUT_PREFS;

/** Every app that owns a live settings store calls this once, at startup. */
export function setCommonInputPrefsProvider(fn: () => InputPrefs): void {
  commonInputPrefsProvider = fn;
}

/**
 * The mouse settings a canvas uses when its owner passes none: COMMON_SETTINGS
 * m_Input, the same source `WX_VIEW_CONTROLS::LoadSettings` reads
 * (`wx_view_controls.cpp:170-193`). The eeschema-only fields keep their
 * defaults, as they do for every non-eeschema frame upstream.
 */
export function commonInputPrefs(): InputPrefs {
  return commonInputPrefsProvider();
}

/** The designer's own live read, registered once by `pgm_app.ts`'s `InitPgm`. */
export function commonInputPrefsFromSettings(input: {
  zoom_speed: number;
  zoom_speed_auto: boolean;
  zoom_acceleration: boolean;
  center_on_zoom: boolean;
  reverse_scroll_zoom: boolean;
  scroll_modifier_zoom: ScrollModifier;
  scroll_modifier_pan_h: ScrollModifier;
  scroll_modifier_pan_v: ScrollModifier;
  reverse_scroll_pan_h: boolean;
  horizontal_pan: boolean;
  motion_pan_modifier: ScrollModifier;
  auto_pan: boolean;
  auto_pan_acceleration: number;
  mouse_left: string;
  mouse_middle: string;
  mouse_right: string;
}): InputPrefs {
  return {
    ...DEFAULT_INPUT_PREFS,
    zoomSpeed: input.zoom_speed,
    zoomSpeedAuto: input.zoom_speed_auto,
    zoomAcceleration: input.zoom_acceleration,
    centerOnZoom: input.center_on_zoom,
    reverseZoom: input.reverse_scroll_zoom,
    scrollModZoom: input.scroll_modifier_zoom,
    scrollModPanH: input.scroll_modifier_pan_h,
    scrollModPanV: input.scroll_modifier_pan_v,
    reverseScrollPanH: input.reverse_scroll_pan_h,
    horizontalPan: input.horizontal_pan,
    motionPanModifier: input.motion_pan_modifier,
    autoPan: input.auto_pan,
    autoPanAcceleration: input.auto_pan_acceleration,
    mouseLeft: input.mouse_left as InputPrefs['mouseLeft'],
    mouseMiddle: input.mouse_middle as InputPrefs['mouseMiddle'],
    mouseRight: input.mouse_right as InputPrefs['mouseRight'],
  };
}

// ---------------------------------------------------------------------------
// Wheel handling — WX_VIEW_CONTROLS::onWheel (wx_view_controls.cpp:418-545)
// ---------------------------------------------------------------------------

/**
 * `CONSTANT_ZOOM_CONTROLLER::GTK3_SCALE` (view/zoom_controller.h:154).
 *
 * `zoom_speed_auto` does not mean "speed 1": it means "let the platform pick",
 * and `GetZoomControllerForPlatform` (wx_view_controls.cpp:56-71) returns a
 * CONSTANT_ZOOM_CONTROLLER at this scale on GTK3 (0.01 on macOS, 0.005 on
 * MSW). We are a GTK3-equivalent target, so this is the auto scale.
 */
const GTK3_SCALE = 0.002;

/** `CONSTANT_ZOOM_CONTROLLER::MANUAL_SCALE_FACTOR` (zoom_controller.h:163). */
const MANUAL_SCALE_FACTOR = 0.001;

/** `WX_VIEW_CONTROLS::onWheel`'s `wheelPanSpeed` (wx_view_controls.cpp:420). */
const WHEEL_PAN_SPEED = 0.001;

/**
 * One wheel notch in `WheelEvent.deltaY` pixels.
 *
 * No upstream counterpart — wx hands `GetWheelRotation()` a fixed unit per
 * notch, while the DOM reports a notch as ~100 px (`DOM_DELTA_PIXEL`), 3 lines
 * (`DOM_DELTA_LINE`, Firefox) or 1 page. Normalising to pixels is what makes
 * CONSTANT_ZOOM_CONTROLLER's clamp of the rotation to +/-100 mean the same
 * thing here as it does upstream.
 */
const WHEEL_NOTCH_PX = 100;

/** The wheel gesture reduced to what onWheel reads off the wxMouseEvent. */
export interface WheelInput {
  deltaX: number;
  deltaY: number;
  /** `WheelEvent.deltaMode`: 0 pixels, 1 lines, 2 pages. Defaults to pixels. */
  deltaMode?: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  /** Cmd on macOS, which we treat as Control the way wx maps it. */
  metaKey?: boolean;
}

/** What the canvas should do with the gesture. */
export type WheelAction =
  /** `VIEW::SetScale( GetScale() * factor, anchor )`, anchor = the cursor. */
  | { kind: 'zoom'; factor: number }
  /** `VIEW::SetCenter( GetCenter() + delta )`, expressed as the screen-space
   *  device-pixel deltas to ADD to the view's tx/ty translation. */
  | { kind: 'pan'; dx: number; dy: number }
  /** `aEvent.Skip()` — the view does nothing and the tools get the event. */
  | { kind: 'none' };

/** deltaY/deltaX in pixels, whatever unit the browser reported them in. */
function toPixels(delta: number, deltaMode: number | undefined): number {
  if (deltaMode === 1) return (delta * WHEEL_NOTCH_PX) / 3; // 3 lines = 1 notch
  if (deltaMode === 2) return delta * WHEEL_NOTCH_PX;
  return delta;
}

/**
 * `CONSTANT_ZOOM_CONTROLLER::GetScaleForRotation`
 * (common/view/zoom_controller.cpp:125-137), with the scale chosen by
 * `WX_VIEW_CONTROLS::LoadSettings` (wx_view_controls.cpp:195-213).
 *
 * `aRotation` is wx's wheel rotation: positive is wheel-up / zoom-in.
 */
export function zoomScaleForRotation(rotation: number, prefs: InputPrefs): number {
  const scale = prefs.zoomSpeedAuto ? GTK3_SCALE : MANUAL_SCALE_FACTOR * prefs.zoomSpeed;
  // aRotation = ( aRotation > 0 ) ? min( aRotation, 100 ) : max( aRotation, -100 )
  const rot = rotation > 0 ? Math.min(rotation, 100) : Math.max(rotation, -100);
  const dscale = rot * scale;
  return rot > 0 ? 1 + dscale : 1 / (1 - dscale);
}

/** `ACCELERATING_ZOOM_CONTROLLER::DEFAULT_TIMEOUT` (zoom_controller.h:75). */
const ACC_TIMEOUT_MS = 500;

/** `GetScaleForRotation`'s `minStep` (zoom_controller.cpp:75). */
const ACC_MIN_STEP = 1.05;

/** `KIGFX::ZOOM_CONTROLLER` — one virtual, `GetScaleForRotation`. */
export interface ZoomController {
  getScaleForRotation(rotation: number): number;
}

/**
 * `ACCELERATING_ZOOM_CONTROLLER` (`common/view/zoom_controller.cpp:73-108`),
 * which is what Preferences > Mouse and Touchpad > "Use zoom acceleration"
 * selects. This port only ever built the constant controller, so the checkbox
 * had nothing behind it.
 *
 * It is a class and not a pure function because it is one upstream, for the
 * same reason: the scale depends on how long ago the previous wheel event was
 * and which way it turned, so the controller has to remember. Upstream each
 * `WX_VIEW_CONTROLS` owns one (`m_zoomController`), so each canvas has its
 * own; ours do too.
 *
 * The timestamp source is injected, exactly as upstream injects
 * `TIMESTAMP_PROVIDER` -- and for the reason upstream states in the header,
 * that a controller whose clock cannot be moved cannot be tested.
 */
export class AcceleratingZoomController implements ZoomController {
  private prev: number;
  private prevRotationPositive = false;

  constructor(
    /** `m_scale`, "a multiplier for the minimum zoom step size" (zoom_controller.h:134). */
    private readonly scale: number,
    /** `m_accTimeout`. */
    private readonly accTimeout: number = ACC_TIMEOUT_MS,
    /** `TIMESTAMP_PROVIDER::GetTimestamp`, in milliseconds. */
    private readonly now: () => number = defaultNow,
  ) {
    // `m_prevTimestamp = m_timestampProv->GetTimestamp();` in the ctor body.
    this.prev = now();
  }

  getScaleForRotation(rotation: number): number {
    const timestamp = this.now();
    // `duration_cast<TIMEOUT>` truncates toward zero into whole milliseconds.
    const timeDiff = Math.trunc(timestamp - this.prev);
    this.prev = timestamp;

    let zoomScale: number;

    if (timeDiff < this.accTimeout && rotation > 0 === this.prevRotationPositive) {
      // `zoomScale = ( 2.05 * m_scale / 5.0 ) - timeDiff / m_accTimeout;`
      //
      // That subtrahend is INTEGER division of two `std::chrono::milliseconds`
      // -- `operator/(duration, duration)` yields the common rep, which is an
      // integer type -- and this branch has already established
      // `timeDiff < m_accTimeout`, so it is always 0. Written out rather than
      // dropped, because it is upstream's expression and a reader who
      // simplified it away would have no way to tell that from a port that
      // forgot the term.
      zoomScale = (2.05 * this.scale) / 5.0 - Math.trunc(timeDiff / this.accTimeout);
      // "be sure zoomScale value is significant"
      zoomScale = Math.max(zoomScale, ACC_MIN_STEP);

      if (rotation < 0) zoomScale = 1.0 / zoomScale;
    } else {
      zoomScale = rotation > 0 ? ACC_MIN_STEP : 1 / ACC_MIN_STEP;
    }

    this.prevRotationPositive = rotation > 0;
    return zoomScale;
  }
}

/** `CONSTANT_ZOOM_CONTROLLER`, as an object rather than a bare function. */
class ConstantZoomController implements ZoomController {
  constructor(private readonly prefs: InputPrefs) {}

  getScaleForRotation(rotation: number): number {
    return zoomScaleForRotation(rotation, this.prefs);
  }
}

/** `ACCELERATING_ZOOM_CONTROLLER::CLOCK::now()`, a monotonic millisecond clock. */
function defaultNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * `WX_VIEW_CONTROLS::LoadSettings`' controller tree
 * (`wx_view_controls.cpp:196-214`), whole:
 *
 *     if( cfg->m_Input.zoom_speed_auto )
 *         m_zoomController = GetZoomControllerForPlatform( cfg->m_Input.zoom_acceleration );
 *     else if( cfg->m_Input.zoom_acceleration )
 *         m_zoomController = make_unique<ACCELERATING_ZOOM_CONTROLLER>( cfg->m_Input.zoom_speed );
 *     else
 *         m_zoomController = make_unique<CONSTANT_ZOOM_CONTROLLER>(
 *                 CONSTANT_ZOOM_CONTROLLER::MANUAL_SCALE_FACTOR * cfg->m_Input.zoom_speed );
 *
 * **On this platform the first branch ignores the acceleration flag.**
 * `GetZoomControllerForPlatform` (`:55-71`) is three `#if`s, and the
 * `__WXGTK3__` one returns `CONSTANT_ZOOM_CONTROLLER( GTK3_SCALE )` without
 * looking at `aAcceleration` at all -- only the `#else` (MSW) branch consults
 * it. So with `Automatic` ticked, "Use zoom acceleration" changes nothing in a
 * Linux KiCad, and must change nothing here. That is not us declining to
 * implement it; it is the behaviour of the build we are matching, and a port
 * that "fixed" it would be wrong in a way no test upstream would catch.
 */
export function zoomControllerFor(prefs: InputPrefs, now?: () => number): ZoomController {
  if (prefs.zoomSpeedAuto) return new ConstantZoomController(prefs);
  if (prefs.zoomAcceleration)
    return new AcceleratingZoomController(prefs.zoomSpeed, undefined, now);
  return new ConstantZoomController(prefs);
}

/**
 * A canvas's `m_zoomController` member, rebuilt when the settings that choose
 * it change — which is the whole of what `LoadSettings` does with it.
 *
 * Upstream the rebuild is explicit: the Preferences dialog's OK calls
 * `LoadSettings` on every canvas. We have no such broadcast, so the object
 * checks the three values `zoomControllerFor` branches on and rebuilds itself
 * when they move. Rebuilding DISCARDS the accelerating controller's history,
 * which is also what upstream's `m_zoomController.reset()` (`:194`) does.
 */
export function makeZoomController(now?: () => number): ZoomController & {
  retune(prefs: InputPrefs): void;
} {
  let key = '';
  let ctl: ZoomController | null = null;
  return {
    retune(prefs: InputPrefs): void {
      const k = `${prefs.zoomSpeedAuto}|${prefs.zoomAcceleration}|${prefs.zoomSpeed}`;
      if (k !== key || ctl === null) {
        key = k;
        ctl = zoomControllerFor(prefs, now);
      }
    },
    getScaleForRotation(rotation: number): number {
      // `wheelAction` always calls `retune` first, so this cannot be null.
      return (ctl as ZoomController).getScaleForRotation(rotation);
    },
  };
}

/**
 * Which modifier the gesture carries, by onWheel's own rule: "Shift beats
 * control beats alt, we don't support more than one" (wx_view_controls.cpp:
 * 458-480). More than one modifier is not a view gesture at all — upstream
 * skips the event so the tools can have it.
 */
export function wheelModifier(e: WheelInput): ScrollModifier | 'multiple' {
  let nMods = 0;
  let modifiers: ScrollModifier = 'none';

  if (e.shiftKey) {
    nMods += 1;
    modifiers = 'shift';
  }
  if (e.ctrlKey || e.metaKey) {
    nMods += 1;
    if (modifiers === 'none') modifiers = 'ctrl';
  }
  if (e.altKey) {
    nMods += 1;
    if (modifiers === 'none') modifiers = 'alt';
  }

  return nMods > 1 ? 'multiple' : modifiers;
}

/**
 * `WX_VIEW_CONTROLS::onWheel` (wx_view_controls.cpp:418-545), as a pure
 * function of the event, the preferences and the canvas size.
 *
 * `viewportPx` is the canvas' size in device pixels: upstream a pan step is
 * `ToWorld( GetScreenPixelSize() ) * rotation * 0.001`, i.e. a fixed fraction
 * of the visible viewport rather than a fixed number of pixels, so it has to
 * be told how big the viewport is.
 */
export function wheelAction(
  e: WheelInput,
  prefs: InputPrefs,
  viewportPx: { width: number; height: number },
  /**
   * The canvas's own `m_zoomController` ({@link makeZoomController}).
   *
   * Optional only so that a caller which cannot hold state -- and a test that
   * is asking about the constant controller -- need not invent one. Omitting
   * it silently disables "Use zoom acceleration" for that canvas, which is why
   * `view_controls_coverage.test.ts` requires every canvas to pass one.
   */
  controller?: ZoomController & { retune(p: InputPrefs): void },
): WheelAction {
  const deltaY = toPixels(e.deltaY, e.deltaMode);
  const deltaX = toPixels(e.deltaX, e.deltaMode);

  // "Native horizontal wheel events (from mice with tilt wheels, side-button
  // scroll combos, or touchpads) are always handled as horizontal pan"
  // (wx_view_controls.cpp:422-434) — unconditionally, before any modifier is
  // looked at, and NOT gated on the horizontal_pan setting. wx delivers the
  // two axes as separate events with a wheel axis; the DOM puts both on one
  // event, so the dominant axis stands in for wxMOUSE_WHEEL_HORIZONTAL.
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return { kind: 'pan', dx: -viewportPx.width * deltaX * WHEEL_PAN_SPEED, dy: 0 };
  }

  const modifiers = wheelModifier(e);

  // "When we have multiple mods, forward it for tool handling."
  if (modifiers === 'multiple') return { kind: 'none' };

  if (modifiers === prefs.scrollModZoom) {
    // rotation = GetWheelRotation() * ( m_scrollReverseZoom ? -1 : 1 ); wx's
    // rotation is positive for wheel-up, the DOM's deltaY is negative for it.
    const rotation = -deltaY * (prefs.reverseZoom ? -1 : 1);
    // `m_zoomController->GetScaleForRotation( rotation )` (`:470`). The
    // controller is rebuilt from the settings first, which is `LoadSettings`.
    controller?.retune(prefs);
    return {
      kind: 'zoom',
      factor: controller
        ? controller.getScaleForRotation(rotation)
        : zoomScaleForRotation(rotation, prefs),
    };
  }

  // Everything that is not the zoom modifier scrolls: the pan-H modifier pans
  // left/right, and every other case (including a modifier bound to nothing)
  // falls through to a vertical pan, exactly as onWheel's else-branch does.
  const rotation = -deltaY;
  if (modifiers === prefs.scrollModPanH) {
    // scrollX = hReverse ? scrollVec.x : -scrollVec.x
    const scrollX = viewportPx.width * rotation * WHEEL_PAN_SPEED;
    return { kind: 'pan', dx: prefs.reverseScrollPanH ? -scrollX : scrollX, dy: 0 };
  }

  // scrollY = -scrollVec.y — the vertical pan has no reverse setting upstream.
  return { kind: 'pan', dx: 0, dy: viewportPx.height * rotation * WHEEL_PAN_SPEED };
}

// ---------------------------------------------------------------------------
// Meta-panning — WX_VIEW_CONTROLS::onMotion (wx_view_controls.cpp:288-311)
// ---------------------------------------------------------------------------

/** The modifier state `wxGetKeyState` would report, off a DOM pointer event. */
export interface ModifierState {
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  /** Cmd on macOS, which wx maps to Control. */
  metaKey?: boolean;
}

/** Whether the key Preferences names in `motion_pan_modifier` is down. */
function motionPanKeyDown(modifier: ScrollModifier, e: ModifierState): boolean {
  switch (modifier) {
    case 'alt':
      return e.altKey;
    case 'ctrl':
      return e.ctrlKey || e.metaKey === true;
    case 'shift':
      return e.shiftKey;
    // `m_motionPanModifier != WXK_NONE` — the PARAM's default is 0, WXK_NONE,
    // and the panel's first choice is "None" (`panel_mouse_settings.cpp`).
    default:
      return false;
  }
}

/**
 * Preferences > Mouse and Touchpad > Drag Gestures > "Pan on mouse movement
 * with key": panning on a BARE pointer move, no button held, while a modifier
 * is down. `WX_VIEW_CONTROLS::onMotion` (`wx_view_controls.cpp:288-311`):
 *
 *     if( m_settings.m_motionPanModifier != WXK_NONE
 *         && wxGetKeyState( (wxKeyCode) m_settings.m_motionPanModifier ) )
 *     {
 *         if( !m_metaPanning ) { m_metaPanning = true; m_metaPanStart = mousePos; }
 *         else
 *         {
 *             VECTOR2D d = m_metaPanStart - mousePos;
 *             m_metaPanStart = mousePos;
 *             m_view->SetCenter( m_view->GetCenter() + m_view->ToWorld( d, false ) );
 *         }
 *         aEvent.Skip();
 *         return;                       // <- nothing else in onMotion runs
 *     }
 *     else
 *         m_metaPanning = false;
 *
 * The first qualifying move only ARMS it — `m_metaPanStart` has to come from
 * somewhere — so the view does not jump when the key goes down. And the block
 * RETURNS: no drag handling, no autopan, no cursor capture. Callers must do
 * the same, which is why this reports "handled" separately from the delta.
 *
 * Stateful for the same reason the zoom controller is: `m_metaPanning` and
 * `m_metaPanStart` are members of WX_VIEW_CONTROLS, so one per canvas.
 */
export function makeMotionPan(): {
  /**
   * Null when this move is not a meta-pan and the caller should carry on.
   * Otherwise the device-pixel delta to ADD to the view's translation —
   * `{ dx: 0, dy: 0 }` on the arming move — and the caller returns.
   */
  update(
    e: ModifierState & { clientX: number; clientY: number },
    modifier: ScrollModifier,
    /** devicePixelRatio: our translations are in device pixels. */
    dpr: number,
  ): { dx: number; dy: number } | null;
} {
  let panning = false;
  let startX = 0;
  let startY = 0;

  return {
    update(e, modifier, dpr) {
      if (!motionPanKeyDown(modifier, e)) {
        panning = false;
        return null;
      }

      if (!panning) {
        panning = true;
        startX = e.clientX;
        startY = e.clientY;
        return { dx: 0, dy: 0 };
      }

      // `d = m_metaPanStart - mousePos`, then `SetCenter( center + ToWorld( d ) )`
      // -- the centre moves against the pointer, so the drawing moves WITH it,
      // the same way a drag-pan does. Our canvases translate rather than
      // re-centre, so the sign flips once on the way out.
      const dx = (e.clientX - startX) * dpr;
      const dy = (e.clientY - startY) * dpr;
      startX = e.clientX;
      startY = e.clientY;
      return { dx, dy };
    },
  };
}

// ---------------------------------------------------------------------------
// Autopan — WX_VIEW_CONTROLS::handleAutoPanning (:1026-1095) + onTimer (:644-706)
// ---------------------------------------------------------------------------

/**
 * `VIEW_CONTROLS_SETTINGS::m_autoPanMargin` (`common/view/view_controls.cpp:69`).
 * [data] — a VIEW_CONTROLS default, not a Preferences setting: KiCad offers no
 * control over the margin, only over whether autopan runs and how fast.
 */
const AUTO_PAN_MARGIN = 0.02;

/**
 * `m_panTimer.Start( (int) ( 250.0 / 60.0 ), true )` (`:1087`) — 4 ms, because
 * the cast truncates 4.1666. The timer is one-shot and `onTimer` restarts it
 * (`:699`), so it is a ~250 Hz loop and each tick pans by one step.
 */
export const AUTO_PAN_INTERVAL_MS = 4;

/**
 * `handleAutoPanning`'s border maths (`wx_view_controls.cpp:1044-1063`), which
 * decides both WHETHER the pointer is in the autopan zone and HOW FAR into it.
 *
 *     int borderStart = min( margin * ScreenPixelSize().x, margin * ScreenPixelSize().y );
 *     borderStart = max( borderStart, 2 );
 *     int borderEndX = ScreenPixelSize().x - borderStart;
 *     int borderEndY = ScreenPixelSize().y - borderStart;
 *
 *     if( p.x < borderStart )       m_panDirection.x = -( borderStart - p.x );
 *     else if( p.x > borderEndX )   m_panDirection.x =  ( p.x - borderEndX );
 *     else                          m_panDirection.x = 0;
 *
 * and the same for y. The result is a SIGNED distance past the edge, not a
 * flag: `onTimer` uses its magnitude as the pan speed, so a pointer held far
 * outside pans faster than one just over the line.
 *
 * `borderStart` is the smaller of the two margins on both axes — one square
 * band, not a proportional one — and it is clamped UP to 2 px so that a canvas
 * too small for a 2 % margin still has a zone.
 */
export function autoPanDirection(
  /** The pointer, in device pixels relative to the canvas. */
  p: { x: number; y: number },
  viewportPx: { width: number; height: number },
): { x: number; y: number } {
  const borderStart = Math.max(
    Math.min(AUTO_PAN_MARGIN * viewportPx.width, AUTO_PAN_MARGIN * viewportPx.height),
    2,
  );
  const borderEndX = viewportPx.width - borderStart;
  const borderEndY = viewportPx.height - borderStart;

  const axis = (v: number, end: number): number => {
    if (v < borderStart) return -(borderStart - v);
    if (v > end) return v - end;
    return 0;
  };

  return { x: axis(p.x, borderEndX), y: axis(p.y, borderEndY) };
}

/**
 * `onTimer`'s AUTO_PANNING case (`wx_view_controls.cpp:673-698`) — how far one
 * tick moves the view centre, in device pixels.
 *
 *     double borderSize = min( margin * ScreenPixelSize().x, margin * ScreenPixelSize().y );
 *     VECTOR2D dir( m_panDirection );
 *     float accel = 0.5f + ( m_settings.m_autoPanAcceleration / 5.0f );
 *
 *     if( dir.EuclideanNorm() >= borderSize )          dir = dir.Resize( borderSize * accel );
 *     else if( dir.EuclideanNorm() > borderSize / 2 )  dir = dir.Resize( borderSize );
 *
 *     m_view->SetCenter( m_view->GetCenter() + m_view->ToWorld( dir, false ) );
 *
 * Three bands, and the third is the one a reader loses: below borderSize / 2
 * the vector is used AS IS, unresized, so the pan eases in as the pointer
 * crosses the line instead of jumping to full speed.
 *
 * `borderSize` here is NOT `handleAutoPanning`'s `borderStart`: this one is
 * never clamped up to 2. On a canvas under 100 px the two differ, and the
 * zone can then be wider than the step it produces.
 *
 * `Resize( n )` scales a vector to length n, keeping its direction.
 *
 * The Preferences slider is `m_autoPanAcceleration` (1..10), so `accel` runs
 * 0.7 to 2.5 and multiplies only the outermost band. The default is 5, giving
 * 1.5 (`view_controls.cpp:71`).
 */
export function autoPanStep(
  dir: { x: number; y: number },
  viewportPx: { width: number; height: number },
  /** `m_autoPanAcceleration` — Preferences > "Auto pan speed", 1..10. */
  acceleration: number,
): { x: number; y: number } {
  const borderSize = Math.min(
    AUTO_PAN_MARGIN * viewportPx.width,
    AUTO_PAN_MARGIN * viewportPx.height,
  );
  const norm = Math.hypot(dir.x, dir.y);
  if (norm === 0) return { x: 0, y: 0 };

  const accel = 0.5 + acceleration / 5.0;
  const resize = (n: number): { x: number; y: number } => ({
    x: (dir.x / norm) * n,
    y: (dir.y / norm) * n,
  });

  if (norm >= borderSize) return resize(borderSize * accel);
  if (norm > borderSize / 2) return resize(borderSize);
  return { x: dir.x, y: dir.y };
}

/** What a canvas gives autopan so it can run without knowing the canvas. */
export interface AutoPanIO {
  /** The canvas size in device pixels, read at every tick. */
  viewportPx: () => { width: number; height: number };
  /**
   * `m_autoPanEnabled` — whether a TOOL currently has something in flight.
   * Upstream every drawing and move tool brackets its loop with
   * `SetAutoPan( true/false )` (`sch_move_tool.cpp:997`,
   * `sch_line_wire_bus_tool.cpp:1142`, `zoom_tool.cpp:113`, and their pcbnew
   * and pl_editor equivalents), so autopan runs only while dragging an item,
   * drawing a line or framing a zoom box — never on an idle hover.
   */
  enabled: () => boolean;
  /**
   * `VIEW::SetCenter( GetCenter() + dir )`, given `dir` in device pixels.
   * Our canvases translate rather than re-centre, so the sign flips at the
   * call site: moving the centre right is moving the content left.
   */
  panBy: (dx: number, dy: number) => void;
}

/**
 * `m_panTimer` and the AUTO_PANNING state, per canvas.
 *
 * Upstream's IDLE/AUTO_PANNING transitions (`handleAutoPanning`'s switch,
 * `:1067-1092`) are the whole of what this holds: crossing into the zone
 * starts the timer, leaving it stops the timer and returns to IDLE, and
 * `onTimer` drops back to IDLE the moment `m_autoPanEnabled` goes false
 * (`:650-654`) — so releasing the item stops the pan even if the pointer never
 * moves again.
 */
export function makeAutoPan(
  io: AutoPanIO,
  /** Injected so a test can drive the timer; `setInterval` in the app. */
  schedule: (fn: () => void, ms: number) => () => void = defaultSchedule,
): {
  /**
   * `onMotion`'s `if( m_autoPanEnabled && m_autoPanSettingEnabled )
   * isAutoPanning = handleAutoPanning( aEvent )` (`:304-305`). Returns
   * upstream's `isAutoPanning`.
   */
  motion(
    p: { x: number; y: number },
    opts: { settingEnabled: boolean; acceleration: number },
  ): boolean;
  /** Leaving the canvas, or the tool finishing: back to IDLE. */
  stop(): void;
} {
  let cancel: (() => void) | null = null;
  let dir = { x: 0, y: 0 };
  let acceleration = 5;

  const stop = (): void => {
    cancel?.();
    cancel = null;
    dir = { x: 0, y: 0 };
  };

  const tick = (): void => {
    // `if( !m_settings.m_autoPanEnabled ) { setState( IDLE ); return; }` — the
    // tool letting go ends the pan without waiting for another motion event.
    if (!io.enabled()) {
      stop();
      return;
    }
    const step = autoPanStep(dir, io.viewportPx(), acceleration);
    if (step.x !== 0 || step.y !== 0) io.panBy(step.x, step.y);
  };

  return {
    motion(p, opts) {
      if (!opts.settingEnabled || !io.enabled()) {
        stop();
        return false;
      }

      acceleration = opts.acceleration;
      dir = autoPanDirection(p, io.viewportPx());
      const borderHit = dir.x !== 0 || dir.y !== 0;

      if (!borderHit) {
        // `case AUTO_PANNING: if( !borderHit ) { m_panTimer.Stop(); setState( IDLE ); return false; }`
        stop();
        return false;
      }

      // `case IDLE: if( borderHit ) { setState( AUTO_PANNING ); m_panTimer.Start( … ); return true; }`
      // Already AUTO_PANNING is `return true` with the timer left running --
      // restarting it here would reset the phase on every mouse move.
      if (cancel === null) cancel = schedule(tick, AUTO_PAN_INTERVAL_MS);
      return true;
    },
    stop,
  };
}

function defaultSchedule(fn: () => void, ms: number): () => void {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
}

// ---------------------------------------------------------------------------
// Button drags — WX_VIEW_CONTROLS::onButton (wx_view_controls.cpp:540-593)
// ---------------------------------------------------------------------------

/** `MOUSE_DRAG_ACTION`, restricted to what a middle or right drag can be. */
export type DragGesture = 'pan' | 'zoom' | 'none';

/**
 * What pressing a mouse button on the canvas starts — Preferences > Mouse and
 * Touchpad > Drag Gestures, for the middle and right buttons.
 *
 * `WX_VIEW_CONTROLS::onButton`'s IDLE branch, whole:
 *
 *     if( ( aEvent.MiddleDown() && m_settings.m_dragMiddle == MOUSE_DRAG_ACTION::PAN )
 *         || ( aEvent.RightDown() && m_settings.m_dragRight == MOUSE_DRAG_ACTION::PAN ) )
 *         setState( DRAG_PANNING );                                     :546-556
 *     else if( ( aEvent.MiddleDown() && m_settings.m_dragMiddle == MOUSE_DRAG_ACTION::ZOOM )
 *              || ( aEvent.RightDown() && m_settings.m_dragRight == MOUSE_DRAG_ACTION::ZOOM ) )
 *         setState( DRAG_ZOOMING );                                     :558-569
 *
 * so the button chooses the setting and the setting chooses the state, and
 * `NONE` is neither branch: the press falls through to the tools untouched.
 *
 * The LEFT button is deliberately absent. `m_dragLeft` is loaded beside the
 * other two (`:188`, `draw_panel_gal.cpp:833`) and `onButton` never looks at
 * it -- a left drag belongs to the selection tool, which reads the same
 * setting through `TOOLS_HOLDER::GetDragAction()` (`include/tool/tools_holder.h:144`,
 * `eeschema/tools/sch_selection_tool.cpp:506`). That is `InputPrefs.mouseLeft`
 * here, and it is a different question with different answers
 * (select / drag_selected / drag_any), which is why it is not this function's.
 *
 * Pure, and given the button number rather than the event, because upstream
 * one `WX_VIEW_CONTROLS` sits in front of every GAL canvas and answers this
 * identically for all of them. Ours are seven React components with seven
 * pointer handlers, and each hardcoded `button === 1` -> pan: the Drag
 * Gestures combos were honoured in the schematic editor and nowhere else.
 */
export function dragGesture(
  /** `PointerEvent.button`: 1 is the middle button, 2 the right. */
  button: number,
  prefs: InputPrefs,
): DragGesture {
  if (button === 1) return prefs.mouseMiddle;
  if (button === 2) return prefs.mouseRight;
  return 'none';
}

/**
 * `WX_VIEW_CONTROLS::onMotion`'s DRAG_ZOOMING step
 * (`wx_view_controls.cpp:379-388`), whole:
 *
 *     VECTOR2D d = m_dragStartPoint - mousePos;
 *     m_dragStartPoint = mousePos;
 *     double scale = exp( d.y * m_settings.m_zoomSpeed * 0.001 );
 *     m_view->SetScale( m_view->GetScale() * scale, m_view->ToWorld( m_zoomStartPoint ) );
 *
 * Two things in that are easy to get wrong, and this port had both.
 *
 * **The speed is the Zoom speed slider**, `cfg->m_Input.zoom_speed`
 * (`:184`), so dragging with the middle button set to Zoom is 10x faster at
 * speed 10 than at speed 1. Ours multiplied by a literal 0.005, which is the
 * factor for zoom_speed 5 and no other -- the slider moved and nothing
 * happened. Note it is `m_zoomSpeed` raw, NOT the zoom CONTROLLER: `Automatic`
 * (`zoom_speed_auto`) chooses a controller for the WHEEL (`:196-214`) and this
 * gesture never asks for one, so the slider governs the drag even while its
 * own control is greyed out by the Automatic box beside it.
 *
 * **`d.y` is previous minus current**, so dragging the mouse UP (a decreasing
 * y) gives a negative d.y and scales DOWN. And the anchor is
 * `m_zoomStartPoint` -- where the button went down, held fixed for the whole
 * gesture -- not the moving pointer and not the centre of the canvas.
 */
export function dragZoomScale(
  /** `d.y`: the previous pointer y minus the current one, in CSS pixels. */
  dy: number,
  prefs: InputPrefs,
): number {
  return Math.exp(dy * prefs.zoomSpeed * DRAG_ZOOM_SPEED);
}

/** The `0.001` of `exp( d.y * m_settings.m_zoomSpeed * 0.001 )` (`:383`). */
const DRAG_ZOOM_SPEED = 0.001;

// ---------------------------------------------------------------------------
// Zoom to Fit — COMMON_TOOLS::doZoomFit (common/tool/common_tools.cpp:322-408)
// ---------------------------------------------------------------------------

/**
 * The frame asking for the fit. `doZoomFit` picks its margin off the frame
 * type (`common_tools.cpp:387-401`), so this is the one thing that legitimately
 * varies per editor — and it varies by upstream's table, not by ours.
 */
export type FitFrame =
  | 'sch' // FRAME_SCH
  | 'sch_viewer' // FRAME_SCH_VIEWER — the symbol browser/preview
  | 'symbol_editor' // FRAME_SCH_SYMBOL_EDITOR
  | 'pcb' // FRAME_PCB_EDITOR
  | 'footprint_editor' // FRAME_FOOTPRINT_EDITOR
  | 'footprint_viewer' // FRAME_FOOTPRINT_VIEWER
  /**
   * FRAME_CVPCB_DISPLAY — CVPCB's footprint viewer (DISPLAY_FOOTPRINTS_FRAME).
   *
   * It is NOT `footprint_viewer`. `doZoomFit` names four frame types for the
   * bigger library-editor margin (`common_tools.cpp:387-399`) and this is not
   * one of them, so it fits on the default 1.04 like the board editor. A
   * window that reads as a viewer therefore frames its footprint *tighter*
   * than pcbnew's own footprint viewer does; that is upstream's choice.
   */
  | 'cvpcb_display'
  | 'gerber' // FRAME_GERBER
  | 'pl_editor'; // FRAME_PL_EDITOR

/** `ZOOM_FIT_TYPE_T` (include/tool/common_tools.h). */
export type FitType = 'all' | 'objects' | 'selection';

/**
 * `doZoomFit`'s `margin_scale_factor` (common_tools.cpp:381-401). The view is
 * scaled by `scale / margin_scale_factor`, so this is a multiplier on the
 * viewport, not an absolute world-space padding: the visible slack stays the
 * same fraction of the window whatever the document's size or units are.
 */
export function fitMarginScaleFactor(
  frame: FitFrame,
  clientHeightPx: number,
  fitType: FitType = 'all',
): number {
  // "Reserve enough margin to limit the amount of the view that might be
  // obscured behind the infobar."
  let margin = 1.04;

  if (clientHeightPx < 768) margin = 1.1;

  if (fitType === 'all') {
    // "Leave a bigger margin for library editors & viewers"
    if (frame === 'footprint_viewer' || frame === 'sch_viewer') margin = 1.3;
    else if (frame === 'symbol_editor' || frame === 'footprint_editor') margin = 1.48;
  }

  return margin;
}

export interface FitBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A canvas transform in device pixels: world -> screen. */
export interface FitView {
  scale: number;
  tx: number;
  ty: number;
}

/**
 * `doZoomFit`'s scale and centre, for a box in world units and a viewport in
 * device pixels.
 *
 * Upstream: `scale = GetScale() / max( |vsize.x / screenSize.x|,
 * |vsize.y / screenSize.y| )` with `GetScale()` forced to 1 and `screenSize`
 * taken `ToWorld` at that scale — which is just `min( W/w, H/h )` — then
 * `SetScale( scale / margin )` and `SetCenter( bBox.Centre() )`.
 *
 * Returns null when the box is degenerate; upstream substitutes
 * `GetDefaultViewBBox()` there, which each canvas owns, and bails to a
 * recentre when the scale is not finite (common_tools.cpp:363-379).
 */
export function zoomFitScale(
  box: FitBox,
  viewportPx: { width: number; height: number },
  frame: FitFrame,
  fitType: FitType = 'all',
): number | null {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  if (!(w > 0) || !(h > 0)) return null;

  const scale =
    Math.min(viewportPx.width / w, viewportPx.height / h) /
    fitMarginScaleFactor(frame, viewportPx.height, fitType);

  return Number.isFinite(scale) && scale > 0 ? scale : null;
}

/**
 * The whole transform, for the canvases whose world->screen map is a plain
 * scale + translate. A mirrored canvas (pcbnew's flip-board view, gerbview's
 * y-up) takes `zoomFitScale` and builds its own translation.
 */
export function zoomFitView(
  box: FitBox,
  viewportPx: { width: number; height: number },
  frame: FitFrame,
  fitType: FitType = 'all',
): FitView | null {
  const scale = zoomFitScale(box, viewportPx, frame, fitType);
  if (scale === null) return null;

  return {
    scale,
    tx: viewportPx.width / 2 - ((box.minX + box.maxX) / 2) * scale,
    ty: viewportPx.height / 2 - ((box.minY + box.maxY) / 2) * scale,
  };
}
