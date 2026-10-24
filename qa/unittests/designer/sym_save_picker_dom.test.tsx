// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The Symbol Editor's wxFileDialog with wxFD_SAVE - New Library, Save Library As - as its window
 * draws it: the app's save chooser, opening on the account's Symbols folder, with the dialog
 * hook's own controls under it, the path it returns handed back to the frame. A wxFD_OPEN dialog
 * is still the open chooser.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FRAME_T } from '@ziroeda/common/frame_type.js';
import { KIWAY } from '@ziroeda/common/kiway.js';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { MakeFileDlgHookNewLibrary } from '@ziroeda/common/widgets/filedlg_hook_new_library.js';
import { SymbolEditorMount as SymbolEditor } from '@ziroeda/designer/src/editors/symbol/symbol_edit_frame_app.js';
import { SymbolLibAdapter } from '@ziroeda/eeschema/project_sch.js';
import type { SYMBOL_EDIT_FRAME } from '@ziroeda/eeschema/symbol_editor/symbol_edit_frame.js';
import {
  SYMBOL_LIBRARY_SAVE_AS_FILEDLG_HOOK,
  SYMBOL_SAVEAS_TYPE,
} from '@ziroeda/eeschema/widgets/symbol_library_save_as_filedlg_hook.js';
import { wxFD_OPEN, wxFD_OVERWRITE_PROMPT, wxFD_SAVE } from '@ziroeda/wx/defs.js';
import { MEMORY_FILESYSTEM, wxMountFileSystem } from '@ziroeda/wx/filefn.js';
import { SetErrorPresenter } from '@ziroeda/common/confirm.js';
import {
  SetFileDialog,
  SetSaveFileDialog,
  type WxFileDialogProps,
  type WxSaveFileDialogProps,
} from '@ziroeda/wx/filedlg.js';

vi.mock('@ziroeda/common/gal/gal_window.js', async (orig) => ({
  ...(await orig<typeof import('@ziroeda/common/gal/gal_window.js')>()),
  loadBitmapFontImage: () => Promise.resolve({} as ImageBitmap),
}));
vi.mock('@ziroeda/eeschema/browser/sch_canvas.js', async () => {
  const { schToolHarness } = await import('../eeschema/support/sch_tool_harness.js');
  return {
    createSchDrawPanel: (aFrame: NonNullable<Parameters<typeof schToolHarness>[0]>) => {
      schToolHarness(aFrame);
      return aFrame.GetCanvas();
    },
  };
});

/** What the app's choosers were last handed. */
let saved: WxSaveFileDialogProps | null;
let opened: WxFileDialogProps | null;

