/**
 * 提示引擎：给一手"近似最优"的走法（不是完美解）。
 *
 * 思路（第一性）：把每一个合法移动在假想棋盘上走一遍，1 层评估打分，取最高。
 *  - 能立即消除的走法压倒性优先（消除既得分又腾地方，还跳过本回合生成）。
 *  - 不消除时，用"在地可完成的连线潜力"打分：盘面上每个长度 L 的窗口，
 *    若只含一种颜色 + 空格，说明这条线还能在原地凑成，按已占数量给分。
 *  这套足够强、足够快，符合"陪练/复盘参谋"的定位。
 */
(function (global) {
  'use strict';

  const DIRS = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  function weight(k, L) {
    if (k >= L) return 0; // 满了就是消除，不算潜力
    let w = k * k;
    if (k === L - 1) w += 20; // 差一个就成线，重点鼓励
    return w;
  }

  /** 盘面潜力分：所有"单色+空格"窗口的加权和。 */
  function potential(game, cells) {
    const size = game.size;
    const L = game.lineLength;
    let total = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        for (const [dr, dc] of DIRS) {
          const er = r + dr * (L - 1);
          const ec = c + dc * (L - 1);
          if (er < 0 || ec < 0 || er >= size || ec >= size) continue;
          let color = 0;
          let k = 0;
          let ok = true;
          for (let s = 0; s < L; s++) {
            const v = cells[(r + dr * s) * size + (c + dc * s)];
            if (v === 0) continue;
            if (color === 0) color = v;
            else if (v !== color) {
              ok = false;
              break;
            }
            k++;
          }
          if (ok && k >= 2) total += weight(k, L);
        }
      }
    }
    return total;
  }

  /**
   * 返回最佳走法 {from, to, value, clears} 或 null。
   */
  function bestMove(game) {
    const cells = game.cells;
    let best = null;
    for (let from = 0; from < cells.length; from++) {
      const color = cells[from];
      if (color === 0) continue;
      const empties = game.reachableEmpties(from);
      for (const to of empties) {
        const b = cells.slice();
        b[to] = color;
        b[from] = 0;
        const lines = game.linesOn(b);
        let value;
        if (lines.length) {
          const b2 = b.slice();
          lines.forEach((i) => (b2[i] = 0));
          value = 1000 * lines.length + potential(game, b2);
        } else {
          value = potential(game, b);
        }
        if (!best || value > best.value) best = { from, to, value, clears: lines.length };
      }
    }
    return best;
  }

  global.CL = global.CL || {};
  global.CL.hint = { bestMove, potential };
})(window);
