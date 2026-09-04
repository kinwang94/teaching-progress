'use strict';
/* 教學進度追蹤 —— 通用模板
 * 本檔案不含任何學校/教師/班別資料。所有「原定進度」與班別設定
 * 都在使用者自己的私有 Gist 裡（plan.json），啟動時透過 GitHub API 讀取。
 * 實際進度、備註另外存在 localStorage，並同步到另一個私有 Gist 的 progress.json。
 * 兩份 Gist 都只存在使用者自己帳號底下，這個公開 repo 裡看不到任何個人資料。
 */

// ---------- 常數 ----------
const LS_DATA = 'tp.data';
const LS_TOKEN = 'tp.token';
const LS_GIST = 'tp.gist';
const LS_PGIST = 'tp.pgist';
const LS_PLAN_CACHE = 'tp.plancache';
const LS_VIEW = 'tp.view';
const LS_CLASS = 'tp.class';
const GIST_FILE = 'progress.json';
const PLAN_FILE = 'plan.json';
const API = 'https://api.github.com';

const STATES = {
  done:   { label: '已上', cls: 'done',   sym: '\u2713', w: 1 },
  part:   { label: '部分', cls: 'part',   sym: '\u2013', w: 0.5 },
  cancel: { label: '停課', cls: 'cancel', sym: '\u2715', w: 0 },
  moved:  { label: '調課', cls: 'cancel', sym: '\u2192', w: 0 }   // 舊資料相容
};
const CYCLE = ['', 'done', 'part', 'cancel'];
const DOW = ['日', '一', '二', '三', '四', '五', '六'];

/* 沒有在 plan.json 指定顏色時的預設色盤（CVD 友善） */
const DEFAULT_PALETTE = ['#e34948', '#2a78d6', '#0F8F63', '#1baf7a', '#5FC9A0', '#4a3aa7', '#8577d6', '#C08A2E', '#7A6FA8', '#B23A6B'];
const colorOf = c => COLOR[c.id] || c.color || '#5C6B73';

function printClassOf(cid) {
  return PRINT_CLASSES.find(x => x.id === cid) || { id: cid, name: cid, color: '#5C6B73' };
}
function printCost(p) {
  const unit = (PRINT_RATE[p.color] || 0) * (p.sides === 'double' ? 2 : 1);
  return unit * (Number(p.sheets) || 0) * (Number(p.copies) || 0);
}

const TASK_RULES = [
  { re: /統測/,            type: 'test', tag: '統測' },
  { re: /考試/,            type: 'test', tag: '考試' },
  { re: /測驗/,            type: 'test', tag: '測驗' },
  { re: /堂課/,            type: 'quiz', tag: '堂課' },
  { re: /實驗/,            type: 'lab',  tag: '實驗' },
  { re: /工作紙/,          type: 'ws',   tag: '工作紙' },
  { re: /功課|作業|北大綠卡/, type: 'hw', tag: '功課' }
];

// ---------- 狀態 ----------
let DATA = { v: 1, updated: null, rec: {}, task: {}, over: {}, extra: {}, print: {} };
let view = localStorage.getItem(LS_VIEW) || 'today';
if (view === 'week' || view === 'class') view = 'cal';
let classFilter = localStorage.getItem(LS_CLASS) || 'all';
let weekOffset = 0;
let monthOffset = 0;
let calMode = localStorage.getItem('tp.calmode') || 'month';
let selDay = null;
let syncState = 'off';
let inlineOpen = false;
let prLast = { date: null, cid: null, color: 'bw', sides: 'single' };

// ---------- 工具 ----------
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dObj = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtMD = s => { const d = dObj(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const dowOf = s => DOW[dObj(s).getDay()];

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- 資料 ----------
function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_DATA);
    if (raw) {
      const d = JSON.parse(raw);
      DATA = Object.assign({ v: 1, updated: null, rec: {}, task: {}, over: {}, extra: {}, print: {} }, d);
      DATA.rec = DATA.rec || {}; DATA.task = DATA.task || {}; DATA.over = DATA.over || {}; DATA.extra = DATA.extra || {}; DATA.print = DATA.print || {};
    }
  } catch (e) { console.warn('本機資料讀取失敗', e); }
}
function saveLocal() {
  DATA.updated = new Date().toISOString();
  try { localStorage.setItem(LS_DATA, JSON.stringify(DATA)); } catch (e) { console.warn(e); }
}
function touch() { saveLocal(); render(); queueSync(); }

// ---------- 課節索引（等 plan.json 載入後才會有內容） ----------
let PLAN = null, CLASSES = [], byId = {};
let COLOR = {}, PRINT_CLASSES = [], CLASS_SIZE = {}, GROUPS = [], PRINT_RATE = { bw: 0, color: 0 };

function initPlan(p) {
  PLAN = p;
  CLASSES = PLAN.classes || [];
  byId = {};
  CLASSES.forEach(c => { c.lessons.forEach((l, i) => { l.cid = c.id; l.idx = i; byId[l.id] = l; }); });
  COLOR = Object.assign({}, PLAN.colors || {});
  CLASSES.forEach((c, ci) => { if (!COLOR[c.id]) COLOR[c.id] = c.color || DEFAULT_PALETTE[ci % DEFAULT_PALETTE.length]; });
  PRINT_CLASSES = PLAN.printClasses || CLASSES.map(c => ({ id: c.id, name: c.name, color: colorOf(c) }));
  CLASS_SIZE = PLAN.classSize || {};
  GROUPS = PLAN.groups || [];
  PRINT_RATE = PLAN.printRate || { bw: 0, color: 0 };
  loadExtras();
}
function loadPlanCache() {
  try {
    const raw = localStorage.getItem(LS_PLAN_CACHE);
    if (raw) { initPlan(JSON.parse(raw)); return true; }
  } catch (e) { console.warn('課程設定快取讀取失敗', e); }
  return false;
}
async function refreshPlan(silent) {
  const gid = localStorage.getItem(LS_PGIST);
  if (!gid || !localStorage.getItem(LS_TOKEN)) return;
  try {
    const g = await gh('/gists/' + gid);
    const f = g.files && g.files[PLAN_FILE];
    if (!f) { if (!silent) toast('這個 Gist 裡沒有 ' + PLAN_FILE); return; }
    const txt = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
    const p = JSON.parse(txt);
    localStorage.setItem(LS_PLAN_CACHE, JSON.stringify(p));
    initPlan(p);
    render();
    if (!silent) toast('課程設定已更新');
  } catch (e) {
    console.warn('課程設定讀取失敗', e);
    if (!silent) toast('課程設定讀取失敗：' + e.message);
  }
}

