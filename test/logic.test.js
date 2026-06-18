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

// 9. rng getState/setState 可复现
let rng = CL.createRng(123);
rng.next();
let st = rng.getState();
let a = rng.next();
rng.setState(st);
let b = rng.next();
ok(a === b, 'rng setState 可复现同一序列');

// 10. 撤销：move 前 fullSnapshot，restore 后棋盘/分数/随机状态完全还原，再走一步结果一致
let g5 = new CL.Game({ size: 7, colors: 5, lineLength: 4, spawnCount: 3, seed: 555 });
g5.initialSpawn(5);
let from5 = g5.cells.findIndex((x) => x > 0);
let to5 = -1;
for (let t = 0; t < 49; t++) {
  if (g5.cells[t] === 0 && g5.findPath(from5, t)) {
    to5 = t;
    break;
  }
}
let snap = g5.fullSnapshot();
let firstMove = g5.move(from5, to5);
let afterFirst = JSON.stringify(g5.cells);
g5.restore(snap);
ok(JSON.stringify(g5.cells) === JSON.stringify(snap.cells), '撤销后棋盘还原');
ok(g5.score === snap.score, '撤销后分数还原');
// 重做同一步，结果应与第一次完全一致（含随机生成的新球）
let redo = g5.move(from5, to5);
ok(JSON.stringify(g5.cells) === afterFirst, '撤销后重做结果一致（随机状态已还原）');

// ---- 防沉迷 limit.js ----
require(path.join(base, 'limit.js'));
// node 没有 localStorage，给个内存桩
global.localStorage = {
  _d: {},
  getItem(k) {
    return k in this._d ? this._d[k] : null;
  },
  setItem(k, v) {
    this._d[k] = String(v);
  },
  removeItem(k) {
    delete this._d[k];
  },
};

// 11. 计时累加 + 提醒 + 锁定
let warned = null;
let locked = false;
let lim = new CL.PlayLimit({ dailyLimitSec: 5, warnRemainingSec: 2, idlePauseSec: 9999 });
lim.isActive = () => true;
lim.onWarn = (rem) => (warned = rem);
lim.onLock = () => (locked = true);
lim.bump();
for (let i = 0; i < 5; i++) lim._tick(); // 手动推进 5 秒
ok(lim.state.seconds === 5, '活跃时每秒累加');
ok(warned === 2, '剩余 <= 阈值时触发一次提醒');
ok(locked === true && lim.isLocked(), '达上限锁定');

// 12. 非活跃不计时
localStorage._d = {};
let lim2 = new CL.PlayLimit({ dailyLimitSec: 100 });
lim2.isActive = () => false;
lim2.bump();
lim2._tick();
lim2._tick();
ok(lim2.state.seconds === 0, '不在游戏页/不可见时不计时');

// 13. 空闲超时暂停
localStorage._d = {};
let lim3 = new CL.PlayLimit({ dailyLimitSec: 100, idlePauseSec: 60 });
lim3.isActive = () => true;
lim3.lastActivity = Date.now() - 120 * 1000; // 2 分钟没动
lim3._tick();
ok(lim3.state.seconds === 0, '空闲超过阈值暂停计时');

// 14. 跨天重置
let lim4 = new CL.PlayLimit({ dailyLimitSec: 100 });
lim4.isActive = () => true;
lim4.bump();
lim4.state = { date: '2000-1-1', seconds: 99 };
lim4.locked = true;
lim4._tick();
ok(lim4.state.seconds <= 1 && !lim4.locked, '跨天清零并解除锁定');

// ---- 提示引擎 hint.js ----
require(path.join(base, 'hint.js'));

// 15. 有"差一个就成线"的局面时，提示应给出能立即消除的一手
let gh = new CL.Game({ size: 6, colors: 4, lineLength: 4, spawnCount: 3, seed: 1 });
gh.cells = new Array(36).fill(0);
// (0,0)(0,1)(0,2) 三个红, 第四个红在 (2,3), 旁边 (0,3) 空 -> 把 (2,3) 走到 (0,3) 即成 4 连
[gh.idx(0, 0), gh.idx(0, 1), gh.idx(0, 2)].forEach((i) => (gh.cells[i] = 1));
gh.cells[gh.idx(2, 3)] = 1;
let bm = CL.hint.bestMove(gh);
ok(bm && bm.clears >= 1, '提示给出能立即消除的一手');
ok(bm && bm.to === gh.idx(0, 3), '提示的落点正确 (0,3)');

// 16. 没有立即消除时，提示倾向把同色靠拢（潜力更高），且返回合法可达走法
let gh2 = new CL.Game({ size: 6, colors: 4, lineLength: 4, seed: 2 });
gh2.cells = new Array(36).fill(0);
gh2.cells[gh2.idx(0, 0)] = 2;
gh2.cells[gh2.idx(0, 1)] = 2;
gh2.cells[gh2.idx(5, 5)] = 2; // 一个孤立同色，应被建议挪近
let bm2 = CL.hint.bestMove(gh2);
ok(bm2 && gh2.cells[bm2.from] > 0 && gh2.cells[bm2.to] === 0, '提示返回合法走法(从球到空格)');
ok(bm2 && gh2.reachableEmpties(bm2.from).includes(bm2.to), '提示的目标确实可达');

console.log(`\n通过 ${pass} / ${pass + fail}`);
process.exit(fail ? 1 : 0);
