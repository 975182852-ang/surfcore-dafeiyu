import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function asksForBalance(messages) {
  return (Array.isArray(messages) ? messages : []).slice(-12).some(m => m?.isOwner === true && !m.isSelf
    && /余额|剩.*(?:钱|元)|还有多少.*(?:钱|余额)|饭钱/.test(String(m.plain ?? m.text ?? '')));
}

export async function queryLiveBalance({ readKey = () => fs.readFileSync(path.join(process.env.DSH_HOME || path.join(process.env.USERPROFILE || os.homedir(), '.dsh'), 'surfcore/state/deepseek-api-key'), 'utf8').trim(), fetchImpl = fetch, now = Date.now } = {}) {
  try {
    const key = readKey();
    if (!key) throw new Error();
    const response = await fetchImpl('https://api.deepseek.com/user/balance', {
      headers: { Authorization: 'Bearer ' + key }, redirect: 'error', signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) return { ok: false, error: '官方余额查询失败（HTTP ' + response.status + '）', checkedAt: new Date(now()).toISOString() };
    const data = await response.json();
    const balance = data.balance_infos?.find(b => b.currency === 'CNY');
    const amount = Number(balance?.total_balance);
    if (!balance || !Number.isFinite(amount) || amount < 0) throw new Error();
    return { ok: true, amount, currency: 'CNY', available: data.is_available === true, checkedAt: new Date(now()).toISOString(), source: 'DeepSeek 官方实时接口' };
  } catch {
    return { ok: false, error: '实时余额查询失败，请勿将旧快照或记忆当作当前余额', checkedAt: new Date(now()).toISOString() };
  }
}
