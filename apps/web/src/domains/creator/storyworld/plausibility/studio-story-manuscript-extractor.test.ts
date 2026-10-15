import { describe, expect, it } from "vitest";

import {
  MANUSCRIPT_MAX_CHARS,
  addManuscriptBoundaryAt,
  detectManuscriptBoundaries,
  extractManuscript,
  extractManuscriptAsync,
  manuscriptParagraphStarts,
  removeManuscriptBoundary,
  type ManuscriptNameEntry,
} from "./studio-story-manuscript-extractor";

const character = (refId: string, name: string, aliases: readonly string[] = []): ManuscriptNameEntry => ({
  kind: "character",
  id: `character:${refId}`,
  refId,
  name,
  aliases,
});
const location = (name: string, aliases: readonly string[] = []): ManuscriptNameEntry => ({
  kind: "location",
  id: `location:${name}`,
  refId: name,
  name,
  aliases,
});

const REGISTER: readonly ManuscriptNameEntry[] = [
  character("haeun", "하은", ["은이"]),
  character("dojin", "도진"),
  location("기억 시장"),
  location("금고"),
];

describe("원고 장면 경계 찾기", () => {
  it("장면 번호 표지에서 제목을 읽고, 번호만 있으면 표지 글자를 그대로 제목으로 쓴다", () => {
    const text = "장면 1. 기억 시장\n하은이 걸었다.\n\n장면 2\n도진이 웃었다.";
    const result = extractManuscript(text, REGISTER);
    expect(result.scenes.map((scene) => scene.title)).toEqual(["기억 시장", "장면 2"]);
    expect(result.scenes.map((scene) => scene.boundary)).toEqual(["scene-number", "scene-number"]);
    expect(result.scenes[0]?.marker).toBe("장면 1. 기억 시장");
    expect(result.scenes[0]?.titleFromMarker).toBe(true);
  });

  it.each([
    ["S#3. 거실 / 낮\n본문", "거실 / 낮"],
    ["씬 4 비 오는 날\n본문", "비 오는 날"],
    ["컷 5\n본문", "컷 5"],
    ["Scene 6: Rain\n본문", "Rain"],
    ["[장면 7] 옥상\n본문", "옥상"],
    ["# 8 새벽\n본문", "새벽"],
    ["9장면 금고 앞\n본문", "금고 앞"],
  ])("번호 표지 %j 를 장면 시작으로 본다", (text, title) => {
    const scenes = extractManuscript(text, []).scenes;
    expect(scenes).toHaveLength(1);
    expect(scenes[0]?.boundary).toBe("scene-number");
    expect(scenes[0]?.title).toBe(title);
  });

  it("번호 뒤에 글자가 붙은 문장은 표지로 보지 않는다", () => {
    const scenes = extractManuscript("신 1개를 샀다.\n컷 3개를 그렸다.\n3화가 끝났다.", []).scenes;
    expect(scenes).toHaveLength(1);
    expect(scenes[0]?.boundary).toBe("start");
  });

  it("구분선 줄은 장면에 넣지 않고 다음 본문 줄에서 새 장면을 연다", () => {
    const text = "첫 장면 본문.\n\n* * *\n\n둘째 장면 본문.\n---\n셋째 장면 본문.\n◇ ◇ ◇\n넷째.";
    const result = extractManuscript(text, []);
    expect(result.scenes.map((scene) => scene.boundary)).toEqual(["start", "separator", "separator", "separator"]);
    expect(result.scenes.map((scene) => scene.excerpt)).toEqual(["첫 장면 본문.", "둘째 장면 본문.", "셋째 장면 본문.", "넷째."]);
  });

  it("빈 줄이 두 줄 이상 반복될 때만 경계로 본다", () => {
    const single = extractManuscript("가나다 라마바.\n\n사아자 차카타.", []);
    expect(single.scenes).toHaveLength(1);
    const repeated = extractManuscript("가나다 라마바.\n\n\n사아자 차카타.", []);
    expect(repeated.scenes.map((scene) => scene.boundary)).toEqual(["start", "blank-lines"]);
  });

  it("마크다운 헤딩을 장면 제목으로 읽는다", () => {
    const result = extractManuscript("## 새벽의 금고\n하은이 열쇠를 돌렸다.\n\n## 아침\n도진이 왔다.", REGISTER);
    expect(result.scenes.map((scene) => scene.title)).toEqual(["새벽의 금고", "아침"]);
    expect(result.scenes[0]?.boundary).toBe("heading");
  });

  it("회차 제목은 회차 번호를 장면에 이어 주고, 장면 표지가 이어지면 하나의 경계로 합친다", () => {
    const text = [
      "1화 비 내리는 시장",
      "",
      "장면 1",
      "하은이 걸었다.",
      "",
      "장면 2",
      "도진이 왔다.",
      "",
      "2화 새벽",
      "금고 앞에서 하은이 기다렸다.",
    ].join("\n");
    const result = extractManuscript(text, REGISTER);
    expect(result.scenes.map((scene) => [scene.title, scene.episodeNumber])).toEqual([
      ["장면 1", 1],
      ["장면 2", 1],
      ["새벽", 2],
    ]);
    // 2화 제목 줄은 앞 장면 꼬리가 아니라 새 장면의 첫 줄이다.
    expect(result.scenes[1]?.excerpt).not.toContain("2화");
    expect(text.slice(result.scenes[2]?.start ?? 0).startsWith("2화 새벽")).toBe(true);
  });

  it("빈 입력과 공백뿐인 입력은 장면 0개를 돌려주고 오류를 내지 않는다", () => {
    for (const text of ["", "   ", "\n\n\n", "\r\n\r\n"]) {
      const result = extractManuscript(text, REGISTER);
      expect(result.scenes).toHaveLength(0);
      expect(result.boundaries).toHaveLength(0);
    }
  });

  it("윈도우 줄바꿈(CRLF)도 같은 장면으로 나눈다", () => {
    const text = "장면 1\r\n하은이 걸었다.\r\n\r\n\r\n장면 2\r\n도진이 왔다.\r\n";
    const result = extractManuscript(text, REGISTER);
    expect(result.scenes).toHaveLength(2);
    expect(result.scenes[0]?.characters.map((match) => match.candidateIds)).toEqual([["character:haeun"]]);
  });
});

