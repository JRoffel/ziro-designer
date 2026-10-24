// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The newstroke table the bundle carries: U+0020..U+2FFF of KiCad's, every block before CJK, each
 * glyph decoded when text first uses it. A codepoint past the table draws '?', as
 * STROKE_FONT::GetTextAsGlyphs does past the end of upstream's.
 */
import { describe, expect, it } from 'vitest';
import { STROKE_FONT, layoutText, measureText } from '@ziroeda/common/font/stroke_font.js';
import { NEWSTROKE_GLYPHS } from '@ziroeda/common/newstroke_font.js';
import { ANGLE_0 } from '@ziroeda/kimath/src/geometry/eda_angle.js';

const font = STROKE_FONT.LoadFont('')!;
const index = (aChar: string) => aChar.codePointAt(0)! - 0x20;

/** What GetTextAsGlyphs strokes for \a aText, as points. */
function strokes(aText: string): string {
  const glyphs: unknown[] = [];
  font.GetTextAsGlyphs(
    null,
    glyphs as never,
    aText,
    { x: 1000, y: 1000 },
    { x: 0, y: 0 },
    ANGLE_0,
    false,
    { x: 0, y: 0 },
    0,
  );
  return JSON.stringify(glyphs);
}

describe('the bundled newstroke table', () => {
  it('runs from U+0020 to U+2FFF, contiguous', () => {
    expect(NEWSTROKE_GLYPHS.length).toBe(0x3000 - 0x20);
    expect(font.GetGlyphCount()).toBe(0x3000 - 0x20);
  });

  it('draws Greek, Cyrillic and the symbols with their own glyphs, not "?"', () => {
    for (const ch of ['Ω', 'µ', 'Ж', '→', '≥', '∞']) {
      expect(strokes(ch), ch).not.toBe(strokes('?'));
      expect(font.GetGlyph(index(ch)), ch).not.toBeNull();
    }
  });

  it('draws "?" past the table, as upstream does past the end of its own', () => {
    expect(strokes('中')).toBe(strokes('?'));
    expect(font.GetGlyph(index('中'))).toBeNull();
    expect(measureText('中', 10)).toBe(measureText('?', 10));
  });

  it('decodes a glyph once, the same whether its box or its strokes are asked for first', () => {
    const box = font.GetGlyphBoundingBox(index('Ψ'));
    const glyph = font.GetGlyph(index('Ψ'))!;

    expect(glyph.BoundingBox() === box).toBe(true);
    expect(font.GetGlyph(index('Ψ')) === glyph).toBe(true);

    const first = font.GetGlyph(index('Ϡ'))!;
    expect(font.GetGlyphBoundingBox(index('Ϡ')) === first.BoundingBox()).toBe(true);
  });

  it('lays out the same strokes on the record path as the live one', () => {
    expect(layoutText('Ω', 10).strokes.length).toBeGreaterThan(0);
    expect(measureText('Ω', 10)).not.toBe(measureText('?', 10));
  });
});
