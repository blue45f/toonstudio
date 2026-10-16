import { describe, expect, it } from "vitest";

import { buildResponseFromDraft, createEmptyDraft } from "./reader-feedback-draft";
import { parseReaderFeedbackText } from "./reader-feedback-io";
import { CONTACT_MASK, cleanFeedbackText, cleanNickname, stripUnsafeCharacters } from "./reader-feedback-text";

/**
 * 눈에 보이지 않거나 빈 칸처럼 보이는 문자를 소스에 직접 두지 않고 코드 포인트로 조립한다.
 * 정리 규칙은 문자 목록이 아니라 유니코드 속성으로 세우므로, 시험도 "목록에 없던 문자"를 폭넓게 확인한다.
 */
const chars = (...codePoints: number[]) => String.fromCodePoint(...codePoints);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
const ZWJ = 0x200d;
const ZWNJ = 0x200c;
const VS16 = 0xfe0f;
const VS15 = 0xfe0e;

/** 닉네임·의견에 남으면 빈 칸처럼 보이는 응답이 만들어지는 문자들(독립 리뷰가 확인한 것 + 같은 속성의 나머지 대표). */
const INVISIBLE_CODE_POINTS: Readonly<Record<string, readonly number[]>> = {
  "점자 빈칸": [0x2800],
  "한글 채움(초성·중성)": [0x115f, 0x1160],
  "크메르 고유 모음": [0x17b4, 0x17b5],
  "결합 문자 접합자": [0x34f],
  "몽골 모음 구분자": [0x180e],
  "소프트 하이픈": [0xad],
  "태그 문자": [0xe0001, ...range(0xe0020, 0xe007f)],
  "주석 앵커·객체 대체": range(0xfff9, 0xfffc),
  "제로폭·방향 전환": [0x61c, ...range(0x200b, 0x200f), ...range(0x202a, 0x202e), ...range(0x2060, 0x206f)],
  "한글 채움(호환)": [0x3164, 0xffa0],
  "변형 선택자 모음": [...range(0xfe00, 0xfe0f), ...range(0xe0100, 0xe01ef), 0x180b, 0x180c, 0x180d, 0x180f],
  "BOM": [0xfeff],
  "사용자 지정 영역": [0xe000, 0xf8ff, 0xf0000, 0x10fffd],
  "비문자·미할당": [0xfdd0, 0xfdef, 0xfffe, 0xffff, 0x378, 0x2065],
  "제어 문자": [...range(0x0, 0x8), 0xe, 0x1f, 0x7f, 0x80, 0x9f],
};

