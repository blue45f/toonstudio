import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * 호스트 배선 계약 (A2 첫 화면 간소화 + B1 저장 호스트 패치 묶음, 2026-10-22) —
 * 두 묶음 다 부품·모델만으로는 성립하지 않고, 호스트(StudioCuttoonEditorHost)가
 * 실제 신호와 핸들러를 렌더 트리에 전달해야 한다. 이 테스트는 그 소비 지점이
 * 사라지면 실패한다 (파일 존재가 아니라 배선을 고정한다).
 *
 * B1 배경: 저장 상태 부품(StudioSaveStatusBar·센터·ChromeMount)과 신호 보관소,
 * 배선 훅, 세대 콜백 패스스루는 main에 있었지만 호스트가 store를 만들지 않아
 * 에디터에 저장 표시가 닿지 않았다 (first-run F5.1과 같은 사고의 재현 방지).
 */
const HOST = "apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx";
const VIEW = "apps/web/src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorView.tsx";
const CHROME = "apps/web/src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorChrome.tsx";
const CREATE_MODE_GROUPS = "apps/web/src/domains/creator/StudioToolBeltCreateModeGroups.tsx";
const HUD_OVERLAYS = "apps/web/src/domains/creator/canvas/StudioCanvasViewportHudOverlays.tsx";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("studio save-status + first-screen host wiring", () => {
  it("host creates the save-sync store and feeds it the edit generation", () => {
    const host = read(HOST);
    expect(host).toContain("createStudioSaveSyncSignalStore()");
    expect(host).toContain(
      "onEditGeneration: (generation) => saveSyncStore.noteEditGeneration(generation)",
    );
  });

  it("host wires document identity + leadership into the signal store", () => {
    const host = read(HOST);
    expect(host).toContain("useStudioSaveSyncSignalWiring({");
    expect(host).toContain("store: saveSyncStore");
    expect(host).toContain("leadership: autosaveDocumentLeadership");
  });

  it("host records baseline, receipts and failures at the real autosave sites", () => {
    const host = read(HOST);
    expect(host).toContain("saveSyncStore.noteBaseline(");
    expect(host).toContain("saveSyncStore.noteDurableGeneration(scheduledGeneration)");
    expect(host).toContain("saveSyncStore.noteDurability(");
    // 정기 오토세이브 receipt와 긴급(페이지 숨김) receipt — 두 내구 경로 모두.
    expect(host.match(/saveSyncStore\.noteDurableReceipt\(\{/g)?.length).toBe(2);
    // tombstone 실패·정기 오토세이브 실패·긴급 저장 실패.
    expect(host.match(/saveSyncStore\.noteFailure\(Date\.now\(\)\)/g)?.length).toBe(3);
  });

  it("view mounts the save-status chrome from the host session and retries via the autosave nonce", () => {
    const host = read(HOST);
    expect(host).toContain("saveSyncStore={saveSyncStore}");
    expect(host).toContain("requestSaveFlush={() => setAutosaveRetryNonce((current) => current + 1)}");
    const view = read(VIEW);
    expect(view).toContain("<StudioSaveStatusChromeMount");
    expect(view).toContain("store={s.saveSyncStore}");
    expect(view).toContain("onRequestSaveFlush={s.requestSaveFlush}");
  });

  it("view feeds the first-publish suggestion through the chrome mount (A5 후속 호스트 마운트)", () => {
    const view = read(VIEW);
    // 콜백을 넘기지 않으면 제안이 무표시로 설계돼 있어, 마운트만으로는 동선이 살지 않는다.
    expect(view).toContain("publishSuggestion={{");
    // 1회성 scope는 문서 단위(오토세이브 문서 키)여야 한다.
    expect(view).toContain("scope: s.saveIntentScope?.documentKey");
    // 이미 게시된 문서는 제안 대상이 아니다.
    expect(view).toContain('alreadyPublished: s.loadedWork?.status === "published"');
    // CTA 도착지는 호스트의 게시 사전검사(게시 센터)다.
    expect(view).toContain("onCheckPublishReady: () => s.setPublishPreflightOpen(true)");
    const host = read(HOST);
    expect(host).toContain("setPublishPreflightOpen={setPublishPreflightOpen}");
  });

  it("quickstart yield is supplied by the host and consumed by the HUD (F4.1)", () => {
    const host = read(HOST);
    expect(host).toContain("const [quickStartYielded, setQuickStartYielded] = useState(false)");
    expect(host).toContain("function yieldQuickStart()");
    expect(host).toContain("yieldQuickStart,");
    expect(host).toContain("quickStartYielded");
    const hud = read(HUD_OVERLAYS);
    expect(hud).toContain("onYield={yieldQuickStart}");
  });

  it("first-screen advanced gate reaches the menubar toggle and the toolbar clusters (A2)", () => {
    const host = read(HOST);
    expect(host).toContain("uiAdvancedToolsExpanded={uiAdvancedToolsExpanded}");
    expect(host).toContain("setUiAdvancedToolsExpanded={setUiAdvancedToolsExpanded}");
    expect(host).toContain("uiFirstScreenExposure={uiFirstScreenExposure}");
    const chrome = read(CHROME);
    expect(chrome).toContain("uiAdvancedToolsExpanded={uiAdvancedToolsExpanded}");
    expect(chrome).toContain("uiFirstScreenExposure={uiFirstScreenExposure}");
    const groups = read(CREATE_MODE_GROUPS);
    expect(groups).toContain('uiFirstScreenExposure(region) === "visible"');
    for (const region of ["toolbar-reference", "toolbar-scene", "toolbar-style", "toolbar-ai"]) {
      expect(groups, region).toContain(`allows("${region}")`);
    }
  });
});
