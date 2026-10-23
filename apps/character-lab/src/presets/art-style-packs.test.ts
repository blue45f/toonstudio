import { describe, expect, it } from "vitest";

import { ART_STYLE_IDS, ART_STYLE_LABELS_KO, DEFAULT_SHADING, LOOK_V2_IDENTITY, artStylePackSchema, isLookV2Identity, recipeLookSchema, shadingProfileSchema } from "../contracts";
import { stableStringify } from "../shared/stable-json";

import { ART_STYLE_PACKS, ART_STYLE_PACK_PROVENANCE, ART_STYLE_PACK_REVISION, artStylePack } from "./art-style-packs";

import type { ArtStyleId, ArtStylePack } from "../contracts";

/** 설계 §5.1 표의 칸(두신 여/남·다리비·눈폭·램프 단수·선 굵기·톤·종이·채도, 부드러움은 표에 적힌 팩만) */
const TABLE: Readonly<
  Record<ArtStyleId, { heads: readonly [number, number]; leg: number; eye: number; ramp: 2 | 3 | 4; softness?: number; lineMm: number; tone: string; paper: string; saturation: number }>
> = {
  "jp-anime-cel": { heads: [7, 7.5], leg: 0.48, eye: 0.25, ramp: 2, softness: 0.05, lineMm: 3, tone: "none", paper: "none", saturation: 1.05 },
  "jp-shounen-ink": { heads: [7.5, 8], leg: 0.49, eye: 0.2, ramp: 2, lineMm: 6.5, tone: "halftone", paper: "print", saturation: 0.9 },
  "jp-shoujo-soft": { heads: [7.8, 8.5], leg: 0.51, eye: 0.28, ramp: 3, softness: 0.35, lineMm: 1.2, tone: "dots", paper: "print", saturation: 0.65 },
  "jp-seinen-real": { heads: [7.2, 7.6], leg: 0.47, eye: 0.18, ramp: 4, lineMm: 3.5, tone: "crosshatch", paper: "print", saturation: 0.75 },
  "kr-webtoon-romance": { heads: [7.8, 9], leg: 0.52, eye: 0.22, ramp: 2, softness: 0.2, lineMm: 4, tone: "none", paper: "none", saturation: 0.9 },
  "kr-webtoon-action": { heads: [7.8, 8.6], leg: 0.5, eye: 0.2, ramp: 3, softness: 0.6, lineMm: 3.5, tone: "none", paper: "none", saturation: 1 },
  "sd-chibi": { heads: [3, 3.2], leg: 0.3, eye: 0.32, ramp: 2, softness: 0.1, lineMm: 3, tone: "none", paper: "none", saturation: 1.15 },
  "ink-wash": { heads: [7.2, 7.6], leg: 0.47, eye: 0.17, ramp: 2, softness: 0.5, lineMm: 3, tone: "none", paper: "ink-wash", saturation: 0.12 },
};

/** 라벨에 쓰면 안 되는 작품·작가·경쟁 제품·회사 이름(설계 O9 — 대표 예시 목록) */
const BANNED_LABEL_WORDS = ["shaper", "네이버", "naver", "지브리", "ghibli", "vroid", "디즈니", "disney", "픽사", "pixar", "원피스", "나루토", "naruto", "드래곤볼", "clip studio", "클립 스튜디오", "카카오", "kakao"];

function valueAt(pack: ArtStylePack, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (typeof node === "object" && node !== null ? (node as Record<string, unknown>)[key] : undefined), pack);
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

