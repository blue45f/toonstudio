import { describe, expect, it } from "vitest";

import {
  buildCaptionTrack,
  captionFileName,
  formatCaptionTimestamp,
  serializeCaptionsSrt,
  serializeCaptionsVtt,
  updateCaptionDialogueText,
} from "./motion-webtoon-captions";
import type { MotionEpisode } from "./motion-webtoon-model";

function makeEpisode(): MotionEpisode {
  return {
    id: "ep-1",
    titleKo: "테스트 회차",
    titleEn: "Test episode",
    characters: [
      { id: "char-1", nameKo: "주인공", nameEn: "Hero", presetId: "narrator" },
      { id: "char-2", nameKo: "친구", nameEn: "Friend", presetId: "narrator" },
    ],
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
          // 의도적으로 순서를 뒤집어 둔다 — 오프셋 정렬 확인용.
          { id: "dlg-2", text: "두 번째 대사", characterId: "char-2", startOffsetSeconds: 3 },
          { id: "dlg-1", text: "[강조]첫 대사[/강조]", characterId: "char-1", startOffsetSeconds: 1 },
        ],
      },
      {
        id: "cut-2",
        imageUrl: "https://example.com/2.png",
        altKo: "컷 2",
        altEn: "Cut 2",
        direction: { cameraMove: "static", durationSeconds: 4, intensity: 0.5 },
        transitionIn: "cut",
        bgm: { sceneMood: "daily", crossfadeSeconds: 2 },
        dialogues: [
          { id: "dlg-3", text: "다음 컷 대사", characterId: "char-1", startOffsetSeconds: 0.5 },
          // 컷 길이(4초)를 벗어난 오프셋 — 재생되지 않으므로 자막에서도 제외.
          { id: "dlg-4", text: "범위 밖 대사", characterId: "char-1", startOffsetSeconds: 9 },
          // 빈 대사 — 제외.
          { id: "dlg-5", text: "   ", characterId: "char-1", startOffsetSeconds: 1 },
          // 미등록 캐릭터 — 화자 이름 없이 포함.
          { id: "dlg-6", text: "누구지?", characterId: "char-x", startOffsetSeconds: 2 },
        ],
      },
    ],
  };
}

describe("buildCaptionTrack", () => {
  it("컷 누적 시작점에 대사 오프셋을 더해 절대 타이밍을 만든다", () => {
    const track = buildCaptionTrack(makeEpisode());
    expect(track.totalDurationSeconds).toBe(10);
    const byId = new Map(track.cues.map((cue) => [cue.dialogueId, cue]));
    // 컷 1 (0~6초): 오프셋 순으로 정렬된다.
    expect(track.cues.map((cue) => cue.dialogueId)).toEqual(["dlg-1", "dlg-2", "dlg-3", "dlg-6"]);
    expect(byId.get("dlg-1")).toMatchObject({ startSeconds: 1, endSeconds: 3 });
    expect(byId.get("dlg-2")).toMatchObject({ startSeconds: 3, endSeconds: 6 });
    // 컷 2 (6~10초)
    expect(byId.get("dlg-3")).toMatchObject({ startSeconds: 6.5, endSeconds: 8 });
    expect(byId.get("dlg-6")).toMatchObject({ startSeconds: 8, endSeconds: 10 });
  });

  it("감정 마크업을 벗기고 화자 이름을 언어별로 붙인다", () => {
    const track = buildCaptionTrack(makeEpisode());
    const first = track.cues[0];
    expect(first.text).toBe("첫 대사");
    expect(first.speakerNameKo).toBe("주인공");
    expect(first.speakerNameEn).toBe("Hero");
    const unknown = track.cues.find((cue) => cue.dialogueId === "dlg-6");
    expect(unknown?.speakerNameKo).toBe("");
  });

  it("컷 범위를 벗어나거나 빈 대사는 제외하고 개수를 정직하게 센다", () => {
    const track = buildCaptionTrack(makeEpisode());
    expect(track.skippedDialogueCount).toBe(2);
    expect(track.cues.some((cue) => cue.dialogueId === "dlg-4")).toBe(false);
    expect(track.cues.some((cue) => cue.dialogueId === "dlg-5")).toBe(false);
  });

  it("컷이 없으면 빈 트랙을 돌려준다", () => {
    const track = buildCaptionTrack({ ...makeEpisode(), cuts: [] });
    expect(track.cues).toEqual([]);
    expect(track.totalDurationSeconds).toBe(0);
    expect(track.skippedDialogueCount).toBe(0);
  });
});

