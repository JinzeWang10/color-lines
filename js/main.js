/**
 * 主程序：把游戏逻辑、记录器、复盘与 DOM 连起来。
 */
(function (global) {
  'use strict';

  const { Game, Recorder, ui, buildFrames } = global.CL;
  const $ = (id) => document.getElementById(id);

  // ===================== 游戏视图 =====================
  const play = {
    game: null,
    recorder: new Recorder(),
    cells: [],
    selected: null,
    animating: false,
  };

  function readSettings() {
    return {
      size: parseInt($('opt-size').value, 10),
      colors: parseInt($('opt-colors').value, 10),
      lineLength: parseInt($('opt-line').value, 10),
      spawnCount: parseInt($('opt-spawn').value, 10),
    };
  }

  function newGame() {
    const settings = readSettings();
    play.game = new Game(settings);
    const initial = play.game.initialSpawn(5); // 开局先放几个球
    play.selected = null;
    play.animating = false;
    play.cells = ui.buildGrid($('board'), play.game.size, onCellClick);
    play.recorder.startSession(play.game, settings);
    // 把开局球也作为一个 spawn 事件记入（initialBoard 已含，但留事件便于复盘看到）
    refreshPlay();
    setStatus('点一个球选中，再点一个空格移动它。');
  }

  function refreshPlay() {
    const g = play.game;
    ui.paint(play.cells, g.cells, { selected: play.selected });
    $('score').textContent = g.score;
    $('moves').textContent = play.recorder.session.moveCount;
    $('seed').textContent = g.seed;
    ui.renderNextPreview($('next-preview'), g.next);
  }

  function setStatus(text, cls) {
    const el = $('status');
    el.textContent = text || '';
    el.className = 'status' + (cls ? ' ' + cls : '');
  }

  function onCellClick(i) {
    const g = play.game;
    if (!g || g.over || play.animating) return;

    // 点到有球：选中（或切换选中）
    if (!g.isEmpty(i)) {
      play.selected = i;
      ui.paint(play.cells, g.cells, { selected: play.selected });
      setStatus('已选中，点一个空格移动。');
      return;
    }

    // 点到空格且已选中：尝试移动
    if (play.selected == null) {
      setStatus('先选一个球。');
      return;
    }
    const from = play.selected;
    const to = i;
    const path = g.findPath(from, to);
    if (!path) {
      setStatus('走不通：路径被挡住了。', 'over');
      return;
    }

    const preBoard = g.cells.slice();
    const result = g.move(from, to);
    play.selected = null;
    if (!result.ok) {
      setStatus('无法移动。', 'over');
      return;
    }
    play.recorder.record(result.events);

    animateMove(preBoard, result.events, () => {
      refreshPlay();
      const gameover = result.events.find((e) => e.type === 'gameover');
      const cleared = result.events.find((e) => e.type === 'clear');
      if (gameover) {
        setStatus(`棋盘已满，游戏结束！最终得分 ${gameover.finalScore}。`, 'over');
      } else if (cleared) {
        setStatus(`消除 ${cleared.count} 个球，+${cleared.scoreGained} 分！`, 'win');
      } else {
        setStatus('继续。');
      }
    });
  }

  /** 沿路径让球滑过去，再展示生成/消除结果。 */
  function animateMove(preBoard, events, done) {
    const moveEv = events.find((e) => e.type === 'move');
    if (!moveEv) {
      done();
      return;
    }
    play.animating = true;
    const path = moveEv.path;
    const color = moveEv.color;
    let step = 0;

    const tick = () => {
      // 起点清空，当前步显示球
      const frame = preBoard.slice();
      frame[moveEv.from] = 0;
      frame[path[step]] = color;
      const pathSet = new Set(path.slice(0, step + 1));
      ui.paint(play.cells, frame, { path: pathSet });
      step++;
      if (step < path.length) {
        setTimeout(tick, 45);
      } else {
        // 落定 -> 画最终棋盘 + 闪一下被消除的格
        const clearEv = events.find((e) => e.type === 'clear');
        if (clearEv) {
          // 先把被消除的球画回去并闪红，再展示最终棋盘，制造"消失"感
          const preClear = play.game.cells.slice();
          clearEv.cells.forEach((c, k) => (preClear[c] = clearEv.colors[k]));
          ui.paint(play.cells, preClear, { cleared: new Set(clearEv.cells) });
          setTimeout(() => {
            play.animating = false;
            done();
          }, 260);
        } else {
          play.animating = false;
          done();
        }
      }
    };
    tick();
  }

  // ===================== 复盘视图 =====================
  const review = {
    session: null,
    frames: [],
    pos: 0,
    cells: [],
    playing: false,
    timer: null,
    size: 9,
  };

  function renderSessionList() {
    const list = $('session-list');
    const sessions = Recorder.loadAll();
    $('session-count').textContent = sessions.length ? `(${sessions.length})` : '';
    if (!sessions.length) {
      list.innerHTML = '<div class="empty-hint">还没有对局记录。<br>先去玩一局吧。</div>';
      return;
    }
    list.innerHTML = '';
    sessions.forEach((s) => {
      const item = document.createElement('div');
      item.className = 'session-item' + (review.session && review.session.id === s.id ? ' active' : '');
      const date = new Date(s.startedAt);
      const dstr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      item.innerHTML = `
        <div class="si-top">
          <span>${dstr}</span>
          <span class="si-del" title="删除" data-del="${s.id}">✕</span>
          <span class="si-score">${s.finalScore} 分</span>
        </div>
        <div class="si-meta">${s.settings.size}×${s.settings.size} · ${s.settings.lineLength}连 · ${s.moveCount} 步 · ${s.result === 'over' ? '已结束' : '未完'}</div>
      `;
      item.addEventListener('click', (e) => {
        if (e.target.dataset.del) {
          Recorder.remove(e.target.dataset.del);
          if (review.session && review.session.id === e.target.dataset.del) review.session = null;
          renderSessionList();
          if (!review.session) clearReplay();
          return;
        }
        loadSession(s.id);
      });
      list.appendChild(item);
    });
  }

  function clearReplay() {
    $('replay-board').innerHTML = '';
    $('event-log').innerHTML = '<div class="empty-hint">选一局开始复盘。</div>';
    $('replay-status').textContent = '';
    $('rp-frame').textContent = '0 / 0';
    $('rp-slider').max = 0;
    $('rp-slider').value = 0;
  }

  function loadSession(id) {
    stopAutoplay();
    const s = Recorder.get(id);
    if (!s) return;
    review.session = s;
    review.frames = buildFrames(s);
    review.pos = 0;
    review.size = s.settings.size;
    review.cells = ui.buildGrid($('replay-board'), s.settings.size, null);
    $('rp-slider').max = review.frames.length - 1;
    renderSessionList();
    renderEventLog();
    showFrame(0);
  }

  function renderEventLog() {
    const log = $('event-log');
    log.innerHTML = '';
    review.frames.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'log-row' + (i === review.pos ? ' active' : '');
      row.dataset.frame = i;
      const t = f.event ? (f.event.t / 1000).toFixed(1) + 's' : '0s';
      row.innerHTML = `<span>${f.label}</span><span class="lr-t">${t}</span>`;
      row.addEventListener('click', () => {
        stopAutoplay();
        showFrame(i);
      });
      log.appendChild(row);
    });
  }

  function showFrame(pos) {
    pos = Math.max(0, Math.min(pos, review.frames.length - 1));
    review.pos = pos;
    const frame = review.frames[pos];
    ui.paint(review.cells, frame.board, { highlight: new Set(frame.highlight) });
    $('replay-status').textContent = `${frame.label} · 得分 ${frame.score}`;
    $('rp-frame').textContent = `${pos} / ${review.frames.length - 1}`;
    $('rp-slider').value = pos;
    // 高亮当前事件行
    document.querySelectorAll('#event-log .log-row').forEach((r) => {
      r.classList.toggle('active', parseInt(r.dataset.frame, 10) === pos);
    });
    const active = document.querySelector('#event-log .log-row.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function stopAutoplay() {
    review.playing = false;
    if (review.timer) clearInterval(review.timer);
    review.timer = null;
    $('rp-play').textContent = '▶ 播放';
  }

  function toggleAutoplay() {
    if (!review.frames.length) return;
    if (review.playing) {
      stopAutoplay();
      return;
    }
    if (review.pos >= review.frames.length - 1) showFrame(0);
    review.playing = true;
    $('rp-play').textContent = '⏸ 暂停';
    review.timer = setInterval(() => {
      if (review.pos >= review.frames.length - 1) {
        stopAutoplay();
        return;
      }
      showFrame(review.pos + 1);
    }, 600);
  }

  // ===================== 绑定 =====================
  function bind() {
    // 标签切换
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
        tab.classList.add('active');
        const view = tab.dataset.view;
        $('view-' + view).classList.add('active');
        if (view === 'review') {
          renderSessionList();
          if (!review.session) clearReplay();
        }
      });
    });

    $('btn-new').addEventListener('click', newGame);
    $('btn-export-cur').addEventListener('click', () => {
      if (play.recorder.session) Recorder.exportSession(play.recorder.session.id);
    });

    $('btn-export-all').addEventListener('click', () => Recorder.exportAll());
    $('btn-clear-all').addEventListener('click', () => {
      if (confirm('确定清空所有对局记录？此操作不可恢复。')) {
        Recorder.clearAll();
        review.session = null;
        renderSessionList();
        clearReplay();
      }
    });

    $('rp-first').addEventListener('click', () => {
      stopAutoplay();
      showFrame(0);
    });
    $('rp-prev').addEventListener('click', () => {
      stopAutoplay();
      showFrame(review.pos - 1);
    });
    $('rp-next').addEventListener('click', () => {
      stopAutoplay();
      showFrame(review.pos + 1);
    });
    $('rp-last').addEventListener('click', () => {
      stopAutoplay();
      showFrame(review.frames.length - 1);
    });
    $('rp-play').addEventListener('click', toggleAutoplay);
    $('rp-slider').addEventListener('input', (e) => {
      stopAutoplay();
      showFrame(parseInt(e.target.value, 10));
    });

    // 关闭/刷新前，把未完成的局标记一下
    window.addEventListener('beforeunload', () => {
      if (play.game && !play.game.over) play.recorder.finalize(play.game.score, 'abandoned');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    clearReplay();
    newGame();
  });
})(window);
