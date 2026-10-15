// Schematic Editor interaction cost (zoom, select-all + zoom, move), from headless Chrome over CDP.
//
//   PROF=~/schprobe/profile node --experimental-websocket qa/probes/sch_interact_probe.mjs http://localhost:5191/demo/cm5_minima
//   SELECT=dx,dy clicks there first (else Ctrl+A); PHASES=zoom,selzoom,move,deselect; PROFILE_DIR saves each phase.
//
// Opens the PCB Editor from the project manager, then scrolls the wheel over
// the canvas at 60 Hz for 2 s. Reports the frame intervals while it does
// (rAF timestamps: a smooth zoom is ~16.7 ms every frame) and where the main
// thread spent its time (CPU profile, self time per function and per file).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const [url] = process.argv.slice(2);
const port = 9343;
const chrome = spawn(
  '/usr/bin/google-chrome',
  [
    '--headless=new',
    '--no-sandbox',
    // ANGLE's GL backend gets no WebGL2 under Wayland here; Vulkan reaches the Intel GPU.
    ...(process.env.SWIFTSHADER
      ? ['--enable-unsafe-swiftshader']
      : ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist']),
    '--window-size=1600,1000',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${process.env.PROF}`,
    '--no-first-run',
    'about:blank',
  ],
  { stdio: 'ignore', env: { ...process.env, DISPLAY: ':0' } },
);
await sleep(1500);
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id) pending.get(m.id)(m);
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evalJs = async (expression) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result
    ?.result?.value;
await send('Page.enable');
await send('Runtime.enable');
await send('Profiler.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1600,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
  // Headless reports an 800 x 600 screen, which the desktop gate reads as a phone.
  screenWidth: 1920,
  screenHeight: 1080,
});
// Headless reports no fine pointer, which the desktop gate reads as a phone.
await send('Emulation.setEmulatedMedia', {
  features: [
    { name: 'pointer', value: 'fine' },
    { name: 'any-pointer', value: 'fine' },
  ],
});
// COUNT_GL=1: count every WebGL call during the zoom, by method.
if (process.env.COUNT_GL)
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { window.__gl = {}; window.__glOn = false; for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const k of Object.getOwnPropertyNames(C.prototype)) { const d = Object.getOwnPropertyDescriptor(C.prototype, k); if (typeof d.value !== 'function') continue; const f = d.value; C.prototype[k] = function (...a) { if (window.__glOn) window.__gl[k] = (window.__gl[k] ?? 0) + 1; return f.apply(this, a); }; } })()`,
  });
await send('Page.navigate', { url });
// A `/pcb` URL opens the editor itself; anything else is the project manager, whose launcher
// opens it.
if (!/\/sch\/?(\?|$)/.test(url)) {
  for (let i = 0; i < 150; i++) {
    await sleep(200);
    if (
      await evalJs(
        `document.body.innerText.includes('.kicad_pro') && !!document.querySelector('button.ze-launcher') && !document.querySelector('.ze-progress-dialog')`,
      )
    )
      break;
  }
  await sleep(6000);
  await evalJs(
    `[...document.querySelectorAll('button.ze-launcher')].find(e => e.textContent.trim().startsWith('Schematic Editor')).click()`,
  );
}
// The editor's canvas, laid out and visible.
let rect = null;
for (let i = 0; i < 300; i++) {
  await sleep(200);
  rect = await evalJs(
    `(() => { const at = (x, y) => document.elementFromPoint(x, y); const c = [...document.querySelectorAll('canvas')].filter(c => { const r = c.getBoundingClientRect(); if (r.width < 400 || r.height < 300) return false; const cx = r.x + r.width/2, cy = r.y + r.height/2; const hit = at(cx, cy); return hit === c || (hit && c.parentElement && c.parentElement.contains(hit)); }).sort((a,b) => b.width*b.height - a.width*a.height)[0]; if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2, w: r.width, h: r.height }; })()`,
  );
  if (rect) break;
}
if (!rect) {
  console.log('no canvas found');
  console.log(
    'DETAILS:',
    await evalJs(
      `(() => { const d = document.querySelector('details'); if (!d) return null; d.open = true; return d.innerText.slice(0, 3000); })()`,
    ),
  );
  console.log(
    await evalJs(
      `JSON.stringify({ url: location.href, text: document.body.innerText.slice(0, 400), launchers: [...document.querySelectorAll('button.ze-launcher')].map(b => b.textContent.trim().slice(0, 30)), canvases: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height, getComputedStyle(c).visibility]) })`,
    ),
  );
  chrome.kill();
  process.exit(1);
}
for (let i = 0; i < 600; i++) {
  await sleep(500);
  // The board's own load ("Loading x.kicad_pcb...", zone triangulation, connectivity) runs
  // behind a progress dialog after the canvas is up; a zoom measured over it measures the load.
  if (
    !(await evalJs(
      `/Loading .*\\.kicad_sch/i.test(document.body.innerText) || !!document.querySelector('.ze-progress-dialog')`,
    ))
  )
    break;
}
await sleep(3000);
{
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  (await import('node:fs')).writeFileSync(
    process.env.SHOT ?? `${process.env.HOME}/schprobe/shot.png`,
    Buffer.from(shot.result.data, 'base64'),
  );
  console.log('canvas', JSON.stringify(rect));
  const err = await evalJs(
    `(() => { const d = document.querySelector('details'); if (!d) return null; d.open = true; return d.innerText; })()`,
  );
  if (err) {
    console.log('CRASH:', err.slice(0, 3000));
    chrome.kill();
    process.exit(2);
  }
}

await evalJs(
  `(() => { window.__frames = []; const tick = (t) => { window.__frames.push(t); requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()`,
);
const key = async (k, code, mods = 0, vk = 0) => {
  for (const type of ['keyDown', 'keyUp'])
    await send('Input.dispatchKeyEvent', {
      type,
      key: k,
      code,
      modifiers: mods,
      windowsVirtualKeyCode: vk,
      text: type === 'keyDown' && !mods ? k : undefined,
    });
};
const mouse = (type, x, y, extra = {}) =>
  send('Input.dispatchMouseEvent', { type, x, y, ...extra });
async function phase(name, body) {
  await send('Profiler.setSamplingInterval', { interval: 200 });
  await send('Profiler.start');
  const t0 = await evalJs('performance.now()');
  await body();
  await sleep(400);
  const t1 = await evalJs('performance.now()');
  const { result } = await send('Profiler.stop');
  const frames = await evalJs(`window.__frames.filter(t => t >= ${t0} && t <= ${t1})`);
  const d = frames
    .slice(1)
    .map((t, i) => t - frames[i])
    .sort((a, b) => a - b);
  const q = (p) => d[Math.min(d.length - 1, Math.floor(p * d.length))]?.toFixed(1);
  console.log(
    `\n== ${name}: ${(t1 - t0).toFixed(0)} ms, ${frames.length} frames; interval p50 ${q(0.5)} p90 ${q(0.9)} max ${d.at(-1)?.toFixed(1)}; >33ms: ${d.filter((x) => x > 33).length}`,
  );
  const p = result.profile;
  const self = new Map();
  const nodes = new Map(p.nodes.map((n) => [n.id, n]));
  for (let i = 0; i < p.samples.length; i++) {
    const f = nodes.get(p.samples[i]).callFrame;
    const k = `${f.functionName || '(anon)'}  ${(f.url || '').split('/').pop().split('?')[0]}:${f.lineNumber}`;
    self.set(k, (self.get(k) ?? 0) + p.timeDeltas[i]);
  }
  // Inclusive time per function (each sample counted once per distinct frame on its stack).
  const parent = new Map();
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const incl = new Map();
  for (let i = 0; i < p.samples.length; i++) {
    const seen = new Set();
    for (let id = p.samples[i]; id !== undefined; id = parent.get(id)) {
      const f = nodes.get(id).callFrame;
      const k = `${f.functionName || '(anon)'}  ${(f.url || '').split('/').pop().split('?')[0]}:${f.lineNumber}`;
      if (seen.has(k)) continue;
      seen.add(k);
      incl.set(k, (incl.get(k) ?? 0) + p.timeDeltas[i]);
    }
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  console.log(`profiled ${Math.round(total / 1000)} ms; self:`);
  for (const [k, v] of [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Number(process.env.TOP ?? 14)))
    console.log(`  ${String(Math.round(v / 1000)).padStart(5)} ms  ${k}`);
  console.log('inclusive:');
  for (const [k, v] of [...incl.entries()]
    .filter(([k]) => !/^\((root|program|idle)\)/.test(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, Number(process.env.TOPI ?? 22)))
    console.log(`  ${String(Math.round(v / 1000)).padStart(5)} ms  ${k}`);
  if (process.env.PROFILE_DIR)
    (await import('node:fs')).writeFileSync(
      `${process.env.PROFILE_DIR}/${name.replace(/\W+/g, '_')}.cpuprofile`,
      JSON.stringify(p),
    );
}
const wheel = async (n) => {
  for (let i = 0; i < n; i++) {
    await mouse('mouseWheel', rect.x + (i % 10) * 3, rect.y, {
      deltaX: 0,
      deltaY: i < n / 2 ? -100 : 100,
    });
    await sleep(16);
  }
};
for (let i = 0; i < 5; i++) {
  const hit = await evalJs(
    `(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'OK' && b.offsetParent); if (b) { b.click(); return true; } return false; })()`,
  );
  if (!hit) break;
  await sleep(500);
}
await mouse('mouseMoved', rect.x, rect.y);
const only = (process.env.PHASES ?? 'zoom,selzoom,move,deselect').split(',');
if (only.includes('zoom')) await phase('zoom, nothing selected', () => wheel(60));
// SELECT=dx,dy clicks there; otherwise Ctrl+A selects everything on the sheet.
await mouse('mouseMoved', rect.x, rect.y);
if (process.env.SELECT) {
  const [dx, dy] = process.env.SELECT.split(',').map(Number);
  await mouse('mouseMoved', rect.x + dx, rect.y + dy);
  await phase('select (click)', async () => {
    await mouse('mousePressed', rect.x + dx, rect.y + dy, { button: 'left', clickCount: 1 });
    await mouse('mouseReleased', rect.x + dx, rect.y + dy, { button: 'left', clickCount: 1 });
  });
} else await phase('select all', () => key('a', 'KeyA', 2, 65));
await sleep(500);
if (only.includes('selzoom')) await phase('zoom, selection', () => wheel(60));
if (only.includes('move')) {
  await mouse('mouseMoved', rect.x, rect.y);
  await key('m', 'KeyM', 0, 77);
  await sleep(300);
  await phase('move (M), 90 pointer moves', async () => {
    for (let i = 0; i < 90; i++) {
      await mouse('mouseMoved', rect.x + i * 2, rect.y + Math.round(Math.sin(i / 8) * 40));
      await sleep(16);
    }
  });
  await key('Escape', 'Escape', 0, 27);
  await sleep(500);
}
if (only.includes('deselect')) await phase('deselect (Esc)', () => key('Escape', 'Escape', 0, 27));
chrome.kill();
process.exit(0);
