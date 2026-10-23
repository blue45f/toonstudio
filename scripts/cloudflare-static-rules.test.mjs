import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildSpeculationRulesJson,
  STUDIO_PRERENDER_URLS,
} from "../apps/web/src/shared/lib/speculation-rules.ts";

import {
  renderCloudflareHeaders,
  renderCloudflareWorkerSecurityPolicy,
  STUDIO_SPECULATION_RULES_JSON,
  verifyCloudflareStaticRules,
  withInlineScriptHashes,
} from "./cloudflare-static-rules.mjs";

/** apps/web/index.html JSON-LD 블록의 인라인 해시 (생성기와 같은 방식으로 계산). */
function jsonLdHash() {
  const html = readFileSync("apps/web/index.html", "utf8");
  const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u);
  if (!block) throw new Error("apps/web/index.html JSON-LD data block is missing");
  return `'sha256-${createHash("sha256").update(block[1]).digest("base64")}'`;
}

describe("Cloudflare static response rules", () => {
  it("maps provider-neutral wildcard sources without changing header values", () => {
    const output = renderCloudflareHeaders({
      headers: [
        {
          source: "/(.*)",
          headers: [{ key: "X-Test", value: "root" }],
        },
        {
          source: "/assets/(.*)",
          headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
        },
      ],
    });

    expect(output).toContain("\n/*\n  X-Test: root\n");
    expect(output).toContain(
      "\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n",
    );
  });

  it("does not apply the long audio cache lifetime to the mutable OST catalogue", () => {
    const policy = JSON.parse(readFileSync("config/http-response-headers.json", "utf8"));
    const broadAudio = policy.headers.find((rule) => rule.source === "/audio/(.*)");
    expect(broadAudio.headers.some((header) => header.key === "Cache-Control")).toBe(false);
    const catalogue = policy.headers.find((rule) => rule.source === "/audio/playlist.json");
    expect(catalogue.headers).toContainEqual({ key: "Cache-Control", value: "no-store" });
    expect(catalogue.headers).toContainEqual({ key: "CDN-Cache-Control", value: "no-store" });
  });

  it("projects the canonical CSP into the edge worker without touching other headers", () => {
    const source = `export const COMMON_SECURITY_HEADERS = {\n  "Content-Security-Policy": "old",\n  "X-Test": "kept",\n};\n`;
    const output = renderCloudflareWorkerSecurityPolicy(source, {
      headers: [
        {
          source: "/(.*)",
          headers: [
            { key: "Content-Security-Policy", value: "default-src 'self'; object-src 'none'" },
          ],
        },
      ],
    });

    expect(output).toContain(
      `"Content-Security-Policy": "default-src 'self'; object-src 'none'",`,
    );
    expect(output).toContain(`"X-Test": "kept"`);
  });

  it("keeps only the app JSON-LD inline hash in the global script-src", () => {
    const policy = JSON.parse(readFileSync("config/http-response-headers.json", "utf8"));
    const injected = withInlineScriptHashes(policy);
    const csp = injected.headers
      .find((rule) => rule.source === "/(.*)").headers
      .find((header) => header.key === "Content-Security-Policy").value;
    expect(csp).toContain(`script-src 'self'`);
    expect(csp).toContain(jsonLdHash());
    expect(csp).not.toContain("'unsafe-eval'");
    // 낡은 인라인 해시는 갈아끼우고 앱 JSON-LD 해시는 살린다.
    const stale = withInlineScriptHashes({
      headers: [{
        source: "/(.*)",
        headers: [{
          key: "Content-Security-Policy",
          value: "default-src 'self'; script-src 'self' 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='",
        }],
      }],
    });
    const staleCsp = stale.headers[0].headers[0].value;
    expect(staleCsp).not.toContain("'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='");
    // 주입은 하지 않는다 — 낡은 해시만 걷어내므로 남은 sha256 토큰이 없어야 한다.
    expect(staleCsp).not.toContain("'sha256-");
  });

  it("keeps static and edge response policy artifacts synchronized", () => {
    expect(verifyCloudflareStaticRules()).toEqual([]);
    const headers = readFileSync("apps/web/public/_headers", "utf8");
    expect(headers).toContain("Content-Security-Policy:");
    expect(headers).toContain(
      "/studio/*\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: credentialless\n  X-Robots-Tag: noindex, nofollow, noarchive",
    );
    expect(headers).toContain(
      "/search\n  X-Robots-Tag: noindex, follow",
    );
    expect(headers).toContain(
      "/admin/*\n  X-Robots-Tag: noindex, nofollow, noarchive",
    );
    expect(headers).toContain(
      "/auth/*\n  X-Robots-Tag: noindex, nofollow, noarchive",
    );
    expect(headers).toContain(
      "/messages\n  X-Robots-Tag: noindex, nofollow, noarchive",
    );
  });

  it("allows the injected /studio prerender rule by its hash in every generated policy", () => {
    // 앱이 넣는 규칙 문자열과 생성기의 문자열이 한 글자라도 다르면 CSP 해시가 맞지 않아 규칙이 조용히 막힌다.
    expect(STUDIO_SPECULATION_RULES_JSON).toBe(buildSpeculationRulesJson(STUDIO_PRERENDER_URLS));
    const hash = `'sha256-${createHash("sha256").update(STUDIO_SPECULATION_RULES_JSON).digest("base64")}'`;
    const policy = withInlineScriptHashes(JSON.parse(readFileSync("config/http-response-headers.json", "utf8")));
    const rendered = renderCloudflareHeaders(policy);
    expect(rendered).toContain(hash);
    expect(readFileSync("apps/web/public/_headers", "utf8")).toContain(hash);
    expect(readFileSync("deploy/cloudflare-static/src/index.ts", "utf8")).toContain(hash);
    // 해시가 있으면 'inline-speculation-rules' 키워드는 무시되므로 키워드에 기대지 않는다.
    expect(rendered).not.toContain("'inline-speculation-rules'");
  });

  it("detaches a header that a narrower rule re-sets so Cloudflare does not join the values", () => {
    // Cloudflare _headers 는 겹치는 규칙의 같은 헤더를 쉼표로 이어 붙인다. 좁은 규칙은 '! 이름' 으로 먼저 뗀다.
    const rendered = renderCloudflareHeaders({
      headers: [
        { source: "/assets/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
        {
          source: "/assets/catalog/manifest.json",
          headers: [
            { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
            { key: "CDN-Cache-Control", value: "no-cache" },
          ],
        },
        { source: "/vrm/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=60" }] },
      ],
    });
    expect(rendered).toContain(
      "/assets/catalog/manifest.json\n  ! Cache-Control\n  Cache-Control: public, max-age=0, must-revalidate\n  CDN-Cache-Control: no-cache",
    );
    expect(rendered).toContain("/assets/*\n  Cache-Control: public, max-age=31536000, immutable");
    expect(rendered).toContain("/vrm/*\n  Cache-Control: public, max-age=60");
    expect(rendered.match(/! Cache-Control/gu)).toHaveLength(1);
  });

  it("gives the catalog manifests a single revalidating Cache-Control in production rules", () => {
    const headers = readFileSync("apps/web/public/_headers", "utf8");
    for (const manifest of ["/assets/studio/cc0-20260906/manifest.json", "/assets/studio/bundle-renders-v1/manifest.json"]) {
      expect(headers).toContain(`${manifest}\n  ! Cache-Control\n  Cache-Control: public, max-age=0, must-revalidate\n`);
    }
    // 떼는 곳은 두 매니페스트뿐이다. 다른 규칙의 헤더를 잘못 떼면 보안·캐시 헤더가 사라진다.
    expect(headers.match(/^ {2}! /gmu)).toHaveLength(2);
  });
});
