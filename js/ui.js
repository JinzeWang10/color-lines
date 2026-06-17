/**
 * 渲染助手：把棋盘数组画成 DOM 网格。play 视图与 replay 视图共用。
 */
(function (global) {
  'use strict';

  /** 初始化一个空网格容器，返回 cell 元素数组（按 index）。 */
  function buildGrid(container, size, onClick) {
    container.innerHTML = '';
    container.style.gridTemplateColumns = `repeat(${size}, var(--cellsize))`;
    // 棋盘越大格子越小，保证整体不超屏
    const cs = size <= 7 ? 56 : size <= 9 ? 52 : 42;
    container.style.setProperty('--cellsize', cs + 'px');
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

  /** 用 board 数组刷新已有 cell 的内容。opts: {selected, path:Set, highlight:Set, cleared:Set} */
  function paint(cells, board, opts = {}) {
    const { selected, path, highlight, cleared } = opts;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      cell.className = 'cell';
      cell.innerHTML = '';
      const color = board[i];
      if (color > 0) {
        const ball = document.createElement('div');
        ball.className = `ball c${color}`;
        cell.appendChild(ball);
      }
      if (selected === i) cell.classList.add('selected');
      if (path && path.has(i)) cell.classList.add('path');
      if (highlight && highlight.has(i)) cell.classList.add('highlight');
      if (cleared && cleared.has(i)) cell.classList.add('cleared');
    }
  }

  function renderNextPreview(container, colors) {
    container.innerHTML = '';
    colors.forEach((c) => {
      const ball = document.createElement('div');
      ball.className = `ball small c${c}`;
      container.appendChild(ball);
    });
  }

  global.CL = global.CL || {};
  global.CL.ui = { buildGrid, paint, renderNextPreview };
})(window);
