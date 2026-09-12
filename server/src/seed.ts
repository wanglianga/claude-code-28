import fs from 'fs';
import path from 'path';
import { query } from './db';
import { hashPassword, mulberry32 } from './util';

export const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads');

/* ---------------- 儿童画占位图生成（确定性，无需外部图片） ---------------- */

const PALETTES: string[][] = [
  ['#e07856', '#f2b263', '#7fb069', '#5b8e7d', '#f4f1de'],
  ['#e07a5f', '#3d405b', '#81b29a', '#f2cc8f', '#f4f1de'],
  ['#d65db1', '#ff9671', '#ffc75f', '#7fb069', '#f9f5e3'],
  ['#5b8e7d', '#e07856', '#f2b263', '#8ab17d', '#f4f1de'],
  ['#6a8eae', '#e07856', '#f2cc8f', '#81b29a', '#fdf6e3'],
];

function crayon(rand: () => number, color: string, w: number): string {
  const x1 = 40 + rand() * 520, y1 = 40 + rand() * 370;
  const x2 = 40 + rand() * 520, y2 = 40 + rand() * 370;
  const cx = (x1 + x2) / 2 + (rand() - 0.5) * 160;
  const cy = (y1 + y2) / 2 + (rand() - 0.5) * 160;
  return `<path d="M${x1.toFixed(0)} ${y1.toFixed(0)} Q${cx.toFixed(0)} ${cy.toFixed(0)} ${x2.toFixed(0)} ${y2.toFixed(0)}" stroke="${color}" stroke-width="${w.toFixed(1)}" fill="none" stroke-linecap="round" opacity="0.85"/>`;
}

function artSvg(seed: number, theme: string): string {
  const rand = mulberry32(seed);
  const pal = PALETTES[Math.floor(rand() * PALETTES.length)];
  const parts: string[] = [];
  parts.push(`<rect width="600" height="450" fill="#fffdf4"/>`);
  // 太阳 / 月亮
  const sunX = 70 + rand() * 460, sunY = 50 + rand() * 90, sunR = 24 + rand() * 18;
  parts.push(`<circle cx="${sunX.toFixed(0)}" cy="${sunY.toFixed(0)}" r="${sunR.toFixed(0)}" fill="${pal[1]}" opacity="0.9"/>`);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r1 = sunR + 6, r2 = sunR + 16 + rand() * 8;
    parts.push(`<line x1="${(sunX + Math.cos(a) * r1).toFixed(0)}" y1="${(sunY + Math.sin(a) * r1).toFixed(0)}" x2="${(sunX + Math.cos(a) * r2).toFixed(0)}" y2="${(sunY + Math.sin(a) * r2).toFixed(0)}" stroke="${pal[1]}" stroke-width="4" stroke-linecap="round"/>`);
  }
  // 远山与草地
  parts.push(`<path d="M0 300 Q150 ${220 + rand() * 40} 300 290 T600 280 V450 H0 Z" fill="${pal[3]}" opacity="0.55"/>`);
  parts.push(`<path d="M0 350 Q200 ${310 + rand() * 30} 400 345 T600 340 V450 H0 Z" fill="${pal[2]}" opacity="0.7"/>`);
  // 主题相关主体
  if (/树|四季|森林/.test(theme)) {
    for (let i = 0; i < 3; i++) {
      const tx = 100 + rand() * 400, ty = 250 + rand() * 60;
      parts.push(`<rect x="${tx - 8}" y="${ty}" width="16" height="70" rx="6" fill="#8a5a3b"/>`);
      parts.push(`<circle cx="${tx}" cy="${ty - 20}" r="${34 + rand() * 20}" fill="${pal[i % pal.length]}" opacity="0.9"/>`);
    }
  } else if (/城市|街|楼|未来/.test(theme)) {
    for (let i = 0; i < 5; i++) {
      const bx = 40 + i * 105 + rand() * 20, bh = 120 + rand() * 130, bw = 60 + rand() * 30;
      parts.push(`<rect x="${bx.toFixed(0)}" y="${(360 - bh).toFixed(0)}" width="${bw.toFixed(0)}" height="${bh.toFixed(0)}" rx="6" fill="${pal[i % pal.length]}" opacity="0.85"/>`);
      for (let wY = 0; wY < 3; wY++) for (let wX = 0; wX < 2; wX++) {
        parts.push(`<rect x="${(bx + 10 + wX * 24).toFixed(0)}" y="${(360 - bh + 14 + wY * 34).toFixed(0)}" width="14" height="18" rx="3" fill="#fffdf4" opacity="0.9"/>`);
      }
    }
  } else if (/鱼|海底|水/.test(theme)) {
    for (let i = 0; i < 4; i++) {
      const fx = 80 + rand() * 420, fy = 150 + rand() * 220, s = 18 + rand() * 16;
      parts.push(`<ellipse cx="${fx.toFixed(0)}" cy="${fy.toFixed(0)}" rx="${s.toFixed(0)}" ry="${(s * 0.6).toFixed(0)}" fill="${pal[i % pal.length]}"/>`);
      parts.push(`<path d="M${(fx - s).toFixed(0)} ${fy.toFixed(0)} l${(-s * 0.8).toFixed(0)} ${(-s * 0.5).toFixed(0)} v${s.toFixed(0)} Z" fill="${pal[(i + 1) % pal.length]}"/>`);
      parts.push(`<circle cx="${(fx + s * 0.4).toFixed(0)}" cy="${(fy - 3).toFixed(0)}" r="3" fill="#2b2622"/>`);
    }
  } else if (/家|房|早餐|静物/.test(theme)) {
    const hx = 220 + rand() * 80, hy = 210 + rand() * 30;
    parts.push(`<rect x="${hx}" y="${hy}" width="170" height="130" rx="8" fill="${pal[0]}" opacity="0.9"/>`);
    parts.push(`<path d="M${hx - 16} ${hy + 6} L${hx + 85} ${hy - 70} L${hx + 186} ${hy + 6} Z" fill="${pal[1]}"/>`);
    parts.push(`<rect x="${hx + 66}" y="${hy + 60}" width="40" height="70" rx="5" fill="#8a5a3b"/>`);
    parts.push(`<rect x="${hx + 20}" y="${hy + 24}" width="34" height="30" rx="4" fill="#fffdf4"/>`);
    parts.push(`<rect x="${hx + 118}" y="${hy + 24}" width="34" height="30" rx="4" fill="#fffdf4"/>`);
  } else {
    // 抽象形状组合
    for (let i = 0; i < 6; i++) {
      const cx = 60 + rand() * 480, cy = 90 + rand() * 300, r = 16 + rand() * 34;
      const c = pal[i % pal.length];
      const kind = Math.floor(rand() * 3);
      if (kind === 0) parts.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${c}" opacity="0.8"/>`);
      else if (kind === 1) parts.push(`<rect x="${(cx - r).toFixed(0)}" y="${(cy - r).toFixed(0)}" width="${(r * 2).toFixed(0)}" height="${(r * 2).toFixed(0)}" rx="10" fill="${c}" opacity="0.8" transform="rotate(${(rand() * 40 - 20).toFixed(0)} ${cx.toFixed(0)} ${cy.toFixed(0)})"/>`);
      else parts.push(`<path d="M${cx.toFixed(0)} ${(cy - r).toFixed(0)} L${(cx + r).toFixed(0)} ${(cy + r).toFixed(0)} L${(cx - r).toFixed(0)} ${(cy + r).toFixed(0)} Z" fill="${c}" opacity="0.8"/>`);
    }
  }
  // 蜡笔笔触
  const strokes = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < strokes; i++) {
    parts.push(crayon(rand, pal[Math.floor(rand() * pal.length)], 3 + rand() * 5));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450" viewBox="0 0 600 450">${parts.join('')}</svg>`;
}

