/**
 * 渲染助手：把棋盘数组画成 DOM 网格。play 视图与 replay 视图共用。
 */
(function (global) {
  'use strict';

  // 每种颜色叠一个图案（冗余编码）：不只靠颜色区分，上了年纪/色弱也能分清。
  // 索引 = 颜色编号(1..7)，0 不用。
  const SYMBOLS = ['', '●', '▲', '★', '■', '◆', '✚', '♥'];
  let patternOn = true;

  function setPattern(on) {
    patternOn = !!on;
  }

  /** 给一个 ball 元素补上图案符号。 */
  function decorate(ball, color) {
    if (!patternOn) return;
    const sym = document.createElement('span');
    sym.className = 'sym';
    sym.textContent = SYMBOLS[color] || '';
    ball.appendChild(sym);
  }

  /** 造一个球元素（含图案），extra 为附加 class。 */
  function makeBall(color, extra) {
    const ball = document.createElement('div');
    ball.className = `ball c${color}` + (extra ? ' ' + extra : '');
    decorate(ball, color);
    return ball;
  }

  /** 初始化一个空网格容器，返回 cell 元素数组（按 index）。 */
  function buildGrid(container, size, onClick) {
    container.innerHTML = '';
    // 用 1fr 等分 + cell 的 aspect-ratio 保持正方形，整盘随容器宽度自适应（手机也不溢出）
    container.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    const cells = [];
    for (let i = 0; i < size * size; i++) {
      const div = document.createElement('div');
      div.className = 'cell';
      div.dataset.index = i;
      if (onClick) div.addEventListener('click', () => onClick(i));
      container.appendChild(div);
      cells.push(div);
    }
    return cells;
  }

  /** 用 board 数组刷新已有 cell 的内容。opts: {selected, path:Set, highlight:Set, cleared:Set, hint:Set} */
  function paint(cells, board, opts = {}) {
    const { selected, path, highlight, cleared, hint } = opts;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      cell.className = 'cell';
      cell.innerHTML = '';
      const color = board[i];
      if (color > 0) cell.appendChild(makeBall(color));
      if (selected === i) cell.classList.add('selected');
      if (path && path.has(i)) cell.classList.add('path');
      if (highlight && highlight.has(i)) cell.classList.add('highlight');
      if (cleared && cleared.has(i)) cell.classList.add('cleared');
      if (hint && hint.has(i)) cell.classList.add('hint-cell');
    }
  }

  function renderNextPreview(container, colors) {
    container.innerHTML = '';
    colors.forEach((c) => container.appendChild(makeBall(c, 'small')));
  }

  global.CL = global.CL || {};
  global.CL.ui = { buildGrid, paint, renderNextPreview, setPattern, makeBall, SYMBOLS };
})(window);
