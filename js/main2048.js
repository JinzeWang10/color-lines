/**
 * 2048 的交互：渲染与滑动动画、键盘/滑屏输入、撤销、存档续玩、结算、新手教程。
 * 防沉迷、打点、视图切换在 app.js，这里只管 2048 自己。
 */
(function (global) {
  'use strict';

  const { Game2048, sound, stats } = global.CL;
  const $ = (id) => document.getElementById(id);
  const app = () => global.CL.app; // app.js 最后加载，用到时再取

  const KEY_CURRENT = 'color-lines.2048.current'; // 没下完的这一局：关了页面再开接着玩
  const KEY_SESSIONS = 'color-lines.2048.sessions.v1'; // 下完的局，留给以后做复盘
  const KEY_BEST = 'color-lines.2048.best';
  const KEY_TUTORIAL = 'color-lines.2048.tutorial'; // 看完或跳过教程后不再自动弹
  const MAX_SESSIONS = 100;
  const IDLE_CAP_MS = 120 * 1000; // 两步间隔超过 2 分钟只算 2 分钟（同防沉迷口径），挂机不算用时
  const SWIPE_MIN_PX = 22; // 手指划过这么远就出手，不等抬起
  const CONFIRM_NEW_AFTER = 30; // 下了这么多步再点开新局，先确认一下，免得手滑丢掉半小时
  const KEYS = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right',
  };
  const NUDGE = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  const st = {
    game: null,
    session: null,
    undo: null, // { g: 局面快照, s: 本局记录 }，单步撤销
    lastMoveAt: 0,
    recordShown: false, // 本局已经报过"超过最高分"了
  };
  let view = null; // 正式棋盘的画面，DOMContentLoaded 时建

  /** 重新触发一个一次性的 CSS 动画类。 */
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  // ===================== 棋盘画面 =====================

  function tileClass(v) {
    return v <= 8192 ? 't' + v : 'tbig';
  }

  /** 合成块的出场：越大越隆重。128 起带一圈光晕扩散，1024 起光晕更大更久。 */
  function mergeAnim(v) {
    if (v >= 1024) return 'pop glow glow-big';
    if (v >= 128) return 'pop glow';
    return 'pop';
  }

  /**
   * 一块 2048 棋盘的画面：方块 DOM、滑动/合成两段动画、推不动时的一顶。
   * 正式棋盘和教程里的小棋盘共用；它只管画，规则在 Game2048，记录在外面。
   */
  class BoardView {
    constructor(board) {
      this.board = board;
      this.grid = board.querySelector('.g-grid');
      this.layer = board.querySelector('.g-tiles');
      this.game = null;
      this.els = new Map(); // 方块 id → DOM
      this.pending = null; // 动画后半段（换上合成块、冒出新块）；下一步来了就立刻放完，不卡手
      this.timer = 0;
    }

    /** 换一盘棋：按边长重铺底格。 */
    use(game) {
      this.settle();
      this.game = game;
      this.board.style.setProperty('--n', game.size);
      this.grid.innerHTML = '';
      for (let i = 0; i < game.size * game.size; i++) {
        const cell = document.createElement('div');
        cell.className = 'g-cell';
        this.grid.appendChild(cell);
      }
    }

    /**
     * 滑动时长只在 CSS 里定义一处（.board-2048 的 --slide），这里读出来对齐第二段动画。
     * 系统开了"减弱动态效果"时 CSS 把它设成 0，合成块就当场换上，不会两块叠着等一拍。
     */
    slideMs() {
      return parseFloat(getComputedStyle(this.board).getPropertyValue('--slide')) || 0;
    }

    place(el, at) {
      const n = this.game.size;
      el.style.setProperty('--r', Math.floor(at / n));
      el.style.setProperty('--c', at % n);
    }

    addTile(id, v, at, anim) {
      const el = document.createElement('div');
      el.className = 'tile';
      const face = document.createElement('div');
      face.className = `tile-face ${tileClass(v)}` + (anim ? ' ' + anim : '');
      face.dataset.len = String(v).length;
      face.textContent = v;
      el.appendChild(face);
      this.place(el, at); // 先定位再入树，新块不会从左上角滑过来
      this.layer.appendChild(el);
      this.els.set(id, el);
      return el;
    }

    /** 按当前盘面整个重画（开局 / 撤销 / 续玩）。fresh 里的方块带出现动画。 */
    renderAll(fresh) {
      this.settle();
      this.layer.innerHTML = '';
      this.els.clear();
      this.game.cells.forEach((t, i) => {
        if (t) this.addTile(t.id, t.v, i, fresh && fresh.has(t.id) ? 'appear' : '');
      });
    }

    /** 两段动画：先让方块滑到位，滑完再换上合成块、冒出新块，然后调 after。 */
    animate(r, after) {
      r.moves.forEach((m) => {
        const el = this.els.get(m.id);
        if (el) this.place(el, m.to);
      });
      this.pending = () => {
        this.pending = null;
        r.merges.forEach((m) => {
          m.from.forEach((id) => {
            const el = this.els.get(id);
            if (el) el.remove();
            this.els.delete(id);
          });
          this.addTile(m.id, m.v, m.at, mergeAnim(m.v));
        });
        if (r.spawn) this.addTile(r.spawn.id, r.spawn.v, r.spawn.at, 'appear');
        if (after) after();
      };
      const ms = this.slideMs();
      if (ms > 0) this.timer = setTimeout(() => this.pending && this.pending(), ms);
      else this.pending();
    }

    /** 上一步的动画还没放完就来了下一步：立刻放完。 */
    settle() {
      if (!this.pending) return;
      clearTimeout(this.timer);
      this.pending();
    }

    /** 推不动：方块往那个方向轻轻一顶又弹回来。 */
    nudge(dir) {
      this.layer.style.setProperty('--nx', NUDGE[dir][0] * 6 + 'px');
      this.layer.style.setProperty('--ny', NUDGE[dir][1] * 6 + 'px');
      replay(this.layer, 'nudge');
    }
  }

  /**
   * 在一块棋盘上识别滑动。Pointer Events 同时覆盖手指和鼠标拖拽；
   * 划过阈值的那一刻就出手（不等抬起），手感跟得上手指；一次按下只算一步。
   */
  function bindSwipe(board, onDir) {
    let start = null;
    const swipe = (e) => {
      if (!start || start.done || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;
      start.done = true;
      if (Math.abs(dx) > Math.abs(dy)) onDir(dx > 0 ? 'right' : 'left');
      else onDir(dy > 0 ? 'down' : 'up');
    };
    board.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, done: false };
      try {
        board.setPointerCapture(e.pointerId); // 手指滑出棋盘也收得到后续事件
      } catch (err) {} // 指针已失效时会抛错，抓不住也不影响判定
    });
    board.addEventListener('pointermove', swipe);
    board.addEventListener('pointerup', (e) => {
      swipe(e); // 极快的一甩可能来不及触发 move 事件，抬起时再判一次
      if (start && e.pointerId === start.id) start = null;
    });
    board.addEventListener('pointercancel', () => (start = null));
  }

  // ===================== 存储 =====================
  // 隐私模式下 localStorage 可能不可用，一律兜住

  function load(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  function store(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }
  const getBest = () => load(KEY_BEST, 0) | 0;
  function updateBest(score) {
    if (score <= getBest()) return false;
    store(KEY_BEST, score);
    return true;
  }

  // ===================== 对局记录 =====================

  function newSession(g, spawns) {
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      startedAt: new Date().toISOString(),
      endedAt: null,
      size: g.size,
      seed: g.seed,
      start: spawns.map((x) => [x.at, x.v]),
      // 每步方向（U/D/L/R 连成一串）+ 每步之后的新块 [位置, 数值]：
      // 有这两样就能逐步重建整局，不依赖随机数
      dirs: '',
      spawns: [],
      score: 0,
      maxTile: g.maxTile(),
      merges: 0,
      playMs: 0,
      result: 'in_progress',
    };
  }

  /** 写进历史；按 id 覆盖，结束后撤销再结束不会记两条。 */
  function archive(session) {
    const all = load(KEY_SESSIONS, []).filter((x) => x.id !== session.id);
    all.unshift(session);
    store(KEY_SESSIONS, all.slice(0, MAX_SESSIONS));
  }

  function saveCurrent() {
    store(KEY_CURRENT, { g: st.game.snapshot(), s: st.session });
  }

  // ===================== 开局 / 续玩 =====================

  function useGame(g, session) {
    st.game = g;
    st.session = session;
    st.undo = null;
    st.lastMoveAt = Date.now();
    st.recordShown = false;
    $('board-2048').classList.remove('ended');
    view.use(g);
  }

  function newGame(skipConfirm) {
    const s = st.session;
    if (s && s.result === 'in_progress' && s.dirs.length) {
      if (
        !skipConfirm &&
        s.dirs.length >= CONFIRM_NEW_AFTER &&
        !confirm('这一局还没下完，确定重新开始吗？')
      )
        return;
      s.result = 'abandoned';
      s.endedAt = new Date().toISOString();
      archive(s);
    }
    const g = new Game2048({ size: 4 });
    const spawns = g.start();
    useGame(g, newSession(g, spawns));
    hideOverlay();
    view.renderAll(new Set(spawns.map((x) => x.id)));
    refresh();
    saveCurrent();
    setStatus('用方向键，或在棋盘上滑动。');
  }

  /** 接着上次没下完的那局。没有存档、存档坏了或那局已结束，返回 false。 */
  function resume() {
    const saved = load(KEY_CURRENT, null);
    const g = saved && saved.s && Game2048.fromSnapshot(saved.g);
    if (!g || g.over) return false;
    useGame(g, saved.s);
    view.renderAll();
    refresh();
    setStatus(saved.s.dirs.length ? '接着上次那局继续。' : '用方向键，或在棋盘上滑动。');
    return true;
  }

  // ===================== 走一步 =====================

  function move(dir) {
    const g = st.game;
    if (!g || g.over || isOverlayOpen()) return;
    if (!app().guard()) return;
    view.settle();
    const before = { g: g.snapshot(), s: JSON.parse(JSON.stringify(st.session)) };
    const prevMax = g.maxTile();
    const r = g.move(dir);
    flashKey(dir);
    if (!r) {
      view.nudge(dir);
      sound.bump();
      setStatus('这个方向推不动，换个方向试试。');
      return;
    }

    st.undo = before;
    const s = st.session;
    const now = Date.now();
    s.playMs += Math.min(now - st.lastMoveAt, IDLE_CAP_MS);
    st.lastMoveAt = now;
    s.dirs += dir[0].toUpperCase();
    s.spawns.push([r.spawn.at, r.spawn.v]);
    s.score = g.score;
    s.merges += r.merges.length;
    s.maxTile = g.maxTile();

    view.animate(r);
    refresh(r.gained);
    if (r.merges.length) sound.merge(Math.max(...r.merges.map((m) => m.v)));
    else sound.slide();

    const best = getBest();
    const newRecord = !st.recordShown && best > 0 && s.score > best;
    if (newRecord) st.recordShown = true;

    if (r.over) {
      finish();
    } else if (r.reached2048) {
      showWin();
    } else if (newRecord) {
      setStatus('超过最高分了，接着冲！', 'win');
    } else if (s.maxTile > prevMax && s.maxTile >= 128) {
      setStatus(`合出了 ${s.maxTile}！`, 'win');
    } else {
      const empty = g.emptyCount();
      if (empty === 0) setStatus('格子满了，只能靠合并腾地方。', 'over');
      else setStatus(empty <= 2 ? `只剩 ${empty} 个空格了。` : '');
    }
    saveCurrent();
  }

  function undo() {
    if (!st.undo || isOverlayOpen(true) || !app().guard()) return;
    view.settle();
    st.game.restore(st.undo.g);
    st.session = st.undo.s;
    st.undo = null;
    st.lastMoveAt = Date.now();
    hideOverlay();
    $('board-2048').classList.remove('ended');
    view.renderAll();
    replay(view.layer, 'rewind'); // 整盘淡入一下：看得出"退回去了"，而不是方块凭空跳位
    refresh();
    saveCurrent();
    sound.select();
    setStatus('已撤销上一步。');
  }

  // ===================== 界面反馈 =====================

  /** 侧栏方向键跟着亮一下：用键盘或滑屏时，也能看出"按的是哪个方向"。 */
  function flashKey(dir) {
    const btn = document.querySelector(`#view-2048 .dpad [data-dir="${dir}"]`);
    if (!btn) return;
    replay(btn, 'pressed');
    clearTimeout(btn._t);
    btn._t = setTimeout(() => btn.classList.remove('pressed'), 140);
  }

  function refresh(gained) {
    const s = st.session;
    const stored = getBest();
    const best = Math.max(stored, s.score); // 本局超过纪录时跟着涨
    const record = stored > 0 && s.score > stored;
    $('score-2048').textContent = s.score;
    $('best-2048').textContent = best;
    $('score-2048-inline').textContent = s.score;
    $('best-2048-inline').textContent = best;
    document.querySelectorAll('#view-2048 .best-wrap').forEach((el) => el.classList.toggle('record', record));
    $('moves-2048').textContent = s.dirs.length;
    $('max-2048').textContent = s.maxTile;
    $('btn-undo-2048').disabled = !st.undo;
    if (gained) {
      // +N 贴着分数数字冒出来，数字本身也跳一下，眼睛不用到处找
      document.querySelectorAll('#view-2048 .gain-host').forEach((host) => {
        const el = document.createElement('span');
        el.className = 'score-gain';
        el.textContent = '+' + gained;
        host.appendChild(el);
        setTimeout(() => el.remove(), 900);
        replay(host.querySelector('.score-num'), 'bump');
      });
    }
  }

  function setStatus(text, cls) {
    const el = $('status-2048');
    el.textContent = text || '';
    el.className = 'status' + (cls ? ' ' + cls : '');
  }

  // ===================== 结算 / 通关 =====================

  function finish() {
    const s = st.session;
    s.result = 'over';
    s.endedAt = new Date().toISOString();
    archive(s);
    const isBest = updateBest(s.score);
    setStatus('没有能走的了，本局结束。', 'over');
    // 先让棋盘慢慢暗下去，再弹结算：看得清终盘，也不是"啪"一下被盖住
    $('board-2048').classList.add('ended');
    setTimeout(() => {
      if (st.session !== s) return; // 这期间撤销了或开了新局
      showOverlay('本局结束', isBest, encourage(s, isBest), false);
      sound.gameover();
      if (isBest) setTimeout(() => sound.best(), 700);
    }, 700);
  }

  function showWin() {
    const s = st.session;
    setStatus('合出 2048 了！', 'win');
    sound.best();
    // 先让 2048 那块的光晕放一会儿，再弹庆祝
    setTimeout(() => {
      if (st.session !== s) return; // 这期间撤销了
      showOverlay('合出 2048 了！', false, '了不起！可以接着下，冲一冲 4096。', true);
    }, view.slideMs() + 650);
  }

  function encourage(s, isBest) {
    if (isBest) return '刷新了最高分！🎉';
    if (s.maxTile >= 2048) return '合出过 2048，真了不起！';
    const best = getBest();
    if (best && s.score >= best * 0.8) return '离最高分就差一点点，再来一局！';
    return `这局合到了 ${s.maxTile}，下一局冲 ${s.maxTile * 2}！`;
  }

  function showOverlay(title, isBest, msg, win) {
    const s = st.session;
    $('ov2-title').textContent = title;
    $('ov2-score').textContent = s.score;
    $('ov2-best').classList.toggle('hidden', !isBest);
    $('ov2-stats').innerHTML = `
      <div><b>${s.maxTile}</b><span>最大方块</span></div>
      <div><b>${s.dirs.length}</b><span>步数</span></div>
      <div><b>${s.merges}</b><span>合并次数</span></div>
      <div><b>${stats.fmtDuration(s.playMs)}</b><span>用时</span></div>`;
    $('ov2-msg').textContent = msg;
    // 通关时主按钮是"继续"，开新局退为次要；结束时只有"再来一局"
    $('ov2-continue').hidden = !win;
    $('ov2-again').textContent = win ? '开新局' : '再来一局';
    $('ov2-again').classList.toggle('btn-primary', !win);
    $('overlay-2048').classList.remove('hidden');
  }

  function hideOverlay() {
    $('overlay-2048').classList.add('hidden');
  }

  /** 有弹层挡着就不接受滑动。onlyTutorial：只看教程（结束弹层开着时仍允许撤销）。 */
  function isOverlayOpen(onlyTutorial) {
    if (tut.open) return true;
    return !onlyTutorial && !$('overlay-2048').classList.contains('hidden');
  }

  // ===================== 新手教程 =====================
  // 在弹层里的一块小棋盘上手把手走几步。用的是另一盘独立的棋，
  // 跟正式对局、存档、最高分都不沾边——练坏了点"重来这一步"就行。

  const STEPS = [
    {
      title: '滑动',
      text: '往任意一个方向滑一下。电脑上按方向键，或者点棋盘下面的箭头。',
      board: [0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0],
      goal: () => true,
      done: '所有方块一起挤到了那一边。再看闪着的那块：每走一步，空格里都会冒出一个新的 2 或 4。',
      markSpawn: true,
    },
    {
      title: '合并',
      text: '最上面一行有两个 2 挨着。往左滑，让它们撞到一起。',
      board: [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      goal: (g) => g.maxTile() >= 4,
      hint: () => '它们没撞上。试试往左（或往右）滑。',
      done: '2 + 2 = 4！一样的数字撞到一起就合成一个，还会加分。不一样的数字（比如 2 和 4）不会合。',
    },
    {
      title: '越合越大',
      text: '一直往左滑：先让两个 4 合成 8，再让两个 8 合成 16。',
      board: [4, 4, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      goal: (g) => g.maxTile() >= 16,
      hint: (g) =>
        g.cells.filter((t) => t && t.v === 8).length >= 2
          ? '合出一个 8 了！一次滑动每块只合一回，再滑一下，让两个 8 撞到一起。'
          : '往左或往右滑，让一样的数字撞到一起。',
      done: '合出 16 了！就这样一路合上去：32、64、128……',
    },
    { title: '记住这几条', final: true },
  ];

  const tut = { open: false, step: 0, game: null, view: null, done: false };

  /** 第一次进 2048 自动弹；已经玩过（有历史局，或当前这局走过几步）的人不打扰。 */
  function shouldAutoTutorial() {
    if (tut.open || load(KEY_TUTORIAL, false)) return false;
    return !load(KEY_SESSIONS, []).length && !(st.session && st.session.dirs.length);
  }

  function openTutorial() {
    tut.open = true;
    $('tutorial-2048').classList.remove('hidden');
    showStep(0);
  }

  function closeTutorial() {
    tut.open = false;
    tut.view.settle();
    store(KEY_TUTORIAL, true);
    $('tutorial-2048').classList.add('hidden');
    // 焦点还给页面，方向键直接玩正式棋盘
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (st.session && !st.session.dirs.length) setStatus('开始吧！用方向键，或在棋盘上滑动。');
  }

  function setFeedback(text, cls) {
    const el = $('tut-feedback');
    el.textContent = text || '';
    el.className = 'tut-feedback' + (cls ? ' ' + cls : '');
  }

  function showStep(i) {
    const step = STEPS[i];
    tut.step = i;
    tut.done = false;
    $('tut-dots').innerHTML = STEPS.map(
      (_, k) => `<i class="${k === i ? 'on' : k < i ? 'past' : ''}"></i>`
    ).join('');
    $('tut-title').textContent = `第 ${i + 1} 步 · ${step.title}`;
    $('tut-stage').hidden = !!step.final;
    $('tut-goal').hidden = !step.final;
    $('tut-retry').hidden = !!step.final;
    $('tut-text').hidden = !!step.final;
    $('tut-feedback').hidden = !!step.final; // 最后一步没有操作反馈，别留一块空白
    setFeedback('');
    const next = $('tut-next');
    next.textContent = step.final ? '开始玩' : '下一步';
    next.disabled = !step.final;
    if (step.final) return;

    $('tut-text').textContent = step.text;
    const g = new Game2048({ size: 4, seed: 1 });
    let id = 1;
    g.cells = step.board.map((v) => (v ? { id: id++, v } : null));
    g.nextId = id;
    // 新块固定冒在最后一个空格（右下角一带）、总是 2：离演示的那几块远，讲解对得上
    g.rng = { int: (n) => n - 1, next: () => 0.5 };
    tut.game = g;
    tut.view.use(g);
    tut.view.renderAll(new Set(g.cells.filter(Boolean).map((t) => t.id)));
  }

  function tutorialMove(dir) {
    const step = STEPS[tut.step];
    if (step.final || !app().guard()) return;
    tut.view.settle();
    tut.view.layer.querySelectorAll('.tut-mark').forEach((el) => el.classList.remove('tut-mark'));
    const g = tut.game;
    const r = g.move(dir);
    if (!r) {
      tut.view.nudge(dir);
      sound.bump();
      if (!tut.done) setFeedback('这个方向推不动，换个方向试试。');
      return;
    }
    if (r.merges.length) sound.merge(Math.max(...r.merges.map((m) => m.v)));
    else sound.slide();

    const reached = !tut.done && step.goal(g);
    tut.view.animate(r, () => {
      if (!(reached && step.markSpawn && r.spawn)) return;
      const el = tut.view.els.get(r.spawn.id);
      // 等新块的出现动画放完再圈出来，两个动画不抢
      if (el) setTimeout(() => el.firstChild.classList.add('tut-mark'), 180);
    });
    if (reached) {
      tut.done = true;
      setFeedback(step.done, 'win');
      const next = $('tut-next');
      next.disabled = false;
      next.focus({ preventScroll: true }); // 按回车就能进下一步
    } else if (!tut.done && step.hint) {
      setFeedback(step.hint(g));
    }
  }

  // ===================== 输入 =====================

  function bind() {
    document.addEventListener('keydown', (e) => {
      if (!$('view-2048').classList.contains('active')) return;
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      const dir = e.ctrlKey || e.altKey || e.metaKey ? null : KEYS[e.key] || KEYS[e.key.toLowerCase()];
      if (tut.open) {
        if (e.key === 'Escape') closeTutorial();
        if (dir) {
          e.preventDefault();
          tutorialMove(dir);
        }
        return;
      }
      if ((e.ctrlKey && e.key === 'z') || e.key === 'u') {
        undo();
        return;
      }
      if (!dir) return;
      e.preventDefault(); // 方向键别顺带滚动页面
      move(dir);
    });

    bindSwipe($('board-2048'), move);
    document.querySelectorAll('#view-2048 .dpad [data-dir]').forEach((btn) => {
      btn.addEventListener('click', () => move(btn.dataset.dir));
    });
    $('btn-undo-2048').addEventListener('click', undo);
    $('btn-new-2048').addEventListener('click', () => newGame(false));
    $('btn-help-2048').addEventListener('click', openTutorial);
    $('ov2-again').addEventListener('click', () => newGame(true));
    $('ov2-continue').addEventListener('click', hideOverlay);
    $('overlay-2048').addEventListener('click', (e) => {
      // 通关弹层要明确选一个；结束弹层点空白处可关掉，看看终盘或撤销
      if (e.target.id === 'overlay-2048' && $('ov2-continue').hidden) hideOverlay();
    });

    // 教程
    bindSwipe($('tut-board'), tutorialMove);
    document.querySelectorAll('#tutorial-2048 [data-tdir]').forEach((btn) => {
      btn.addEventListener('click', () => tutorialMove(btn.dataset.tdir));
    });
    $('tut-skip').addEventListener('click', closeTutorial);
    $('tut-retry').addEventListener('click', () => showStep(tut.step));
    $('tut-next').addEventListener('click', () => {
      if (tut.step < STEPS.length - 1) showStep(tut.step + 1);
      else closeTutorial();
    });
  }

  // ===================== 交给 app.js 调度的钩子 =====================

  global.CL.games = global.CL.games || {};
  global.CL.games['2048'] = {
    onShow() {
      if (shouldAutoTutorial()) openTutorial();
    },
    onWarn(rem) {
      setStatus(`再玩 ${Math.ceil(rem / 60)} 分钟就要休息啦，注意时间~`, 'over');
    },
    onLock() {
      hideOverlay();
      setStatus('今天的游戏时间到啦，明天再来。', 'over');
    },
  };

  document.addEventListener('DOMContentLoaded', () => {
    view = new BoardView($('board-2048'));
    tut.view = new BoardView($('tut-board'));
    bind();
    if (!resume()) newGame(true);
  });
})(window);