describe("presets/art-style-packs: 스키마·어휘", () => {
  it("T1 8종이 계약 id 순서로 있고 id로 같은 팩을 찾는다", () => {
    expect(ART_STYLE_PACKS.map((pack) => pack.id)).toEqual([...ART_STYLE_IDS]);
    for (const pack of ART_STYLE_PACKS) expect(artStylePack(pack.id)).toBe(pack);
  });

  it("모든 팩이 artStylePackSchema(strict)를 통과하고 파싱 결과가 원본과 같다(변환 없음)", () => {
    for (const pack of ART_STYLE_PACKS) {
      const parsed = artStylePackSchema.safeParse(pack);
      expect(parsed.success, `${pack.id}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 2))}`).toBe(true);
      expect(stableStringify(parsed.data)).toBe(stableStringify(pack));
      expect(pack.revision).toBe(ART_STYLE_PACK_REVISION);
    }
  });

  it("look은 레시피 look 스키마(강조 채널 어휘 대조)와 style/apply가 만드는 v3 셰이딩 프로파일을 통과한다", () => {
    for (const pack of ART_STYLE_PACKS) {
      expect(recipeLookSchema.safeParse(pack.look).success, pack.id).toBe(true);
      // reducer(style/apply 룩 범위)와 같은 조립: 툰 모드 + 팩의 램프·림·외곽선 + 팩 look
      const shading = { ...DEFAULT_SHADING, mode: "toon", toon: { ...DEFAULT_SHADING.toon, ...pack.toon }, look: pack.look };
      expect(shadingProfileSchema.safeParse(shading).success, pack.id).toBe(true);
    }
  });

  it("라벨은 계약 한글 라벨과 같고 장르명만 쓴다(금지어 없음)", () => {
    for (const pack of ART_STYLE_PACKS) {
      // 한글 라벨은 계약 값(SD는 계약이 "SD" 그대로 쓴다)
      expect(pack.labelKo).toBe(ART_STYLE_LABELS_KO[pack.id]);
      expect(pack.labelKo.trim().length).toBeGreaterThan(0);
      expect(pack.labelEn).toMatch(/^[A-Za-z][A-Za-z -]+$/u);
      const text = `${pack.labelKo} ${pack.labelEn}`.toLowerCase();
      for (const word of BANNED_LABEL_WORDS) expect(text.includes(word), `${pack.id}: ${word}`).toBe(false);
    }
  });

  it("팩과 하위 객체가 깊이 동결돼 있다(공유 데이터 오염 방지)", () => {
    expect(Object.isFrozen(ART_STYLE_PACKS)).toBe(true);
    for (const pack of ART_STYLE_PACKS) expect(isDeepFrozen(pack), pack.id).toBe(true);
  });
});

