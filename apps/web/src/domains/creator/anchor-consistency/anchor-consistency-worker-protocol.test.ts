import { describe, expect, it } from "vitest";

import {
  ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION,
  isAnchorFeatureWorkerRequest,
  isAnchorFeatureWorkerResponse,
  parseAnchorImageFeatures,
} from "./anchor-consistency-worker-protocol";
import { extractAnchorFeatures } from "./anchor-image-features";
import { figureRaster, noiseRaster } from "./anchor-synthetic-raster";

type Json = Record<string, unknown>;

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 같은 참조를 돌려준다(중첩 객체를 제자리에서 고쳐야 하므로 복사하지 않는다). */
function asRecord(value: unknown): Json {
  if (!isJson(value)) throw new Error("객체여야 해요");
  return value;
}

function validJson(source: "figure" | "noise" = "figure"): Json {
  const features = extractAnchorFeatures(source === "figure" ? figureRaster() : noiseRaster(64, 64, 2));
  const parsed: unknown = JSON.parse(JSON.stringify(features));
  return asRecord(parsed);
}

/** 유효한 JSON 한 벌을 만들어 고친 뒤 돌려준다. */
function broken(change: (draft: Json) => void, source: "figure" | "noise" = "figure"): unknown {
  const draft = validJson(source);
  change(draft);
  return draft;
}

describe("요청·응답 모양 검사", () => {
  it("올바른 요청만 통과시킨다", () => {
    const ok = { version: ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION, kind: "extract", requestId: 1, width: 4, height: 4, pixels: new ArrayBuffer(64) };
    expect(isAnchorFeatureWorkerRequest(ok)).toBe(true);
    expect(isAnchorFeatureWorkerRequest({ ...ok, maxEdge: 64 })).toBe(true);
    expect(isAnchorFeatureWorkerRequest({ ...ok, version: 2 })).toBe(false);
    expect(isAnchorFeatureWorkerRequest({ ...ok, kind: "other" })).toBe(false);
    expect(isAnchorFeatureWorkerRequest({ ...ok, requestId: "1" })).toBe(false);
    expect(isAnchorFeatureWorkerRequest({ ...ok, width: 4.5 })).toBe(false);
    expect(isAnchorFeatureWorkerRequest({ ...ok, pixels: new Uint8Array(64) })).toBe(false);
    expect(isAnchorFeatureWorkerRequest(null)).toBe(false);
    expect(isAnchorFeatureWorkerRequest([])).toBe(false);
    expect(isAnchorFeatureWorkerRequest("extract")).toBe(false);
  });

  it("올바른 응답만 통과시키고, 모르는 오류 코드는 거른다", () => {
    const base = { version: ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION, requestId: 3 };
    expect(isAnchorFeatureWorkerResponse({ ...base, kind: "result", features: {} })).toBe(true);
    expect(isAnchorFeatureWorkerResponse({ ...base, kind: "result" })).toBe(false);
    expect(isAnchorFeatureWorkerResponse({ ...base, kind: "error", code: "empty-image" })).toBe(true);
    expect(isAnchorFeatureWorkerResponse({ ...base, kind: "error", code: "something-else" })).toBe(false);
    expect(isAnchorFeatureWorkerResponse({ ...base, kind: "error", code: 7 })).toBe(false);
    expect(isAnchorFeatureWorkerResponse({ ...base, kind: "progress" })).toBe(false);
    expect(isAnchorFeatureWorkerResponse({ ...base, version: 9, kind: "error", code: "cancelled" })).toBe(false);
    expect(isAnchorFeatureWorkerResponse({ version: ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION, kind: "error", code: "cancelled" })).toBe(false);
    expect(isAnchorFeatureWorkerResponse(undefined)).toBe(false);
  });
});

