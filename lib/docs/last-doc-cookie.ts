// Session-lifetime cookie (no Max-Age/Expires, so the browser drops it when
// it fully closes) tracking the last doc a member had open — read server-side
// by app/docs/page.tsx to jump straight back in instead of showing a picker,
// written client-side by DocEditor whenever a doc is opened.
export const LAST_DOC_COOKIE = 'beacon_last_doc'
