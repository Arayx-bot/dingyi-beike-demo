/* =============================================================
 * 顶屹备课助手 · 内容数据（U9 1v1 正面进攻 · Demo 版）
 * 全局导出：FORM / LOADING_STEPS / PLANS / LESSON / SCORE_ITEMS
 * -------------------------------------------------------------
 * FORM = {
 *   ages:      { label, options:[string], default:string },
 *   topics:    { label, options:[{id,label,enabled:boolean}], default:id },
 *   goal:      { label, default:string },
 *   players:   { label, min, max, step, default:number },
 *   duration:  { label, readonly:true, unit:string },   // 由 LESSON 五段自动合计
 *   field:     { label, options:[{id,label}], default:id },
 *   equipment: { label, options:[string], default:[string] },
 *   level:     { label, scale:[1..5], total:25,
 *                bands:[{max,label}],                     // 按合计分取第一个 total<=max
 *                dimensions:[{key,label,hint,default:1-5}] },
 *   skills:    { masteredLabel, unmasteredLabel, options:[string],
 *                mastered:[string], unmastered:[string] }
 * }
 * LOADING_STEPS = [string, ...]                       // 逐条滚动显示
 * PLANS = [{ id, title, idea, tags:[string], difficulty:string, detail:boolean }]
 *         // detail=true 才可进入 #plan，其余点击提示
 * LESSON = {
 *   title, age, players, duration, field,
 *   equipment:[string], goal:string, focus:[string],
 *   segments:[{ key:'warmup'|'tech'|'skill'|'game'|'cool',
 *               name, minutes, area, players, equipment, diagram,
 *               organize:string, progressions:[string], points:[string],
 *               tsp:{time,space,pressure} }],
 *   check:[string]
 * }
 * diagram = {
 *   w, h,                                  // 场区米数，原点左上
 *   zones:[{x,y,w,h,label}],
 *   goals:[{x,y,side:'top'|'bottom'|'left'|'right', size:'mini'|'5m'}],
 *   cones:[[x,y]], discs:[[x,y]], gates:[{x,y,w}],
 *   players:[{x,y,team:'A'|'D'|'N', n:string, gk?:true}],
 *            // 配色（B 级教材约定）：
 *            //  A = 进攻：蓝色圆 #1f5fbf 白字
 *            //  D = 防守：红色圆 #d23a2a 白字
 *            //  N = 教练/中立：黄色圆 #f2b705 黑字（n:'C'）
 *            //  gk:true 额外画黑描边方框 + 「GK」小字
 *   balls:[[x,y]],
 *   lines:[{type:'pass'|'run'|'dribble'|'shot', pts:[[x,y],...]}]
 *     // pass=实线箭头(白) run=虚线箭头(浅黄) dribble=正弦波浪线(白) shot=粗实线箭头(黄)
 * }
 * SCORE_ITEMS = [{ key, label, desc, default?:1-5 }]
 * ============================================================= */

const FORM = {
  ages: {
    label: '年龄段',
    options: ['U7', 'U8', 'U9', 'U10', 'U11', 'U12'],
    default: 'U9'
  },
  topics: {
    label: '训练主题',
    options: [
      { id: 't1v1', label: '1v1 正面进攻', enabled: true },
      { id: 'back1v1', label: '1v1 背身进攻', enabled: false },
      { id: 'def1v1', label: '1v1 防守', enabled: false },
      { id: 'dribble', label: '运球变向', enabled: false },
      { id: 'shoot', label: '射门', enabled: false },
      { id: 'build', label: '后场组织进攻', enabled: false }
    ],
    default: 't1v1'
  },
  goal: {
    label: '课程目标',
    default: '正面面对防守时，敢于主动突破：先逼近、再用假动作和变向让对手重心移动，突破后立即加速向前；80% 的孩子能在对抗中完成至少一次成功突破。'
  },
  players: { label: '人数', min: 6, max: 24, step: 1, default: 12 },
  duration: { label: '课时长度', readonly: true, unit: '分钟' },
  field: {
    label: '场地',
    options: [
      { id: 'p8a', label: '八人制场地 40×60m' },
      { id: 'p8b', label: '八人制场地 45×65m' },
      { id: 'p5', label: '五人制场地 20×40m' }
    ],
    default: 'p8a'
  },
  equipment: {
    label: '器材',
    options: ['4 号球（每人 1 个）', '标志盘', '标志筒', '小球门', '5 米球门 2 个', '分队背心 2 色'],
    default: ['4 号球（每人 1 个）', '标志盘', '标志筒', '小球门', '5 米球门 2 个', '分队背心 2 色']
  },
  level: {
    label: '孩子水平（五维评分）',
    scale: [1, 2, 3, 4, 5],
    total: 25,
    bands: [
      { max: 10, label: '起步' },
      { max: 17, label: '发展' },
      { max: 25, label: '熟练' }
    ],
    dimensions: [
      { key: 'tech', label: '技术', hint: '球感、运球变向、过人动作是否稳定', default: 3 },
      { key: 'tactics', label: '战术', hint: '能否观察对手、选择突破时机', default: 2 },
      { key: 'body', label: '身体', hint: '灵敏、启动速度、平衡', default: 3 },
      { key: 'mind', label: '心智', hint: '敢不敢对抗、丢球后是否积极', default: 3 },
      { key: 'social', label: '社交', hint: '听指令、轮换排队、与同伴配合', default: 3 }
    ]
  },
  skills: {
    masteredLabel: '已掌握技能',
    unmasteredLabel: '未掌握技能',
    options: ['脚内侧运球', '脚外侧运球', '拉球变向', '扣球变向', '踩单车', '急停急起', '脚背正面射门', '护球'],
    mastered: ['脚内侧运球', '脚外侧运球', '拉球变向', '脚背正面射门'],
    unmastered: ['踩单车', '急停急起', '护球']
  }
};

