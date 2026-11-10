import { isPeakAt } from './model-prices.js';

export const PROGRESSIVE_GROUP = '';
export const isProgressiveGroup = (key) => /^group:\d+$/.test(String(key));
export const isTargetGroup = (key, groupId = '') => { const id = String(groupId ?? '').replace(/^group:/, '').trim(); return /^[1-9]\d*$/.test(id) && key === 'group:' + id; };

export function recentWindow(values, now, duration, max = 1000) {
  return (Array.isArray(values) ? values : [])
    .filter((n) => Number.isFinite(n) && n <= now && now - n < duration).slice(-max);
}

export function progressiveProbability({ now, base, incomingTimes, replyTimes }) {
  const peak = isPeakAt(now);
  const replies = recentWindow(replyTimes, now, 3600000).length;
  const activity = recentWindow(incomingTimes, now, 600000).length;
  const [start, end] = peak ? [30, 60] : [120, 240];
  const factor = (value, low, high) => Math.max(0, Math.min(1, (high - value) / (high - low)));
  const probability = peak ? 0.25 : Math.max(0, Math.min(1, Number(base) || 0));
  return probability * factor(replies, start, end) * factor(activity, 50, 100);
}
