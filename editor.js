/* =============================================================
 * 顶屹备课助手 · 编辑版（v2）
 * content.js 的 LESSON 为只读 AI 原稿；本文件维护工作副本：
 *   - 文字编辑（页面式，不弹窗）
 *   - 全屏场地图编辑器（拖动 / 添加 / 删除 / 撤销 / 改尺寸）
 *   - 文字与数字联动、一致性检查
 *   - localStorage['dy_beike_lesson_edit_v1'] 保存与恢复原稿
 * 依赖 app.js 暴露的 window.DYApp（render / toast / renderDiagram / legendHTML）
 * ============================================================= */
(function () {
  'use strict';

  const KEY = 'dy_beike_lesson_edit_v1';
  const CLUB_MINUTES = 120;
  const MIN_STEP = 5;

  /* ---------------- 小工具 ---------------- */
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const num = (v, d) => {
    const n = Number(v);
    return isFinite(n) ? n : (d == null ? 0 : d);
  };
  const arr = (v) => Array.isArray(v) ? v : [];
  const obj = (v) => (v && typeof v === 'object') ? v : {};
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const f = (n) => String(Math.round(n * 100) / 100);

  function pick(name) {
    try {
      return (new Function('try { return (typeof ' + name + ' !== "undefined") ? ' + name + ' : undefined; } catch (e) { return undefined; }'))();
    } catch (e) { return undefined; }
  }

  const SEG_COLORS = {
    warmup: '#67b57f',
    tech: '#1f6b3a',
    skill: '#e08a2e',
    game: '#f2b705',
    cool: '#8a9a90'
  };
  const segColor = (key) => SEG_COLORS[key] || '#1f6b3a';

  const RAW = obj(pick('LESSON'));
  let app = null;            // window.DYApp
  let editMode = false;      // 教案页文字编辑开关
  let checkOpen = false;     // 检查条展开

  /* ---------------- 规范化 / 迁移兜底 ---------------- */
  function normalizeSeg(s) {
    const seg = obj(s);
    const out = {
      key: String(seg.key || ''),
      name: String(seg.name || ''),
      minutes: Math.max(0, Math.round(num(seg.minutes, 0))),
      org: {},
      equipExtra: [],
      diagram: obj(seg.diagram),
      organize: String(seg.organize || ''),
      progressions: arr(seg.progressions).map((x) => String(x == null ? '' : x)),
      points: arr(seg.points).map((x) => String(x == null ? '' : x)),
      tsp: {
        time: String(obj(seg.tsp).time || ''),
        space: String(obj(seg.tsp).space || ''),
        pressure: String(obj(seg.tsp).pressure || '')
      }
    };
    const o = obj(seg.org);
    out.org.note = String(o.note || '');
    if (o.perGroup != null) out.org.perGroup = Math.max(0, Math.round(num(o.perGroup, 0)));
    if (o.groups != null) out.org.groups = Math.max(0, Math.round(num(o.groups, 0)));
    out.equipExtra = arr(seg.equipExtra).map((e) => {
      const it = obj(e);
      return { name: String(it.name || ''), n: Math.max(0, Math.round(num(it.n, 0))), unit: String(it.unit || '个') };
    });
    return out;
  }

  function normalizeLesson(L) {
    const src = obj(L);
    const out = {
      title: String(src.title || ''),
      age: String(src.age || ''),
      players: Math.max(1, Math.round(num(src.players, 12))),
      field: String(src.field || ''),
      goal: String(src.goal || ''),
      focus: arr(src.focus).map((x) => String(x == null ? '' : x)),
      segments: arr(src.segments).map(normalizeSeg),
      check: arr(src.check).map((x) => String(x == null ? '' : x))
    };
    return out;
  }

  const ORIG = normalizeLesson(clone(RAW));
  let cur = clone(ORIG);

  function loadStored() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const lesson = normalizeLesson(parsed && parsed.lesson ? parsed.lesson : parsed);
      if (!arr(lesson.segments).length) return null;
      if (arr(lesson.segments).length !== arr(ORIG.segments).length) return null;
      return lesson;
    } catch (e) {
      return null;
    }
  }

  const stored = loadStored();
  if (stored) cur = stored;

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify({ v: 1, ts: Date.now(), lesson: cur })); } catch (e) { /* 忽略 */ }
    }, 60);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, ts: Date.now(), lesson: cur })); return true; } catch (e) { return false; }
  }

  /* ---------------- 派生数据（唯一数据源） ---------------- */
  const totalMinutes = () => arr(cur.segments).reduce((a, s) => a + Math.max(0, num(s.minutes, 0)), 0);

  const EQUIP_CATS = [
    { key: 'cone', name: '标志筒', unit: '个' },
    { key: 'gate', name: '标志筒门', unit: '组' },
    { key: 'disc', name: '标志盘', unit: '个' },
    { key: 'goalmini', name: '小球门', unit: '个' },
    { key: 'goal5m', name: '5 米球门', unit: '个' }
  ];

  // 该段器材：图中可数器材自动统计 + equipExtra
  function segEquipList(seg) {
    const d = obj(seg.diagram);
    const cones = arr(d.cones).length;
    const gates = arr(d.gates).length;
    const discs = arr(d.discs).length;
    const goals = arr(d.goals).map(obj);
    const mini = goals.filter((g) => g.size !== '5m').length;
    const five = goals.filter((g) => g.size === '5m').length;
    const out = [];
    const push = (key, name, unit, n) => {
      if (n > 0) out.push({ key, name, unit, n: n, extra: false });
    };
    push('cone', '标志筒', '个', cones + gates * 2);
    push('gate', '标志筒门', '组', gates);
    push('disc', '标志盘', '个', discs);
    push('goalmini', '小球门', '个', mini);
    push('goal5m', '5 米球门', '个', five);

    arr(seg.equipExtra).forEach((e) => {
      const name = String(obj(e).name || '').trim();
      if (!name) return;
      const n = Math.max(0, Math.round(num(obj(e).n, 0)));
      const unit = String(obj(e).unit || '个');
      const hit = out.filter((x) => x.name === name)[0];
      if (hit) { hit.n += n; return; }
      const cat = EQUIP_CATS.filter((c) => c.name === name)[0];
      out.push({ key: cat ? cat.key : 'extra', name, unit: cat ? cat.unit : unit, n, extra: true });
    });
    return out;
  }

  function equipText(list) {
    const items = arr(list).filter((e) => e && String(e.name || '').trim());
    if (!items.length) return '—';
    return items.map((e) => (num(e.n, 0) > 0 ? esc(e.name) + ' ' + num(e.n, 0) + esc(e.unit || '个') : esc(e.name))).join(' · ');
  }

  const segEquipText = (seg) => equipText(segEquipList(seg));

  // LESSON 级器材：各段同名取最大值；球取 max(players, 各段球数)
  function lessonEquipList() {
    const byName = {};
    const order = [];
    let ballMax = 0;
    arr(cur.segments).forEach((seg) => {
      segEquipList(seg).forEach((e) => {
        const name = e.name;
        if (byName[name] == null) { byName[name] = { name: name, unit: e.unit, n: 0 }; order.push(name); }
        byName[name].n = Math.max(byName[name].n, num(e.n, 0));
        if (/球/.test(name) && !/球门/.test(name)) ballMax = Math.max(ballMax, num(e.n, 0));
      });
    });
    // 球按人数兜底（每人 1 球可复用）
    order.forEach((name) => {
      if (/球/.test(name) && !/球门/.test(name)) {
        byName[name].n = Math.max(byName[name].n, num(cur.players, 0));
      }
    });
    return order.map((n) => byName[n]);
  }

  const lessonEquipText = () => equipText(lessonEquipList());

  // 段落人数文字：lesson.players + org
  function orgText(seg, players) {
    const o = obj(seg.org);
    const note = String(o.note || '').trim();
    const per = num(o.perGroup, 0);
    const grp = num(o.groups, 0);
    let s;
    if (per > 0 && grp === 2) s = per + 'v' + per;
    else if (per > 0 && grp > 0) s = grp + ' 组 × ' + per + ' 人';
    else if (per > 0) s = '每组 ' + per + ' 人';
    else s = num(players, 0) + ' 人';
    if (note) s += (grp === 2 && per > 0 ? '（' + note + '）' : '，' + note);
    return s;
  }

  const segAreaText = (seg) => {
    const d = obj(seg.diagram);
    return f(num(d.w, 20)) + '×' + f(num(d.h, 15)) + 'm';
  };

  /* ---------------- 与原稿比较 ---------------- */
  const isEdited = () => JSON.stringify(cur) !== JSON.stringify(ORIG);
  function segEdited(i) {
    return JSON.stringify(arr(cur.segments)[i]) !== JSON.stringify(arr(ORIG.segments)[i]);
  }
  function tag(changed) {
    return changed ? '<span class="edited-tag">已修改</span>' : '';
  }

  /* ---------------- 纯文本字段收集 ---------------- */
  function textFieldsOf(seg) {
    const out = [{ label: '组织方法', v: String(seg.organize || '') }];
    arr(seg.progressions).forEach((p, i) => out.push({ label: '进阶 ' + (i + 1), v: String(p || '') }));
    arr(seg.points).forEach((p, i) => out.push({ label: '要点 ' + (i + 1), v: String(p || '') }));
    const t = obj(seg.tsp);
    out.push({ label: '时间', v: String(t.time || '') });
    out.push({ label: '空间', v: String(t.space || '') });
    out.push({ label: '压力', v: String(t.pressure || '') });
    return out;
  }

  const DIM_RE = /(\d+(?:\.\d+)?)\s*[×xX]\s*(\d+(?:\.\d+)?)/g;

  // 文字里的尺寸（去重后返回 [{a,b,label}]）
  function dimsInText(seg) {
    const seen = {};
    const out = [];
    textFieldsOf(seg).forEach((fd) => {
      let m;
      DIM_RE.lastIndex = 0;
      while ((m = DIM_RE.exec(fd.v))) {
        const a = num(m[1], 0);
        const b = num(m[2], 0);
        const k = a + 'x' + b;
        if (seen[k]) continue;
        seen[k] = 1;
        out.push({ a: a, b: b, label: fd.label, text: m[0] });
      }
    });
    return out;
  }

  /* ---------------- 一致性检查 ---------------- */
  function runChecks() {
    const issues = [];
    const warnings = [];
    arr(cur.segments).forEach((seg, i) => {
      const d = obj(seg.diagram);
      const W = num(d.w, 20), H = num(d.h, 15);

      // 1) 文字尺寸 vs 图尺寸
      dimsInText(seg).forEach((dm) => {
        const same = (dm.a === W && dm.b === H) || (dm.a === H && dm.b === W);
        if (!same) {
          issues.push({ seg: i, text: '文字写「' + dm.text + '」，图里是 ' + f(W) + '×' + f(H) + 'm' });
        }
      });

      // 2) 文字提到器材，但该段为 0
      const txt = textFieldsOf(seg).map((x) => x.v).join(' ');
      const gates = arr(d.gates).length;
      const goals = arr(d.goals).map(obj);
      const mini = goals.filter((g) => g.size !== '5m').length;
      const five = goals.filter((g) => g.size === '5m').length;
      const cones = arr(d.cones).length + gates * 2;
      const discs = arr(d.discs).length;
      const doorCount = gates + mini + five;
      const extra = arr(seg.equipExtra).map(obj);

      const need = (re, count, name) => {
        if (!re.test(txt)) return;
        if (count > 0) return;
        // 器材清单里同名的“实际备了”的数量也算（n>0 才算备了；n=0 只是占位，不能用来规避检查）
        const ex = extra.filter((e) => String(e.name || '').indexOf(name) >= 0 && num(e.n, 0) > 0);
        if (ex.length) return;
        issues.push({ seg: i, text: '文字提到「' + name + '」，该段器材数量为 0' });
      };
      need(/标志筒|锥桶/, cones, '标志筒');
      need(/标志盘/, discs, '标志盘');
      need(/标志筒门/, gates, '标志筒门');
      need(/小球门/, mini, '小球门');
      need(/5\s*米球门/, five, '5 米球门');
      need(/小门/, doorCount, '小门');

      // 3) 图中示意球员数 > 总人数
      const shown = arr(d.players).filter((p) => p && p.team !== 'N').length;
      if (shown > num(cur.players, 0)) {
        issues.push({ seg: i, text: '图中示意球员 ' + shown + ' 人，多于总人数 ' + num(cur.players, 0) + ' 人' });
      }
    });

    // 4) 总时长与俱乐部标准不同（提示级）
    if (totalMinutes() !== CLUB_MINUTES) {
      warnings.push({ text: '总时长 ' + totalMinutes() + ' 分钟，与俱乐部标准 ' + CLUB_MINUTES + ' 分钟不同' });
    }
    return { issues: issues, warnings: warnings };
  }

  /* =============================================================
   * 教案页（浏览 / 编辑两种样式）
   * ============================================================= */
  const FORM = obj(pick('FORM'));
  const PL_MIN = num(obj(FORM.players).min, 6);
  const PL_MAX = num(obj(FORM.players).max, 24);

  function timelineHTML() {
    const segs = arr(cur.segments);
    const total = totalMinutes() || 1;
    const dark = { game: '#3d3000' };
    return '<div class="timeline">' +
      '<div class="tl-bar">' + segs.map((s, i) => {
        const w = (Math.max(0, num(s.minutes, 0)) / total) * 100;
        return '<button type="button" class="tl-seg" data-action="jump" data-idx="' + i +
          '" style="flex:0 0 ' + f(w) + '%;background:' + segColor(s.key) +
          (dark[s.key] ? ';color:' + dark[s.key] : '') + '" title="' + esc(s.name) + '">' +
          num(s.minutes, 0) + '′</button>';
      }).join('') + '</div>' +
      '<div class="tl-legend">' + segs.map((s) =>
        '<span><i style="background:' + segColor(s.key) + '"></i>' + esc(s.name || '—') + '</span>'
      ).join('') + '</div>' +
      '</div>';
  }

  function checkHTML() {
    const r = runChecks();
    const n = r.issues.length;
    const pass = n === 0;
    const items = r.issues.map((it) =>
      '<button type="button" class="chk-item" data-action="chk-jump" data-idx="' + it.seg + '">' +
      '<b>第 ' + (num(it.seg, 0) + 1) + ' 段</b><span>' + esc(it.text) + '</span></button>'
    ).join('') + r.warnings.map((w) =>
      '<div class="chk-item warn"><b>提示</b><span>' + esc(w.text) + '</span></div>'
    ).join('');

    return '<div class="check-bar' + (checkOpen ? ' open' : '') + '">' +
      '<button type="button" class="chk-head ' + (pass ? 'ok' : 'bad') + '" data-action="check-toggle" aria-expanded="' + (checkOpen ? 'true' : 'false') + '">' +
      '<span class="chk-ico">' + (pass ? '✓' : '!') + '</span>' +
      '<span class="chk-title">' + (pass ? '文字与图一致' : '发现 ' + n + ' 处不一致') + '</span>' +
      '<span class="chk-more">' + (checkOpen ? '收起' : '查看') + '</span></button>' +
      (checkOpen ? '<div class="chk-body">' + (items || '<div class="chk-item ok2">全部检查通过</div>') + '</div>' : '') +
      '</div>';
  }

  function focusEditorHTML() {
    return '<div class="focus-list editing">' +
      arr(cur.focus).map((t, i) =>
        '<div class="row-edit stack"><span class="row-no">' + (i + 1) + '</span>' +
        '<textarea data-edit="focus" data-idx="' + i + '" rows="2" aria-label="本课重点 ' + (i + 1) + '">' + esc(t) + '</textarea>' +
        '<span class="row-btns">' +
        '<button type="button" data-action="focus-up" data-idx="' + i + '" aria-label="上移"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button type="button" data-action="focus-down" data-idx="' + i + '" aria-label="下移"' + (i >= cur.focus.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button type="button" class="danger" data-action="focus-del" data-idx="' + i + '" aria-label="删除">×</button>' +
        '</span></div>'
      ).join('') +
      '<button type="button" class="add-row" data-action="focus-add">＋ 添加一条重点</button>' +
      '</div>';
  }

  function metaHTML() {
    return '<div class="meta-grid">' +
      '<div class="meta"><div class="k">年龄</div><div class="v">' + esc(cur.age || '—') + '</div></div>' +
      (editMode
        ? '<div class="meta"><div class="k">人数</div><div class="v">' +
          stepperHTML('', 'hdrPlStepper', num(cur.players, 0), PL_MIN, PL_MAX, 1, 'lesson-players') + '<span class="unit-inline">人</span>' +
          '<span hidden id="hdrPlayers">' + num(cur.players, 0) + '</span></div></div>'
        : '<div class="meta"><div class="k">人数</div><div class="v"><span id="hdrPlayers">' + num(cur.players, 0) + '</span> 人</div></div>') +
      '<div class="meta"><div class="k">总时长</div><div class="v"><span id="hdrTotal">' + totalMinutes() + '</span> 分钟</div></div>' +
      '<div class="meta"><div class="k">场地</div><div class="v">' + esc(cur.field || '—') + '</div></div>' +
      '<div class="meta wide"><div class="k">器材（由图与器材清单自动统计）</div><div class="v" id="hdrEquip">' + lessonEquipText() + '</div></div>' +
      '</div>';
  }

  function stepperHTML(label, id, val, min, max, step, action, idx) {
    const d = (idx == null) ? '' : ' data-seg="' + idx + '"';
    return '<div class="e-stepper' + (label ? '' : ' bare') + '">' +
      (label ? '<span class="e-lbl">' + esc(label) + '</span>' : '') +
      '<div class="stepper sm">' +
      '<button type="button" data-action="' + action + '"' + d + ' data-value="-' + step + '"' + (val <= min ? ' disabled' : '') + ' aria-label="减少' + esc(label) + '">−</button>' +
      '<span class="val" id="' + id + '">' + val + '</span>' +
      '<button type="button" data-action="' + action + '"' + d + ' data-value="' + step + '"' + (val >= max ? ' disabled' : '') + ' aria-label="增加' + esc(label) + '">+</button>' +
      '</div></div>';
  }

  function listEditorHTML(kind, list, si) {
    const lbl = kind === 'prog' ? '进阶' : '要点';
    const act = kind === 'prog' ? 'prog' : 'point';
    const sg = ' data-seg="' + num(si, 0) + '"';
    return '<div class="list-edit">' + arr(list).map((t, i) =>
      '<div class="row-edit stack"><span class="row-no">' + (i + 1) + '</span>' +
      '<textarea data-edit="seg-' + act + '" data-li="' + i + '" data-seg="' + num(si, 0) + '" rows="2" aria-label="' + lbl + ' ' + (i + 1) + '">' + esc(t) + '</textarea>' +
      '<span class="row-btns">' +
      '<button type="button" data-action="li-up" data-list="' + act + '"' + sg + ' data-idx="' + i + '" aria-label="上移"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button type="button" data-action="li-down" data-list="' + act + '"' + sg + ' data-idx="' + i + '" aria-label="下移"' + (i >= list.length - 1 ? ' disabled' : '') + '>↓</button>' +
      '<button type="button" class="danger" data-action="li-del" data-list="' + act + '"' + sg + ' data-idx="' + i + '" aria-label="删除">×</button>' +
      '</span></div>'
    ).join('') +
    '<button type="button" class="add-row" data-action="li-add" data-list="' + act + '"' + sg + '>＋ 添加' + lbl + '</button></div>';
  }

  function equipEditorHTML(seg, si) {
    const sg = ' data-seg="' + num(si, 0) + '"';
    return '<div class="list-edit">' + arr(seg.equipExtra).map((e, i) =>
      '<div class="row-edit">' +
      '<input type="text" data-edit="seg-equip-name" data-li="' + i + '"' + sg + ' value="' + esc(e.name) + '" placeholder="器材名（如 4 号球）" aria-label="器材名">' +
      '<input class="n-input" type="number" min="0" step="1" data-edit="seg-equip-n" data-li="' + i + '"' + sg + ' value="' + num(e.n, 0) + '" aria-label="数量">' +
      '<span class="unit-txt">' + esc(e.unit || '个') + '</span>' +
      '<button type="button" class="danger sq" data-action="equip-del"' + sg + ' data-idx="' + i + '" aria-label="删除器材">×</button>' +
      '</div>'
    ).join('') +
    '<button type="button" class="add-row" data-action="equip-add"' + sg + '>＋ 添加器材（球、背心等图中画不出的）</button></div>';
  }

  function segEditHTML(s, i) {
    const t = obj(s.tsp);
    const total = totalMinutes();
    return '<div class="seg-edit">' +
      stepperHTML('段时长', 'segDur-' + i, num(s.minutes, 0), 0, 90, MIN_STEP, 'seg-min', i) +
      '<div class="e-note">全长合计 ' + total + ' 分钟 · 步长 ' + MIN_STEP + ' 分钟</div>' +
      '<h3>组织方法</h3>' +
      '<textarea id="org-' + i + '" data-edit="seg-organize" data-idx="' + i + '" rows="3">' + esc(s.organize) + '</textarea>' +
      '<h3>规则与进阶（由易到难）</h3>' + listEditorHTML('prog', s.progressions, i) +
      '<h3>指导要点</h3>' + listEditorHTML('point', s.points, i) +
      '<h3>时间 / 空间 / 压力</h3>' +
      '<div class="tsp-edit">' +
      '<label>时间<input type="text" data-edit="seg-tsp" data-idx="' + i + '" data-k="time" value="' + esc(t.time) + '"></label>' +
      '<label>空间<input type="text" data-edit="seg-tsp" data-idx="' + i + '" data-k="space" value="' + esc(t.space) + '"></label>' +
      '<label>压力<input type="text" data-edit="seg-tsp" data-idx="' + i + '" data-k="pressure" value="' + esc(t.pressure) + '"></label>' +
      '</div>' +
      '<h3>补充器材（图中画不出的：球、背心…）</h3>' + equipEditorHTML(s, i) +
      '<div class="e-note">图内器材自动统计：' + segEquipText(s) + '</div>' +
      '</div>';
  }

  function segmentHTML(s, i) {
    const A = app || window.DYApp || {};
    const t = obj(s.tsp);
    const d = obj(s.diagram);
    const shownPlayers = arr(d.players).filter((p) => p && p.team !== 'N').length;
    return '<section class="card seg" id="seg-' + i + '" style="border-left:3px solid ' + segColor(s.key) + '">' +
      '<div class="seg-head">' +
      '<span class="seg-idx" style="background:' + segColor(s.key) + '">' + (i + 1) + '</span>' +
      (editMode
        ? '<input class="seg-name-input" type="text" data-edit="seg-name" data-idx="' + i + '" value="' + esc(s.name) + '" aria-label="段名">'
        : '<h2>' + esc(s.name || '—') + '</h2>') +
      '<span id="segTag-' + i + '">' + tag(segEdited(i)) + '</span>' +
      '<span class="seg-dur" id="segDurView-' + i + '">' + num(s.minutes, 0) + ' 分钟</span>' +
      '</div>' +
      '<div class="seg-meta" id="segMeta-' + i + '">' +
      '<span>场区 ' + segAreaText(s) + '</span>' +
      '<span>' + esc(orgText(s, cur.players)) + '</span>' +
      '<span>器材 ' + segEquipText(s) + '</span>' +
      '</div>' +
      '<div class="diagram" data-action="open-editor" data-idx="' + i + '" role="button" tabindex="0" aria-label="第' + (i + 1) + '段：打开场地图编辑器">' +
      (A.renderDiagram ? A.renderDiagram(s.diagram) : '') +
      '<span class="diagram-hint">点图编辑</span>' +
      '</div>' +
      (A.legendHTML ? A.legendHTML() : '') +
      (editMode ? segEditHTML(s, i) :
        '<h3>组织方法</h3>' +
        '<p class="body-text">' + esc(s.organize || '—') + '</p>' +
        '<h3>规则与进阶（由易到难）</h3>' +
        '<ol class="olist">' + arr(s.progressions).map((p) => '<li>' + esc(p) + '</li>').join('') + '</ol>' +
        '<h3>指导要点</h3>' +
        '<ul class="ulist">' + arr(s.points).map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>' +
        '<div class="tsp">' +
        '<div><b>时间 TIME</b>' + esc(t.time || '—') + '</div>' +
        '<div><b>空间 SPACE</b>' + esc(t.space || '—') + '</div>' +
        '<div><b>压力 PRESSURE</b>' + esc(t.pressure || '—') + '</div>' +
        '</div>') +
      '<div class="seg-fig">' +
      '<div class="info-dot">图中示意球员 ' + shownPlayers + ' 人（示意，不等于总人数）</div>' +
      '<div class="placeholder-row">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="fake-ai" data-kind="text2fig">按文字更新图</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-action="fake-ai" data-kind="fig2text">按图更新文字</button>' +
      '</div>' +
      '</div>' +
      '</section>';
  }

  function planHTML() {
    return '<div id="chkLive">' + checkHTML() + '</div>' +
      '<div class="card lesson-head">' +
      '<div class="eh-top"><div class="eyebrow">教案详情 · 顶屹训练大纲</div>' +
      '<span id="headTag">' + tag(isEdited()) + '</span>' +
      '<button type="button" class="edit-toggle ' + (editMode ? 'on' : '') + '" data-action="edit-toggle">' +
      (editMode ? '完成' : '编辑') + '</button></div>' +
      (editMode
        ? '<input class="title-input" type="text" data-edit="title" value="' + esc(cur.title) + '" aria-label="教案标题">'
        : '<h1>' + esc(cur.title || '教案') + '</h1>') +
      metaHTML() +
      '<div class="goal-box"><div class="k">课程目标</div>' +
      (editMode
        ? '<textarea data-edit="goal" rows="3">' + esc(cur.goal) + '</textarea>'
        : '<div class="v">' + esc(cur.goal || '') + '</div>') +
      '</div>' +
      '<div class="focus-cap">本课重点' + (editMode ? '（可改、可增删、可调序）' : '') + '</div>' +
      (editMode ? focusEditorHTML()
        : '<div class="focus-list">' + arr(cur.focus).map((x) => '<span>' + esc(x) + '</span>').join('') + '</div>') +
      '<div class="eh-foot">' +
      '<button type="button" class="link-btn danger" data-action="restore">恢复 AI 原稿</button>' +
      '<span class="eh-flag' + (isEdited() ? '' : ' dim') + '" id="headFlag">' +
      (isEdited() ? '当前为工作副本（改动已存本机）' : '当前与原稿一致') + '</span>' +
      '</div>' +
      '</div>' +
      '<div id="tlWrap">' + timelineHTML() + '</div>' +
      arr(cur.segments).map((s, i) => segmentHTML(s, i)).join('') +
      '<div class="card check-card">' +
      '<h2>课后检验</h2>' +
      '<ul class="ulist">' + arr(cur.check).map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul>' +
      '</div>' +
      '<div class="bottom-bar"><div class="inner">' +
      (editMode
        ? '<button class="btn btn-primary btn-lg" type="button" data-action="edit-toggle">完成编辑</button>'
        : '<button class="btn btn-accent btn-lg" type="button" data-action="to-score">给这份教案打分</button>') +
      '</div></div>';
  }

  window.DYEditPlan = planHTML;

  /* =============================================================
   * 全屏场地图编辑器
   * ============================================================= */
  const TOOLS = [
    { id: 'select', label: '选择 / 移动' },
    { id: 'A', label: '进攻球员' },
    { id: 'D', label: '防守球员' },
    { id: 'N', label: '教练' },
    { id: 'ball', label: '球' },
    { id: 'cone', label: '标志筒' },
    { id: 'disc', label: '标志盘' },
    { id: 'gate', label: '标志筒门' },
    { id: 'goalmini', label: '小球门' },
    { id: 'goal5m', label: '5 米门' }
  ];
  const LINE_TYPES = [
    { id: 'pass', label: '传球' }, { id: 'run', label: '跑动' },
    { id: 'dribble', label: '带球' }, { id: 'shot', label: '射门' }
  ];
  const SIDES = [{ id: 'top', label: '上' }, { id: 'bottom', label: '下' }, { id: 'left', label: '左' }, { id: 'right', label: '右' }];

  let ed = null;        // 正在编辑的 diagram 工作副本
  let edIdx = -1;       // 段索引
  let edSel = null;     // {kind, idx, pt?}
  let edTool = 'select';
  let edHist = [];
  let edPos = -1;
  let overlay = null;
  let stage = null;
  let panelEl = null;
  let drag = null;
  let edOld = { w: 0, h: 0 };

  const snap = (v) => Math.round(v * 2) / 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function edSnapshot() {
    return JSON.stringify({ w: ed.w, h: ed.h, zones: ed.zones, goals: ed.goals, cones: ed.cones, discs: ed.discs, gates: ed.gates, players: ed.players, balls: ed.balls, lines: ed.lines });
  }
  function edPush() {
    const s = edSnapshot();
    if (edHist[edPos] === s) return;
    edHist = edHist.slice(0, edPos + 1);
    edHist.push(s);
    if (edHist.length > 60) edHist.shift();
    edPos = edHist.length - 1;
    edUpdateTop();
  }
  function edApply(s) {
    const o = JSON.parse(s);
    Object.keys(o).forEach((k) => { ed[k] = o[k]; });
    const w = overlay && overlay.querySelector('#edW');
    const h = overlay && overlay.querySelector('#edH');
    if (w) w.value = ed.w;
    if (h) h.value = ed.h;
    edDraw();
    edUpdateTop();
  }
  function edUndo() {
    if (edPos <= 0) return;
    edPos--;
    edApply(edHist[edPos]);
  }
  function edRedo() {
    if (edPos >= edHist.length - 1) return;
    edPos++;
    edApply(edHist[edPos]);
  }

  function edNormalizeDiagram(d) {
    const g = obj(clone(d));
    return {
      w: Math.max(6, Math.round(num(g.w, 20))),
      h: Math.max(6, Math.round(num(g.h, 15))),
      zones: arr(g.zones).map((z) => ({ x: num(z.x), y: num(z.y), w: Math.max(1, num(z.w, 3)), h: Math.max(1, num(z.h, 3)), label: String(z.label || '') })),
      goals: arr(g.goals).map((x) => ({ x: num(x.x), y: num(x.y), side: x.side || 'top', size: x.size === '5m' ? '5m' : 'mini' })),
      cones: arr(g.cones).map((p) => [num(p[0]), num(p[1])]),
      discs: arr(g.discs).map((p) => [num(p[0]), num(p[1])]),
      gates: arr(g.gates).map((x) => ({ x: num(x.x), y: num(x.y), w: Math.max(1, num(x.w, 3)) })),
      players: arr(g.players).map((p) => ({ x: num(p.x), y: num(p.y), team: ['A', 'D', 'N'].indexOf(p.team) >= 0 ? p.team : 'N', n: String(p.n == null ? '' : p.n), gk: !!p.gk })),
      balls: arr(g.balls).map((p) => [num(p[0]), num(p[1])]),
      lines: arr(g.lines).map((l) => ({ type: l.type || 'pass', pts: arr(l.pts).map((p) => [num(p[0]), num(p[1])]) }))
    };
  }

  /* ---------- 打开 / 关闭 ---------- */
  function openEditor(idx) {
    const seg = arr(cur.segments)[idx];
    if (!seg) return;
    edIdx = idx;
    ed = edNormalizeDiagram(seg.diagram);
    edOld = { w: ed.w, h: ed.h };
    edSel = null;
    edTool = 'select';
    edHist = [];
    edPos = -1;
    edPush();

    overlay = document.createElement('div');
    overlay.className = 'ed-overlay';
    overlay.innerHTML = '' +
      '<div class="ed-top">' +
      '  <button type="button" class="ed-tb" data-action="undo" aria-label="撤销">↶<b>撤销</b></button>' +
      '  <button type="button" class="ed-tb" data-action="redo" aria-label="重做">↷<b>重做</b></button>' +
      '  <span class="ed-title">第 ' + (idx + 1) + ' 段 · 场地图</span>' +
      '  <button type="button" class="ed-tb ghost" data-action="cancel">取消</button>' +
      '  <button type="button" class="ed-tb primary" data-action="done">完成</button>' +
      '</div>' +
      '<div class="ed-size">' +
      '  <span class="ed-size-lbl">场地</span>' +
      '  <label>宽<input type="number" id="edW" min="6" max="60" step="1" value="' + ed.w + '"></label>' +
      '  <span class="x">×</span>' +
      '  <label>高<input type="number" id="edH" min="6" max="60" step="1" value="' + ed.h + '"></label>' +
      '  <span class="ed-size-unit">米</span>' +
      '  <span class="ed-size-hint">改尺寸时所有元素按比例缩放</span>' +
      '</div>' +
      '<div class="ed-stage" id="edStage"></div>' +
      '<div class="ed-panel" id="edPanel"></div>' +
      '<div class="ed-tools" id="edTools">' +
      TOOLS.map((t) => '<button type="button" class="ed-tool' + (t.id === 'select' ? ' on' : '') +
        '" data-action="tool" data-tool="' + t.id + '">' + esc(t.label) + '</button>').join('') +
      '<button type="button" class="ed-tool off" disabled>画线（下一版）</button>' +
      '</div>';

    document.body.appendChild(overlay);
    document.documentElement.classList.add('ed-lock');
    stage = overlay.querySelector('#edStage');
    panelEl = overlay.querySelector('#edPanel');
    overlay.addEventListener('click', edClick);
    overlay.addEventListener('input', edInput);
    stage.addEventListener('pointerdown', edDown);
    stage.addEventListener('pointermove', edMove);
    stage.addEventListener('pointerup', edUp);
    stage.addEventListener('pointercancel', edUp);
    edDraw();
    edUpdateTop();
    edPanel();
  }

  function closeEditor() {
    if (!overlay) return;
    overlay.removeEventListener('click', edClick);
    overlay.removeEventListener('input', edInput);
    stage.removeEventListener('pointerdown', edDown);
    stage.removeEventListener('pointermove', edMove);
    stage.removeEventListener('pointerup', edUp);
    stage.removeEventListener('pointercancel', edUp);
    overlay.remove();
    overlay = null; stage = null; panelEl = null; ed = null; drag = null;
    document.documentElement.classList.remove('ed-lock');
  }

  function edUpdateTop() {
    if (!overlay) return;
    const u = overlay.querySelector('[data-action="undo"]');
    const r = overlay.querySelector('[data-action="redo"]');
    if (u) u.disabled = edPos <= 0;
    if (r) r.disabled = edPos >= edHist.length - 1;
  }

  /* ---------- 绘制（复用 app.js 的 renderDiagram，再叠加命中区） ---------- */
  function edViewScale(svg) {
    const ctm = svg.getScreenCTM();
    return ctm && ctm.a ? ctm.a : 1;
  }

  // 选中项越界（如撤销后元素消失）时清空选择，避免读空
  function edSelValid() {
    if (!edSel) return false;
    const k = edSel.kind, i = edSel.idx;
    const map = { player: ed.players, ball: ed.balls, cone: ed.cones, disc: ed.discs, gate: ed.gates, goal: ed.goals, zone: ed.zones, line: ed.lines };
    if (!map[k] || i < 0 || i >= map[k].length) { edSel = null; return false; }
    if (k === 'line' && edSel.pt != null && edSel.pt >= ed.lines[i].pts.length) edSel.pt = null;
    return true;
  }

  function edDraw() {
    if (!stage) return;
    edSelValid();
    const svgStr = (app && app.renderDiagram) ? app.renderDiagram(ed) : '';
    stage.innerHTML = svgStr;
    const svg = stage.querySelector('svg');
    if (!svg) return;
    svg.setAttribute('class', 'ed-svg');
    svg.style.touchAction = 'none';

    const scale = edViewScale(svg);
    const hitR = Math.max(0.9, 24 / (scale || 1));
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'ed-hits');

    const hit = (tag, attrs, ds) => {
      const el = document.createElementNS(ns, tag);
      Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
      el.setAttribute('fill', 'rgba(0,0,0,0)');
      el.setAttribute('stroke', 'none');
      el.setAttribute('pointer-events', 'all');
      Object.keys(ds).forEach((k) => el.setAttribute('data-' + k, ds[k]));
      g.appendChild(el);
      return el;
    };

    // 命中区层级（后添加的在上层）：区块 → 线条 → 器材 → 球员/球门
    ed.zones.forEach((z, i) => {
      hit('rect', { x: z.x, y: z.y, width: z.w, height: z.h }, { el: 'zone', idx: i });
    });
    ed.lines.forEach((l, i) => {
      const pts = l.pts.map((p) => p[0] + ',' + p[1]).join(' ');
      hit('polyline', { points: pts, 'stroke-width': hitR * 1.4, stroke: 'rgba(0,0,0,0)', 'stroke-linecap': 'round' }, { el: 'line', idx: i });
    });
    ed.goals.forEach((x, i) => hit('circle', { cx: x.x, cy: x.y, r: Math.max(hitR, 1.4) }, { el: 'goal', idx: i }));
    ed.gates.forEach((x, i) => hit('circle', { cx: x.x, cy: x.y, r: Math.max(hitR, x.w / 2) }, { el: 'gate', idx: i }));
    ed.cones.forEach((p, i) => hit('circle', { cx: p[0], cy: p[1], r: hitR }, { el: 'cone', idx: i }));
    ed.discs.forEach((p, i) => hit('circle', { cx: p[0], cy: p[1], r: hitR }, { el: 'disc', idx: i }));
    ed.balls.forEach((p, i) => hit('circle', { cx: p[0], cy: p[1], r: hitR }, { el: 'ball', idx: i }));
    ed.players.forEach((p, i) => hit('circle', { cx: p.x, cy: p.y, r: Math.max(hitR, 1.3) }, { el: 'player', idx: i }));

    svg.appendChild(g);

    // 选中高亮 + 线条手柄
    const hl = document.createElementNS(ns, 'g');
    hl.setAttribute('class', 'ed-hl');
    if (edSel) {
      const ring = (x, y, r) => {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', r);
        c.setAttribute('fill', 'none');
        c.setAttribute('stroke', '#f2b705');
        c.setAttribute('stroke-width', String(Math.max(0.16, 2.2 / (scale || 1) * 6)));
        c.setAttribute('stroke-dasharray', String(Math.max(0.2, 4 / (scale || 1) * 6)));
        hl.appendChild(c);
      };
      const k = edSel.kind;
      if (k === 'player') { const p = ed.players[edSel.idx]; ring(p.x, p.y, Math.max(1.5, 1.45)); }
      if (k === 'goal') { const p = ed.goals[edSel.idx]; ring(p.x, p.y, 1.6); }
      if (k === 'gate') { const p = ed.gates[edSel.idx]; ring(p.x, p.y, Math.max(1.6, p.w / 2 + 0.2)); }
      if (k === 'cone') { const p = ed.cones[edSel.idx]; ring(p[0], p[1], 1.1); }
      if (k === 'disc') { const p = ed.discs[edSel.idx]; ring(p[0], p[1], 0.9); }
      if (k === 'ball') { const p = ed.balls[edSel.idx]; ring(p[0], p[1], 0.9); }
      if (k === 'zone') {
        const z = ed.zones[edSel.idx];
        const r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', z.x - 0.2); r.setAttribute('y', z.y - 0.2);
        r.setAttribute('width', z.w + 0.4); r.setAttribute('height', z.h + 0.4);
        r.setAttribute('fill', 'none'); r.setAttribute('stroke', '#f2b705');
        r.setAttribute('stroke-width', String(Math.max(0.16, 0.22)));
        r.setAttribute('stroke-dasharray', String(Math.max(0.3, 0.6)));
        hl.appendChild(r);
      }
      if (k === 'line') {
        const l = ed.lines[edSel.idx];
        l.pts.forEach((p, pi) => {
          const c = document.createElementNS(ns, 'circle');
          c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]);
          c.setAttribute('r', String(Math.max(0.5, 1.1)));
          c.setAttribute('fill', '#fff');
          c.setAttribute('stroke', '#f2b705');
          c.setAttribute('stroke-width', String(Math.max(0.14, 0.22)));
          c.setAttribute('pointer-events', 'all');
          c.setAttribute('data-el', 'linept');
          c.setAttribute('data-idx', String(edSel.idx));
          c.setAttribute('data-pt', String(pi));
          hl.appendChild(c);
        });
      }
    }
    svg.appendChild(hl);
  }

  /* ---------- 面板 ---------- */
  function edPanel() {
    if (!panelEl) return;
    edSelValid();
    if (!edSel) {
      panelEl.innerHTML = '<div class="ed-tip">点选图中的元素可拖动；选下方工具后在场地里点一下即可添加。' +
        (edTool !== 'select' ? ' <b>当前工具：' + esc((TOOLS.filter((t) => t.id === edTool)[0] || {}).label || '') + '</b>' : '') + '</div>';
      panelEl.classList.remove('open');
      return;
    }
    panelEl.classList.add('open');
    const k = edSel.kind, i = edSel.idx;
    const head = '<div class="ed-panel-head"><b>' + esc({
      player: '球员', ball: '球', cone: '标志筒', disc: '标志盘', gate: '标志筒门',
      goal: '球门', zone: '区块', line: '线条'
    }[k] || '元素') + '</b>' +
      '<button type="button" class="ed-x" data-action="sel-close" aria-label="关闭">×</button></div>';
    let body = '';

    if (k === 'player') {
      const p = ed.players[i];
      body = '<div class="ed-row">' +
        '<label class="ed-fl">号码<input type="text" id="edNum" maxlength="2" value="' + esc(p.n) + '" inputmode="numeric"></label>' +
        '<div class="ed-seg">' + ['A', 'D', 'N'].map((t) =>
          '<button type="button" class="ed-pill ' + (p.team === t ? 'on' : '') + '" data-action="team" data-v="' + t + '">' +
          ({ A: '进攻', D: '防守', N: '教练' })[t] + '</button>').join('') + '</div></div>' +
        '<div class="ed-row"><button type="button" class="ed-pill ' + (p.gk ? 'on' : '') + '" data-action="gk">守门员' +
        (p.gk ? '（已开）' : '（关）') + '</button>' +
        '<button type="button" class="ed-del" data-action="del">删除</button></div>';
    } else if (k === 'gate') {
      body = '<div class="ed-row"><label class="ed-fl">宽度<input type="number" id="edGateW" min="1" max="10" step="0.5" value="' + ed.gates[i].w + '"> 米</label>' +
        '<button type="button" class="ed-del" data-action="del">删除</button></div>';
    } else if (k === 'goal') {
      body = '<div class="ed-row"><span class="ed-fl">朝向</span><div class="ed-seg">' + SIDES.map((s) =>
        '<button type="button" class="ed-pill ' + (ed.goals[i].side === s.id ? 'on' : '') + '" data-action="side" data-v="' + s.id + '">' + s.label + '</button>').join('') +
        '</div></div>' +
        '<div class="ed-row"><span class="ed-note">' + (ed.goals[i].size === '5m' ? '5 米球门' : '小球门') + '</span>' +
        '<button type="button" class="ed-del" data-action="del">删除</button></div>';
    } else if (k === 'line') {
      body = '<div class="ed-row"><span class="ed-fl">线型</span><div class="ed-seg">' + LINE_TYPES.map((t) =>
        '<button type="button" class="ed-pill ' + (ed.lines[i].type === t.id ? 'on' : '') + '" data-action="linetype" data-v="' + t.id + '">' + t.label + '</button>').join('') +
        '</div></div>' +
        '<div class="ed-row"><span class="ed-note">拖动白色圆点可改折点（本版不新画线）</span>' +
        '<button type="button" class="ed-del" data-action="del">删除线条</button></div>';
    } else if (k === 'zone') {
      body = '<div class="ed-row"><span class="ed-note">拖动区块可移动</span>' +
        '<button type="button" class="ed-del" data-action="del">删除区块</button></div>';
    } else {
      body = '<div class="ed-row"><span class="ed-note">拖动可移动（吸附 0.5 米）</span>' +
        '<button type="button" class="ed-del" data-action="del">删除</button></div>';
    }
    panelEl.innerHTML = head + body;
  }

  /* ---------- 坐标 ---------- */
  function toUser(ev) {
    const svg = stage && stage.querySelector('svg');
    if (!svg) return { x: 0, y: 0, scale: 1 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0, scale: 1 };
    const m = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
    return { x: m.x, y: m.y, scale: ctm.a || 1 };
  }

  function edHit(target) {
    const el = target && target.closest ? target.closest('[data-el]') : null;
    if (!el) return null;
    return { kind: el.getAttribute('data-el'), idx: num(el.getAttribute('data-idx'), -1), pt: el.getAttribute('data-pt') };
  }

  function edBounds(kind) {
    // 返回 [minX,minY,maxX,maxY]
    if (kind === 'N') return [-2, -2, ed.w + 2, ed.h + 2];
    return [0, 0, ed.w, ed.h];
  }

  function edSelect(sel) {
    edSel = sel;
    edDraw();
    edPanel();
  }

  /* ---------- 添加 ---------- */
  function nextNum(team) {
    let max = 0;
    ed.players.forEach((p) => {
      if (p.team !== team && team !== 'N') return;
      const n = parseInt(p.n, 10);
      if (isFinite(n)) max = Math.max(max, n);
    });
    return max + 1;
  }

  function addAt(pt) {
    const x = snap(clamp(pt.x, 0, ed.w));
    const y = snap(clamp(pt.y, 0, ed.h));
    if (edTool === 'A' || edTool === 'D' || edTool === 'N') {
      ed.players.push({ x: x, y: y, team: edTool, n: String(nextNum(edTool)), gk: false });
      edSel = { kind: 'player', idx: ed.players.length - 1 };
    } else if (edTool === 'ball') {
      ed.balls.push([x, y]);
      edSel = { kind: 'ball', idx: ed.balls.length - 1 };
    } else if (edTool === 'cone') {
      ed.cones.push([x, y]);
      edSel = { kind: 'cone', idx: ed.cones.length - 1 };
    } else if (edTool === 'disc') {
      ed.discs.push([x, y]);
      edSel = { kind: 'disc', idx: ed.discs.length - 1 };
    } else if (edTool === 'gate') {
      ed.gates.push({ x: x, y: y, w: 3 });
      edSel = { kind: 'gate', idx: ed.gates.length - 1 };
    } else if (edTool === 'goalmini' || edTool === 'goal5m') {
      // 就近边放置
      const dl = x, dr = ed.w - x, dt = y, db = ed.h - y;
      const min = Math.min(dl, dr, dt, db);
      const g = { x: x, y: y, side: min === dt ? 'top' : min === db ? 'bottom' : min === dl ? 'left' : 'right', size: edTool === 'goal5m' ? '5m' : 'mini' };
      if (g.side === 'top') { g.y = 0; }
      if (g.side === 'bottom') { g.y = ed.h; }
      if (g.side === 'left') { g.x = 0; }
      if (g.side === 'right') { g.x = ed.w; }
      ed.goals.push(g);
      edSel = { kind: 'goal', idx: ed.goals.length - 1 };
    }
    edPush();
    // 放置后回到「选择」，避免继续误加
    edTool = 'select';
    edToolsSync();
    edSelect(edSel);
  }

  /* ---------- 删除 / 修改 ---------- */
  function edDelete() {
    if (!edSel) return;
    const k = edSel.kind, i = edSel.idx;
    if (k === 'player') ed.players.splice(i, 1);
    else if (k === 'ball') ed.balls.splice(i, 1);
    else if (k === 'cone') ed.cones.splice(i, 1);
    else if (k === 'disc') ed.discs.splice(i, 1);
    else if (k === 'gate') ed.gates.splice(i, 1);
    else if (k === 'goal') ed.goals.splice(i, 1);
    else if (k === 'zone') ed.zones.splice(i, 1);
    else if (k === 'line') ed.lines.splice(i, 1);
    edSel = null;
    edPush();
    edSelect(null);
  }

  /* ---------- 拖动 ---------- */
  function edDown(ev) {
    if (ev.button != null && ev.button !== 0) return;
    const p = toUser(ev);
    const h = edHit(ev.target);

    if (edTool !== 'select') {
      // 选好工具后，点场地即放置（哪怕落点上有其它元素）
      if (p.x < -1 || p.y < -1 || p.x > ed.w + 1 || p.y > ed.h + 1) { ev.preventDefault(); return; }
      addAt(p);
      ev.preventDefault();
      return;
    }

    if (h && h.kind === 'linept') {
      edSel = { kind: 'line', idx: h.idx, pt: num(h.pt, 0) };
    } else if (h) {
      edSel = { kind: h.kind, idx: h.idx, pt: h.kind === 'line' ? null : undefined };
      if (edTool !== 'select') { edTool = 'select'; edToolsSync(); }
    } else {
      edSelect(null);
      ev.preventDefault();
      return;
    }

    // 记录拖动起点
    const k = edSel.kind, i = edSel.idx;
    let orig = null;
    if (k === 'player') orig = { x: ed.players[i].x, y: ed.players[i].y };
    else if (k === 'cone') orig = { x: ed.cones[i][0], y: ed.cones[i][1] };
    else if (k === 'disc') orig = { x: ed.discs[i][0], y: ed.discs[i][1] };
    else if (k === 'ball') orig = { x: ed.balls[i][0], y: ed.balls[i][1] };
    else if (k === 'gate') orig = { x: ed.gates[i].x, y: ed.gates[i].y };
    else if (k === 'goal') orig = { x: ed.goals[i].x, y: ed.goals[i].y };
    else if (k === 'zone') orig = { x: ed.zones[i].x, y: ed.zones[i].y };
    else if (k === 'line') {
      orig = edSel.pt == null
        ? { x: 0, y: 0, pts: ed.lines[i].pts.map((q) => [q[0], q[1]]) }
        : { x: ed.lines[i].pts[edSel.pt][0], y: ed.lines[i].pts[edSel.pt][1] };
    }

    drag = { x0: p.x, y0: p.y, orig: orig, moved: false, kind: k, idx: i, pt: edSel.pt };
    try { stage.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    ev.preventDefault();
    edDraw();
    edPanel();
  }

  function edMove(ev) {
    if (!drag || !drag.orig) return;
    const p = toUser(ev);
    const dx = p.x - drag.x0;
    const dy = p.y - drag.y0;
    if (!drag.moved && Math.abs(dx) < 0.35 && Math.abs(dy) < 0.35) { ev.preventDefault(); return; }
    drag.moved = true;

    const k = drag.kind, i = drag.idx;
    const b = edBounds(k === 'player' ? (ed.players[i] || {}).team : '');
    const isCoach = k === 'player' && ed.players[i] && ed.players[i].team === 'N';
    const bx = edBounds(isCoach ? 'N' : '');
    let nx = snap(drag.orig.x + dx);
    let ny = snap(drag.orig.y + dy);
    nx = clamp(nx, bx[0], bx[2]);
    ny = clamp(ny, bx[1], bx[3]);
    if (k === 'zone') {
      nx = clamp(nx, 0, Math.max(0, ed.w - ed.zones[i].w));
      ny = clamp(ny, 0, Math.max(0, ed.h - ed.zones[i].h));
    }
    if (k === 'player') { ed.players[i].x = nx; ed.players[i].y = ny; }
    else if (k === 'cone') { ed.cones[i][0] = nx; ed.cones[i][1] = ny; }
    else if (k === 'disc') { ed.discs[i][0] = nx; ed.discs[i][1] = ny; }
    else if (k === 'ball') { ed.balls[i][0] = nx; ed.balls[i][1] = ny; }
    else if (k === 'gate') { ed.gates[i].x = nx; ed.gates[i].y = ny; }
    else if (k === 'zone') { ed.zones[i].x = nx; ed.zones[i].y = ny; }
    else if (k === 'goal') {
      // 球门吸附到最近的边
      const cand = [{ s: 'top', x: nx, y: 0, d: ny }, { s: 'bottom', x: nx, y: ed.h, d: ed.h - ny },
        { s: 'left', x: 0, y: ny, d: nx }, { s: 'right', x: ed.w, y: ny, d: ed.w - nx }];
      cand.sort((a, c) => a.d - c.d);
      const g = cand[0];
      if (g.d < 3) { ed.goals[i].x = g.x; ed.goals[i].y = g.y; ed.goals[i].side = g.s; }
      else { ed.goals[i].x = nx; ed.goals[i].y = ny; }
    }
    else if (k === 'line') {
      if (drag.pt == null) {
        // 整条线平移（限制在场地内）
        const pts = drag.orig.pts;
        const minX = Math.min.apply(null, pts.map((q) => q[0]));
        const maxX = Math.max.apply(null, pts.map((q) => q[0]));
        const minY = Math.min.apply(null, pts.map((q) => q[1]));
        const maxY = Math.max.apply(null, pts.map((q) => q[1]));
        const dx2 = clamp(dx, -minX, ed.w - maxX);
        const dy2 = clamp(dy, -minY, ed.h - maxY);
        ed.lines[i].pts = pts.map((q) => [snap(q[0] + dx2), snap(q[1] + dy2)]);
      } else {
        ed.lines[i].pts[drag.pt] = [nx, ny];
      }
    }
    edDraw();
    ev.preventDefault();
  }

  function edUp(ev) {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    try { stage.releasePointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    if (moved) edPush();
    edPanel();
  }

  function edToolsSync() {
    if (!overlay) return;
    overlay.querySelectorAll('.ed-tool[data-tool]').forEach((b) => {
      b.classList.toggle('on', b.getAttribute('data-tool') === edTool);
    });
  }

  /* ---------- 事件 ---------- */
  function edClick(ev) {
    const el = ev.target.closest('[data-action]');
    if (!el) return;
    const a = el.getAttribute('data-action');
    if (a === 'undo') { edUndo(); return; }
    if (a === 'redo') { edRedo(); return; }
    if (a === 'cancel') { closeEditor(); return; }
    if (a === 'done') { commitEditor(); return; }
    if (a === 'tool') {
      edTool = el.getAttribute('data-tool');
      edToolsSync();
      edSel = null;
      edDraw(); edPanel();
      return;
    }
    if (a === 'sel-close') { edSelect(null); return; }
    if (a === 'del') { edDelete(); return; }
    if (a === 'team') {
      const p = ed.players[edSel.idx];
      p.team = el.getAttribute('data-v');
      if (p.team !== 'N' && !p.n) p.n = String(nextNum(p.team));
      edPush(); edDraw(); edPanel();
      return;
    }
    if (a === 'gk') { ed.players[edSel.idx].gk = !ed.players[edSel.idx].gk; edPush(); edDraw(); edPanel(); return; }
    if (a === 'side') { ed.goals[edSel.idx].side = el.getAttribute('data-v'); edPush(); edDraw(); edPanel(); return; }
    if (a === 'linetype') { ed.lines[edSel.idx].type = el.getAttribute('data-v'); edPush(); edDraw(); edPanel(); return; }
  }

  function edInput(ev) {
    const t = ev.target;
    if (!t || !t.id) return;
    if (t.id === 'edW' || t.id === 'edH') { edResize(t.id, num(t.value, 0)); return; }
    if (!edSel) return;
    if (t.id === 'edNum') { ed.players[edSel.idx].n = String(t.value || '').slice(0, 2); edPush(); edDraw(); return; }
    if (t.id === 'edGateW') { ed.gates[edSel.idx].w = clamp(num(t.value, 3), 1, 10); edPush(); edDraw(); return; }
  }

  function edResize(which, v) {
    const nv = clamp(Math.round(v || 0), 6, 60);
    if (!nv || nv === (which === 'edW' ? ed.w : ed.h)) return;
    const oldW = ed.w, oldH = ed.h;
    const newW = which === 'edW' ? nv : ed.w;
    const newH = which === 'edH' ? nv : ed.h;
    const kx = newW / oldW, ky = newH / oldH;
    const sx = (x) => Math.round(x * kx * 2) / 2;
    const sy = (y) => Math.round(y * ky * 2) / 2;
    ed.zones.forEach((z) => { z.x = sx(z.x); z.y = sy(z.y); z.w = Math.max(1, Math.round(z.w * kx * 2) / 2); z.h = Math.max(1, Math.round(z.h * ky * 2) / 2); });
    ed.goals.forEach((g) => { g.x = sx(g.x); g.y = sy(g.y); });
    ed.cones.forEach((p) => { p[0] = sx(p[0]); p[1] = sy(p[1]); });
    ed.discs.forEach((p) => { p[0] = sx(p[0]); p[1] = sy(p[1]); });
    ed.balls.forEach((p) => { p[0] = sx(p[0]); p[1] = sy(p[1]); });
    ed.players.forEach((p) => { p.x = sx(p.x); p.y = sy(p.y); });
    ed.gates.forEach((g) => { g.x = sx(g.x); g.y = sy(g.y); g.w = Math.max(1, Math.round(g.w * kx * 2) / 2); });
    ed.lines.forEach((l) => l.pts.forEach((p) => { p[0] = sx(p[0]); p[1] = sy(p[1]); }));
    ed.w = newW; ed.h = newH;
    edPush(); edDraw();
    const w = overlay.querySelector('#edW'), h = overlay.querySelector('#edH');
    if (w) w.value = ed.w;
    if (h) h.value = ed.h;
  }

  /* ---------- 完成：写回数据 + 文字尺寸联动 ---------- */
  function commitEditor() {
    const seg = arr(cur.segments)[edIdx];
    if (!seg) { closeEditor(); return; }
    const oldW = edOld.w, oldH = edOld.h;
    const newW = ed.w, newH = ed.h;
    seg.diagram = edNormalizeDiagram(ed);
    const changes = (newW !== oldW || newH !== oldH);
    closeEditor();
    let n = 0;
    if (changes) n = syncDims(seg, oldW, oldH, newW, newH);
    saveNow();
    app.render();
    if (changes) app.toast('已同步 ' + n + ' 处文字（场区 ' + oldW + '×' + oldH + 'm → ' + newW + '×' + newH + 'm）');
    else app.toast('场地图已保存');
  }

  // 把该段文字中的旧尺寸替换为新尺寸，返回替换次数
  function syncDims(seg, oldW, oldH, newW, newH) {
    let n = 0;
    const rep = (s) => String(s).replace(DIM_RE, (m, a, b) => {
      const na = num(a, 0), nb = num(b, 0);
      if (na === oldW && nb === oldH) { n++; return newW + '×' + newH; }
      if (na === oldH && nb === oldW) { n++; return newH + '×' + newW; }
      return m;
    });
    seg.organize = rep(seg.organize);
    seg.progressions = arr(seg.progressions).map(rep);
    seg.points = arr(seg.points).map(rep);
    seg.tsp = { time: rep(obj(seg.tsp).time), space: rep(obj(seg.tsp).space), pressure: rep(obj(seg.tsp).pressure) };
    return n;
  }

  // 改总人数：替换文字里的「旧数 人」
  function syncPlayers(oldN, newN) {
    if (!oldN || oldN === newN) return 0;
    let n = 0;
    const re = new RegExp('(^|[^0-9.])' + oldN + '(\\s*人)', 'g');
    const rep = (s) => String(s).replace(re, (m, p1, p2) => { n++; return p1 + newN + p2; });
    cur.goal = rep(cur.goal);
    cur.focus = arr(cur.focus).map(rep);
    cur.check = arr(cur.check).map(rep);
    cur.segments.forEach((seg) => {
      seg.organize = rep(seg.organize);
      seg.progressions = arr(seg.progressions).map(rep);
      seg.points = arr(seg.points).map(rep);
      seg.tsp = { time: rep(obj(seg.tsp).time), space: rep(obj(seg.tsp).space), pressure: rep(obj(seg.tsp).pressure) };
    });
    return n;
  }

  /* ---------- 轻量刷新：只改由数据派生的 DOM（保住输入焦点） ---------- */
  function refreshDerived() {
    const totalEl = document.getElementById('hdrTotal');
    if (totalEl) totalEl.textContent = String(totalMinutes());
    const eqEl = document.getElementById('hdrEquip');
    if (eqEl) eqEl.innerHTML = lessonEquipText();
    const tl = document.getElementById('tlWrap');
    if (tl) tl.innerHTML = timelineHTML();
    arr(cur.segments).forEach((s, i) => {
      const meta = document.getElementById('segMeta-' + i);
      if (meta) {
        meta.innerHTML = '<span>场区 ' + segAreaText(s) + '</span>' +
          '<span>' + esc(orgText(s, cur.players)) + '</span>' +
          '<span>器材 ' + segEquipText(s) + '</span>';
      }
      const dur = document.getElementById('segDurView-' + i);
      if (dur) dur.textContent = num(s.minutes, 0) + ' 分钟';
      const d = document.getElementById('segDur-' + i);
      if (d) d.textContent = String(num(s.minutes, 0));
      const st = document.getElementById('segTag-' + i);
      if (st) st.innerHTML = tag(segEdited(i));
    });
    const chk = document.getElementById('chkLive');
    if (chk) chk.innerHTML = checkHTML();
    const pw = document.getElementById('hdrPlayers');
    if (pw) pw.textContent = String(num(cur.players, 0));
    const ps = document.getElementById('hdrPlStepper');
    if (ps) ps.textContent = String(num(cur.players, 0));
    const ht = document.getElementById('headTag');
    if (ht) ht.innerHTML = tag(isEdited());
    const hf = document.getElementById('headFlag');
    if (hf) {
      hf.className = 'eh-flag' + (isEdited() ? '' : ' dim');
      hf.textContent = isEdited() ? '当前为工作副本（改动已存本机）' : '当前与原稿一致';
    }
  }

  const segAt = (i) => arr(cur.segments)[num(i, 0)];

  function moveIn(list, i, d) {
    const j = i + d;
    if (i < 0 || j < 0 || i >= list.length || j >= list.length) return false;
    const t = list[i]; list[i] = list[j]; list[j] = t;
    return true;
  }

  function onPlanClick(ev) {
    const el = ev.target.closest('[data-action]');
    if (!el) return;
    const a = el.getAttribute('data-action');
    const idx = num(el.getAttribute('data-idx'), 0);
    // data-seg = 段索引（列表/器材按钮），data-idx = 条目索引
    const segIdxAttr = el.getAttribute('data-seg') != null ? el.getAttribute('data-seg') : null;
    const seg = segIdxAttr != null ? segAt(segIdxAttr) : null;

    switch (a) {
      case 'check-toggle':
        checkOpen = !checkOpen;
        app.render();
        break;
      case 'chk-jump': {
        const target = document.getElementById('seg-' + idx);
        if (target) {
          const chk = document.querySelector('.check-bar');
          const off = 52 + (chk ? chk.offsetHeight : 0) + 56;
          window.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - off), behavior: 'smooth' });
        }
        break;
      }
      case 'edit-toggle':
        editMode = !editMode;
        saveNow();
        app.render();
        app.toast(editMode ? '已进入编辑：改完点「完成」保存' : '已保存修改');
        break;
      case 'open-editor':
        openEditor(idx);
        break;
      case 'fake-ai':
        app.toast('接入 AI 后可用：AI 会按修改重画图/改写文字，由你确认后生效');
        break;
      case 'lesson-players': {
        const d = num(el.getAttribute('data-value'), 0);
        const old = num(cur.players, 0);
        const next = clamp(old + d, PL_MIN, PL_MAX);
        if (next === old) return;
        cur.players = next;
        const n = syncPlayers(old, next);
        saveNow();
        app.render();
        app.toast('人数 ' + old + ' → ' + next + ' 人' + (n ? '，已同步 ' + n + ' 处文字' : ''));
        break;
      }
      case 'seg-min': {
        if (!seg) return;
        const d = num(el.getAttribute('data-value'), 0);
        seg.minutes = clamp(num(seg.minutes, 0) + d, 0, 90);
        saveNow();
        app.render();
        break;
      }
      case 'li-up': case 'li-down': {
        if (!seg) return;
        const key = el.getAttribute('data-list') === 'prog' ? 'progressions' : 'points';
        if (moveIn(seg[key], idx, a === 'li-up' ? -1 : 1)) { saveNow(); app.render(); }
        break;
      }
      case 'li-del': {
        if (!seg) return;
        const key = el.getAttribute('data-list') === 'prog' ? 'progressions' : 'points';
        seg[key] = arr(seg[key]).filter((x, i) => i !== idx);
        saveNow(); app.render();
        break;
      }
      case 'li-add': {
        if (!seg) return;
        const key = el.getAttribute('data-list') === 'prog' ? 'progressions' : 'points';
        seg[key] = arr(seg[key]).concat(['']);
        saveNow(); app.render();
        const list = document.querySelectorAll('[data-edit="seg-' + (el.getAttribute('data-list') === 'prog' ? 'prog' : 'point') + '"][data-seg="' + segIdxAttr + '"]');
        if (list.length) list[list.length - 1].focus();
        break;
      }
      case 'focus-up': case 'focus-down':
        if (moveIn(cur.focus, idx, a === 'focus-up' ? -1 : 1)) { saveNow(); app.render(); }
        break;
      case 'focus-del':
        cur.focus = arr(cur.focus).filter((x, i) => i !== idx);
        saveNow(); app.render();
        break;
      case 'focus-add':
        cur.focus = arr(cur.focus).concat(['']);
        saveNow(); app.render();
        document.querySelectorAll('[data-edit="focus"]').forEach((x, i, ls) => { if (i === ls.length - 1) x.focus(); });
        break;
      case 'equip-add':
        if (!seg) return;
        seg.equipExtra = arr(seg.equipExtra).concat([{ name: '', n: 1, unit: '个' }]);
        saveNow(); app.render();
        break;
      case 'equip-del':
        if (!seg) return;
        seg.equipExtra = arr(seg.equipExtra).filter((x, i) => i !== idx);
        saveNow(); app.render(); refreshDerived();
        break;
      case 'restore':
        showRestoreConfirm(el);
        break;
      case 'restore-yes':
        cur = clone(ORIG);
        try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ }
        editMode = false;
        checkOpen = false;
        app.render();
        app.toast('已恢复 AI 原稿');
        break;
      case 'restore-no':
        removeRestoreConfirm();
        break;
      default:
        break;
    }
  }

  function showRestoreConfirm(btn) {
    removeRestoreConfirm();
    const box = document.createElement('div');
    box.className = 'restore-confirm';
    box.innerHTML = '<span>恢复后本机所有修改都会丢失，确定？</span>' +
      '<span class="rc-btns"><button type="button" class="rc-no" data-action="restore-no">取消</button>' +
      '<button type="button" class="rc-yes" data-action="restore-yes">确认恢复</button></span>';
    const foot = btn.closest('.eh-foot') || btn.parentNode;
    foot.insertBefore(box, foot.firstChild);
    box.scrollIntoView({ block: 'nearest' });
  }
  function removeRestoreConfirm() {
    const b = document.querySelector('.restore-confirm');
    if (b) b.remove();
  }

  function onPlanInput(ev) {
    const t = ev.target;
    if (!t || !t.getAttribute) return;
    const key = t.getAttribute('data-edit');
    if (!key) return;
    const idx = num(t.getAttribute('data-idx'), 0);
    const li = num(t.getAttribute('data-li'), 0);
    const segKey = t.getAttribute('data-seg') != null ? t.getAttribute('data-seg') : t.getAttribute('data-idx');
    const seg = segKey != null ? segAt(segKey) : null;

    switch (key) {
      case 'title': cur.title = t.value; break;
      case 'goal': cur.goal = t.value; break;
      case 'focus': cur.focus[idx] = t.value; break;
      case 'seg-name': if (seg) seg.name = t.value; refreshDerived(); break;
      case 'seg-organize': if (seg) seg.organize = t.value; break;
      case 'seg-tsp':
        if (seg) {
          const k = t.getAttribute('data-k');
          seg.tsp = obj(seg.tsp);
          seg.tsp[k] = t.value;
        }
        break;
      case 'seg-prog': if (seg) seg.progressions[li] = t.value; break;
      case 'seg-point': if (seg) seg.points[li] = t.value; break;
      case 'seg-equip-name': if (seg) seg.equipExtra[li].name = t.value; refreshDerived(); break;
      case 'seg-equip-n': if (seg) seg.equipExtra[li].n = Math.max(0, Math.round(num(t.value, 0))); refreshDerived(); break;
      default: return;
    }
    if (t.tagName === 'TEXTAREA') growTextarea(t);
    refreshDerived();
    save();
  }

  // 编辑态 textarea 随内容自动增高（不出现内部滚动）
  function growTextarea(t) {
    const border = Math.max(0, t.offsetHeight - t.clientHeight);
    t.style.height = 'auto';
    const minH = t.closest('.row-edit.stack') ? 0 : 76;
    const need = Math.max(t.scrollHeight, minH) + border;
    const max = Math.round(window.innerHeight * 0.5);
    t.style.height = Math.min(need, max) + 'px';
    t.style.overflowY = need > max ? 'auto' : 'hidden';
  }

  /* ---------------- 对外接口 / 初始化 ---------------- */
  window.DYEdit = {
    planHTML: () => planHTML(),
    isEdited: () => isEdited(),
    totalMinutes: () => totalMinutes(),
    segMinutes: () => arr(cur.segments).map((x) => Math.max(0, num(x.minutes, 0))),
    lessonEquipText: () => lessonEquipText(),
    open: (i) => openEditor(i)
  };

  function boot() {
    app = window.DYApp;
    if (!app) return;
    document.addEventListener('click', (ev) => {
      if (!document.getElementById('app')) return;
      if (window.DYRoute && window.DYRoute() !== 'plan') return;
      if (ev.target.closest && ev.target.closest('.ed-overlay')) return;
      onPlanClick(ev);
    });
    document.addEventListener('input', (ev) => {
      if (window.DYRoute && window.DYRoute() !== 'plan') return;
      onPlanInput(ev);
    });
    document.addEventListener('keydown', (ev) => {
      if (overlay) {
        if (ev.key === 'Escape') closeEditor();
        return;
      }
      // 教案页键盘可达性：聚焦角色为 button 的场地图/时间轴段，Enter/空格等同于点击
      if (window.DYRoute && window.DYRoute() !== 'plan') return;
      const t = ev.target;
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      if (!t || !t.getAttribute || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON') return;
      if (t.getAttribute('role') === 'button' && t.getAttribute('data-action')) {
        ev.preventDefault();
        onPlanClick({ target: t, preventDefault() {}, stopPropagation() {} });
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
