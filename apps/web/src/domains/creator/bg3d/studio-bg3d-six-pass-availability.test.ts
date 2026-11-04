// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS } from "../contracts/studio-bg3d-six-pass-settings";
import { attachStudioBg3dEditorInsertHost } from "./studio-bg3d-editor-insert-host";
import { attachStudioBg3dEditorLtHost } from "./studio-bg3d-editor-lt-host";
import { studioBg3dSixPassUnavailableReason } from "./studio-bg3d-six-pass-availability";
import { captureStudioBg3dShot, createDefaultStudioBg3dSceneDocument, normalizeStudioBg3dSceneDocument, serializeStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import type { StudioBg3dSceneDocument, StudioBg3dSixPassLtSettings } from "./studio-bg3d-scene-document-types";

vi.mock("./studio-bg3d-editor-runtime-bindings", async () => {
  const { parseStudioBg3dSceneDocument } = await import("./studio-bg3d-scene-document");
  return { isStudioBg3dPhysicsTransientPhase: () => false,
    canonicalSceneDocument: (value: unknown) => parseStudioBg3dSceneDocument(JSON.stringify(value)) };
});

describe("6패스 LT 수신 문서 capability 사전 검사", () => {
  beforeEach(() => useI18n.setState({ lang: "ko" }));

  it("WebGL 지원과 관계없이 미지원 문서 표면의 이유를 먼저 표시한다", () => {
    const code = "six-pass-unsupported-document-surface";
    const supportedRenderer = studioBg3dSixPassUnavailableReason(code, true);
    expect(supportedRenderer).toContain("공동·기기 탭 동기화 및 마스터 편집");
    expect(studioBg3dSixPassUnavailableReason(code, false)).toBe(supportedRenderer);
    expect(supportedRenderer).toContain("일반 LT로 전환");
  });

  it("별도 수신기가 있는 standalone 캡처에는 문서 제한을 만들어 넣지 않는다", () => {
    expect(studioBg3dSixPassUnavailableReason(undefined, true)).toBeNull();
    expect(studioBg3dSixPassUnavailableReason(null, false)).toContain("Three.js WebGL");
    expect(studioBg3dSixPassUnavailableReason("수신 문서가 분리 레이어를 지원하지 않습니다.", true))
      .toBe("수신 문서가 분리 레이어를 지원하지 않습니다.");
  });

  it("언어를 바꾸면 capability 안내도 현재 언어를 사용한다", () => {
    useI18n.setState({ lang: "en" });
    expect(studioBg3dSixPassUnavailableReason("six-pass-unsupported-document-surface", true))
      .toContain("cross-tab");
    useI18n.setState({ lang: "ko" });
  });

  it("가져온 6패스 장면은 GPU·Worker·수신 콜백을 호출하기 전에 거부한다", async () => {
    const capture = vi.fn();
    const worker = vi.fn();
    const insert = vi.fn();
    const host = {
      sceneBaseDocument: { output: { sixPassLt: DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS } },
      sixPassLtUnavailableReason: "수신 문서 미지원",
      setError: vi.fn(), captureStudioBg3dRaster: capture,
      renderStudioBg3dLtLayersInWorker: worker, onInsert: insert,
      handleInsert: undefined as (() => Promise<void>) | undefined,
    };
    attachStudioBg3dEditorInsertHost(host);
    if (!host.handleInsert) throw new Error("삽입 핸들러 누락");
    await host.handleInsert();
    expect(host.setError).toHaveBeenCalledExactlyOnceWith("수신 문서 미지원");
    expect(capture).not.toHaveBeenCalled(); expect(worker).not.toHaveBeenCalled(); expect(insert).not.toHaveBeenCalled();
  });

  it("일반 LT에는 문서 6패스 제한을 적용하지 않는다", async () => {
    const host = { sceneBaseDocument: { output: {} }, sixPassLtUnavailableReason: "수신 문서 미지원",
      captureInFlightRef: { current: true }, setError: vi.fn(), handleInsert: undefined as (() => Promise<void>) | undefined };
    attachStudioBg3dEditorInsertHost(host);
    if (!host.handleInsert) throw new Error("삽입 핸들러 누락");
    await host.handleInsert();
    expect(host.setError).not.toHaveBeenCalled();
  });

  it("설정 적용은 막고 기존 6패스 설정의 일반 LT 전환은 명시 동작으로 허용한다", () => {
    const base = createDefaultStudioBg3dSceneDocument();
    const source = normalizeStudioBg3dSceneDocument({ ...base, output: { ...base.output, sixPassLt: DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS } });
    const host = { sceneBaseDocument: source, sixPassLtUnavailableReason: "수신 문서 미지원",
      physicsPhaseRef: { current: "idle" }, setError: vi.fn(), captureRef: { current: { adapter: { sixPassProfile: "supported" } } },
      setSceneBaseDocument: vi.fn<(value: StudioBg3dSceneDocument) => void>(), commitImmediateHistoryTransition: vi.fn(), primitives: [], customModels: [],
      updateSixPassLt: undefined as ((value: StudioBg3dSixPassLtSettings | null) => boolean) | undefined };
    attachStudioBg3dEditorLtHost(host);
    if (!host.updateSixPassLt) throw new Error("설정 핸들러 누락");
    expect(host.updateSixPassLt(DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS)).toBe(false);
    expect(host.commitImmediateHistoryTransition).not.toHaveBeenCalled();
    expect(host.updateSixPassLt(null)).toBe(true);
    expect(host.commitImmediateHistoryTransition).toHaveBeenCalledTimes(1);
    const { sixPassLt: _removedSettings, ...standardOutput } = source.output;
    expect(host.setSceneBaseDocument).toHaveBeenCalledWith({ ...source, version: 3, output: standardOutput });
    expect(source.output.sixPassLt).toEqual(DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS);
  });
  it("현재 출력만 일반 LT로 바꾸고 저장된 6패스 컷·activeShot·장면 v4를 보존한다", () => {
    const base = createDefaultStudioBg3dSceneDocument();
    const scene = normalizeStudioBg3dSceneDocument({ ...base, output: { ...base.output, sixPassLt: DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS } });
    const source = captureStudioBg3dShot(scene, { id: "saved-six", name: "기존 6패스 컷" });
    if (!source) throw new Error("저장된 6패스 컷 준비 실패");
    const shotBytes = JSON.stringify(source.shots);
    const host = { sceneBaseDocument: source, sixPassLtUnavailableReason: "수신 문서 미지원",
      physicsPhaseRef: { current: "idle" }, setError: vi.fn(), captureRef: { current: { adapter: { sixPassProfile: "supported" } } },
      setSceneBaseDocument: vi.fn<(value: StudioBg3dSceneDocument) => void>(), commitImmediateHistoryTransition: vi.fn(), primitives: [], customModels: [],
      updateSixPassLt: undefined as ((value: StudioBg3dSixPassLtSettings | null) => boolean) | undefined };
    attachStudioBg3dEditorLtHost(host);
    if (!host.updateSixPassLt) throw new Error("설정 핸들러 누락");
    expect(host.updateSixPassLt(null)).toBe(true);
    const saved = host.setSceneBaseDocument.mock.calls[0]?.[0];
    expect(saved?.version).toBe(4);
    expect(saved?.output).not.toHaveProperty("sixPassLt");
    expect(JSON.stringify(saved?.shots)).toBe(shotBytes);
    expect(saved?.activeShotId).toBe(source.activeShotId);
    expect(serializeStudioBg3dSceneDocument(saved)).not.toBeNull();
    expect(host.commitImmediateHistoryTransition).toHaveBeenCalledTimes(1);
    expect(source.output.sixPassLt).toEqual(DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS);
  });

});
