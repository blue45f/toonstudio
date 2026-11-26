import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  IMAGE_BUCKET_HEADER,
  IMAGE_DPR_MAX,
  IMAGE_DPR_MIN,
  IMAGE_FORMATS,
  IMAGE_FORMAT_HEADER,
  IMAGE_WIDTH_BUCKETS,
  IMMUTABLE_IMAGE_CACHE_CONTROL,
  REVALIDATE_IMAGE_CACHE_CONTROL,
  buildNegotiatedAssetCandidates,
  isContentHashedAssetPath,
  negotiateImageFormat,
  normalizeImageWidthBucket,
  serveNegotiatedStaticImage,
} from "./edge-image-negotiator.mjs";

const BASE = "https://www.toonstudio.cloud";

describe("negotiateImageFormat — RFC 9110 Accept 품질 가중치 협상", () => {
  it("표준 브라우저 Accept 헤더에서 avif > webp > original 우선순위로 포맷을 선택한다", () => {
    assert.equal(
      negotiateImageFormat("image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"),
      IMAGE_FORMATS.AVIF,
    );
    assert.equal(
      negotiateImageFormat("image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5"),
      IMAGE_FORMATS.WEBP,
    );
    assert.equal(
      negotiateImageFormat("image/png,image/jpeg;q=0.9,*/*;q=0.8"),
      IMAGE_FORMATS.ORIGINAL,
    );
  });

  it("동일 가중치면 avif를 우선하고, 명시적 q= 가중치가 더 큰 포맷을 존중한다", () => {
    assert.equal(negotiateImageFormat("image/webp;q=0.8, image/avif;q=0.8"), IMAGE_FORMATS.AVIF);
    assert.equal(negotiateImageFormat("image/avif;q=0.5, image/webp;q=0.9"), IMAGE_FORMATS.WEBP);
    assert.equal(negotiateImageFormat("image/webp;q=0.7, image/avif;q=0.85"), IMAGE_FORMATS.AVIF);
    assert.equal(negotiateImageFormat("IMAGE/AVIF; level=1; Q=0.001"), IMAGE_FORMATS.AVIF);
    assert.equal(negotiateImageFormat('image/avif; profile="a,b;q=0"; q=0.9, image/webp;q=0.5'), IMAGE_FORMATS.AVIF);
    assert.equal(negotiateImageFormat("image/webp;q=1.000, image/avif;q=0.999"), IMAGE_FORMATS.WEBP);
  });

  it("q=0(및 0.0/0.000) 배제를 엄격 적용하고 중복 항목에서도 배제를 fail-closed 유지한다", () => {
    assert.equal(negotiateImageFormat("image/avif;q=0, image/webp;q=0.8"), IMAGE_FORMATS.WEBP);
    assert.equal(negotiateImageFormat("image/avif;q=0.000, image/webp;q=0.0"), IMAGE_FORMATS.ORIGINAL);
    assert.equal(negotiateImageFormat("image/avif;q=0, image/avif;q=1"), IMAGE_FORMATS.ORIGINAL);
    assert.equal(negotiateImageFormat("image/webp;q=1, image/webp;q=0"), IMAGE_FORMATS.ORIGINAL);
  });

  it("와일드카드·미지원 포맷·비정상 헤더를 절대 현대 포맷으로 오인하지 않고 original로 닫는다", () => {
    const cases = [
      undefined,
      null,
      "",
      123,
      {},
      "*/*",
      "image/*",
      "image/jxl, image/heic, image/svg+xml",
      "image/avif;q=1.5",
      "image/avif;q=-0.1",
      "image/avif;q=1.001",
      "image/avif;q=0.1234",
      "image/avif;q=abc",
      "image/avif;q=",
      'image/avif;q="0.8"',
      "image/avif;q=0.8;q=0.9",
      "image/avif;q",
      "image/avif;;q=0.9",
      "image / avif",
      "image/avif\r\nX-Injected: 1",
      'image/avif;foo="unclosed',
    ];
    for (const header of cases) {
      assert.equal(negotiateImageFormat(header), IMAGE_FORMATS.ORIGINAL, String(header));
    }
    // 비정상 avif 항목은 무시하고 정상 webp 항목만 채택한다.
    assert.equal(negotiateImageFormat("image/avif;q=1.5, image/webp;q=0.8"), IMAGE_FORMATS.WEBP);
  });

  it("초대형·병리적 ReDoS 페이로드도 백트래킹 없이 선형 시간 내에 안전 종료한다", () => {
    const payloads = [
      `image/avif;${"a=1;".repeat(25_000)}`,
      "image/avif,".repeat(5_000),
      `image/avif${" ".repeat(12_000)};q=0.5`,
      ";".repeat(50_000),
    ];
    const started = performance.now();
    assert.equal(negotiateImageFormat(payloads[0]), IMAGE_FORMATS.ORIGINAL);
    assert.equal(negotiateImageFormat(payloads[1]), IMAGE_FORMATS.ORIGINAL);
    assert.equal(negotiateImageFormat(payloads[2]), IMAGE_FORMATS.AVIF);
    assert.equal(negotiateImageFormat(payloads[3]), IMAGE_FORMATS.ORIGINAL);
    assert.ok(performance.now() - started < 100, "Accept 파싱은 백트래킹 없이 100ms 이내에 끝나야 한다");
  });
});

