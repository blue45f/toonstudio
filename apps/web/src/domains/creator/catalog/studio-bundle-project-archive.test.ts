import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildStudioProjectArchive, importStudioProjectArchive } from "../studio-project-archive";
import { prepareStudioBundleWorkAssetArchiveExport } from "./studio-bundle-project-archive";
import { STUDIO_BUNDLE_BG_SCENES } from "./studio-bundle-backgrounds";

const SCENE = STUDIO_BUNDLE_BG_SCENES[0];
if (!SCENE?.bundleSourceCredit) throw new Error("검증할 실제 번들 배경이 없습니다.");
const CREDIT = SCENE.bundleSourceCredit;
const BYTES = new Uint8Array(readFileSync(new URL("../../../../public/assets/studio/bundle-scenes-v1/cbv1-scene-park-garden.webp", import.meta.url)));
const project = (type: "frame" | "image" = "frame", withCredit = true) => ({ version: 2, title: "번들 배경 휴대성", pagesList: [{ id: "page", bg: "#ffffff", bgGrad: null, canvasH: 1080,
  elements: [{ id: "background", x: 20, y: 30, width: 720, height: 405, ...(type === "frame" ? { type: "frame" as const, bg: CREDIT.renderPath } : { type: "image" as const, src: CREDIT.renderPath, rotation: 0 }), bundleSourceCredit: withCredit ? CREDIT : undefined }],
}] });
const options = { crc32ExecutionMode: "direct-headless" as const };

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("번들 완성 배경의 실제 바이트 아카이브", () => {
  it.each(["frame", "image"] as const)("실제 %s 배경을 원본 해시로 포함하고 복구한 출처·배치를 유지한다", async (type) => {
    const fetcher = vi.fn(async () => new Response(BYTES, { headers: { "content-type": "image/webp" } }));
    vi.stubGlobal("fetch", fetcher);
    const source = project(type);
    const result = await buildStudioProjectArchive({ project: source }, options);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.isSelfContained).toBe(true);
    expect(result.manifest.attachments).toEqual([expect.objectContaining({ sha256: CREDIT.contentHash.slice(7), byteSize: BYTES.length })]);
    const restored = await importStudioProjectArchive(result.blob);
    const element = restored.project.pagesList[0]?.elements[0];
    expect(element).toMatchObject({ id: "background", x: 20, y: 30, width: 720, height: 405, bundleSourceCredit: CREDIT });
    if (!element || typeof element !== "object" || Array.isArray(element)) throw new Error("복구한 배경 요소가 객체가 아닙니다.");
    const body = type === "frame" ? "bg" in element && element.bg : "src" in element && element.src;
    expect(typeof body).toBe("string");
    if (typeof body !== "string") throw new Error("복구된 이미지 본문이 없습니다.");
    expect(createHash("sha256").update(Buffer.from(body.split(",")[1] ?? "", "base64")).digest("hex")).toBe(CREDIT.contentHash.slice(7));
    expect(source.pagesList[0]?.elements[0]).toMatchObject(type === "frame" ? { bg: CREDIT.renderPath } : { src: CREDIT.renderPath });
  });
});

it("동일 배경을 여러 요소에서 사용하면 본문은 한 번 읽고 모든 참조를 보존한다", async () => {
  const fetcher = vi.fn(async () => new Response(BYTES));
  vi.stubGlobal("fetch", fetcher);
  const source = project();
  const first = source.pagesList[0];
  if (!first?.elements[0]) throw new Error("검증할 프레임이 없습니다.");
  first.elements.push({ ...first.elements[0], id: "second", x: 100 });
  const result = await buildStudioProjectArchive({ project: source }, options);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result.manifest.attachments[0]?.documentReferences).toHaveLength(2);
});

it("출처와 다른 외부 URL은 요청하지 않고 명시적으로 실패한다", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const source = project();
  const frame = source.pagesList[0]?.elements[0];
  if (!frame || frame.type !== "frame") throw new Error("검증할 프레임이 없습니다.");
  frame.bg = `https://external.example${CREDIT.renderPath}`;
  await expect(buildStudioProjectArchive({ project: source }, options)).rejects.toThrow("경로");
  expect(fetcher).not.toHaveBeenCalled();
});

it("렌더 바이트 변조·읽기 실패·용량 초과를 self-contained 성공으로 보고하지 않는다", async () => {
  const changed = Buffer.from(BYTES);
  changed[changed.length - 1] = (changed[changed.length - 1] ?? 0) ^ 1;
  for (const response of [new Response(new Uint8Array(changed)), new Response(null, { status: 404 }), new Response(BYTES, { headers: { "content-length": "999999999" } })]) {
    vi.stubGlobal("fetch", vi.fn(async () => response));
    await expect(buildStudioProjectArchive({ project: project() }, options)).rejects.toThrow("번들");
  }
  vi.stubGlobal("fetch", vi.fn(async () => new Response(BYTES)));
  await expect(buildStudioProjectArchive({ project: project() }, { ...options, limits: { maxAttachmentBytes: 100 } })).rejects.toThrow("용량");
});