describe("등록된 이름 일치", () => {
  it("조사가 붙은 이름과 별칭을 같은 인물로 세고 장면별로 센다", () => {
    const text = "하은이 도진에게 말했다. 은이는 웃었고 하은의 손은 떨렸다.";
    const scene = extractManuscript(text, REGISTER).scenes[0];
    expect(scene?.characters).toEqual([
      { surface: "하은", count: 3, candidateIds: ["character:haeun"] },
      { surface: "도진", count: 1, candidateIds: ["character:dojin"] },
    ]);
  });

  it("더 긴 이름 안에 들어 있거나 낱말 안쪽에 있는 글자는 이름으로 세지 않는다", () => {
    const scene = extractManuscript("김하은이라는 아이와 하은아파트와 도진개진을 말했다.", REGISTER).scenes[0];
    expect(scene?.characters).toEqual([]);
  });

  it("한 글자 이름은 일치에서 제외하고 알린다", () => {
    const result = extractManuscript("나는 갔다.", [character("na", "나")]);
    expect(result.scenes[0]?.characters).toEqual([]);
    expect(result.warnings.some((warning) => warning.code === "short-name-skipped")).toBe(true);
  });

  it("같은 이름이 두 명 등록되어 있으면 자동으로 정하지 않고 후보로 남긴다", () => {
    const twins = [character("a", "민준"), character("b", "민준"), character("c", "서윤")];
    const scene = extractManuscript("민준이 서윤에게 말했다.", twins).scenes[0];
    expect(scene?.characters).toEqual([
      { surface: "민준", count: 1, candidateIds: ["character:a", "character:b"] },
      { surface: "서윤", count: 1, candidateIds: ["character:c"] },
    ]);
  });

  it("표지 줄의 장소를 우선하고, 없으면 본문에서 한 곳만 언급될 때만 장소로 정한다", () => {
    const text = "장면 1. 기억 시장\n하은이 금고 이야기를 했다.\n\n장면 2\n하은이 금고 앞에 섰다.\n\n장면 3\n하은이 기억 시장을 지나 금고로 갔다.";
    const scenes = extractManuscript(text, REGISTER).scenes;
    expect(scenes[0]?.locationEntryId).toBe("location:기억 시장");
    expect(scenes[1]?.locationEntryId).toBe("location:금고");
    expect(scenes[2]?.locationEntryId).toBeUndefined();
    expect(scenes[2]?.locations.map((match) => match.entryId)).toEqual(["location:기억 시장", "location:금고"]);
  });
});

describe("시간 단서", () => {
  it("명시된 시간 표현만 문자열 그대로 모으고 숫자 시간 값으로 바꾸지 않는다", () => {
    const text = "다음 날 아침, 하은이 깼다. 그날 밤 도진이 왔다. 3년 전의 일이 떠올랐다. 며칠 뒤. [회상] 오늘은 비가 온다.";
    const scene = extractManuscript(text, REGISTER).scenes[0];
    expect(scene?.timeCues).toEqual(["다음 날 아침", "그날 밤", "3년 전", "며칠 뒤", "[회상]"]);
  });

  it("시간 표현이 없으면 단서도 없다(오늘·어제 같은 흔한 낱말은 단서로 세지 않는다)", () => {
    const scene = extractManuscript("오늘은 어제와 달랐다.", REGISTER).scenes[0];
    expect(scene?.timeCues).toEqual([]);
  });
});

