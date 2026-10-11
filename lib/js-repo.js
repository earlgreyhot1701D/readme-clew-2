// Is this a package.json project? The checks (scripts, dependencies, workspaces) all read package.json,
// so a repo without one cannot be checked. We say so before any Jev call (PRD 7.2 item 4: cost bounds).
export const NOT_JS_MESSAGE = 'NOT A JS/TS REPO // THIS TOOL CHECKS package.json PROJECTS';

export class NotJsRepoError extends Error {
  constructor() {
    super(NOT_JS_MESSAGE);
    this.name = 'NotJsRepoError';
    this.code = 'not_js_repo';
    this.status = 422;
  }
}

// snapshot: { pkg, workspaces, files }. A package.json that exists but did not parse still counts.
export function isJsProject(snapshot) {
  if (!snapshot) return false;
  if (snapshot.pkg) return true;
  if ((snapshot.workspaces ?? []).length > 0) return true; // github.js only lists workspaces whose package.json parsed
  return (snapshot.files ?? []).includes('package.json');
}
