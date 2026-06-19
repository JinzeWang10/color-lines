/**
 * 游戏核心逻辑：棋盘、寻路、连线判定、生成新球。
 *
 * 设计原则（第一性）：
 *  - 逻辑层完全无 DOM、无副作用，只吃输入吐结果，方便单测与复盘重建。
 *  - 每个会改变棋盘的动作都返回一个"事件列表"，由上层决定如何渲染/记录。
 *  - 棋盘用一维数组表示，index = row * size + col，0 表示空，>0 表示颜色编号。
 */
(function (global) {
  'use strict';

  const DIRECTIONS = [
    [0, 1], // 横
    [1, 0], // 竖
    [1, 1], // 主对角
    [1, -1], // 副对角
  ];

  class Game {
    /**
     * @param {object} opts
     * @param {number} opts.size       棋盘边长 (默认 9)
     * @param {number} opts.colors     颜色数 (默认 7)
     * @param {number} opts.lineLength 连成几个消除 (默认 5)
     * @param {number} opts.spawnCount 每步生成几个新球 (默认 3)
     * @param {number} opts.seed       随机种子
     */
    constructor(opts = {}) {
      this.size = opts.size || 9;
      this.colors = opts.colors || 7;
      this.lineLength = opts.lineLength || 5; // 默认 5 连（经典 Lines 98）
      this.spawnCount = opts.spawnCount || 3;
      this.seed = opts.seed != null ? opts.seed : global.CL.makeSeed();
      this.rng = global.CL.createRng(this.seed);

      this.cells = new Array(this.size * this.size).fill(0);
      this.score = 0;
      this.over = false;
      this.next = this._rollColors(this.spawnCount); // 下一批球的颜色预告
    }

    idx(r, c) {
      return r * this.size + c;
    }
    rc(i) {
      return [Math.floor(i / this.size), i % this.size];
    }
    inBounds(r, c) {
      return r >= 0 && c >= 0 && r < this.size && c < this.size;
    }
    isEmpty(i) {
      return this.cells[i] === 0;
    }
    emptyCells() {
      const out = [];
      for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === 0) out.push(i);
      return out;
    }

    _rollColors(n) {
      const out = [];
      for (let k = 0; k < n; k++) out.push(1 + this.rng.int(this.colors));
      return out;
    }

    /** 初始放球（开局），返回 spawn 事件。 */
    initialSpawn(count) {
      const n = count != null ? count : this.spawnCount;
      const colors = this._rollColors(n);
      return this._placeAt(this._randomEmpty(n), colors);
    }

    _randomEmpty(n) {
      const empties = this.emptyCells();
      // 洗牌取前 n 个
      for (let i = empties.length - 1; i > 0; i--) {
        const j = this.rng.int(i + 1);
        [empties[i], empties[j]] = [empties[j], empties[i]];
      }
      return empties.slice(0, Math.min(n, empties.length));
    }

    _placeAt(indices, colors) {
      const placed = [];
      indices.forEach((i, k) => {
        const color = colors[k];
        this.cells[i] = color;
        placed.push({ cell: i, color });
      });
      return placed;
    }

    /**
     * BFS 寻路：从 from 到 to，只能走空格，四方向。
     * @returns {number[]|null} 路径（含起点终点的 index 序列），无法到达返回 null。
     */
    findPath(from, to) {
      if (from === to) return null;
      if (!this.isEmpty(to)) return null;
      const size = this.size;
      const prev = new Array(this.cells.length).fill(-1);
      const visited = new Array(this.cells.length).fill(false);
      const queue = [from];
      visited[from] = true;
      while (queue.length) {
        const cur = queue.shift();
        if (cur === to) {
          const path = [];
          let p = cur;
          while (p !== -1) {
            path.push(p);
            p = prev[p];
          }
          return path.reverse();
        }
        const [r, c] = this.rc(cur);
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nr = r + dr;
          const nc = c + dc;
          if (!this.inBounds(nr, nc)) continue;
          const ni = this.idx(nr, nc);
          if (visited[ni]) continue;
          // 起点上有球，但目标必须空；中途格必须空
          if (this.cells[ni] !== 0 && ni !== to) continue;
          visited[ni] = true;
          prev[ni] = cur;
          queue.push(ni);
        }
      }
      return null;
    }

    /** 扫描当前棋盘的连线。 */
    findLines() {
      return this.linesOn(this.cells);
    }

    /**
     * 扫描任意棋盘数组，找出所有 >= lineLength 的同色连线，返回要消除的 cell 集合。
     * 抽出来是为了让提示引擎能在"假想棋盘"上复用同一套判定。
     */
    linesOn(cells) {
      const toClear = new Set();
      const size = this.size;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const color = cells[this.idx(r, c)];
          if (color === 0) continue;
          for (const [dr, dc] of DIRECTIONS) {
            // 仅在"线的起点"处统计，避免重复
            const pr = r - dr;
            const pc = c - dc;
            if (this.inBounds(pr, pc) && cells[this.idx(pr, pc)] === color) continue;
            const run = [];
            let rr = r;
            let cc = c;
            while (this.inBounds(rr, cc) && cells[this.idx(rr, cc)] === color) {
              run.push(this.idx(rr, cc));
              rr += dr;
              cc += dc;
            }
            if (run.length >= this.lineLength) run.forEach((i) => toClear.add(i));
          }
        }
      }
      return [...toClear];
    }

    /** 从 from（一个球）出发，沿空格能到达的所有空格 index。 */
    reachableEmpties(from) {
      const res = [];
      const visited = new Array(this.cells.length).fill(false);
      const queue = [from];
      visited[from] = true;
      while (queue.length) {
        const cur = queue.shift();
        const [r, c] = this.rc(cur);
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nr = r + dr;
          const nc = c + dc;
          if (!this.inBounds(nr, nc)) continue;
          const ni = this.idx(nr, nc);
          if (visited[ni] || this.cells[ni] !== 0) continue;
          visited[ni] = true;
          res.push(ni);
          queue.push(ni);
        }
      }
      return res;
    }

    /** 消除指定 cell，并计分。返回 clear 事件（含本次得分）。 */
    clearCells(cells) {
      if (!cells.length) return null;
      const colors = cells.map((i) => this.cells[i]);
      cells.forEach((i) => (this.cells[i] = 0));
      const gained = this._scoreFor(cells.length);
      this.score += gained;
      return { cells: [...cells], colors, count: cells.length, scoreGained: gained };
    }

    /** 计分：达标长度得基础分，每多一个球加成递增。 */
    _scoreFor(n) {
      const L = this.lineLength;
      if (n < L) return 0;
      let s = L * 2; // 基础
      for (let extra = 1; extra <= n - L; extra++) s += L * 2 + extra * 2; // 越长奖励越多
      return s;
    }

    /**
     * 执行一步移动。这是上层调用的主入口。
     * @returns {{ok:boolean, reason?:string, events?:object[]}}
     *   events 顺序即发生顺序：move -> (clear) 或 move -> spawn -> (clear) -> [gameover]
     */
    move(from, to) {
      if (this.over) return { ok: false, reason: 'game_over' };
      if (this.isEmpty(from)) return { ok: false, reason: 'empty_source' };
      const path = this.findPath(from, to);
      if (!path) return { ok: false, reason: 'no_path' };

      const events = [];
      const color = this.cells[from];
      this.cells[to] = color;
      this.cells[from] = 0;
      events.push({ type: 'move', from, to, color, path });

      // 移动后先判定连线（落点完成连线则消除，且本回合不生成新球——经典规则）
      const linesAfterMove = this.findLines();
      if (linesAfterMove.length) {
        events.push({ type: 'clear', ...this.clearCells(linesAfterMove) });
        return { ok: true, events };
      }

      // 没消除 -> 生成新球
      const colors = this.next.slice();
      const targets = this._randomEmpty(colors.length);
      const placed = this._placeAt(targets, colors.slice(0, targets.length));
      events.push({ type: 'spawn', balls: placed });
      this.next = this._rollColors(this.spawnCount);

      // 新球也可能凑成连线
      const linesAfterSpawn = this.findLines();
      if (linesAfterSpawn.length) {
        events.push({ type: 'clear', ...this.clearCells(linesAfterSpawn) });
      }

      // 棋盘满则结束
      if (this.emptyCells().length === 0) {
        this.over = true;
        events.push({ type: 'gameover', finalScore: this.score });
      }
      return { ok: true, events };
    }

    /** 导出一个可序列化的棋盘快照（用于记录初始局面）。 */
    snapshot() {
      return this.cells.slice();
    }

    /** 完整状态快照（含随机状态），用于撤销。 */
    fullSnapshot() {
      return {
        cells: this.cells.slice(),
        score: this.score,
        next: this.next.slice(),
        over: this.over,
        rngState: this.rng.getState(),
      };
    }

    /** 从完整快照还原。 */
    restore(snap) {
      this.cells = snap.cells.slice();
      this.score = snap.score;
      this.next = snap.next.slice();
      this.over = snap.over;
      this.rng.setState(snap.rngState);
    }
  }

  global.CL = global.CL || {};
  global.CL.Game = Game;
  global.CL.DIRECTIONS = DIRECTIONS;
})(window);
