import fs from 'node:fs';
import path from 'node:path';
import { diaryClock, diaryDue, diaryHash, emptyDiaryFacts, observeDiaryFacts, publicDiaryFacts, diaryTemplate, formatDiary, parseDiaryDraft, canonicalDiary, normalizeDiaryConfig } from './qzone-diary.js';

function atomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try { fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(tmp, file); }
  catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
}
function load(file) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (s.version !== 1 || !s.days || typeof s.days !== 'object' || Array.isArray(s.days)) throw Error('日记状态格式异常');
    return s;
  } catch (e) { if (e.code === 'ENOENT') return { version: 1, days: {} }; throw e; }
}
const issue = (code, error, hint) => ({ ok: false, code, error, hint });

export function createQzoneDiary({ file, config = () => ({}), context = () => ({}), ready = () => true, generate, publish, listPosts, onError = async () => {}, log = () => {}, now = Date.now }) {
  let state = load(file), running = false, readFault = null;
  const rowFor = day => state.days[day] ??= { facts: emptyDiaryFacts(day), seen: [], status: 'collecting', attempts: 0 };
  const save = () => {
    const days = Object.keys(state.days).sort();
    for (const day of days.slice(0, -14)) delete state.days[day];
    atomic(file, state);
  };
  const archive = (day, row) => atomic(path.join(path.dirname(file), 'drafts', day + '.json'), { day, text: row.draft?.text, imageId: row.draft?.imageId || null, method: row.draft?.method, status: row.status, postId: row.postId || null, error: row.error || null });
  const report = async (day, row, e) => {
    row.error = issue(e.code || 'DIARY_FAILED', String(e.message || e).slice(0,180), e.hint || '检查QQ空间登录和网络，在日记状态中查看草稿；不要在结果不明时重复发布。');
    log(`[空间日记] ${row.error.code}: ${row.error.error}`);
    if (!row.notified) { try { await onError(`⚠️ ${day}的空间日记暂未完成：${row.error.error}。${row.error.hint}`); row.notified = true; } catch {} }
    save(); archive(day,row);
    return row.error;
  };
  const markPosted = (day, row, postId) => {
    row.status = 'published'; row.postId = String(postId); row.publishedAt = now(); row.error = null;
    save(); archive(day,row); log(`[空间日记] ${day} 已发表，回执已保存`);
    return { ok: true, day, posted: true, postId: row.postId };
  };
  async function reconcile(day, row) {
    try {
      const posts = await listPosts();
      const match = posts.find(p => diaryClock(Number(p.time) * 1000).day === day && canonicalDiary(p.content) === canonicalDiary(row.draft?.text));
      if (match?.tid) return markPosted(day,row,match.tid);
      return issue('DIARY_UNCONFIRMED', '上次发送结果尚未确认，未重复发布', '请查看自己的QQ空间；确认未发表后再执行人工重试。');
    } catch (e) { return issue('DIARY_RECONCILE_FAILED', '暂时无法核对空间发布结果', '检查QQ空间登录与网络，服务稍后会继续核对，暂不重复发布。'); }
  }
  async function tickInternal() {
    const cfg = normalizeDiaryConfig(config()), at = now(), clock = diaryDue(at,cfg);
    if (!cfg.enabled) return { ok: true, skipped: 'disabled' };
    if (!clock.due) return { ok: true, skipped: 'before-time', day: clock.day };
    const row = rowFor(clock.day);
    if (row.status === 'published') return { ok: true, skipped: 'already-published', day: clock.day, postId: row.postId };
    if (!ready()) return { ok: true, skipped: 'qq-offline', hint: 'QQ上线且仍在当天夜间时会自动继续。' };
    if (['publishing','uncertain'].includes(row.status)) {
      row.status = 'uncertain'; save();
      const result = await reconcile(clock.day,row);
      if (!result.ok) await report(clock.day,row,{...result,message:result.error});
      return result;
    }
    if (row.nextRetryAt > at) return { ok: true, skipped: 'retry-wait', nextRetryAt: row.nextRetryAt };
    if (row.attempts >= cfg.maxAttempts) return issue('DIARY_ATTEMPTS_EXHAUSTED','今晚日记已达到重试次数','检查空间与登录状态后，在本机管理端明确重试。');
    if (!row.draft) {
      const info = context(clock.day), facts = publicDiaryFacts(row.facts);
      let draft, method = 'model';
      try {
        draft = parseDiaryDraft(await generate({ day: clock.day, facts, mode: info.mode || 'normal', tone: info.tone || '', images: info.images || [] }));
        if(info.mode==='brat')draft.body=String(draft.body||'').replace(/杂鱼[~～]*/g,'杂鱼~');
        formatDiary(clock.day,draft,{aliases:info.aliases,maxChars:cfg.maxChars});
      } catch (e) {
        method = 'facts-template'; draft = diaryTemplate(facts,info.mode);
        log(`[空间日记] 写稿使用事实模板（模型不可用、预算限制或内容未通过检查）`);
      }
      const text = formatDiary(clock.day,draft,{aliases:info.aliases,maxChars:cfg.maxChars});
      const eligible = info.images || [];
      const selected = eligible.find(e => e.id === draft.imageId) || (method === 'facts-template' ? eligible[0] : null);
      const imageId = cfg.imageEnabled && selected ? selected.id : null;
      row.draft = { text, imageId, method, hash: diaryHash(canonicalDiary(text)) };
      row.status = 'drafted'; row.createdAt = at; save(); archive(clock.day,row);
    }
    if (diaryClock(now()).day !== clock.day) return { ok: true, skipped: 'day-changed', draftReady: true };
    if (!ready()) return { ok: true, skipped: 'qq-offline', draftReady: true };
    row.status = 'publishing'; row.attempts++; row.startedAt = now(); save(); archive(clock.day,row);
    try {
      const result = await publish({ text: row.draft.text, imageId: row.draft.imageId, visibility: cfg.visibility, day: clock.day });
      if (!result?.postId) throw Object.assign(new Error('网关未返回说说编号，需核对是否已发表'), { code: 'DIARY_ACK_MISSING' });
      return markPosted(clock.day,row,result.postId);
    } catch (e) {
      if (e.definite === true) { row.status = 'failed'; row.nextRetryAt = now() + cfg.retryMs; }
      else { row.status = 'uncertain'; save(); const result = await reconcile(clock.day,row); if (result.ok) return result; }
      return report(clock.day,row,e);
    }
  }
  return {
    observe(event) {
      if (!normalizeDiaryConfig(config()).enabled) return;
      if (readFault) throw Error('日记状态不可读，暂停写入以保留原文件');
      const day = diaryClock(event.at || now()).day, row = rowFor(day);
      const id = event.id ? diaryHash(event.id) : '';
      if (id && row.seen.includes(id)) return;
      if (id) { row.seen.push(id); if (row.seen.length > 3000) row.seen.shift(); }
      observeDiaryFacts(row.facts,event); save();
    },
    status() {
      const cfg = normalizeDiaryConfig(config()), clock = diaryDue(now(),cfg), row = state.days[clock.day];
      return { enabled: cfg.enabled, timeZone: 'Asia/Shanghai', time: cfg.time, scheduledMinute: clock.scheduledMinute, day: clock.day, visibility: cfg.visibility, facts: publicDiaryFacts(row?.facts || emptyDiaryFacts(clock.day)), status: row?.status || 'collecting', method: row?.draft?.method, draft: row?.draft?.text || null, postId: row?.postId || null, error: readFault || row?.error || null, nextRetryAt: row?.nextRetryAt || null };
    },
    async tick() {
      if (running) return { ok: true, skipped: 'busy' };
      running = true; let lock;
      const lockFile = path.join(path.dirname(file),'publish.lock');
      try {
        fs.mkdirSync(path.dirname(file),{recursive:true});
        try { lock = fs.openSync(lockFile,'wx',0o600); fs.writeFileSync(lock,JSON.stringify({pid:process.pid,at:now()})); }
        catch (e) {
          if (e.code === 'EEXIST') {
            try { const old = JSON.parse(fs.readFileSync(lockFile,'utf8')); let alive=true; try {process.kill(old.pid,0);}catch{alive=false;} if (!alive) fs.renameSync(lockFile,lockFile+'.stale-'+Date.now()); } catch {}
            return { ok:true,skipped:'locked',hint:'另一个发布任务仍在处理；失效锁会在下一次检查后恢复。' };
          }
          throw e;
        }
        // Preserve a corrupt file for repair; never replace it with an empty/stale journal.
        try { state = load(file); readFault = null; }
        catch {
          const first = !readFault;
          readFault = issue('DIARY_STATE_UNREADABLE','日记状态文件无法读取，已暂停写入','先备份并检查state/qzone-diary/state.json；恢复有效内容后定时任务会继续。');
          log('[空间日记] '+readFault.code);
          if(first)try{await onError(readFault.error+'。'+readFault.hint)}catch{}
          return readFault;
        }
        return await tickInternal();
      } catch (e) {
        const day=diaryClock(now()).day;return await report(day,rowFor(day),e);
      } finally { if(lock!==undefined){fs.closeSync(lock);try{fs.unlinkSync(lockFile)}catch{}}running=false; }
    },
    retry({ confirmedNotPublished = false } = {}) {
      if (readFault) return readFault;
      const day=diaryClock(now()).day,row=rowFor(day);
      if (row.status==='published') return {ok:false,code:'DIARY_ALREADY_PUBLISHED',error:'今天已发表，不再重发',hint:'在QQ空间查看今日说说。'};
      if (['publishing','uncertain'].includes(row.status)&&!confirmedNotPublished) return issue('DIARY_CONFIRM_REQUIRED','发布结果不明，需要先确认空间未发表','请先查看自己的空间，确认未发表后再明确重试。');
      row.status=row.draft?'drafted':'collecting';row.attempts=0;row.nextRetryAt=0;row.notified=false;save();return {ok:true};
    },
  };
}
