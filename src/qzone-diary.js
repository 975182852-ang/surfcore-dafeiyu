// Public diary data preparation. No raw chat text or personal identity is sent to the writer.
import crypto from 'node:crypto';
import { EMOTION_KEYS } from './sticker-semantics.js';

export const DIARY_DEFAULTS = Object.freeze({ enabled: false, time: '22:05', jitterMinutes: 5, retryMs: 600000, maxAttempts: 3, maxChars: 650, writerTimeoutMs: 90000, writerPreset: 'qq-chat', visibility: 4, imageEnabled: true });
export function normalizeDiaryConfig(raw = {}) {
  const n = (k, min, max) => Math.min(max, Math.max(min, raw[k] === undefined || !Number.isFinite(Number(raw[k])) ? DIARY_DEFAULTS[k] : Number(raw[k])));
  const time = /^22:[0-5]\d$|^23:[0-5]\d$/.test(raw.time || '') ? raw.time : DIARY_DEFAULTS.time;
  return { ...DIARY_DEFAULTS, ...raw, enabled: raw.enabled === true, time, jitterMinutes: n('jitterMinutes', 0, 30), retryMs: n('retryMs', 60000, 3600000), maxAttempts: n('maxAttempts', 1, 6), maxChars: n('maxChars', 320, 900), writerTimeoutMs: n('writerTimeoutMs', 10000, 120000), visibility: [1, 4, 64].includes(raw.visibility) ? raw.visibility : 4, imageEnabled: raw.imageEnabled !== false };
}
export function diaryClock(at = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at)).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
}
export const diaryHash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
export function diaryDue(at, cfg) {
  const c = diaryClock(at), [h, m] = cfg.time.split(':').map(Number);
  const jitter = parseInt(diaryHash(c.day).slice(0, 4), 16) % (Math.floor(cfg.jitterMinutes) + 1);
  return { ...c, due: cfg.enabled && c.minute >= Math.min(1439, h * 60 + m + jitter), scheduledMinute: Math.min(1439, h * 60 + m + jitter) };
}

