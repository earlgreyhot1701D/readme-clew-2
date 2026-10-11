// Puts the bookmarklet address on the ABOUT tab link. It is a link to drag to the bookmarks bar, not a button.
import { BOOKMARKLET_HREF } from './bookmarklet-href.js';

const link = document.getElementById('bookmarklet');
if (link) link.setAttribute('href', BOOKMARKLET_HREF);