describe("normalizeImageWidthBucket — DPR 클램프 및 캐시 카디널리티 폭증 차단", () => {
  it("DPR을 1..3으로 클램프하고 유효 폭을 고정 버킷 [320, 640, 960, 1280, 1920]에 매핑한다", () => {
    assert.deepEqual([...IMAGE_WIDTH_BUCKETS], [320, 640, 960, 1280, 1920]);
    assert.equal(IMAGE_DPR_MIN, 1);
    assert.equal(IMAGE_DPR_MAX, 3);

    assert.equal(normalizeImageWidthBucket(1, 1), 320);
    assert.equal(normalizeImageWidthBucket(320, 1), 320);
    assert.equal(normalizeImageWidthBucket(321, 1), 640);
    assert.equal(normalizeImageWidthBucket(320, 2), 640);
    assert.equal(normalizeImageWidthBucket(375, 2), 960);
    assert.equal(normalizeImageWidthBucket("375", "2.5"), 960);
    assert.equal(normalizeImageWidthBucket(400, 3), 1280);
    // DPR 10은 3으로 클램프되므로 400 * 3 = 1200 -> 1280 버킷(1920 폭증 방지)
    assert.equal(normalizeImageWidthBucket(400, 10), 1280);
    // DPR 0.1·음수는 1로 클램프되므로 320 * 1 = 320
    assert.equal(normalizeImageWidthBucket(320, 0.1), 320);
    assert.equal(normalizeImageWidthBucket(320, -4), 320);
    assert.equal(normalizeImageWidthBucket(4000, 3), 1920);
  });

  it("폭 누락·0·음수·비수치 입력에는 null을 반환해 잘못된 리사이즈를 막는다", () => {
    for (const invalid of [undefined, null, "", "  ", 0, -50, Number.NaN, Infinity, -Infinity, "640px", true, [320], {}]) {
      assert.equal(normalizeImageWidthBucket(invalid, 2), null, String(invalid));
    }
  });

  it("5,000건 무작위 폭·DPR 공격 조합에서도 출력 카디널리티가 정확히 5개 버킷으로 수렴한다", () => {
    const allowed = new Set(IMAGE_WIDTH_BUCKETS);
    const observed = new Set();
    for (let i = 1; i <= 5_000; i += 1) {
      const rawWidth = (i * 17.37) % 8000 + 0.5;
      const rawDpr = ((i * 13) % 40) - 5;
      const bucket = normalizeImageWidthBucket(rawWidth, rawDpr);
      assert.ok(allowed.has(bucket), `허용되지 않은 버킷: ${String(bucket)}`);
      observed.add(bucket);
    }
    assert.equal(observed.size, IMAGE_WIDTH_BUCKETS.length);
  });
});

