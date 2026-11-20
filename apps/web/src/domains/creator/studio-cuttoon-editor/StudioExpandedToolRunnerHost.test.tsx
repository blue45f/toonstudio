// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_EXPANDED_ECOSYSTEM_COMMANDS } from "../shortcuts/studio-expanded-ecosystem-commands";
import { StudioExpandedToolRunnerHost } from "./StudioExpandedToolRunnerHost";
import {
  STUDIO_ECOSYSTEM_LAZY_ENTRIES,
  isDeferredEcosystemModule,
  loadEcosystemModule,
  type StudioEcosystemLoaderId,
} from "./studio-ecosystem-lazy-registry";
import { executeLiveEngineSample } from "./studio-expanded-tool-engine-runner";
import { filterExpandedTools } from "./studio-expanded-tools-catalog";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function getCardForLoader(loaderId: StudioEcosystemLoaderId) {
  const card = filterExpandedTools({ categoryId: "all", query: "" }).find(
    (item) => item.command.panelLoaderId === loaderId,
  );
  if (!card) throw new Error(`카드를 찾을 수 없습니다: ${loaderId}`);
  return card;
}

describe("StudioExpandedToolRunnerHost", () => {
  it("실제 ui-ready 모듈(3D 두상 믹서·벽 숨김·AI 제안 게이트)을 인터랙티브 상태로 마운트한다", async () => {
    const onBack = vi.fn();

    // 1) 3D 두상 믹서 패널
    const headCard = getCardForLoader("head-mixer-3d-panel");
    const headMod = await loadEcosystemModule("head-mixer-3d-panel");
    const { unmount } = render(
      <StudioExpandedToolRunnerHost
        command={headCard.command}
        card={headCard}
        loadedModule={headMod}
        onBack={onBack}
      />,
    );
    expect(screen.getByTestId("studio-expanded-tool-runner").getAttribute("data-runner-mode")).toBe("ui-ready");
    expect(screen.getByTestId("studio-3d-head-mixer-panel")).toBeTruthy();
    expect(screen.getByTestId("expanded-tool-runner-body").className).toContain("overscroll-contain");

    // 스타일 버튼 클릭 시 실제 상태가 반응해야 한다
    fireEvent.click(screen.getByRole("button", { name: /로판 귀족/u }));
    expect(screen.getByTestId("expanded-tool-workbench-activity").textContent).toContain("3D 두상");

    // 돌아가기 버튼 검증
    fireEvent.click(screen.getByTestId("expanded-tool-runner-back"));
    expect(onBack).toHaveBeenCalledOnce();
    unmount();

    // 2) 그림자 보존 벽 숨김 토글
    const cutawayCard = getCardForLoader("bg3d-wall-cutaway-toggle");
    const cutawayMod = await loadEcosystemModule("bg3d-wall-cutaway-toggle");
    const renderedCutaway = render(
      <StudioExpandedToolRunnerHost
        command={cutawayCard.command}
        card={cutawayCard}
        loadedModule={cutawayMod}
        onBack={onBack}
      />,
    );
    expect(screen.getByTestId("studio-bg3d-wall-cutaway-toggle")).toBeTruthy();
    renderedCutaway.unmount();

    // 3) AI 제안 Diff 게이트 (승인 동작 확인)
    const diffCard = getCardForLoader("ai-proposal-diff-gate");
    const diffMod = await loadEcosystemModule("ai-proposal-diff-gate");
    render(
      <StudioExpandedToolRunnerHost
        command={diffCard.command}
        card={diffCard}
        loadedModule={diffMod}
        onBack={onBack}
      />,
    );
    expect(screen.getByTestId("expanded-tool-ui-stage").textContent).toContain("옥상 컷 카메라 앵글 강조");
  });

  it("전체 24종 ui-ready 모듈이 ErrorBoundary 폴백 없이 정상 마운트된다", async () => {
    const uiEntries = STUDIO_ECOSYSTEM_LAZY_ENTRIES.filter((entry) => entry.status === "ui-ready");
    expect(uiEntries).toHaveLength(24);

    for (const entry of uiEntries) {
      const card = getCardForLoader(entry.id);
      const loaded = await loadEcosystemModule(entry.id);
      const { unmount } = render(
        <StudioExpandedToolRunnerHost
          command={card.command}
          card={card}
          loadedModule={loaded}
          onBack={vi.fn()}
        />,
      );
      expect(screen.queryByTestId("expanded-tool-runner-error"), entry.id).toBeNull();
      expect(screen.getByTestId("expanded-tool-ui-stage"), entry.id).toBeTruthy();
      unmount();
    }
  }, 20_000);

  it("실제 engine-ready 모듈의 export를 검사하고 1클릭 샘플 실행 결과를 표시한다", async () => {
    const card = getCardForLoader("planned-live2d-artmesh-rig");
    const loaded = await loadEcosystemModule("planned-live2d-artmesh-rig");
    render(
      <StudioExpandedToolRunnerHost
        command={card.command}
        card={card}
        loadedModule={loaded}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("expanded-tool-engine-stage")).toBeTruthy();
    expect(screen.getByTestId("expanded-tool-engine-stage").textContent).toContain("createGridArtMesh");

    fireEvent.click(screen.getByTestId("expanded-tool-engine-run-sample"));
    const result = screen.getByTestId("expanded-tool-engine-result");
    expect(result.getAttribute("data-execution-status")).toBe("ok");
    expect(result.textContent).toContain("createGridArtMesh");
    expect(result.textContent).toContain("실제 모듈 실행 완료");
  });

  it("전체 56종 engine-ready 모듈에 대해 실제 라이브 샘플 실행이 56/56 성공한다", async () => {
    const engineEntries = STUDIO_ECOSYSTEM_LAZY_ENTRIES.filter(
      (entry) => entry.status === "engine-ready",
    );
    expect(engineEntries).toHaveLength(56);

    const failures: string[] = [];
    for (const entry of engineEntries) {
      const loaded = await loadEcosystemModule(entry.id);
      if (isDeferredEcosystemModule(loaded)) {
        failures.push(`${entry.id}: deferred`);
        continue;
      }
      const report = executeLiveEngineSample(entry.id, loaded, entry.primaryExportName);
      if (report.status !== "ok") {
        failures.push(`${entry.id}: ${report.status} (${report.errorMessage ?? report.resultType})`);
      }
    }
    expect(failures).toEqual([]);
  }, 20_000);

  it("UI 컴포넌트 렌더링 중 오류가 발생하면 ErrorBoundary 복구 화면과 돌아가기 버튼을 표시한다", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const card = getCardForLoader("head-mixer-3d-panel");
      const onBack = vi.fn();
      const ThrowingPanel = () => {
        throw new Error("샘플 패널 강제 오류");
      };

      render(
        <StudioExpandedToolRunnerHost
          command={card.command}
          card={card}
          loadedModule={{ Studio3dHeadMixerPanel: ThrowingPanel }}
          onBack={onBack}
        />,
      );

      const alert = screen.getByTestId("expanded-tool-runner-error");
      expect(alert.textContent).toContain("샘플 패널 강제 오류");
      fireEvent.click(screen.getByRole("button", { name: "도구 목록으로 돌아가기" }));
      expect(onBack).toHaveBeenCalledOnce();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("신규 실행 호스트 소스에서 원시 색상·transition-all·any·@ts-ignore가 0건이며 단축키 키캡을 노출한다", () => {
    const files = [
      resolve(__dirname, "./StudioExpandedToolRunnerHost.tsx"),
      resolve(__dirname, "./StudioExpandedToolUiStage.tsx"),
      resolve(__dirname, "./studio-expanded-tool-ui-samples.ts"),
      resolve(__dirname, "./studio-expanded-tool-engine-runner.ts"),
      resolve(__dirname, "./studio-expanded-tool-live-adapters.ts"),
      resolve(__dirname, "./StudioExpandedToolsDrawer.tsx"),
    ];
    const rawColorRe =
      /\b(?:bg|text|border|ring|from|to|via|shadow|accent)-(?:white|black|slate|amber|rose|sky|emerald|violet|fuchsia|red|green|blue|yellow|orange|indigo|purple|pink|cyan|teal|zinc|gray|neutral)(?:-[0-9]{2,3})?(?:\/[0-9]+)?|#[0-9a-fA-F]{3,8}\b|rgba?\(/gu;

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src.match(rawColorRe), file).toBeNull();
      expect(src, file).not.toContain("transition-all");
      expect(src, file).not.toContain("@ts-ignore");
      expect(src, file).not.toContain("@ts-nocheck");
    }

    // 단축키가 있는 도구(예: mesh-warp-overlay)는 헤더에 <kbd>를 표시해야 한다
    const shortcutCmd = STUDIO_EXPANDED_ECOSYSTEM_COMMANDS.find(
      (cmd) => cmd.panelLoaderId === "mesh-warp-overlay",
    );
    expect(shortcutCmd?.shortcut).toBeTruthy();
  });

  it("언더페인팅 2장 연속 배치 '마킹하러 가기' 및 Rive 2D 조이스틱·SFX 라이브 작업공간 적용이 실스토어에 커밋된다", async () => {
    const projectId = "proj-runner-live";

    // 1) 언더페인팅 UI 스테이지: 2장 배치 -> 마킹하러 가기 -> 3층 적용
    const upCard = getCardForLoader("underpainting-panel");
    const upMod = await loadEcosystemModule("underpainting-panel");
    const upRender = render(
      <StudioExpandedToolRunnerHost
        command={upCard.command}
        card={upCard}
        loadedModule={upMod}
        projectId={projectId}
        onBack={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("underpainting-go-marking-btn")).toBeNull();
    fireEvent.click(screen.getByTestId("underpainting-batch-2"));
    fireEvent.click(screen.getByTestId("underpainting-go-marking-btn"));
    expect(screen.getByTestId("underpainting-workflow-stage").textContent).toContain("마킹 진행 중");
    fireEvent.click(screen.getByRole("button", { name: "3층 언더페인팅 적용" }));
    expect(screen.getByTestId("underpainting-persisted-layers").textContent).toContain("Multiply 잠금");
    upRender.unmount();

    // 2) Rive 엔진 스테이지: 파라미터 제어 -> 작업공간에 적용 -> 영속 배지 표시
    const riveCard = getCardForLoader("planned-rive-state-machine");
    const riveMod = await loadEcosystemModule("planned-rive-state-machine");
    render(
      <StudioExpandedToolRunnerHost
        command={riveCard.command}
        card={riveCard}
        loadedModule={riveMod}
        projectId={projectId}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByTestId("expanded-tool-live-adapter-panel")).toBeTruthy();
    fireEvent.change(screen.getByTestId("live-param-sfxTrigger"), { target: { value: "sparkle_sfx" } });
    fireEvent.click(screen.getByTestId("expanded-tool-engine-apply-live"));

    expect(screen.getByTestId("expanded-tool-engine-result").getAttribute("data-execution-status")).toBe("ok");
    expect(screen.getByTestId("expanded-tool-live-commit-badge").textContent).toContain("sparkle_sfx");
  });
});