describe("결정성과 크기", () => {
  const big = Array.from({ length: 400 }, (_, i) => `장면 ${i + 1}\n하은이 도진에게 말했다. 다음 날 아침이 밝았다. ${"가나다라마바사 ".repeat(40)}\n`).join("\n");

  it("같은 입력은 항상 같은 결과를 낸다", () => {
    expect(extractManuscript(big, REGISTER)).toEqual(extractManuscript(big, REGISTER));
  });

  it("비동기 실행은 동기 실행과 같은 결과를 내고 묶음마다 제어권을 돌려준다", async () => {
    let yields = 0;
    const result = await extractManuscriptAsync(big, REGISTER, {}, {
      yieldToHost: async () => { yields += 1; },
    });
    expect(result).toEqual(extractManuscript(big, REGISTER));
    expect(yields).toBeGreaterThan(1);
    expect(yields).toBe(result.stats.chunks);
  });

  it("취소 신호가 켜지면 중단한다", async () => {
    const controller = new AbortController();
    await expect(extractManuscriptAsync(big, REGISTER, {}, {
      signal: controller.signal,
      yieldToHost: async () => { controller.abort(); },
    })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("훑은 글자 수가 입력 길이에 비례한다(두 배 입력 → 약 두 배)", () => {
    const half = extractManuscript(big, REGISTER).stats.scannedCharacters;
    const double = extractManuscript(`${big}\n${big}`, REGISTER).stats.scannedCharacters;
    expect(double / half).toBeGreaterThan(1.9);
    expect(double / half).toBeLessThan(2.2);
  });

  it("수십만 자·수백 장면도 몇 초 안에 끝난다", () => {
    const huge = Array.from({ length: 600 }, (_, i) => `장면 ${i + 1}\n하은이 도진에게 말했다. ${"가나다라마바사아자 ".repeat(80)}\n`).join("\n");
    expect(huge.length).toBeGreaterThan(400_000);
    const started = Date.now();
    const result = extractManuscript(huge, REGISTER);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(result.scenes).toHaveLength(600);
  });

  it("길이 상한을 넘으면 앞부분만 처리하고 알린다", () => {
    const result = extractManuscript("가".repeat(50), REGISTER, { maxChars: 20 });
    expect(result.stats.textLength).toBe(20);
    expect(result.warnings.map((warning) => warning.code)).toContain("too-long");
    expect(MANUSCRIPT_MAX_CHARS).toBeGreaterThan(900_000);
  });

  it("장면 수 상한을 넘으면 앞의 장면만 만들고 알린다", () => {
    const text = Array.from({ length: 10 }, (_, i) => `장면 ${i + 1}\n본문 ${i}`).join("\n\n");
    const result = extractManuscript(text, [], { maxScenes: 4 });
    expect(result.scenes).toHaveLength(4);
    expect(result.warnings.map((warning) => warning.code)).toContain("too-many-scenes");
  });
});

describe("경계 편집", () => {
  const text = "장면 1\n첫째 문단.\n\n둘째 문단.\n\n장면 2\n뒤 장면.";

  it("뒤 장면을 앞 장면에 합치면 장면이 하나 줄고 첫 경계는 지울 수 없다", () => {
    const { boundaries } = extractManuscript(text, REGISTER);
    expect(removeManuscriptBoundary(boundaries, 0)).toBe(boundaries);
    const merged = removeManuscriptBoundary(boundaries, 1);
    const result = extractManuscript(text, REGISTER, { boundaries: merged });
    expect(result.scenes).toHaveLength(1);
    expect(result.scenes[0]?.title).toBe("장면 1");
  });

  it("문단 앞에서 장면을 나누면 그 줄 시작에 수동 경계가 생긴다", () => {
    const first = extractManuscript(text, REGISTER);
    const scene = first.scenes[0];
    const starts = manuscriptParagraphStarts(text, scene?.start ?? 0, scene?.end ?? 0);
    expect(starts).toHaveLength(1);
    const split = addManuscriptBoundaryAt(text, first.boundaries, starts[0] ?? 0);
    expect(split.map((boundary) => boundary.kind)).toEqual(["scene-number", "manual", "scene-number"]);
    const again = extractManuscript(text, REGISTER, { boundaries: split });
    expect(again.scenes.map((s) => s.excerpt)).toEqual(["첫째 문단.", "둘째 문단.", "뒤 장면."]);
    expect(again.scenes[1]?.title).toBe("장면 2");
  });

  it("같은 위치에 중복 경계를 만들지 않고 첫 경계보다 앞에는 만들지 않는다", () => {
    const { boundaries } = extractManuscript(text, REGISTER);
    expect(addManuscriptBoundaryAt(text, boundaries, 0)).toBe(boundaries);
    const second = boundaries[1]?.offset ?? 0;
    expect(addManuscriptBoundaryAt(text, boundaries, second)).toBe(boundaries);
  });

  it("경계 탐지만 따로 호출해도 같은 경계를 돌려준다", () => {
    expect(detectManuscriptBoundaries(text)).toEqual(extractManuscript(text, REGISTER).boundaries);
  });
});
