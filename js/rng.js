/**
 * 种子随机数生成器 (mulberry32)。
 *
 * 为什么需要：每一局都从一个 seed 启动，配合事件日志，整局可被完整重建/复盘。
 * 即便不依赖确定性重放（我们会把每次生成的球显式记进日志），seed 也方便排查问题。
 */
(function (global) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 用字符串/时间生成一个 32 位整数种子。 */
  function makeSeed() {
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }

  function createRng(seed) {
    let state = seed >>> 0;
    // 内联 mulberry32，把内部状态暴露出来，方便撤销时回滚到上一步的随机状态。
    const next = () => {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      seed,
      next, // [0,1)
      int: (n) => Math.floor(next() * n), // [0, n)
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      getState: () => state >>> 0,
      setState: (s) => {
        state = s >>> 0;
      },
    };
  }

  global.CL = global.CL || {};
  global.CL.makeSeed = makeSeed;
  global.CL.createRng = createRng;
})(window);
