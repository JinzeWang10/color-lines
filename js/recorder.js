/**
 * 对局记录器：把每一局记成"初始局面 + 带时间戳的事件流"。
 *
 * 复盘的关键设计：事件流本身就是完整真相。
 * 重建某一手的棋盘 = 取初始局面，把事件依次施加（move/spawn/clear），完全不依赖 RNG。
 * 这样无论逻辑怎么改，旧录像都能稳定回放。
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'color-lines.sessions.v1';
  const SCHEMA_VERSION = 1;

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0;
      const v = ch === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  class Recorder {
    constructor() {
      this.session = null;
      this._start = 0;
    }

    /** 开一局。game 已完成 initialSpawn。 */
    startSession(game, settings) {
      this._start = Date.now();
      this.session = {
        id: uuid(),
        version: SCHEMA_VERSION,
        startedAt: new Date(this._start).toISOString(),
        endedAt: null,
        settings: {
          size: game.size,
          colors: game.colors,
          lineLength: game.lineLength,
          spawnCount: game.spawnCount,
        },
        seed: game.seed,
        initialBoard: game.snapshot(),
        initialNext: game.next.slice(),
        events: [],
        moveCount: 0,
        finalScore: 0,
        result: 'in_progress',
      };
      this.save();
      return this.session;
    }

    /** 记录 game.move 返回的一组事件，附相对时间戳（ms）。 */
    record(events) {
      if (!this.session) return;
      const t = Date.now() - this._start;
      for (const ev of events) {
        const stamped = Object.assign({ t }, ev);
        this.session.events.push(stamped);
        if (ev.type === 'move') this.session.moveCount += 1;
        if (ev.type === 'gameover') {
          this.session.result = 'over';
          this.session.finalScore = ev.finalScore;
          this.session.endedAt = new Date().toISOString();
        }
      }
      this.save();
    }

    /** 撤销：把事件流回退到指定长度，并重算步数。 */
    truncateTo(eventCount) {
      if (!this.session) return;
      this.session.events.length = Math.max(0, eventCount);
      this.session.moveCount = this.session.events.filter((e) => e.type === 'move').length;
      if (this.session.result === 'over') {
        this.session.result = 'in_progress';
        this.session.endedAt = null;
      }
      this.save();
    }

    /** 玩家主动放弃/离开时调用。 */
    finalize(score, result) {
      if (!this.session) return;
      this.session.finalScore = score;
      if (this.session.result === 'in_progress') this.session.result = result || 'abandoned';
      this.session.endedAt = this.session.endedAt || new Date().toISOString();
      this.save();
    }

    // ---- 持久化 ----
    save() {
      if (!this.session) return;
      const all = Recorder.loadAll();
      const idx = all.findIndex((s) => s.id === this.session.id);
      if (idx >= 0) all[idx] = this.session;
      else all.unshift(this.session);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      } catch (e) {
        console.warn('保存对局失败（可能是存储已满）：', e);
      }
    }

    static loadAll() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    static get(id) {
      return Recorder.loadAll().find((s) => s.id === id) || null;
    }

    static remove(id) {
      const all = Recorder.loadAll().filter((s) => s.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }

    static clearAll() {
      localStorage.removeItem(STORAGE_KEY);
    }

    // ---- 最高分 ----
    static getBest() {
      return parseInt(localStorage.getItem('color-lines.best') || '0', 10);
    }
    /** 若超过历史最高则写入，返回是否破纪录。 */
    static updateBest(score) {
      if (score > Recorder.getBest()) {
        localStorage.setItem('color-lines.best', String(score));
        return true;
      }
      return false;
    }

    /** 导出单局为下载文件。 */
    static exportSession(id) {
      const s = Recorder.get(id);
      if (!s) return;
      Recorder._download(`color-lines-${id.slice(0, 8)}.json`, JSON.stringify(s, null, 2));
    }

    /** 导出全部对局。 */
    static exportAll() {
      const all = Recorder.loadAll();
      Recorder._download(`color-lines-all-${Date.now()}.json`, JSON.stringify(all, null, 2));
    }

    static _download(filename, text) {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  global.CL = global.CL || {};
  global.CL.Recorder = Recorder;
})(window);
