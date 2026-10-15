// Zoom smoothness in the PCB Editor, from headless Chrome over CDP.
//
//   PROF=$(mktemp -d) node qa/probes/pcb_zoom_probe.mjs http://localhost:5180/demo/ecc83
//
// Opens the PCB Editor from the project manager, then scrolls the wheel over
// the canvas at 60 Hz for 2 s. Reports the frame intervals while it does
// (rAF timestamps: a smooth zoom is ~16.7 ms every frame) and where the main
// thread spent its time (CPU profile, self time per function and per file).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const [url] = process.argv.slice(2);
const port = 9341;
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
await send('Page.navigate', { url });
// A `/pcb` URL opens the editor itself; anything else is the project manager, whose launcher
// opens it.
if (!/\/pcb\/?(\?|$)/.test(url)) {
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
    `[...document.querySelectorAll('button.ze-launcher')].find(e => e.textContent.trim().startsWith('PCB Editor')).click()`,
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
    await evalJs(
      `JSON.stringify({ url: location.href, text: document.body.innerText.slice(0, 400), launchers: [...document.querySelectorAll('button.ze-launcher')].map(b => b.textContent.trim().slice(0, 30)), canvases: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height, getComputedStyle(c).visibility]) })`,
    ),
  );
  chrome.kill();
  process.exit(1);
}
for (let i = 0; i < 600; i++) {
  await sleep(500);
  if (!(await evalJs(`document.body.innerText.includes('Load PCB')`))) break;
}
await sleep(3000);
{
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  (await import('node:fs')).writeFileSync(
    process.env.SHOT ?? '/tmp/zoom_probe.png',
    Buffer.from(shot.result.data, 'base64'),
  );
  console.log('canvas', JSON.stringify(rect));
}
// SELECT=x,y (px from the canvas centre): click there first, so the zoom runs with a selection.
if (process.env.SELECT) {
  const [dx, dy] = process.env.SELECT.split(',').map(Number);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', {
      type,
      x: rect.x + dx,
      y: rect.y + dy,
      button: 'left',
      clickCount: type === 'mouseMoved' ? 0 : 1,
    });
  await sleep(1500);
  console.log(
    'selected:',
    await evalJs(
      `[...document.querySelectorAll('.ze-props, [class*=propert]')].map(e => e.innerText.slice(0, 80)).join(' | ').slice(0, 200)`,
    ),
  );
}
await evalJs(
  `(() => { window.__frames = []; const tick = (t) => { window.__frames.push(t); if (window.__frames.length < 100000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()`,
);
// Every size a canvas takes during the zoom: a resize re-creates the GAL's framebuffers.
await evalJs(
  `(() => { window.__resizes = []; const ro = new ResizeObserver((es) => { for (const e of es) window.__resizes.push(Math.round(performance.now()) + ' ' + e.target.width + 'x' + e.target.height + ' css ' + e.contentRect.width.toFixed(2) + 'x' + e.contentRect.height.toFixed(2)); }); setTimeout(() => document.querySelectorAll('canvas').forEach((c) => ro.observe(c)), 0); })()`,
);
await sleep(200);
await evalJs('window.__resizes.length = 0');
await send('Profiler.setSamplingInterval', { interval: 200 });
await send('Profiler.start');
const t0 = await evalJs('performance.now()');
for (let i = 0; i < 120; i++) {
  await send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: rect.x + (i % 10) * 3,
    y: rect.y,
    deltaX: 0,
    deltaY: i < 60 ? -100 : 100,
  });
  await sleep(16);
}
await sleep(500);
const t1 = await evalJs('performance.now()');
const { result } = await send('Profiler.stop');
const frames = await evalJs(`window.__frames.filter(t => t >= ${t0} && t <= ${t1})`);
const d = frames
  .slice(1)
  .map((t, i) => t - frames[i])
  .sort((a, b) => a - b);
const q = (p) => d[Math.min(d.length - 1, Math.floor(p * d.length))]?.toFixed(1);
console.log(
  `${(t1 - t0).toFixed(0)} ms of wheel: ${frames.length} frames; interval p50 ${q(0.5)} p90 ${q(0.9)} p99 ${q(0.99)} max ${d.at(-1)?.toFixed(1)} ms; frames over 33 ms: ${d.filter((x) => x > 33).length}`,
);
{
  const rs = await evalJs('window.__resizes');
  console.log(`canvas resizes during the zoom: ${rs.length}`, rs.slice(0, 12).join(' | '));
}
const p = result.profile;
// PROFILE_OUT=x.cpuprofile: the raw profile, for DevTools or a deeper stack walk.
if (process.env.PROFILE_OUT)
  (await import('node:fs')).writeFileSync(process.env.PROFILE_OUT, JSON.stringify(p));
const self = new Map();
const byUrl = new Map();
const nodes = new Map(p.nodes.map((n) => [n.id, n]));
for (let i = 0; i < p.samples.length; i++) {
  const f = nodes.get(p.samples[i]).callFrame;
  const key = `${f.functionName || '(anon)'}  ${(f.url || '').split('/').pop().split('?')[0]}:${f.lineNumber}`;
  self.set(key, (self.get(key) ?? 0) + p.timeDeltas[i]);
  const u = (f.url || f.functionName).split('/').pop().split('?')[0] || f.functionName;
  byUrl.set(u, (byUrl.get(u) ?? 0) + p.timeDeltas[i]);
}
const total = [...self.values()].reduce((a, b) => a + b, 0);
console.log(`profiled ${Math.round(total / 1000)} ms; top self-time:`);
for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18))
  console.log(`  ${String(Math.round(v / 1000)).padStart(5)} ms  ${k}`);
console.log(
  'by file:',
  [...byUrl.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, v]) => `${k} ${Math.round(v / 1000)}ms`)
    .join(' | '),
);
// The stutters: what the main thread ran inside each frame interval over 33 ms. The profile's
// clock starts at Profiler.start, which `t0` follows within a round trip.
{
  const parent = new Map();
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const name = (id) => {
    const f = nodes.get(id).callFrame;
    return `${f.functionName || '(anon)'}@${(f.url || '').split('/').pop().split('?')[0]}:${f.lineNumber}`;
  };
  const slow = [];
  for (let i = 1; i < frames.length; i++)
    if (frames[i] - frames[i - 1] > 33) slow.push([frames[i - 1], frames[i]]);
  const inSlow = new Map();
  let at = 0;
  for (let i = 0; i < p.samples.length; i++) {
    at += p.timeDeltas[i];
    const t = t0 + at / 1000;
    if (!slow.some(([a, b]) => t >= a && t <= b)) continue;
    // The sample's stack, innermost first, four frames deep.
    const chain = [];
    for (let id = p.samples[i]; id !== undefined && chain.length < 4; id = parent.get(id)) {
      const k = name(id);
      if (!k.startsWith('(root)')) chain.push(k);
    }
    const key = chain.join(' < ');
    inSlow.set(key, (inSlow.get(key) ?? 0) + p.timeDeltas[i]);
  }
  console.log(
    `slow frames: ${slow.map(([a, b]) => (b - a).toFixed(0)).join(' ')} ms; inside them:`,
  );
  for (const [k, v] of [...inSlow.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25))
    console.log(`  ${String(Math.round(v / 1000)).padStart(5)} ms  ${k}`);
}
chrome.kill();
