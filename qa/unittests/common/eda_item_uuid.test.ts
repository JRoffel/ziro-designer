// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `EDA_ITEM::m_Uuid`, drawn the first time it is read. Our copies are default-constructed and
 * then assigned the source's id (upstream copy-constructs, kiid untouched), so an eager draw in
 * the constructor was made and thrown away on every copy - and SCH_PAINTER::draw copies the
 * whole library symbol on every draw: 4.3 s of a 26 s drag profile was crypto.randomUUID.
 */
import { describe, expect, it } from 'vitest';
import { SCH_LINE } from '@ziroeda/eeschema/sch_line.js';
import { SCH_FIELD } from '@ziroeda/eeschema/sch_field.js';
import { SCH_LAYER_ID } from '@ziroeda/common/layer_id.js';

const drawn = (aItem: object): unknown => (aItem as { m_uuidValue?: string }).m_uuidValue;

describe('EDA_ITEM::m_Uuid', () => {
  it('is drawn on first read, then stays', () => {
    const line = new SCH_LINE({ x: 0, y: 0 }, SCH_LAYER_ID.LAYER_WIRE);
    expect(drawn(line)).toBeUndefined();

    const id = line.m_Uuid;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(line.m_Uuid).toBe(id);
    expect(new SCH_LINE({ x: 0, y: 0 }, SCH_LAYER_ID.LAYER_WIRE).m_Uuid).not.toBe(id);
  });

  it("a copy takes the source's id and draws none of its own", () => {
    const field = new SCH_FIELD();
    const copy = SCH_FIELD.copyOf(field);
    expect(copy.m_Uuid).toBe(field.m_Uuid);

    // A copy of a copy: the source was read once; nothing else drew.
    const fresh = new SCH_FIELD();
    (fresh as { m_Uuid: string }).m_Uuid = 'aaaaaaaa-0000-4000-8000-000000000000';
    expect(drawn(fresh)).toBe('aaaaaaaa-0000-4000-8000-000000000000');
    expect(SCH_FIELD.copyOf(fresh).m_Uuid).toBe('aaaaaaaa-0000-4000-8000-000000000000');
  });
});
