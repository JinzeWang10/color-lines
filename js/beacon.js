/**
 * 匿名打点：活跃游戏每满 1 分钟发一个心跳，服务器只在 nginx 日志里记一行。
 *
 * 设计要点：
 *  - 复用防沉迷计时器的"真正在玩"口径（见 limit.js）：挂机、切走、看复盘都不计。
 *  - 只发一个随机匿名 ID，不含任何个人信息；服务器侧日志也不记 IP 和 UA。
 *  - 单文件离线版（file://）不打点——那份是发出去双击玩的，不该联网。
 *  - 纯 GET，服务端直接 204 不落文件；发失败就算了，绝不影响游戏。
 */
(function (global) {
  'use strict';

  const UID_KEY = 'color-lines.uid';
  const INTERVAL_SEC = 60;

  function rand(n) {
    return Math.random()
      .toString(36)
      .slice(2, 2 + n);
  }

  /** 这台设备的匿名 ID，首次访问时生成并留在本地。 */
  function loadUid() {
    try {
      let v = localStorage.getItem(UID_KEY);
      if (!v) {
        v = rand(8);
        localStorage.setItem(UID_KEY, v);
      }
      return v;
    } catch (e) {
      return 'anon'; // 隐私模式下 localStorage 不可用，退化成匿名一坨
    }
  }

  class Beacon {
    constructor(path) {
      this.path = path || '/px';
      this.enabled = location.protocol === 'http:' || location.protocol === 'https:';
      this.uid = this.enabled ? loadUid() : '';
      this.sid = rand(6); // 本次打开页面 = 一个会话，用来数"今天开了几回"
      this.sent = null; // 已上报到第几分钟；null 表示还没定基线
    }

    /**
     * 由 limit.onTick 调用。seconds 是"当天累计"的活跃秒数（跨刷新持久化），
     * 所以首次 tick 只记基线不补发，否则每次刷新页面都会多算一分钟。
     */
    tick(seconds) {
      if (!this.enabled) return;
      const minutes = Math.floor(seconds / INTERVAL_SEC);
      if (this.sent === null) {
        this.sent = minutes;
        return;
      }
      if (minutes <= this.sent) return;
      this.sent = minutes;
      this.send();
    }

    send() {
      try {
        new Image().src = `${this.path}?u=${this.uid}&s=${this.sid}&t=${Date.now()}`;
      } catch (e) {}
    }
  }

  global.CL = global.CL || {};
  global.CL.Beacon = Beacon;
})(window);