const LOADING_STEPS = [
  '读取年龄段 U9 与孩子五维水平…',
  '匹配顶屹训练大纲 U7–U9 阶段目标：以个人能力为主、重点 1v1 突破…',
  '检索 B 级教材中 1v1 进攻相关练习…',
  '按五段结构编排：热身 → 技术 → 技能 → 比赛 → 放松总结…',
  '设置时间、空间、压力，检查是否由易到难、围绕主题…',
  '绘制场地图，生成 5 套候选方案…'
];

const PLANS = [
  {
    id: 'A',
    title: '方案 A · 突破小门',
    idea: '从无对抗的动作练习，过渡到 12×15 米小区域 1v1 突破小门，最后在条件比赛中“过人进球算 2 分”。',
    tags: ['由易到难', '小门得分', '含攻守转换'],
    difficulty: '适中',
    detail: true
  },
  {
    id: 'B',
    title: '方案 B · 闯关游戏',
    idea: '把防守人设成“关卡守卫”，孩子带球连闯三关，游戏化程度高，适合注意力短、水平偏起步的班。',
    tags: ['游戏化', '重复次数多'],
    difficulty: '偏易',
    detail: false
  },
  {
    id: 'C',
    title: '方案 C · 突破 + 回追',
    idea: '突破第一名防守后，第二名防守从侧后回追，迫使孩子突破后立刻加速、护球。',
    tags: ['压力递增', '突破后加速'],
    difficulty: '偏难',
    detail: false
  },
  {
    id: 'D',
    title: '方案 D · 多球门选择',
    idea: '对面设置 3 个小门，防守站位决定哪边有空当，练“抬头看、选方向”。',
    tags: ['观察决策', '可衔接 U10+'],
    difficulty: '偏难',
    detail: false
  },
  {
    id: 'E',
    title: '方案 E · 边路 1v1',
    idea: '在边路通道内正面 1v1，突破后传中或内切射门，贴近八人制比赛真实场景。',
    tags: ['真实场景', '边路'],
    difficulty: '适中',
    detail: false
  }
];