it("출처 계약이 없는 기존 배경 URL은 수집하지 않고 외부 의존성을 알린다", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const source = project("frame", false);
  const result = await buildStudioProjectArchive({ project: source }, options);
  expect(fetcher).not.toHaveBeenCalled();
  expect(result.isSelfContained).toBe(false);
  expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "EXTERNAL_PROJECT_DEPENDENCY", pointer: "/pagesList/0/elements/0/bg" })]));
});

it.each(["work-asset://image/background", CREDIT.renderPath])("이미 제공된 정확한 본문은 %s를 다시 요청하지 않고 기존 검증기로 왕복한다", async source => {
  const fetcher = vi.fn(async () => { throw new Error("오프라인"); });
  vi.stubGlobal("fetch", fetcher);
  const input = project("image");
  const image = input.pagesList[0]?.elements[0];
  if (!image || image.type !== "image") throw new Error("검증할 이미지가 없습니다.");
  image.src = source;
  const result = await buildStudioProjectArchive({ project: input, attachments: [{ kind: "raster", mimeType: "image/webp", data: BYTES,
    documentReferences: [{ pointer: "/pagesList/0/elements/0/src", usage: "raster" }],
  }] }, options);
  expect(fetcher).not.toHaveBeenCalled();
  expect(result.isSelfContained).toBe(true);
  const restored = await importStudioProjectArchive(result.blob);
  expect(restored.project.pagesList[0]?.elements[0]).toMatchObject({ bundleSourceCredit: CREDIT });
  expect(result.manifest.attachments[0]?.sha256).toBe(CREDIT.contentHash.slice(7));
});


function workImage() {
  const input = project("image");
  const image = input.pagesList[0]?.elements[0];
  if (!image || image.type !== "image") throw new Error("검증할 이미지가 없습니다.");
  image.src = "work-asset://image/background";
  return input;
}
function downloadedWorkImage() {
  return { manifest: { version: 1 as const, assetId: "background", elementType: "image" as const, mimeType: "image/webp" as const,
    byteSize: BYTES.length, sha256: CREDIT.contentHash.slice(7), intrinsicImage: { width: 2048, height: 1152, decodedRgbaBytes: 2048 * 1152 * 4 },
    descriptor: { version: 1 as const, element: { id: "background", type: "image" as const, x: 20, y: 30, width: 720, height: 405, rotation: 0, bundleSourceCredit: CREDIT } }, updatedAt: "2026-10-28T00:00:00Z" },
    blob: new Blob([BYTES], { type: "image/webp" }) };
}

it("서버 작품 이미지는 기존 인증 포트의 실제 본문을 현재 workId·요소 ID로 받아 무요청 archive 왕복한다", async () => {
  const input = workImage();
  const download = vi.fn(async () => downloadedWorkImage());
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  const attachments = await prepareStudioBundleWorkAssetArchiveExport({ project: input, workId: "authorized-work", signal: controller.signal }, { download });
  expect(download).toHaveBeenCalledWith("authorized-work", { assetId: "background", elementType: "image" }, expect.any(AbortSignal));
  const result = await buildStudioProjectArchive({ project: input, attachments }, options);
  expect(fetcher).not.toHaveBeenCalled();
  expect(result.isSelfContained).toBe(true);
  expect(result.manifest.attachments[0]?.sha256).toBe(CREDIT.contentHash.slice(7));
  const restored = await importStudioProjectArchive(result.blob);
  expect(restored.project.pagesList[0]?.elements[0]).toMatchObject({ bundleSourceCredit: CREDIT, x: 20, y: 30, width: 720, height: 405 });
});

it("작품 컨텍스트가 없는 opaque 참조는 원본 렌더로 대체하지 않고 외부 의존성을 명시한다", async () => {
  const input = workImage(), download = vi.fn(), fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect(await prepareStudioBundleWorkAssetArchiveExport({ project: input, workId: null }, { download })).toEqual([]);
  const result = await buildStudioProjectArchive({ project: input }, options);
  expect(download).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  expect(result.isSelfContained).toBe(false);
  expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "EXTERNAL_PROJECT_DEPENDENCY", pointer: "/pagesList/0/elements/0/src" })]));
});

