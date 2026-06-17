/**
 * 纯逻辑自测（在 node 下跑，给 IIFE 提供一个假的 window 全局）。
 * 运行: node test/logic.test.js
 */
global.window = global;
const path = require('path');
const base = path.join(__dirname, '..', 'js');
require(path.join(base, 'rng.js'));
require(path.join(base, 'game.js'));
require(path.join(base, 'replay.js'));
const CL = global.CL;

let pass = 0,
  fail = 0;
function ok(c, m) {
  if (c) pass++;
  else {
    fail++;
    console.log('FAIL:', m);
  }
}

// 1. 空盘从角到角可达
let g = new CL.Game({ size: 5, colors: 3, lineLength: 4, spawnCount: 3, seed: 12345 });
g.cells = new Array(25).fill(0);
g.cells[0] = 1;
let p = g.findPath(0, 24);
ok(p && p[0] === 0 && p[p.length - 1] === 24, '空盘从角到角可达');

// 2. 整行墙挡死
g.cells = new Array(25).fill(0);
for (let c = 0; c < 5; c++) g.cells[g.idx(1, c)] = 2;
g.cells[2] = 1;
p = g.findPath(2, g.idx(4, 2));
ok(p === null, '被整行墙挡住不可达');

// 3. 横向4连
g.cells = new Array(25).fill(0);
g.lineLength = 4;
[0, 1, 2, 3].forEach((i) => (g.cells[i] = 5));
ok(g.findLines().length === 4, '横向4连被检出');

// 4. 3连不消除
g.cells = new Array(25).fill(0);
[0, 1, 2].forEach((i) => (g.cells[i] = 5));
ok(g.findLines().length === 0, '3连不消除');

// 5. 主对角4连
g.cells = new Array(25).fill(0);
[g.idx(0, 0), g.idx(1, 1), g.idx(2, 2), g.idx(3, 3)].forEach((i) => (g.cells[i] = 6));
ok(g.findLines().length === 4, '主对角4连检出');

// 6. move 完成连线则消除且不生成新球
let g2 = new CL.Game({ size: 5, colors: 3, lineLength: 4, spawnCount: 3, seed: 99 });
g2.cells = new Array(25).fill(0);
[0, 1, 2].forEach((i) => (g2.cells[i] = 7));
g2.cells[g2.idx(2, 0)] = 7;
let r = g2.move(g2.idx(2, 0), g2.idx(0, 3));
ok(r.ok, 'move 成功');
ok(
  r.events.some((e) => e.type === 'clear') && !r.events.some((e) => e.type === 'spawn'),
  '连线消除且本回合不生成新球'
);
ok(g2.cells.filter((x) => x > 0).length === 0, '4个球消失');

// 7. move 未连线则生成新球
let g3 = new CL.Game({ size: 9, colors: 7, lineLength: 5, spawnCount: 3, seed: 7 });
g3.initialSpawn(5);
let cntBefore = g3.cells.filter((x) => x > 0).length;
let from = g3.cells.findIndex((x) => x > 0);
let to = -1;
for (let t = 0; t < 81; t++) {
  if (g3.cells[t] === 0 && g3.findPath(from, t)) {
    to = t;
    break;
  }
}
let r3 = g3.move(from, to);
ok(r3.ok, 'move2 成功');
if (r3.events.some((e) => e.type === 'spawn'))
  ok(g3.cells.filter((x) => x > 0).length >= cntBefore, '未消除时生成了新球');
else ok(true, '恰好消除(罕见)');

// 8. 复盘重建：帧数 = 事件数+1，末帧棋盘 == 实时棋盘
let g4 = new CL.Game({ size: 6, colors: 4, lineLength: 4, spawnCount: 3, seed: 42 });
g4.initialSpawn(5);
let rec = {
  settings: { size: 6, colors: 4, lineLength: 4, spawnCount: 3 },
  initialBoard: g4.snapshot(),
  events: [],
};
let tms = 0;
for (let k = 0; k < 30 && !g4.over; k++) {
  let balls = [];
  for (let i = 0; i < g4.cells.length; i++) if (g4.cells[i] > 0) balls.push(i);
  let empties = g4.emptyCells();
  if (!balls.length || !empties.length) break;
  let moved = false;
  for (const b of balls) {
    for (const e of empties) {
      if (g4.findPath(b, e)) {
        let rr = g4.move(b, e);
        rr.events.forEach((ev) => rec.events.push(Object.assign({ t: (tms += 100) }, ev)));
        moved = true;
        break;
      }
    }
    if (moved) break;
  }
  if (!moved) break;
}
let frames = CL.buildFrames(rec);
ok(frames.length === rec.events.length + 1, '帧数 = 事件数+1');
ok(
  JSON.stringify(frames[frames.length - 1].board) === JSON.stringify(g4.cells),
  '复盘末帧 == 实时棋盘'
);

console.log(`\n通过 ${pass} / ${pass + fail}`);
process.exit(fail ? 1 : 0);
