// Jev input budget (docs.typesafe.ai/models.md, jev-1.13.0): 64K tokens per request in total, and 32K tokens for
// `state` plus the single longest question. First seen in DigitalOcean's "Jev: an AI model that can't write a sentence".
// We estimate tokens before every call. Over budget: trim the README state first (every question already carries its
// own line, so the state is only context), and reject only when one question cannot fit. Pure.
export const LIMIT_STATE_PLUS_LONGEST = 32_000;
export const LIMIT_TOTAL = 64_000;
const MIN_STATE = 500;

// Deliberately pessimistic (3 characters per token), so the estimate errs toward trimming, not toward a 4xx.
export const estimateTokens = (x) => Math.ceil((typeof x === 'string' ? x : JSON.stringify(x ?? '')).length / 3);

function trimText(text, maxTokens) {
  const maxChars = Math.max(maxTokens, 0) * 3;
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  return cut.slice(0, Math.max(cut.lastIndexOf('\n'), 0));
}

// state is a string (line mode) or { readme: "numbered lines" } (readme mode). Only the readme text is ever trimmed.
function fitState(state, maxTokens) {
  if (estimateTokens(state) <= maxTokens) return { state, trimmed: false };
  if (state && typeof state === 'object' && typeof state.readme === 'string') {
    // JSON escaping makes the real state larger than the raw text, so shrink until the estimate of the whole state fits.
    let budget = maxTokens - 20;
    let next = { ...state, readme: trimText(state.readme, budget) };
    while (estimateTokens(next) > maxTokens && budget > 0) { budget = Math.floor(budget * 0.9); next = { ...state, readme: trimText(state.readme, budget) }; }
    return { state: next, trimmed: true };
  }
  return null; // a plain string state that is too big cannot be trimmed
}

// requests: [{ state, questions }] -> jobs [{ state, questions, trimmed }]. fail(code, message) throws the caller's error.
export function planRequests(requests, maxQuestions, fail) {
  const jobs = [];
  for (const { state, questions } of requests) {
    const sized = Object.entries(questions).map(([id, q]) => [id, q, estimateTokens(q)]);
    for (const [id, , t] of sized) {
      if (t > LIMIT_STATE_PLUS_LONGEST - MIN_STATE) fail('too_large', `One question (${id}) is too large for Jev's ${LIMIT_STATE_PLUS_LONGEST}-token limit`);
    }
    // group questions so that their total leaves room for a minimum state, and at most maxQuestions per call
    const groups = [];
    let cur = []; let sum = 0;
    for (const item of sized) {
      if (cur.length >= maxQuestions || (cur.length && sum + item[2] > LIMIT_TOTAL - MIN_STATE)) { groups.push(cur); cur = []; sum = 0; }
      cur.push(item); sum += item[2];
    }
    if (cur.length) groups.push(cur);
    for (const g of groups) {
      const total = g.reduce((a, x) => a + x[2], 0);
      const longest = Math.max(...g.map((x) => x[2]));
      const room = Math.min(LIMIT_STATE_PLUS_LONGEST - longest, LIMIT_TOTAL - total);
      const fit = fitState(state, room);
      if (!fit) fail('too_large', `The input is too large for Jev (${LIMIT_STATE_PLUS_LONGEST} tokens for state plus the longest question)`);
      jobs.push({ state: fit.state, questions: Object.fromEntries(g.map(([id, q]) => [id, q])), trimmed: fit.trimmed });
    }
  }
  return jobs;
}
