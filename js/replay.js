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

  global.CL = global.CL || {};
  global.CL.buildFrames = buildFrames;
  global.CL.TYPE_LABEL = TYPE_LABEL;
})(window);
