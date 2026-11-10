// Operational notice only: no model call and no change to the budget gate.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { localDayKey } from './token-budget.js';

export function budgetNoticeText(hits) {
  const label = { qq: 'QQ', total: '总额' };
  const rows = hits.map(h => `${label[h.scope]}已用${h.unit === 'cny' ? '¥' + Number(h.used).toFixed(4) : Math.round(h.used) + ' Token'}／上限${h.unit === 'cny' ? '¥' + Number(h.limit).toFixed(2) : Math.round(h.limit) + ' Token'}`);
  return `⚠️ 今日聊天预算已到上限（SurfCore统计）：${rows.join('；')}。自动聊天已暂停，可在SurfCore“额度/费用”调整上限，或等次日0点重置。`;
}

export function createBudgetNotifier({ file, send, now = Date.now, retryMs = 60000 }) {
  let state = { version: 1, sent: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (parsed.version !== 1 || !parsed.sent || typeof parsed.sent !== 'object' || Array.isArray(parsed.sent)) throw Error('invalid budget notice state');
    state = parsed;
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  let chain = Promise.resolve();
  const retryAt = new Map();
  const keyOf = (h, day) => `${day}:${h.scope}:${h.unit}:${h.limit}`;
  const persist = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    try { fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(tmp, file); }
    catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
  };
  return {
    notify(hits) {
      const candidates = (Array.isArray(hits) ? hits : []).filter(h => ['qq', 'total'].includes(h.scope) && ['cny', 'tokens'].includes(h.unit) && Number.isFinite(Number(h.limit)) && Number(h.limit) > 0 && Number(h.used) >= Number(h.limit));
      const job = chain.catch(() => {}).then(async () => {
        const at = now(), day = localDayKey(at);
        const unique = [...new Map(candidates.map(h => [keyOf(h, day), h])).values()];
        const pending = unique.filter(h => !state.sent[keyOf(h, day)] && (retryAt.get(keyOf(h, day)) || 0) <= at);
        if (!pending.length) return { sent: false };
        try {
          if (await send(budgetNoticeText(pending)) === false) throw Error('budget notice delivery failed');
        } catch (e) {
          for (const h of pending) retryAt.set(keyOf(h, day), at + retryMs);
          throw e;
        }
        // Remember successful delivery in memory even if persistence fails.
        state.sent = Object.fromEntries(Object.entries(state.sent).filter(([key]) => key.startsWith(day + ':')));
        for (const h of pending) { state.sent[keyOf(h, day)] = at; retryAt.delete(keyOf(h, day)); }
        persist();
        return { sent: true, count: pending.length };
      });
      chain = job;
      return job;
    },
  };
}
