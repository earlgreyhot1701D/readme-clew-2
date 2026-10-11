// Saves the report in memory as a .json file on this machine. A Blob and a temporary link: no request is made.
// doc, urlApi and schedule are injectable so tests can run this without a browser.
import { exportFileName, reportToJson } from './export.js';

export function downloadReport(report, { doc = document, urlApi = URL, schedule = (fn) => setTimeout(fn, 1000) } = {}) {
  const blob = new Blob([reportToJson(report)], { type: 'application/json' });
  const url = urlApi.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = exportFileName(report);
  doc.body.append(a); // some browsers only start a download from a link that is in the page
  a.click();
  a.remove();
  schedule(() => urlApi.revokeObjectURL(url)); // the download has started by then, so the URL can go
  return a.download;
}