describe("presets/art-style-packs: 설계 §5.1 표 값", () => {
  it("두신 여/남·다리비·눈폭·램프 단수·선 굵기·톤·종이·채도가 표와 같다", () => {
    for (const pack of ART_STYLE_PACKS) {
      const row = TABLE[pack.id];
      expect([pack.proportion.feminine.headsTall, pack.proportion.masculine.headsTall], pack.id).toEqual([...row.heads]);
      expect(pack.proportion.feminine.legRatio, pack.id).toBe(row.leg);
      expect(pack.proportion.masculine.legRatio, pack.id).toBe(row.leg);
      expect(pack.face.eyeWidthToFace, pack.id).toBe(row.eye);
      expect(pack.toon.rampSteps, pack.id).toBe(row.ramp);
      if (row.softness !== undefined) expect(pack.look.ramp.softness, pack.id).toBe(row.softness);
      expect(pack.look.line.widthMm, pack.id).toBe(row.lineMm);
      expect(pack.look.tone.kind, pack.id).toBe(row.tone);
      expect(pack.look.paper.kind, pack.id).toBe(row.paper);
      expect(pack.look.grade.saturation, pack.id).toBe(row.saturation);
      expect(pack.palette.saturation, pack.id).toBe(row.saturation);
    }
  });

  it("kr-webtoon-romance의 실측값(두신 7.8/9.0·눈폭 0.22)은 그대로이고 실측 경로가 출처 표에 있다", () => {
    const romance = artStylePack("kr-webtoon-romance");
    expect(romance.proportion.feminine.headsTall).toBe(7.8);
    expect(romance.proportion.masculine.headsTall).toBe(9);
    expect(romance.face.eyeWidthToFace).toBe(0.22);
    const measured = ART_STYLE_PACK_PROVENANCE["kr-webtoon-romance"].measured;
    for (const path of ["proportion.feminine.headsTall", "proportion.masculine.headsTall", "face.eyeWidthToFace"]) expect(measured).toContain(path);
    // 관찰 범위 안의 값(가이드 §1): 개구비 0.6~0.76, 홍채비 0.5~0.66, 눈선 0.54
    expect(romance.face.eyeOpenRatio).toBeGreaterThanOrEqual(0.6);
    expect(romance.face.eyeOpenRatio).toBeLessThanOrEqual(0.76);
    expect(romance.face.irisToEye).toBeGreaterThanOrEqual(0.5);
    expect(romance.face.irisToEye).toBeLessThanOrEqual(0.66);
    expect(romance.face.eyeLine).toBe(0.54);
  });

  it("팩별 특징 칸(그림자 틴트·선·톤·종이·림)이 표의 서술과 같다", () => {
    expect(artStylePack("jp-anime-cel").look.shade.skin).toEqual({ kind: "oklab", dL: -0.22, dHueDeg: -20, chroma: 1 });
    expect(artStylePack("jp-anime-cel").look.line).toMatchObject({ method: "style-hull", color: { mode: "darken-albedo" } });

    const shounen = artStylePack("jp-shounen-ink").look;
    expect(shounen.shade.other).toEqual({ kind: "oklab", dL: -0.3, dHueDeg: 0, chroma: 0.6 });
    expect(shounen.line).toMatchObject({ curvatureGain: 0.5, color: { mode: "fixed", rgb: [0, 0, 0] }, inner: { enabled: true, creaseDeg: 30 } });
    expect(shounen.tone).toMatchObject({ kind: "halftone", angleDeg: 45, cellPerHead: 22, bands: [0, 0.55, 0.85] });
    expect(shounen.paper).toMatchObject({ kind: "print", strength: 0.15 });

    const shoujo = artStylePack("jp-shoujo-soft");
    expect(shoujo.look.shade.skin).toMatchObject({ kind: "oklab", dHueDeg: 25 });
    expect(shoujo.look.rim).toMatchObject({ edge0: 0.5, edge1: 0.7 });
    expect(shoujo.toon.rim).toBe(true);
    expect(shoujo.look.line.color).toMatchObject({ mode: "darken-albedo", dL: 0.35 });
    expect(shoujo.look.tone).toMatchObject({ kind: "dots", cellPerHead: 60, strength: 0.25 });
    expect(shoujo.look.paper).toMatchObject({ kind: "print", strength: 0.1 });

    const seinen = artStylePack("jp-seinen-real").look;
    expect(seinen.shade.skin).toMatchObject({ kind: "oklab", dL: -0.35 });
    expect(seinen.line).toMatchObject({ depthGain: 0.6, curvatureGain: 0.8, inner: { enabled: true, creaseDeg: 25 } });
    expect(seinen.tone).toMatchObject({ kind: "crosshatch", cellPerHead: 40, bands: [0.35, 0.6, 0.85] });
    expect(seinen.paper).toMatchObject({ kind: "print", strength: 0.2 });

    const romance = artStylePack("kr-webtoon-romance");
    expect(romance.toon.rim).toBe(false);
    expect(romance.look.shade.skin).toEqual(LOOK_V2_IDENTITY.shade.skin);
    expect(romance.look.line).toEqual(LOOK_V2_IDENTITY.line);

    const action = artStylePack("kr-webtoon-action");
    expect(action.toon.rim).toBe(true);
    // 차가운 림: 파랑 성분이 빨강보다 크다
    expect(action.look.rim.color[2]).toBeGreaterThan(action.look.rim.color[0]);
    expect(action.look.line).toMatchObject({ depthGain: 0.5, color: { mode: "darken-albedo" } });

    expect(artStylePack("sd-chibi").look.line.color.mode).toBe("darken-albedo");

    const ink = artStylePack("ink-wash").look;
    expect(ink.shade.skin).toEqual({ kind: "oklab", dL: -0.25, dHueDeg: 0, chroma: 0.2 });
    expect(ink.line.curvatureGain).toBe(1);
    expect(ink.paper).toMatchObject({ kind: "ink-wash", strength: 0.6, bleedPx1080: 3 });
    expect(ink.grade.accentChannels).toHaveLength(1);
  });
});

