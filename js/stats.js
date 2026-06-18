/**
 * 统计：从事件流算出单局指标与历史聚合。复盘"变强"靠这些数字。
 */
(function (global) {
  'use strict';

  /** 单局指标。 */
  function sessionStats(session) {
    let moves = 0;
    let ballsCleared = 0;
    let biggestClear = 0;
    let clearTimes = 0;
    let score = 0;
    for (const ev of session.events) {
      if (ev.type === 'move') moves++;
      else if (ev.type === 'clear') {
        ballsCleared += ev.count;
        clearTimes++;
        score += ev.scoreGained || 0;
        if (ev.count > biggestClear) biggestClear = ev.count;
      }
    }
    let durationMs = 0;
    if (session.startedAt && session.endedAt) {
      durationMs = new Date(session.endedAt) - new Date(session.startedAt);
    } else if (session.events.length) {
      durationMs = session.events[session.events.length - 1].t || 0;
    }
    return {
      // 直接从事件流累加，进行中的局也能正确显示，不依赖 finalScore
      score,
      moves,
      ballsCleared,
      biggestClear,
      clearTimes,
      durationMs,
      efficiency: moves ? +(ballsCleared / moves).toFixed(2) : 0, // 每步平均消球
      result: session.result,
    };
  }

  /** 历史聚合。 */
  function aggregate(sessions) {
    if (!sessions.length) {
      return { games: 0, best: 0, avg: 0, totalCleared: 0, scores: [] };
    }
    // 按时间正序，趋势图从旧到新
    const ordered = sessions.slice().sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
    const scores = ordered.map((s) => sessionStats(s).score);
    const totalCleared = ordered.reduce((sum, s) => sum + sessionStats(s).ballsCleared, 0);
    const best = Math.max(...scores);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    return { games: sessions.length, best, avg, totalCleared, scores };
  }

  function fmtDuration(ms) {
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m ? `${m}分${r}秒` : `${r}秒`;
  }

  /** 简易内联 SVG 折线图。 */
  function sparkline(values, w, h) {
    if (!values.length) return '';
    w = w || 240;
    h = h || 48;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const step = values.length > 1 ? w / (values.length - 1) : 0;
    const pts = values.map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const last = pts[pts.length - 1].split(',');
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="spark">
      <polyline fill="none" stroke="var(--accent)" stroke-width="2" points="${pts.join(' ')}" />
      <circle cx="${last[0]}" cy="${last[1]}" r="3" fill="var(--accent)" />
    </svg>`;
  }

  global.CL = global.CL || {};
  global.CL.stats = { sessionStats, aggregate, fmtDuration, sparkline };
})(window);