beforeEach(() => {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  vi.stubGlobal('fetch', () =>
    Promise.resolve(new Response('', { status: 404, statusText: 'Not Found' })),
  );
  saved = null;
  opened = null;
  SetSaveFileDialog((p) => {
    saved = p;
    return <div data-testid="save-chooser">{p.extra}</div>;
  });
  SetFileDialog((p) => {
    opened = p;
    return <div data-testid="open-chooser" />;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  SetSaveFileDialog(null);
  SetFileDialog(null);
  SetPgm(null);
});

async function openEditor(): Promise<SYMBOL_EDIT_FRAME> {
  const kiway = new KIWAY({
    OnKiCadExit: () => {},
    Player: () => true,
    HasProjectManager: () => true,
    ShowProjectManager: () => {},
    CreateKiWindow: () => false,
  });
  render(<SymbolEditor onExitToHome={() => {}} kiway={kiway} />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return kiway.GetPlayerFrame(FRAME_T.FRAME_SCH_SYMBOL_EDITOR) as SYMBOL_EDIT_FRAME;
}

describe('the Symbol Editor window', () => {
  it("asks the app's save chooser for wxFD_SAVE, on the Symbols folder, and hands back its path", async () => {
    const frame = await openEditor();
    let path: Promise<string | null> = Promise.resolve(null);

    act(() => {
      path = frame.FileDialog(
        "Save Library 'mine' As...",
        '',
        'mine.kicad_sym',
        [],
        wxFD_SAVE | wxFD_OVERWRITE_PROMPT,
      );
    });

    expect(screen.getByTestId('save-chooser')).toBeTruthy();
    expect(opened).toBeNull();
    expect([saved!.title, saved!.initialName, saved!.kind, saved!.initialPlace]).toEqual([
      "Save Library 'mine' As...",
      'mine.kicad_sym',
      'symbols',
      'symbols',
    ]);

    act(() => saved!.onDone('/Symbols/mine.kicad_sym'));
    expect(await path).toBe('/Symbols/mine.kicad_sym');
    expect(screen.queryByTestId('save-chooser')).toBeNull();
  });

  it('opens on the directory the frame names, when it names one', async () => {
    const frame = await openEditor();

    act(() => {
      void frame.FileDialog('New Symbol Library', '/MyBoard', 'Library.kicad_sym', [], wxFD_SAVE);
    });

    expect(saved!.initialPath).toBe('/MyBoard');
    expect(saved!.initialPlace).toBeUndefined();
  });

  it("draws Save Library As's four table choices, and the pick is the hook's", async () => {
    const frame = await openEditor();
    const hook = new SYMBOL_LIBRARY_SAVE_AS_FILEDLG_HOOK(SYMBOL_SAVEAS_TYPE.NORMAL_SAVE_AS);

    act(() => {
      void frame.FileDialog('Save As', '', 'mine.kicad_sym', [], wxFD_SAVE, hook);
    });

    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.length).toBe(4);
    expect(radios[0]!.checked).toBe(true);
    expect(hook.attached).toBe(true);

    act(() => fireEvent.click(screen.getByLabelText('Add new global library table entry')));
    expect(hook.GetOption()).toBe(SYMBOL_SAVEAS_TYPE.ADD_GLOBAL_TABLE_ENTRY);
  });

  it("draws New Library's global / project choice, and the pick is the hook's", async () => {
    const frame = await openEditor();
    const hook = MakeFileDlgHookNewLibrary(true);

    act(() => {
      void frame.ShowFileDialog('New Symbol Library', '', 'Library.kicad_sym', [], wxFD_SAVE, hook);
    });

    expect(
      (screen.getByLabelText('Add new library to global library table') as HTMLInputElement)
        .checked,
    ).toBe(true);

    act(() => fireEvent.click(screen.getByLabelText('Add new library to project library table')));
    expect(hook.useGlobalTable).toBe(false);
    expect(hook.attached).toBe(true);
  });

  it('still asks the open chooser for wxFD_OPEN', async () => {
    const frame = await openEditor();

    act(() => {
      void frame.FileDialog('Add Symbol Library', '', '', [], wxFD_OPEN);
    });

    expect(screen.getByTestId('open-chooser')).toBeTruthy();
    expect(saved).toBeNull();
  });
});

describe('a library dropped on the Symbol Editor window', () => {
  /** The account's Symbols folder, as the app mounts it, for the drop to land in. */
  const mountSymbols = () => {
    const fs = new MEMORY_FILESYSTEM();
    const unmount = wxMountFileSystem('/Symbols', fs);
    return { fs, unmount };
  };
  const drop = (aFiles: File[]) =>
    act(async () => {
      fireEvent.drop(document.querySelector('.ze-app')!, {
        dataTransfer: { files: aFiles, types: ['Files'] },
      });
      await new Promise((r) => setTimeout(r, 0));
    });

  it('is copied into the Symbols folder, and the frame adds it from there', async () => {
    const { fs, unmount } = mountSymbols();
    try {
      const frame = await openEditor();
      const dropped = vi.spyOn(frame, 'OnDropFiles');

      await drop([new File(['(kicad_symbol_lib)'], 'Mine.kicad_sym')]);

      expect(new TextDecoder().decode(fs.Read('Mine.kicad_sym')!)).toBe('(kicad_symbol_lib)');
      expect(dropped).toHaveBeenCalledWith(['/Symbols/Mine.kicad_sym']);
    } finally {
      unmount();
    }
  });

  it('leaves a file already there alone, and says so', async () => {
    const { fs, unmount } = mountSymbols();
    const errors: string[] = [];
    SetErrorPresenter((aText) => errors.push(aText));
    try {
      fs.Write('Mine.kicad_sym', new TextEncoder().encode('(old)'));
      const frame = await openEditor();
      const dropped = vi.spyOn(frame, 'OnDropFiles');

      await drop([new File(['(new)'], 'Mine.kicad_sym')]);

      expect(new TextDecoder().decode(fs.Read('Mine.kicad_sym')!)).toBe('(old)');
      expect(errors).toEqual(["Library 'Mine' already exists."]);
      expect(dropped).toHaveBeenCalledWith([]);
    } finally {
      unmount();
      SetErrorPresenter(() => {});
    }
  });

  it('copies nothing for a library the tables already have, and the frame says so', async () => {
    const { fs, unmount } = mountSymbols();
    try {
      const frame = await openEditor();
      vi.spyOn(SymbolLibAdapter(frame.Prj()), 'HasLibrary').mockImplementation(
        (aName) => aName === 'Taken',
      );
      const dropped = vi.spyOn(frame, 'OnDropFiles');

      await drop([new File(['(kicad_symbol_lib)'], 'Taken.kicad_sym')]);

      expect(fs.Read('Taken.kicad_sym')).toBeNull();
      expect(dropped).toHaveBeenCalledWith(['/Symbols/Taken.kicad_sym']);
    } finally {
      unmount();
    }
  });

  // A drag of anything but files - text, a link - is not the frame's to take.
  it('leaves a drop that carries no files to the browser', async () => {
    const frame = await openEditor();
    const dropped = vi.spyOn(frame, 'OnDropFiles');

    const unhandled = fireEvent.drop(document.querySelector('.ze-app')!, {
      dataTransfer: { files: [], types: ['text/plain'] },
    });

    expect(unhandled).toBe(true);
    expect(dropped).not.toHaveBeenCalled();
  });

  it('copies nothing the frame does not take', async () => {
    const { fs, unmount } = mountSymbols();
    try {
      await openEditor();

      await drop([new File(['x'], 'notes.txt')]);

      expect(fs.Read('notes.txt')).toBeNull();
    } finally {
      unmount();
    }
  });
});