/* ---------------- 种子数据 ---------------- */

const LESSON_DATES = [
  '2026-06-20', '2026-06-27', '2026-07-04', '2026-07-11', '2026-07-18', '2026-07-25',
  '2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29', '2026-09-05',
];

/** 未来课次（今天起），用于承接比赛辅导计划等后续教学安排 */
const FUTURE_DATES = ['2026-09-12', '2026-09-19', '2026-09-26', '2026-10-03', '2026-10-10'];

const FUTURE_THEMES: Record<string, LessonDef[]> = {
  '启蒙A班': [
    { theme: '《秋天的颜色》色彩涂鸦', stage: '色彩感知' },
    { theme: '《小动物写生》观察练习', stage: '观察启蒙' },
    { theme: '《我的机器人》想象画', stage: '创意表达' },
    { theme: '《丰收的果园》构图练习', stage: '造型基础' },
    { theme: '《国庆主题画》综合创作', stage: '综合创作' },
  ],
  '基础B班': [
    { theme: '《秋色写生》色彩练习', stage: '色彩感知' },
    { theme: '《线条的韵律》线条表现', stage: '造型基础' },
    { theme: '《立体构成启蒙》', stage: '造型基础' },
    { theme: '《主题创作》综合练习', stage: '综合创作' },
    { theme: '《作品讲评与修改》', stage: '综合创作' },
  ],
  '提高C班': [
    { theme: '《素描·石膏五官》', stage: '造型基础' },
    { theme: '《色彩风景·秋》', stage: '色彩表现' },
    { theme: '《速写·场景组合》', stage: '造型基础' },
    { theme: '《主题创作》', stage: '综合创作' },
    { theme: '《作品集点评》', stage: '综合创作' },
  ],
};

interface LessonDef { theme: string; stage: string; }

