import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  drawTodayFortune as drawTodayEngine,
  drawZodiac as drawZodiacEngine,
} from "@toonstudio/core/fortune";
import { allTitles } from "@/shared/lib/server/catalog-store";

import {
  drawCompatibilityLocal,
  drawSajuLocal,
  drawTodayLocal,
  drawZodiacLocal,
} from "./fortune-client-draw";

// F-B10-1 회귀 고정 (2026-10-08):
// - 사주·궁합 골든값은 제거된 구 서버 엔드포인트의 2026-10-08 로컬 실측 응답에서
//   고정한 것이다. 클라이언트 계산이 서버 계산과 같은 결과를 내는지 고정한다.
// - 오늘·별자리는 날짜 의존이라 같은 날 엔진 직접 호출 결과와 전 필드를 대조한다.
describe("fortune-client-draw — 서버 계산과의 동등성", () => {
  it("사주 (1990-06-15 14:30, 남성, 아라) 골든값과 일치한다", async () => {
    const r = await drawSajuLocal({
      birthDate: "1990-06-15",
      birthTime: "14:30",
      gender: "male",
      characterId: "ara",
    });
    expect(r.saju?.yearPillar).toEqual({ kan: "庚", ji: "午", kanKorean: "경", jiKorean: "오", elementKan: "금", elementJi: "화" });
    expect(r.saju?.monthPillar).toEqual({ kan: "壬", ji: "午", kanKorean: "임", jiKorean: "오", elementKan: "수", elementJi: "화" });
    expect(r.saju?.dayPillar).toEqual({ kan: "辛", ji: "亥", kanKorean: "신", jiKorean: "해", elementKan: "금", elementJi: "수" });
    expect(r.saju?.hourPillar).toEqual({ kan: "乙", ji: "未", kanKorean: "을", jiKorean: "미", elementKan: "목", elementJi: "토" });
    expect(r.saju?.elementsRatio).toEqual({ wood: 13, fire: 25, earth: 12, metal: 25, water: 25 });
    expect(r.analysis?.dayMasterKan).toBe("신");
    expect(r.analysis?.dayMasterElement).toBe("금");
    expect(r.analysis?.strength).toBe("신약");
    expect(r.analysis?.dominantTenGod).toBe("비겁");
    expect(r.analysis?.usefulElementEn).toBe("earth");
    expect(r.panels?.length).toBe(4);
    expect(Array.isArray(r.recommendations)).toBe(true);
  });

  it("사주 (1985-11-02, 시간 미상, 여성, 레오나) 골든값과 일치한다", async () => {
    const r = await drawSajuLocal({
      birthDate: "1985-11-02",
      gender: "female",
      characterId: "leona",
    });
    expect(r.saju?.yearPillar.kan).toBe("乙");
    expect(r.saju?.yearPillar.ji).toBe("丑");
    expect(r.saju?.monthPillar.kan).toBe("丙");
    expect(r.saju?.monthPillar.ji).toBe("戌");
    expect(r.saju?.dayPillar.kan).toBe("乙");
    expect(r.saju?.dayPillar.ji).toBe("巳");
    // 시간 미상 — 시주는 빈 센티넬이고 birthTimeKnown이 거짓이다.
    expect(r.saju?.hourPillar.kan).toBe("");
    expect(r.saju?.birthTimeKnown).toBe(false);
    expect(r.saju?.elementsRatio).toEqual({ wood: 34, fire: 33, earth: 33, metal: 0, water: 0 });
    expect(r.analysis?.usefulElementEn).toBe("water");
  });

  it("궁합 (1990-06-15 14:30 / 1992-03-20 09:10) 골든값과 일치한다", async () => {
    const r = await drawCompatibilityLocal({
      myBirthDate: "1990-06-15",
      myBirthTime: "14:30",
      partnerBirthDate: "1992-03-20",
      partnerBirthTime: "09:10",
      characterId: "ara",
    });
    expect(r.score).toBe(61);
    expect(r.compat?.score).toBe(61);
    expect(r.compat?.grade).toBe("노력으로 빛나는 인연");
    expect(r.compat?.factors).toEqual([
      "일지(궁합궁) 삼합 그룹의 두 글자(반합 참고) — 뜻을 맞춰 보는 인연",
      "오행 보완 — 서로의 부족한 기운을 2곳에서 채워줌",
      "일간 천간충(天干沖) — 강한 자극과 긴장, 조율 필요",
      "오행 상극(相剋) — 끌리지만 자기주장 조율 필요",
    ]);
    expect(r.compat?.elementComplement).toBe(68);
    expect(r.mySaju?.dayPillar.kan).toBe("辛");
    expect(r.partnerSaju?.dayPillar.kan).toBe("乙");
  });

  it("오늘의 운세는 엔진 직접 호출과 전 필드가 같다 (생년월일 입력)", async () => {
    const viaLocal = await drawTodayLocal({
      characterId: "ara",
      birthDate: "1990-06-15",
      birthTime: "14:30",
      gender: "male",
    });
    const viaEngine = await drawTodayEngine(allTitles(), "ara", "1990-06-15", "14:30", "male");
    expect(viaLocal.today).toEqual(viaEngine.today);
    expect(viaLocal.iljin).toEqual(viaEngine.iljin);
    expect(viaLocal.categories).toEqual(viaEngine.categories);
    expect(viaLocal.luckyElement).toBe(viaEngine.luckyElement);
    expect(viaLocal.interpretation).toBe(viaEngine.interpretation);
    expect(viaLocal.recommendations).toEqual(viaEngine.recommendations);
  });

  it("오늘의 운세는 엔진 직접 호출과 전 필드가 같다 (익명)", async () => {
    const viaLocal = await drawTodayLocal({ characterId: "danwoo", gender: "none" });
    const viaEngine = await drawTodayEngine(allTitles(), "danwoo", undefined, undefined, "none");
    expect(viaLocal.today).toEqual(viaEngine.today);
    expect(viaLocal.saju ?? null).toBeNull();
    expect(viaLocal.iljin ?? null).toBeNull();
  });

  it("별자리는 날짜 무관 필드가 고정값이고, 오늘 점수는 엔진과 같다", async () => {
    const viaLocal = await drawZodiacLocal({ characterId: "leona", month: 6, day: 15 });
    const viaEngine = await drawZodiacEngine(allTitles(), "leona", 6, 15);
    expect(viaLocal.zodiac?.id).toBe("gemini");
    expect(viaLocal.zodiac?.ko).toBe("쌍둥이자리");
    expect(viaLocal.zodiac?.dateRange).toBe("5.21~6.21");
    expect(viaLocal.zodiac?.ruling).toBe("수성");
    expect(viaLocal.zodiac).toEqual(viaEngine.zodiac);
    expect(viaLocal.interpretation).toBe(viaEngine.interpretation);
  });
});

describe("fortune-client-draw — 생년월일 전송 경로 제거", () => {
  const pageSource = readFileSync(
    fileURLToPath(new URL("./FortunePage.tsx", import.meta.url)),
    "utf8",
  );
  const drawSource = readFileSync(
    fileURLToPath(new URL("./fortune-client-draw.ts", import.meta.url)),
    "utf8",
  );

  it("FortunePage는 생년월일을 받던 엔드포인트를 호출하지 않는다", () => {
    for (const path of [
      "/api/fortune/today",
      "/api/fortune/saju",
      "/api/fortune/compatibility",
      "/api/fortune/zodiac",
    ]) {
      expect(pageSource).not.toContain(path);
    }
  });

  it("리워드 기록은 mode만 담아 보낸다", () => {
    expect(drawSource).toContain('"/api/fortune/used"');
    expect(drawSource).toContain("JSON.stringify({ mode })");
    const reportSection = drawSource.slice(drawSource.indexOf("export function reportFortuneUse"));
    expect(reportSection).not.toContain("birthDate");
    expect(reportSection).not.toContain("birthTime");
    expect(reportSection).not.toContain("gender");
  });
});
