/**
 * 2048 纯逻辑自测。运行: node test/g2048.test.js
 */
global.window = global;
const path = require('path');
const base = path.join(__dirname, '..', 'js');
require(path.join(base, 'rng.js'));
require(path.join(base, 'g2048.js'));
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

/** 按数字摆一盘（0 = 空），id 从 1 起依次分配。 */
function setup(values, seed) {
  const g = new CL.Game2048({ size: 4, seed: seed || 1 });
  let id = 1;
  g.cells = values.map((v) => (v ? { id: id++, v } : null));
  g.nextId = id;
  return g;
}
const vals = (g) => g.cells.map((t) => (t ? t.v : 0));
const row = (g, r) => vals(g).slice(r * 4, r * 4 + 4);
const col = (g, c) => [0, 1, 2, 3].map((r) => vals(g)[r * 4 + c]);

// 1. 基本合并：一行四个 2 左滑 → 4 4，每块只合一次
let g = setup([2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
let r = g.move('left');
ok(r && row(g, 0).join() === '4,4,0,0', '[2,2,2,2] 左滑得 [4,4,_,_]');
ok(r.gained === 8 && g.score === 8, '得分 = 合成出的数之和');
ok(r.merges.length === 2, '两次合并');

// 2. 合出来的块本步不再合：[2,2,4,_] 左滑 → [4,4]，不是 [8]
g = setup([2, 2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
g.move('left');
ok(row(g, 0).join() === '4,4,0,0', '新合成的块不连环合并');

// 3. 合并优先靠墙的一对：[_,2,2,2] 右滑 → [_,_,2,4]
g = setup([0, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
g.move('right');
ok(row(g, 0).join() === '0,0,2,4', '[_,2,2,2] 右滑得 [_,_,2,4]');

// 4. 中间隔空也能合：[2,_,_,2] 左滑 → [4]
g = setup([2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
g.move('left');
ok(row(g, 0)[0] === 4, '隔着空格的同值块能合并');

// 5. 竖直方向
g = setup([2, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0]);
g.move('up');
// 只看前两格：新块可能随机落在这一列空出来的下半截
ok(col(g, 0).slice(0, 2).join() === '4,8', '上滑：列 [2,2,4,4] → [4,8]');
g = setup([2, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0]);
g.move('down');
ok(col(g, 0).slice(2).join() === '4,8', '下滑：列 [2,2,4,4] → [_,_,4,8]');

// 6. 推不动的方向返回 null，且不生成新块、不改状态
g = setup([2, 4, 2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
let before = JSON.stringify(g.snapshot());
ok(g.move('left') === null, '推不动返回 null');
ok(g.move('up') === null, '已经贴墙的上滑也推不动');
ok(JSON.stringify(g.snapshot()) === before, '无效滑动不改任何状态（含随机数）');

// 7. 有效一步后生成恰好一块新的（2 或 4），落在空格上
g = setup([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
r = g.move('right');
ok(r.spawn && (r.spawn.v === 2 || r.spawn.v === 4), '生成 2 或 4');
ok(vals(g).filter(Boolean).length === 2, '滑动后多出一块');
ok(g.cells[r.spawn.at] && g.cells[r.spawn.at].id === r.spawn.id, '新块确实落在报告的位置');

// 8. 动画所需的 id 信息：合并记录指向被吃掉的两块，它们都移到合成位置
g = setup([0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // id 1 在 1 号格，id 2 在 3 号格
r = g.move('left');
ok(r.merges[0].from.join() === '1,2' && r.merges[0].at === 0, '合并记录：id 1、2 合成到 0 号格');
ok(
  r.moves.some((m) => m.id === 1 && m.to === 0) && r.moves.some((m) => m.id === 2 && m.to === 0),
  '被合并的两块都滑向合成位置'
);
ok(g.cells[0].id === r.merges[0].id, '合成块是一个新 id');

// 9. 判负：满盘且无相邻同值
g = setup([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]);
ok(!g.canMove(), '棋盘格满且无可合并 → 无路可走');
g = setup([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 4]);
ok(g.canMove(), '满盘但有一对相邻同值 → 还能走');

// 10. 走到满盘无路时 over = true
// 首行 [_,4,2,4] 左挤成 [4,2,4,_]，唯一空格补 2 → [4,2,4,2]，与下面三行交错成棋盘格
g = setup([0, 4, 2, 4, 2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4]);
g.rng = { int: () => 0, next: () => 0.5 }; // 只有一个空格；0.5 < 0.9 → 生成 2
r = g.move('left');
ok(r && r.over && g.over, '最后一格被填上且无可合并时判负');
ok(g.move('up') === null, '判负后不再接受滑动');

// 11. 首次合出 2048 报告一次，之后不再报告
g = setup([1024, 1024, 0, 0, 1024, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
r = g.move('left');
ok(r.reached2048 && g.won, '首次合出 2048 时报告');
r = g.move('down');
ok(r && !r.reached2048, '再合出 2048 不重复报告');

// 12. 快照还原 + 重做一致（撤销靠这个）
g = new CL.Game2048({ size: 4, seed: 2024 });
g.start();
const dirs = ['left', 'up', 'right', 'down'];
for (let i = 0; i < 20; i++) g.move(dirs[i % 4]) || g.move(dirs[(i + 1) % 4]);
let snap = g.snapshot();
let firstMove = null;
for (const d of dirs) {
  if ((firstMove = g.move(d))) break;
}
const after = JSON.stringify(g.snapshot());
g.restore(snap);
ok(JSON.stringify(g.snapshot()) === JSON.stringify(snap), '还原后状态与快照一致');
g.move(firstMove.dir);
ok(JSON.stringify(g.snapshot()) === after, '撤销后重做同一步，新块位置和数值完全一致');

// 13. 存档经 JSON 往返后能重建；残缺存档返回 null
const restored = CL.Game2048.fromSnapshot(JSON.parse(JSON.stringify(snap)));
ok(restored && JSON.stringify(restored.snapshot()) === JSON.stringify(snap), '存档 JSON 往返后完整重建');
ok(CL.Game2048.fromSnapshot({ size: 4, cells: [1, 2] }) === null, '残缺存档返回 null');

// 14. 同一种子 + 同一串操作 = 同一盘（确定性）
function playOut(seed) {
  const x = new CL.Game2048({ size: 4, seed });
  x.start();
  for (let i = 0; i < 200 && !x.over; i++) x.move(dirs[i % 4]) || x.move(dirs[(i + 1) % 4]);
  return JSON.stringify(x.snapshot());
}
ok(playOut(77) === playOut(77), '同种子同操作结果一致');

// 15. 跑一整局不出错，分数 = 所有合成值之和，id 全局唯一
g = new CL.Game2048({ size: 4, seed: 9 });
g.start();
let sum = 0;
let steps = 0;
while (!g.over && steps < 5000) {
  let moved = null;
  for (const d of dirs) if ((moved = g.move(d))) break;
  if (!moved) break;
  sum += moved.merges.reduce((s, m) => s + m.v, 0);
  steps++;
}
ok(g.over, '一路滑到底最终判负');
ok(g.score === sum, '总分 = 所有合成值之和');
const ids = g.cells.filter(Boolean).map((t) => t.id);
ok(new Set(ids).size === ids.length, '方块 id 不重复');

console.log(`\n通过 ${pass} / ${pass + fail}`);
process.exit(fail ? 1 : 0);
