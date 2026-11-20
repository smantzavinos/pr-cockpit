import { isGithubUrl } from "../shared/githubNetwork.cjs";

const REDIRECT = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 10;

// Check every destination before handing it to the network. In particular, a Location
// supplied by GitHub is not permission to connect to a third-party storage service.
export function githubOnlyFetch(fetcher: typeof fetch): typeof fetch {
  return (async (input, init) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(String(input), init);
    let target = new URL(request.url);
    let method = request.method;
    const headers = new Headers(request.headers);

    for (let redirects = 0; ; redirects++) {
      if (!isGithubUrl(target)) throw new TypeError(`GitHub-only networking blocked ${target.origin}`);
      // A clone keeps the original body available if a 307/308 preserves a write.
      const body = method === "GET" || method === "HEAD" ? null : request.clone().body;
      const response = await fetcher(target, { method, headers, body, signal: request.signal, redirect: "manual" });
      const location = REDIRECT.has(response.status) ? response.headers.get("location") : null;
      if (!location || request.redirect === "manual") return response;
      await response.body?.cancel();
      if (request.redirect === "error" || redirects >= MAX_REDIRECTS) throw new TypeError("Unexpected GitHub redirect");
      const next = new URL(location, target);
      if (next.origin !== target.origin) {
        headers.delete("authorization");
        headers.delete("cookie");
      }
      if (((response.status === 301 || response.status === 302) && method === "POST")
        || (response.status === 303 && method !== "GET" && method !== "HEAD")) {
        method = "GET";
        for (const header of ["content-encoding", "content-language", "content-length", "content-location", "content-type"]) {
          headers.delete(header);
        }
      }
      target = next;
    }
  }) as typeof fetch;
}
