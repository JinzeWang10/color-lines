/**
 * 防沉迷：按自然日累计"真正在玩"的时间，达上限锁定，临近提醒，过零点清零。
 *
 * 设计要点：
 *  - 只在"游戏页 + 页面可见 + 最近有操作"时计时（看复盘、挂机、切走都不算）。
 *  - 上限是代码常量，界面里改不了——否则防沉迷形同虚设。
 *  - localStorage 持久化，当天重开仍锁定。属软限制：清浏览器数据/改系统时钟可绕过。
 */
(function (global) {
  'use strict';

  const KEY = 'color-lines.playtime';
  const DEFAULTS = {
    dailyLimitSec: 90 * 60, // 每天 1.5 小时
    idlePauseSec: 120, // 超过 2 分钟无操作则暂停计时
    warnRemainingSec: 600, // 剩 10 分钟时提醒一次
  };

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (o && o.date === todayStr()) return { date: o.date, seconds: o.seconds | 0 };
    } catch (e) {}
    return { date: todayStr(), seconds: 0 };
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {}
  }

  class PlayLimit {
    constructor(opts) {
      this.cfg = Object.assign({}, DEFAULTS, opts || {});
      this.state = load();
      this.lastActivity = Date.now();
      this.warned = false;
      this.locked = this.state.seconds >= this.cfg.dailyLimitSec;
      this.isActive = () => true; // 由外部注入：是否在游戏页且页面可见
      this.onWarn = null; // (remainingSec)
      this.onLock = null; // ()
      this.onTick = null; // (seconds, remainingSec)
      this._timer = null;
    }

    start() {
      if (this._timer) return;
      this._timer = setInterval(() => this._tick(), 1000);
      this._tick();
    }

    /** 有操作时调用，刷新活跃时间。 */
    bump() {
      this.lastActivity = Date.now();
    }

    _tick() {
      // 跨天重置
      if (this.state.date !== todayStr()) {
        this.state = { date: todayStr(), seconds: 0 };
        this.warned = false;
        this.locked = false;
        save(this.state);
      }
      const idle = (Date.now() - this.lastActivity) / 1000 > this.cfg.idlePauseSec;
      if (!this.locked && this.isActive() && !idle) {
        this.state.seconds++;
        save(this.state);
        const rem = this.remaining();
        if (!this.warned && rem <= this.cfg.warnRemainingSec && rem > 0) {
          this.warned = true;
          if (this.onWarn) this.onWarn(rem);
        }
        if (this.state.seconds >= this.cfg.dailyLimitSec) {
          this.locked = true;
          if (this.onLock) this.onLock();
        }
      }
      if (this.onTick) this.onTick(this.state.seconds, this.remaining());
    }

    remaining() {
      return Math.max(0, this.cfg.dailyLimitSec - this.state.seconds);
    }
    isLocked() {
      return this.locked;
    }
    limitMinutes() {
      return Math.round(this.cfg.dailyLimitSec / 60);
    }

    /** 距离明天零点还有多久（ms）。 */
    msUntilReset() {
      const d = new Date();
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
      return next - d;
    }
  }

  global.CL = global.CL || {};
  global.CL.PlayLimit = PlayLimit;
})(window);
