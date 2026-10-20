// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * The record renderer (plot, print, the design-block and colour previews) draws a label's SHOWN
 * text, which EDA_TEXT unescapes (eda_text.cpp:617): "GPIO21{slash}PCM.DOUT" is drawn as
 * GPIO21/PCM.DOUT, as the editor canvas already did. The plots showed "{slash}".
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@ziroeda/sexpr/index.js';
import { readSchematic } from '@ziroeda/eeschema/sch_io/sexpr/read-schematic.js';
import { renderSchematic } from '@ziroeda/eeschema/sch_painter.js';
import { DEFAULT_RENDER_OPTS, KICAD_DEFAULT } from '@ziroeda/eeschema/sch_render_settings.js';

function recorder(): CanvasRenderingContext2D & { __calls: string[] } {
  const calls: string[] = [];
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === '__calls') return calls;
        return (...args: unknown[]) => calls.push(`${String(prop)}(${args.join(',')})`);
      },
      set() {
        return true;
      },
    },
  ) as CanvasRenderingContext2D & { __calls: string[] };
}

class FakePath2D {
  rect(): void {}
  moveTo(): void {}
  lineTo(): void {}
}

/** Every canvas call made drawing a global label whose text is \a aText. */
function draw(aText: string): string[] {
  const doc = readSchematic(
    parse(`(kicad_sch (version 20250114) (lib_symbols)
  (global_label "${aText}" (shape input) (at 110 100 0) (effects (font (size 1.27 1.27)) (justify left)) (uuid "l1"))
)`),
  );
  const ctx = recorder();
  const scale = 0.002;
  renderSchematic(
    ctx,
    doc,
    { scale, offsetX: 400 - 1_100_000 * scale, offsetY: 300 - 1_000_000 * scale },
    KICAD_DEFAULT,
    800,
    600,
    new Set(),
    undefined,
    {
      ...DEFAULT_RENDER_OPTS,
      showPageLimits: false,
      showDrawingSheet: false,
      grid: { ...DEFAULT_RENDER_OPTS.grid, show: false },
    },
  );
  return ctx.__calls;
}

describe('record renderer: a label is drawn unescaped', () => {
  const origPath2D = globalThis.Path2D;

  it('draws {slash} as /, exactly as the label "A/B" would be drawn', () => {
    (globalThis as { Path2D?: unknown }).Path2D = FakePath2D;
    try {
      const escaped = draw('GPIO21{slash}PCM.DOUT');
      const plain = draw('GPIO21/PCM.DOUT');

      expect(escaped.length).toBeGreaterThan(0);
      expect(escaped).toEqual(plain);
      // And not the same as the seven literal characters "{slash}".
      expect(draw('GPIO21xslashxPCM.DOUT')).not.toEqual(plain);
    } finally {
      (globalThis as { Path2D?: unknown }).Path2D = origPath2D;
    }
  });
});
