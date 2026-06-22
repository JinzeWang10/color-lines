/**
 * 主程序：把游戏逻辑、记录器、音效、复盘与 DOM 连起来。
 */
(function (global) {
  'use strict';

  const { Game, Recorder, ui, buildFrames, sound, stats, PlayLimit } = global.CL;
  const $ = (id) => document.getElementById(id);

  // 防沉迷计时器（仅在游戏页 + 页面可见时累计）
  const limit = new PlayLimit();
  limit.isActive = () =>
    $('view-play').classList.contains('active') && document.visibilityState === 'visible';

  // ===================== 游戏视图 =====================
  const play = {
    game: null,
    recorder: new Recorder(),
    cells: [],
    selected: null,
    animating: false,
    undoSnapshot: null, // 单步撤销用的完整快照
    undoEventCount: 0, // 撤销时把事件流回退到这个长度
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
    play.game.initialSpawn(5); // 开局先放几个球
    play.selected = null;
    play.animating = false;
    play.undoSnapshot = null;
    play.cells = ui.buildGrid($('board'), play.game.size, onCellClick);
    play.recorder.startSession(play.game, settings);
    hideOverlay();
    refreshPlay();
    setStatus('点一个球选中，再点一个空格移动它。');
  }

  function refreshPlay() {
    const g = play.game;
    ui.paint(play.cells, g.cells, { selected: play.selected });
    $('score').textContent = g.score;
    $('best').textContent = Recorder.getBest();
    $('moves').textContent = play.recorder.session.moveCount;
    $('cleared-count').textContent = stats.sessionStats(play.recorder.session).ballsCleared;
    $('seed').textContent = g.seed;
    ui.renderNextPreview($('next-preview'), g.next);
    $('btn-undo').disabled = !play.undoSnapshot;
  }

  function setStatus(text, cls) {
    const el = $('status');
    el.textContent = text || '';
    el.className = 'status' + (cls ? ' ' + cls : '');
  }

  function onCellClick(i) {
    const g = play.game;
    if (!g || g.over || play.animating) return;
    if (limit.isLocked()) {
      showLock();
      return;
    }
    limit.bump();
    sound.unlock();

    // 点到有球：选中（或切换选中）
    if (!g.isEmpty(i)) {
      play.selected = i;
      ui.paint(play.cells, g.cells, { selected: play.selected });
      sound.select();
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
    if (!g.findPath(from, to)) {
      sound.invalid();
      setStatus('走不通：路径被挡住了。', 'over');
      return;
    }

    // 移动前留快照供撤销
    const undoSnap = g.fullSnapshot();
    const undoCount = play.recorder.session.events.length;
    const preBoard = g.cells.slice();
    const result = g.move(from, to);
    play.selected = null;
    if (!result.ok) {
      setStatus('无法移动。', 'over');
      return;
    }
    play.recorder.record(result.events);
    play.undoSnapshot = undoSnap;
    play.undoEventCount = undoCount;
    sound.move();

    animateMove(preBoard, result.events, () => {
      refreshPlay();
      const gameover = result.events.find((e) => e.type === 'gameover');
      const cleared = result.events.find((e) => e.type === 'clear');
      if (cleared) sound.clear(cleared.count);
      if (gameover) {
        showGameOver(gameover.finalScore);
      } else if (cleared) {
        setStatus(`消除 ${cleared.count} 个球，+${cleared.scoreGained} 分！`, 'win');
      } else {
        setStatus('继续。');
      }
    });
  }

  function showHint() {
    const g = play.game;
    if (!g || g.over || play.animating || limit.isLocked()) return;
    limit.bump();
    const best = global.CL.hint.bestMove(g);
    if (!best) {
      setStatus('暂时没有可走的提示。');
      return;
    }
    // 帮玩家选好球，直接点高亮空格即可走子
    play.selected = best.from;
    ui.paint(play.cells, g.cells, { selected: best.from, highlight: new Set([best.to]) });
    sound.select();
    setStatus(
      best.clears
        ? '建议这一手能消除！点高亮空格走子。'
        : '建议：把跳动的球移到高亮空格。',
      'win'
    );
  }

  function undo() {
    if (!play.undoSnapshot || play.animating || limit.isLocked()) return;
    limit.bump();
    play.game.restore(play.undoSnapshot);
    play.recorder.truncateTo(play.undoEventCount);
    play.undoSnapshot = null;
    play.selected = null;
    hideOverlay();
    sound.select();
    refreshPlay();
    setStatus('已撤销上一步。');
  }

  /** 沿路径让球平滑滑过去，再展示生成/消除结果。 */
  function animateMove(preBoard, events, done) {
    const moveEv = events.find((e) => e.type === 'move');
    if (!moveEv) {
      done();
      return;
    }
    play.animating = true;
    const boardEl = $('board');
    const path = moveEv.path;
    const color = moveEv.color;

    // 背景：起点清空、其余球都在
    const bg = preBoard.slice();
    bg[moveEv.from] = 0;
    ui.paint(play.cells, bg, {});

    // 浮动球，绝对定位在棋盘上滑行
    const fromCell = play.cells[moveEv.from];
    const sizePx = fromCell.offsetWidth * 0.78;
    const center = (i) => {
      const c = play.cells[i];
      return { x: c.offsetLeft + c.offsetWidth / 2, y: c.offsetTop + c.offsetHeight / 2 };
    };
    const start = center(path[0]);
    const ball = ui.makeBall(color, 'floating');
    ball.style.width = sizePx + 'px';
    ball.style.height = sizePx + 'px';
    ball.style.left = start.x - sizePx / 2 + 'px';
    ball.style.top = start.y - sizePx / 2 + 'px';
    boardEl.appendChild(ball);

    const segs = path.length - 1;
    const segDur = Math.max(28, Math.min(60, Math.round(420 / Math.max(1, segs))));
    ball.style.transition = `transform ${segDur}ms linear`;

    const finish = () => {
      boardEl.querySelectorAll('.ball.floating').forEach((b) => b.remove());
      const clearEv = events.find((e) => e.type === 'clear');
      if (clearEv) {
        // 还原"消除前"的盘（含落点与新球），让被消的球缩放淡出
        const preClear = play.game.cells.slice();
        clearEv.cells.forEach((c, k) => (preClear[c] = clearEv.colors[k]));
        ui.paint(play.cells, preClear, {});
        clearEv.cells.forEach((c) => {
          const b = play.cells[c].querySelector('.ball');
          if (b) b.classList.add('vanishing');
        });
        setTimeout(() => {
          play.animating = false;
          done();
        }, 300);
      } else {
        play.animating = false;
        done();
      }
    };

    let step = 1;
    const next = () => {
      if (step >= path.length) {
        finish();
        return;
      }
      const p = center(path[step]);
      ball.style.transform = `translate(${p.x - start.x}px, ${p.y - start.y}px)`;
      step++;
      setTimeout(next, segDur);
    };
    // 等初始位置生效再开始滑
    requestAnimationFrame(() => requestAnimationFrame(next));
  }

  // ---- 结算弹层 ----
  function showGameOver(finalScore) {
    const isBest = Recorder.updateBest(finalScore);
    const s = stats.sessionStats(play.recorder.session);
    $('ov-title').textContent = '本局结束';
    $('ov-score').textContent = finalScore;
    $('ov-best').classList.toggle('hidden', !isBest);
    $('ov-stats').innerHTML = `
      <div><b>${s.moves}</b><span>步数</span></div>
      <div><b>${s.ballsCleared}</b><span>消除球数</span></div>
      <div><b>${s.biggestClear || 0}</b><span>最大连消</span></div>
      <div><b>${stats.fmtDuration(s.durationMs)}</b><span>用时</span></div>`;
    $('ov-msg').textContent = encourage(finalScore, isBest);
    setStatus('棋盘已满，本局结束。', 'over');
    sound.gameover();
    if (isBest) setTimeout(() => sound.best(), 700);
    $('overlay').classList.remove('hidden');
    $('best').textContent = Recorder.getBest();
  }

  function encourage(score, isBest) {
    if (isBest) return '太厉害了，刷新了最高分！🎉';
    const best = Recorder.getBest();
    if (best && score >= best * 0.8) return '就差一点点就破纪录啦，再来一局！';
    if (score === 0) return '热热身，下一局一定行！';
    return '不错的一局，再战一盘？';
  }

  function hideOverlay() {
    $('overlay').classList.add('hidden');
  }

  // ---- 防沉迷锁定 ----
  function fmtCountdown(ms) {
    const totalMin = Math.ceil(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
  }

  function showLock() {
    $('lock-text').innerHTML = `已经玩了 ${limit.limitMinutes()} 分钟，休息一下眼睛，<br>明天再来玩吧！`;
    $('lock-countdown').textContent = `距离明天还有 ${fmtCountdown(limit.msUntilReset())}`;
    hideOverlay();
    $('lock-overlay').classList.remove('hidden');
    play.selected = null;
    setStatus('今天的游戏时间到啦，明天再来。', 'over');
  }

  // ===================== 复盘视图 =====================
  const review = {
    session: null,
    frames: [],
    analysis: {},
    pos: 0,
    cells: [],
    playing: false,
    timer: null,
    size: 9,
  };

  function renderAggStats() {
    const agg = stats.aggregate(Recorder.loadAll());
    const el = $('agg-stats');
    if (!agg.games) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `
      <div class="agg-row">
        <div><b>${agg.best}</b><span>最高分</span></div>
        <div><b>${agg.avg}</b><span>平均分</span></div>
        <div><b>${agg.games}</b><span>总局数</span></div>
      </div>
      <div class="agg-spark">${stats.sparkline(agg.scores)}<div class="muted">得分趋势（早 → 近）</div></div>`;
  }

  function renderSessionList() {
    const list = $('session-list');
    const sessions = Recorder.loadAll();
    $('session-count').textContent = sessions.length ? `(${sessions.length})` : '';
    renderAggStats();
    if (!sessions.length) {
      list.innerHTML = '<div class="empty-hint">还没有对局记录。<br>先去玩一局吧。</div>';
      return;
    }
    list.innerHTML = '';
    sessions.forEach((s) => {
      const item = document.createElement('div');
      item.className =
        'session-item' + (review.session && review.session.id === s.id ? ' active' : '');
      const date = new Date(s.startedAt);
      const dstr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      item.innerHTML = `
        <div class="si-top">
          <span>${dstr}</span>
          <span class="si-del" title="删除" data-del="${s.id}">✕</span>
          <span class="si-score">${stats.sessionStats(s).score} 分</span>
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
    $('session-stats').innerHTML = '';
    $('replay-status').textContent = '';
    $('replay-note').textContent = '';
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
    review.analysis = global.CL.analyzeSession(s);
    review.pos = 0;
    review.size = s.settings.size;
    review.cells = ui.buildGrid($('replay-board'), s.settings.size, null);
    $('rp-slider').max = review.frames.length - 1;
    renderSessionList();
    renderSessionStats(s);
    renderEventLog();
    showFrame(0);
  }

  function renderSessionStats(s) {
    const st = stats.sessionStats(s);
    let missed = 0;
    Object.values(review.analysis).forEach((a) => {
      if (a.missed) missed++;
    });
    $('session-stats').innerHTML = `
      <div class="ss-grid">
        <div><b>${st.score}</b><span>得分</span></div>
        <div><b>${st.moves}</b><span>步数</span></div>
        <div><b>${st.ballsCleared}</b><span>消除</span></div>
        <div><b>${st.biggestClear || 0}</b><span>最大连消</span></div>
        <div><b>${st.efficiency}</b><span>每步均消</span></div>
        <div><b>${missed}</b><span>漏消</span></div>
      </div>`;
  }

  function renderEventLog() {
    const log = $('event-log');
    log.innerHTML = '';
    review.frames.forEach((f, i) => {
      const row = document.createElement('div');
      const a = f.event && f.event.type === 'move' ? review.analysis[i - 1] : null;
      const flag = a && a.missed ? ' ⚠' : a && a.suboptimal ? ' 💡' : '';
      row.className = 'log-row' + (i === review.pos ? ' active' : '') + (a && a.missed ? ' miss' : '');
      row.dataset.frame = i;
      const t = f.event ? (f.event.t / 1000).toFixed(1) + 's' : '0s';
      row.innerHTML = `<span>${f.label}<span class="lr-flag">${flag}</span></span><span class="lr-t">${t}</span>`;
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

    // 失误标注
    const a = frame.event && frame.event.type === 'move' ? review.analysis[pos - 1] : null;
    const note = $('replay-note');
    if (a && (a.missed || a.suboptimal)) {
      const rc = (i) => `(${Math.floor(i / review.size) + 1},${(i % review.size) + 1})`;
      const sug = `引擎建议 ${rc(a.best.from)}→${rc(a.best.to)}`;
      note.textContent = a.missed ? `⚠ 这一手漏了一次消除！${sug}` : `💡 也许更优：${sug}`;
      note.className = 'replay-note ' + (a.missed ? 'miss' : 'sub');
    } else {
      note.textContent = '';
      note.className = 'replay-note';
    }

    $('rp-frame').textContent = `${pos} / ${review.frames.length - 1}`;
    $('rp-slider').value = pos;
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
  function updateSoundBtn() {
    $('btn-sound').textContent = sound.isMuted() ? '🔇 静音' : '🔊 音效';
  }

  // ---- 颜色图案开关 ----
  function patternEnabled() {
    return localStorage.getItem('color-lines.pattern') !== '0';
  }
  function updatePatternBtn() {
    $('btn-pattern').textContent = patternEnabled() ? '🔣 图案' : '🔣 朴素';
  }
  function applyPattern() {
    ui.setPattern(patternEnabled());
    updatePatternBtn();
  }
  function togglePattern() {
    localStorage.setItem('color-lines.pattern', patternEnabled() ? '0' : '1');
    applyPattern();
    refreshPlay();
  }

  function bind() {
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
    $('btn-hint').addEventListener('click', showHint);
    $('btn-undo').addEventListener('click', undo);
    $('btn-sound').addEventListener('click', () => {
      sound.toggleMute();
      updateSoundBtn();
    });
    $('btn-pattern').addEventListener('click', togglePattern);
    $('btn-export-cur').addEventListener('click', () => {
      if (play.recorder.session) Recorder.exportSession(play.recorder.session.id);
    });
    $('ov-again').addEventListener('click', newGame);
    $('overlay').addEventListener('click', (e) => {
      if (e.target.id === 'overlay') hideOverlay();
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

    // 键盘：撤销 (Ctrl+Z / U)、复盘左右箭头
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey && e.key === 'z') || e.key === 'u') {
        if ($('view-play').classList.contains('active')) undo();
      }
      if (e.key === 'h' && $('view-play').classList.contains('active')) showHint();
      if ($('view-review').classList.contains('active')) {
        if (e.key === 'ArrowRight') {
          stopAutoplay();
          showFrame(review.pos + 1);
        }
        if (e.key === 'ArrowLeft') {
          stopAutoplay();
          showFrame(review.pos - 1);
        }
      }
    });

    window.addEventListener('beforeunload', () => {
      if (play.game && !play.game.over) play.recorder.finalize(play.game.score, 'abandoned');
    });
  }

  function setupLimit() {
    limit.onWarn = (rem) => {
      setStatus(`再玩 ${Math.ceil(rem / 60)} 分钟就要休息啦，注意时间~`, 'over');
    };
    limit.onLock = () => showLock();
    limit.onTick = () => {
      if (limit.isLocked() && !$('lock-overlay').classList.contains('hidden')) {
        $('lock-countdown').textContent = `距离明天还有 ${fmtCountdown(limit.msUntilReset())}`;
      }
    };
    limit.start();
    if (limit.isLocked()) showLock();
  }

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    updateSoundBtn();
    applyPattern();
    clearReplay();
    newGame();
    setupLimit();
  });
})(window);