describe("formatCaptionTimestamp", () => {
  it("SRT는 쉼표, VTT는 마침표 구분자를 쓴다", () => {
    expect(formatCaptionTimestamp(3661.5, ",")).toBe("01:01:01,500");
    expect(formatCaptionTimestamp(3661.5, ".")).toBe("01:01:01.500");
    expect(formatCaptionTimestamp(0, ",")).toBe("00:00:00,000");
    expect(formatCaptionTimestamp(Number.NaN, ".")).toBe("00:00:00.000");
  });
});

describe("serializeCaptionsSrt", () => {
  it("번호·시간 범위·화자 접두사를 순서대로 직렬화한다", () => {
    const srt = serializeCaptionsSrt(buildCaptionTrack(makeEpisode()), "ko");
    expect(srt).toBe(
      [
        "1",
        "00:00:01,000 --> 00:00:03,000",
        "주인공: 첫 대사",
        "",
        "2",
        "00:00:03,000 --> 00:00:06,000",
        "친구: 두 번째 대사",
        "",
        "3",
        "00:00:06,500 --> 00:00:08,000",
        "주인공: 다음 컷 대사",
        "",
        "4",
        "00:00:08,000 --> 00:00:10,000",
        "누구지?",
        "",
      ].join("\n"),
    );
  });

  it("빈 트랙은 빈 문자열이다", () => {
    expect(serializeCaptionsSrt(buildCaptionTrack({ ...makeEpisode(), cuts: [] }), "ko")).toBe("");
  });
});

describe("serializeCaptionsVtt", () => {
  it("WEBVTT 헤더와 voice span, 위치 설정을 직렬화한다", () => {
    const vtt = serializeCaptionsVtt(buildCaptionTrack(makeEpisode()), "en", {
      position: "top",
      size: "large",
    });
    expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
    expect(vtt).toContain("00:00:01.000 --> 00:00:03.000 line:10%");
    expect(vtt).toContain("<v Hero>첫 대사</v>");
    // 화자가 없으면 voice span 없이 본문만 나간다.
    expect(vtt).toContain("\n누구지?\n");
  });

  it("본문의 꺾쇠를 이스케이프해 cue 구조를 깨지 않는다", () => {
    const episode = makeEpisode();
    const patched = updateCaptionDialogueText(episode, "cut-1", "dlg-1", "a <b> --> c");
    const vtt = serializeCaptionsVtt(buildCaptionTrack(patched), "ko");
    expect(vtt).toContain("a &lt;b&gt; --&gt; c");
  });
});

describe("updateCaptionDialogueText", () => {
  it("원본을 바꾸지 않고 해당 대사만 교체하며, 재구성한 자막에 반영된다", () => {
    const episode = makeEpisode();
    const next = updateCaptionDialogueText(episode, "cut-1", "dlg-1", "고친 대사");
    expect(next).not.toBe(episode);
    expect(episode.cuts[0].dialogues[1].text).toBe("[강조]첫 대사[/강조]");
    const track = buildCaptionTrack(next);
    expect(track.cues[0].text).toBe("고친 대사");
  });
});

describe("captionFileName", () => {
  it("제목의 파일명 금지 문자를 정리한다", () => {
    expect(captionFileName(makeEpisode(), "srt")).toBe("테스트-회차-captions.srt");
    expect(captionFileName({ ...makeEpisode(), titleKo: "a/b:c" }, "vtt")).toBe("abc-captions.vtt");
    expect(captionFileName({ ...makeEpisode(), titleKo: "  " }, "srt")).toBe("motion-webtoon-captions.srt");
  });
});
