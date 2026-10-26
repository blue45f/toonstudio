// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioWebtoonEpisodicDoctorPanel } from "./StudioWebtoonEpisodicDoctorPanel";

describe("StudioWebtoonEpisodicDoctorPanel", () => {
  const defaultAssistInput = {
    scriptText: "서진: 여기서 끝낸다.\n하윤: 네 마음대로 되진 않을 거야.",
    genre: "판타지",
    coreConflict: "봉인된 검의 각성",
    relationshipDynamic: "fated-rivals" as const,
    posePresetId: "pose-aerial-landing" as const,
    targetLocale: "ko" as const,
  };

  it("4개 차세대 에피소드 AI 디렉터 탭을 전환하며 각 시뮬레이션 결과를 렌더링하고 대본 지문 삽입을 지원한다", () => {
    const onAppendDirectionLine = vi.fn();
    render(
      <StudioWebtoonEpisodicDoctorPanel
        assistInput={defaultAssistInput}
        onAppendDirectionLine={onAppendDirectionLine}
      />,
    );

    expect(screen.getByTestId("studio-webtoon-episodic-doctor-panel")).toBeTruthy();
    expect(screen.getByTestId("episodic-panel-reader-retention-simulator")).toBeTruthy();
    expect(screen.getByTestId("retention-star-rating").textContent).toContain("★9.93");

    // 잔존율 보강 지문 삽입 버튼 클릭
    const retentionButtons = screen.getAllByText("잔존율 보강 지문 삽입");
    fireEvent.click(retentionButtons[0]!);
    expect(onAppendDirectionLine).toHaveBeenCalledTimes(1);

    // 탭 2: 캐릭터 말투 캐붕(OOC) 레이더
    fireEvent.click(screen.getByTestId("episodic-doctor-tab-character-ooc-radar"));
    expect(screen.getByTestId("episodic-panel-character-ooc-radar")).toBeTruthy();
    const applySubtextButtons = screen.getAllByText("서브텍스트 대사 적용");
    fireEvent.click(applySubtextButtons[0]!);
    expect(onAppendDirectionLine).toHaveBeenCalledTimes(2);

    // 탭 3: 3D 배경 · 소품 · DoF 카메라
    fireEvent.click(screen.getByTestId("episodic-doctor-tab-bg3d-lighting-asset-director"));
    expect(screen.getByTestId("episodic-panel-bg3d-lighting-asset-director")).toBeTruthy();
    const apply3dButtons = screen.getAllByText("3D 배경·카메라 지문 삽입");
    fireEvent.click(apply3dButtons[0]!);
    expect(onAppendDirectionLine).toHaveBeenCalledTimes(3);

    // 탭 4: 웹툰 BGM · 오디오툰 큐시트
    fireEvent.click(screen.getByTestId("episodic-doctor-tab-bgm-audiotoon-cuesheet"));
    expect(screen.getByTestId("episodic-panel-bgm-audiotoon-cuesheet")).toBeTruthy();
    const applyAudioButtons = screen.getAllByText("오디오툰 큐시트 지문 삽입");
    fireEvent.click(applyAudioButtons[0]!);
    expect(onAppendDirectionLine).toHaveBeenCalledTimes(4);

    // 탭 5: 컷간 작붕(흉터·검집·부상) 린터
    fireEvent.click(screen.getByTestId("episodic-doctor-tab-episodic-visual-continuity-linter"));
    expect(screen.getByTestId("episodic-panel-episodic-visual-continuity-linter")).toBeTruthy();
    const applyLinterButtons = screen.getAllByText("작붕 방지 가드 지문 삽입");
    fireEvent.click(applyLinterButtons[0]!);
    expect(onAppendDirectionLine).toHaveBeenCalledTimes(5);

    // 탭 6: 장편 연재(1~100화) 캐논 볼트
    fireEvent.click(screen.getByTestId("episodic-doctor-tab-multi-episode-canon-memory-vault"));
    expect(screen.getByTestId("episodic-panel-multi-episode-canon-memory-vault")).toBeTruthy();
    const applyCanonButtons = screen.getAllByText("장편 캐논 볼트 지문 삽입");
    fireEvent.click(applyCanonButtons[0]!);
    expect(onAppendDirectionLine).toHaveBeenCalledTimes(6);
  });
});