// ---------- 加開課節（不在原定課節表裡，使用者自己排的） ----------
function injectExtra(id, e) {
  if (byId[id]) return;
  const c = CLASSES.find(x => x.id === e.cid); if (!c) return;
  const l = { id, date: e.date, period: e.period || '', plan: e.plan || '', src: '加開', cid: e.cid };
  c.lessons.push(l);
  c.lessons.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.period || 'zz').localeCompare(b.period || 'zz'));
  byId[id] = l;
}
function loadExtras() {
  Object.keys(DATA.extra || {}).forEach(id => injectExtra(id, DATA.extra[id]));
}
function addExtraLesson(cid, date, period, plan) {
  const id = 'extra-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  DATA.extra[id] = { cid, date, period: period || '', plan };
  injectExtra(id, DATA.extra[id]);
  touch();
  return id;
}
function removeExtraLesson(id) {
  const l = byId[id]; if (!l) return;
  const c = CLASSES.find(x => x.id === l.cid);
  if (c) c.lessons = c.lessons.filter(x => x.id !== id);
  delete byId[id];
  delete DATA.extra[id];
  delete DATA.rec[id];
  delete DATA.over[id];
  touch();
}

// ---------- 代印工作紙 ----------
function addPrint(p) {
  const id = 'pr-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  DATA.print[id] = p;
  touch();
  return id;
}
function removePrint(id) { delete DATA.print[id]; touch(); }
function addPrintFromForm() {
  const cid = $('prCid').value, date = $('prDate').value || todayISO(), name = $('prName').value.trim();
  const sheets = Math.max(1, Number($('prSheets').value) || 1), copies = Math.max(1, Number($('prCopies').value) || 1);
  const color = $('prColor').value, sides = $('prSides').value, note = $('prNote').value.trim();
  if (!name) { toast('請填「印了什麼」'); $('prName').focus(); return; }
  addPrint({ cid, date, name, sheets, copies, color, sides, note: note || undefined });
  prLast = { date, cid, color, sides };
  toast('已加入');
  if ($('prName')) $('prName').focus();
}

function activeClasses() {
  if (classFilter === 'all') return CLASSES;
  const g = GROUPS.find(x => x.id === classFilter);
  if (g) return CLASSES.filter(c => g.ids.includes(c.id));
  return CLASSES.filter(c => c.id === classFilter);
}
function classOptions() {
  return `<option value="all"${classFilter === 'all' ? ' selected' : ''}>全部班別</option>`
    + GROUPS.map(g => `<option value="${g.id}"${classFilter === g.id ? ' selected' : ''}>${esc(g.name)}</option>`).join('')
    + CLASSES.map(c => `<option value="${c.id}"${classFilter === c.id ? ' selected' : ''}>　${esc(c.name)}</option>`).join('');
}
/* 從一組班名中抽出各自的辨識部分（去掉共同前綴／後綴），
   例如「初一甲 代數／初一甲 幾何」→「代數／幾何」，「初二丙 物理／初二丁 物理」→「丙／丁」 */
function shortLabels(names) {
  if (names.length <= 1) return names.slice();
  let pre = names[0];
  names.forEach(n => { while (pre && !n.startsWith(pre)) pre = pre.slice(0, -1); });
  let suf = names[0];
  names.forEach(n => { while (suf && !n.endsWith(suf)) suf = suf.slice(1); });
  if (pre.length + suf.length >= Math.min(...names.map(n => n.length))) return names.slice();
  return names.map(n => n.slice(pre.length, n.length - suf.length).trim() || n);
}
function classTabs() {
  let h = `<div class="foldertabs">
    <button class="ftab" data-class="all" aria-pressed="${classFilter === 'all'}">總</button>`;
  GROUPS.forEach(g => {
    const names = shortLabels(g.ids.map(cid => (CLASSES.find(x => x.id === cid) || {}).name || cid));
    h += `<span class="fdiv"></span>
      <button class="ftab grpmain" data-class="${g.id}" title="${esc(g.name)}" aria-pressed="${classFilter === g.id}">${esc(g.short || g.name)}</button>`;
    g.ids.forEach((cid, i) => {
      const c = CLASSES.find(x => x.id === cid); if (!c) return;
      h += `<button class="ftab grpsub" data-class="${c.id}" style="--c:${colorOf(c)}" title="${esc(c.name)}" aria-pressed="${classFilter === c.id}">${esc(names[i])}</button>`;
    });
  });
  h += `</div>`;
  return h;
}
function statsOf(list) {
  const t = todayISO();
  let due = 0, done = 0, total = 0, lastDone = null, nextUp = null;
  const all = [];
  list.forEach(c => c.lessons.forEach(l => all.push(l)));
  all.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  all.forEach(l => {
    const r = recOf(l); const st = r && r.s;
    if (st === 'cancel' || st === 'moved') return;
    total++;
    if (l.date <= t) due++;
    if (st && STATES[st]) done += STATES[st].w;
    if (st === 'done' || st === 'part') lastDone = l;
    if (!st && !nextUp && l.date >= t) nextUp = l;
  });
  const off = Math.round((done - due) * 10) / 10;
  return { due, done, total, off, lastDone, nextUp, pct: total ? Math.round(done / total * 100) : 0 };
}

function planOf(l) { return (DATA.over[l.id] != null && DATA.over[l.id] !== '') ? DATA.over[l.id] : l.plan; }
function recOf(l) { return DATA.rec[l.id] || null; }

function tasksOfLesson(l) {
  const out = [];
  const lines = planOf(l).split('\n').map(s => s.trim()).filter(Boolean);
  lines.forEach(line => {
    for (const r of TASK_RULES) {
      if (r.re.test(line)) { out.push({ id: l.id + '#' + hashStr(r.type + ':' + line), text: line, type: r.type, tag: r.tag, date: l.date, cid: l.cid }); break; }
    }
  });
  return out;
}
function allTasks() {
  const out = [];
  CLASSES.forEach(c => c.lessons.forEach(l => out.push(...tasksOfLesson(l))));
  out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return out;
}

// ---------- 進度計算 ----------
function stats(c) { return statsOf([c]); }
function offPill(off) {
  if (off <= -0.5) return `<span class="pill behind">落後 ${Math.abs(off)} 節</span>`;
  if (off >= 0.5) return `<span class="pill ahead">領先 ${off} 節</span>`;
  return `<span class="pill on">如期</span>`;
}