const TOPICS = { 游戏: /游戏|通关|副本|队友|开黑/, 技术: /代码|程序|插件|模型|工具|电脑|配置/, 学习: /学习|考试|作业|读书|题目/, 音乐: /音乐|唱歌|听歌|歌单/, 日常: /吃饭|白饭|午饭|晚饭|天气|早安|晚安|休息/, 趣事: /笑死|哈哈|有趣|笑话|接梗|好玩/ };
export function emptyDiaryFacts(day) { return { day, incoming: 0, replies: 0, stickers: 0, topics: {}, moods: {} }; }
export function observeDiaryFacts(facts, event) {
  if (event.kind === 'incoming') facts.incoming++;
  else if (event.kind === 'reply') facts.replies++;
  else if (event.kind === 'sticker') facts.stickers++;
  // Private chat is counted only; never mine its topic or personal story for public content.
  if (event.public !== true) return;
  const text = String(event.text || '');
  for (const [label, re] of Object.entries(TOPICS)) if (re.test(text)) facts.topics[label] = (facts.topics[label] || 0) + 1;
  if (event.kind === 'reply') {
    if (/开心|嘿嘿|哈哈|好耶|不错/.test(text)) facts.moods.开心 = (facts.moods.开心 || 0) + 1;
    if (/困|累|休息|晚安/.test(text)) facts.moods.有点困 = (facts.moods.有点困 || 0) + 1;
    if (/认真|弄好|完成|帮忙/.test(text)) facts.moods.认真营业 = (facts.moods.认真营业 || 0) + 1;
  }
}
export function publicDiaryFacts(facts) {
  return { date: facts.day, incoming: facts.incoming || 0, replies: facts.replies || 0, stickers: facts.stickers || 0, topics: Object.entries(facts.topics || {}).filter(([k]) => k in TOPICS).sort((a,b) => b[1]-a[1]).slice(0,3).map(([name]) => name), mood: Object.entries(facts.moods || {}).filter(([k])=>["开心","有点困","认真营业"].includes(k)).sort((a,b) => b[1]-a[1])[0]?.[0] || '平静' };
}
export function diaryPrivacyIssue(text, aliases = []) {
  const s = String(text || '');
  if (/https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b\d{5,}\b|sk-[a-z0-9_-]{8,}|Bearer\s|[A-Z]:\\|\[CQ:|@[^\s]|(?:住址|手机号|身份证|群号|QQ号|银行卡|密码|密钥)\s*[:：]/i.test(s)) return '发现号码、联系方式或内部信息';
  if (/刷(?:了|着|会儿)?(?:B站|视频)|在B站|上B站|浏览B站|哔哩哔哩|偷看.*聊天记录/.test(s)) return '出现未经事实支持的活动';
  if (/余额|[¥￥]|(?:群友|有人|朋友|主人).{0,15}(?:失恋|工资|收入|住在|病史|银行卡|家庭|手机号)/.test(s)) return '出现财务或他人个人细节';
  if (aliases.some(a => String(a).trim().length >= 2 && !['大家','主人','大肥鱼','小鲸鱼','私聊','我'].includes(a) && s.includes(a))) return '出现群友具体称呼';
  return '';
}
export function diaryPrompt({ facts, mode, tone = '', images = [] }) {
  return `你是大肥鱼，写一篇QQ空间日记草稿，不使用任何工具。现在是北京时间${facts.date}夜晚。
只依据下面去身份化的事实，简单写今天做了什么、你有什么感想。聊天话题只能写“聊到/听到”，不能写成亲自做过的事。没有聊天时如实写记录不多。不要编造刷B站、现实经历、任务成果、睡觉或吃饭事实；白饭与尾巴只能作角色小趣味。
正文150～300字，2～4个短段落，像随手记，不是工作汇报或对账单。可以软萌、轻傲娇，偶尔颜文字；不写任何群友姓名、昵称、群名、号码、原话、个人遭遇、私聊细节、余额或凭据。不要机械复刻示例。当天没有值得记的大事也可以写平淡的感受。
当前表达模式：${mode === 'brat' ? '高贵傲娇，嘴硬心软，亲近但不刻薄' : '软萌，稍微傲娇，亲近自然'}。
语气参考（只管表达，不是事实）：${String(tone).slice(0, 900)}
事实：${JSON.stringify(facts)}
候选配图（可不选，不要描述你没看到的画面）：${JSON.stringify(images.map(e=>({id:e.id,emotion:EMOTION_KEYS.includes(e.emotion)?e.emotion:'cute'})).slice(0,4))}
只输出JSON：{"body":"日记正文，不写标题日期","mood":"开心/平静/有点困/有点得意/软乎乎/认真营业之一","imageId":"候选ID或null"}。`;
}
export function diaryTemplate(facts, mode = 'normal') {
  const active = facts.replies > 0;
  const topics = facts.topics.length ? `还聊到${facts.topics.join('、')}，有些小话题挺有意思。` : '';
  const opening = active ? `今天接了些话，也认真陪着聊了一会儿。${topics}` : '今天留下的记录不多，没有什么轰轰烈烈的大事，就把这份安静也记下来吧。';
  const picture = facts.stickers ? '也用了表情接话，小小的图有时候比一大段话还传神。' : '';
  const closings = ['没有什么惊天动地的大事，但能把眼前的话好好接住，也算是认真过了一天。把这些小片段收进白饭碗旁边，明天再慢慢捞新的。', '有趣的日子不一定要很热闹，平平常常的回应也值得留下。今天先给自己一个小小的点头，尾巴放松一点啦。', '本鲸今天也有在认真营业哦。哼，夸一句也不是不可以……把今天的小心情收好，明天见嘛。'];
  return { body: opening + picture + '\n\n' + closings[parseInt(diaryHash(facts.date).slice(0,2),16)%closings.length], mood: mode === 'brat' && active ? '有点得意' : facts.mood, imageId: null };
}
export function formatDiary(day, draft, { aliases = [], maxChars = 650 } = {}) {
  const moods = ['开心','平静','有点困','有点得意','软乎乎','认真营业'];
  const body = (typeof draft?.body === 'string' ? draft.body : '').replace(/\*\*|```/g, '').trim();
  const issue = diaryPrivacyIssue(body, aliases);
  if (issue || body.length < 40 || body.length > maxChars - 65) throw Object.assign(new Error(issue || '日记长度无效'), { code: 'DIARY_CONTENT_INVALID', hint: '只写自己的活动与感受，去掉个人信息，正文保持40至500字左右。' });
  const mood = moods.includes(draft.mood) ? draft.mood : '平静';
  const [y,m,d] = day.split('-');
  return `大肥鱼小日记\n日期：${y}年${m}月${d}日\n心情：${mood}\n\n${body}`;
}
export function parseDiaryDraft(value) {
  const s = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(s);
}
export function diaryImages(entries, mode, day) {
  return entries.filter(e => (e.personaMode || 'normal') === mode && (e.id.startsWith('curated-dafeiyu-') || e.id.startsWith('brat-dafeiyu-') || e.tags?.includes('日记配图')) && /^https:\/\//.test(e.url || ''))
    .sort((a,b) => diaryHash(day+a.id).localeCompare(diaryHash(day+b.id))).slice(0,4);
}
export function canonicalDiary(text) { return String(text || '').normalize('NFKC').replace(/<br\s*\/?>/gi,'\n').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,'').trim(); }
