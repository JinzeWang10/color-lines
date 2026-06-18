/**
 * 音效：用 WebAudio 实时合成，不依赖任何音频文件，file:// 下也能用。
 * 浏览器要求首次用户手势后才能出声，故首次交互时 resume。
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'color-lines.muted';
  let ctx = null;
  let muted = localStorage.getItem(STORAGE_KEY) === '1';

  function ensure() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** 单个带包络的音符。 */
  function tone(freq, start, dur, type, gain) {
    const c = ctx;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const t0 = c.currentTime + start;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain == null ? 0.18 : gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function play(fn) {
    if (muted) return;
    if (!ensure()) return;
    fn();
  }

  const sound = {
    isMuted: () => muted,
    toggleMute() {
      muted = !muted;
      localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
      if (!muted) {
        ensure();
        this.select(); // 取消静音给个反馈
      }
      return muted;
    },
    unlock() {
      ensure();
    }, // 首次点击调用

    select() {
      play(() => tone(660, 0, 0.08, 'sine', 0.12));
    },
    move() {
      play(() => {
        tone(420, 0, 0.09, 'triangle', 0.12);
        tone(560, 0.04, 0.1, 'triangle', 0.1);
      });
    },
    invalid() {
      play(() => {
        tone(180, 0, 0.16, 'sawtooth', 0.1);
        tone(150, 0.06, 0.16, 'sawtooth', 0.08);
      });
    },
    /** 消除：连消越长，上行音阶越长越欢快。 */
    clear(count) {
      play(() => {
        const base = 523.25; // C5
        const ratios = [1, 1.26, 1.5, 1.68, 2, 2.52]; // 大致 C E G A C...
        const n = Math.min(count, ratios.length);
        for (let i = 0; i < n; i++) tone(base * ratios[i], i * 0.06, 0.18, 'sine', 0.16);
      });
    },
    gameover() {
      play(() => {
        [523, 415, 330, 262].forEach((f, i) => tone(f, i * 0.14, 0.3, 'triangle', 0.14));
      });
    },
    best() {
      play(() => {
        [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.28, 'sine', 0.16));
        tone(1047, 0.4, 0.4, 'sine', 0.12);
      });
    },
  };

  global.CL = global.CL || {};
  global.CL.sound = sound;
})(window);
