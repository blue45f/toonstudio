// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MotionWebtoonCaptionPanel } from "./MotionWebtoonCaptionPanel";
import type { MotionEpisode } from "./motion-webtoon-model";

function makeEpisode(): MotionEpisode {
  return {
    id: "ep-1",
    titleKo: "테스트 회차",
    titleEn: "Test episode",
    characters: [{ id: "char-1", nameKo: "주인공", nameEn: "Hero", presetId: "narrator" }],
    cuts: [
      {
        id: "cut-1",
        imageUrl: "https://example.com/1.png",
        altKo: "컷 1",
        altEn: "Cut 1",
        direction: { cameraMove: "zoom-in", durationSeconds: 6, intensity: 0.5 },
        transitionIn: "fade",
        bgm: { sceneMood: "daily", crossfadeSeconds: 2 },
        dialogues: [
          { id: "dlg-1", text: "첫 대사", characterId: "char-1", startOffsetSeconds: 1 },
          // 컷 길이(6초)를 벗어나 자막에서 제외되는 대사.
          { id: "dlg-2", text: "범위 밖", characterId: "char-1", startOffsetSeconds: 9 },
        ],
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MotionWebtoonCaptionPanel", () => {
  it("자막 큐와 시간 범위를 보여주고 제외된 대사를 안내한다", () => {
    render(<MotionWebtoonCaptionPanel episode={makeEpisode()} onEpisodeChange={() => {}} />);
    expect(screen.getByDisplayValue("첫 대사")).toBeTruthy();
    expect(screen.getByText("0:01.0 – 0:06.0")).toBeTruthy();
    expect(screen.getByText(/빠진 대사가 1개/)).toBeTruthy();
  });

  it("대사가 없으면 빈 상태를 안내한다", () => {
    const episode = makeEpisode();
    const noDialogue: MotionEpisode = {
      ...episode,
      cuts: episode.cuts.map((cut) => ({ ...cut, dialogues: [] })),
    };
    render(<MotionWebtoonCaptionPanel episode={noDialogue} onEpisodeChange={() => {}} />);
    expect(screen.getByText("대사가 있는 컷이 없어 자막을 만들 수 없습니다.")).toBeTruthy();
  });

  it("자막 문구를 고치면 원본 대사가 바뀐 회차를 돌려준다", () => {
    const onEpisodeChange = vi.fn();
    render(<MotionWebtoonCaptionPanel episode={makeEpisode()} onEpisodeChange={onEpisodeChange} />);
    fireEvent.change(screen.getByDisplayValue("첫 대사"), { target: { value: "고친 대사" } });
    expect(onEpisodeChange).toHaveBeenCalledTimes(1);
    const next = onEpisodeChange.mock.calls[0][0] as MotionEpisode;
    expect(next.cuts[0].dialogues[0].text).toBe("고친 대사");
    expect(next.cuts[0].dialogues[1].text).toBe("범위 밖");
  });

  it("위치 스타일을 바꾸면 미리보기 배치가 바뀐다", () => {
    const { container } = render(
      <MotionWebtoonCaptionPanel episode={makeEpisode()} onEpisodeChange={() => {}} />,
    );
    const stage = container.querySelector(".mw-caption-stage");
    expect(stage?.classList.contains("mw-caption-stage-bottom")).toBe(true);
    const select = screen.getByLabelText("자막 위치") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "top" } });
    expect(stage?.classList.contains("mw-caption-stage-top")).toBe(true);
  });

  it("SRT 내려받기는 자막 파일 Blob을 만든다", async () => {
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return "blob:mock";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    render(<MotionWebtoonCaptionPanel episode={makeEpisode()} onEpisodeChange={() => {}} />);
    fireEvent.click(screen.getByText("SRT 내려받기"));
    expect(blobs).toHaveLength(1);
    const text = await blobs[0].text();
    expect(text).toContain("00:00:01,000 --> 00:00:06,000");
    expect(text).toContain("첫 대사");
  });
});