// ---------- 週 ----------
function weekRange(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;              // 週一 = 0
  d.setDate(d.getDate() - dow + offset * 7);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(d); x.setDate(d.getDate() + i);
    days.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`);
  }
  return days;
}

// ---------- 繪製零件 ----------
function tagsFor(l) {
  const out = [];
  if (l.src === '集備表推算') out.push('<span class="tag est">推算・可改</span>');
  else if (l.src === '排課板') out.push('<span class="tag">排課板</span>');
  else if (l.src === '測驗安排') out.push('<span class="tag test">測驗日</span>');
  else if (l.src === '待定') out.push('<span class="tag est">待定</span>');
  else if (l.src === '加開') out.push('<span class="tag">加開</span>');
  if (DATA.over[l.id]) out.push('<span class="tag">原定已改</span>');
  tasksOfLesson(l).forEach(t => {
    const cls = t.type === 'test' || t.type === 'quiz' ? 'test' : 'hw';
    out.push(`<span class="tag ${cls}">${esc(t.tag)}</span>`);
  });
  return out.length ? `<div class="tags">${out.join('')}</div>` : '';
}

function lessonRow(l, opts) {
  opts = opts || {};
  const c = CLASSES.find(x => x.id === l.cid);
  const r = recOf(l);
  const st = r && r.s && STATES[r.s] ? STATES[r.s] : null;
  const isToday = l.date === todayISO();
  const meta = (opts.showDate === false && l.period)
    ? `<b>${esc(l.period)}</b>${esc(l.time || '')}`
    : `<b>${fmtMD(l.date)}</b>${dowOf(l.date)}${l.period ? '<br>' + esc(l.period) : ''}`;
  return `<div class="lesson${isToday ? ' today' : ''}" data-lid="${l.id}">
    <span class="lmark" style="background:${colorOf(c)}"></span>
    <div class="lmeta">${meta}</div>
    <div class="lbody">
      ${opts.showClass ? `<div class="tdate" style="margin-bottom:2px">${esc(c.name)}</div>` : ''}
      <div class="ltitle">${esc(planOf(l)) || '<span style="color:#8B979D">（未定內容）</span>'}</div>
      ${r && r.a ? `<div class="lactual">實際：${esc(r.a)}</div>` : ''}
      ${r && r.n ? `<div class="lnote">備註：${esc(r.n)}</div>` : ''}
      ${tagsFor(l)}
    </div>
    <div class="lact">
      <button class="st${st ? ' ' + st.cls : ''}" data-quick="${l.id}">${st ? st.label : '記錄'}</button>
      <button class="edit" data-edit="${l.id}">編輯</button>
    </div>
  </div>`;
}

// ---------- 視圖 ----------
function vToday() {
  const t = todayISO();
  const rows = [];
  CLASSES.forEach(c => c.lessons.filter(l => l.date === t).forEach(l => rows.push(l)));
  rows.sort((a, b) => (a.period || '').localeCompare(b.period || ''));

  const soon = [];
  CLASSES.forEach(c => {
    const s = stats(c);
    if (s.nextUp && s.nextUp.date > t) soon.push({ c, l: s.nextUp });
  });
  soon.sort((a, b) => a.l.date < b.l.date ? -1 : 1);

  const pend = [];
  CLASSES.forEach(c => c.lessons.forEach(l => {
    if (l.date < t && !recOf(l)) pend.push(l);
  }));
  pend.sort((a, b) => a.date < b.date ? 1 : -1);

  let h = `<h2 class="sec">今日 ${fmtMD(t)}（星期${dowOf(t)}）${PLAN.calendar[t] ? '　· ' + esc(PLAN.calendar[t].join('、')) : ''}</h2>`;
  h += rows.length
    ? `<div class="card">${rows.map(l => lessonRow(l, { showClass: true, showDate: false })).join('')}</div>`
    : `<div class="empty">今日沒有排課</div>`;

  if (pend.length) {
    h += `<h2 class="sec">未記錄的過去課節（${pend.length}）</h2>
      <div class="card">${pend.slice(0, 12).map(l => lessonRow(l, { showClass: true })).join('')}</div>`;
    if (pend.length > 12) h += `<p class="hintx">還有 ${pend.length - 12} 節未記錄，可到「月曆」切到各班逐日補。</p>`;
  }

  if (soon.length) {
    h += `<h2 class="sec">各班下一節</h2><div class="card">
      ${soon.map(x => lessonRow(x.l, { showClass: true })).join('')}</div>`;
  }
  return h;
}

function monthGrid(base) {
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));          // 由星期一開始
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const x = new Date(start); x.setDate(start.getDate() + i);
    cells.push(x);
    if (i >= 34 && x.getMonth() !== base.getMonth() && x.getDay() === 0) break;
  }
  return cells;
}
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function lessonsOn(dt) {
  const out = [];
  activeClasses().forEach(c => {
    c.lessons.filter(l => l.date === dt).forEach(l => out.push(l));
  });
  out.sort((a, b) => (a.period || 'zz').localeCompare(b.period || 'zz'));
  return out;
}

function stateBtns(l) {
  const r = recOf(l); const st = r && r.s;
  return `<span class="stg">
    ${['done', 'part', 'cancel'].map(k => `<button class="sb sb-${k}${st === k ? ' on' : ''}" data-setid="${l.id}" data-sets="${k}" title="${STATES[k].label}">${STATES[k].sym}</button>`).join('')}
  </span>`;
}

function cellLesson(l) {
  const c = CLASSES.find(x => x.id === l.cid);
  const r = recOf(l) || {};
  const st = r.s && STATES[r.s] ? r.s : '';
  const miss = !st && l.date < todayISO();
  const short = c.name;
  const act = r.a || '';
  return `<div class="lz st-${st}${miss ? ' lz-miss' : ''}" style="--c:${colorOf(c)}">
    <div class="lz-h">
      <span class="nm">${esc(short)}</span>
      ${l.period ? `<span class="pd">${esc(l.period)}</span>` : ''}
      ${stateBtns(l)}
    </div>
    <div class="lz-p" data-inl="p" data-lid="${l.id}" title="雙擊修改原定內容">${esc(planOf(l)) || '（未定）'}</div>
    <div class="lz-a${act ? '' : ' ph'}" data-inl="a" data-lid="${l.id}" title="雙擊輸入實際進度">${act ? esc(act) : '＋'}</div>
    ${r.n ? `<div class="lz-a" data-inl="n" data-lid="${l.id}" style="color:#8A6A1E">${esc(r.n)}</div>` : ''}
  </div>`;
}

function vCal() {
  if (calMode === 'week') return vWeekList();
  const base = new Date();
  base.setDate(1); base.setMonth(base.getMonth() + monthOffset);
  const cells = monthGrid(base);
  const t = todayISO();

  let h = `<div class="calbar">
    <button class="chip" data-mo="-1">←</button>
    <span class="mlab">${base.getFullYear()} 年 ${base.getMonth() + 1} 月</span>
    <button class="chip" data-mo="1">→</button>
    <button class="chip" data-mo="0">本月</button>
    <span style="flex:1"></span>
    <span class="seg"><button class="chip" data-cm="month" aria-pressed="true">月</button><button class="chip" data-cm="week" aria-pressed="false">週</button></span>
  </div>`;
  h += classTabs();

  h += `<div class="calwrap"><div class="cal">${['一', '二', '三', '四', '五', '六', '日'].map(d => `<div class="dowh">${d}</div>`).join('')}`;
  cells.forEach(x => {
    const dt = isoOf(x);
    const out = x.getMonth() !== base.getMonth();
    const ls = lessonsOn(dt);
    const ev = PLAN.calendar[dt];
    const wk = PLAN.weeks && PLAN.weeks[dt];
    h += `<div class="day${out ? ' out' : ''}${dt === t ? ' today' : ''}${dt === selDay ? ' sel' : ''}">
      <div class="dnum" data-day="${dt}"><b>${x.getDate()}</b>${dt === t ? '今日' : ''}${wk ? `<span class="wk">第${wk[1]}週</span>` : ''}</div>
      ${ev ? `<div class="ev" title="${esc(ev.join('、'))}">${esc(ev.join('、'))}</div>` : ''}
      ${ls.map(cellLesson).join('')}
      <button class="addlz" data-addday="${dt}" title="加開課節">＋加課</button>
    </div>`;
  });
  h += `</div></div>`;

  h += `<div class="legend">
    <span><em>✓</em>已上</span><span><em>–</em>部分</span><span><em style="color:var(--bad)">✕</em>停課</span>
    <span><i style="background:#FBEBD3"></i>過期未記錄</span>
    <span class="sep"></span>
    ${CLASSES.map(c => `<span><i style="background:${colorOf(c)}"></i>${esc(c.name)}</span>`).join('')}
  </div>
  <p class="hintx">雙擊上半格改原定內容，雙擊下半格記實際進度（Enter 儲存、Esc 取消）。右上角 ✓／–／✕ 按一下直接設定，再按一下清除。按日期數字展開該日全部課節。</p>`;

  const day = selDay;
  if (day) {
    const ls = lessonsOn(day);
    h += `<h2 class="sec">${fmtMD(day)}　星期${dowOf(day)}${PLAN.calendar[day] ? '　<span class="tag">' + esc(PLAN.calendar[day].join('、')) + '</span>' : ''}
      <button class="chip" data-addday="${day}" style="float:right;font-weight:400">＋加開課節</button></h2>`;
    h += ls.length ? `<div class="card">${ls.map(l => lessonRow(l, { showClass: true, showDate: false })).join('')}</div>`
      : `<div class="empty">這一日沒有排課</div>`;
  }
  return h;
}

function vWeekList() {
  const days = weekRange(weekOffset);
  let h = `<div class="calbar">
    <button class="chip" data-wk="-1">←</button>
    <span class="mlab">${fmtMD(days[0])} – ${fmtMD(days[6])}</span>
    <button class="chip" data-wk="1">→</button>
    <button class="chip" data-wk="0">本週</button>
    <span style="flex:1"></span>
    <span class="seg"><button class="chip" data-cm="month" aria-pressed="false">月</button><button class="chip" data-cm="week" aria-pressed="true">週</button></span>
  </div>`;
  h += classTabs();
  days.forEach(dt => {
    const rows = lessonsOn(dt);
    const ev = PLAN.calendar[dt];
    h += `<h2 class="sec">${fmtMD(dt)}　星期${dowOf(dt)}${ev ? `　<span class="tag">${esc(ev.join('、'))}</span>` : ''}${dt === todayISO() ? '　<span class="pill on">今日</span>' : ''}
      <button class="chip" data-addday="${dt}" style="float:right;font-weight:400">＋加開課節</button></h2>`;
    h += rows.length
      ? `<div class="card">${rows.map(l => lessonRow(l, { showClass: true, showDate: false })).join('')}</div>`
      : `<div class="empty">沒有排課</div>`;
  });
  return h;
}

function vTodo() {
  const t = todayISO();
  const okIds = new Set(activeClasses().map(c => c.id));
  const items = allTasks().filter(x => okIds.has(x.cid));
  const groups = [
    { k: 'over', title: '逾期未完成', f: x => x.date < t && !(DATA.task[x.id] || {}).done },
    { k: 'soon', title: '未來三十天', f: x => x.date >= t && dObj(x.date) - dObj(t) <= 30 * 864e5 && !(DATA.task[x.id] || {}).done },
    { k: 'later', title: '之後', f: x => x.date >= t && dObj(x.date) - dObj(t) > 30 * 864e5 && !(DATA.task[x.id] || {}).done },
    { k: 'done', title: '已完成', f: x => (DATA.task[x.id] || {}).done }
  ];
  let h = `<div class="bar2">
    <select id="selClass">${classOptions()}</select></div>`;
  groups.forEach(g => {
    const rows = items.filter(g.f);
    if (!rows.length) return;
    if (g.k === 'later' && rows.length > 40) rows.length = 40;
    h += `<h2 class="sec">${g.title}（${items.filter(g.f).length}）</h2><div class="card">`;
    h += rows.map(x => {
      const st = DATA.task[x.id] || {};
      const c = CLASSES.find(y => y.id === x.cid);
      return `<div class="todo${st.done ? ' done' : ''}">
        <input type="checkbox" data-task="${x.id}"${st.done ? ' checked' : ''}>
        <div class="tmain">
          <div>${esc(x.text)}</div>
          <div class="tdate"><span class="cdot" style="display:inline-block;background:${colorOf(c)}"></span>
            ${esc(c.name)}　${fmtMD(x.date)}（${dowOf(x.date)}）</div>
          ${st.n ? `<div class="lnote">${esc(st.n)}</div>` : ''}
        </div>
        <button class="edit" data-tnote="${x.id}">備註</button>
      </div>`;
    }).join('');
    h += `</div>`;
  });
  if (!items.length) h += `<div class="empty">沒有項目</div>`;
  return h;
}

function vPrint() {
  const list = Object.keys(DATA.print).map(id => Object.assign({ id }, DATA.print[id]));
  list.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

  const prDate = prLast.date || todayISO();
  const prCid0 = prLast.cid || PRINT_CLASSES[0].id;
  let h = `<p class="hintx" style="margin-top:0">像 Excel 一樣一列一列填，Tab 從左到右換欄，Enter 直接加入這筆——新的一筆會出現在下面第一列。</p>
  <div class="calwrap" style="margin-bottom:14px"><table class="pr-tbl"><thead><tr>
    <th>日期</th><th>班別</th><th>印了什麼</th><th class="n">張數</th><th class="n">份數</th><th>顏色</th><th>單／雙面</th><th>備註</th><th class="n">金額</th><th></th>
  </tr></thead><tbody>
    <tr class="pr-new">
      <td><input type="date" id="prDate" value="${prDate}"></td>
      <td><select id="prCid">${PRINT_CLASSES.map(c => `<option value="${c.id}"${c.id === prCid0 ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></td>
      <td><input type="text" id="prName" placeholder="例如：3.2 工作紙"></td>
      <td class="n"><input type="number" id="prSheets" min="1" value="1"></td>
      <td class="n"><input type="number" id="prCopies" min="1" value="${CLASS_SIZE[prCid0] || 1}"></td>
      <td><select id="prColor">
        <option value="bw"${prLast.color === 'bw' ? ' selected' : ''}>黑白</option>
        <option value="color"${prLast.color === 'color' ? ' selected' : ''}>彩色</option>
      </select></td>
      <td><select id="prSides">
        <option value="single"${prLast.sides === 'single' ? ' selected' : ''}>單面</option>
        <option value="double"${prLast.sides === 'double' ? ' selected' : ''}>雙面</option>
      </select></td>
      <td><input type="text" id="prNote" placeholder="可留空"></td>
      <td class="n">—</td><td></td>
      <td><button class="btn" id="prAdd" style="padding:6px 12px;white-space:nowrap">加入</button></td>
    </tr>`;
  list.forEach(p => {
    const c = printClassOf(p.cid);
    const cost = printCost(p);
    h += `<tr>
      <td>${fmtMD(p.date)}</td>
      <td><span class="cdot" style="display:inline-block;background:${c.color}"></span>${esc(c.name)}</td>
      <td>${esc(p.name || '（未寫內容）')}</td>
      <td class="n">${p.sheets}</td>
      <td class="n">${p.copies}</td>
      <td>${p.color === 'color' ? '彩色' : '黑白'}</td>
      <td>${p.sides === 'double' ? '雙面' : '單面'}</td>
      <td>${esc(p.note || '')}</td>
      <td class="n">$${cost.toFixed(2)}</td>
      <td><button class="edit" data-prdel="${p.id}">刪除</button></td>
    </tr>`;
  });
  h += `</tbody></table></div>`;

  const totals = {};
  let grandTotal = 0;
  list.forEach(p => {
    const cost = printCost(p);
    const cid = printClassOf(p.cid).id;
    totals[cid] = (totals[cid] || 0) + cost;
    grandTotal += cost;
  });
  h += `<h2 class="sec">各班應收（學期末跟催用）　<button class="chip" id="expPrint" style="font-weight:400">匯出 CSV</button></h2><div class="card" style="padding:6px 10px 10px">
    <table class="cmp"><thead><tr><th>班別</th><th class="n">應收</th></tr></thead><tbody>`;
  PRINT_CLASSES.forEach(c => {
    const t = totals[c.id] || 0;
    if (!t) return;
    h += `<tr>
      <td><span class="cdot" style="display:inline-block;background:${c.color}"></span> ${esc(c.name)}</td>
      <td class="n">$${t.toFixed(2)}</td>
    </tr>`;
  });
  h += `<tr style="font-weight:600"><td>合計</td><td class="n">$${grandTotal.toFixed(2)}</td></tr>`;
  h += `</tbody></table></div>`;
  return h;
}

function vOverview() {
  const t = todayISO();
  let totDue = 0, totDone = 0, totAll = 0;
  const rows = CLASSES.map(c => { const s = stats(c); totDue += s.due; totDone += s.done; totAll += s.total; return { c, s }; });
  const overdueTasks = allTasks().filter(x => x.date < t && !(DATA.task[x.id] || {}).done).length;
  const worst = rows.slice().sort((a, b) => a.s.off - b.s.off)[0];

  let h = `<div class="grid">
    <div class="kpi"><h3>全年完成度</h3><div class="num">${totAll ? Math.round(totDone / totAll * 100) : 0}%</div>
      <div class="sub">全年 ${totAll} 節，已記錄 ${totDone} 節</div></div>
    <div class="kpi"><h3>對比原定</h3><div class="num">${Math.round((totDone - totDue) * 10) / 10}</div>
      <div class="sub">應上 ${totDue} 節　${(totDone - totDue) < 0 ? '合計落後' : '合計領先'}</div></div>
    <div class="kpi"><h3>逾期未完成事項</h3><div class="num" style="color:${overdueTasks ? 'var(--bad)' : 'var(--ok)'}">${overdueTasks}</div>
      <div class="sub">測驗、堂課、功課、工作紙、實驗</div></div>
    <div class="kpi"><h3>最需要追的班</h3><div class="num" style="font-size:20px">${worst ? esc(worst.c.name) : '—'}</div>
      <div class="sub">${worst ? offPill(worst.s.off) : ''}</div></div>
  </div>`;

  h += `<h2 class="sec">跨班對照</h2><div class="card" style="padding:6px 10px 10px">
    <table class="cmp"><thead><tr>
      <th>班別</th><th class="n">已上</th><th class="n">應上</th><th class="n">差</th><th style="width:34%">完成度</th><th>目前進度</th>
    </tr></thead><tbody>`;
  GROUPS.forEach(g => {
    const gs = statsOf(CLASSES.filter(c => g.ids.includes(c.id)));
    h += `<tr style="background:#FAFBFB">
      <td style="font-weight:600">${esc(g.name)}</td>
      <td class="n">${gs.done}</td><td class="n">${gs.due}</td>
      <td class="n" style="color:${gs.off < -0.4 ? 'var(--bad)' : gs.off > 0.4 ? 'var(--ok)' : 'var(--soft)'}">${gs.off > 0 ? '+' : ''}${gs.off}</td>
      <td><div class="bar"><i style="width:${gs.pct}%;background:var(--ink)"></i></div>
        <span class="tdate">${gs.pct}%　${gs.total} 節</span></td>
      <td style="font-size:13px">${gs.lastDone ? esc(planOf(gs.lastDone).split('\n')[0]) : '<span style="color:#8B979D">—</span>'}</td>
    </tr>`;
  });
  rows.forEach(({ c, s }) => {
    h += `<tr>
      <td><span class="cdot" style="display:inline-block;background:${colorOf(c)}"></span> ${esc(c.name)}</td>
      <td class="n">${s.done}</td><td class="n">${s.due}</td>
      <td class="n" style="color:${s.off < -0.4 ? 'var(--bad)' : s.off > 0.4 ? 'var(--ok)' : 'var(--soft)'}">${s.off > 0 ? '+' : ''}${s.off}</td>
      <td><div class="bar"><i style="width:${s.pct}%;background:${colorOf(c)}"></i></div>
        <span class="tdate">${s.pct}%　${s.total} 節</span></td>
      <td style="font-size:13px">${s.lastDone ? esc(planOf(s.lastDone).split('\n')[0]) : '<span style="color:#8B979D">—</span>'}</td>
    </tr>`;
  });
  h += `</tbody></table></div>`;

  h += `<h2 class="sec">資料</h2><div class="card" style="padding:14px">
    <div class="bar2" style="margin:0">
      <button class="chip" id="expCsv">匯出 CSV</button>
      <button class="chip" id="expJson">匯出 JSON 備份</button>
      <button class="chip" id="impJson">匯入 JSON</button>
    </div>
    <p class="hintx">原定進度版本 ${esc(PLAN.version)}（產生於 ${esc(PLAN.generated)}）。原定內容改了要整批更新時，把新的課節表給 Claude，叫它更新你的課程設定 Gist 就好，實際記錄不會動到。</p>
  </div>`;
  return h;
}

// ---------- 主繪製 ----------
function render() {
  document.querySelectorAll('#nav button').forEach(b => b.setAttribute('aria-selected', b.dataset.v === view));
  if (inlineOpen) { updateSyncUI(); return; }
  const m = $('view');
  if (!PLAN) { m.innerHTML = vSetup(); updateSyncUI(); return; }
  m.innerHTML = view === 'today' ? vToday()
    : view === 'cal' ? vCal()
      : view === 'todo' ? vTodo()
        : view === 'print' ? vPrint()
          : vOverview();
  updateSyncUI();
  const bs = $('brandSub');
  if (bs) bs.textContent = `${PLAN.year || ''}　${PLAN.school || ''}　${PLAN.teacher || ''}`.trim();
}
function vSetup() {
  return `<div class="card" style="padding:20px">
    <h2 style="margin:0 0 10px">還沒有課程設定</h2>
    <p class="hintx" style="margin-top:0">這個 app 不含任何課表資料——你自己的班別、課節表都存在你自己的私有 Gist 裡，第一次用需要設定一次。</p>
    <ol class="steps hintx" style="font-size:13.5px">
      <li>按右上角「設定」，貼上有 <code>gist</code> 權限的 GitHub Token</li>
      <li>如果你已經有課程設定 Gist，把它的 ID 貼進「課程設定 Gist ID」欄位</li>
      <li>還沒有的話，把課節表（Excel/PDF/課表照片）給 Claude，請它照 <code>SETUP_PROMPT.md</code> 幫你產生並建立 Gist</li>
    </ol>
    <div class="mfoot"><button class="btn" id="btnSetGo">開啟設定</button></div>
  </div>`;
}

// ---------- 編輯 ----------
function openLesson(id) {
  const l = byId[id]; if (!l) return;
  const c = CLASSES.find(x => x.id === l.cid);
  const r = recOf(l) || {};
  $('modal').innerHTML = `
    <h3>${esc(c.name)}　${fmtMD(l.date)}（${dowOf(l.date)}）${l.period ? '　' + esc(l.period) : ''}</h3>
    <div class="ref">原定：${esc(l.plan) || '（未定）'}${l.src ? `\n來源：${esc(l.src)}` : ''}</div>
    <label class="f">狀態</label>
    <div class="states" id="stRow">
      ${['done', 'part', 'cancel'].map(k => `<button data-s="${k}" aria-pressed="${r.s === k}">${STATES[k].sym}　${STATES[k].label}</button>`).join('')}
      <button data-s="" aria-pressed="${!r.s}">清除</button>
    </div>
    <label class="f">實際教到哪裡</label>
    <textarea id="fA" placeholder="例如：只講到 1.2，例題 3 未做">${esc(r.a || '')}</textarea>
    <label class="f">備註（學生反應、要補的、下次注意）</label>
    <textarea id="fN" placeholder="例如：丙班對數軸還很生，下節先補 5 分鐘">${esc(r.n || '')}</textarea>
    <label class="f">修改原定內容（改了會蓋過課節表，留空即還原）</label>
    <textarea id="fO" placeholder="${esc(l.plan)}">${esc(DATA.over[l.id] || '')}</textarea>
    <div class="mfoot">
      <button class="btn ghost" id="mCancel">取消</button>
      <button class="btn" id="mSave">儲存</button>
    </div>
    ${l.src === '加開' ? `<div class="mfoot"><button class="btn danger" id="mDel">刪除本節（加開的課節）</button></div>` : ''}`;
  let pick = r.s || '';
  $('stRow').onclick = e => {
    const b = e.target.closest('button[data-s]'); if (!b) return;
    pick = b.dataset.s;
    $('stRow').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.s === pick));
  };
  $('mCancel').onclick = closeModal;
  $('mSave').onclick = () => {
    const a = $('fA').value.trim(), n = $('fN').value.trim(), o = $('fO').value.trim();
    if (!pick && !a && !n) delete DATA.rec[l.id];
    else DATA.rec[l.id] = { s: pick || undefined, a: a || undefined, n: n || undefined };
    if (o) DATA.over[l.id] = o; else delete DATA.over[l.id];
    closeModal(); touch(); toast('已儲存');
  };
  if ($('mDel')) $('mDel').onclick = () => { closeModal(); removeExtraLesson(l.id); toast('已刪除'); };
  openModal();
}