const THEMES: Record<string, LessonDef[]> = {
  '启蒙A班': [
    { theme: '《会跳舞的线》线条游戏', stage: '造型基础' },
    { theme: '《彩色的雨》色彩涂鸦', stage: '色彩感知' },
    { theme: '《圆圆的世界》形状认知', stage: '造型基础' },
    { theme: '《我的小手》观察涂鸦', stage: '观察启蒙' },
    { theme: '《怪兽朋友》想象画', stage: '创意表达' },
    { theme: '《点点聚会》构图启蒙', stage: '造型基础' },
    { theme: '《彩虹桥》色彩混合', stage: '色彩感知' },
    { theme: '《毛毛虫散步》线条节奏', stage: '造型基础' },
    { theme: '《我的家》主题画', stage: '观察启蒙' },
    { theme: '《海底世界》想象画', stage: '创意表达' },
    { theme: '《大树的四季》色彩画', stage: '色彩感知' },
    { theme: '《生日派对》综合创作', stage: '综合创作' },
  ],
  '基础B班': [
    { theme: '《线的表情》线条表现', stage: '造型基础' },
    { theme: '《我的早餐》静物写生', stage: '观察表现' },
    { theme: '《冷暖色的对话》色彩关系', stage: '色彩感知' },
    { theme: '《疏密的游戏》构图法则', stage: '造型基础' },
    { theme: '《会飞的鱼》创意联想', stage: '创意表达' },
    { theme: '《静物组合》写生', stage: '观察表现' },
    { theme: '《光影小游戏》明暗启蒙', stage: '造型基础' },
    { theme: '《城市剪影》构图练习', stage: '造型基础' },
    { theme: '《四季的树》色彩表现', stage: '色彩感知' },
    { theme: '《假如我变小》创意画', stage: '创意表达' },
    { theme: '《我的好朋友》肖像画', stage: '造型基础' },
    { theme: '《未来城市》综合创作', stage: '综合创作' },
  ],
  '提高C班': [
    { theme: '《结构素描·几何体》', stage: '造型基础' },
    { theme: '《结构素描·静物》', stage: '造型基础' },
    { theme: '《速写·动态人物》', stage: '造型基础' },
    { theme: '《色彩静物·水果》', stage: '色彩表现' },
    { theme: '《色彩风景·黄昏》', stage: '色彩表现' },
    { theme: '《透视·街道》', stage: '空间表现' },
    { theme: '《创意海报设计》', stage: '创意表达' },
    { theme: '《版画·藏书票》', stage: '综合媒材' },
    { theme: '《漫画分镜》叙事表达', stage: '创意表达' },
    { theme: '《户外写生·公园》', stage: '观察表现' },
    { theme: '《主题创作·我的家乡》', stage: '综合创作' },
    { theme: '《作品集整理与讲评》', stage: '综合创作' },
  ],
};

const SUGGESTIONS = [
  '主体造型比上次更饱满，建议下次注意画面留白，不要把纸面填得过满。',
  '线条开始敢于落笔，继续鼓励大胆起形，回家可用铅笔做5分钟轮廓速写。',
  '色彩搭配上出现了主动选择，建议引导其说出配色理由，强化色彩语言。',
  '观察环节能抓住主要特征，细节刻画还需耐心，可多用"看一看再画"的节奏。',
  '创意点很有童趣，建议保留这份想象力，同时练习把想法画得更完整。',
  '本节课专注度不错，完成度提高，后半段可再提醒检查画面整体关系。',
  '构图有中心意识了，下次尝试主体再大一些，背景再概括一些。',
  '对新材料还在适应期，允许试错，重点保护表达欲望。',
];

const NEXT_PREPS = [
  '下次课带一本喜欢的绘本，用于主题讨论；无需特殊材料。',
  '请准备A4速写本和2B铅笔，下节课进入线条专项练习。',
  '下次课为户外观察课，请穿方便活动的衣服并带水壶。',
  '请在家完成半张水果观察小稿，下次课带来讲评。',
  '下次课使用水粉，请带围裙或旧衣服。',
  '无需准备材料，建议课前和孩子聊聊"我的梦想"话题。',
];

const CLASS_STATES = [
  '整节课投入，发言积极，能按步骤完成作品。',
  '前半段专注，后半段略有分心，提醒后能回到画面。',
  '今天情绪很好，主动帮助同桌，完成速度较快。',
  '起稿阶段有些犹豫，在鼓励下能独立完成。',
  '对新材料很兴奋，需要提醒先构思再动手。',
  '安静专注，能耐心修改细节。',
];

const HOME_NOTES = [
  '建议在家练习：每天5分钟画一种线条（直线/波浪线/螺旋线）。',
  '建议在家观察一种水果并画下轮廓，不求像，重在观察。',
  '建议亲子共画：和孩子各画一幅"我的家"，互相讲一讲。',
  '建议练习涂色不出界的小游戏，每次10分钟即可。',
];

const DIMS = ['composition', 'line_score', 'color', 'observation', 'creativity', 'focus'] as const;

interface StudentProfile {
  name: string; gender: string; birthYear: number; ageGroup: string;
  className: string; willingness: string; willingnessNote: string;
  base: number[]; slope: number[];   // 六维起点与每课增量
  absentLessons: number[];           // 缺课（无作品）
  leaveLessons: number[];            // 请假（后续补课）
  makeupLessons: number[];           // 已补课（有作品）
  homeworkSkipRate: number;          // 作业未交概率
  special?: (lessonIdx: number, dim: number, v: number) => number;
}

