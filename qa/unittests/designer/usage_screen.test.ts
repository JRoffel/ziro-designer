// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * The usage label is the only thing an analytics event says about where the
 * user is, and projects are end-to-end encrypted: a label must never carry a
 * project's uid, a file inside it, or the GitHub repository a project came from.
 */
import { describe, expect, it } from 'vitest';
import { parseRoute } from '@ziroeda/designer/src/nav/route.js';
import {
  campaignOf,
  referrerHost,
  screenOf,
} from '@ziroeda/designer/src/telemetry/usage_screen.js';

const at = (path: string): string => screenOf(parseRoute(`https://designer.ziroeda.com${path}`));

describe('screenOf', () => {
  it('keeps the kind of screen and drops the project', () => {
    const uid = '9f3c2a1b-77aa-4c1e-9d10-5e3c4a2b1f00';
    const label = at(`/p/${uid}/pcb?f=boards/my-secret-board.kicad_pcb`);
    expect(label).toBe('project/pcb');
    expect(label).not.toContain(uid);
    expect(label).not.toContain('secret');
  });

  it('keeps a child frame', () => {
    expect(at('/p/9f3c2a1b-77aa-4c1e-9d10-5e3c4a2b1f00/pcb/3d')).toBe('project/pcb/3d');
  });

  it('names our own public demos', () => {
    expect(at('/demo/ecc83')).toBe('demo/ecc83/manager');
    expect(at('/demo/ecc83/schematic')).toBe('demo/ecc83/schematic');
  });

  it('reports a GitHub project only as github, never its repository', () => {
    const label = at('/gh/someone/private-ish-repo');
    expect(label.startsWith('github/')).toBe(true);
    expect(label).not.toContain('someone');
    expect(label).not.toContain('private-ish-repo');
  });

  it('labels home, tools and sign-in', () => {
    expect(at('/')).toBe('home');
    expect(at('/calculator')).toBe('tool/calculator');
  });
});

describe('referrerHost', () => {
  it('keeps only the host of another site', () => {
    expect(
      referrerHost(
        'https://www.reddit.com/r/KiCad/comments/abc/secret_title/',
        'designer.ziroeda.com',
      ),
    ).toBe('www.reddit.com');
  });
  it('is empty for none, garbage, or ourselves', () => {
    expect(referrerHost('', 'designer.ziroeda.com')).toBe('');
    expect(referrerHost('not a url', 'designer.ziroeda.com')).toBe('');
    expect(referrerHost('https://designer.ziroeda.com/p/x/pcb', 'designer.ziroeda.com')).toBe('');
  });
});

describe('campaignOf', () => {
  it('keeps utm tags and nothing else from the query', () => {
    expect(
      campaignOf(
        'https://designer.ziroeda.com/demo/ecc83?utm_source=reddit&f=secret.kicad_pcb&utm_campaign=launch',
      ),
    ).toEqual({
      utm_source: 'reddit',
      utm_campaign: 'launch',
    });
  });
});