describe("buildNegotiatedAssetCandidates — 후보 키 생성·캐시 정책·경로 보안", () => {
  it("콘텐츠 해시 이미지에 immutable 1년 캐시·Vary: Accept·정렬된 R2/Static 후보를 생성한다", () => {
    assert.equal(isContentHashedAssetPath("/assets/cover-a1b2c3d4.png"), true);
    assert.equal(isContentHashedAssetPath("/assets/panel-Bg8K3x2Z.jpg"), true);
    assert.equal(isContentHashedAssetPath(`/assets/bundle-v2/${"a1b2c3d4".repeat(8)}.png`), true);
    assert.equal(isContentHashedAssetPath("/brand/toonstudio-homepage.png"), false);
    assert.equal(isContentHashedAssetPath("/assets/cover.png"), false);

    const plan = buildNegotiatedAssetCandidates(
      "/assets/cover-a1b2c3d4.png",
      "image/avif,image/webp,*/*;q=0.8",
      2,
      375,
    );
    assert.equal(plan.negotiable, true);
    assert.equal(plan.preferredFormat, IMAGE_FORMATS.AVIF);
    assert.equal(plan.widthBucket, 960);
    assert.equal(plan.contentHashed, true);
    assert.equal(plan.vary, "Accept");
    assert.equal(plan.cacheControl, IMMUTABLE_IMAGE_CACHE_CONTROL);
    assert.equal(plan.headers.Vary, "Accept");
    assert.equal(plan.headers["Cache-Control"], IMMUTABLE_IMAGE_CACHE_CONTROL);
    assert.equal(plan.headers[IMAGE_FORMAT_HEADER], "avif");
    assert.equal(plan.headers[IMAGE_BUCKET_HEADER], "960");
    assert.deepEqual(
      plan.candidates.map((c) => c.key),
      [
        "assets/cover-a1b2c3d4.w960.avif",
        "assets/cover-a1b2c3d4.w960.webp",
        "assets/cover-a1b2c3d4.avif",
        "assets/cover-a1b2c3d4.webp",
        "assets/cover-a1b2c3d4.png",
      ],
    );
  });

  it("비해시 이미지·WebP 우선 가중치·q=0 배제·중복 제거·비협상 에셋을 정확히 처리한다", () => {
    const unhashed = buildNegotiatedAssetCandidates("/brand/toonstudio-homepage.png", "image/webp;q=0.9, image/avif;q=0.5");
    assert.equal(unhashed.contentHashed, false);
    assert.equal(unhashed.cacheControl, REVALIDATE_IMAGE_CACHE_CONTROL);
    assert.deepEqual(
      unhashed.candidates.map((c) => c.pathname),
      ["/brand/toonstudio-homepage.webp", "/brand/toonstudio-homepage.avif", "/brand/toonstudio-homepage.png"],
    );

    const noAvif = buildNegotiatedAssetCandidates("/assets/hero-a1b2c3d4.jpg", "image/avif;q=0, image/webp;q=0.8");
    assert.deepEqual(noAvif.candidates.map((c) => c.pathname), ["/assets/hero-a1b2c3d4.webp", "/assets/hero-a1b2c3d4.jpg"]);

    const webpSource = buildNegotiatedAssetCandidates("/assets/virtual-studio/a.WEBP", "image/avif, image/webp");
    assert.deepEqual(webpSource.candidates.map((c) => c.pathname), ["/assets/virtual-studio/a.avif", "/assets/virtual-studio/a.WEBP"]);

    const avifSourceSafari = buildNegotiatedAssetCandidates("/assets/hero-a1b2c3d4.avif", "image/webp");
    assert.deepEqual(avifSourceSafari.candidates.map((c) => c.pathname), ["/assets/hero-a1b2c3d4.webp", "/assets/hero-a1b2c3d4.avif"]);

    const svgPlan = buildNegotiatedAssetCandidates("/assets/logo-a1b2c3d4.svg", "image/avif, image/webp");
    assert.equal(svgPlan.negotiable, false);
    assert.equal(svgPlan.vary, null);
    assert.deepEqual(svgPlan.candidates.map((c) => c.pathname), ["/assets/logo-a1b2c3d4.svg"]);
  });

  it("경로 역탐색·인코딩 우회·제어문자가 포함된 위험 경로는 후보를 비우고 no-store로 거부한다", () => {
    for (const unsafe of ["", "/", "/assets/../secret.png", "/assets/%2e%2e/secret.png", "/assets//a.png", "/assets/a.png\0.jpg", "https://evil.test/a.png"]) {
      const plan = buildNegotiatedAssetCandidates(unsafe, "image/avif");
      assert.equal(plan.candidates.length, 0, unsafe);
      assert.equal(plan.cacheControl, "no-store", unsafe);
    }
  });
});