function openAddLesson(date) {
  $('modal').innerHTML = `
    <h3>加開課節　${fmtMD(date)}（星期${dowOf(date)}）</h3>
    <label class="f">班別</label>
    <select id="naCid">${CLASSES.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
    <label class="f">節次（例如：第3節，可留空）</label>
    <input type="text" id="naPeriod" placeholder="例如：第3節">
    <label class="f">內容</label>
    <textarea id="naPlan" placeholder="這節課要教什麼"></textarea>
    <div class="mfoot">
      <button class="btn ghost" id="mCancel">取消</button>
      <button class="btn" id="mSave">加入</button>
    </div>`;
  $('mCancel').onclick = closeModal;
  $('mSave').onclick = () => {
    const cid = $('naCid').value, period = $('naPeriod').value.trim(), plan = $('naPlan').value.trim();
    if (!plan) { toast('請輸入內容'); return; }
    selDay = date;
    addExtraLesson(cid, date, period, plan);
    closeModal(); toast('已加入');
  };
  openModal();
}

function openTaskNote(tid) {
  const st = DATA.task[tid] || {};
  const text = (allTasks().find(x => x.id === tid) || {}).text || '';
  $('modal').innerHTML = `<h3>事項備註</h3><div class="ref">${esc(text)}</div>
    <label class="f">備註</label><textarea id="tN">${esc(st.n || '')}</textarea>
    <div class="mfoot"><button class="btn ghost" id="mCancel">取消</button><button class="btn" id="mSave">儲存</button></div>`;
  $('mCancel').onclick = closeModal;
  $('mSave').onclick = () => {
    const n = $('tN').value.trim();
    DATA.task[tid] = Object.assign({}, DATA.task[tid], { n: n || undefined });
    if (!DATA.task[tid].done && !n) delete DATA.task[tid];
    closeModal(); touch();
  };
  openModal();
}