describe("보이지 않는 문자는 목록이 아니라 유니코드 속성으로 지운다", () => {
  for (const [name, codePoints] of Object.entries(INVISIBLE_CODE_POINTS)) {
    it(`${name}: 글 사이에서는 지우고, 그것만 쓴 의견·닉네임·제목은 빈 값이다`, () => {
      for (const code of codePoints) {
        const hidden = chars(code);
        expect(cleanFeedbackText(`가${hidden}나`, 600), `U+${code.toString(16)}`).toBe("가나");
        expect(cleanFeedbackText(hidden, 600), `U+${code.toString(16)}`).toBe("");
        expect(cleanNickname(hidden, 20), `U+${code.toString(16)}`).toBeNull();
        expect(cleanNickname(`별${hidden}빛`, 20), `U+${code.toString(16)}`).toBe("별빛");
      }
    });
  }

  it("보이지 않는 문자와 공백만 섞어 써도 보이는 글자가 없으면 빈 값이다", () => {
    const blanks = chars(0x2800, 0x20, 0x3164, 0xa0, 0x3000, 0xe0041, 0x2003, 0x200b, 0xffa0, 0x20);
    expect(cleanFeedbackText(blanks, 600)).toBe("");
    expect(cleanNickname(blanks, 20)).toBeNull();
  });

  it("결합 문자만 있는 글은 보이는 글자가 아니지만, 기본 글자에 붙은 결합 문자는 남는다", () => {
    expect(cleanFeedbackText(chars(0x301, 0x301), 600)).toBe("");
    expect(cleanFeedbackText(chars(0x65, 0x301), 600)).toBe(chars(0xe9));
  });

  it("태그 문자로 실은 숨은 글은 눈에 보이는 글만 남기고 사라진다", () => {
    // 'ignore' 를 태그 문자(U+E0000 + ASCII)로 적어 보이는 글 뒤에 붙인 경우.
    const smuggled = Array.from("ignore").map((letter) => 0xe0000 + letter.charCodeAt(0));
    expect(cleanFeedbackText(`좋았어요${chars(...smuggled)}`, 600)).toBe("좋았어요");
    expect(cleanNickname(`별빛${chars(0xe0001, ...smuggled, 0xe007f)}`, 20)).toBe("별빛");
  });

  it("글자·숫자·구두점·기호·이모지는 그대로 남는다", () => {
    const visible = [
      "안녕하세요", "Hello", "こんにちは", "漢字", "مرحبا", "שלום", "𠮷野家", "é", "①②③", "100%", "!!!", "…", "—", "™", "→",
      "👍", "👍🏽", "🇰🇷", "1️⃣", "⠁⠃⠉", "© 2026", "A B",
    ];
    for (const text of visible) expect(cleanFeedbackText(text, 600), text).toBe(text.normalize("NFC"));
    // 대체 문자(U+FFFD)는 보이는 글자다. 깨진 글자가 있었다는 사실을 가리지 않는다.
    expect(cleanFeedbackText(chars(0xfffd), 600)).toBe(chars(0xfffd));
  });

  it("정리는 멱등이다: 이미 정리된 값을 다시 정리해도 같다(내보낸 파일을 다시 가져와도 바뀌지 않는다)", () => {
    const family = chars(0x1f468, ZWJ, 0x1f469, ZWJ, 0x1f467);
    const samples = [
      `${family}${chars(ZWJ)}`, `${chars(ZWJ)}${family}`, `가${chars(ZWJ, ZWNJ, ZWJ)}나`, `x${chars(VS16)}${chars(0x2764, VS16, VS16)}`,
      `${chars(0x2764, VS16, ZWJ, 0x1f525)}${chars(ZWJ)}`, `${chars(0x1f468, 0x200b, ZWJ, 0x1f469)}`, `mail a@b.co ${chars(0x2800)}${chars(0x1f469, ZWJ)}`,
      "가".repeat(599) + family, "나".repeat(598) + family,
    ];
    for (const sample of samples) {
      for (const limit of [3, 600]) {
        const once = cleanFeedbackText(sample, limit);
        expect(cleanFeedbackText(once, limit), JSON.stringify(sample)).toBe(once);
      }
    }
  });

  it("줄바꿈·탭은 공백 하나로 접고, 앞뒤 공백은 없앤다", () => {
    expect(cleanFeedbackText(`  가\n\n  나\t다${chars(0x2028)}라  `, 600)).toBe("가 나 다 라");
    expect(stripUnsafeCharacters("a\r\nb")).toBe("a  b");
  });
});

