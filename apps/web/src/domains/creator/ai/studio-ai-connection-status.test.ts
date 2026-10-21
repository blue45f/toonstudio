import { describe, expect, it } from "vitest";

import {
  STUDIO_AI_CONNECTION_STATUS_META,
  STUDIO_AI_PANEL_CONNECTION_REGISTRY,
  studioAiConnectionKindForConfigured,
  studioAiPanelConnectionEntry,
} from "./studio-ai-connection-status";

describe("studio-ai-connection-status (E1/E2 판정 정본)", () => {
  it("configured 여부로 실행 가능/연결 필요를 가른다", () => {
    expect(studioAiConnectionKindForConfigured(true)).toBe("provider-ready");
    expect(studioAiConnectionKindForConfigured(false)).toBe("provider-unconfigured");
  });

  it("5가지 상태 모두 한국어 라벨과 사유를 가진다", () => {
    for (const meta of Object.values(STUDIO_AI_CONNECTION_STATUS_META)) {
      expect(meta.labelKo.length).toBeGreaterThan(0);
      expect(meta.detailKo.length).toBeGreaterThan(0);
    }
    expect(STUDIO_AI_CONNECTION_STATUS_META["not-connected"].labelKo).toContain("연결 전");
    expect(STUDIO_AI_CONNECTION_STATUS_META["provider-unconfigured"].detailKo).toContain("생성되지 않습니다");
  });

  it("레지스트리 id는 중복이 없고 모든 항목에 판정 근거가 있다", () => {
    const ids = STUDIO_AI_PANEL_CONNECTION_REGISTRY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of STUDIO_AI_PANEL_CONNECTION_REGISTRY) {
      expect(entry.execution.length).toBeGreaterThan(10);
      expect(entry.component.length).toBeGreaterThan(0);
    }
  });

  it("E2 두 표면은 연결 전 + 로컬 폴백으로 판정돼 있다", () => {
    for (const id of ["composition-brief", "story-seed"]) {
      const entry = studioAiPanelConnectionEntry(id);
      expect(entry?.base).toBe("not-connected-with-local-fallback");
      expect(entry?.fallbackKo).toBeTruthy();
    }
  });

  it("실연결 확인분(자동 채색·힌트·마스크)은 provider/local로 갈려 있다", () => {
    expect(studioAiPanelConnectionEntry("colorize")?.base).toBe("provider");
    expect(studioAiPanelConnectionEntry("onnx-colorize")?.base).toBe("local");
    expect(studioAiPanelConnectionEntry("auto-color-hints")?.base).toBe("local");
    expect(studioAiPanelConnectionEntry("colorize-mask")?.base).toBe("local");
  });
});
