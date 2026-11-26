import { describe, expect, it } from "vitest";

import { redactCreatorSensitiveText } from "./studio-pii-redactor";

describe("redactCreatorSensitiveText (한국형 복합 PII 마스킹 및 오탐 방어)", () => {
  it("한국 은행 계좌번호(라벨 포함·미포함)를 마스킹하고 은행명 문맥은 유지한다", () => {
    const raw =
      "정산 계좌는 국민은행 123401-04-123456, 신한 110-423-891234, 카카오뱅크 3333-01-2345678, 농협 302-1234-5678-91입니다.";
    const res = redactCreatorSensitiveText(raw);

    expect(res.redactedCount).toBe(4);
    for (const leaked of ["123401-04-123456", "110-423-891234", "3333-01-2345678", "302-1234-5678-91"]) {
      expect(res.sanitizedText).not.toContain(leaked);
    }
    expect(res.sanitizedText).toContain("국민은행 [계좌번호 비공개]");
    expect(res.sanitizedText).toContain("카카오뱅크 [계좌번호 비공개]");
  });

  it("계좌와 SNS 라벨에 줄바꿈과 유니코드 공백이 있어도 원래 표기를 보존한다", () => {
    const cases = [
      ["정산  계좌\n 번호 :\t", "123456789123", "[계좌번호 비공개]"],
      ["KB \n 국민 은행：\u3000", "1234-5678901", "[계좌번호 비공개]"],
      ["\n계좌:\n", "778899001122", "[계좌번호 비공개]"],
      ["카카오\u3000톡\n ID：\t", "@line_artist", "[계정 비공개]"],
      ["카카오\n ", "webtoon_id", "[계정 비공개]"],
      ["Kakao \n Talk \t핸들 : ", "@test.sketch", "[계정 비공개]"],
    ];

    for (const [label, value, token] of cases) {
      expect(redactCreatorSensitiveText(`${label}${value}`)).toEqual({
        sanitizedText: `${label}${token}`,
        redactedCount: 1,
      });
    }
  });

  it("공백·가운뎃점 주민등록번호와 괄호·+82·0507·엔대시·무구분자 유선 전화번호를 모두 마스킹한다", () => {
    const raw =
      "주민번호 920514 - 2345678 / 880101 1234567 / 010315·4123456, 연락처 (010) 4321-8765 / 010)1234-5678 / +82 2-555-7890 / 0507-1342-8899 / 010–9988–7766 / 0212345678 / 0311234567 / 07012345678";
    const res = redactCreatorSensitiveText(raw);

    expect(res.redactedCount).toBe(11);
    for (const leaked of [
      "920514",
      "2345678",
      "880101",
      "1234567",
      "010315",
      "4123456",
      "4321-8765",
      "1234-5678",
      "555-7890",
      "1342-8899",
      "9988–7766",
      "0212345678",
      "0311234567",
      "07012345678",
    ]) {
      expect(res.sanitizedText).not.toContain(leaked);
    }
  });

  it.each([
    "+821012345678",
    "+82 10 12345678",
    "+82(0)10-1234-5678",
    "010-12345678",
    "0101234-5678",
    "01012345678",
    "02-12345678",
    "021234-5678",
    "0311234567",
    "07012345678",
    "05071342-8899",
  ])("국제·부분 구분자 전화번호 %s를 부분 노출 없이 마스킹한다", (phone) => {
    expect(redactCreatorSensitiveText(`연락처: ${phone}`)).toEqual({
      sanitizedText: "연락처: [연락처 비공개]",
      redactedCount: 1,
    });
  });

  it.each(["9900133456789", "010123456789", "01012345", "123456789", "2026-11-26"])(
    "전화번호가 아닌 숫자 %s를 일부 전화번호로 잘라내지 않는다",
    (value) => {
      expect(redactCreatorSensitiveText(value)).toEqual({ sanitizedText: value, redactedCount: 0 });
    },
  );

  it.each(["", "계좌", "계좌 번호", "계좌 번호:", "카톡", "카톡 ID", "카톡 ID:"])(
    "값이 없는 %s 라벨과 긴 공백을 역추적 없이 그대로 보존한다",
    (label) => {
      const raw = `${label}${"\t".repeat(100_000)}!`;
      expect(redactCreatorSensitiveText(raw)).toEqual({ sanitizedText: raw, redactedCount: 0 });
    },
  );

  it("긴 공백 뒤의 실제 계좌·SNS 값도 빠뜨리지 않고 원문의 라벨과 공백을 보존한다", () => {
    const gap = "\t \u3000".repeat(10_000);
    const bankPrefix = `정산 계좌${gap}번호${gap}:${gap}`;
    const snsPrefix = `카카오${gap}톡${gap}ID${gap}：${gap}`;
    const raw = `${bankPrefix}123456789012 / ${snsPrefix}@artist_test`;
    const sanitizedText = `${bankPrefix}[계좌번호 비공개] / ${snsPrefix}[계정 비공개]`;
    expect(redactCreatorSensitiveText(raw)).toEqual({ sanitizedText, redactedCount: 2 });
    expect(redactCreatorSensitiveText(sanitizedText)).toEqual({ sanitizedText, redactedCount: 0 });
  });

  it("띄어 쓴 은행·SNS 라벨과 후속 후보를 보존하면서 계좌·아이디만 마스킹한다", () => {
    const raw = "KB 국민은행 : 123456789012 / NH 농협은행 234567890123 / 카톡 ! Kakao Talk ID: artist_123";
    expect(redactCreatorSensitiveText(raw)).toEqual({
      sanitizedText: "KB 국민은행 : [계좌번호 비공개] / NH 농협은행 [계좌번호 비공개] / 카톡 ! Kakao Talk ID: [계정 비공개]",
      redactedCount: 3,
    });
  });

  it("카카오톡 ID·오픈채팅 URL·인스타그램 핸들을 마스킹하되 npm 스코프 패키지는 건드리지 않는다", () => {
    const raw =
      "카톡 ID: webtoon_k99 / https://open.kakao.com/o/gAbCdEf1 / 인스타 @seoul_sketch_92 / IG: @artist.minji_2026 / 패키지 @toonstudio/contracts @cf/google/gemma";
    const res = redactCreatorSensitiveText(raw);

    expect(res.redactedCount).toBe(4);
    for (const leaked of ["webtoon_k99", "gAbCdEf1", "@seoul_sketch_92", "@artist.minji_2026"]) {
      expect(res.sanitizedText).not.toContain(leaked);
    }
    expect(res.sanitizedText).toContain("@toonstudio/contracts");
    expect(res.sanitizedText).toContain("@cf/google/gemma");
  });

  it("아파트·건물명·시/도 생략·괄호 부가 한국 주소를 모두 마스킹하고 일반 웹툰 지문은 보존한다", () => {
    const addresses = [
      "서울 강남구 대치동 은마아파트 12동 804호",
      "서울시 송파구 올림픽로 300 롯데월드타워 31층",
      "강남구 테헤란로 152 강남파이낸스센터 21층",
      "마포구 서교동 395-11 302호",
      "서울시 강남구 테헤란로 123 (역삼동, 101동 202호)",
    ];
    for (const addr of addresses) {
      const res = redactCreatorSensitiveText(`장소: ${addr}`);
      expect(res.redactedCount).toBe(1);
      expect(res.sanitizedText).toBe("장소: [주소 비공개]");
    }

    const safeProse = [
      "강남역에서 만났다.",
      "서울 중구 을지로 3가역 4번 출구에서 기다릴게.",
      "서울 중구 종로 3가에서 만나자.",
      "서울 친구 집으로 3분 걸렸다.",
      "서울시 강남구 카페에서 콘티를 짰다.",
      "2026-11-26 3화 15컷 여백 360px",
    ];
    for (const prose of safeProse) {
      const res = redactCreatorSensitiveText(prose);
      expect(res.redactedCount).toBe(0);
      expect(res.sanitizedText).toBe(prose);
    }
  });
});