function openSettings() {
  const tok = localStorage.getItem(LS_TOKEN) || '';
  const gid = localStorage.getItem(LS_GIST) || '';
  const pgid = localStorage.getItem(LS_PGIST) || '';
  $('modal').innerHTML = `<h3>設定</h3>
    <p class="hintx" style="margin-top:2px">這個 app 不含任何課表資料。班別、課節表存在你自己的「課程設定」私有 Gist；
    你上課記的實際進度存在另一個「進度記錄」私有 Gist。兩個 Gist 用同一組 Token。</p>
    <label class="f">GitHub Token（需要 gist 權限）</label>
    <input type="password" id="sTok" value="${esc(tok)}" placeholder="ghp_… 或 github_pat_…" autocomplete="off">
    <label class="f">課程設定 Gist ID（班別、課節表——沒有的話請 Claude 依 SETUP_PROMPT.md 幫你建立）</label>
    <input type="text" id="sPgid" value="${esc(pgid)}" placeholder="貼你的課程設定 Gist ID" autocomplete="off">
    <label class="f">進度記錄 Gist ID（留空會自動建立一個私有 Gist）</label>
    <input type="text" id="sGid" value="${esc(gid)}" placeholder="留空即自動建立" autocomplete="off">
    <div class="mfoot">
      <button class="btn ghost" id="mCancel">取消</button>
      <button class="btn" id="mSave">儲存並同步</button>
    </div>
    <div class="mfoot"><button class="btn danger" id="mClear">清除連線設定</button></div>
    <h3 style="margin-top:22px">怎樣拿 Token</h3>
    <ol class="steps hintx" style="font-size:13px">
      <li>GitHub → Settings → Developer settings → Personal access tokens → <b>Tokens (classic)</b> → Generate new token</li>
      <li>只勾 <code>gist</code> 這一項，有效期揀 No expiration 或一年</li>
      <li>複製出來貼上面。Token 只存在這部裝置的瀏覽器，不會進 repo</li>
    </ol>`;
  $('mCancel').onclick = closeModal;
  $('mClear').onclick = () => {
    localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_GIST); localStorage.removeItem(LS_PGIST);
    syncState = 'off'; closeModal(); render(); toast('已清除');
  };
  $('mSave').onclick = async () => {
    const t = $('sTok').value.trim(), g = $('sGid').value.trim(), pg = $('sPgid').value.trim();
    if (t) localStorage.setItem(LS_TOKEN, t); else localStorage.removeItem(LS_TOKEN);
    if (g) localStorage.setItem(LS_GIST, g); else localStorage.removeItem(LS_GIST);
    if (pg) localStorage.setItem(LS_PGIST, pg); else localStorage.removeItem(LS_PGIST);
    closeModal();
    if (pg) await refreshPlan(false);
    await syncNow(true);
  };
  openModal();
}

