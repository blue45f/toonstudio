// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioWebtoonEpisodicDoctorPanel } from "./StudioWebtoonEpisodicDoctorPanel";
import * as episodic from "./assist/assist-webtoon-episodic-doctor";
import { useI18n } from "@/shared/lib/i18n";

beforeEach(() => { useI18n.setState({ lang: "ko" }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

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
    expect(screen.queryByTestId("retention-star-rating")).toBeNull();
    expect(screen.getByTestId("episodic-doctor-source-badge").textContent).toContain("로컬 예시");
    expect(screen.getByText("독자 성과 지표 미측정")).toBeTruthy();
    expect(screen.queryByText(/예상 완독률|이탈 위험 \d+%|★9\.93|3,420/u)).toBeNull();

    // 잔존율 보강 지문 삽입 버튼 클릭
    const retentionButtons = screen.getAllByText("연출 제안 지문 삽입");
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

    // 탭 7: 신발 굽 · 계단 접지 보폭 잠금
    fireEvent.click(
      screen.getByTestId("episodic-doctor-tab-episodic-footwear-floor-contact-stride-lock"),
    );
    expect(
      screen.getByTestId("episodic-panel-episodic-footwear-floor-contact-stride-lock"),
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId("episodic-footwear-insert-btn"));
    expect(onAppendDirectionLine).toHaveBeenCalledTimes(7);

    // 탭 8: 군중 엑스트라 · 대기원근 안개 잠금
    fireEvent.click(
      screen.getByTestId("episodic-doctor-tab-episodic-crowd-silhouette-depth-fog-lock"),
    );
    expect(
      screen.getByTestId("episodic-panel-episodic-crowd-silhouette-depth-fog-lock"),
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId("episodic-crowd-depth-insert-btn"));
    expect(onAppendDirectionLine).toHaveBeenCalledTimes(8);
  });
});

describe("에피소드 AI 실제 요청의 실패·취소·재시도", () => {
  const input = { scriptText: "하나: 창문을 닫아 줘.\n두나: 비가 오기 전에 닫을게.", targetLocale: "ko" as const };
  const live = () => ({
    ...episodic.buildDeterministicReaderRetentionReport(input),
    source: "claude-live" as const,
    model: "ToonStudio AI (test-model)",
    scrollVelocitySummaryKo: "입력 대본의 대사 전환을 확인한 AI 제안",
  });
  const mount = () => render(<StudioWebtoonEpisodicDoctorPanel assistInput={input} onAppendDirectionLine={vi.fn()} />);

  it("실패는 예시 성공으로 바뀌지 않고, 원시 오류를 숨기며 명시적 재시도로만 복구한다", async () => {
    const run = vi.spyOn(episodic, "runAssistWebtoonEpisodicDoctor")
      .mockRejectedValueOnce(new Error("PRIVATE_PROVIDER_DETAIL"))
      .mockResolvedValueOnce(live());
    mount();
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "현재 탭 AI 검토" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("완료하지 못했어요"));
    expect(screen.queryByText(/PRIVATE_PROVIDER_DETAIL/u)).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[2]).toMatchObject({ fallbackOnError: false });
    expect(run.mock.calls[0]?.[2]?.signal).toBeInstanceOf(AbortSignal);
    expect(screen.getByTestId("episodic-doctor-source-badge").textContent).toContain("AI 미실행");
    fireEvent.click(screen.getByRole("button", { name: "AI 검토 다시 시도" }));
    await waitFor(() => expect(screen.getByText("입력 대본의 대사 전환을 확인한 AI 제안")).toBeTruthy());
    expect(run).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("episodic-doctor-source-badge").textContent).toContain("실측 아님");
  });

  it("중단은 신호를 취소하고, 뒤늦게 성공한 응답도 반영하지 않는다", async () => {
    let finish: ((value: episodic.AssistReaderRetentionView) => void) | undefined;
    const pending = new Promise<episodic.AssistReaderRetentionView>((resolve) => { finish = resolve; });
    const run = vi.spyOn(episodic, "runAssistWebtoonEpisodicDoctor").mockReturnValueOnce(pending);
    mount();
    const button = screen.getByRole("button", { name: "현재 탭 AI 검토" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("검토하고 있어요");
    fireEvent.click(screen.getByRole("button", { name: "중단" }));
    expect(run.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("중단했어요");
    await act(async () => { finish?.(live()); });
    expect(screen.queryByText("입력 대본의 대사 전환을 확인한 AI 제안")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("탭을 바꾸면 진행 중 요청을 취소하고 예전 탭의 늦은 결과를 버린다", async () => {
    let finish: ((value: episodic.AssistReaderRetentionView) => void) | undefined;
    const pending = new Promise<episodic.AssistReaderRetentionView>((resolve) => { finish = resolve; });
    const run = vi.spyOn(episodic, "runAssistWebtoonEpisodicDoctor").mockReturnValueOnce(pending);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "현재 탭 AI 검토" }));
    fireEvent.click(screen.getByTestId("episodic-doctor-tab-bg3d-lighting-asset-director"));
    expect(run.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
    await act(async () => { finish?.(live()); });
    fireEvent.click(screen.getByTestId("episodic-doctor-tab-reader-retention-simulator"));
    expect(screen.queryByText("입력 대본의 대사 전환을 확인한 AI 제안")).toBeNull();
  });

  it("대본이 바뀌면 진행 중 요청을 취소하고 이전 대본 결과를 폐기한다", async () => {
    let finish: ((value: episodic.AssistReaderRetentionView) => void) | undefined;
    const pending = new Promise<episodic.AssistReaderRetentionView>((resolve) => { finish = resolve; });
    const run = vi.spyOn(episodic, "runAssistWebtoonEpisodicDoctor").mockReturnValueOnce(pending);
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "현재 탭 AI 검토" }));
    view.rerender(<StudioWebtoonEpisodicDoctorPanel assistInput={{ ...input, scriptText: "다른 대본" }} onAppendDirectionLine={vi.fn()} />);
    expect(run.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
    await act(async () => { finish?.(live()); });
    expect(screen.queryByText("입력 대본의 대사 전환을 확인한 AI 제안")).toBeNull();
  });

  it("패널이 닫히면 요청을 취소한다", () => {
    const run = vi.spyOn(episodic, "runAssistWebtoonEpisodicDoctor").mockReturnValueOnce(new Promise(() => {}));
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "현재 탭 AI 검토" }));
    view.unmount();
    expect(run.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
  });

  it("실제 분석 경로가 로컬 예시를 반환해도 성공으로 표시하지 않는다", async () => {
    vi.spyOn(episodic, "runAssistWebtoonEpisodicDoctor").mockResolvedValueOnce(episodic.buildDeterministicReaderRetentionReport(input));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "현재 탭 AI 검토" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByTestId("episodic-doctor-source-badge").textContent).toContain("로컬 예시");
  });

  it("영어에서도 새 상태 문구가 번역 키 대신 표시된다", () => {
    useI18n.setState({ lang: "en" });
    mount();
    expect(screen.getByRole("button", { name: "Review this tab with AI" })).toBeTruthy();
    expect(screen.getByText("Audience metrics not measured")).toBeTruthy();
  });
});
