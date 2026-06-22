/**
 * 复盘重建：把一局的事件流展开成一帧帧棋盘状态，供单步回看。
 * 纯函数式重放，不碰 RNG，旧录像永远能放。
 */
(function (global) {
  'use strict';

  const TYPE_LABEL = {
    move: '移动',
    spawn: '生成新球',
    clear: '消除',
    gameover: '游戏结束',
  };

  /**
   * @param {object} session 记录器存的 session
   * @returns {Array<{index:number, board:number[], score:number, label:string, event:object|null}>}
   *   第 0 帧是开局局面，之后每个事件一帧。
   */
  function buildFrames(session) {
    const size = session.settings.size;
    let board = session.initialBoard.slice();
    let score = 0;
    const frames = [
      {
        index: 0,
        board: board.slice(),
        score: 0,
        label: '开局',
        event: null,
        highlight: [],
      },
    ];

    session.events.forEach((ev, i) => {
      let highlight = [];
      if (ev.type === 'move') {
        board[ev.to] = ev.color;
        board[ev.from] = 0;
        highlight = ev.path ? ev.path.slice() : [ev.from, ev.to];
      } else if (ev.type === 'spawn') {
        ev.balls.forEach((b) => (board[b.cell] = b.color));
        highlight = ev.balls.map((b) => b.cell);
      } else if (ev.type === 'clear') {
        ev.cells.forEach((c) => (board[c] = 0));
        score += ev.scoreGained || 0;
        highlight = ev.cells.slice();
      }
      frames.push({
        index: i + 1,
        board: board.slice(),
        score,
        label: describe(ev, size),
        event: ev,
        highlight,
      });
    });

    return frames;
  }

  function describe(ev, size) {
    const rc = (i) => `(${Math.floor(i / size) + 1},${(i % size) + 1})`;
    switch (ev.type) {
      case 'move':
        return `移动: ${rc(ev.from)} → ${rc(ev.to)}`;
      case 'spawn':
        return `生成 ${ev.balls.length} 个新球`;
      case 'clear':
        return `消除 ${ev.count} 个球, +${ev.scoreGained} 分`;
      case 'gameover':
        return `游戏结束, 最终 ${ev.finalScore} 分`;
      default:
        return ev.type;
    }
  }

  /** 评估某一手（在给定棋盘上）的得分价值，与提示引擎同一套算法。 */
  function evalMove(game, hint, from, to) {
    const b = game.cells.slice();
    const color = b[from];
    if (!color) return { value: -1, clears: 0 };
    b[to] = color;
    b[from] = 0;
    const lines = game.linesOn(b);
    if (lines.length) {
      const b2 = b.slice();
      lines.forEach((i) => (b2[i] = 0));
      return { value: 1000 * lines.length + hint.potential(game, b2), clears: lines.length };
    }
    return { value: hint.potential(game, b), clears: 0 };
  }

  /**
   * 逐手分析：对每个 move，用提示引擎算出最优手，与玩家实际走法比较。
   * 返回 { [事件index]: {best, playerValue, playerClears, missed, suboptimal} }。
   * missed = 本可消除却没消；suboptimal = 没漏消但明显有更优手。
   */
  function analyzeSession(session) {
    const Game = global.CL.Game;
    const hint = global.CL.hint;
    if (!Game || !hint) return {};
    const s = session.settings;
    const frames = buildFrames(session); // frames[i].board = 第 i 个事件发生前的棋盘
    const game = new Game({
      size: s.size,
      colors: s.colors,
      lineLength: s.lineLength,
      spawnCount: s.spawnCount,
      seed: 1,
    });
    const analysis = {};
    session.events.forEach((ev, i) => {
      if (ev.type !== 'move') return;
      game.cells = frames[i].board.slice();
      const best = hint.bestMove(game);
      const pv = evalMove(game, hint, ev.from, ev.to);
      if (!best) return;
      const missed = best.clears > 0 && pv.clears === 0;
      const suboptimal = !missed && best.value - pv.value >= 40;
      analysis[i] = { best, playerValue: pv.value, playerClears: pv.clears, missed, suboptimal };
    });
    return analysis;
  }

  global.CL = global.CL || {};
  global.CL.buildFrames = buildFrames;
  global.CL.analyzeSession = analyzeSession;
  global.CL.TYPE_LABEL = TYPE_LABEL;
})(window);
