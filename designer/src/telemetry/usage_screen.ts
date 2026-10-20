// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * What a usage event may say about where the user is: the KIND of screen, never
 * which project. No KiCad counterpart (KiCad collects nothing).
 *
 * A route carries a project's `uid`, a file path inside it and, for a GitHub
 * project, the repository's address. None of that leaves the browser: a project
 * is end-to-end encrypted precisely so that we cannot tell whose board is whose,
 * and an analytics event naming the project would undo that through the side
 * door. So a route is reduced to a short fixed label - `project/pcb`,
 * `github/schematic`, `tool/calculator` - built only from the route's enums.
 *
 * Demo ids are kept: demos are our own public projects, and which one people
 * open is exactly what the demo list needs to know.
 */
import { isGithubId } from '../home/github_id.js';
import type { Route } from '../nav/route.js';

export function screenOf(route: Route): string {
  switch (route.kind) {
    case 'home':
      return 'home';
    case 'project':
      return `project/${route.view}${route.child ? `/${route.child}` : ''}`;
    case 'demo': {
      // A GitHub repository opens as a demo whose id is its path (`gh/<owner>/<repo>...`);
      // the path names someone's repository, so it is reported only as "github".
      const where = isGithubId(route.id) ? 'github' : `demo/${route.id}`;
      return `${where}/${route.view ?? 'manager'}${route.child ? `/${route.child}` : ''}`;
    }
    case 'tool':
      return `tool/${route.tool}`;
    case 'auth':
      return `auth/${route.step}`;
  }
}

/** The referring site's host, or '' for none / ourselves - never its path or query. */
export function referrerHost(referrer: string, ownHost: string): string {
  try {
    const host = new URL(referrer).hostname;
    return host === ownHost ? '' : host;
  } catch {
    return '';
  }
}

/** The `utm_*` campaign tags of a URL, and nothing else from its query. */
export function campaignOf(href: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const params = new URL(href).searchParams;
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign'] as const) {
      const v = params.get(key);
      if (v) out[key] = v.slice(0, 64);
    }
  } catch {
    // not a URL: no campaign
  }
  return out;
}