describe("serveNegotiatedStaticImage — 변형 조회·Vary 격리·무중단 원본 폴백", () => {
  it("사전 인코딩된 AVIF 버킷 변형이 있으면 1회 조회로 서빙하고 표준 헤더를 부여한다", async () => {
    const probed = [];
    const response = await serveNegotiatedStaticImage(
      new Request(`${BASE}/assets/cover-a1b2c3d4.png?w=375&dpr=2`, {
        headers: { accept: "image/avif,image/webp,*/*;q=0.8", cookie: "sid=secret", authorization: "Bearer secret" },
      }),
      async (candidate, variantRequest) => {
        probed.push(candidate.key);
        assert.equal(variantRequest.headers.get("cookie"), null);
        assert.equal(variantRequest.headers.get("authorization"), null);
        if (candidate.key === "assets/cover-a1b2c3d4.w960.avif") {
          return new Response("avif-960-bytes", { status: 200, headers: { etag: '"avif-960"' } });
        }
        return new Response(null, { status: 404 });
      },
    );

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "avif-960-bytes");
    assert.deepEqual(probed, ["assets/cover-a1b2c3d4.w960.avif"]);
    assert.equal(response.headers.get("content-type"), "image/avif");
    assert.equal(response.headers.get("vary"), "Accept");
    assert.equal(response.headers.get("cache-control"), IMMUTABLE_IMAGE_CACHE_CONTROL);
    assert.equal(response.headers.get(IMAGE_FORMAT_HEADER), "avif");
    assert.equal(response.headers.get(IMAGE_BUCKET_HEADER), "960");
  });

  it("AVIF·WebP 변형이 없거나 오류·SPA HTML 폴백을 반환해도 원본 이미지로 무중단 폴백한다", async () => {
    const probed = [];
    const response = await serveNegotiatedStaticImage(
      new Request(`${BASE}/assets/cover-a1b2c3d4.png?w=320&dpr=2`, {
        headers: { accept: "image/avif, image/webp, */*;q=0.8" },
      }),
      async (candidate) => {
        probed.push(candidate.key);
        if (candidate.key.endsWith(".w640.avif")) return new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
        if (candidate.key.endsWith(".w640.webp")) return null;
        if (candidate.key.endsWith(".avif")) throw new Error("transient r2 miss");
        if (candidate.key.endsWith(".webp")) return new Response(null, { status: 404 });
        return new Response("png-original-bytes", { status: 200, headers: { "content-type": "image/png" } });
      },
    );

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "png-original-bytes");
    assert.deepEqual(probed, [
      "assets/cover-a1b2c3d4.w640.avif",
      "assets/cover-a1b2c3d4.w640.webp",
      "assets/cover-a1b2c3d4.avif",
      "assets/cover-a1b2c3d4.webp",
      "assets/cover-a1b2c3d4.png",
    ]);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("vary"), "Accept");
    assert.equal(response.headers.get(IMAGE_FORMAT_HEADER), "original");
    assert.equal(response.headers.get(IMAGE_BUCKET_HEADER), "original");
  });

  it("동일 URL의 AVIF·WebP·원본 응답 모두에 Vary: Accept를 일관 부착해 캐시 오염을 방지한다", async () => {
    const store = new Map([
      ["assets/hero-a1b2c3d4.avif", { body: "avif-body", type: "image/avif" }],
      ["assets/hero-a1b2c3d4.webp", { body: "webp-body", type: "image/webp" }],
      ["assets/hero-a1b2c3d4.png", { body: "png-body", type: "image/png" }],
    ]);
    const fetchFromStore = async (candidate) => {
      const hit = store.get(candidate.key);
      if (!hit) return null;
      return new Response(hit.body, {
        status: 200,
        headers: { "content-type": hit.type, vary: "Sec-Fetch-Site, accept" },
      });
    };

    const varyAwareCache = new Map();
    async function requestWithEdgeCache(accept) {
      const url = `${BASE}/assets/hero-a1b2c3d4.png`;
      const req = new Request(url, { headers: { accept } });
      const res = await serveNegotiatedStaticImage(req, fetchFromStore);
      const varyHeader = res.headers.get("vary") ?? "";
      assert.ok(varyHeader.split(",").map((v) => v.trim()).includes("Accept"));
      const cacheKey = `${url}|${varyHeader}|${accept}`;
      varyAwareCache.set(cacheKey, await res.clone().text());
      return res;
    }

    const avifRes = await requestWithEdgeCache("image/avif,image/webp,*/*");
    const webpRes = await requestWithEdgeCache("image/webp,image/png,*/*");
    const pngRes = await requestWithEdgeCache("image/png,*/*");

    assert.equal(avifRes.headers.get("vary"), "Sec-Fetch-Site, Accept");
    assert.equal(webpRes.headers.get("vary"), "Sec-Fetch-Site, Accept");
    assert.equal(pngRes.headers.get("vary"), "Sec-Fetch-Site, Accept");
    assert.equal(await avifRes.text(), "avif-body");
    assert.equal(await webpRes.text(), "webp-body");
    assert.equal(await pngRes.text(), "png-body");
    assert.equal(varyAwareCache.size, 3);
  });

  it("HEAD·304·private 캐시 보존·SPA 원본 미스 404·비허용 메서드 405·경로 공격 400을 처리한다", async () => {
    const headRes = await serveNegotiatedStaticImage(
      new Request(`${BASE}/assets/cover-a1b2c3d4.png`, { method: "HEAD", headers: { accept: "image/avif" } }),
      async () => new Response("ignored-head-body", { status: 200, headers: { "content-type": "image/avif" } }),
    );
    assert.equal(headRes.status, 200);
    assert.equal(await headRes.text(), "");
    assert.equal(headRes.headers.get("vary"), "Accept");

    const notModified = await serveNegotiatedStaticImage(
      new Request(`${BASE}/assets/cover-a1b2c3d4.png`, { headers: { accept: "image/webp", "if-none-match": '"e1"' } }),
      async () => new Response(null, { status: 304, headers: { etag: '"e1"' } }),
    );
    assert.equal(notModified.status, 304);
    assert.equal(notModified.headers.get("vary"), "Accept");

    const privateRes = await serveNegotiatedStaticImage(
      new Request(`${BASE}/assets/cover-a1b2c3d4.png`, { headers: { accept: "image/png" } }),
      async () => new Response("priv", { status: 200, headers: { "content-type": "image/png", "cache-control": "private, no-store" } }),
    );
    assert.equal(privateRes.headers.get("cache-control"), "private, no-store");

    const htmlFallback404 = await serveNegotiatedStaticImage(
      new Request(`${BASE}/assets/missing-a1b2c3d4.png`, { headers: { accept: "image/avif" } }),
      async () => new Response("<html>spa</html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    assert.equal(htmlFallback404.status, 404);
    assert.equal(htmlFallback404.headers.get("cache-control"), "no-store");
    assert.equal(htmlFallback404.headers.get("vary"), "Accept");

    const methodNotAllowed = await serveNegotiatedStaticImage(
      new Request(`${BASE}/assets/cover-a1b2c3d4.png`, { method: "POST" }),
      async () => { throw new Error("should not call"); },
    );
    assert.equal(methodNotAllowed.status, 405);
    assert.equal(methodNotAllowed.headers.get("allow"), "GET, HEAD");

    let calledOnTraversal = false;
    const traversalInputs = [
      new Request(`${BASE}/assets/%2fsecret.png`),
      new Request(`${BASE}/assets//double-slash.png`),
      new Request(`${BASE}/assets/%5csecret.png`),
      { url: `${BASE}/assets/%2e%2e/secret.png`, method: "GET", headers: new Headers() },
    ];
    for (const badReq of traversalInputs) {
      const traversal = await serveNegotiatedStaticImage(badReq, async () => { calledOnTraversal = true; return null; });
      assert.equal(traversal.status, 400);
    }
    assert.equal(calledOnTraversal, false);

    const originThrow = await serveNegotiatedStaticImage(
      new Request(`${BASE}/assets/cover-a1b2c3d4.png`, { headers: { accept: "image/png" } }),
      async () => { throw new Error("r2 unavailable"); },
    );
    assert.equal(originThrow.status, 502);
    assert.equal(originThrow.headers.get("vary"), "Accept");
  });
});
