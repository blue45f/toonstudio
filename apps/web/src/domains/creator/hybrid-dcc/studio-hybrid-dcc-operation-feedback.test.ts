import { describe, expect, it, vi } from "vitest";

import {
  describeStudioHybridDccOperationError,
  isStudioHybridDccRunResult,
} from "./studio-hybrid-dcc-operation-feedback";
import { StudioHybridDccLoopCutError } from "./studio-hybrid-dcc-loop-cut-workspace";
import { createStudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

const ko = (korean: string, _english: string): string => korean;
const en = (_korean: string, english: string): string => english;
const rawDetail = "종단 면 129코너: 내부 진단 번호 984321에서 절단이 중단됐습니다.";

describe("루프 절단 실패의 사용자 안내", () => {
  it.each([
    ["no-active-asset", "Select an object", "오브젝트"],
    ["missing-asset", "Select the object and edge again", "다시 선택"],
    ["no-edge", "Select the object and edge again", "다시 선택"],
    ["not-found", "Select the object and edge again", "다시 선택"],
    ["empty-selection", "Select the object and edge again", "다시 선택"],
    ["invalid-parameter", "between the edge endpoints", "두 끝점 사이"],
    ["budget-exceeded", "Split or simplify the model", "모델을 나누거나"],
    ["invalid-mesh", "mesh connections or UV source", "연결이나 UV"],
    ["non-manifold", "Repair the connections", "메시 연결"],
    ["topology-failed", "Choose another edge or cut position", "다른 모서리나 위치"],
    ["surface-unavailable", "faces that cannot be displayed", "표시할 수 없는 면"],
  ] as const)("%s는 진단 detail 대신 각 언어의 조치를 안내한다", (code, englishCue, koreanCue) => {
    const error = new StudioHybridDccLoopCutError(code, rawDetail);
    const english = describeStudioHybridDccOperationError(en, error);
    const korean = describeStudioHybridDccOperationError(ko, error);
    expect(english).toContain(englishCue);
    expect(korean).toContain(koreanCue);
    expect(english).not.toMatch(/[가-힣]/u);
    for (const text of [english, korean]) {
      expect(text).not.toContain(rawDetail);
      expect(text).not.toContain("984321");
      expect(text).not.toContain("129");
    }
    expect(error.code).toBe(code);
    expect(error.detail).toBe(rawDetail);
    expect(error.message).toBe(rawDetail);
  });

  it.each(["unknown", "missing"])("%s code에도 한국어·영어 기본 안내가 있고 raw detail을 노출하지 않는다", (kind) => {
    const error = new StudioHybridDccLoopCutError("topology-failed", rawDetail);
    if (kind === "unknown") Object.defineProperty(error, "code", { value: "future-loop-cut-code" });
    else Reflect.deleteProperty(error, "code");
    const korean = describeStudioHybridDccOperationError(ko, error);
    const english = describeStudioHybridDccOperationError(en, error);
    expect(korean).toContain("절단선을 만들지 못했습니다");
    expect(english).toContain("The loop cut could not be completed");
    expect(english).not.toMatch(/[가-힣]/u);
    expect(korean).not.toContain(rawDetail);
    expect(english).not.toContain("984321");
    expect(error.detail).toBe(rawDetail);
  });

  it("고정 ko/en 문장을 모두 bt에 전달해 번역 키가 없어도 언어별 기본값을 등록할 수 있다", () => {
    const bt = vi.fn(en);
    const result = describeStudioHybridDccOperationError(bt, new StudioHybridDccLoopCutError("budget-exceeded", rawDetail));
    expect(bt).toHaveBeenCalledOnce();
    const pair = bt.mock.calls[0];
    if (!pair) throw new Error("번역 기본값 쌍을 전달하지 않았습니다.");
    expect(pair[0]).toMatch(/[가-힣]/u);
    expect(pair[1]).not.toMatch(/[가-힣]/u);
    expect(pair[0].length).toBeGreaterThan(0);
    expect(pair[1]).toBe(result);
  });

  it.each([new Error(rawDetail), rawDetail, 129, undefined, null, { code: "budget-exceeded", detail: rawDetail }])(
    "다른 도구의 오류 %s는 기존 message/String 판정을 유지한다",
    (error) => {
      const bt = vi.fn(en);
      expect(describeStudioHybridDccOperationError(bt, error)).toBe(error instanceof Error ? error.message : String(error));
      expect(bt).not.toHaveBeenCalled();
    },
  );

  it("이름만 같은 일반 Error를 루프 절단 오류로 오인하지 않는다", () => {
    const error = new Error(rawDetail);
    error.name = "StudioHybridDccLoopCutError";
    expect(describeStudioHybridDccOperationError(en, error)).toBe(rawDetail);
  });
});

describe("패널 실행 결과의 기존 소유 속성 판정", () => {
  it("직접 반환한 workspace와 own workspace를 가진 실행 결과를 구별한다", () => {
    const workspace = createStudioHybridDccWorkspace("run-result-own");
    expect(isStudioHybridDccRunResult(workspace)).toBe(false);
    expect(isStudioHybridDccRunResult({ workspace })).toBe(true);
  });

  it("prototype에서 상속한 workspace는 실행 결과로 분류하지 않는다", () => {
    const workspace = createStudioHybridDccWorkspace("run-result-inherited");
    Object.setPrototypeOf(workspace, { workspace: createStudioHybridDccWorkspace("prototype-only") });
    expect("workspace" in workspace).toBe(true);
    expect(Object.hasOwn(workspace, "workspace")).toBe(false);
    expect(isStudioHybridDccRunResult(workspace)).toBe(false);
  });

  it("own 속성의 열거 가능성이나 값을 추가 검사하지 않아 기존 판정을 보존한다", () => {
    const workspace = createStudioHybridDccWorkspace("run-result-hidden-own");
    Object.defineProperty(workspace, "workspace", { value: undefined, enumerable: false });
    expect(Object.hasOwn(workspace, "workspace")).toBe(true);
    expect(isStudioHybridDccRunResult(workspace)).toBe(true);
  });

  it("own workspace getter를 호출하지 않고 소유 여부만 판정한다", () => {
    const workspace = createStudioHybridDccWorkspace("run-result-getter");
    const get = vi.fn(() => { throw new Error("getter를 읽으면 안 됩니다."); });
    Object.defineProperty(workspace, "workspace", { get });
    expect(isStudioHybridDccRunResult(workspace)).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });
});
