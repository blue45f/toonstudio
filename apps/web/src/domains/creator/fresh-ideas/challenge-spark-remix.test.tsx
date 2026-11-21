// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n-core";

import {
  buildChallengeSparkPlan,
  nextSparkCamera,
  SPARK_CAMERAS,
  SPARK_MOODS,
} from "./challenge-spark-remix";
import { ChallengeSparkRemixBar } from "./ChallengeSparkRemixBar";

const SAMPLE_CHALLENGE = {
  id: "c-autumn",
  title: "가을밤 산책",
  theme: "가로등 아래 낙엽이 흩날리는 골목길",
};

const SAMPLE_CHALLENGE_EN = {
  id: "c-midnight",
  title: "Midnight Walk",
  theme: "A quiet streetlamp glowing after rain",
};

const originalClipboard = navigator.clipboard;

function setMockClipboard(writeText?: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: originalClipboard,
  });
  vi.restoreAllMocks();
});

describe("challenge-spark-remix 순수 모델", () => {
  it("동일 입력에는 결정론적 3컷 스파크·추천 비율·스튜디오 딥링크를 생성한다", () => {
    const first = buildChallengeSparkPlan({
      challenge: SAMPLE_CHALLENGE,
      moodId: "flutter",
      cameraId: "closeup-twist",
      seed: 0,
    });
    const second = buildChallengeSparkPlan({
      challenge: SAMPLE_CHALLENGE,
      moodId: "flutter",
      cameraId: "closeup-twist",
      seed: 0,
    });

    expect(first).toEqual(second);
    expect(first.cuts).toHaveLength(3);
    expect(first.studioHref).toBe("/studio?challengeId=c-autumn");
    expect(first.clipboardTextKo).toContain("가을밤 산책");
    expect(first.clipboardTextKo).toContain("가로등 아래 낙엽이 흩날리는 골목길");
    expect(first.clipboardTextKo).toContain("1컷 도입");
    expect(first.clipboardTextKo).toContain("2컷 전환");
    expect(first.clipboardTextKo).toContain("3컷 여운·반전");
  });

  it("분위기·카메라 구도·시드를 바꾸면 3컷 콘티와 추천 비율이 다르게 조합된다", () => {
    const base = buildChallengeSparkPlan({
      challenge: SAMPLE_CHALLENGE,
      moodId: "flutter",
      cameraId: "closeup-twist",
      seed: 0,
    });
    const tension = buildChallengeSparkPlan({
      challenge: SAMPLE_CHALLENGE,
      moodId: "tension",
      cameraId: "high-angle-isolation",
      seed: 0,
    });
    const shuffled = buildChallengeSparkPlan({
      challenge: SAMPLE_CHALLENGE,
      moodId: "flutter",
      cameraId: nextSparkCamera("closeup-twist"),
      seed: 1,
    });

    expect(SPARK_MOODS).toHaveLength(4);
    expect(SPARK_CAMERAS).toHaveLength(3);
    expect(tension.ratioLabelKo).not.toBe(base.ratioLabelKo);
    expect(tension.cuts[0].visualDirectionKo).not.toBe(base.cuts[0].visualDirectionKo);
    expect(shuffled.camera.id).toBe("high-angle-isolation");
    expect(shuffled.clipboardTextKo).toContain("시드 #2");
  });

  it("빈 주제/제목에서도 영문 텍스트에 한글이 섞이지 않고 안전하게 폴백한다", () => {
    const plan = buildChallengeSparkPlan({
      challenge: { id: "c-empty", title: "   ", theme: "" },
      moodId: "afterglow",
      cameraId: "one-take-rush",
      seed: -5,
    });
    expect(plan.seed).toBe(0);
    expect(plan.clipboardTextEn).not.toMatch(/[가-힣]/u);
    expect(plan.studioHref).toBe("/studio?challengeId=c-empty");
  });
});

describe("ChallengeSparkRemixBar UI", () => {
  it("4개 분위기 칩·구도 셔플·3컷 스트립·44px 터치 타깃·스튜디오 CTA가 동작한다", () => {
    render(
      <MemoryRouter>
        <ChallengeSparkRemixBar challenge={SAMPLE_CHALLENGE} />
      </MemoryRouter>,
    );

    const moodIds = ["flutter", "tension", "humor", "afterglow"] as const;
    for (const id of moodIds) {
      const chip = screen.getByTestId(`challenge-spark-mood-${id}`);
      expect(chip.className).toContain("min-h-11");
    }

    expect(screen.getByTestId("challenge-spark-mood-flutter").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("challenge-spark-seed-badge").textContent).toContain("#1");
    expect(screen.getByTestId("challenge-spark-cut-1").textContent).toContain("1컷 도입");
    expect(screen.getByTestId("challenge-spark-cut-2").textContent).toContain("2컷 전환");
    expect(screen.getByTestId("challenge-spark-cut-3").textContent).toContain("3컷 여운·반전");

    fireEvent.click(screen.getByTestId("challenge-spark-mood-humor"));
    expect(screen.getByTestId("challenge-spark-mood-humor").getAttribute("aria-pressed")).toBe("true");

    const shuffleBtn = screen.getByTestId("challenge-spark-shuffle-btn");
    expect(shuffleBtn.className).toContain("min-h-11");
    fireEvent.click(shuffleBtn);
    expect(screen.getByTestId("challenge-spark-seed-badge").textContent).toContain("#2");
    expect(screen.getByTestId("challenge-spark-camera-high-angle-isolation").getAttribute("aria-pressed")).toBe("true");

    const studioCta = screen.getByTestId("challenge-spark-studio-cta");
    expect(studioCta.getAttribute("href")).toBe("/studio?challengeId=c-autumn");
    expect(studioCta.className).toContain("min-h-11");
  });

  it("3컷 메모 복사 성공 및 클립보드 실패 시 인라인 상태와 수동 복사 영역을 안내한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setMockClipboard(writeText);

    render(
      <MemoryRouter>
        <ChallengeSparkRemixBar challenge={SAMPLE_CHALLENGE} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("challenge-spark-copy-btn"));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(writeText.mock.calls[0]?.[0]).toContain("[챌린지 3컷 스파크] 가을밤 산책");
    expect(screen.getByTestId("challenge-spark-copy-status").textContent).toContain("클립보드에 복사했어요");

    // 셔플 후 클립보드가 거부되면 인라인 실패 안내와 수동 복사 텍스트가 열린다.
    setMockClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    fireEvent.click(screen.getByTestId("challenge-spark-shuffle-btn"));
    fireEvent.click(screen.getByTestId("challenge-spark-copy-btn"));

    const fallback = await screen.findByTestId("challenge-spark-copy-fallback");
    expect(fallback.textContent).toContain("시드 #2");
    expect(screen.getByTestId("challenge-spark-copy-status").textContent).toContain("자동 복사를 사용할 수 없어");
  });

  it("영문 로케일(en)에서 한글이 누출되지 않는다", () => {
    useI18n.setState({ lang: "en" });
    render(
      <MemoryRouter>
        <ChallengeSparkRemixBar challenge={SAMPLE_CHALLENGE_EN} />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("challenge-spark-remix-bar").textContent).not.toMatch(/[가-힣]/u);
  });
});