it("공급 본문이 원본 credit SHA와 다르거나 opaque 요소 ID가 다르면 거부한다", async () => {
  const input = workImage();
  const other = new Uint8Array(readFileSync(new URL("../../../../public/assets/studio/bundle-scenes-v1/cbv1-scene-dungeon-study.webp", import.meta.url)));
  await expect(buildStudioProjectArchive({ project: input, attachments: [{ kind: "raster", data: other, mimeType: "image/webp", documentReferences: [{ pointer: "/pagesList/0/elements/0/src", usage: "raster" }] }] }, options)).rejects.toThrow("SHA");
  const image = input.pagesList[0]?.elements[0];
  if (!image || image.type !== "image") throw new Error("검증할 이미지가 없습니다.");
  image.src = "work-asset://image/another-id";
  await expect(buildStudioProjectArchive({ project: input }, options)).rejects.toThrow("식별자");
});

it("기존 다운로드 포트가 반환한 descriptor 출처·실제 본문·manifest ID의 불일치를 거부한다", async () => {
  const input = workImage(), good = downloadedWorkImage();
  for (const downloaded of [
    { ...good, manifest: { ...good.manifest, assetId: "other" } },
    { ...good, manifest: { ...good.manifest, descriptor: { ...good.manifest.descriptor, element: { ...good.manifest.descriptor.element, bundleSourceCredit: { ...CREDIT, licenseName: "다른 출처 기록" } } } } },
    { ...good, blob: new Blob([new Uint8Array(BYTES.length)], { type: "image/webp" }) },
  ]) await expect(prepareStudioBundleWorkAssetArchiveExport({ project: input, workId: "work" }, { download: async () => downloaded })).rejects.toThrow();
});

it("정적 렌더 응답이 멈춰도 30초 timeout으로 끝내고 caller 취소도 전달한다", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => new Promise<Response>(() => undefined)); vi.stubGlobal("fetch", fetcher);
  const pending = buildStudioProjectArchive({ project: project() }, options);
  const rejected = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
  await vi.advanceTimersByTimeAsync(30_001); await rejected;
  const controller = new AbortController(); controller.abort(new DOMException("취소", "AbortError"));
  await expect(buildStudioProjectArchive({ project: project() }, { ...options, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
});

it.each([true, false])("이미 취소된 opaque 아카이브는 본문 공급 여부(%s)와 관계없이 요청·ZIP 생성을 시작하지 않는다", async supplied => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController(); controller.abort(new DOMException("취소된 내보내기", "AbortError"));
  const onProgress = vi.fn();
  const attachments = supplied ? [{ kind: "raster" as const, mimeType: "image/webp", data: BYTES,
    documentReferences: [{ pointer: "/pagesList/0/elements/0/src", usage: "raster" as const }],
  }] : undefined;
  await expect(buildStudioProjectArchive({ project: workImage(), attachments }, { ...options, signal: controller.signal, onProgress })).rejects.toBe(controller.signal.reason);
  expect(fetcher).not.toHaveBeenCalled(); expect(onProgress).not.toHaveBeenCalled();
});

it("마지막 ZIP 파일 진행 중 취소해도 완성된 다운로드 성공으로 반환하지 않는다", async () => {
  const controller = new AbortController(), reason = new DOMException("ZIP 완료 직전 취소", "AbortError");
  const onProgress = vi.fn(({ completedFiles, totalFiles }: { completedFiles: number; totalFiles: number }) => {
    if (completedFiles === totalFiles) controller.abort(reason);
  });
  await expect(buildStudioProjectArchive({ project: workImage(), attachments: [{ kind: "raster", mimeType: "image/webp", data: BYTES,
    documentReferences: [{ pointer: "/pagesList/0/elements/0/src", usage: "raster" }],
  }] }, { ...options, signal: controller.signal, onProgress })).rejects.toBe(reason);
  expect(onProgress).toHaveBeenCalledTimes(3);
});

it("작품 이미지 Blob 읽기의 취소와 timeout도 다운로드 이후에 계속 보장한다", async () => {
  const controller = new AbortController(), downloaded = downloadedWorkImage(), reason = new DOMException("본문 읽기 취소", "AbortError");
  vi.spyOn(downloaded.blob, "arrayBuffer").mockImplementation(async () => {
    controller.abort(reason); return new ArrayBuffer(0);
  });
  await expect(prepareStudioBundleWorkAssetArchiveExport({ project: workImage(), workId: "work", signal: controller.signal }, { download: async () => downloaded })).rejects.toBe(reason);
  vi.useFakeTimers();
  const stalled = downloadedWorkImage(); vi.spyOn(stalled.blob, "arrayBuffer").mockImplementation(async () => new Promise<ArrayBuffer>(() => undefined));
  const pending = prepareStudioBundleWorkAssetArchiveExport({ project: workImage(), workId: "work" }, { download: async () => stalled });
  const rejected = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
  await vi.advanceTimersByTimeAsync(30_001); await rejected;
});
