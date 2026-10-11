// JSON export (M18). Pure parts: the file name and the JSON text. Nothing is sent anywhere.

// readme-clew-2_owner_repo_<short sha>.json. Owner and repo are already validated, and are cleaned again here.
export function exportFileName(report) {
  const clean = (s) => String(s ?? 'unknown').replace(/[^A-Za-z0-9._-]/g, '-') || 'unknown';
  const commit = String(report?.receipt?.commit ?? '');
  const sha = /^[0-9a-f]{7,40}$/i.test(commit) ? commit.slice(0, 7).toLowerCase() : 'nocommit';
  return `readme-clew-2_${clean(report?.repo?.owner)}_${clean(report?.repo?.name)}_${sha}.json`;
}

// The exact report object, as JSON. JSON.parse of this equals the report.
export function reportToJson(report) {
  return JSON.stringify(report, null, 2);
}