const STUDENTS: StudentProfile[] = [
  {
    name: '陈小明', gender: '男', birthYear: 2019, ageGroup: '7-9岁', className: '基础B班',
    willingness: '一般', willingnessNote: '喜欢画车，对写生兴趣一般，需要鼓励',
    base: [2.4, 2.6, 2.8, 2.3, 2.7, 2.5], slope: [0.07, 0.08, 0.06, 0.07, 0.05, 0.06],
    absentLessons: [], leaveLessons: [], makeupLessons: [], homeworkSkipRate: 0.25,
  },
  {
    name: '林小雨', gender: '女', birthYear: 2021, ageGroup: '4-6岁', className: '启蒙A班',
    willingness: '积极', willingnessNote: '非常喜欢画画，在家主动涂鸦',
    base: [2.5, 2.4, 3.2, 2.4, 3.8, 2.0], slope: [0.08, 0.09, 0.07, 0.08, 0.05, 0.12],
    absentLessons: [], leaveLessons: [], makeupLessons: [], homeworkSkipRate: 0.1,
  },
  {
    name: '张子涵', gender: '女', birthYear: 2016, ageGroup: '10-12岁', className: '提高C班',
    willingness: '积极', willingnessNote: '目标参加美术特长生选拔，自驱力强',
    base: [3.4, 3.5, 3.3, 3.4, 3.6, 3.6], slope: [0.08, 0.07, 0.09, 0.08, 0.06, 0.05],
    absentLessons: [], leaveLessons: [], makeupLessons: [], homeworkSkipRate: 0.0,
  },
  {
    name: '刘一诺', gender: '男', birthYear: 2018, ageGroup: '7-9岁', className: '基础B班',
    willingness: '一般', willingnessNote: '换老师后短暂不适应，目前已恢复',
    base: [3.0, 3.1, 2.9, 2.8, 3.0, 3.0], slope: [0.05, 0.05, 0.06, 0.06, 0.05, 0.04],
    absentLessons: [], leaveLessons: [6, 8], makeupLessons: [6, 8], homeworkSkipRate: 0.2,
    special: (lessonIdx, _dim, v) => (lessonIdx === 6 || lessonIdx === 7 ? v - 0.5 : lessonIdx === 8 ? v - 0.2 : v),
  },
  {
    name: '黄思远', gender: '男', birthYear: 2020, ageGroup: '4-6岁', className: '启蒙A班',
    willingness: '被动', willingnessNote: '家长期望偏高，孩子课堂易分心',
    base: [2.8, 2.7, 2.9, 2.5, 2.6, 2.4], slope: [-0.04, -0.05, -0.03, -0.02, -0.02, -0.06],
    absentLessons: [3, 6, 9, 10], leaveLessons: [], makeupLessons: [], homeworkSkipRate: 0.8,
  },
  {
    name: '苏晴', gender: '女', birthYear: 2015, ageGroup: '10-12岁', className: '提高C班',
    willingness: '积极', willingnessNote: '希望升入素描进阶班，家长支持',
    base: [3.0, 3.1, 3.0, 2.9, 3.2, 3.3], slope: [0.10, 0.09, 0.10, 0.11, 0.08, 0.07],
    absentLessons: [], leaveLessons: [], makeupLessons: [], homeworkSkipRate: 0.05,
  },
];

const STAGE_GOALS: Array<[string, string, number, string]> = [
  ['4-6岁', 'composition', 2, '能把主体画在纸面中央，画面不空不满'],
  ['4-6岁', 'line_score', 2, '敢于落笔，能画出连贯的直线与曲线'],
  ['4-6岁', 'color', 3, '认识并主动使用6种以上颜色，涂色有边界意识'],
  ['4-6岁', 'observation', 2, '能说出并画出物体的2-3个明显特征'],
  ['4-6岁', 'creativity', 3, '乐于想象，画面有自己的小故事'],
  ['4-6岁', 'focus', 2, '能保持15分钟以上专注完成一幅作品'],
  ['7-9岁', 'composition', 3, '有主体意识，能安排2个以上物体的位置关系'],
  ['7-9岁', 'line_score', 3, '线条有轻重变化，能用线条表现质感'],
  ['7-9岁', 'color', 4, '理解冷暖色，能为主观表达选择配色'],
  ['7-9岁', 'observation', 3, '写生能抓住比例与主要结构'],
  ['7-9岁', 'creativity', 4, '能围绕主题进行联想并完整表达'],
  ['7-9岁', 'focus', 3, '整节课（60分钟）基本保持投入'],
  ['10-12岁', 'composition', 4, '能运用疏密、对比等构图法则组织画面'],
  ['10-12岁', 'line_score', 4, '线条肯定，能表现结构与明暗关系'],
  ['10-12岁', 'color', 4, '掌握色调概念，能处理画面色彩统一与变化'],
  ['10-12岁', 'observation', 4, '写生比例准确，能表现空间与体积'],
  ['10-12岁', 'creativity', 4, '能独立完成主题性创作并阐述思路'],
  ['10-12岁', 'focus', 4, '全程专注，能自我检查与修改画面'],
];