describe("특징 응답 검증", () => {
  it("정상 특징은 같은 값의 새 객체로 다시 만든다(원본과 다른 참조, 얼려 있음)", () => {
    const json = validJson();
    const parsed = parseAnchorImageFeatures(json);
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual(json);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.color.lHist)).toBe(true);
    expect(Object.isFrozen(parsed?.silhouette?.grid)).toBe(true);
    json.width = 9999;
    expect(parsed?.width).not.toBe(9999);
  });

  it("피사체를 가르지 못해 실루엣이 null 인 특징도 받아들인다", () => {
    const parsed = parseAnchorImageFeatures(validJson("noise"));
    expect(parsed?.silhouette).toBeNull();
    expect(parsed?.subject.mode).toBe("whole-image");
  });

  it("객체가 아니거나 버전이 다르면 거절한다", () => {
    expect(parseAnchorImageFeatures(null)).toBeNull();
    expect(parseAnchorImageFeatures([])).toBeNull();
    expect(parseAnchorImageFeatures("features")).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { draft.version = 2; }))).toBeNull();
  });

  it("크기·플래그가 어긋나면 거절한다", () => {
    expect(parseAnchorImageFeatures(broken((draft) => { draft.width = 0; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { draft.height = Number.NaN; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { draft.lowContrast = "no"; }))).toBeNull();
  });

  it("피사체 정보가 범위를 벗어나거나 모드가 모르는 값이면 거절한다", () => {
    expect(parseAnchorImageFeatures(broken((draft) => { asRecord(draft.subject).mode = "face-detected"; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { asRecord(draft.subject).coverage = 1.5; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { asRecord(draft.subject).backgroundFlatness = -0.1; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { asRecord(draft.subject).backgroundHex = "gray"; }))).toBeNull();
  });

  it("실루엣 격자 길이나 구간이 어긋나면 거절한다", () => {
    expect(parseAnchorImageFeatures(broken((draft) => { asRecord(draft.silhouette).grid = [0, 1]; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { asRecord(draft.silhouette).thirds = [0.5, 0.5]; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { asRecord(draft.silhouette).aspect = 0; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { asRecord(draft.silhouette).fill = 2; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { asRecord(asRecord(draft.silhouette).bbox).x1 = -1; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { draft.silhouette = "none"; }))).toBeNull();
  });

  it("색 통계의 히스토그램 길이와 값 범위를 확인한다", () => {
    expect(parseAnchorImageFeatures(broken((draft) => { asRecord(draft.color).lHist = [0.5, 0.5]; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { asRecord(draft.color).abHist = []; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { asRecord(draft.color).meanL = 120; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { asRecord(draft.color).stdL = Number.POSITIVE_INFINITY; }))).toBeNull();
  });

  it("팔레트 항목 수, 색 문자열, 점유율을 확인한다", () => {
    expect(parseAnchorImageFeatures(broken((draft) => { draft.palette = "red"; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => {
      const entry = { lab: [50, 10, 10], hex: "#aabbcc", share: 0.1 };
      draft.palette = [entry, entry, entry, entry, entry, entry];
    }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { draft.palette = [{ lab: [50, 10, 10], hex: "red", share: 0.5 }]; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { draft.palette = [{ lab: [50, 10], hex: "#aabbcc", share: 0.5 }]; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { draft.palette = [{ lab: [50, 10, 10], hex: "#aabbcc", share: 2 }]; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { draft.palette = [null]; }))).toBeNull();
  });

  it("구조 해시 형식과 영역 값을 확인한다", () => {
    expect(parseAnchorImageFeatures(broken((draft) => { asRecord(draft.structure).dHash = "abc"; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { asRecord(draft.structure).dHashMirrored = "ZZZZZZZZZZZZZZZZ"; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { asRecord(draft.structure).region = "face"; }))).toBeNull();
    expect(parseAnchorImageFeatures(broken((draft) => { draft.structure = null; }))).toBeNull();
  });

  it("빠진 필드가 하나라도 있으면 거절한다", () => {
    for (const key of ["width", "height", "subject", "silhouette", "color", "palette", "structure", "lowContrast"]) {
      expect(parseAnchorImageFeatures(broken((draft) => { delete draft[key]; }))).toBeNull();
    }
  });

  it("알 수 없는 추가 필드(예: 얼굴 정보)는 결과에 옮기지 않는다", () => {
    const parsed = parseAnchorImageFeatures(broken((draft) => {
      draft.faceBox = { x: 1, y: 2 };
      asRecord(draft.subject).embedding = [1, 2, 3];
    }));
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed ?? {})).not.toContain("faceBox");
    expect(Object.keys(parsed?.subject ?? {})).not.toContain("embedding");
  });
});
