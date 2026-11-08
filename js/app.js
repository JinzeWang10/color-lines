/**
 * 外壳：几个游戏共用的东西——切换视图、防沉迷计时、匿名打点、锁定遮罩、音效开关。
 *
 * 防沉迷管的是"今天一共玩了多久"，所以全站只有一个计时器、一份上限；
 * 但每一秒都记在当时在玩的那个游戏名下，锁屏和统计看板上能分开看。
 *
 * 本文件最后加载：各游戏先在 CL.games 上挂好自己的钩子（onShow / onWarn / onLock），
 * DOMContentLoaded 时它们先各自初始化，这里再统一接管。
 */
(function (global) {
  'use strict';

  const { PlayLimit, Beacon, sound } = global.CL;
  const games = global.CL.games || {};
  const $ = (id) => document.getElementById(id);

  // 视图属于哪个游戏；playing 为 false 的视图（复盘）不计时
  const VIEWS = {
    play: { game: 'lines', playing: true },
    2048: { game: '2048', playing: true },
    review: { game: 'lines', playing: false },
  };
  const GAMES = {
    lines: { name: '彩球连珠', sub: 'Color Lines' },
    2048: { name: '2048', sub: '数字合成' },
  };
  // 显式排序：'2048' 长得像数组下标，Object.keys 会把它排到 lines 前面
  const GAME_ORDER = ['lines', '2048'];
  const VIEW_KEY = 'color-lines.view'; // 记住上次玩的游戏，下次直接打开它

  const limit = new PlayLimit();
  const beacon = new Beacon(); // 离线单文件版会自动关掉
  let view = 'play';

  const playingGame = () => (VIEWS[view].playing ? VIEWS[view].game : null);
  limit.isActive = () => !!playingGame() && document.visibilityState === 'visible';
  limit.currentGame = playingGame;

  function show(next) {
    if (!VIEWS[next]) next = 'play';
    view = next;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === next));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + next));
    const id = VIEWS[next].game;
    const info = GAMES[id];
    $('logo').innerHTML = `${info.name} <span>${info.sub}</span>`;
    document.title = `${info.name} · ${info.sub}`;
    if (VIEWS[next].playing) {
      try {
        localStorage.setItem(VIEW_KEY, next);
      } catch (e) {}
    }
    const hooks = games[id];
    if (hooks && hooks.onShow) hooks.onShow(next);
  }

  function initialView() {
    // 链接里带 #2048 直接进 2048；否则回到上次玩的那个
    const hash = location.hash.slice(1);
    if (hash === '2048') return '2048';
    if (hash === 'lines') return 'play';
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved && VIEWS[saved] && VIEWS[saved].playing) return saved;
    } catch (e) {}
    return 'play';
  }

  /** 游戏里每次操作前调用：锁了就弹遮罩并返回 false；没锁就记一次活跃。 */
  function guard() {
    if (limit.isLocked()) {
      showLock();
      return false;
    }
    limit.bump();
    sound.unlock();
    return true;
  }

  // ---- 防沉迷锁定 ----
  function fmtCountdown(ms) {
    const totalMin = Math.ceil(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
  }

  /** "今天：彩球连珠 52 分钟 · 2048 38 分钟"；只玩了一个游戏就不必拆开说。 */
  function splitText() {
    const by = limit.byGame();
    const parts = GAME_ORDER.filter((id) => (by[id] || 0) >= 60)
      .map((id) => `${GAMES[id].name} ${Math.round(by[id] / 60)} 分钟`);
    return parts.length > 1 ? '今天：' + parts.join(' · ') : '';
  }

  function showLock() {
    $('lock-text').innerHTML = `已经玩了 ${limit.limitMinutes()} 分钟，休息一下眼睛，<br>明天再来玩吧！`;
    $('lock-split').textContent = splitText();
    $('lock-countdown').textContent = `距离明天还有 ${fmtCountdown(limit.msUntilReset())}`;
    $('lock-overlay').classList.remove('hidden');
    Object.keys(games).forEach((id) => games[id].onLock && games[id].onLock());
  }

  function setupLimit() {
    limit.onWarn = (rem) => {
      const hooks = games[playingGame()];
      if (hooks && hooks.onWarn) hooks.onWarn(rem);
    };
    limit.onLock = showLock;
    limit.onTick = (seconds, remaining, counted) => {
      beacon.tick(limit.byGame(), counted);
      if (limit.isLocked() && !$('lock-overlay').classList.contains('hidden')) {
        $('lock-countdown').textContent = `距离明天还有 ${fmtCountdown(limit.msUntilReset())}`;
      }
    };
    limit.start();
    if (limit.isLocked()) showLock();
  }

  // ---- 音效开关（每个游戏侧栏各有一个按钮，状态全站共用）----
  function updateSoundBtns() {
    document.querySelectorAll('.js-sound').forEach((b) => {
      b.textContent = sound.isMuted() ? '🔇 静音' : '🔊 音效';
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => show(tab.dataset.view));
    });
    document.querySelectorAll('.js-sound').forEach((b) => {
      b.addEventListener('click', () => {
        sound.toggleMute();
        updateSoundBtns();
      });
    });
    updateSoundBtns();
    show(initialView());
    setupLimit();
  });

  global.CL.app = { guard, limit };
})(window);