function openModal() { $('mask').classList.add('open'); }
function closeModal() { $('mask').classList.remove('open'); $('modal').innerHTML = ''; }
$('mask').addEventListener('click', e => { if (e.target === $('mask')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ---------- 同步 ----------
function updateSyncUI() {
  const d = $('dot'), t = $('syncTxt');
  d.className = 'dot' + (syncState === 'ok' ? ' on' : syncState === 'busy' ? ' busy' : syncState === 'err' ? ' err' : '');
  t.textContent = syncState === 'ok' ? '已同步' : syncState === 'busy' ? '同步中' : syncState === 'err' ? '同步失敗' : '本機';
}
async function gh(path, opts) {
  const token = localStorage.getItem(LS_TOKEN);
  if (!token) throw new Error('未設定 token');
  const res = await fetch(API + path, Object.assign({
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    }
  }, opts || {}));
  if (!res.ok) throw new Error('GitHub ' + res.status + ' ' + (await res.text()).slice(0, 120));
  return res.json();
}
let syncTimer = null;
function queueSync() {
  if (!localStorage.getItem(LS_TOKEN)) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(true), 1500);
}
async function syncNow(pull) {
  if (!localStorage.getItem(LS_TOKEN)) { toast('未設定同步，先按「設定」'); return; }
  syncState = 'busy'; updateSyncUI();
  try {
    let gid = localStorage.getItem(LS_GIST);
    if (!gid) {
      const g = await gh('/gists', {
        method: 'POST',
        body: JSON.stringify({
          description: '教學進度記錄' + (PLAN && PLAN.teacher ? '（' + PLAN.teacher + '）' : ''), public: false,
          files: { [GIST_FILE]: { content: JSON.stringify(DATA, null, 1) } }
        })
      });
      gid = g.id; localStorage.setItem(LS_GIST, gid);
      syncState = 'ok'; updateSyncUI(); toast('已建立私有 Gist：' + gid.slice(0, 8));
      return;
    }
    if (pull) {
      const g = await gh('/gists/' + gid);
      const f = g.files && g.files[GIST_FILE];
      if (f) {
        const txt = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
        const remote = JSON.parse(txt);
        DATA = mergeData(DATA, remote);
        saveLocal();
        loadExtras();
      }
    }
    await gh('/gists/' + gid, {
      method: 'PATCH',
      body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(DATA, null, 1) } } })
    });
    syncState = 'ok';
  } catch (e) {
    console.error(e); syncState = 'err'; toast('同步失敗：' + e.message);
  }
  updateSyncUI(); render();
}
function mergeData(a, b) {
  // 較新的 updated 勝出，逐筆合併
  const newer = (!a.updated || (b.updated && b.updated > a.updated)) ? b : a;
  const older = newer === b ? a : b;
  const out = { v: 1, updated: newer.updated, rec: {}, task: {}, over: {}, extra: {}, print: {} };
  ['rec', 'task', 'over', 'extra', 'print'].forEach(k => {
    out[k] = Object.assign({}, older[k] || {}, newer[k] || {});
  });
  return out;
}

