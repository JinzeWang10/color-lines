/**
 * 2048 核心逻辑：棋盘、滑动合并、生成新块。
 *
 * 和 game.js 同一套原则：无 DOM、无副作用，每一步返回"发生了什么"，渲染和记录交给上层。
 * 每个方块带一个不变的 id——动画要知道哪块从哪滑到哪、哪两块合成了哪块，
 * 光比较前后两张数字盘是推不出来的（[2,2,2,_] 左滑，到底是哪两个 2 合了？）。
 */
(function (global) {
  'use strict';

  const DIRS = ['up', 'down', 'left', 'right'];

  class Game2048 {
    /**
     * @param {object} opts
     * @param {number} opts.size 棋盘边长 (默认 4)
     * @param {number} opts.seed 随机种子
     */
    constructor(opts = {}) {
      this.size = opts.size || 4;
      this.seed = opts.seed != null ? opts.seed : global.CL.makeSeed();
      this.rng = global.CL.createRng(this.seed);
      this.cells = new Array(this.size * this.size).fill(null); // null | { id, v }
      this.score = 0;
      this.nextId = 1;
      this.over = false;
      this.won = false; // 合出过 2048：只庆祝一次，之后可以接着玩
    }

    /** 开局放两块，返回生成记录。 */
    start() {
      return [this._spawn(), this._spawn()];
    }

    /**
     * 往一个方向滑。棋盘一点没变就返回 null（这一步不算数，也不生成新块）。
     * @returns {null | {
     *   dir, gained, over, reached2048,
     *   moves:  [{ id, from, to }],          位置变了的方块（含被合并掉的两块）
     *   merges: [{ id, v, at, from: [a, b] }], 新合成的方块，from 是被它吃掉的两块
     *   spawn:  { id, v, at },
     * }}
     */
    move(dir) {
      if (this.over || !DIRS.includes(dir)) return null;
      const moves = [];
      const merges = [];
      let gained = 0;
      const next = new Array(this.cells.length).fill(null);

      for (const line of this._lines(dir)) {
        const tiles = [];
        for (const i of line) if (this.cells[i]) tiles.push({ t: this.cells[i], at: i });
        let k = 0;
        for (let j = 0; j < tiles.length; j++) {
          const to = line[k++];
          const a = tiles[j];
          const b = tiles[j + 1];
          if (b && b.t.v === a.t.v) {
            // 一次滑动里每块最多合一次：[2,2,4] 左滑得 [4,4]，不会连环合成 8
            const m = { id: this.nextId++, v: a.t.v * 2 };
            next[to] = m;
            merges.push({ id: m.id, v: m.v, at: to, from: [a.t.id, b.t.id] });
            if (a.at !== to) moves.push({ id: a.t.id, from: a.at, to });
            moves.push({ id: b.t.id, from: b.at, to });
            gained += m.v;
            j++;
          } else {
            next[to] = a.t;
            if (a.at !== to) moves.push({ id: a.t.id, from: a.at, to });
          }
        }
      }
      // 合并必然伴随至少一块挪位，所以没有 moves 就是这个方向推不动
      if (!moves.length) return null;

      this.cells = next;
      this.score += gained;
      const reached2048 = !this.won && merges.some((m) => m.v >= 2048);
      if (reached2048) this.won = true;
      const spawn = this._spawn(); // 有效的一步之后必然至少空出一格
      this.over = !this.canMove();
      return { dir, moves, merges, gained, spawn, over: this.over, reached2048 };
    }

    /** 某方向上的每一行（或列），按离"墙"由近到远排好——方块都往 line[0] 那头挤。 */
    _lines(dir) {
      const n = this.size;
      const out = [];
      for (let a = 0; a < n; a++) {
        const line = [];
        for (let b = 0; b < n; b++) {
          if (dir === 'left') line.push(a * n + b);
          else if (dir === 'right') line.push(a * n + (n - 1 - b));
          else if (dir === 'up') line.push(b * n + a);
          else line.push((n - 1 - b) * n + a);
        }
        out.push(line);
      }
      return out;
    }

    /** 随机空格放一块：九成是 2，一成是 4（原版规则）。 */
    _spawn() {
      const empty = [];
      for (let i = 0; i < this.cells.length; i++) if (!this.cells[i]) empty.push(i);
      if (!empty.length) return null;
      const at = empty[this.rng.int(empty.length)];
      const v = this.rng.next() < 0.9 ? 2 : 4;
      const t = { id: this.nextId++, v };
      this.cells[at] = t;
      return { id: t.id, v, at };
    }

    /** 还有没有路走：有空格，或者横竖有相邻的同值块。 */
    canMove() {
      const n = this.size;
      for (let i = 0; i < this.cells.length; i++) {
        const t = this.cells[i];
        if (!t) return true;
        const right = i % n < n - 1 ? this.cells[i + 1] : null;
        const down = i + n < this.cells.length ? this.cells[i + n] : null;
        if ((right && right.v === t.v) || (down && down.v === t.v)) return true;
      }
      return false;
    }

    emptyCount() {
      return this.cells.filter((t) => !t).length;
    }

    maxTile() {
      return this.cells.reduce((m, t) => (t && t.v > m ? t.v : m), 0);
    }

    /** 可 JSON 序列化的完整状态，撤销和存档续玩都靠它（含随机状态，重做结果一致）。 */
    snapshot() {
      return {
        size: this.size,
        seed: this.seed,
        cells: this.cells.map((t) => (t ? [t.id, t.v] : 0)),
        score: this.score,
        nextId: this.nextId,
        rng: this.rng.getState(),
        over: this.over,
        won: this.won,
      };
    }

    restore(s) {
      this.cells = s.cells.map((c) => (c ? { id: c[0], v: c[1] } : null));
      this.score = s.score;
      this.nextId = s.nextId;
      this.rng.setState(s.rng);
      this.over = s.over;
      this.won = s.won;
    }

    /** 从存档重建；存档残缺返回 null，由上层开新局。 */
    static fromSnapshot(s) {
      if (!s || !Array.isArray(s.cells) || s.cells.length !== s.size * s.size) return null;
      const g = new Game2048({ size: s.size, seed: s.seed });
      g.restore(s);
      return g;
    }
  }

  global.CL = global.CL || {};
  global.CL.Game2048 = Game2048;
})(window);
