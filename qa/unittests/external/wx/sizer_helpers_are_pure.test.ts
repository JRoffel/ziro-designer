// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * A sizer opens every helper among its children - a `_base` file's `UnitRow`, `Heading`,
 * `Sp` - by calling it, so the Add()s it returns become the sizer's own items
 * (external/wx/sizer.tsx, `sizerItems`). A helper called that way runs inside the
 * sizer's render: a hook in it would belong to the sizer, and move with every
 * conditional child. So no helper written directly inside a sizer may call a hook,
 * and each must be one the scan can read - defined in the same file, or the sizer's own.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const SIZERS = new Set(['BoxSizer', 'FlexGridSizer', 'GridBagSizer', 'StaticBoxSizer']);
/** The Add()s themselves, and sizer.tsx's own helper. */
const PRIMITIVES = new Set(['SizerItem', 'Spacer', 'StretchSpacer']);

/** `helper` as written directly inside a sizer in `file`, and why it fails, if it does. */
interface FINDING {
  file: string;
  helper: string;
  problem: string;
}

/** The components a sizer element has as its direct items: fragments and `cond && <X/>` opened. */
function directItems(aSizer: ts.JsxElement): string[] {
  const tags: string[] = [];
  const visit = (aNode: ts.Node): void => {
    if (ts.isJsxElement(aNode)) tags.push(aNode.openingElement.tagName.getText());
    else if (ts.isJsxSelfClosingElement(aNode)) tags.push(aNode.tagName.getText());
    else if (ts.isJsxFragment(aNode)) aNode.children.forEach(visit);
    else if (ts.isJsxExpression(aNode) && aNode.expression) visit(aNode.expression);
    else if (ts.isParenthesizedExpression(aNode)) visit(aNode.expression);
    else if (ts.isBinaryExpression(aNode)) visit(aNode.right);
    else if (ts.isConditionalExpression(aNode)) {
      visit(aNode.whenTrue);
      visit(aNode.whenFalse);
    }
  };
  aSizer.children.forEach(visit);
  return tags;
}

/** The body of the function or arrow `aName` defines at the top of the file, if it does. */
function definition(aFile: ts.SourceFile, aName: string): ts.Node | null {
  for (const st of aFile.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === aName) return st;
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name) && d.name.text === aName && d.initializer) return d.initializer;
  }
  return null;
}

/** Whether the code calls anything named `useX`. */
function callsHook(aNode: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : '';
      if (/^use[A-Z]/.test(name)) found = true;
    }
    ts.forEachChild(n, visit);
  };
  visit(aNode);
  return found;
}

function scan(aFile: string, aText: string): { helpers: string[]; findings: FINDING[] } {
  const sf = ts.createSourceFile(aFile, aText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const helpers = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isJsxElement(n) && SIZERS.has(n.openingElement.tagName.getText()))
      for (const tag of directItems(n)) if (!PRIMITIVES.has(tag)) helpers.add(tag);
    ts.forEachChild(n, visit);
  };
  visit(sf);

  const findings: FINDING[] = [];
  for (const helper of helpers) {
    const def = definition(sf, helper);
    if (!def) findings.push({ file: aFile, helper, problem: 'not defined in this file' });
    else if (callsHook(def)) findings.push({ file: aFile, helper, problem: 'calls a hook' });
  }
  return { helpers: [...helpers], findings };
}

describe('sizer helpers', () => {
  it('every helper written directly inside a sizer is defined beside it and calls no hook', () => {
    const files = execFileSync('git', ['ls-files', '*.tsx'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && !f.startsWith('qa/'));
    let helpers = 0;
    const findings: FINDING[] = [];
    for (const f of files) {
      const r = scan(f, readFileSync(join(ROOT, f), 'utf8'));
      helpers += r.helpers.length;
      findings.push(...r.findings);
    }
    expect(findings).toEqual([]);
    // The scan sees them: the _base files had 15 when this was written.
    expect(helpers).toBeGreaterThanOrEqual(15);
    // It parses every .tsx in the repo: ~2 s alone, past the 5 s default under a full run.
  }, 60_000);

  it('the scan finds a hook, an import and an arrow helper (the rule can fail)', () => {
    const text = `
      import { Imported } from './elsewhere.js';
      function Pure() { return <SizerItem />; }
      function Hooked() { const [v] = useState(0); return <SizerItem>{v}</SizerItem>; }
      const Arrow = () => { React.useMemo(() => 0, []); return <Spacer />; };
      export function X({ c }) {
        return (
          <FlexGridSizer cols={2}>
            <Pure />
            <>{c && <Hooked />}</>
            {c ? <Arrow /> : <SizerItem />}
            <Imported />
          </FlexGridSizer>
        );
      }`;
    const r = scan('x.tsx', text);
    expect(r.helpers.sort()).toEqual(['Arrow', 'Hooked', 'Imported', 'Pure']);
    expect(r.findings.map((f) => `${f.helper}: ${f.problem}`).sort()).toEqual([
      'Arrow: calls a hook',
      'Hooked: calls a hook',
      'Imported: not defined in this file',
    ]);
  });
});
