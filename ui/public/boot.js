if (location.hash.startsWith("#/palette")) document.documentElement.classList.add("palette-standalone-page");
if (location.hash.startsWith("#/embed")) document.documentElement.classList.add("embed-page");
// The first screen needs settings and the inbox. Ask for them while the bundle downloads and
// evaluates; api.js adopts each response once, so the requests are never repeated.
if (/^(#\/?)?$|^#\/pr\//.test(location.hash)) {
  window.__cockpitBootReads = { "/api/settings": fetch("/api/settings"), "/api/inbox": fetch("/api/inbox") };
  for (const read of Object.values(window.__cockpitBootReads)) read.catch(() => {});
}
