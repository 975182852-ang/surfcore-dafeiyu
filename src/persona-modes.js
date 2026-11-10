// One character and memory store, multiple conversation-local expression modes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PERSONA_MODE_NAMES = { normal: '普通大肥鱼', brat: '高贵傲娇（雌小鬼）' };
export function normalizePersonaMode(value) {
  return Object.hasOwn(PERSONA_MODE_NAMES, value) ? value : null;
}
export function parsePersonaCommand(value) {
  let s = String(value || '').trim().replace(/[。！!？?]+$/u, '').trim();
  s = s.replace(/^(?:大肥鱼|小鲸鱼)[，,：:\s]+/u, '');
  const slash = s.match(/^\/persona(?:\s+(normal|brat|status))(?:\s+(all))?$/i);
  if (slash) return { mode: slash[1] === 'status' ? null : slash[1], global: slash[2] === 'all', query: slash[1] === 'status' };
  if (/^(?:查看当前人格|当前人格|现在是什么人格|现在是什么模式|当前是什么人格)$/.test(s)) return { query: true };
  const global = /^(?:全局|全部会话|所有会话)/.test(s);
  s = s.replace(/^(?:全局|全部会话|所有会话)/, '');
  if (/^(?:请)?(?:切换|切换到|切换成|切换为|开启|启用)(?:高贵傲娇|傲娇|雌小鬼|小鬼)(?:模式|人格)$/.test(s)) return { mode: 'brat', global };
  if (/^(?:请)?(?:恢复|切回|切换|切换到|切换成|切换为|启用)(?:普通|正常|原来)(?:大肥鱼)?(?:模式|人格)$/.test(s)) return { mode: 'normal', global };
  // Conversational requests from the manager need not match a fixed command.
  // Quoted examples, future plans and explicit negatives remain ordinary chat.
  if (s.length > 120 || /他说|她说|别人说|引用|举例|解释|是什么意思|怎么实现|如何实现|是否可行|提示词|人设卡|如果|假如|下次|以后|不要|先别|暂时不|别.{0,6}(?:切|换)|取消切换/.test(s)) return null;
  const all = global || /全局|所有会话|全部会话|群和私聊都|私聊和群都/.test(s);
  const actions = [...s.matchAll(/切换|切|换|变成|变回|恢复|启用|开启|用|来个|让我看看/g)];
  if (!actions.length) return null;
  const action = actions[actions.length - 1];
  const tail = s.slice(action.index + action[0].length);
  if (/^(?:你)?自己(?:切换|换)(?:一下|下)?(?:人格|模式)?(?:吧|呗|嘛)?$/.test(s)) return { mode: 'toggle', global: all };
  if (/表情|贴纸|图片/.test(tail) && !/人格|模式|那面|一面/.test(tail)) return null;
  if (/雌小鬼|小鬼|高贵傲娇|傲娇/.test(tail)) return { mode: 'brat', global: all };
  if (/普通|正常|原来|原本|软萌|软糯|温柔/.test(tail)) return { mode: 'normal', global: all };
  if (/另一(?:个)?人格|另一个模式|另一面|换.{0,4}人格|切换.{0,4}人格/.test(s)) return { mode: 'toggle', global: all };
  return null;
}
export function stickersForPersona(entries, mode, enabled = true) {
  return enabled ? entries.filter(e => (normalizePersonaMode(e.personaMode) || 'normal') === mode) : entries;
}
export function formatPersonaSpeech(text, mode) {
  if (mode !== 'brat') return String(text ?? '');
  return String(text ?? '').split(/(https?:\/\/\S+|```[\s\S]*?```|`[^`]*`)/g)
    .map((part, index) => index % 2 ? part : part.replace(/杂鱼[~～]*/g, '杂鱼~')).join('');
}
export function createPersonaModeStore(file) {
  let state = { version: 1, defaultMode: 'normal', epoch: 0, conversations: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (raw.version !== 1 || !normalizePersonaMode(raw.defaultMode) || !raw.conversations || Array.isArray(raw.conversations)) throw Error('invalid persona mode state');
    state = raw;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const current = key => normalizePersonaMode(state.conversations[key]?.mode) || state.defaultMode;
  const revision = key => `${state.epoch || 0}:${state.conversations[key]?.epoch || 0}`;
  const save = next => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try { fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(tmp, file); }
    catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
    state = next;
  };
  return {
    current, revision,
    snapshot: () => JSON.parse(JSON.stringify(state)),
    set(key, mode, { global = false, at = Date.now() } = {}) {
      if (!normalizePersonaMode(mode) || !/^(group|private):[1-9]\d*$/.test(key)) throw Error('invalid persona switch');
      if (!global && current(key) === mode) { save({...state,conversations:{...state.conversations,[key]:{...state.conversations[key],mode,lastManualAt:at}}});return false; }
      if (global) save({ ...state, defaultMode: mode, epoch: (state.epoch || 0) + 1, lastGlobalManualAt: at, conversations: {} });
      else save({ ...state, conversations: { ...state.conversations, [key]: { ...state.conversations[key], mode, epoch: (state.conversations[key]?.epoch || 0) + 1, lastManualAt: at, updatedAt: new Date(at).toISOString() } } });
      return true;
    },
    chooseAutomatic(key, mode, { at = Date.now(), cooldownMs = 900000, manualHoldMs = 1800000 } = {}) {
      if (!normalizePersonaMode(mode) || !/^(group|private):[1-9]\d*$/.test(key)) throw Error('invalid automatic persona choice');
      if(current(key)===mode)return {changed:false,reason:'already-current',mode};
      const old=state.conversations[key]||{};
      const manualAt=Math.max(Number(old.lastManualAt)||(!old.lastAutoAt?Date.parse(old.updatedAt)||0:0),Number(state.lastGlobalManualAt)||0);
      if(manualAt && at-manualAt<manualHoldMs)return {changed:false,reason:'manual-hold',mode:current(key),retryAfterMs:manualAt+manualHoldMs-at};
      if(old.lastAutoAt && at-old.lastAutoAt<cooldownMs)return {changed:false,reason:'auto-cooldown',mode:current(key),retryAfterMs:old.lastAutoAt+cooldownMs-at};
      save({...state,conversations:{...state.conversations,[key]:{...old,mode,epoch:(old.epoch||0)+1,lastAutoAt:at,updatedAt:new Date(at).toISOString()}}});
      return {changed:true,mode,reason:'chosen'};
    },
  };
}