// ---------- 匯出 ----------
function download(name, text, type) {
  const b = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a'); a.href = u; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function exportCsv() {
  const rows = [['班別', '日期', '星期', '節次', '學期', '週次', '原定內容', '狀態', '實際內容', '備註', '來源']];
  CLASSES.forEach(c => c.lessons.forEach(l => {
    const r = recOf(l) || {};
    const wk = PLAN.weeks && PLAN.weeks[l.date];
    rows.push([c.name, l.date, dowOf(l.date), l.period || '', wk ? wk[0] : '', wk ? wk[1] : '',
      planOf(l).replace(/\n/g, ' / '), r.s ? STATES[r.s].label : '', r.a || '', r.n || '', l.src || '']);
  }));
  const csv = '﻿' + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download(`教學進度_${todayISO()}.csv`, csv, 'text/csv;charset=utf-8');
}
function exportPrintCsv() {
  const rows = [['日期', '班別', '內容', '張數', '份數', '顏色', '單雙面', '金額', '備註']];
  Object.keys(DATA.print).map(id => DATA.print[id]).sort((a, b) => a.date < b.date ? -1 : 1).forEach(p => {
    const c = printClassOf(p.cid);
    rows.push([p.date, c.name, p.name || '', p.sheets, p.copies,
      p.color === 'color' ? '彩色' : '黑白', p.sides === 'double' ? '雙面' : '單面',
      printCost(p).toFixed(2), p.note || '']);
  });
  const csv = '﻿' + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download(`代印記錄_${todayISO()}.csv`, csv, 'text/csv;charset=utf-8');
}

