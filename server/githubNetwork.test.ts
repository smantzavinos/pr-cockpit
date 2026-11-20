import { expect, test } from "bun:test";
import { githubOnlyFetch } from "./githubNetwork.ts";

function recordingFetch(respond: (request: Request) => Response) {
  const requests: Request[] = [];
  const transport = (async (input, init) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(String(input), init);
    requests.push(request);
    return respond(request);
  }) as typeof fetch;
  return { requests, fetch: githubOnlyFetch(transport) };
}

test("non-GitHub URLs never reach the transport", async () => {
  const client = recordingFetch(() => Response.json({}));
  for (const url of [
    "https://relay.prcockpit.com/events",
    "https://api.github.com.example.org/graphql",
    "https://api.github.com@other.example/graphql",
    "https://api.github.com:8443/graphql",
    "http://api.github.com/graphql",
  ]) {
    await expect(client.fetch(url)).rejects.toThrow();
  }
  expect(client.requests).toEqual([]);
});

test("a GitHub redirect does not let the transport reach external storage", async () => {
  const client = recordingFetch(() => Response.redirect("https://example.blob.core.windows.net/secret-log", 302));
  await expect(client.fetch("https://api.github.com/repos/a/b/actions/jobs/1/logs")).rejects.toThrow("blocked");
  expect(client.requests).toHaveLength(1);
});

test("GitHub review writes keep their method, body and authorization on a same-origin redirect", async () => {
  const client = recordingFetch((request) => new URL(request.url).pathname === "/old"
    ? new Response(null, { status: 307, headers: { location: "/new" } })
    : Response.json({ submitted: true }));
  const data = { body: "Looks good", event: "APPROVE" };
  const response = await client.fetch("https://api.github.com/old", {
    method: "POST",
    headers: { authorization: "Bearer example", "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  expect(await response.json()).toEqual({ submitted: true });
  expect(client.requests.map((request) => request.method)).toEqual(["POST", "POST"]);
  expect(client.requests[1]!.headers.get("authorization")).toBe("Bearer example");
  expect(await client.requests[1]!.json()).toEqual(data);
});

test("allowed cross-origin GitHub redirects strip authorization", async () => {
  const client = recordingFetch((request) => new URL(request.url).hostname === "api.github.com"
    ? Response.redirect("https://raw.githubusercontent.com/a/b/main/README.md", 302)
    : new Response("public data"));
  const response = await client.fetch("https://api.github.com/repos/a/b", { headers: { authorization: "Bearer example" } });
  expect(await response.text()).toBe("public data");
  expect(client.requests[1]!.headers.has("authorization")).toBe(false);
});
