/**
 * 匿名打点：活跃游戏每满 1 分钟发一个心跳，服务器只在 nginx 日志里记一行。
 *
 * 设计要点：
 *  - 复用防沉迷计时器的"真正在玩"口径（见 limit.js）：挂机、切走、看复盘都不计。
 *  - 按游戏分开数：每个心跳带上游戏 id（g=lines / g=2048），看板据此分开统计。
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
      this.sent = {}; // 每个游戏已上报到第几分钟；没有这个键表示还没定基线
    }

    /**
     * 由 limit.onTick 调用。
     * @param {object} games   各游戏"当天累计"的活跃秒数（跨刷新持久化，见 limit.byGame）
     * @param {string} counted 这一秒记给了哪个游戏；本页这一秒没计时则为 null
     *
     * 某游戏第一次出现时只记基线不补发，否则每次刷新页面都会多算一分钟。
     * 分钟数变小说明跨天清零了，重定基线即可。
     */
    tick(games, counted) {
      if (!this.enabled) return;
      for (const id of Object.keys(games)) {
        const minutes = Math.floor(games[id] / INTERVAL_SEC);
        const prev = this.sent[id];
        this.sent[id] = minutes;
        // 只有本页亲手数的那个游戏跨过整分钟才发
        if (prev !== undefined && minutes > prev && id === counted) this.send(id);
      }
    }

    send(game) {
      try {
        new Image().src = `${this.path}?u=${this.uid}&s=${this.sid}&g=${game}&t=${Date.now()}`;
      } catch (e) {}
    }
  }

  global.CL = global.CL || {};
  global.CL.Beacon = Beacon;
})(window);
