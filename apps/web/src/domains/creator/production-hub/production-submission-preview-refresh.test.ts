// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioReviewMappedPage } from "@toonstudio/studio-project-model";
import { api } from "@/platform/api";
import type { StudioReviewPreviewRead } from "../project-graph/studio-project-graph-client";
import { refreshPinnedSubmissionPreview, resolveSubmissionVisualReview, SubmissionVisualReviewCaptureRequired,
  type PinnedSubmissionVisualSource } from "./production-submission-visual-review";
import { submissionVisualFixture } from "./production-submission-visual-review.test-fixture";

afterEach(() => vi.restoreAllMocks());

type MappedPreview = Omit<StudioReviewPreviewRead, "mapping"> & { readonly mapping: StudioReviewMappedPage };

function fixture(ordinals: readonly number[] = [0, 2, 9]) {
  const f = submissionVisualFixture();
  const original = resolveSubmissionVisualReview(f.aggregate, f.submission, f.project, f.revisions, f.reviews).submission;
  const source: PinnedSubmissionVisualSource = { ...original, revision: { ...original.revision,
    blobRefs: ordinals.map((ordinal) => ({ sha256: (ordinal + 1).toString(16).padStart(64, "0"), ordinal, role: "preview" as const })) } };
  const pages: MappedPreview[] = ordinals.map((ordinal): MappedPreview => ({
    sha256: (ordinal + 1).toString(16).padStart(64, "0"), ordinal, mediaType: "image/png", byteLength: 100,
    url: `https://preview.test/original/${ordinal}`, expiresAt: Date.now() + 29_000,
    mapping: { status: "mapped", version: 1, sourceServerRevision: 7, sourceContentDigest: source.revision.rootGraphHash,
      page: { id: `page-${ordinal}`, ordinal, width: 800, height: 1200, renderWidth: 800, renderHeight: 1200,
        frames: [{ id: `frame-${ordinal}`, bounds: { x: 40, y: 60, width: 200, height: 100 } }],
        elements: [{ id: `frame-${ordinal}`, type: "frame", origin: "page" }, { id: `text-${ordinal}`, type: "text", origin: "page" }] } },
  }));
  return { source, pages, page: (ordinal: number): MappedPreview => {
    const page = pages.find((entry) => entry.ordinal === ordinal);
    if (!page) throw new Error("지정한 preview fixture가 없습니다.");
    return page;
  } };
}

function subject(source: PinnedSubmissionVisualSource) {
  return { schemaVersion: 1, projectId: source.projectId, workId: source.workId, artifactId: source.artifact.id,
    reviewId: source.review.id, revisionId: source.revision.id, rootGraphHash: source.revision.rootGraphHash };
}

function renewed(page: StudioReviewPreviewRead): StudioReviewPreviewRead {
  return { ...page, url: `https://preview.test/renewed/${page.ordinal}`, expiresAt: Date.now() + 29_000 };
}

function response(source: PinnedSubmissionVisualSource, previews: readonly StudioReviewPreviewRead[], nextCursor: string | null = null) {
  return { ok: true, subject: subject(source), previews, nextCursor };
}

function requestUrl(path: unknown) {
  if (typeof path !== "string") throw new Error("preview HTTP 경로가 없습니다.");
  return new URL(path, "https://unit.test");
}

function changedSource(source: PinnedSubmissionVisualSource, kind: string): PinnedSubmissionVisualSource {
  switch (kind) {
    case "projectId": return { ...source, artifact: { ...source.artifact, projectId: "foreign-project" } };
    case "workId": return { ...source, workId: "" };
    case "revisionArtifact": return { ...source, revision: { ...source.revision, artifactId: "foreign-artifact" } };
    case "reviewArtifact": return { ...source, review: { ...source.review, artifactId: "foreign-artifact" } };
    case "reviewRevision": return { ...source, review: { ...source.review, revisionId: "foreign-revision" } };
    case "digest": return { ...source, sourceRevisionRef: { ...source.sourceRevisionRef, digest: `sha256:${"f".repeat(64)}` } };
    default: throw new Error("알 수 없는 source 변형입니다.");
  }
}

