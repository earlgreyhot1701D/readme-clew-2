// README Clew 2 bookmarklet (PRD M12). Drag it to the bookmarks bar, click it on a GitHub repo page.
// It only navigates: it opens the live page with ?repo=owner/name filled in. It never fetches, reads the page, or stores anything.
// Off a repo page it opens the site with no repo. The page never scans on load, so the visitor still presses SCAN.
// Build: node scripts/build-bookmarklet.mjs turns the lines below into web/bookmarklet-href.js. Do not put // comments below.
(function () {
  var base = 'https://readme-clew-2.vercel.app/';
  var m = location.hostname === 'github.com' && location.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
  location.href = m ? base + '?repo=' + m[1] + '/' + m[2] : base;
})();
