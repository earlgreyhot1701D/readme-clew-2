// Which repo is the current tab showing? Pure. Used by the popup to fill the REPO line and to decide if SCAN is allowed.
// The server checks the URL again (PRD 7.2), so this only decides what the popup offers.
import { parseRepoInput } from './shared/view-model.js';

// First path segments on github.com that are pages of GitHub itself, not account names. github.com/settings/profile
// would otherwise look like the repo "profile" of a user called "settings".
const RESERVED = new Set(['about', 'account', 'apps', 'collections', 'codespaces', 'contact', 'copilot', 'customer-stories', 'dashboard',
  'enterprise', 'events', 'explore', 'features', 'gist', 'git-guides', 'issues', 'join', 'login', 'logout', 'marketplace', 'mobile',
  'models', 'new', 'notifications', 'organizations', 'orgs', 'pricing', 'pulls', 'readme', 'resources', 'search', 'security', 'sessions',
  'settings', 'signup', 'site', 'solutions', 'sponsors', 'stars', 'support', 'team', 'teams', 'topics', 'trending', 'users', 'watching']);

// -> { ok: true, owner, name, url } for a page inside a public-looking repo (the repo home, /tree/..., /blob/..., /pull/1, ...), else null.
export function repoFromTabUrl(tabUrl) {
  let u;
  try { u = new URL(tabUrl); } catch { return null; }
  if (u.protocol !== 'https:' || !['github.com', 'www.github.com'].includes(u.hostname) || u.username || u.password || u.port) return null;
  const [owner, name] = u.pathname.split('/').filter(Boolean);
  if (!owner || !name || RESERVED.has(owner.toLowerCase())) return null;
  const parsed = parseRepoInput(`https://github.com/${owner}/${name}`);
  return parsed.ok ? parsed : null;
}