function changedMapping(mapping: StudioReviewMappedPage, kind: string): unknown {
  switch (kind) {
    case "status": return { status: "unmapped", reason: "legacy-review" };
    case "serverRevision": return { ...mapping, sourceServerRevision: 8 };
    case "digest": return { ...mapping, sourceContentDigest: "f".repeat(64) };
    case "pageId": return { ...mapping, page: { ...mapping.page, id: "another-page" } };
    case "ordinal": return { ...mapping, page: { ...mapping.page, ordinal: mapping.page.ordinal + 1 } };
    case "geometry": return { ...mapping, page: { ...mapping.page, width: 1600, height: 2400 } };
    case "renderGeometry": return { ...mapping, page: { ...mapping.page, renderWidth: 1600, renderHeight: 2400 } };
    case "frames": return { ...mapping, page: { ...mapping.page,
      frames: mapping.page.frames.map((frame) => ({ ...frame, bounds: { ...frame.bounds, x: frame.bounds.x + 1 } })) } };
    case "elements": return { ...mapping, page: { ...mapping.page,
      elements: mapping.page.elements.map((element) => element.type === "text" ? { ...element, type: "image" } : element) } };
    default: throw new Error("알 수 없는 mapping 변형입니다.");
  }
}

describe("완료한 고정 제출 원고 한 장의 preview 주소 갱신", () => {
  it("sparse·비정렬 manifest에서도 실제 직전 preview tuple로 한 번만 읽는다", async () => {
    const f = fixture([9, 0, 2]), current = f.page(2), fresh = renewed(current);
    const read = vi.spyOn(api, "get").mockResolvedValueOnce(response(f.source, [fresh, renewed(f.page(9))]));
    const result = await refreshPinnedSubmissionPreview(f.source, current);
    expect(result).toEqual(fresh);
    expect(current.url).toBe("https://preview.test/original/2");
    expect(read).toHaveBeenCalledOnce();
    const url = requestUrl(read.mock.calls[0]?.[0]);
    expect(url.pathname).toBe("/studio-project-graph/reviews/submission-review/previews");
    expect(url.searchParams.get("cursor")).toBe(`0.${f.page(0).sha256}`);
    const identity = subject(f.source);
    for (const key of ["projectId", "workId", "artifactId", "revisionId", "rootGraphHash"] as const) {
      expect(url.searchParams.get(key)).toBe(identity[key]);
    }
  });

  it("manifest 첫 장은 null cursor로 읽고 마지막 장도 직전 순번을 사용한다", async () => {
    const f = fixture([9, 0, 2]);
    const first = renewed(f.page(0)), last = renewed(f.page(9));
    const read = vi.spyOn(api, "get")
      .mockResolvedValueOnce(response(f.source, [first, renewed(f.page(2)), last]))
      .mockResolvedValueOnce(response(f.source, [last]));
    await expect(refreshPinnedSubmissionPreview(f.source, f.page(0))).resolves.toEqual(first);
    await expect(refreshPinnedSubmissionPreview(f.source, f.page(9))).resolves.toEqual(last);
    expect(read).toHaveBeenCalledTimes(2);
    expect(requestUrl(read.mock.calls[0]?.[0]).searchParams.get("cursor")).toBeNull();
    expect(requestUrl(read.mock.calls[1]?.[0]).searchParams.get("cursor")).toBe(`2.${f.page(2).sha256}`);
  });

  it("최대 32장인 한 batch를 검증한 뒤 nextCursor는 따라가지 않는다", async () => {
    const f = fixture(Array.from({ length: 34 }, (_, ordinal) => ordinal));
    const batch = f.pages.slice(0, 32).map(renewed), last = f.page(31);
    const read = vi.spyOn(api, "get").mockResolvedValueOnce(response(f.source, batch, `${last.ordinal}.${last.sha256}`));
    await expect(refreshPinnedSubmissionPreview(f.source, f.page(0))).resolves.toEqual(batch[0]);
    expect(read).toHaveBeenCalledOnce();
  });

  it.each([120_000, -1_000])("URL·만료 시각 외 값이 같으면 로컬 시계차이 %ims를 새 오류로 판단하지 않는다", async (offset) => {
    const f = fixture([0]), current = f.page(0), expiresAt = Date.now() + offset;
    const fresh = { ...renewed(current), expiresAt };
    const read = vi.spyOn(api, "get").mockResolvedValueOnce(response(f.source, [fresh]));
    await expect(refreshPinnedSubmissionPreview(f.source, { ...current, expiresAt: Date.now() - 2000 })).resolves.toEqual(fresh);
    expect(read).toHaveBeenCalledOnce();
  });

  it.each(["projectId", "workId", "revisionArtifact", "reviewArtifact", "reviewRevision", "digest"])(
    "source의 %s가 잘못되면 HTTP를 시작하지 않는다", async (kind) => {
      const f = fixture(), read = vi.spyOn(api, "get").mockRejectedValue(new Error("사전 검증 전에 HTTP를 호출했습니다."));
      await expect(refreshPinnedSubmissionPreview(changedSource(f.source, kind), f.page(2))).rejects.toThrow();
      expect(read).not.toHaveBeenCalled();
    },
  );

  it.each(["empty", "duplicate", "hash", "negative", "fraction", "overflow", "missingTarget"])(
    "원본 manifest의 %s 오류는 HTTP 전에 거절한다", async (kind) => {
      const f = fixture(), current = f.page(2), refs = f.source.revision.blobRefs;
      const first = refs[0];
      if (!first) throw new Error("원본 manifest fixture가 없습니다.");
      const blobRefs = kind === "empty" ? [] : kind === "duplicate" ? [...refs, first]
        : kind === "missingTarget" ? refs.filter((ref) => ref.ordinal !== current.ordinal)
          : refs.map((ref, index) => index !== 0 ? ref : { ...ref,
            ...(kind === "hash" ? { sha256: "invalid-hash" } : {}),
            ...(kind === "negative" ? { ordinal: -1 } : {}),
            ...(kind === "fraction" ? { ordinal: 0.5 } : {}),
            ...(kind === "overflow" ? { ordinal: 1_000_001 } : {}) });
      const read = vi.spyOn(api, "get").mockRejectedValue(new Error("사전 검증 전에 HTTP를 호출했습니다."));
      await expect(refreshPinnedSubmissionPreview({ ...f.source, revision: { ...f.source.revision, blobRefs } }, current)).rejects.toThrow();
      expect(read).not.toHaveBeenCalled();
    },
  );

  it.each(["hash", "ordinal", "mappingDigest", "mappingOrdinal", "url", "byteLength"])(
    "현재 대상의 %s가 원본 계약과 다르면 HTTP 전에 거절한다", async (kind) => {
      const f = fixture(), current = f.page(2);
      const invalid = { ...current,
        ...(kind === "hash" ? { sha256: "f".repeat(64) } : {}),
        ...(kind === "ordinal" ? { ordinal: 1 } : {}),
        ...(kind === "url" ? { url: "http://preview.test/current" } : {}),
        ...(kind === "byteLength" ? { byteLength: 0 } : {}),
        ...(kind === "mappingDigest" ? { mapping: { ...current.mapping, sourceContentDigest: "f".repeat(64) } } : {}),
        ...(kind === "mappingOrdinal" ? { mapping: { ...current.mapping, page: { ...current.mapping.page, ordinal: 0 } } } : {}) };
      const read = vi.spyOn(api, "get").mockRejectedValue(new Error("사전 검증 전에 HTTP를 호출했습니다."));
      await expect(refreshPinnedSubmissionPreview(f.source, invalid)).rejects.toThrow();
      expect(read).not.toHaveBeenCalled();
    },
  );

  it.each(["projectId", "workId", "artifactId", "reviewId", "revisionId", "rootGraphHash"] as const)(
    "응답 subject의 %s가 바뀌면 다른 원고로 대체하지 않는다", async (key) => {
      const f = fixture([0]), body = response(f.source, [renewed(f.page(0))]);
      const read = vi.spyOn(api, "get").mockResolvedValueOnce({ ...body,
        subject: { ...body.subject, [key]: key === "rootGraphHash" ? "f".repeat(64) : "foreign-subject" } });
      await expect(refreshPinnedSubmissionPreview(f.source, f.page(0))).rejects.toThrow();
      expect(read).toHaveBeenCalledOnce();
    },
  );

  it.each(["hash", "ordinal", "missing", "empty", "duplicate", "reversed", "oversized"])(
    "응답 batch의 %s 오류를 다른 페이지나 전체 재조회로 복구하지 않는다", async (kind) => {
      const f = fixture(Array.from({ length: 35 }, (_, ordinal) => ordinal)), current = f.page(2), fresh = renewed(current);
      const previews = kind === "empty" ? [] : kind === "missing" ? [renewed(f.page(3))]
        : kind === "duplicate" ? [fresh, fresh] : kind === "reversed" ? [renewed(f.page(3)), fresh]
          : kind === "oversized" ? f.pages.slice(2).map(renewed)
            : [{ ...fresh, ...(kind === "hash" ? { sha256: "f".repeat(64) } : {}), ...(kind === "ordinal" ? { ordinal: 1 } : {}) }];
      const read = vi.spyOn(api, "get").mockResolvedValueOnce(response(f.source, previews));
      await expect(refreshPinnedSubmissionPreview(f.source, current)).rejects.toThrow();
      expect(read).toHaveBeenCalledOnce();
    },
  );

  it.each(["not-a-cursor", `02.${"a".repeat(64)}`, `1000001.${"a".repeat(64)}`, `0.${"f".repeat(64)}`, `9.${"a".repeat(64)}`])(
    "형식이나 마지막 tuple이 다른 cursor %s를 거절한다", async (nextCursor) => {
      const f = fixture(), current = f.page(2);
      const read = vi.spyOn(api, "get").mockResolvedValueOnce(response(f.source, [renewed(current)], nextCursor));
      await expect(refreshPinnedSubmissionPreview(f.source, current)).rejects.toThrow();
      expect(read).toHaveBeenCalledOnce();
    },
  );

  it.each(["mediaType", "byteLength", "status", "serverRevision", "digest", "pageId", "ordinal", "geometry", "renderGeometry", "frames", "elements"])(
    "대상 immutable %s가 바뀌면 URL 갱신으로 받아들이지 않는다", async (kind) => {
      const f = fixture([0]), current = f.page(0), fresh = renewed(current);
      const changed = kind === "mediaType" ? { ...fresh, mediaType: "image/jpeg" as const }
        : kind === "byteLength" ? { ...fresh, byteLength: current.byteLength + 1 }
          : { ...fresh, mapping: changedMapping(current.mapping, kind) };
      const read = vi.spyOn(api, "get").mockResolvedValueOnce(response(f.source, [changed]));
      await expect(refreshPinnedSubmissionPreview(f.source, current)).rejects.toThrow();
      expect(read).toHaveBeenCalledOnce();
    },
  );

  it("기존 unmapped 사유도 다른 의미로 바꾸지 않고 같은 값의 URL 갱신은 허용한다", async () => {
    const f = fixture([0]);
    const current: StudioReviewPreviewRead = { ...f.page(0), mapping: { status: "unmapped", reason: "legacy-review" } };
    const fresh = renewed(current);
    const read = vi.spyOn(api, "get").mockResolvedValueOnce(response(f.source, [fresh]))
      .mockResolvedValueOnce(response(f.source, [{ ...fresh, mapping: { status: "unmapped", reason: "source-unavailable" } }]));
    await expect(refreshPinnedSubmissionPreview(f.source, current)).resolves.toEqual(fresh);
    await expect(refreshPinnedSubmissionPreview(f.source, current)).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each(["hash", "mapping", "url", "serverRevision", "pageId"])(
    "함께 받은 다른 페이지의 %s 오류도 검증에서 제외하지 않는다", async (kind) => {
      const f = fixture(), current = f.page(2), other = f.page(9);
      const invalid = { ...renewed(other),
        ...(kind === "hash" ? { sha256: "f".repeat(64) } : {}),
        ...(kind === "mapping" ? { mapping: null } : {}),
        ...(kind === "url" ? { url: "http://preview.test/other" } : {}),
        ...(kind === "serverRevision" ? { mapping: { ...other.mapping, sourceServerRevision: 8 } } : {}),
        ...(kind === "pageId" ? { mapping: { ...other.mapping, page: { ...other.mapping.page, id: current.mapping.page.id } } } : {}) };
      const read = vi.spyOn(api, "get").mockResolvedValueOnce(response(f.source, [renewed(current), invalid]));
      await expect(refreshPinnedSubmissionPreview(f.source, current)).rejects.toThrow();
      expect(read).toHaveBeenCalledOnce();
    },
  );

  it.each([403, 404])("HTTP %i는 같은 오류로 거절하고 다른 읽기를 시작하지 않는다", async (status) => {
    const f = fixture(), cause = Object.assign(new Error(`preview 접근 오류 ${status}`), { status, response: { status } });
    const read = vi.spyOn(api, "get").mockRejectedValueOnce(cause);
    await expect(refreshPinnedSubmissionPreview(f.source, f.page(2))).rejects.toBe(cause);
    expect(read).toHaveBeenCalledOnce();
  });

  it.each(["version-mismatch", "closed", "preview-unavailable"] as const)("서버 reason %s를 성공이나 fallback으로 바꾸지 않는다", async (reason) => {
    const f = fixture(), read = vi.spyOn(api, "get").mockResolvedValueOnce({ ok: false, reason });
    const result = refreshPinnedSubmissionPreview(f.source, f.page(2));
    if (reason === "preview-unavailable") await expect(result).rejects.toBeInstanceOf(SubmissionVisualReviewCaptureRequired);
    else await expect(result).rejects.toThrow(reason === "closed" ? "검수가 닫혔습니다" : "버전이 일치하지 않습니다");
    expect(read).toHaveBeenCalledOnce();
  });

  it("네트워크 오류도 그대로 거절하고 자동 재시도하지 않는다", async () => {
    const f = fixture(), cause = new Error("네트워크 연결이 끊겼습니다.");
    const read = vi.spyOn(api, "get").mockRejectedValueOnce(cause);
    await expect(refreshPinnedSubmissionPreview(f.source, f.page(2))).rejects.toBe(cause);
    expect(read).toHaveBeenCalledOnce();
  });

  it("이미 취소한 요청은 HTTP를 시작하지 않는다", async () => {
    const f = fixture(), controller = new AbortController();
    const read = vi.spyOn(api, "get").mockRejectedValue(new Error("취소 후 HTTP를 호출했습니다."));
    controller.abort();
    await expect(refreshPinnedSubmissionPreview(f.source, f.page(2), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(read).not.toHaveBeenCalled();
  });

  it("await 중 취소한 요청의 늦은 정상 응답을 반환하지 않는다", async () => {
    const f = fixture(), controller = new AbortController();
    let complete: ((value: unknown) => void) | undefined;
    const read = vi.spyOn(api, "get").mockImplementationOnce(() => new Promise<unknown>((resolve) => { complete = resolve; }));
    const result = refreshPinnedSubmissionPreview(f.source, f.page(2), { signal: controller.signal });
    const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    controller.abort();
    if (!complete) throw new Error("대기 중인 preview 응답이 없습니다.");
    complete(response(f.source, [renewed(f.page(2)), renewed(f.page(9))]));
    await assertion;
    expect(read).toHaveBeenCalledOnce();
  });

  it("await 중 호출자가 현재 preview를 변조해도 먼저 검증한 원고 값을 반환한다", async () => {
    const f = fixture(), current = structuredClone(f.page(2));
    const fresh = renewed(structuredClone(current));
    let complete: ((value: unknown) => void) | undefined;
    const read = vi.spyOn(api, "get").mockImplementationOnce(() => new Promise<unknown>((resolve) => { complete = resolve; }));
    const pending = refreshPinnedSubmissionPreview(f.source, current);
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    current.sha256 = "f".repeat(64);
    current.mapping.page.width = 1600;
    if (!complete) throw new Error("대기 중인 preview 응답이 없습니다.");
    complete(response(f.source, [fresh, renewed(f.page(9))]));
    const result = await pending;
    expect(result).toEqual(fresh);
    expect(result.mapping).not.toBe(current.mapping);
    expect(read).toHaveBeenCalledOnce();
  });
});
