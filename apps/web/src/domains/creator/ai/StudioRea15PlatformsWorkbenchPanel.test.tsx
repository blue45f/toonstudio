// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudioRea15PlatformsWorkbenchPanel } from "./StudioRea15PlatformsWorkbenchPanel";

describe("StudioRea15PlatformsWorkbenchPanel (Phase 7 15대 웹툰 AI 플랫폼 REA UI/UX & 창의적 AI 워크벤치)", () => {
  it("15대 플랫폼 UI/UX 테마 토큰 인스펙터와 5대 AI 탭 전환 및 원고 반영 콜백을 검증한다", async () => {
    const appendedLines: string[] = [];
    render(
      <StudioRea15PlatformsWorkbenchPanel
        assistInput={{
          genre: "판타지 액션",
          protagonistName: "서진",
          partnerName: "하윤",
          coreConflict: "고대 유물 각성과 숙명적 대립",
        }}
        onAppendDirectionLine={(line) => appendedLines.push(line)}
      />,
    );

    expect(screen.getByTestId("studio-rea15-platforms-workbench-panel")).toBeDefined();
    expect(screen.getByTestId("rea15-ui-token-inspector")).toBeDefined();

    // 15개 플랫폼 칩 중 frameo 선택 및 테마 토큰 원고 반영
    fireEvent.click(screen.getByTestId("rea15-platform-chip-frameo"));
    fireEvent.click(screen.getByTestId("apply-rea15-theme-token-btn"));
    expect(appendedLines.some((l) => l.includes("Frameo AI"))).toBe(true);

    // 탭 1 기본 표시 확인 및 실행
    expect(screen.getByTestId("rea15-panel-glimnavi-relight-v23")).toBeDefined();
    fireEvent.click(screen.getByTestId("run-rea15-active-tab-btn"));
    await waitFor(() => {
      expect(appendedLines.some((l) => l.includes("[GlimNavi v2.3"))).toBe(true);
    });

    // 탭 2: KAISTORY & KAION 학습 퀴즈
    fireEvent.click(screen.getByTestId("rea15-tab-kaistory-envelope-kaion"));
    expect(screen.getByTestId("rea15-panel-kaistory-envelope-kaion")).toBeDefined();
    expect(screen.getByTestId("kaion-learning-card-kaion-card-01")).toBeDefined();

    // 탭 3: Snaptoon · Frameo · SHAPER
    fireEvent.click(screen.getByTestId("rea15-tab-snaptoon-frameo-shaper-3d"));
    expect(screen.getByTestId("rea15-panel-snaptoon-frameo-shaper-3d")).toBeDefined();

    // 탭 4: ManhwaAI · Komiko · Anifusion
    fireEvent.click(screen.getByTestId("rea15-tab-manhwa-komiko-anifusion"));
    expect(screen.getByTestId("rea15-panel-manhwa-komiko-anifusion")).toBeDefined();

    // 탭 5: 창의적 AI 독자 도파민 히트맵 & UI 테마 합성기
    fireEvent.click(screen.getByTestId("rea15-tab-creative-dopamine-ux"));
    expect(screen.getByTestId("rea15-panel-creative-dopamine-ux")).toBeDefined();
    fireEvent.click(screen.getByTestId("run-rea15-active-tab-btn"));
    await waitFor(() => {
      expect(appendedLines.some((l) => l.includes("[독자 도파민 & UI 합성기"))).toBe(true);
    });

    // 탭 6: TooToon · GenToon · Tooning Plus
    fireEvent.click(screen.getByTestId("rea15-tab-tootoon-gentoon-tooning-kr"));
    expect(screen.getByTestId("rea15-panel-tootoon-gentoon-tooning-kr")).toBeDefined();

    // 탭 7: Krea · Spline · Lumiere
    fireEvent.click(screen.getByTestId("rea15-tab-krea-spline-lumiere-shader"));
    expect(screen.getByTestId("rea15-panel-krea-spline-lumiere-shader")).toBeDefined();

    // 탭 8: LTX · Boords · Cascadeur · Rive
    fireEvent.click(screen.getByTestId("rea15-tab-ltx-boords-cascadeur-rive"));
    expect(screen.getByTestId("rea15-panel-ltx-boords-cascadeur-rive")).toBeDefined();

    // 탭 9: Cotrans · VRoid · Skybox AI
    fireEvent.click(screen.getByTestId("rea15-tab-cotrans-vroid-skybox-localizer"));
    expect(screen.getByTestId("rea15-panel-cotrans-vroid-skybox-localizer")).toBeDefined();

    // 탭 10: Storyboarder · Dreams · Krita · Artbreeder
    fireEvent.click(screen.getByTestId("rea15-tab-storyboarder-dreams-krita-artbreeder"));
    expect(screen.getByTestId("rea15-panel-storyboarder-dreams-krita-artbreeder")).toBeDefined();

    // 탭 11: Niji 7 · Civitai · PixAI · Picrew
    fireEvent.click(screen.getByTestId("rea15-tab-niji-pixai-civitai-lora-sref"));
    expect(screen.getByTestId("rea15-panel-niji-pixai-civitai-lora-sref")).toBeDefined();

    // 탭 12: Tripo3D · Suno · ElevenLabs · MANGA Plus OSMU
    fireEvent.click(screen.getByTestId("rea15-tab-tripo-meshy-heroforge-suno-osmu"));
    expect(screen.getByTestId("rea15-panel-tripo-meshy-heroforge-suno-osmu")).toBeDefined();

    // 탭 13: Runway · Luma · Pika · Viggle · Live2D · Spine
    fireEvent.click(screen.getByTestId("rea15-tab-runway-luma-pika-viggle-live2d-spine"));
    expect(screen.getByTestId("rea15-panel-runway-luma-pika-viggle-live2d-spine")).toBeDefined();

    // 탭 14: SketchUp · Blender · Petalica · Magma · Recraft
    fireEvent.click(screen.getByTestId("rea15-tab-sketchup-blender-petalica-magma-recraft"));
    expect(screen.getByTestId("rea15-panel-sketchup-blender-petalica-magma-recraft")).toBeDefined();

    // 탭 15: Tapas · Tappytoon · RIDI · Postype · Sudowrite · Novelcrafter
    fireEvent.click(screen.getByTestId("rea15-tab-tapas-tappytoon-ridi-postype-sudowrite-novelcrafter"));
    expect(screen.getByTestId("rea15-panel-tapas-tappytoon-ridi-postype-sudowrite-novelcrafter")).toBeDefined();

    // 탭 16: Mixamo · Marvelous · Coolors · 눈누 · Blambot · ToonBoom · Eagle
    fireEvent.click(screen.getByTestId("rea15-tab-mixamo-marvelous-coolors-noonnu-blambot-toonboom-eagle"));
    expect(screen.getByTestId("rea15-panel-mixamo-marvelous-coolors-noonnu-blambot-toonboom-eagle")).toBeDefined();
  });
});