describe("이모지를 잇는 ZWJ 만 남기고 그 밖의 ZWJ·ZWNJ 는 지운다", () => {
  const man = 0x1f468;
  const woman = 0x1f469;
  const girl = 0x1f467;
  const fire = 0x1f525;

  it("가족·직업·국기 같은 이모지 연결은 하나의 그림으로 남는다", () => {
    const sequences: Readonly<Record<string, string>> = {
      "가족": chars(man, ZWJ, woman, ZWJ, girl),
      "불타는 하트": chars(0x2764, VS16, ZWJ, fire),
      "무지개 깃발": chars(0x1f3f3, VS16, ZWJ, 0x1f308),
      "해적 깃발": chars(0x1f3f4, ZWJ, 0x2620, VS16),
      "피부색이 있는 우주비행사": chars(0x1f9d1, 0x1f3fd, ZWJ, 0x1f680),
      "직업(성별 기호)": chars(woman, 0x1f3fb, ZWJ, 0x2695, VS16),
      "눈과 말풍선": chars(0x1f441, VS16, ZWJ, 0x1f5e8, VS16),
      "손잡은 두 사람": chars(0x1f9d1, 0x1f3fb, ZWJ, 0x1f91d, ZWJ, 0x1f9d1, 0x1f3ff),
    };
    for (const [name, sequence] of Object.entries(sequences)) {
      expect(cleanFeedbackText(sequence, 600), name).toBe(sequence);
      expect(cleanFeedbackText(`좋아요 ${sequence}!`, 600), name).toBe(`좋아요 ${sequence}!`);
      expect(cleanNickname(sequence, 20), name).toBe(sequence);
    }
  });

  it("이모지 사이가 아닌 ZWJ·ZWNJ 는 모두 지운다", () => {
    const stray = [
      chars(0x61, ZWJ, 0x62), chars(0x61, ZWNJ, 0x62), chars(ZWJ, man), chars(man, ZWJ), chars(man, ZWJ, 0x62), chars(0x62, ZWJ, man),
      chars(man, ZWNJ, woman), chars(man, ZWJ, ZWJ, woman), chars(man, ZWJ, ZWNJ, woman), chars(man, 0x200b, ZWJ, woman), chars(man, ZWJ, 0x200b, woman),
      chars(man, 0x20, ZWJ, 0x20, woman),
    ];
    for (const text of stray) {
      const cleaned = cleanFeedbackText(text, 600);
      expect(cleaned.includes(chars(ZWJ)), JSON.stringify(text)).toBe(false);
      expect(cleaned.includes(chars(ZWNJ)), JSON.stringify(text)).toBe(false);
    }
    expect(cleanFeedbackText(chars(man, ZWNJ, woman), 600)).toBe(chars(man, woman));
    expect(cleanFeedbackText(chars(man, ZWJ, ZWJ, woman), 600)).toBe(chars(man, woman));
    expect(cleanFeedbackText(chars(0x61, ZWJ, 0x62), 600)).toBe("ab");
  });

  it("알려진 손실: 태그 문자로 이은 지역 깃발은 기본 깃발로 줄고, 이모지 밖의 ZWNJ(예: 페르시아어)는 지워진다", () => {
    // 🏴 + 태그 문자(gbeng) + 취소 태그 = 잉글랜드 깃발. 태그 문자는 숨은 글을 실을 수 있어 지운다(문서 9절).
    const england = chars(0x1f3f4, ...Array.from("gbeng").map((letter) => 0xe0000 + letter.charCodeAt(0)), 0xe007f);
    expect(cleanFeedbackText(england, 600)).toBe(chars(0x1f3f4));
    expect(cleanFeedbackText(`می${chars(ZWNJ)}خواهم`, 600)).toBe("میخواهم");
  });

  it("ZWJ 만 쓴 글은 보이는 글자가 없어 빈 값이다", () => {
    expect(cleanFeedbackText(chars(ZWJ, ZWJ, ZWNJ), 600)).toBe("");
    expect(cleanNickname(chars(ZWJ), 20)).toBeNull();
  });

  it("이모지 표시 선택자(VS16)는 이모지 바로 뒤에서만 남기고, 홀로 있거나 겹치면 지운다", () => {
    const heart = chars(0x2764, VS16);
    expect(cleanFeedbackText(`좋아요 ${heart}`, 600)).toBe(`좋아요 ${heart}`);
    expect(cleanFeedbackText(chars(0x2764, VS15), 600)).toBe(chars(0x2764, VS15));
    expect(cleanFeedbackText(chars(0x61, VS16, 0x62), 600)).toBe("ab");
    expect(cleanFeedbackText(chars(0x2764, VS16, VS16, VS16), 600)).toBe(heart);
    expect(cleanFeedbackText(chars(VS16), 600)).toBe("");
    // 변형 선택자에 글을 실어 보내는 수법(이모지 뒤에 여러 개)을 막는다.
    expect(cleanFeedbackText(`${chars(0x1f600)}${chars(...range(0xe0100, 0xe0120))}`, 600)).toBe(chars(0x1f600));
  });

  it("길이 제한으로 자르다 이모지 연결 중간에서 끊겨도 매달린 ZWJ 를 남기지 않는다", () => {
    const family = chars(man, ZWJ, woman, ZWJ, girl);
    // 코드 포인트 2개까지: 👨 + ZWJ 에서 끊긴다.
    expect(cleanFeedbackText(family, 2)).toBe(chars(man));
    // 코드 포인트 3개까지: 👨‍👩 로 끊기고 다음 ZWJ 는 남지 않는다.
    expect(cleanFeedbackText(family, 3)).toBe(chars(man, ZWJ, woman));
    expect(cleanFeedbackText(family, 4)).toBe(chars(man, ZWJ, woman));
  });
});

