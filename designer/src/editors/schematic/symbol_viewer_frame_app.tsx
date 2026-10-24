// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The program's side of the Symbol Library Browser: what `eeschema/symbol_viewer_frame_ui.tsx`'s
 * `SYMBOL_VIEWER_FRAME_APP` asks for, wired to what `designer` has - the symbol library index every
 * chooser reads and the colour theme. `eeschema` never imports `designer`; this is the one file
 * that answers it, as `footprint_viewer_frame_app.tsx` answers the Footprint Library Browser.
 */
import { type JSX, useMemo } from 'react';
import type { KIWAY } from '@ziroeda/common/kiway.js';
import {
  SymbolViewerFrame,
  type SYMBOL_VIEWER_FRAME_APP,
} from '@ziroeda/eeschema/symbol_viewer_frame_ui.js';
import { useSchematicTheme } from '../../prefs/useSettings.js';
import { HomeLink } from '../../ui/HomeLink.js';
import { LibraryLoadingPanel } from '../../widgets/library_loading_panel.js';
import { loadIndex } from './symbols/index.js';

/** Builds the browser's `SYMBOL_VIEWER_FRAME_APP`; one object per mount. */
export function useSymbolViewerFrameApp(): SYMBOL_VIEWER_FRAME_APP {
  return useMemo<SYMBOL_VIEWER_FRAME_APP>(
    () => ({
      loadIndex,
      useSchematicTheme,
      HomeLink: ({ onClick }) => <HomeLink onClick={onClick} />,
      LibraryLoadingPanel: ({ label, fallback }) => (
        <LibraryLoadingPanel kind="symbols" fallback={fallback} label={label} />
      ),
    }),
    [],
  );
}

/** `SYMBOL_VIEWER_FRAME`, handed this program's app. */
export function SymbolViewer(props: {
  kiway?: KIWAY;
  active?: boolean;
  onClose: () => void;
  onExitToHome?: () => void;
}): JSX.Element {
  const app = useSymbolViewerFrameApp();
  return <SymbolViewerFrame app={app} {...props} />;
}