export async function seedIfEmpty(): Promise<void> {
  const { rows } = await query('SELECT count(*)::int AS c FROM users');
  if (rows[0].c > 0) {
    console.log('数据库已有数据，跳过种子初始化');
    return;
  }
  console.log('初始化种子数据...');
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  // 用户
  const pw = hashPassword('teacher123');
  const pwSup = hashPassword('supervisor123');
  const pwParent = hashPassword('parent123');
  const teacherIds: Record<string, number> = {};
  for (const [username, name] of [['teacher', '王慧老师'], ['teacher2', '李岚老师'], ['teacher3', '赵铭老师']] as const) {
    const r = await query(
      'INSERT INTO users (username, password_hash, role, name) VALUES ($1,$2,$3,$4) RETURNING id',
      [username, pw, 'teacher', name]);
    teacherIds[username] = r.rows[0].id;
  }
  const supId = (await query(
    'INSERT INTO users (username, password_hash, role, name) VALUES ($1,$2,$3,$4) RETURNING id',
    ['supervisor', pwSup, 'supervisor', '张主管'])).rows[0].id;
  const parentIds: number[] = [];
  const parentNames = ['陈小明妈妈', '林小雨爸爸', '张子涵妈妈', '刘一诺妈妈', '黄思远爸爸', '苏晴妈妈'];
  for (let i = 0; i < 6; i++) {
    const r = await query(
      'INSERT INTO users (username, password_hash, role, name) VALUES ($1,$2,$3,$4) RETURNING id',
      [`parent${i + 1}`, pwParent, 'parent', parentNames[i]]);
    parentIds.push(r.rows[0].id);
  }

  // 班级
  const classIds: Record<string, number> = {};
  const classDefs: Array<[string, string, string, string]> = [
    ['启蒙A班', '启蒙阶段', '4-6岁', 'teacher'],
    ['基础B班', '基础阶段', '7-9岁', 'teacher2'],
    ['提高C班', '提高阶段', '10-12岁', 'teacher3'],
  ];
  for (const [name, stage, ageGroup, tUser] of classDefs) {
    const r = await query(
      'INSERT INTO classes (name, stage, age_group, teacher_id) VALUES ($1,$2,$3,$4) RETURNING id',
      [name, stage, ageGroup, teacherIds[tUser]]);
    classIds[name] = r.rows[0].id;
  }

  // 阶段目标
  for (const [ageGroup, dim, target, desc] of STAGE_GOALS) {
    await query(
      'INSERT INTO stage_goals (age_group, dimension, target_score, description) VALUES ($1,$2,$3,$4)',
      [ageGroup, dim, target, desc]);
  }

  // 课程（每班12节已上 + 5节未来课次）
  const lessonIds: Record<string, number[]> = {};
  for (const [className, defs] of Object.entries(THEMES)) {
    lessonIds[className] = [];
    const tUser = classDefs.find((c) => c[0] === className)![3];
    const allDefs = [...defs, ...FUTURE_THEMES[className]];
    const allDates = [...LESSON_DATES, ...FUTURE_DATES];
    for (let i = 0; i < allDefs.length; i++) {
      const r = await query(
        'INSERT INTO lessons (class_id, teacher_id, lesson_date, theme, stage, seq) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [classIds[className], teacherIds[tUser], allDates[i], allDefs[i].theme, allDefs[i].stage, i + 1]);
      lessonIds[className].push(r.rows[0].id);
    }
  }

  // 学生 + 作品 + 点评 + 出勤 + 作业
  const studentIds: number[] = [];
  const artworkIds: Record<string, number[]> = {}; // 学生名 -> 作品id（按课序）
  for (let s = 0; s < STUDENTS.length; s++) {
    const st = STUDENTS[s];
    const className = st.className;
    const tUser = classDefs.find((c) => c[0] === className)![3];
    const r = await query(
      `INSERT INTO students (name, gender, birth_year, age_group, class_id, parent_id, teacher_id, enrolled_at, child_willingness, willingness_note, hours_purchased)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [st.name, st.gender, st.birthYear, st.ageGroup, classIds[className], parentIds[s],
       teacherIds[tUser], '2026-06-15', st.willingness, st.willingnessNote, 48]);
    const studentId = r.rows[0].id as number;
    studentIds.push(studentId);
    artworkIds[st.name] = [];

    const rand = mulberry32(studentId * 1000 + 7);
    const lessons = lessonIds[className];
    for (let li = 0; li < LESSON_DATES.length; li++) {  // 仅为已上的12节课生成出勤/作品/点评
      const lessonId = lessons[li];
      const isAbsent = st.absentLessons.includes(li);
      const isMakeup = st.makeupLessons.includes(li);
      const status = isAbsent ? 'absent' : st.leaveLessons.includes(li) ? (isMakeup ? 'makeup' : 'leave') : 'present';
      await query('INSERT INTO attendance (student_id, lesson_id, status) VALUES ($1,$2,$3)',
        [studentId, lessonId, status]);
      if (isAbsent || status === 'leave') continue;

      // 作品
      const theme = THEMES[className][li].theme;
      const svg = artSvg(studentId * 100 + li, theme);
      const file = `art-${studentId}-${lessonId}.svg`;
      fs.writeFileSync(path.join(UPLOAD_DIR, file), svg);
      const title = theme.replace(/[《》]/g, '').split('·')[0].split('》')[0];
      const ar = await query(
        'INSERT INTO artworks (student_id, lesson_id, teacher_id, title, image_path) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [studentId, lessonId, teacherIds[tUser], title, `/uploads/${file}`]);
      const artworkId = ar.rows[0].id as number;
      artworkIds[st.name].push(artworkId);

      // 六维评分
      const scores = DIMS.map((dim, d) => {
        let v = st.base[d] + st.slope[d] * li + (rand() - 0.5) * 0.5;
        if (st.special) v = st.special(li, d, v);
        return Math.max(1, Math.min(5, Math.round(v)));
      });
      const needHome = scores[5] <= 2 || rand() < 0.3;
      const pick = (arr: string[]) => arr[(s + li) % arr.length];
      await query(
        `INSERT INTO reviews (artwork_id, student_id, lesson_id, teacher_id,
           composition, line_score, color, observation, creativity, focus,
           need_home_practice, home_practice_note, suggestion, next_prep, class_state)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [artworkId, studentId, lessonId, teacherIds[tUser],
         scores[0], scores[1], scores[2], scores[3], scores[4], scores[5],
         needHome, needHome ? pick(HOME_NOTES) : '', pick(SUGGESTIONS), pick(NEXT_PREPS), pick(CLASS_STATES)]);
      // 作业
      if (needHome) {
        const submitted = rand() >= st.homeworkSkipRate;
        await query(
          'INSERT INTO homework (student_id, lesson_id, assigned, submitted, note) VALUES ($1,$2,true,$3,$4)',
          [studentId, lessonId, submitted, submitted ? '' : '未提交']);
      }
    }
  }

  const sid = (name: string) => studentIds[STUDENTS.findIndex((s) => s.name === name)];

  // 家长提问与老师证据回复
  const q1 = await query(
    `INSERT INTO questions (student_id, parent_id, type, content, created_at) VALUES ($1,$2,'slow_progress',$3,'2026-08-28 20:12') RETURNING id`,
    [sid('陈小明'), parentIds[0], '老师好，小明学了快三个月了，感觉进步不明显，在家也不太愿意画，是不是没有这方面天赋？']);
  await query(
    `INSERT INTO replies (question_id, teacher_id, content, evidence_artwork_ids, evidence_tags, created_at)
     VALUES ($1,$2,$3,$4,$5,'2026-08-29 10:05')`,
    [q1.rows[0].id, teacherIds['teacher2'],
     '小明妈妈您好，我把小明6月底和8月底的两幅作品放在一起您可以看到：6月《我的早餐》主体偏小、线条犹豫，8月《未来城市》已经能主动安排三个以上物体的位置，线条也果断了很多。这个年龄段"进步"更多体现在构图意识和敢画程度上，而不是画得像不像。在家不愿画很常见，建议不布置任务式练习，改成他画您听的"讲画"游戏。下次课我会把他喜欢的汽车主题融进写生练习。',
     [artworkIds['陈小明'][1], artworkIds['陈小明'][artworkIds['陈小明'].length - 1]],
     ['构图稳定', '线条流畅', '进步明显']]);
  await query(`UPDATE questions SET status='answered' WHERE id=$1`, [q1.rows[0].id]);

  const q2 = await query(
    `INSERT INTO questions (student_id, parent_id, type, content, created_at) VALUES ($1,$2,'promotion',$3,'2026-08-25 21:40') RETURNING id`,
    [sid('苏晴'), parentIds[5], '赵老师，晴晴想升到素描进阶班，您看她的水平适合吗？我们担心跟不上。']);
  await query(
    `INSERT INTO replies (question_id, teacher_id, content, evidence_artwork_ids, evidence_tags, created_at)
     VALUES ($1,$2,$3,$4,$5,'2026-08-26 09:20')`,
    [q2.rows[0].id, teacherIds['teacher3'],
     '苏晴妈妈您好，从最近一个阶段的课堂作品看，她的结构素描和色彩静物都已经稳定达到提高班目标（附8月《色彩静物·水果》与6月《几何体》对比）。观察能力和画面完整度是班里最稳的，升班后前4周会有衔接课程，我认为适合升班。主管这边会在本周完成正式升班评估，结果会同步给您。',
     [artworkIds['苏晴'][3], artworkIds['苏晴'][0]],
     ['观察细致', '构图稳定', '进步明显']]);
  await query(`UPDATE questions SET status='answered' WHERE id=$1`, [q2.rows[0].id]);

  await query(
    `INSERT INTO questions (student_id, parent_id, type, content, created_at) VALUES ($1,$2,'not_good',$3,'2026-09-02 19:55')`,
    [sid('黄思远'), parentIds[4], '说实话这几个月的作品一张比一张不像样，钱花了看不到效果，你们这教学到底行不行？']);

  const q4 = await query(
    `INSERT INTO questions (student_id, parent_id, type, content, created_at) VALUES ($1,$2,'other',$3,'2026-08-15 12:30') RETURNING id`,
    [sid('林小雨'), parentIds[1], '小雨在家总想画画，我们家长不会教，在家应该怎么陪她练？']);
  await query(
    `INSERT INTO replies (question_id, teacher_id, content, evidence_artwork_ids, evidence_tags, created_at)
     VALUES ($1,$2,$3,$4,$5,'2026-08-15 18:02')`,
    [q4.rows[0].id, teacherIds['teacher'],
     '小雨爸爸您好，这个阶段不需要教技法，做到三点就好：1）固定一个画画角，纸笔随手可取；2）她画完请她"讲讲画里的故事"，您只听不评判像不像；3）每周挑一幅贴在墙上。小雨课堂上的色彩感觉和想象力都很突出（附《怪兽朋友》），家庭练习以保护兴趣为主。',
     [artworkIds['林小雨'][4]],
     ['创意突出', '色彩敏感']]);
  await query(`UPDATE questions SET status='answered' WHERE id=$1`, [q4.rows[0].id]);

  // 事件：换老师 / 请假补课 / 比赛 / 退费
  await query(
    `INSERT INTO events (student_id, type, title, detail, meta, created_by, created_at) VALUES
     ($1,'teacher_change','更换任课老师','原任课王老师暑期休假，自7月25日起由李岚老师接任，已完成2次交接课，孩子前2节课状态略有波动。',$2,$3,'2026-07-25 12:00')`,
    [sid('刘一诺'), JSON.stringify({ from: '王慧老师', to: '李岚老师' }), supId]);
  await query(
    `INSERT INTO events (student_id, type, title, detail, meta, created_by, created_at) VALUES
     ($1,'leave','请假：8月1日课程','家事请假1课时', '{}'::jsonb, $2, '2026-07-30 09:00'),
     ($1,'makeup','补课：8月5日','已补8月1日《光影小游戏》课程，计1课时', '{}'::jsonb, $2, '2026-08-05 18:00'),
     ($1,'leave','请假：8月15日课程','外出请假1课时', '{}'::jsonb, $2, '2026-08-13 09:00'),
     ($1,'makeup','补课：8月19日','已补8月15日《假如我变小》课程，计1课时', '{}'::jsonb, $2, '2026-08-19 18:00')`,
    [sid('刘一诺'), supId]);
  await query(
    `INSERT INTO events (student_id, type, title, detail, meta, created_by, created_at) VALUES
     ($1,'competition','参加"星光杯"少儿美术大赛','参赛作品《黄昏的街道》获少年组银奖，作品已归档。',$2,$3,'2026-08-20 15:00')`,
    [sid('张子涵'), JSON.stringify({ award: '银奖', work: '《黄昏的街道》' }), supId]);
  await query(
    `INSERT INTO events (student_id, type, title, detail, meta, created_by, created_at) VALUES
     ($1,'refund_request','家长提出退费','家长对近阶段作品效果不满意，要求退还剩余课时费，主管已介入沟通，处理中。',$2,$3,'2026-09-03 11:00')`,
    [sid('黄思远'), JSON.stringify({ remaining_hours: 40, status: '处理中' }), supId]);

  // 家长沟通记录（含风险等级）
  const comms: Array<[number, string, string, string, string]> = [
    [sid('黄思远'), '微信', '家长反馈"作品一张不如一张"，情绪激动，明确提到退费，已约面谈。', 'high', '2026-09-02 20:10'],
    [sid('黄思远'), '电话', '沟通孩子课堂状态：近4节课缺勤3次，家庭练习基本未做，建议先恢复到课率再谈效果。', 'medium', '2026-08-20 14:00'],
    [sid('刘一诺'), '电话', '换老师适应期沟通：孩子第7-8节课状态波动属正常，家长表示理解，继续观察。', 'medium', '2026-08-02 10:00'],
    [sid('陈小明'), '微信', '家长询问进度，已发送6月与8月作品对比图，家长回复"看出来了，谢谢老师"。', 'low', '2026-08-29 11:00'],
    [sid('苏晴'), '面谈', '家长沟通升班意向，孩子本人意愿强烈，已告知评估流程。', 'low', '2026-08-26 16:00'],
    [sid('张子涵'), '微信', '比赛获奖喜报已同步家长，家长感谢并咨询后续竞赛规划。', 'low', '2026-08-20 16:30'],
  ];
  for (const [studentId, channel, content, risk, at] of comms) {
    await query(
      'INSERT INTO communications (student_id, author_id, channel, content, risk_level, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [studentId, supId, channel, content, risk, at]);
  }

  // 续费建议（商业沟通，与教学证据分离展示）
  const renewals: Array<[number, string, string, string]> = [
    [sid('陈小明'), '孩子课时剩余不多且处于稳定上升期，建议续报秋季48课时包，老生享95折。', '秋季48课时包', '2026-09-01 10:00'],
    [sid('苏晴'), '如升班评估通过，建议升班后续报进阶班24课时，衔接素描系统课。', '进阶班24课时', '2026-08-30 10:00'],
    [sid('黄思远'), '建议续报年卡享8折优惠，锁定当前师资。', '年卡（96课时）', '2026-09-04 10:00'],
    [sid('张子涵'), '建议续报竞赛集训班12课时，备战年底市级比赛。', '竞赛集训12课时', '2026-09-05 10:00'],
  ];
  for (const [studentId, suggestion, pkg, at] of renewals) {
    await query(
      'INSERT INTO renewals (student_id, author_id, suggestion, package, created_at) VALUES ($1,$2,$3,$4,$5)',
      [studentId, supId, suggestion, pkg, at]);
  }

  // 升班评估示例（苏晴：升班）
  const goalComparison = DIMS.map((dim, i) => ({
    dimension: dim,
    avg: [4.1, 4.0, 4.0, 4.0, 4.0, 3.9][i],
    target: 4,
    met: true,
  }));
  await query(
    `INSERT INTO evaluations (student_id, supervisor_id, period, attendance_rate, homework_rate, teacher_summary, parent_cooperation, child_willingness, goal_comparison, decision, rationale, created_at)
     VALUES ($1,$2,'2026年暑期阶段',100.0,100.0,$3,'积极配合','积极',$4,'promote',$5,'2026-08-27 15:00')`,
    [sid('苏晴'), supId,
     '赵铭老师：苏晴本阶段全勤，六维能力均稳定达到提高班目标，结构素描与色彩静物完成度高，具备升入素描进阶班的能力基础。',
     JSON.stringify(goalComparison),
     '综合同龄段目标达成度（6/6项达标）、全勤出勤、作业全部完成、家长积极配合且孩子升班意愿强烈，建议升入素描进阶班，并配套前4周衔接课程。']);

  // ============ 比赛专项辅导 ============
  // 陈小明：辅导中的比赛（进度落后 1 项，供主管演示加课/换主题/放弃干预）
  const bLessons = lessonIds['基础B班']; // 索引10=第11课(08-29) ... 索引15=第16课(10-03)
  const comp1 = await query(
    `INSERT INTO competitions (student_id, name, theme, deadline, size_requirement, status, created_by, created_at)
     VALUES ($1,'第十二届「童画杯」全国少儿美术大赛','《家乡的桥》','2026-10-17','四开竖构图（389×546mm），水粉或综合材料','active',$2,'2026-08-20 10:00') RETURNING id`,
    [sid('陈小明'), supId]);
  const comp1Id = comp1.rows[0].id as number;
  const comp1Items = [
    { seq: 1, focus: '主题构思与素材：围绕「《家乡的桥》」收集素材、起2-3幅小稿', requirement: '扣题「《家乡的桥》」', lesson_id: bLessons[10], lesson_date: '2026-08-29' },
    { seq: 2, focus: '构图与尺寸适配：按「四开竖构图（389×546mm）」确定画面比例', requirement: '尺寸要求：四开竖构图（389×546mm）', lesson_id: bLessons[11], lesson_date: '2026-09-05' },
    { seq: 3, focus: '观察能力专项强化：桥体结构写生与细节刻画', requirement: '能力提升：观察能力', lesson_id: bLessons[12], lesson_date: '2026-09-12' },
    { seq: 4, focus: '构图专项强化：竖构图中的主次关系与留白', requirement: '能力提升：构图', lesson_id: bLessons[13], lesson_date: '2026-09-19' },
    { seq: 5, focus: '正稿制作：按比赛要求完成完整参赛作品', requirement: '完成参赛作品正稿', lesson_id: bLessons[14], lesson_date: '2026-09-26' },
    { seq: 6, focus: '修改完善与提交：对照比赛要求逐项检查，截止（2026-10-17）前完成提交', requirement: '按要求完成提交', lesson_id: bLessons[15], lesson_date: '2026-10-03' },
  ];
  await query(
    'INSERT INTO coaching_plans (competition_id, items, ability_snapshot) VALUES ($1,$2,$3)',
    [comp1Id, JSON.stringify(comp1Items),
     JSON.stringify({ avgs: { composition: 3.1, line_score: 3.4, color: 3.4, observation: 3.0, creativity: 3.2, focus: 3.1 }, weak: ['观察能力', '构图'] })]);
  for (const item of comp1Items) {
    await query('UPDATE lessons SET prep_focus=$1 WHERE id=$2', [item.focus, item.lesson_id]);
  }
  // 第11课点评标记服务比赛目标；第12课未标记 → 进度落后
  await query(
    `UPDATE reviews SET serves_competition=true, competition_req_note=$1
     WHERE student_id=$2 AND lesson_id=$3`,
    ['扣题「《家乡的桥》」：完成素材小稿2幅，确定以村口老石桥为画面主体', sid('陈小明'), bLessons[10]]);
  await query(
    `INSERT INTO events (student_id, type, title, detail, created_by, created_at) VALUES
     ($1,'competition','报名比赛并生成辅导计划','报名「童画杯」，主题《家乡的桥》，截止2026-10-17，已按当前能力标签（弱项：观察能力、构图）生成6阶段辅导计划并同步到后续课次目标。',$2,'2026-08-20 10:05')`,
    [sid('陈小明'), supId]);

  // 张子涵：已完赛的比赛（历史记录）
  const cLessons = lessonIds['提高C班'];
  const comp2 = await query(
    `INSERT INTO competitions (student_id, name, theme, deadline, size_requirement, status, created_by, created_at)
     VALUES ($1,'第九届「星光杯」少儿美术大赛','《黄昏的街道》','2026-08-18','四开（389×546mm），材料不限','completed',$2,'2026-07-01 10:00') RETURNING id`,
    [sid('张子涵'), supId]);
  const comp2Items = [
    { seq: 1, focus: '主题构思：黄昏光影素材收集与小稿', requirement: '扣题「《黄昏的街道》」', lesson_id: cLessons[6], lesson_date: '2026-08-01' },
    { seq: 2, focus: '正稿制作与提交', requirement: '完成参赛作品正稿并提交', lesson_id: cLessons[7], lesson_date: '2026-08-08' },
  ];
  await query(
    'INSERT INTO coaching_plans (competition_id, items, ability_snapshot) VALUES ($1,$2,$3)',
    [comp2.rows[0].id, JSON.stringify(comp2Items),
     JSON.stringify({ avgs: { composition: 3.8, line_score: 3.9, color: 3.8, observation: 3.8, creativity: 3.9, focus: 3.9 }, weak: ['色彩', '构图'] })]);
  await query(
    `UPDATE reviews SET serves_competition=true, competition_req_note=$1 WHERE student_id=$2 AND lesson_id=$3`,
    ['扣题「《黄昏的街道》」：完成3幅黄昏街景小稿并选定最终构图', sid('张子涵'), cLessons[6]]);
  await query(
    `UPDATE reviews SET serves_competition=true, competition_req_note=$1 WHERE student_id=$2 AND lesson_id=$3`,
    ['完成参赛作品正稿：按四开尺寸完成《黄昏的街道》水粉正稿', sid('张子涵'), cLessons[7]]);

  console.log('种子数据初始化完成');
}