describe("보이는 글자가 없는 응답은 답한 것으로 세지 않는다", () => {
  const response = (overrides: Record<string, unknown> = {}) => ({
    id: "resp-1",
    createdAt: "2026-10-16T01:00:00.000Z",
    target: { kind: "package", id: "pkg-1", title: "새 연재작 1화", episode: 1 },
    nickname: null,
    ratings: { fun: null, understanding: null },
    reading: { status: "unmarked" },
    emotions: [],
    comment: "",
    spoiler: false,
    ...overrides,
  });
  const file = (responses: Record<string, unknown>[]) => JSON.stringify({ kind: "toonstudio-reader-feedback", version: 1, exportedAt: "2026-10-16T01:05:00.000Z", responses });

  it("가져오기: 빈 칸처럼 보이는 문자만 쓴 응답은 내용이 없는 응답으로 거절한다", () => {
    for (const [name, codePoints] of Object.entries(INVISIBLE_CODE_POINTS)) {
      const result = parseReaderFeedbackText(file([response({ comment: chars(...codePoints) })]));
      expect(result.ok, name).toBe(false);
    }
    // 점수 같은 다른 답이 있으면 의견은 빈 값이 되어 들어온다.
    const withScore = parseReaderFeedbackText(file([response({ ratings: { fun: 2, understanding: null }, comment: chars(0x2800, 0xe0041) })]));
    expect(withScore.ok && withScore.file.responses[0]?.comment).toBe("");
  });

  it("가져오기: 닉네임이 보이지 않는 문자뿐이면 익명이고, 작품 이름이 그러면 거절한다", () => {
    const nickname = parseReaderFeedbackText(file([response({ ratings: { fun: 1, understanding: null }, nickname: chars(0x2800, 0x115f, 0xe0041) })]));
    expect(nickname.ok && nickname.file.responses[0]?.nickname).toBeNull();
    const title = parseReaderFeedbackText(file([response({ ratings: { fun: 1, understanding: null }, target: { kind: "package", id: "pkg-1", title: chars(0x2800, 0x3164), episode: 1 } })]));
    expect(title.ok).toBe(false);
  });

  it("폼 초안: 보이지 않는 문자만 쓴 의견은 답이 아니고, 작품 이름이 그러면 '이름을 적어 주세요'가 나온다", () => {
    const META = { id: "draft-1", createdAt: "2026-10-16T02:00:00.000Z" } as const;
    const draft = (overrides: Record<string, unknown>) => ({ ...createEmptyDraft(), ...overrides });
    const known = { kind: "package" as const, id: "pkg-9", title: "새 연재작 1화", episode: null, cutCount: 12 };
    const empty = buildResponseFromDraft(draft({ comment: chars(0x2800, 0x3164, 0xe0041) }), known, META);
    expect(!empty.ok && empty.errors).toEqual([{ field: "empty", code: "nothing-answered" }]);
    const title = buildResponseFromDraft(draft({ title: chars(0x2800, 0x3164), fun: 2 }), null, META);
    expect(!title.ok && title.errors).toEqual([{ field: "title", code: "required" }]);
  });

  it("연락처를 보이지 않는 문자로 쪼개 써도 가려진다", () => {
    const email = `mail${chars(0x200b)}@${chars(0xe0041)}example${chars(0x2800)}.com`;
    expect(cleanFeedbackText(email, 600)).toBe(CONTACT_MASK);
    expect(cleanNickname(email, 20)).toBeNull();
  });
});