const LESSON = {
  title: '1v1 正面进攻 · 突破小门',
  age: 'U9',
  players: 12,
  duration: 110,
  field: '八人制场地 40×60m（分区使用）',
  equipment: ['4 号球 12 个', '标志盘约 30 个', '标志筒 12 个', '小球门 6 个', '5 米球门 2 个', '分队背心 2 色各 6 件'],
  goal: '正面面对防守时，敢于主动突破：先逼近、再用假动作和变向让对手重心移动，突破后立即加速向前；80% 的孩子能在对抗中完成至少一次成功突破。',
  focus: [
    '逼近：带球主动压向防守人，距离 1.5–2 米时做动作',
    '骗重心：用拉球、扣球或身体假动作让防守先动',
    '突破后加速：第一步向前穿过，身体挡在球和防守之间',
    '丢球立即反抢：攻转守 3 秒内完成'
  ],
  segments: [
    {
      key: 'warmup',
      name: '热身 · 运球闯关',
      minutes: 15,
      area: '20×20m',
      players: '12 人，每人 1 球；后 2 节设 2 名“守关人”',
      equipment: '标志盘 8 个、4 号球 12 个',
      diagram: {
        w: 20, h: 20,
        discs: [[0, 0], [10, 0], [20, 0], [0, 10], [20, 10], [0, 20], [10, 20], [20, 20]],
        players: [
          { x: 4, y: 4, team: 'A', n: '1' }, { x: 13, y: 3.5, team: 'A', n: '2' },
          { x: 17, y: 8, team: 'A', n: '3' }, { x: 3.5, y: 12, team: 'A', n: '4' },
          { x: 15, y: 15.5, team: 'A', n: '5' }, { x: 7, y: 17, team: 'A', n: '6' },
          { x: 9, y: 8, team: 'D', n: '1' }, { x: 11, y: 13, team: 'D', n: '2' },
          { x: 10, y: 21.5, team: 'N', n: 'C' }
        ],
        balls: [[5.3, 4.9], [14.2, 4.6], [17, 9.7], [4.6, 13.2], [16.2, 16.6], [8.3, 18.0]],
        lines: [
          { type: 'dribble', pts: [[5, 5], [8, 6], [7, 10]] },
          { type: 'dribble', pts: [[14, 4.5], [16, 6], [14, 9]] },
          { type: 'dribble', pts: [[4.5, 13], [7, 15], [9.5, 14]] },
          { type: 'run', pts: [[11, 13], [14.5, 15]] }
        ]
      },
      organize: '20×20 米区域内每人一球自由运球。教练口令：“左脚 / 右脚 / 外脚背 / 停！”，孩子按口令变换触球部位或急停。每节 2 分钟，节间 1 分钟动态牵拉（高抬腿、侧滑步、弓步走）。后两节加入 2 名无球“守关人”，只能在区域内抢球，被抢到的孩子与守关人互换。',
      progressions: [
        '自由运球，脚内侧、脚外侧多次拨球',
        '听口令变向、急停急起',
        '运球中抬头，看到同伴喊名字并交换球',
        '加入 2 名守关人：被抢即攻守互换（守转攻 / 攻转守）'
      ],
      points: [
        '球不离脚，每一步都触球',
        '抬头看空当，不撞人',
        '热身少讲多练，指导放在节间休息'
      ],
      tsp: { time: '2 分钟 × 4 节', space: '20×20m，人均约 33㎡', pressure: '无 → 轻（守关人）' }
    },
    {
      key: 'tech',
      name: '技术 · 正面突破动作（无对抗）',
      minutes: 35,
      area: '3 条通道，每条 5×25m',
      players: '每条通道 4 人，依次出发',
      equipment: '标志盘、标志筒 3 个（当作防守人）、小门（2 个标志筒）3 组',
      diagram: {
        w: 16, h: 25,
        zones: [
          { x: 0, y: 0, w: 5, h: 25, label: '通道1' },
          { x: 5.5, y: 0, w: 5, h: 25, label: '通道2' },
          { x: 11, y: 0, w: 5, h: 25, label: '通道3' }
        ],
        cones: [[2.5, 12], [8, 12], [13.5, 12]],
        gates: [{ x: 2.5, y: 4, w: 2 }, { x: 8, y: 4, w: 2 }, { x: 13.5, y: 4, w: 2 }],
        players: [
          { x: 2.5, y: 23.5, team: 'A', n: '1' },
          { x: 8, y: 16, team: 'A', n: '2' },
          { x: 13.5, y: 23.5, team: 'A', n: '3' },
          { x: 8, y: 24.4, team: 'A', n: '4' }
        ],
        balls: [[2.5, 22.15], [8, 14.65], [13.5, 22.15]],
        lines: [
          { type: 'dribble', pts: [[2.5, 22], [2.5, 14.5], [1.2, 12.5], [2.5, 9], [2.5, 4.5]] },
          { type: 'dribble', pts: [[8, 15], [8.6, 13.5], [9.4, 11], [8, 5]] },
          { type: 'run', pts: [[13.5, 21.5], [13.5, 15]] }
        ]
      },
      organize: '每条通道中间放一个标志筒当“防守人”，前方 2 米宽小门。孩子带球加速冲向标志筒，在距离 1.5–2 米处做突破动作，然后加速穿过小门，再沿通道外侧带球回到队尾。教练先慢速示范，每个动作练 8 分钟左右。',
      progressions: [
        '动作 1：拉球变向（脚底向一侧拉，另一脚推走）',
        '动作 2：扣球变向（脚内侧扣回，向反方向加速）',
        '动作 3：踩单车 + 变向（身体假动作）',
        '标志筒换成同伴“消极防守”：只左右移动、不出脚抢',
        '加时间要求：教练喊“走”后 3 秒内必须穿过小门'
      ],
      points: [
        '接近时先放慢、看防守人的脚和重心',
        '动作做在 1.5–2 米处，太远骗不动，太近被抢',
        '用远离防守的脚触球推走',
        '动作后第一步必须向前加速，不要横着跑'
      ],
      tsp: { time: '每次 5–8 秒，人均 12 次以上', space: '通道宽 5 米', pressure: '无对抗 → 消极防守' }
    },
    {
      key: 'skill',
      name: '技能 · 1v1 突破小门（有对抗）',
      minutes: 30,
      area: '3 个区域，每个 12×15m',
      players: '每区 4 人（2 攻 2 守轮换），每 4 分钟换攻守',
      equipment: '每区小球门 2 个 + 标志筒门 1 个',
      diagram: {
        w: 12, h: 15,
        goals: [{ x: 3.5, y: 0, side: 'top', size: 'mini' }, { x: 8.5, y: 0, side: 'top', size: 'mini' }],
        gates: [{ x: 6, y: 15, w: 2.5 }],
        discs: [[0, 0], [12, 0], [0, 15], [12, 15]],
        players: [
          { x: 6, y: 3, team: 'D', n: '1' },
          { x: 10.5, y: 1.5, team: 'D', n: '2' },
          { x: 6, y: 13, team: 'A', n: '1' },
          { x: 1.5, y: 14, team: 'A', n: '2' },
          { x: 12.8, y: 8, team: 'N', n: 'C' }
        ],
        balls: [[6.9, 3.75]],
        lines: [
          { type: 'pass', pts: [[6, 2.4], [6, 12.2]] },
          { type: 'run', pts: [[5.6, 4.2], [5.6, 7.5]] },
          { type: 'dribble', pts: [[6.6, 12.2], [6.8, 9.5], [8.8, 7.5], [8.6, 1.4]] }
        ]
      },
      organize: '防守人从端线把球传给对面的进攻人，传完立即上前防守。进攻人接球后正面 1v1，带球射进对面 2 个小门中的任意一个得 1 分。防守人断球后可以反打进攻方身后的标志筒门（守转攻），进攻人要马上回抢（攻转守）。每次 6–8 秒，两组轮流，每 4 分钟攻守互换。',
      progressions: [
        '防守人传球后先绕到身前标志盘再上抢（给进攻方时间）',
        '防守人传球后直接上抢（真实压力）',
        '限时：接球后 6 秒内必须射门',
        '断球反击标志筒门，失球方立即反抢',
        '强化：突破后 15 米内防守人仍可追抢'
      ],
      points: [
        '第一脚接球向前推，不要停死',
        '主动逼近防守人，让他先动',
        '看到防守重心偏移或脚步交叉时突破',
        '突破后身体挡在球和防守之间，加速射门',
        '丢球后不站着，立刻反抢'
      ],
      tsp: { time: '每次 6–8 秒，每 4 分钟换攻守', space: '12×15m（比赛常态 1v1 空间约 7–8 米）', pressure: '延迟上抢 → 直接上抢 → 回追' }
    },
    {
      key: 'game',
      name: '比赛 · 6v6 条件比赛',
      minutes: 25,
      area: '35×50m',
      players: '6v6（各含 1 名守门员）',
      equipment: '5 米球门 2 个、4 号球、分队背心',
      diagram: {
        w: 35, h: 50,
        goals: [{ x: 17.5, y: 0, side: 'top', size: '5m' }, { x: 17.5, y: 50, side: 'bottom', size: '5m' }],
        players: [
          { x: 17.5, y: 47.5, team: 'A', n: '1', gk: true },
          { x: 9, y: 37, team: 'A', n: '2' }, { x: 26, y: 37, team: 'A', n: '3' },
          { x: 13, y: 26, team: 'A', n: '4' }, { x: 25, y: 21, team: 'A', n: '5' },
          { x: 17, y: 13, team: 'A', n: '6' },
          { x: 17.5, y: 2.5, team: 'D', n: '1', gk: true },
          { x: 10, y: 10, team: 'D', n: '2' }, { x: 25, y: 11, team: 'D', n: '3' },
          { x: 23, y: 16.5, team: 'D', n: '4' }, { x: 14, y: 20, team: 'D', n: '5' },
          { x: 19, y: 31, team: 'D', n: '6' }
        ],
        balls: [[27.4, 20.2]],
        lines: [
          { type: 'dribble', pts: [[27.4, 20.2], [27.6, 17], [24, 12.5], [21, 9]] },
          { type: 'shot', pts: [[21, 8.5], [18.5, 0.8]] },
          { type: 'run', pts: [[17, 13], [13, 7]] }
        ]
      },
      organize: '6v6 带守门员比赛，4 号球、5 米球门，按正式规则执行（含越位）。前 10 分钟为条件比赛：带球过掉一名防守人后完成的进球算 2 分；后 15 分钟为自由比赛，检验孩子能否主动用出本课的突破。',
      progressions: [
        '条件比赛：过人后进球计 2 分',
        '自由比赛：按正式规则，教练只在死球时提示'
      ],
      points: [
        '前方只剩一名防守、身后有空当时，果断突破',
        '突破后第一选择是向前：射门或继续推进',
        '丢球后就地反抢（攻转守）',
        '教练记录每个孩子的突破尝试和成功次数'
      ],
      tsp: { time: '10 分钟 + 15 分钟', space: '35×50m', pressure: '真实比赛对抗' }
    },
    {
      key: 'cool',
      name: '放松 · 牵拉与总结',
      minutes: 5,
      area: '场地一角',
      players: '全体围圈',
      equipment: '无',
      diagram: {
        w: 14, h: 12,
        players: [
          { x: 7, y: 2, team: 'A', n: '1' }, { x: 10.5, y: 3, team: 'A', n: '2' },
          { x: 12, y: 6, team: 'A', n: '3' }, { x: 10.5, y: 9, team: 'D', n: '4' },
          { x: 7, y: 10, team: 'D', n: '5' }, { x: 3.5, y: 9, team: 'D', n: '6' },
          { x: 2, y: 6, team: 'A', n: '7' }, { x: 3.5, y: 3, team: 'D', n: '8' },
          { x: 7, y: 6, team: 'N', n: 'C' }
        ]
      },
      organize: '慢跑 1 分钟后围圈做静态牵拉（大腿前后侧、小腿、髋部），每个动作 15–20 秒。教练边牵拉边提问总结。',
      progressions: [
        '提问：“什么时候做突破动作？”（离防守 1.5–2 米）',
        '提问：“突破之后第一步做什么？”（向前加速）',
        '表扬今天突破最勇敢的 1–2 名孩子'
      ],
      points: [
        '让孩子自己说出要点，教练补充',
        '布置课后作业：在家练拉球变向 50 次'
      ],
      tsp: { time: '5 分钟', space: '—', pressure: '恢复' }
    }
  ],
  check: [
    '技能段：80% 的孩子（12 人中至少 10 人）完成至少 1 次成功突破，即视为本课达标',
    '比赛段：统计每人突破尝试次数和成功次数，记入孩子成长档案',
    '根据表现更新孩子“技术”和“心智”两项评分',
    '未达标的孩子，下节课热身时安排额外 1v1 重复练习'
  ]
};

const SCORE_ITEMS = [
  { key: 'theme', label: '围绕主题', desc: '五段内容是否都围绕“1v1 正面进攻”，有没有跑题。', default: 3 },
  { key: 'progress', label: '由易到难', desc: '从无对抗到有对抗再到比赛，难度递进是否合理。', default: 3 },
  { key: 'basics', label: '基本要素完整', desc: '时间、场区、人数、器材、组织方法、指导要求是否写清楚。', default: 3 },
  { key: 'tsp', label: '时间 · 空间 · 压力', desc: '三要素设置是否合理，是否符合 U9 孩子。', default: 3 },
  { key: 'moments', label: '贴近真实比赛', desc: '是否体现四个时刻（进攻、防守、攻转守、守转攻）。', default: 3 },
  { key: 'reps', label: '重复次数与分组', desc: '分组是否合理，每个孩子练习次数是否足够、等待是否太久。', default: 3 },
  { key: 'points', label: '指导要点', desc: '要点是否具体、教练拿到能不能直接用。', default: 3 }
];

window.FORM = FORM;
window.LOADING_STEPS = LOADING_STEPS;
window.PLANS = PLANS;
window.LESSON = LESSON;
window.SCORE_ITEMS = SCORE_ITEMS;
