import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".pck": "application/octet-stream",
  ".png": "image/png",
  ".glb": "model/gltf-binary",
  ".json": "application/json",
};

const COOP = { "cross-origin-opener-policy": "same-origin" };

/**
 * Godot 빌드 변형. 키 = URL 첫 세그먼트(/g/<키>/...).
 *  n  : 단일 스레드, 격리 헤더 없음(운영 /play·/cuts·/godot-space 의 wasm 구성과 같은 종류, 단 운영은 별도 헤더 정책)
 *  nw : n 과 같되 HTTP 캐시 허용(워밍 시작 측정용). 응답이 압축되지 않아 43.7 MB 본문 그대로라 브라우저 캐시가 받아 주지 않을 수 있다.
 *  nz : n 과 같되 index.wasm·index.js 를 brotli(품질 9)로 압축해 보내고(content-encoding: br) HTTP 캐시를 허용한다. 운영의 sidecar 압축 전송과 비슷한 "압축 전송 + 캐시 가능" 조건이며 재방문 측정용이다.
 *  ni : 단일 스레드 + COOP same-origin + COEP credentialless (운영 /studio·/godot-space 헤더와 같은 조합)
 *  nr : 단일 스레드 + COOP same-origin + COEP require-corp
 *  t  : 스레드 빌드, 격리 헤더 없음(실패해야 정상)
 *  ti : 스레드 빌드 + credentialless 격리
 *  tr : 스레드 빌드 + require-corp 격리
 */
export const VARIANTS = {
  n: { dir: "web", headers: {}, cache: false },
  nw: { dir: "web", headers: {}, cache: true },
  nz: { dir: "web", headers: {}, cache: true, compress: true },
  ni: { dir: "web", headers: { ...COOP, "cross-origin-embedder-policy": "credentialless" }, cache: false },
  nr: { dir: "web", headers: { ...COOP, "cross-origin-embedder-policy": "require-corp" }, cache: false },
  t: { dir: "web-threads", headers: {}, cache: false },
  ti: { dir: "web-threads", headers: { ...COOP, "cross-origin-embedder-policy": "credentialless" }, cache: false },
  tr: { dir: "web-threads", headers: { ...COOP, "cross-origin-embedder-policy": "require-corp" }, cache: false },
};

/**
 * root 안으로 해석되는 경로만 돌려준다. 상위 이동(..)·절대 경로·구간 하나 안에 인코딩된 구분자(..%2F)는 null.
 * 요청 경로를 구간별로 디코드해 ".." 구간만 거르는 방식은 "../../x" 한 구간을 놓쳐 루트 밖 파일을 내줬다.
 */
export function resolveInside(root, relative) {
  if (typeof root !== "string" || root === "") return null;
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  return target === base || target.startsWith(`${base}${path.sep}`) ? target : null;
}

function sendFile(request, response, file, extraHeaders, packed) {
  if (!file || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
    return;
  }
  if (packed && /\bbr\b/u.test(String(request.headers["accept-encoding"] ?? ""))) {
    response.writeHead(200, {
      "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
      "content-length": packed.length,
      "content-encoding": "br",
      vary: "accept-encoding",
      ...extraHeaders,
    });
    if (request.method === "HEAD") response.end();
    else response.end(packed);
    return;
  }
  const size = statSync(file).size;
  response.writeHead(200, {
    "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
    "content-length": size,
    ...extraHeaders,
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}

/**
 * 정적 서버 두 개를 연다. 주 서버는 빌드·픽스처·Three 번들을 서빙하고, 보조 서버(다른 포트 = 다른 출처)는 CORP 없는 이미지를 서빙한다.
 * options: { buildDir, fixtureRoots: {이름: 경로}, threeBundleDir, threeVendorDir, hostDir, precompress }
 * precompress 가 true 면 시작할 때 `compress` 변형의 index.wasm·index.js 를 brotli(품질 9, 저장소 배포 파이프라인과 같은 설정)로 미리 압축해 둔다(요청 중 압축 시간이 측정에 섞이지 않게).
 */
export async function startServers(options) {
  const noStore = { "cache-control": "no-store" };
  const cacheable = { "cache-control": "public, max-age=3600" };
  const packedFiles = new Map();
  if (options.precompress) {
    for (const variant of Object.values(VARIANTS)) {
      if (!variant.compress) continue;
      for (const name of ["index.wasm", "index.js"]) {
        const file = path.resolve(options.buildDir, variant.dir, name);
        if (!existsSync(file) || packedFiles.has(file)) continue;
        const raw = readFileSync(file);
        packedFiles.set(file, brotliCompressSync(raw, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 9, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: raw.length } }));
      }
    }
  }
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts.includes("..")) {
      response.writeHead(400);
      response.end("bad path");
      return;
    }
    if (parts[0] === "g" && VARIANTS[parts[1]]) {
      const variant = VARIANTS[parts[1]];
      const rest = parts.slice(2).join("/") || "index.html";
      const target = resolveInside(path.join(options.buildDir, variant.dir), rest);
      sendFile(request, response, target, { ...variant.headers, ...(variant.cache ? cacheable : noStore) }, variant.compress && target ? packedFiles.get(target) : undefined);
      return;
    }
    if (parts[0] === "fixtures") {
      const name = parts[1] ?? "";
      const mapped = Object.hasOwn(options.fixtureRoots ?? {}, name) ? options.fixtureRoots[name] : undefined;
      sendFile(request, response, mapped ?? (options.fixtureDirs ?? []).map((dir) => resolveInside(dir, name)).find((candidate) => candidate !== null && existsSync(candidate)), noStore);
      return;
    }
    if (parts[0] === "three") {
      const iso = url.searchParams.get("iso");
      const headers = iso ? { ...COOP, "cross-origin-embedder-policy": iso } : {};
      sendFile(request, response, resolveInside(options.threeBundleDir, parts.slice(1).join("/") || "index.html"), { ...headers, ...noStore });
      return;
    }
    if (parts[0] === "vendor" && parts[1] === "three") {
      sendFile(request, response, resolveInside(options.threeVendorDir, parts.slice(2).join("/")), cacheable);
      return;
    }
    if (parts[0] === "host") {
      const iso = url.searchParams.get("iso");
      const headers = iso && iso !== "none" ? { ...COOP, "cross-origin-embedder-policy": iso } : {};
      sendFile(request, response, resolveInside(options.hostDir, parts.slice(1).join("/") || "embed.html"), { ...headers, ...noStore });
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  // 1x1 PNG. CORP 헤더를 일부러 보내지 않는다(COEP require-corp 에서 막히는 교차 출처 하위 리소스 재현용).
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const other = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "image/png", "content-length": png.length, "cache-control": "no-store" });
    response.end(png);
  });
  await new Promise((resolve) => other.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const otherPort = other.address().port;
  return {
    port,
    otherPort,
    origin: `http://127.0.0.1:${port}`,
    otherOrigin: `http://127.0.0.1:${otherPort}`,
    packedBytes: Object.fromEntries([...packedFiles].map(([file, buffer]) => [path.relative(options.buildDir, file), buffer.length])),
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await new Promise((resolve) => other.close(resolve));
    },
  };
}
