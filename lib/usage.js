// Per-run counts of model calls, tokens, and cost (PRD 3e), plus the counts-only log line (PRD 7.2 item 8). Pure.
import { totalUsage } from './jev.js';

export const HAIKU_MODEL = 'claude-haiku-5-5';
const HAIKU_IN_PER_MTOK = 0.10; // USD, docs.anthropic.com Haiku 5.5, prompts up to 100K tokens
const HAIKU_OUT_PER_MTOK = 0.50;

export function haikuCostUsd(inputTokens, outputTokens) {
  return ((inputTokens * HAIKU_IN_PER_MTOK + outputTokens * HAIKU_OUT_PER_MTOK) / 1e6).toFixed(6);
}

export function createUsage() {
  const jevCalls = [];
  let haiku = { status: 'skipped', calls: 0, inputTokens: 0, outputTokens: 0 };
  return {
    addJev(calls) { jevCalls.push(...calls); },
    setHaiku(h) { haiku = { status: h.status, calls: h.calls ?? 0, inputTokens: h.inputTokens ?? 0, outputTokens: h.outputTokens ?? 0 }; },
    totals() {
      const j = totalUsage(jevCalls);
      return {
        jev: { ...j, trimmedCalls: jevCalls.filter((c) => c.trimmedState).length },
        haiku: { ...haiku, costUsdEstimate: haikuCostUsd(haiku.inputTokens, haiku.outputTokens) },
      };
    },
    // PRD 3e "calls" array
    entries() {
      const t = this.totals();
      return [
        { provider: 'Glasser', model: 'jev-1.13.0', calls: t.jev.calls, inputTokens: t.jev.inputTokens, costUsd: t.jev.chargeUsd },
        { provider: 'Anthropic', model: HAIKU_MODEL, calls: t.haiku.calls, inputTokens: t.haiku.inputTokens, outputTokens: t.haiku.outputTokens,
          status: t.haiku.status, costUsdEstimate: t.haiku.costUsdEstimate },
      ];
    },
  };
}

// Whitelist: only these keys, and only numbers or short plain strings. No README text, code, prompts, or model output (N9).
const LOG_KEYS = ['id', 'path', 'method', 'status', 'ms', 'errorCode', 'counts'];
export function logLine(fields) {
  const out = {};
  for (const k of LOG_KEYS) {
    const v = fields[k];
    if (k === 'counts' && v && typeof v === 'object') {
      out.counts = Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === 'number'));
    } else if (typeof v === 'number' || (typeof v === 'string' && v.length <= 80 && /^[\w./:-]*$/.test(v))) {
      out[k] = v;
    }
  }
  return JSON.stringify(out);
}
