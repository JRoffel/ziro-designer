// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `PCB_DESIGN_BLOCK_CONTROL` (pcbnew/tools/pcb_design_block_control.{h,cpp}) on
 * `DESIGN_BLOCK_CONTROL`: the board editor's Design Blocks tree context menu and
 * the save / update commands behind it, each followed by `notifyOtherFrames`
 * (a `MAIL_RELOAD_LIB` to the schematic editor). Placing a block is
 * PCB_CONTROL's (`AppendDesignBlock`).
 */
import { FRAME_T } from '@ziroeda/common/frame_type.js';
import type { COROUTINE_BODY } from '@ziroeda/common/tool/coroutine.js';
import { DESIGN_BLOCK_CONTROL, TreeNodeLibId } from '@ziroeda/common/tool/design_block_control.js';
import type { SELECTION } from '@ziroeda/common/tool/selection.js';
import { SELECTION_CONDITIONS } from '@ziroeda/common/tool/selection_conditions.js';
import type { TOOL_EVENT } from '@ziroeda/common/tool/tool_event.js';
import type { DESIGN_BLOCK_PANE } from '@ziroeda/common/widgets/design_block_pane.js';
import type { PCB_EDIT_FRAME } from '../pcb_edit_frame.js';
import { PCB_ACTIONS } from './pcb_actions.js';

export class PCB_DESIGN_BLOCK_CONTROL extends DESIGN_BLOCK_CONTROL {
  private m_editFrame: PCB_EDIT_FRAME | null = null;

  constructor() {
    super('pcbnew.PcbDesignBlockControl');
  }

  override Init(): boolean {
    this.m_editFrame = this.getEditFrame<PCB_EDIT_FRAME>();
    this.m_frame = this.m_editFrame;
    this.m_framesToNotify = [FRAME_T.FRAME_SCH];

    const isInLibrary = (aSel: SELECTION): boolean => this.selIsInLibrary(aSel);

    const isDesignBlock = (aSel: SELECTION): boolean => this.selIsDesignBlock(aSel);

    const hasSelection = (_aSel: SELECTION): boolean =>
      !this.m_editFrame!.GetCurrentSelection().Empty();

    const S_C = SELECTION_CONDITIONS;
    const ctxMenu = this.m_menu.GetMenu();
    this.AddContextMenuItems(ctxMenu);

    ctxMenu.AddItem(PCB_ACTIONS.placeDesignBlock, isDesignBlock, 50);
    ctxMenu.AddSeparator(50);

    ctxMenu.AddItem(PCB_ACTIONS.editDesignBlockProperties, isDesignBlock, 100);
    ctxMenu.AddItem(PCB_ACTIONS.saveBoardAsDesignBlock, isInLibrary, 100);
    ctxMenu.AddItem(
      PCB_ACTIONS.saveSelectionAsDesignBlock,
      S_C.And(isInLibrary, hasSelection),
      100,
    );
    ctxMenu.AddItem(PCB_ACTIONS.updateDesignBlockFromBoard, isDesignBlock, 100);
    ctxMenu.AddItem(
      PCB_ACTIONS.updateDesignBlockFromSelection,
      S_C.And(isDesignBlock, hasSelection),
      100,
    );
    ctxMenu.AddItem(PCB_ACTIONS.deleteDesignBlock, isDesignBlock, 100);
    ctxMenu.AddSeparator(100);

    return true;
  }

  *SaveBoardAsDesignBlock(_aEvent: TOOL_EVENT): COROUTINE_BODY<number> {
    const current = this.getCurrentTreeNode();

    if (!current) return -1;

    // This can be modified as a result of the save operation so copy it
    const libId = TreeNodeLibId(current);

    const saved = yield* this.RunMainStackModal(() =>
      this.m_editFrame!.SaveBoardAsDesignBlock(libId.GetLibNickname()),
    );

    if (!saved) return -1;

    this.notifyOtherFrames();

    return 0;
  }

  *SaveSelectionAsDesignBlock(_aEvent: TOOL_EVENT): COROUTINE_BODY<number> {
    const current = this.getCurrentTreeNode();

    if (!current) return -1;

    // This can be modified as a result of the save operation so copy it
    const libId = TreeNodeLibId(current);

    const saved = yield* this.RunMainStackModal(() =>
      this.m_editFrame!.SaveSelectionAsDesignBlock(libId.GetLibNickname()),
    );

    if (!saved) return -1;

    this.notifyOtherFrames();

    return 0;
  }

  *UpdateDesignBlockFromBoard(_aEvent: TOOL_EVENT): COROUTINE_BODY<number> {
    const current = this.getCurrentTreeNode();

    if (!current) return -1;

    // This can be modified as a result of the save operation so copy it
    const libId = TreeNodeLibId(current);

    const saved = yield* this.RunMainStackModal(() =>
      this.m_editFrame!.UpdateDesignBlockFromBoard(libId),
    );

    if (!saved) return -1;

    this.notifyOtherFrames();

    return 0;
  }

  *UpdateDesignBlockFromSelection(_aEvent: TOOL_EVENT): COROUTINE_BODY<number> {
    const current = this.getCurrentTreeNode();

    if (!current) return -1;

    // This can be modified as a result of the save operation so copy it
    const libId = TreeNodeLibId(current);

    const saved = yield* this.RunMainStackModal(() =>
      this.m_editFrame!.UpdateDesignBlockFromSelection(libId),
    );

    if (!saved) return -1;

    this.notifyOtherFrames();

    return 0;
  }

  protected override setTransitions(): void {
    super.setTransitions();

    this.Go(this.SaveBoardAsDesignBlock, PCB_ACTIONS.saveBoardAsDesignBlock.MakeEvent());
    this.Go(this.SaveSelectionAsDesignBlock, PCB_ACTIONS.saveSelectionAsDesignBlock.MakeEvent());
    this.Go(this.UpdateDesignBlockFromBoard, PCB_ACTIONS.updateDesignBlockFromBoard.MakeEvent());
    this.Go(
      this.UpdateDesignBlockFromSelection,
      PCB_ACTIONS.updateDesignBlockFromSelection.MakeEvent(),
    );
    this.Go(this.DeleteDesignBlock, PCB_ACTIONS.deleteDesignBlock.MakeEvent());
    this.Go(this.EditDesignBlockProperties, PCB_ACTIONS.editDesignBlockProperties.MakeEvent());
  }

  protected getDesignBlockPane(): DESIGN_BLOCK_PANE | null {
    return this.m_editFrame!.GetDesignBlockPane();
  }
}