// ---------- 事件 ----------
$('nav').addEventListener('click', e => {
  const b = e.target.closest('button[data-v]'); if (!b) return;
  view = b.dataset.v; localStorage.setItem(LS_VIEW, view); render();
});
$('btnSet').onclick = openSettings;
$('btnSync').onclick = () => syncNow(true);

$('view').addEventListener('click', e => {
  const q = e.target.closest('[data-quick]');
  if (q) {
    const id = q.dataset.quick, r = DATA.rec[id] || {};
    const i = CYCLE.indexOf(r.s || '');
    const next = CYCLE[(i < 0 ? 0 : i + 1) % CYCLE.length];
    if (!next && !r.a && !r.n) delete DATA.rec[id];
    else DATA.rec[id] = Object.assign({}, r, { s: next || undefined });
    touch(); return;
  }
  const sb = e.target.closest('[data-setid]');
  if (sb) {
    const id = sb.dataset.setid, s = sb.dataset.sets, r = DATA.rec[id] || {};
    const ns = r.s === s ? '' : s;
    if (!ns && !r.a && !r.n) delete DATA.rec[id];
    else DATA.rec[id] = Object.assign({}, r, { s: ns || undefined });
    touch(); return;
  }
  const ed = e.target.closest('[data-edit]');
  if (ed) { openLesson(ed.dataset.edit); return; }
  const tn = e.target.closest('[data-tnote]');
  if (tn) { openTaskNote(tn.dataset.tnote); return; }
  const wk = e.target.closest('[data-wk]');
  if (wk) { weekOffset = wk.dataset.wk === '0' ? 0 : weekOffset + Number(wk.dataset.wk); render(); return; }
  const mo = e.target.closest('[data-mo]');
  if (mo) { monthOffset = mo.dataset.mo === '0' ? 0 : monthOffset + Number(mo.dataset.mo); selDay = null; render(); return; }
  const cm = e.target.closest('[data-cm]');
  if (cm) { calMode = cm.dataset.cm; localStorage.setItem('tp.calmode', calMode); render(); return; }
  const ct = e.target.closest('[data-class]');
  if (ct) { classFilter = ct.dataset.class; localStorage.setItem(LS_CLASS, classFilter); render(); return; }
  const ad = e.target.closest('[data-addday]');
  if (ad) { openAddLesson(ad.dataset.addday); return; }
  const pd = e.target.closest('[data-prdel]');
  if (pd) { removePrint(pd.dataset.prdel); toast('已刪除'); return; }
  if (e.target.id === 'prAdd') { addPrintFromForm(); return; }
  if (e.target.id === 'expPrint') { exportPrintCsv(); return; }
  if (e.target.id === 'btnSetGo') { openSettings(); return; }
  if (e.target.closest('.lz')) return;
  const dayCell = e.target.closest('[data-day]');
  if (dayCell) { selDay = selDay === dayCell.dataset.day ? null : dayCell.dataset.day; render(); return; }
  if (e.target.id === 'expCsv') { exportCsv(); return; }
  if (e.target.id === 'expJson') { download(`教學進度備份_${todayISO()}.json`, JSON.stringify(DATA, null, 1), 'application/json'); return; }
  if (e.target.id === 'impJson') {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        try { DATA = mergeData(DATA, JSON.parse(fr.result)); saveLocal(); loadExtras(); render(); toast('已匯入'); }
        catch (err) { toast('檔案讀不到：' + err.message); }
      };
      fr.readAsText(f);
    };
    inp.click(); return;
  }
});
$('view').addEventListener('change', e => {
  if (e.target.id === 'selClass') { classFilter = e.target.value; localStorage.setItem(LS_CLASS, classFilter); render(); return; }
  if (e.target.id === 'prCid') {
    const sz = CLASS_SIZE[e.target.value];
    if (sz) $('prCopies').value = sz;
    return;
  }
  const t = e.target.closest('[data-task]');
  if (t) {
    const id = t.dataset.task, st = DATA.task[id] || {};
    st.done = t.checked || undefined;
    if (!st.done && !st.n) delete DATA.task[id]; else DATA.task[id] = st;
    touch(); return;
  }
});
$('view').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.closest('.pr-new')) { e.preventDefault(); addPrintFromForm(); }
});
// ---------- 原位編輯（雙擊） ----------
function startInline(el) {
  if (el.querySelector('textarea')) return;
  const l = byId[el.dataset.lid]; if (!l) return;
  const f = el.dataset.inl;
  const r = recOf(l) || {};
  const cur = f === 'p' ? planOf(l) : f === 'a' ? (r.a || '') : (r.n || '');
  const ta = document.createElement('textarea');
  ta.className = 'inl'; ta.value = cur;
  ta.rows = Math.max(2, Math.min(6, cur.split('\n').length + 1));
  el.textContent = ''; el.classList.remove('ph'); el.appendChild(ta);
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  inlineOpen = true;
  let closed = false;
  const save = () => { if (closed) return; closed = true; inlineOpen = false; commitInline(l, f, ta.value); };
  ta.addEventListener('blur', save);
  ta.addEventListener('keydown', ev => {
    ev.stopPropagation();
    if (ev.key === 'Escape') { closed = true; inlineOpen = false; ta.removeEventListener('blur', save); render(); }
    else if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ta.blur(); }
  });
  ta.addEventListener('click', ev => ev.stopPropagation());
}
function commitInline(l, f, val) {
  val = val.replace(/\s+$/, '');
  if (f === 'p') {
    if (val && val !== l.plan) DATA.over[l.id] = val; else delete DATA.over[l.id];
  } else {
    const r = Object.assign({}, DATA.rec[l.id]);
    if (val) r[f] = val; else delete r[f];
    if (!r.s && !r.a && !r.n) delete DATA.rec[l.id]; else DATA.rec[l.id] = r;
  }
  touch();
}
$('view').addEventListener('dblclick', e => {
  const el = e.target.closest('[data-inl]');
  if (el) { e.preventDefault(); startInline(el); }
});

// ---------- 啟動 ----------
loadLocal();
loadPlanCache();
render();
if (localStorage.getItem(LS_PGIST)) refreshPlan(true);
if (localStorage.getItem(LS_TOKEN)) syncNow(true);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { }));
}
