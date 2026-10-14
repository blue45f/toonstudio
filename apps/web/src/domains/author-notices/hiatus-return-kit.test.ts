/**
 * 휴재·복귀 키트 테스트 — 기간→복귀일 계산, 톤 2종 조립, 리캡 조립과
 * 스포일러 보호·빈 줄거리 제외 규칙 검증.
 */

import { describe, expect, it } from "vitest";

import {
  buildHiatusNoticeKit,
  buildReturnRecapKit,
  formatKoreanDateLabel,
  recapForeshadowsFromSeeds,
  type RecapEpisodeInput,
} from "./hiatus-return-kit";

const BASE = {
  workTitle: "달빛 검객",
  authorName: "김밤하늘",
  reasonCategory: "health" as const,
  startsOn: "2026-11-02", // 월요일
  weeks: 3,
  tone: "platform" as const,
};

describe("buildHiatusNoticeKit", () => {
  it("기간 입력 시 종료일·복귀 예정일을 계산하고 공지 초안을 조립한다", () => {
    const kit = buildHiatusNoticeKit(BASE);
    expect(kit).not.toBeNull();
    expect(kit?.endsOn).toBe("2026-11-22");
    expect(kit?.resumeOn).toBe("2026-11-23");
    expect(kit?.seed.kind).toBe("hiatus");
    expect(kit?.seed.title).toBe("「달빛 검객」 휴재 안내");
    expect(kit?.seed.body).toContain("건강상의 사정으로");
    expect(kit?.seed.body).toContain("2026년 11월 2일 (월)");
    expect(kit?.seed.body).toContain("복귀 예정일: 2026년 11월 23일 (월)");
    expect(kit?.bannerText).toContain("휴재 중");
    expect(kit?.bannerText).toContain("2026년 11월 23일 (월)");
  });

  it("세부 사유가 있으면 작가의 말로 붙는다", () => {
    const kit = buildHiatusNoticeKit({ ...BASE, reasonDetail: "손목 치료에 집중하겠습니다." });
    expect(kit?.seed.body).toContain("작가의 말: 손목 치료에 집중하겠습니다.");
  });

  it("커뮤니티 톤은 친근한 문체와 제목으로 조립된다", () => {
    const kit = buildHiatusNoticeKit({ ...BASE, tone: "community" });
    expect(kit?.seed.title).toBe("「달빛 검객」 잠시 쉬어 갈게요");
    expect(kit?.seed.body).toContain("쉬어 가요");
    expect(kit?.bannerText).toContain("돌아와요");
  });

  it("잘못된 날짜·기간·빈 제목이면 만들지 않는다", () => {
    expect(buildHiatusNoticeKit({ ...BASE, startsOn: "2026-02-31" })).toBeNull();
    expect(buildHiatusNoticeKit({ ...BASE, startsOn: "11/02" })).toBeNull();
    expect(buildHiatusNoticeKit({ ...BASE, weeks: 0 })).toBeNull();
    expect(buildHiatusNoticeKit({ ...BASE, workTitle: "  " })).toBeNull();
  });
});

const EPISODES: readonly RecapEpisodeInput[] = [
  { episodeNumber: 10, title: "낡은 편지", goalLine: "주인공이 숨긴 편지가 드러난다", cliffhangerLine: "" },
  { episodeNumber: 11, title: "밤의 추격", goalLine: "", cliffhangerLine: "" },
  { episodeNumber: 12, title: "문 앞의 그림자", goalLine: "추격 끝에 정체 모를 손님과 마주친다", cliffhangerLine: "손님이 주인공의 이름을 불렀다" },
];

describe("buildReturnRecapKit", () => {
  it("지난 아크 줄거리·끊긴 지점·미회수 복선으로 복귀 초안을 조립한다", () => {
    const kit = buildReturnRecapKit({
      workTitle: "달빛 검객",
      authorName: "김밤하늘",
      resumeOn: "2026-11-23",
      episodes: EPISODES,
      foreshadows: [
        { title: "주인공이 숨긴 편지", status: "growing", visibility: "team", plantedEpisodeNumber: 10 },
        { title: "스승의 정체", status: "planted", visibility: "author" },
        { title: "회수된 반지", status: "paidOff", visibility: "team" },
      ],
      nextEpisode: { episodeNumber: 13, title: "이름의 대가" },
    });
    expect(kit).not.toBeNull();
    expect(kit?.seed.kind).toBe("resume");
    expect(kit?.seed.body).toContain("2026년 11월 23일 (월) 돌아옵니다");
    expect(kit?.storyLines).toHaveLength(2);
    expect(kit?.skippedEmptySummaryCount).toBe(1);
    expect(kit?.seed.body).toContain("손님이 주인공의 이름을 불렀다");
    expect(kit?.seed.body).toContain("「주인공이 숨긴 편지」 (10화에 심긴 복선)");
    expect(kit?.seed.body).toContain("13화 「이름의 대가」");
    expect(kit?.lastEpisodeNumber).toBe(12);
  });

  it("스포일러 보호(author) 복선은 본문에 넣지 않고 개수만 돌려준다", () => {
    const kit = buildReturnRecapKit({
      workTitle: "달빛 검객",
      authorName: "김밤하늘",
      episodes: EPISODES,
      foreshadows: [{ title: "스승의 정체", status: "planted", visibility: "author" }],
    });
    expect(kit?.withheldSpoilerCount).toBe(1);
    expect(kit?.seed.body).not.toContain("스승의 정체");
  });

  it("줄거리가 있는 회차가 없으면 리캡을 만들지 않는다", () => {
    const kit = buildReturnRecapKit({
      workTitle: "달빛 검객",
      authorName: "김밤하늘",
      episodes: [{ episodeNumber: 1, title: "시작", goalLine: " ", cliffhangerLine: "" }],
      foreshadows: [],
    });
    expect(kit).toBeNull();
  });

  it("최근 회차만 담는다 (기본 5화)", () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      episodeNumber: index + 1,
      title: `회차 ${index + 1}`,
      goalLine: `사건 ${index + 1}`,
      cliffhangerLine: "",
    }));
    const kit = buildReturnRecapKit({
      workTitle: "달빛 검객",
      authorName: "김밤하늘",
      episodes: many,
      foreshadows: [],
    });
    expect(kit?.storyLines).toHaveLength(5);
    expect(kit?.storyLines[0]).toContain("4화");
  });
});

describe("recapForeshadowsFromSeeds / formatKoreanDateLabel", () => {
  it("회차 순서표로 심은 회차 번호를 찾고, 없으면 번호를 지어내지 않는다", () => {
    const mapped = recapForeshadowsFromSeeds(
      [
        { title: "편지", status: "planted", visibility: "team", plantedIn: { episodeId: "ep-b" } },
        { title: "반지", status: "growing", visibility: "reviewers", plantedIn: { episodeId: "ep-x" } },
      ],
      ["ep-a", "ep-b", "ep-c"],
    );
    expect(mapped[0].plantedEpisodeNumber).toBe(2);
    expect(mapped[1].plantedEpisodeNumber).toBeUndefined();
  });

  it("날짜 라벨은 요일을 포함하고 잘못된 키는 그대로 돌려준다", () => {
    expect(formatKoreanDateLabel("2026-11-02")).toBe("2026년 11월 2일 (월)");
    expect(formatKoreanDateLabel("not-a-date")).toBe("not-a-date");
  });
});