describe("presets/art-style-packs: 일관성", () => {
  it("램프 3단 이상만 두 번째 그림자가 있고, 꺼진 그룹(림·톤·종이·내부선)에는 v2 항등 값만 둔다(숨은 값 없음)", () => {
    for (const pack of ART_STYLE_PACKS) {
      expect(pack.look.ramp.secondShade === null, pack.id).toBe(pack.toon.rampSteps === 2);
      if (!pack.toon.rim) expect(pack.look.rim, pack.id).toEqual(LOOK_V2_IDENTITY.rim);
      if (pack.look.tone.kind === "none") expect(pack.look.tone, pack.id).toEqual(LOOK_V2_IDENTITY.tone);
      if (pack.look.paper.kind === "none") expect(pack.look.paper, pack.id).toEqual(LOOK_V2_IDENTITY.paper);
      if (!pack.look.line.inner.enabled) expect(pack.look.line.inner, pack.id).toEqual(LOOK_V2_IDENTITY.line.inner);
      if (pack.look.specular.strength === 0) expect(pack.look.specular, pack.id).toEqual(LOOK_V2_IDENTITY.specular);
    }
  });

  it("모든 팩의 look이 서로 다르고 v2 항등과도 다르다(같은 그림의 팩 없음)", () => {
    const looks = ART_STYLE_PACKS.map((pack) => stableStringify(pack.look));
    expect(new Set(looks).size).toBe(ART_STYLE_PACKS.length);
    for (const pack of ART_STYLE_PACKS) expect(isLookV2Identity(pack.look), pack.id).toBe(false);
  });

  it("비례: 남성 두신이 여성 이상이고 SD만 6.5두신 미만이다", () => {
    for (const pack of ART_STYLE_PACKS) {
      expect(pack.proportion.masculine.headsTall, pack.id).toBeGreaterThanOrEqual(pack.proportion.feminine.headsTall);
      expect(pack.proportion.feminine.headsTall < 6.5, pack.id).toBe(pack.id === "sd-chibi");
    }
  });

  it("팔레트 견본은 소문자 hex이고 피부 견본이 2색 이상이다(밝은 톤만 두지 않는다)", () => {
    for (const pack of ART_STYLE_PACKS) {
      for (const hex of [...pack.palette.skin, ...pack.palette.hair]) expect(hex, pack.id).toMatch(/^#[0-9a-f]{6}$/u);
      expect(pack.palette.skin.length, pack.id).toBeGreaterThanOrEqual(2);
      expect(new Set(pack.palette.skin).size, pack.id).toBe(pack.palette.skin.length);
    }
  });

  it("출처 표: 모든 팩에 있고, 실측 경로는 팩 안의 실제 값을 가리키며 실측이 있는 팩은 로맨스뿐이다", () => {
    for (const id of ART_STYLE_IDS) {
      const provenance = ART_STYLE_PACK_PROVENANCE[id];
      expect(provenance.noteKo).toMatch(/[가-힣]/u);
      for (const path of provenance.measured) expect(valueAt(artStylePack(id), path), `${id}.${path}`).toBeDefined();
      expect(provenance.measured.length > 0, id).toBe(id === "kr-webtoon-romance");
    }
  });
});
