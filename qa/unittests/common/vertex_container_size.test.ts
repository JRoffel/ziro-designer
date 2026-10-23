// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * What a vertex container costs before it draws anything, and that it grows past that.
 *
 * KiCad starts every container at 1048576 vertices; its `malloc` commits nothing until written.
 * An ArrayBuffer is zero-filled and reserved whole, so OPENGL_GAL's five containers held 160 MB a
 * canvas, and the home page's pre-opened editors ran smaller machines out of memory (Sentry V/W).
 * Here they start at DEFAULT_SIZE and double as they fill, which changes the memory and not the
 * drawing.
 */
import { VERTEX_SIZE } from '@ziroeda/common/gal/opengl/vertex_common.js';
import { VERTEX_CONTAINER } from '@ziroeda/common/gal/opengl/vertex_container.js';
import { describe, expect, it } from 'vitest';

const gl = {
  ARRAY_BUFFER: 0x8892,
  DYNAMIC_DRAW: 0x88e8,
  NO_ERROR: 0,
  createBuffer: () => ({}),
  deleteBuffer: () => {},
  bindBuffer: () => {},
  getError: () => 0,
  bufferData: () => {},
  bufferSubData: () => {},
} as unknown as WebGL2RenderingContext;

describe('a new container', () => {
  it.each([true, false])('reserves DEFAULT_SIZE vertices and no more (cached %s)', (aCached) => {
    // The storage itself: NONCACHED_CONTAINER::GetSize() is the vertices in use (m_freePtr).
    const c = VERTEX_CONTAINER.MakeContainer(gl, aCached);
    expect(c.GetAllVertices()!.buffer.byteLength).toBe(VERTEX_CONTAINER.DEFAULT_SIZE * VERTEX_SIZE);
  });

  it('keeps an OPENGL_GAL’s five within 16 MB before it draws', () => {
    expect(5 * VERTEX_CONTAINER.DEFAULT_SIZE * VERTEX_SIZE).toBeLessThanOrEqual(16 * 1048576);
  });
});

describe('NONCACHED_CONTAINER::Allocate', () => {
  it('grows until a request fits, keeping what it held', () => {
    const c = VERTEX_CONTAINER.MakeContainer(gl, false);
    const first = c.Allocate(1);
    c.GetAllVertices()!.f32[first * (VERTEX_SIZE / 4)] = 42;

    // More than one doubling's worth at once.
    const big = 3 * VERTEX_CONTAINER.DEFAULT_SIZE;
    const at = c.Allocate(big);

    expect(c.GetAllVertices()!.size).toBeGreaterThanOrEqual(at + big);
    expect(c.GetAllVertices()!.f32[first * (VERTEX_SIZE / 4)]).toBe(42);
  });
});
