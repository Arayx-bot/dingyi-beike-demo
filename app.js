/* =============================================================
 * 顶屹备课助手 · 应用逻辑
 * 只依赖 content.js 暴露的 FORM / LOADING_STEPS / PLANS / LESSON / SCORE_ITEMS
 * 不硬编码任何业务文案 / 教案内容
 * ============================================================= */
(function () {
  'use strict';

  /* ---------------- 小工具 ---------------- */
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const num = (v, d) => {
    const n = Number(v);
    return isFinite(n) ? n : (d == null ? 0 : d);
  };
  const f = (n) => {
    const v = Math.round(n * 100) / 100;
    return String(v);
  };
  const arr = (v) => Array.isArray(v) ? v : [];
  const obj = (v) => (v && typeof v === 'object') ? v : {};

  const optValue = (o) => typeof o === 'string' ? o : String((o && (o.id != null ? o.id : (o.value != null ? o.value : o.label))) || '');
  const optLabel = (o) => typeof o === 'string' ? o : String((o && (o.label != null ? o.label : (o.id != null ? o.id : o.value))) || '');

  const segColor = (key) => SEG_COLORS[key] || '#1f6b3a';

  // 文本字段容错：数组按 · 拼接，空值给占位符
  const tx = (v, fb) => {
    if (Array.isArray(v)) {
      const s = v.map((x) => String(x == null ? '' : x)).filter(Boolean).join(' · ');
      return s || (fb == null ? '—' : fb);
    }
    const s = (v == null ? '' : String(v)).trim();
    return s || (fb == null ? '—' : fb);
  };

  /* ---------------- 数据入口 ----------------
   * content.js 可以用 window.X = ... 暴露，也可以直接声明顶层 const X = ...；
   * 两种都支持，缺字段时降级处理，不会白屏。 */
  const pick = (name) => {
    // content.js 可能用 window.X = ... 挂载，也可能用顶层 const X = ... 声明。
    // new Function 的函数体在全局作用域链上创建，因此能安全读到全局词法绑定，
    // 不会与本 IIFE 内的同名局部变量互相干扰。
    try {
      return (new Function('try { return (typeof ' + name + ' !== "undefined") ? ' + name + ' : undefined; } catch (e) { return undefined; }'))();
    } catch (e) {
      return undefined;
    }
  };

  const D = {
    FORM: obj(pick('FORM')),
    LOADING_STEPS: arr(pick('LOADING_STEPS')),
    PLANS: arr(pick('PLANS')),
    LESSON: obj(pick('LESSON')),
    SCORE_ITEMS: arr(pick('SCORE_ITEMS'))
  };
  const F = D.FORM;
  const LS = D.LESSON;
  const stepText = (s) => typeof s === 'string' ? s : String((s && (s.text != null ? s.text : (s.label != null ? s.label : s.name))) || '');

  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  const backBtn = document.getElementById('backBtn');

  const STORE_KEY = 'dy_beike_scores_v1';
  const SEG_COLORS = {
    warmup: '#67b57f',
    tech: '#1f6b3a',
    skill: '#e08a2e',
    game: '#f2b705',
    cool: '#8a9a90'
  };
  const PARENT = {
    home: null,
    input: 'home',
    loading: 'input',
    plans: 'input',
    plan: 'plans',
    score: 'plan',
    done: 'plan'
  };

  /* ---------------- 小工具（上方已提前声明，此处只保留数据校验） ---------------- */

  function bandFor(total) {
    const L = obj(F.level);
    const bands = arr(L.bands);
    for (let i = 0; i < bands.length; i++) {
      if (total <= num(bands[i].max, 0)) return bands[i];
    }
    if (bands.length) return bands[bands.length - 1];
    return { label: '' };
  }

  function maxLevelTotal() {
    const L = obj(F.level);
    const dims = arr(L.dimensions);
    const scale = arr(L.scale).length ? arr(L.scale) : [1, 2, 3, 4, 5];
    return num(L.total, 0) || (dims.length * scale[scale.length - 1]);
  }

  // 段时长容错：负数/非数字按 0 处理
  const minutesOf = (s) => Math.max(0, num(s && s.minutes, 0));

  function lessonTotalMinutes() {
    return arr(LS.segments).reduce((a, s) => a + minutesOf(s), 0);
  }

  function defaultState() {
    const ages = obj(F.ages);
    const fields = obj(F.field);
    const eq = obj(F.equipment);
    const topics = obj(F.topics);
    const skills = obj(F.skills);
    const level = obj(F.level);

    const st = {
      age: ages.default != null ? ages.default : (arr(ages.options).length ? optValue(ages.options[0]) : ''),
      topic: topics.default != null ? topics.default : '',
      goal: obj(F.goal).default || '',
      players: num(obj(F.players).default, 14),
      field: fields.default != null ? fields.default : (arr(fields.options).length ? optValue(fields.options[0]) : ''),
      equipment: arr(eq.default).slice(),
      level: {},
      mastered: arr(skills.mastered).slice(),
      unmastered: arr(skills.unmastered).slice(),
      planId: null,
      scores: {},
      comment: '',
      last: null
    };

    if (!st.topic) {
      const opts = arr(topics.options).filter((o) => o && o.enabled !== false);
      st.topic = opts.length ? optValue(opts[0]) : '';
    }

    arr(level.dimensions).forEach((dim) => {
      st.level[dim.key] = num(dim.default, 3);
    });

    return st;
  }

  let state = defaultState();
  const startState = defaultState;

  /* ---------------- 路由 ---------------- */
  const ROUTES = ['home', 'input', 'loading', 'plans', 'plan', 'score', 'done'];

  function currentRoute() {
    const h = (location.hash || '').replace(/^#/, '').trim();
    return ROUTES.indexOf(h) >= 0 ? h : 'home';
  }

  function go(route) {
    if (('#' + route) === location.hash) {
      render();
    } else {
      location.hash = '#' + route;
    }
  }

  let toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1900);
  }

  /* ---------------- 存储 ---------------- */
  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveRecord(rec) {
    const list = loadRecords();
    list.unshift(rec);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 20)));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* =============================================================
   * SVG 场地图渲染器
   * ============================================================= */
  let svgUid = 0;

  const TEAM = {
    A: { fill: '#1f5fbf', color: '#ffffff', label: '进攻' },  // 进攻 = 蓝
    D: { fill: '#d23a2a', color: '#ffffff', label: '防守' },  // 防守 = 红
    N: { fill: '#f2b705', color: '#111111', label: '教练' }   // 中立/教练 = 黄
  };

  const LINE_STYLE = {
    pass: { color: '#ffffff', width: 0.26, dash: null, arrow: 1.35 },
    run: { color: '#ffe98a', width: 0.24, dash: '1.5 1.15', arrow: 1.3 },
    dribble: { color: '#ffffff', width: 0.23, dash: null, arrow: 1.2, amp: 0.4, lambda: 1.75 },
    shot: { color: '#f2b705', width: 0.46, dash: null, arrow: 1.75 }
  };

  // 场外留白（米）：content 中部分球员/教练坐标有意略超出场地边界
  const DIAG_MARGIN = 3.4;

  /* 标记缩放：坐标单位是米，但标记（球员/球/锥桶/箭头）需要在屏幕上大小一致，
   * 否则 35×50m 的场地上球员圆点只有 16px、号码看不清。
   * 按 viewBox 宽度线性放大，使不同场地上的球员圆点屏幕直径基本一致（≈26px）。 */
  const DIAG_BASE_VW = 20 + DIAG_MARGIN * 2;
  function markerScale(W) {
    const vw = W + DIAG_MARGIN * 2;
    return Math.min(1.65, Math.max(0.6, vw / DIAG_BASE_VW));
  }

  function ptsOf(list) {
    return arr(list)
      .filter((p) => Array.isArray(p) && p.length >= 2)
      .map((p) => ({ x: num(p[0]), y: num(p[1]) }));
  }

  function polyD(pts) {
    if (!pts.length) return '';
    let d = 'M' + f(pts[0].x) + ' ' + f(pts[0].y);
    for (let i = 1; i < pts.length; i++) d += 'L' + f(pts[i].x) + ' ' + f(pts[i].y);
    return d;
  }

  // 从末端往回裁剪 back 米，避免箭头和线头重叠
  function trimEnd(pts, back) {
    const copy = pts.map((p) => ({ x: p.x, y: p.y }));
    let remain = num(back, 0);
    while (copy.length > 1 && remain > 0.0001) {
      const last = copy[copy.length - 1];
      const prev = copy[copy.length - 2];
      const dx = last.x - prev.x;
      const dy = last.y - prev.y;
      const len = Math.hypot(dx, dy);
      if (len <= remain) {
        copy.pop();
        remain -= len;
      } else {
        const t = (len - remain) / len;
        copy[copy.length - 1] = { x: prev.x + dx * t, y: prev.y + dy * t };
        remain = 0;
      }
    }
    return copy;
  }

  // 按弧长重采样，并在平滑后的折线上计算切向
  function resample(pts, step, tangentWin) {
    const out = [];
    let done = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const n = Math.max(1, Math.ceil(len / step));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        out.push({ x: a.x + dx * t, y: a.y + dy * t, s: done + len * t, ux: dx / len, uy: dy / len });
      }
      done += len;
    }
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2] || last;
    const dx = last.x - prev.x;
    const dy = last.y - prev.y;
    const l = Math.hypot(dx, dy) || 1;
    out.push({ x: last.x, y: last.y, s: done, ux: dx / l, uy: dy / l });

    // 切向平滑：用 ±win 米窗口内的弦方向代替逐段方向，避免拐角处法线翻转
    const win = tangentWin || step * 3;
    for (let i = 0; i < out.length; i++) {
      const s0 = out[i].s - win;
      const s1 = out[i].s + win;
      let pa = out[0];
      let pb = out[out.length - 1];
      for (let k = 0; k < out.length; k++) {
        if (out[k].s <= s0) pa = out[k];
        if (out[k].s >= s1) { pb = out[k]; break; }
      }
      const vx = pb.x - pa.x;
      const vy = pb.y - pa.y;
      const vl = Math.hypot(vx, vy);
      if (vl > 1e-6) { out[i].ux = vx / vl; out[i].uy = vy / vl; }
    }
    return out;
  }

  // 折线做两轮切角平滑，使波浪线过拐角时不会出现尖点
  function chaikin(pts, rounds) {
    let cur = pts.map((p) => ({ x: p.x, y: p.y }));
    for (let r = 0; r < (rounds || 2); r++) {
      if (cur.length < 3) break;
      const next = [cur[0]];
      for (let i = 0; i < cur.length - 1; i++) {
        const a = cur[i];
        const b = cur[i + 1];
        next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
        next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      }
      next.push(cur[cur.length - 1]);
      cur = next;
    }
    return cur;
  }

  // 真实正弦波浪线（弧长参数化 + 两端渐入渐出）
  function wavyD(samples, amp, lambda) {
    if (!samples.length) return '';
    const total = samples[samples.length - 1].s || 0;
    const easeLen = Math.min(total / 3, lambda * 0.5);
    const twoPi = Math.PI * 2;
    let d = '';
    for (let i = 0; i < samples.length; i++) {
      const sm = samples[i];
      const nx = -sm.uy;
      const ny = sm.ux;
      let k = 1;
      if (easeLen > 0) {
        // 用余弦渐变（两端导数为 0）：不仅振幅归零，切线也回到直线方向，
        // 否则箭头会与波浪端头错开一个角度
        const ratio = Math.max(0, Math.min(1, Math.min(sm.s, total - sm.s) / easeLen));
        k = 0.5 - 0.5 * Math.cos(Math.PI * ratio);
      }
      const off = amp * k * Math.sin(((sm.s - easeLen) / lambda) * twoPi);
      const x = sm.x + nx * off;
      const y = sm.y + ny * off;
      d += (i === 0 ? 'M' : 'L') + f(x) + ' ' + f(y);
    }
    return d;
  }

  function arrowHead(x, y, ux, uy, size, color) {
    const len = size;
    const half = size * 0.36;
    const px = -uy;
    const py = ux;
    const bx = x - ux * len;
    const by = y - uy * len;
    const d = 'M' + f(x) + ' ' + f(y) +
      'L' + f(bx + px * half) + ' ' + f(by + py * half) +
      'L' + f(bx - px * half) + ' ' + f(by - py * half) + 'Z';
    return '<path d="' + d + '" fill="' + color + '"/>';
  }

  function dirOf(pts) {
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2] || last;
    const dx = last.x - prev.x;
    const dy = last.y - prev.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }

  // 沿折线从末端往回走 back 米，返回该点与终点的单位方向（弦方向）
  function chordDir(pts, tip, back) {
    let remain = Math.max(0.2, num(back, 0.5));
    let i = pts.length - 1;
    while (i > 0) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len >= remain) {
        const t = 1 - remain / (len || 1);
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const l = Math.hypot(tip.x - p.x, tip.y - p.y) || 1;
        return { x: (tip.x - p.x) / l, y: (tip.y - p.y) / l };
      }
      remain -= len;
      i--;
    }
    return dirOf([pts[0], tip]);
  }

  function dashScaled(dash, ms) {
    if (!dash) return '';
    const v = String(dash).split(/\s+/).map((n) => f(num(n) * ms)).join(' ');
    return ' stroke-dasharray="' + v + '"';
  }

  function lineSVG(line, ms) {
    const s = num(ms, 1);
    const pts = ptsOf(line && line.pts);
    if (pts.length < 2) return '';
    const type = (line && line.type) || 'pass';
    const st = LINE_STYLE[type] || LINE_STYLE.pass;
    const arrow = st.arrow * s;
    const tip = pts[pts.length - 1];
    // 箭头长度即头部长，波浪线按箭头全长回缩，否则箭头会盖在波浪上、看起来歪斜
    const body = trimEnd(pts, type === 'dribble' ? arrow : arrow * 0.8);
    if (body.length < 2) return '';
    // 箭头方向用「线身末端附近的一段弦」→ 终点的方向：
    // 对波浪线而言，这个方向才是孩子实际的行进方向（局部切线会被正弦波干扰）
    const dir = chordDir(body, tip, Math.min(1.4, arrow * 1.1));

    let d;
    if (type === 'dribble') {
      d = wavyD(resample(chaikin(body, 2), 0.12, 1.1), st.amp * s, st.lambda * s);
    } else {
      d = polyD(body);
    }

    const dash = dashScaled(st.dash, s);
    return '<path d="' + d + '" fill="none" stroke="' + st.color +
      '" stroke-width="' + f(st.width * s) + '" stroke-linecap="round" stroke-linejoin="round"' + dash + '/>' +
      arrowHead(tip.x, tip.y, dir.x, dir.y, arrow, st.color);
  }

  // 球门通常画在场外（浅色留白区），纯白填充会看不清，故用深绿描边 + 白色门面
  const GOAL_INK = '#2b6b46';

  function goalSVG(g, ms) {
    const s = num(ms, 1);
    const size = g && g.size === '5m' ? '5m' : 'mini';
    const width = size === '5m' ? 5 : 1.9;      // 沿边宽度（米）
    const depth = size === '5m' ? 1.6 : 1.05;   // 门深（米）
    const side = (g && g.side) || 'top';
    const x = num(g && g.x);
    const y = num(g && g.y);
    let rx = 0, ry = 0, rw = 0, rh = 0;

    if (side === 'top') { rx = x - width / 2; ry = y - depth; rw = width; rh = depth; }
    else if (side === 'bottom') { rx = x - width / 2; ry = y; rw = width; rh = depth; }
    else if (side === 'left') { rx = x - depth; ry = y - width / 2; rw = depth; rh = width; }
    else { rx = x; ry = y - width / 2; rw = depth; rh = width; }

    let out = '<rect x="' + f(rx) + '" y="' + f(ry) + '" width="' + f(rw) + '" height="' + f(rh) +
      '" fill="#ffffff" fill-opacity="' + (size === '5m' ? '0.52' : '0.78') +
      '" stroke="' + GOAL_INK + '" stroke-width="' + f(0.16 * s) + '"/>';

    if (size === '5m') {
      const n = 4;
      for (let i = 1; i < n; i++) {
        if (side === 'top' || side === 'bottom') {
          const gx = rx + (rw / n) * i;
          out += '<line x1="' + f(gx) + '" y1="' + f(ry) + '" x2="' + f(gx) + '" y2="' + f(ry + rh) +
            '" stroke="' + GOAL_INK + '" stroke-width="' + f(0.07 * s) + '" stroke-opacity="0.55"/>';
        } else {
          const gy = ry + (rh / n) * i;
          out += '<line x1="' + f(rx) + '" y1="' + f(gy) + '" x2="' + f(rx + rw) + '" y2="' + f(gy) +
            '" stroke="' + GOAL_INK + '" stroke-width="' + f(0.07 * s) + '" stroke-opacity="0.55"/>';
        }
      }
    }
    return out;
  }

  function coneSVG(x, y, ms) {
    const s = num(ms, 1);
    const h = 1.15 * s;
    const w = 0.95 * s;
    return '<path d="M' + f(x) + ' ' + f(y - h) +
      'L' + f(x - w / 2) + ' ' + f(y + h * 0.42) +
      'L' + f(x + w / 2) + ' ' + f(y + h * 0.42) + 'Z" fill="#f2b705" stroke="#b98d05" stroke-width="' + f(0.09 * s) + '"/>';
  }

  function discSVG(x, y, ms) {
    const s = num(ms, 1);
    return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(0.45 * s) + '" fill="#e8801c" stroke="#b35f0d" stroke-width="' + f(0.09 * s) + '"/>';
  }

  function ballSVG(x, y, ms) {
    const s = num(ms, 1);
    const r = 0.5 * s;
    return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r) + '" fill="#ffffff" stroke="#1b1f1c" stroke-width="' + f(0.15 * s) + '"/>' +
      '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(0.17 * s) + '" fill="#1b1f1c"/>';
  }

  function playerSVG(p, ms) {
    const s = num(ms, 1);
    const team = TEAM[p && p.team] ? p.team : 'N';
    const st = TEAM[team];
    const x = num(p && p.x);
    const y = num(p && p.y);
    const n = (p && p.n != null) ? String(p.n) : '';

    if (p && p.gk) {
      // 门将：黑描边方框 + 号码 + GK 小字
      const bw = 2.1 * s;
      const bh = 2.3 * s;
      return '<g>' +
        '<rect x="' + f(x - bw / 2) + '" y="' + f(y - bh / 2) + '" width="' + f(bw) + '" height="' + f(bh) +
        '" rx="' + f(0.5 * s) + '" ry="' + f(0.5 * s) + '" fill="' + st.fill +
        '" stroke="#10140f" stroke-width="' + f(0.26 * s) + '"/>' +
        '<text x="' + f(x) + '" y="' + f(y + 0.02 * s) + '" text-anchor="middle" font-size="' + f(1.0 * s) + '" font-weight="700" fill="' + st.color + '">' + esc(n || '1') + '</text>' +
        '<text x="' + f(x) + '" y="' + f(y + 0.82 * s) + '" text-anchor="middle" font-size="' + f(0.78 * s) + '" font-weight="700" fill="' + st.color + '" fill-opacity="0.92">GK</text>' +
        '</g>';
    }

    return '<g>' +
      '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(1.05 * s) + '" fill="' + st.fill + '" stroke="#ffffff" stroke-width="' + f(0.16 * s) + '"/>' +
      '<text x="' + f(x) + '" y="' + f(y + 0.4 * s) + '" text-anchor="middle" font-size="' + f(1.18 * s) + '" font-weight="700" fill="' + st.color + '">' + esc(n) + '</text>' +
      '</g>';
  }

  function renderDiagram(d) {
    const g = obj(d);
    const W = Math.max(4, num(g.w, 20));
    const H = Math.max(4, num(g.h, 15));
    const ms = markerScale(W);

    // 场外留白：底 3.4 米；content 里写在场地外的球员/教练/球门/小门
    // 再按实际坐标向外扩展，保证不会被 viewBox 裁掉。
    let vx = -DIAG_MARGIN, vy = -DIAG_MARGIN;
    let vx2 = W + DIAG_MARGIN, vy2 = H + DIAG_MARGIN;
    const pad = 1.4 * ms;
    const grow = (x, y) => {
      if (!isFinite(x) || !isFinite(y)) return;
      vx = Math.min(vx, x - pad);
      vy = Math.min(vy, y - pad);
      vx2 = Math.max(vx2, x + pad);
      vy2 = Math.max(vy2, y + pad);
    };
    arr(g.players).forEach((p) => grow(num(p && p.x), num(p && p.y)));
    arr(g.balls).forEach((p) => Array.isArray(p) && grow(num(p[0]), num(p[1])));
    arr(g.cones).forEach((p) => Array.isArray(p) && grow(num(p[0]), num(p[1])));
    arr(g.discs).forEach((p) => Array.isArray(p) && grow(num(p[0]), num(p[1])));
    arr(g.gates).forEach((gt) => {
      const gw = num(gt && gt.w, 3);
      grow(num(gt && gt.x) - gw / 2, num(gt && gt.y));
      grow(num(gt && gt.x) + gw / 2, num(gt && gt.y));
    });
    arr(g.lines).forEach((ln) => ptsOf(ln && ln.pts).forEach((p) => grow(p.x, p.y)));

    const uid = 'dg' + (++svgUid);
    const vw = vx2 - vx, vh = vy2 - vy;
    const parts = [];

    parts.push('<svg viewBox="' + f(vx) + ' ' + f(vy) + ' ' + f(vw) + ' ' + f(vh) +
      '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="场区示意图" preserveAspectRatio="xMidYMid meet">');

    parts.push('<defs><linearGradient id="' + uid + 'grass" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#2f8b53"/><stop offset="1" stop-color="#236a41"/></linearGradient></defs>');

    parts.push('<rect x="' + f(vx) + '" y="' + f(vy) + '" width="' + f(vw) + '" height="' + f(vh) + '" fill="#eef1ec"/>');

    // 草坪 + 割草条纹
    parts.push('<rect x="0" y="0" width="' + f(W) + '" height="' + f(H) + '" fill="url(#' + uid + 'grass)"/>');
    const stripes = 6;
    for (let i = 0; i < stripes; i += 2) {
      parts.push('<rect x="' + f((W / stripes) * i) + '" y="0" width="' + f(W / stripes) + '" height="' + f(H) +
        '" fill="#ffffff" fill-opacity="0.045"/>');
    }

    // 分区
    arr(g.zones).forEach((z) => {
      const zx = num(z && z.x), zy = num(z && z.y), zw = num(z && z.w), zh = num(z && z.h);
      parts.push('<rect x="' + f(zx) + '" y="' + f(zy) + '" width="' + f(zw) + '" height="' + f(zh) +
        '" fill="#ffffff" fill-opacity="0.1" stroke="#ffffff" stroke-opacity="0.55" stroke-width="' + f(0.1 * ms) + '" stroke-dasharray="' + f(0.75 * ms) + ' ' + f(0.55 * ms) + '"/>');
      if (z && z.label) {
        // 分区标签贴该区右上角（右对齐，保证不超出分区），避开中线上的球员/线路
        const fs = 1.15 * ms;
        const lx = zx + zw - 0.55 * ms;
        const ly = zy + fs + 0.35 * ms;
        parts.push('<text x="' + f(lx) + '" y="' + f(ly) + '" text-anchor="end" font-size="' + f(fs) +
          '" font-weight="700" fill="#ffffff" fill-opacity="0.85">' + esc(z.label) + '</text>');
      }
    });

    // 边线
    parts.push('<rect x="0" y="0" width="' + f(W) + '" height="' + f(H) + '" fill="none" stroke="#ffffff" stroke-width="' + f(0.18 * ms) + '" stroke-opacity="0.9"/>');

    // 球门
    arr(g.goals).forEach((gl) => { parts.push(goalSVG(gl, ms)); });

    // 小门（两个锥桶）
    arr(g.gates).forEach((gt) => {
      const cx = num(gt && gt.x), cy = num(gt && gt.y), gw = num(gt && gt.w, 3);
      parts.push(coneSVG(cx - gw / 2, cy, ms));
      parts.push(coneSVG(cx + gw / 2, cy, ms));
    });

    // 标志盘
    arr(g.discs).forEach((p) => {
      if (Array.isArray(p) && p.length >= 2) parts.push(discSVG(num(p[0]), num(p[1]), ms));
    });

    // 锥桶
    arr(g.cones).forEach((p) => {
      if (Array.isArray(p) && p.length >= 2) parts.push(coneSVG(num(p[0]), num(p[1]), ms));
    });

    // 线路（在球员下方）
    arr(g.lines).forEach((ln) => { parts.push(lineSVG(ln, ms)); });

    // 球员
    arr(g.players).forEach((p) => { parts.push(playerSVG(obj(p), ms)); });

    // 球（画在球员之后，避免被球员圆点遮住）
    arr(g.balls).forEach((p) => {
      if (Array.isArray(p) && p.length >= 2) parts.push(ballSVG(num(p[0]), num(p[1]), ms));
    });

    parts.push('</svg>');
    return parts.join('');
  }

  function legendSVG(kind) {
    const wrap = (inner) => '<svg viewBox="0 0 20 12" aria-hidden="true">' + inner + '</svg>';
    const ink = '#4b5850';
    switch (kind) {
      case 'A': return wrap('<circle cx="10" cy="6" r="4.1" fill="#1f5fbf" stroke="#fff" stroke-width="0.8"/>');
      case 'D': return wrap('<circle cx="10" cy="6" r="4.1" fill="#d23a2a" stroke="#fff" stroke-width="0.8"/>');
      case 'N': return wrap('<circle cx="10" cy="6" r="4.1" fill="#f2b705" stroke="#fff" stroke-width="0.8"/>');
      case 'GK': return wrap('<rect x="6.6" y="2.6" width="6.8" height="6.8" rx="1.4" fill="#5b6b60" stroke="#10140f" stroke-width="1"/>' +
        '<text x="10" y="8.3" text-anchor="middle" font-size="3.8" font-weight="700" fill="#fff">GK</text>');
      case 'ball': return wrap('<circle cx="10" cy="6" r="3.6" fill="#fff" stroke="#1b1f1c" stroke-width="1"/><circle cx="10" cy="6" r="1.2" fill="#1b1f1c"/>');
      case 'cone': return wrap('<path d="M10 2.4L6.4 9.4H13.6Z" fill="#f2b705" stroke="#b98d05" stroke-width="0.7"/>');
      case 'disc': return wrap('<circle cx="10" cy="6" r="3.4" fill="#e8801c" stroke="#b35f0d" stroke-width="0.7"/>');
      case 'pass': return wrap('<path d="M1.5 6H14" stroke="' + ink + '" stroke-width="1.7"/><path d="M13.2 2.6L18.4 6L13.2 9.4Z" fill="' + ink + '"/>');
      case 'run': return wrap('<path d="M1.5 6H13" stroke="' + ink + '" stroke-width="1.5" stroke-dasharray="3 2"/><path d="M12.4 2.8L18.2 6L12.4 9.2Z" fill="' + ink + '"/>');
      case 'dribble': return wrap('<path d="M1.5 6q1.6-3.4 3.2 0t3.2 0t3.2 0" fill="none" stroke="' + ink + '" stroke-width="1.5" stroke-linecap="round"/><path d="M11.4 2.9L17.4 6L11.4 9.1Z" fill="' + ink + '"/>');
      case 'shot': return wrap('<path d="M1.5 6H12.5" stroke="' + ink + '" stroke-width="3.2"/><path d="M11.6 1.9L18.4 6L11.6 10.1Z" fill="' + ink + '"/>');
      default: return wrap('');
    }
  }

  const LEGEND_ITEMS = [
    ['A', '进攻'], ['D', '防守'], ['N', '教练'], ['GK', '门将'], ['ball', '球'],
    ['cone', '锥桶'], ['disc', '标志盘'], ['pass', '传球'], ['run', '跑动'],
    ['dribble', '带球'], ['shot', '射门']
  ];

  function legendHTML() {
    return '<div class="legend">' + LEGEND_ITEMS.map((it) =>
      '<span class="lg">' + legendSVG(it[0]) + esc(it[1]) + '</span>'
    ).join('') + '</div>';
  }

  /* =============================================================
   * 页面：#home
   * ============================================================= */
  function pageHome() {
    const steps = [
      ['填写', '年龄段、主题、人数、场地与孩子水平'],
      ['生成', 'AI 按顶屹训练大纲输出五段结构教案'],
      ['打分', '主教练评分，高分方案成为下次参考']
    ];
    return '' +
      '<section class="hero">' +
      '  <span class="kicker">AI 备课 · 顶屹致远</span>' +
      '  <h1>陕西顶屹致远足球俱乐部</h1>' +
      '  <p class="lead">输入主题与孩子情况，AI 按顶屹训练大纲生成教案，主教练打分持续优化。</p>' +
      '  <div class="rule"></div>' +
      '</section>' +
      '<div class="section-title">三步完成一堂课</div>' +
      '<div class="steps">' + steps.map((s, i) =>
        '<div class="step"><span class="num">' + (i + 1) + '</span><div><b>' + esc(s[0]) + '</b>' +
        '<span class="d">' + esc(s[1]) + '</span></div></div>'
      ).join('') + '</div>' +
      '<div class="home-note">' +
      '  <span>本次 Demo 覆盖「' + esc(optLabel((arr(obj(F.topics).options).filter((o) => o && o.enabled !== false)[0]) || '')) + '」主题，完整流程约 1 分钟。</span>' +
      '</div>' +
      '<div style="margin-top:16px">' +
      '  <button class="btn btn-primary btn-lg" type="button" data-action="go-input">开始备课</button>' +
      '</div>';
  }

  /* =============================================================
   * 页面：#input
   * ============================================================= */
  function chipsHTML(list, isOn, action, variant) {
    return '<div class="chips">' + arr(list).map((o) => {
      const v = optValue(o);
      return '<button type="button" class="chip ' + (isOn(v) ? 'on' : '') +
        (variant ? ' ' + variant : '') + '" data-action="' + action +
        '" data-value="' + esc(v) + '">' + esc(optLabel(o)) + '</button>';
    }).join('') + '</div>';
  }

  function topicsHTML() {
    const topics = obj(F.topics);
    const list = arr(topics.options);
    return '<div class="topic-list">' + list.map((o) => {
      const v = optValue(o);
      const label = optLabel(o);
      const enabled = !(o && o.enabled === false);
      if (!enabled) {
        return '<div class="topic disabled"><span class="radio"></span><span class="t-name">' + esc(label) +
          '</span><span class="tag">即将上线</span></div>';
      }
      return '<button type="button" class="topic ' + (state.topic === v ? 'on' : '') +
        '" data-action="topic" data-value="' + esc(v) + '"><span class="radio"></span>' +
        '<span class="t-name">' + esc(label) + '</span></button>';
    }).join('') + '</div>';
  }

  function levelHTML() {
    const L = obj(F.level);
    const dims = arr(L.dimensions);
    const scale = arr(L.scale).length ? arr(L.scale) : [1, 2, 3, 4, 5];
    const total = dims.reduce((a, d) => a + num(state.level[d.key], 0), 0);
    const maxTotal = maxLevelTotal();
    const band = bandFor(total);

    return '<div class="level-total">' +
      '<span class="score">合计 ' + total + '/' + maxTotal + '</span>' +
      '<span class="band">' + esc(band.label || '') + '</span>' +
      '</div>' +
      dims.map((d) => {
        const v = num(state.level[d.key], 0);
        return '<div class="level-row">' +
          '<div class="level-top"><span class="nm">' + esc(d.label) + '</span>' +
          '<span class="hint">' + esc(d.hint || '') + '</span>' +
          '<span class="v">' + v + '</span></div>' +
          '<div class="dots">' + scale.map((s) =>
            '<button type="button" class="dot ' + (num(s) === v ? 'on' : '') + '" data-action="level" data-key="' +
            esc(d.key) + '" data-value="' + num(s) + '">' + num(s) + '</button>'
          ).join('') + '</div>' +
          '</div>';
      }).join('');
  }

  function pageInput() {
    const ages = obj(F.ages);
    const fields = obj(F.field);
    const eq = obj(F.equipment);
    const pl = obj(F.players);
    const dur = obj(F.duration);
    const skills = obj(F.skills);
    const goal = obj(F.goal);
    const label = (o, fb) => (o && o.label) ? o.label : fb;

    return '' +
      '<div class="section-title">基本信息</div>' +
      '<div class="card">' +
      '  <div class="field">' +
      '    <div class="field-head"><span class="field-label">' + esc(label(ages, '年龄段')) + '</span>' +
      '      <span class="field-value">当前 <b>' + esc(state.age) + '</b></span></div>' +
      chipsHTML(ages.options, (v) => v === state.age, 'age') +
      '  </div>' +
      '  <div class="field">' +
      '    <div class="field-head"><span class="field-label">' + esc(label(F.topics, '训练主题')) + '</span></div>' +
      topicsHTML() +
      '  </div>' +
      '  <div class="field">' +
      '    <div class="field-head"><span class="field-label">' + esc(label(goal, '课程目标')) + '</span></div>' +
      '    <textarea id="goalInput" data-field="goal" placeholder="' + esc(goal.default || '') + '">' + esc(state.goal) + '</textarea>' +
      '  </div>' +
      '</div>' +

      '<div class="section-title">组织条件</div>' +
      '<div class="card">' +
      '  <div class="field">' +
      '    <div class="field-head"><span class="field-label">' + esc(label(pl, '人数')) + '</span>' +
      '      <span class="field-value">建议 ' + num(pl.min, 6) + '–' + num(pl.max, 30) + ' 人</span></div>' +
      '    <div class="stepper">' +
      '      <button type="button" data-action="players" data-value="-1" ' + (state.players <= num(pl.min, 6) ? 'disabled' : '') + ' aria-label="减少人数">−</button>' +
      '      <span class="val">' + state.players + '</span>' +
      '      <button type="button" data-action="players" data-value="1" ' + (state.players >= num(pl.max, 30) ? 'disabled' : '') + ' aria-label="增加人数">+</button>' +
      '      <span class="tiny">人</span>' +
      '    </div>' +
      '  </div>' +
      '  <div class="field">' +
      '    <div class="field-head"><span class="field-label">' + esc(label(dur, '课时长度')) + '</span>' +
      '      <span class="field-value">按五段结构自动合计</span></div>' +
      '    <div class="readonly-box"><b>' + lessonTotalMinutes() + '</b><span>' + esc(dur.unit || '分钟') +
      '　（' + arr(LS.segments).map((s) => minutesOf(s)).join(' + ') + '）</span></div>' +
      '  </div>' +
      '  <div class="field">' +
      '    <div class="field-head"><span class="field-label">' + esc(label(fields, '场地')) + '</span></div>' +
      chipsHTML(fields.options, (v) => v === state.field, 'field') +
      '  </div>' +
      '  <div class="field">' +
      '    <div class="field-head"><span class="field-label">' + esc(label(eq, '器材')) + '</span>' +
      '      <span class="field-value">可多选</span></div>' +
      chipsHTML(eq.options, (v) => state.equipment.indexOf(v) >= 0, 'equip') +
      '  </div>' +
      '</div>' +

      '<div class="section-title">孩子情况</div>' +
      '<div class="card">' +
      '  <div class="field-head" style="margin-bottom:10px">' +
      '    <span class="field-label">' + esc(label(obj(F.level), '孩子水平')) + '</span>' +
      '    <span class="field-value">1–5 分</span>' +
      '  </div>' +
      levelHTML() +
      '</div>' +

      '<div class="card">' +
      '  <div class="field">' +
      '    <div class="field-head"><span class="field-label">' + esc(skills.masteredLabel || '已掌握技能') + '</span>' +
      '      <span class="field-value">' + state.mastered.length + ' 项</span></div>' +
      chipsHTML(skills.options, (v) => state.mastered.indexOf(v) >= 0, 'mastered') +
      '    <p class="tiny" style="margin-top:6px">两边技能会自动互斥，点选即替换</p>' +
      '  </div>' +
      '  <div class="field">' +
      '    <div class="field-head"><span class="field-label">' + esc(skills.unmasteredLabel || '未掌握技能') + '</span>' +
      '      <span class="field-value">' + state.unmastered.length + ' 项</span></div>' +
      chipsHTML(skills.options, (v) => state.unmastered.indexOf(v) >= 0, 'unmastered', 'chip-alt') +
      '  </div>' +
      '</div>' +

      '<div class="bottom-bar"><div class="inner">' +
      '  <button class="btn btn-primary btn-lg" type="button" data-action="generate">生成教案</button>' +
      '</div></div>';
  }

  /* =============================================================
   * 页面：#loading
   * ============================================================= */
  let loadTimer = null;

  function pageLoading() {
    const steps = D.LOADING_STEPS.length ? D.LOADING_STEPS : ['生成中…'];
    return '<div class="loading-wrap">' +
      '<div class="pitch-spin"></div>' +
      '<div class="loading-title">AI 正在备课</div>' +
      '<p class="muted">按顶屹训练大纲匹配 ' + esc(state.age) + ' 阶段与' + state.players + ' 人条件</p>' +
      '<ul class="load-steps" id="loadSteps">' + steps.map((s) =>
        '<li><span class="ico"></span><span>' + esc(stepText(s)) + '</span></li>'
      ).join('') + '</ul>' +
      '</div>';
  }

  function startLoading() {
    clearTimeout(loadTimer);
    const items = document.querySelectorAll('#loadSteps li');
    const steps = items.length || 1;
    const stepMs = Math.max(300, Math.floor(2000 / steps));
    let i = 0;

    const tick = () => {
      if (i > 0 && items[i - 1]) {
        items[i - 1].classList.remove('active');
        items[i - 1].classList.add('done');
      }
      if (i < items.length) {
        items[i].classList.add('active');
        i++;
        loadTimer = setTimeout(tick, stepMs);
      } else {
        loadTimer = setTimeout(() => {
          location.replace('#plans');
        }, Math.max(100, Math.min(220, stepMs / 2)));
      }
    };
    loadTimer = setTimeout(tick, 120);
  }

  /* =============================================================
   * 页面：#plans
   * ============================================================= */
  function pagePlans() {
    const plans = D.PLANS;
    if (!plans.length) {
      return '<div class="card"><p class="muted">暂无候选方案。</p></div>' +
        '<button class="btn btn-ghost" type="button" data-action="go-input">返回修改</button>';
    }
    return '' +
      '<div class="section-title">候选方案</div>' +
      '<div class="plans-hint">为你生成 ' + plans.length + ' 套方案，选一套</div>' +
      plans.map((p) => {
        const detail = !!p.detail;
        return '<button type="button" class="plan-card ' + (detail ? 'pick' : 'locked') +
          '" data-action="' + (detail ? 'open-plan' : 'locked-plan') + '" data-id="' + esc(p.id) + '">' +
          '  <span class="pc-head">' +
          '    <span class="badge">' + esc(p.id) + '</span>' +
          '    <h2>' + esc(p.title) + '</h2>' +
          '    <span class="diff">' + esc(p.difficulty) + '</span>' +
          '  </span>' +
          '  <span class="idea">' + esc(p.idea) + '</span>' +
          '  <span class="tags">' + arr(p.tags).map((t) => '<span>' + esc(t) + '</span>').join('') + '</span>' +
          '  <span class="go">' + (detail ? '查看教案 ›' : '预览未开放') + '</span>' +
          '</button>';
      }).join('') +
      '<div class="bottom-bar"><div class="inner">' +
      '  <button class="btn btn-ghost" type="button" data-action="go-input">返回修改条件</button>' +
      '</div></div>';
  }

  /* =============================================================
   * 页面：#plan
   * ============================================================= */
  function timelineHTML() {
    const segs = arr(LS.segments);
    const total = segs.reduce((a, s) => a + minutesOf(s), 0) || 1;
    const dark = { game: '#3d3000' };
    return '<div class="timeline">' +
      '<div class="tl-bar">' + segs.map((s, i) => {
        const w = (minutesOf(s) / total) * 100;
        return '<button type="button" class="tl-seg" data-action="jump" data-idx="' + i +
          '" style="flex:0 0 ' + f(w) + '%;background:' + segColor(s.key) +
          (dark[s.key] ? ';color:' + dark[s.key] : '') + '" title="' +
          esc(tx(s.name, '—')) + '">' + minutesOf(s) + '′</button>';
      }).join('') + '</div>' +
      '<div class="tl-legend">' + segs.map((s) =>
        '<span><i style="background:' + segColor(s.key) + '"></i>' + esc(tx(s.name, '—')) + '</span>'
      ).join('') + '</div>' +
      '</div>';
  }

  function segmentHTML(s, i) {
    const tsp = obj(s.tsp);
    return '' +
      '<section class="card seg" id="seg-' + i + '" style="border-left:3px solid ' + segColor(s.key) + '">' +
      '  <div class="seg-head">' +
      '    <span class="seg-idx" style="background:' + segColor(s.key) + '">' + (i + 1) + '</span>' +
      '    <h2>' + esc(tx(s.name, '—')) + '</h2>' +
      '    <span class="seg-dur">' + minutesOf(s) + ' 分钟</span>' +
      '  </div>' +
      '  <div class="seg-meta">' +
      '    <span>场区 ' + esc(tx(s.area)) + '</span>' +
      '    <span>' + esc(tx(s.players)) + '</span>' +
      '    <span>' + esc(tx(s.equipment)) + '</span>' +
      '  </div>' +
      '  <div class="diagram">' + renderDiagram(s.diagram) + '</div>' +
      legendHTML() +
      '  <h3>组织方法</h3>' +
      '  <p class="body-text">' + esc(tx(s.organize, '')) + '</p>' +
      '  <h3>规则与进阶（由易到难）</h3>' +
      '  <ol class="olist">' + arr(s.progressions).map((p) => '<li>' + esc(p) + '</li>').join('') + '</ol>' +
      '  <h3>指导要点</h3>' +
      '  <ul class="ulist">' + arr(s.points).map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>' +
      '  <div class="tsp">' +
      '    <div><b>时间 TIME</b>' + esc(tx(tsp.time)) + '</div>' +
      '    <div><b>空间 SPACE</b>' + esc(tx(tsp.space)) + '</div>' +
      '    <div><b>压力 PRESSURE</b>' + esc(tx(tsp.pressure)) + '</div>' +
      '  </div>' +
      '</section>';
  }

  function pagePlan() {
    const segs = arr(LS.segments);
    return '' +
      '<div class="card lesson-head">' +
      '  <div class="eyebrow">教案详情 · 顶屹训练大纲</div>' +
      '  <h1>' + esc(LS.title || '教案') + '</h1>' +
      '  <div class="meta-grid">' +
      '    <div class="meta"><div class="k">年龄</div><div class="v">' + esc(LS.age || state.age) + '</div></div>' +
      '    <div class="meta"><div class="k">人数</div><div class="v">' + esc(LS.players != null ? LS.players : state.players) + ' 人</div></div>' +
      '    <div class="meta"><div class="k">总时长</div><div class="v">' + (LS.duration != null ? LS.duration : lessonTotalMinutes()) + ' 分钟</div></div>' +
      '    <div class="meta"><div class="k">场地</div><div class="v">' + esc(LS.field || '—') + '</div></div>' +
      '    <div class="meta wide"><div class="k">器材</div><div class="v">' + (arr(LS.equipment).length ? arr(LS.equipment).map(esc).join(' · ') : '—') + '</div></div>' +
      '  </div>' +
      '  <div class="goal-box"><div class="k">课程目标</div><div class="v">' + esc(LS.goal || '') + '</div></div>' +
      '  <div class="focus-list">' + arr(LS.focus).map((t) => '<span>' + esc(t) + '</span>').join('') + '</div>' +
      '</div>' +
      (segs.length ? timelineHTML() : '') +
      segs.map((s, i) => segmentHTML(s, i)).join('') +
      '<div class="card check-card">' +
      '  <h2>课后检验</h2>' +
      '  <ul class="ulist">' + arr(LS.check).map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul>' +
      '</div>' +
      '<div class="bottom-bar"><div class="inner">' +
      '  <button class="btn btn-accent btn-lg" type="button" data-action="to-score">给这份教案打分</button>' +
      '</div></div>';
  }

  /* =============================================================
   * 页面：#score
   * ============================================================= */
  function scoreTotal() {
    return D.SCORE_ITEMS.reduce((a, it) => a + num(state.scores[it.key], 0), 0);
  }

  function scorePercent() {
    const max = D.SCORE_ITEMS.length * 5;
    if (!max) return 0;
    return Math.round((scoreTotal() / max) * 100);
  }

  function initScores() {
    D.SCORE_ITEMS.forEach((it) => {
      if (state.scores[it.key] == null) state.scores[it.key] = num(it.default, 3);
    });
  }

  function pageScore() {
    initScores();
    return '' +
      '<div class="score-top">' +
      '  <div><div class="big">' + scorePercent() + '<small> 分</small></div>' +
      '  <div class="lbl">实时总分 · 百分制</div></div>' +
      '  <div class="hint">共 ' + D.SCORE_ITEMS.length + ' 项<br>' + scoreTotal() + ' / ' + (D.SCORE_ITEMS.length * 5) + ' 星</div>' +
      '</div>' +
      '<div class="card">' +
      '  <p class="tiny" style="margin-bottom:6px">为《' + esc(LS.title || '本课教案') + '》打分</p>' +
      D.SCORE_ITEMS.map((it) => {
        const v = num(state.scores[it.key], 0);
        return '<div class="score-item">' +
          '<div class="si-head"><span class="nm">' + esc(it.label) + '</span><span class="v">' + v + '/5</span></div>' +
          '<div class="si-desc">' + esc(it.desc || '') + '</div>' +
          '<div class="stars">' + [1, 2, 3, 4, 5].map((n) =>
            '<button type="button" class="star ' + (n <= v ? 'on' : '') + '" data-action="star" data-key="' +
            esc(it.key) + '" data-value="' + n + '" aria-label="' + esc(it.label) + ' ' + n + ' 星">★</button>'
          ).join('') + '</div>' +
          '</div>';
      }).join('') +
      '</div>' +
      '<div class="card">' +
      '  <div class="field-head"><span class="field-label">主教练点评</span><span class="field-value">可选</span></div>' +
      '  <textarea id="commentInput" data-field="comment" maxlength="400" placeholder="可以写：哪个环节最有效、下次要调整什么">' + esc(state.comment) + '</textarea>' +
      '</div>' +
      '<div class="bottom-bar"><div class="inner">' +
      '  <button class="btn btn-primary btn-lg" type="button" data-action="submit-score">提交评分</button>' +
      '</div></div>';
  }

  /* =============================================================
   * 页面：#done
   * ============================================================= */
  function fmtDate(ts) {
    const d = new Date(num(ts, 0));
    if (isNaN(d.getTime())) return '';
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function pageDone() {
    const rec = state.last || loadRecords()[0] || null;
    const histories = loadRecords();

    let head;
    if (rec) {
      head = '<div class="card done-card">' +
        '<div class="done-badge">✓</div>' +
        '<div class="done-score">' + num(rec.percent, 0) + '<small> / 100</small></div>' +
        '<p class="tiny">' + esc(rec.lesson || '') + '</p>' +
        (rec.comment ? '<div class="done-comment">' + esc(rec.comment) + '</div>' : '') +
        '<p class="done-note">评分已记录，AI 会把高分方案作为后续生成的参考方向。</p>' +
        '</div>';
    } else {
      head = '<div class="card done-card">' +
        '<div class="done-badge">✓</div>' +
        '<p class="muted">还没有提交过评分。</p>' +
        '</div>';
    }

    const hist = histories.length
      ? histories.slice(0, 8).map((r) =>
        '<div class="hist-item">' +
        '<span class="hs">' + num(r.percent, 0) + '</span>' +
        '<span class="hc"><span class="t">' + esc(r.lesson || '教案') + '</span>' +
        '<span class="d">' + esc(fmtDate(r.ts)) + (r.comment ? ' · ' + esc(r.comment) : '') + '</span></span>' +
        '</div>'
      ).join('')
      : '<div class="empty">暂无历史记录</div>';

    return head +
      '<button class="btn btn-primary btn-lg" type="button" data-action="restart" style="margin-bottom:14px">再备一节课</button>' +
      '<div class="section-title">历史评分</div>' +
      '<div class="card">' + hist + '</div>' +
      '<div style="height:6px"></div>';
  }

  /* =============================================================
   * 渲染 & 事件
   * ============================================================= */
  const PAGES = {
    home: { fn: pageHome, bar: false },
    input: { fn: pageInput, bar: true },
    loading: { fn: pageLoading, bar: false },
    plans: { fn: pagePlans, bar: true },
    plan: { fn: pagePlan, bar: true },
    score: { fn: pageScore, bar: true },
    done: { fn: pageDone, bar: false }
  };

  let currentRouteName = null;

  function render() {
    if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
    const route = currentRoute();
    const page = PAGES[route] || PAGES.home;
    const y = window.scrollY;

    app.className = 'page' + (page.bar ? ' has-bar' : '') + (route !== currentRouteName ? ' enter' : '');
    app.innerHTML = page.fn();

    backBtn.hidden = !PARENT[route];

    if (route !== currentRouteName) {
      window.scrollTo(0, 0);
      currentRouteName = route;
    } else {
      window.scrollTo(0, y);
    }

    if (route === 'loading') startLoading();
    if (route === 'plan' && !state.planId) state.planId = firstDetailPlanId();
    if (route === 'score') window.scrollTo(0, 0);
    autosizeTextareas();
  }

  function firstDetailPlanId() {
    const p = D.PLANS.filter((x) => x && x.detail)[0] || D.PLANS[0];
    return p ? p.id : null;
  }

  function toggleIn(list, value) {
    const i = list.indexOf(value);
    if (i >= 0) list.splice(i, 1);
    else list.push(value);
    return list;
  }

  function onSubmitScore() {
    initScores();
    const items = D.SCORE_ITEMS.map((it) => ({ key: it.key, label: it.label, value: num(state.scores[it.key], 0) }));
    const rec = {
      ts: Date.now(),
      percent: scorePercent(),
      total: scoreTotal(),
      max: D.SCORE_ITEMS.length * 5,
      comment: (state.comment || '').trim(),
      lesson: LS.title || '',
      age: state.age,
      players: state.players,
      planId: state.planId || firstDetailPlanId(),
      items: items
    };
    state.last = rec;
    const ok = saveRecord(rec);
    if (!ok) toast('本地存储不可用，记录未保存');
    go('done');
  }

  function onClick(ev) {
    const el = ev.target.closest('[data-action]');
    if (!el) return;
    const action = el.getAttribute('data-action');
    const value = el.getAttribute('data-value');
    const key = el.getAttribute('data-key');

    switch (action) {
      case 'go-input':
        go('input');
        break;
      case 'generate':
        go('loading');
        break;
      case 'age':
        state.age = value;
        render();
        break;
      case 'topic':
        state.topic = value;
        render();
        break;
      case 'field':
        state.field = value;
        render();
        break;
      case 'equip':
        toggleIn(state.equipment, value);
        render();
        break;
      case 'mastered':
        if (state.unmastered.indexOf(value) >= 0) toggleIn(state.unmastered, value);
        toggleIn(state.mastered, value);
        render();
        break;
      case 'unmastered':
        if (state.mastered.indexOf(value) >= 0) toggleIn(state.mastered, value);
        toggleIn(state.unmastered, value);
        render();
        break;
      case 'level':
        state.level[key] = num(value, 1);
        render();
        break;
      case 'players': {
        const pl = obj(F.players);
        const next = state.players + num(value, 0);
        state.players = Math.min(num(pl.max, 30), Math.max(num(pl.min, 6), next));
        render();
        break;
      }
      case 'open-plan':
        state.planId = el.getAttribute('data-id');
        go('plan');
        break;
      case 'locked-plan':
        toast('Demo 仅展开方案 ' + (firstDetailPlanId() || ''));
        break;
      case 'jump': {
        const idx = num(el.getAttribute('data-idx'), 0);
        const target = document.getElementById('seg-' + idx);
        if (target) {
          const tl = document.querySelector('.timeline');
          const offset = 52 + (tl ? tl.offsetHeight : 0) + 8;
          const top = target.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        }
        break;
      }
      case 'to-score':
        state.scores = {};
        initScores();
        go('score');
        break;
      case 'star':
        state.scores[key] = num(value, 1);
        render();
        break;
      case 'submit-score':
        onSubmitScore();
        break;
      case 'restart':
        state = startState();
        state.last = null;
        go('input');
        break;
      default:
        break;
    }
  }

  function onInput(ev) {
    const t = ev.target;
    if (!t || !t.getAttribute) return;
    const field = t.getAttribute('data-field');
    if (!field) return;
    if (field === 'goal') state.goal = t.value;
    if (field === 'comment') state.comment = t.value;
    autosizeTextareas();
  }

  // 让 textarea 随内容增高，避免预填的长文案被截断（手机上不出现内部滚动）
  function autosizeTextareas() {
    const list = app.querySelectorAll('textarea');
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const border = Math.max(0, t.offsetHeight - t.clientHeight); // border-box 下要补上边框
      t.style.height = 'auto';
      const need = Math.max(t.scrollHeight, 86) + border;
      const max = Math.round(window.innerHeight * 0.6);
      t.style.height = Math.min(need, max) + 'px';
      t.style.overflowY = need > max ? 'auto' : 'hidden';
    }
  }

  function boot() {
    // 供调试 / 后续复用的公开接口
    window.renderDiagram = renderDiagram;

    app.addEventListener('click', onClick);
    app.addEventListener('input', onInput);

    backBtn.addEventListener('click', () => {
      const route = currentRoute();
      const parent = PARENT[route];
      if (parent) go(parent);
      else go('home');
    });

    window.addEventListener('hashchange', render);
    window.addEventListener('resize', autosizeTextareas);
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
