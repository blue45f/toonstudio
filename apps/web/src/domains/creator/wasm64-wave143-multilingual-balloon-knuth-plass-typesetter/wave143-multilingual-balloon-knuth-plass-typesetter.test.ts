import { describe, expect, it } from "vitest";
import {
  ALL_SUPPORTED_TYPESET_LOCALES,
  NBSP,
  auditKinsokuAndWidowViolations,
  canonicalizeTypesetJson,
  compareGreedyVsDiamondTypeset,
  compileMultilingualBalloonBatch,
  computeBalloonChordWidthPx,
  escapeTypesetXml,
  expandOversizedTokens,
  fitDialogueIntoBalloon,
  getLocaleKinsokuRuleSet,
  isLineEndForbiddenChar,
  isLineStartForbiddenChar,
  layoutBalloonGreedyBaseline,
  measureLineWidthPx,
  renderBalloonTypesetAuditSvg,
  resolveBalloonGeometry,
  sha256TypesetUtf8Hex,
  summarizeMultilingualTypesetKo,
  tokenizeDialogueForLocale,
  typesetBalloonDiamondOptimal,
  type BalloonGeometrySpec,
  type MultilingualDialogueEntry,
} from "./index";

const CLASSIC_ELLIPSE: BalloonGeometrySpec = { kind: "ellipse-classic", widthPx: 260, heightPx: 196, safePaddingPx: 16 };
const NARRATION_BOX: BalloonGeometrySpec = { kind: "rounded-rect-narration", widthPx: 280, heightPx: 132, safePaddingPx: 14, cornerRadiusPx: 14 };
const SHOUT_JAGGED: BalloonGeometrySpec = { kind: "shout-jagged-ellipse", widthPx: 290, heightPx: 210, safePaddingPx: 16, spikeDepthRatio: 0.14 };
const CLOUD_THOUGHT: BalloonGeometrySpec = { kind: "cloud-thought", widthPx: 280, heightPx: 204, safePaddingPx: 16, cloudLobeDepthRatio: 0.1 };

function makeFiveLocaleEntries(): readonly MultilingualDialogueEntry[] {
  return [
    {
      balloonId: "B01",
      panelId: "P01",
      speakerKo: "강하늘",
      geometry: CLASSIC_ELLIPSE,
      textsByLocale: {
        "ko-KR": "잠깐만, 여기서 포기하면 지금까지 버텨 온 모든 시간이 한순간에 무너져 버린다!",
        "ja-JP": "「待って！ここで諦めたら、今まで積み上げてきた全てが一瞬で崩れ去ってしまうんだよ…！」",
        "en-US": "Hold on! If we give up right here, everything we fought through will crumble in a second!",
        "fr-FR": "« Attends ! Si on abandonne ici, tout ce qu'on a bâti va s'effondrer : tu le sais bien ? »",
        "es-ES": "¡Espera un segundo! ¿De verdad vas a rendirte ahora después de todo lo que logramos?",
      },
    },
    {
      balloonId: "B02",
      panelId: "P02",
      speakerKo: "윤도현",
      geometry: SHOUT_JAGGED,
      textsByLocale: {
        "ko-KR": "당장 비켜! 문이 닫히기 전에 반드시 건너가야 해!!",
        "ja-JP": "「どけっ！扉が閉まる前に、絶対に渡り切らなきゃならないんだ！！」",
        "en-US": "Move aside right now! We have to cross before the gate locks shut!",
        "fr-FR": "« Écarte-toi ! Il faut traverser avant que la porte ne se referme ! »",
        "es-ES": "¡Apártate ahora mismo! ¡Tenemos que cruzar antes de que se cierre la puerta!",
      },
    },
    {
      balloonId: "B03",
      panelId: "P03",
      speakerKo: "한서아",
      geometry: CLOUD_THOUGHT,
      textsByLocale: {
        "ko-KR": "저 눈빛은 예전과 완전히 달라졌어… 설마 기억이 돌아온 걸까?",
        "ja-JP": "（あの瞳は昔とまるで違う…まさか、記憶が戻ったっていうの？）",
        "en-US": "That look in his eyes is completely different now... could his memories be back?",
        "fr-FR": "Son regard a totalement changé… Est-ce que ses souvenirs seraient revenus ?",
        "es-ES": "Esa mirada cambió por completo… ¿Acaso habrá recuperado la memoria?",
      },
    },
    {
      balloonId: "B04",
      panelId: "P04",
      speakerKo: "해설",
      geometry: NARRATION_BOX,
      textsByLocale: {
        "ko-KR": "그날 밤 열두 시, 오래된 종탑의 시계바늘이 마침내 거꾸로 돌기 시작했다.",
        "ja-JP": "その夜、午前零時。古い鐘楼の時計の針が、ついに逆向きに動き始めた。",
        "en-US": "At midnight, the hands of the old bell tower clock finally began turning backward.",
        "fr-FR": "À minuit, les aiguilles de la vieille tour commencèrent enfin à tourner à l'envers.",
        "es-ES": "A medianoche, las agujas del viejo campanario empezaron al fin a girar al revés.",
      },
    },
  ];
}

describe("Wave 143 — 5개국어 토크나이저·글리프 폭 메트릭·금칙규칙 감사 엔진", () => {
  it("ko-KR: 어절 우선(keep-all)으로 분리하고 단독 문장부호·여는 괄호를 자동 결합해 금칙 위반 0건을 유지한다", () => {
    const tokens = tokenizeDialogueForLocale("「 잠깐만 , 거기 서 ! 」", "ko-KR");
    expect(tokens.map((t) => t.text)).toEqual(["「잠깐만,", "거기", "서!」"]);
    const layout = typesetBalloonDiamondOptimal("「 잠깐만 , 여기서 끝내면 정말 후회할 거야 ! 」", "ko-KR", CLASSIC_ELLIPSE, { fontSizePx: 16 });
    expect(layout.audit.lineStartKinsokuCount).toBe(0);
    expect(layout.audit.lineEndKinsokuCount).toBe(0);
  });

  it("ko-KR: 말풍선 폭을 초과하는 장문 어절은 음절 분할 fallback으로 넘침을 방지하되 문장부호 금칙을 지킨다", () => {
    const baseTokens = tokenizeDialogueForLocale("「초고속자동식자컴파일러엔진입니다！」", "ko-KR");
    const expanded = expandOversizedTokens(baseTokens, 90, 16, "ko-KR", 0, true, true);
    expect(expanded.length).toBeGreaterThan(2);
    expect(expanded[0]?.text.startsWith("「초")).toBe(true);
    expect(expanded[expanded.length - 1]?.text.endsWith("다！」")).toBe(true);
    for (let i = 0; i < expanded.length; i += 1) {
      const tok = expanded[i];
      if (!tok) continue;
      expect(isLineStartForbiddenChar(tok.text.charAt(0), "ko-KR")).toBe(false);
      expect(isLineEndForbiddenChar(tok.text.charAt(tok.text.length - 1), "ko-KR")).toBe(false);
    }
  });

  it("ja-JP: JIS X 4051 행두금칙(、。！？）」』…ーっ)과 행말금칙(（「『)을 위반 0건으로 엄수한다", () => {
    const jpText = "「待って！そこにいるのは、本当にお姉ちゃんなの…？『嘘だ』って言ってよー！」";
    const tokens = tokenizeDialogueForLocale(jpText, "ja-JP");
    expect(tokens.some((t) => t.text.startsWith("「待"))).toBe(true);
    expect(tokens.some((t) => t.text.includes("っ"))).toBe(true);
    expect(tokens.some((t) => t.text.includes("よー！」"))).toBe(true);

    const layout = typesetBalloonDiamondOptimal(jpText, "ja-JP", CLASSIC_ELLIPSE, { fontSizePx: 15 });
    expect(layout.audit.lineStartKinsokuCount).toBe(0);
    expect(layout.audit.lineEndKinsokuCount).toBe(0);
    for (let i = 0; i < layout.lines.length; i += 1) {
      const line = layout.lines[i];
      if (!line) continue;
      expect(isLineStartForbiddenChar(line.text.charAt(0), "ja-JP")).toBe(false);
      expect(isLineEndForbiddenChar(line.text.charAt(line.text.length - 1), "ja-JP")).toBe(false);
    }
  });

  it("ja-JP: 일본어 문장 안의 연속 영숫자·약어(AI, 100%)를 글자 단위로 쪼개지 않고 보존한다", () => {
    const tokens = tokenizeDialogueForLocale("このAIシステムは100%決定論だ。", "ja-JP");
    expect(tokens.some((t) => t.text === "AI")).toBe(true);
    expect(tokens.some((t) => t.text.startsWith("100"))).toBe(true);
  });

  it("en-US: 일반 단어 경계를 유지하고 극단적 장문 단어는 하이픈(-)으로 안전 분할한다", () => {
    const narrowBalloon: BalloonGeometrySpec = { kind: "ellipse-classic", widthPx: 146, heightPx: 170, safePaddingPx: 14 };
    const layout = typesetBalloonDiamondOptimal(
      "That was a counterrevolutionary breakthrough!",
      "en-US",
      narrowBalloon,
      { fontSizePx: 16, allowWordHyphenation: true },
    );
    expect(layout.audit.lineStartKinsokuCount).toBe(0);
    expect(layout.audit.lineEndKinsokuCount).toBe(0);
    expect(layout.lines.some((line) => line.text.includes("-"))).toBe(true);
    expect(layout.audit.horizontalOverflowCount).toBe(0);
  });

  it("fr-FR: 길메(« »)와 고부호(: ; ! ?) 앞뒤에 비분리 공백을 결합해 단독 줄바꿈 0건을 보장한다", () => {
    const frText = "« Attends une seconde ! Pourquoi tu ne dis rien : c'est grave ; vraiment ? »";
    const tokens = tokenizeDialogueForLocale(frText, "fr-FR");
    expect(tokens[0]?.text).toBe(`«${NBSP}Attends`);
    expect(tokens.some((t) => t.text === `seconde${NBSP}!`)).toBe(true);
    expect(tokens.some((t) => t.text === `rien${NBSP}:`)).toBe(true);
    expect(tokens.some((t) => t.text === `grave${NBSP};`)).toBe(true);
    expect(tokens.some((t) => t.text === `vraiment${NBSP}?${NBSP}»`)).toBe(true);

    const layout = typesetBalloonDiamondOptimal(frText, "fr-FR", CLASSIC_ELLIPSE, { fontSizePx: 14 });
    expect(layout.audit.lineStartKinsokuCount).toBe(0);
    expect(layout.audit.lineEndKinsokuCount).toBe(0);
    for (let i = 0; i < layout.lines.length; i += 1) {
      const text = layout.lines[i]?.text ?? "";
      expect(text.endsWith("«")).toBe(false);
      expect(/^[»!?:;]/.test(text)).toBe(false);
    }
  });

  it("es-ES: 여는 감탄·의문부호(¡ ¿)가 입력 공백과 무관하게 다음 단어에 결합돼 행말 고립 0건을 보장한다", () => {
    const esText = "¡ Detente ahora mismo ! ¿ Acaso no escuchas lo que te digo ?";
    const tokens = tokenizeDialogueForLocale(esText, "es-ES");
    expect(tokens[0]?.text).toBe("¡Detente");
    expect(tokens.some((t) => t.text === "¿Acaso")).toBe(true);

    const layout = typesetBalloonDiamondOptimal(esText, "es-ES", CLASSIC_ELLIPSE, { fontSizePx: 15 });
    expect(layout.audit.lineEndKinsokuCount).toBe(0);
    expect(layout.audit.lineStartKinsokuCount).toBe(0);
    for (let i = 0; i < layout.lines.length; i += 1) {
      const text = layout.lines[i]?.text ?? "";
      expect(text.endsWith("¡")).toBe(false);
      expect(text.endsWith("¿")).toBe(false);
    }
  });

  it("measureLineWidthPx: 전각 CJK > 넓은 라틴(m/w) > 표준 라틴 > 좁은 라틴(i/l/t) 순서와 폰트 비례성을 만족한다", () => {
    const hangulW = measureLineWidthPx("가나다라", 20, "ko-KR");
    const kanaW = measureLineWidthPx("あいうえ", 20, "ja-JP");
    const wideLatinW = measureLineWidthPx("mwmw", 20, "en-US");
    const stdLatinW = measureLineWidthPx("abcd", 20, "en-US");
    const narrowLatinW = measureLineWidthPx("ilit", 20, "en-US");
    expect(hangulW).toBeCloseTo(80, 2);
    expect(hangulW).toBeGreaterThan(wideLatinW);
    expect(kanaW).toBeGreaterThan(wideLatinW);
    expect(wideLatinW).toBeGreaterThan(stdLatinW);
    expect(stdLatinW).toBeGreaterThan(narrowLatinW);
    expect(measureLineWidthPx("가나다라", 40, "ko-KR")).toBeCloseTo(hangulW * 2, 2);
  });

  it("measureLineWidthPx: 자간(letterSpacingEm)과 비유한(NaN) 입력을 결정론적으로 처리한다", () => {
    const base = measureLineWidthPx("HELLO", 20, "en-US", 0);
    const wide = measureLineWidthPx("HELLO", 20, "en-US", 0.1);
    const tight = measureLineWidthPx("HELLO", 20, "en-US", -0.05);
    expect(wide).toBeCloseTo(base + 4 * 0.1 * 20, 2);
    expect(tight).toBeLessThan(base);
    expect(Number.isFinite(measureLineWidthPx("테스트", Number.NaN, "ko-KR", Number.POSITIVE_INFINITY))).toBe(true);
  });

  it("auditKinsokuAndWidowViolations: 5개국어 행두·행말 금칙, 불어 NBSP 분리, 스페인어 여는 부호 고립을 정확히 탐지한다", () => {
    const jaAudit = auditKinsokuAndWidowViolations(
      [
        { lineIndex: 0, text: "待って「", widthPx: 80, availableChordWidthPx: 140 },
        { lineIndex: 1, text: "。すごい", widthPx: 80, availableChordWidthPx: 140 },
      ],
      "ja-JP",
    );
    expect(jaAudit.lineEndKinsokuCount).toBe(1);
    expect(jaAudit.lineStartKinsokuCount).toBe(1);

    const frAudit = auditKinsokuAndWidowViolations(
      [
        { lineIndex: 0, text: "Il dit «", widthPx: 80, availableChordWidthPx: 140 },
        { lineIndex: 1, text: "? vraiment", widthPx: 80, availableChordWidthPx: 140 },
      ],
      "fr-FR",
    );
    expect(frAudit.violations.filter((v) => v.kind === "french-nbsp-split").length).toBe(2);

    const esAudit = auditKinsokuAndWidowViolations(
      [
        { lineIndex: 0, text: "Mira ¿", widthPx: 80, availableChordWidthPx: 140 },
        { lineIndex: 1, text: "qué pasa?", widthPx: 80, availableChordWidthPx: 140 },
      ],
      "es-ES",
    );
    expect(esAudit.violations.some((v) => v.kind === "spanish-opener-split")).toBe(true);
    expect(getLocaleKinsokuRuleSet("es-ES").protectsInvertedSpanishOpeners).toBe(true);
  });

  it("auditKinsokuAndWidowViolations: 수평·수직 오버플로우와 초과 픽셀(maxOverflowPx)을 정확히 계산한다", () => {
    const audit = auditKinsokuAndWidowViolations(
      [
        { lineIndex: 0, text: "첫 번째 줄", widthPx: 145, availableChordWidthPx: 120 },
        { lineIndex: 1, text: "두 번째 줄", widthPx: 110, availableChordWidthPx: 150 },
        { lineIndex: 2, text: "세 번째 줄", widthPx: 132, availableChordWidthPx: 120 },
      ],
      "ko-KR",
      50,
      24,
    );
    expect(audit.horizontalOverflowCount).toBe(2);
    expect(audit.verticalOverflowCount).toBe(1);
    expect(audit.overflowLineCount).toBe(3);
    expect(audit.maxOverflowPx).toBe(25);
    expect(audit.isClean).toBe(false);
  });

  it("auditKinsokuAndWidowViolations: 1글자 CJK 고아행·라틴 1단어 고아행을 탐지하고 정상 마름모 막줄은 통과시킨다", () => {
    const koWidow = auditKinsokuAndWidowViolations(
      [
        { lineIndex: 0, text: "지금 당장 출발해야 한", widthPx: 160, availableChordWidthPx: 180 },
        { lineIndex: 1, text: "다!", widthPx: 22, availableChordWidthPx: 180 },
      ],
      "ko-KR",
    );
    expect(koWidow.widowCount).toBe(1);

    const enWidow = auditKinsokuAndWidowViolations(
      [
        { lineIndex: 0, text: "We cannot possibly let them escape from", widthPx: 210, availableChordWidthPx: 220 },
        { lineIndex: 1, text: "us.", widthPx: 20, availableChordWidthPx: 220 },
      ],
      "en-US",
    );
    expect(enWidow.widowCount).toBe(1);

    const cleanDiamond = auditKinsokuAndWidowViolations(
      [
        { lineIndex: 0, text: "잠깐만, 여기서", widthPx: 115, availableChordWidthPx: 170 },
        { lineIndex: 1, text: "포기하면 전부 끝이야", widthPx: 165, availableChordWidthPx: 210 },
        { lineIndex: 2, text: "버텨야 한다!", widthPx: 105, availableChordWidthPx: 170 },
      ],
      "ko-KR",
    );
    expect(cleanDiamond.widowCount).toBe(0);
    expect(cleanDiamond.isClean).toBe(true);
  });
});

describe("Wave 143 — 말풍선 4종 기하 현 너비(Chord Width) 정확도", () => {
  it("ellipse-classic: w(y) = 2 * rx * sqrt(1 - (y/ry)^2) 공식을 상하 대칭으로 정확히 계산한다", () => {
    const geom = resolveBalloonGeometry({ kind: "ellipse-classic", widthPx: 240, heightPx: 160, safePaddingPx: 20 });
    expect(geom.effectiveRx).toBe(100);
    expect(geom.effectiveRy).toBe(60);
    expect(computeBalloonChordWidthPx(geom, 0)).toBeCloseTo(200, 2);
    const expectedHalf = 2 * 100 * Math.sqrt(1 - 0.25);
    expect(computeBalloonChordWidthPx(geom, 30)).toBeCloseTo(expectedHalf, 1);
    expect(computeBalloonChordWidthPx(geom, -30)).toBeCloseTo(expectedHalf, 1);
    expect(computeBalloonChordWidthPx(geom, 60)).toBe(0);
    expect(computeBalloonChordWidthPx(geom, 75)).toBe(0);
  });

  it("rounded-rect-narration: 직선 구간에서 일정 최대 폭을 유지하고 모서리 구간에서 원호 곡률만큼 감소한다", () => {
    const geom = resolveBalloonGeometry(NARRATION_BOX);
    const centerW = computeBalloonChordWidthPx(geom, 0);
    const midStraightW = computeBalloonChordWidthPx(geom, geom.effectiveRy - geom.cornerRadiusPx - 2);
    const cornerW = computeBalloonChordWidthPx(geom, geom.effectiveRy - 3);
    expect(centerW).toBeCloseTo(geom.effectiveRx * 2, 2);
    expect(midStraightW).toBeCloseTo(centerW, 2);
    expect(cornerW).toBeLessThan(centerW);
    expect(cornerW).toBeGreaterThan(0);
  });

  it("shout-jagged-ellipse: 톱니 골짜기 깊이(spikeDepthRatio)만큼 동일 외곽 타원보다 엄격히 좁은 안전 현을 반환한다", () => {
    const plain = resolveBalloonGeometry({ kind: "ellipse-classic", widthPx: 280, heightPx: 200, safePaddingPx: 16 });
    const jagged = resolveBalloonGeometry({ kind: "shout-jagged-ellipse", widthPx: 280, heightPx: 200, safePaddingPx: 16, spikeDepthRatio: 0.15 });
    expect(computeBalloonChordWidthPx(jagged, 0)).toBeCloseTo(computeBalloonChordWidthPx(plain, 0) * 0.85, 1);
    expect(computeBalloonChordWidthPx(jagged, 30)).toBeLessThan(computeBalloonChordWidthPx(plain, 30));
  });

  it("cloud-thought: 구름 로브 깊이(cloudLobeDepthRatio)만큼 동일 외곽 타원보다 엄격히 좁은 안전 현을 반환한다", () => {
    const plain = resolveBalloonGeometry({ kind: "ellipse-classic", widthPx: 280, heightPx: 200, safePaddingPx: 16 });
    const cloud = resolveBalloonGeometry({ kind: "cloud-thought", widthPx: 280, heightPx: 200, safePaddingPx: 16, cloudLobeDepthRatio: 0.12 });
    expect(computeBalloonChordWidthPx(cloud, 0)).toBeCloseTo(computeBalloonChordWidthPx(plain, 0) * 0.88, 1);
    expect(computeBalloonChordWidthPx(cloud, 25)).toBeLessThan(computeBalloonChordWidthPx(plain, 25));
  });

  it("resolveBalloonGeometry: NaN·Infinity·음수 기하 입력을 안전한 유한 범위로 클램핑한다", () => {
    const geom = resolveBalloonGeometry({ kind: "ellipse-classic", widthPx: Number.NaN, heightPx: Number.POSITIVE_INFINITY, safePaddingPx: -20 });
    expect(Number.isFinite(geom.widthPx)).toBe(true);
    expect(Number.isFinite(geom.heightPx)).toBe(true);
    expect(geom.effectiveRx).toBeGreaterThan(0);
    expect(geom.effectiveRy).toBeGreaterThan(0);
  });

  it("레이아웃 각 행의 availableChordWidthPx는 computeBalloonChordWidthPx(geometry, yOffsetPx)와 정확히 일치한다", () => {
    const layout = typesetBalloonDiamondOptimal("오늘 밤 작전은 실패할 수 없으니 끝까지 집중해야 한다!", "ko-KR", CLASSIC_ELLIPSE, { fontSizePx: 16 });
    expect(layout.lines.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < layout.lines.length; i += 1) {
      const line = layout.lines[i];
      if (line) expect(line.availableChordWidthPx).toBeCloseTo(computeBalloonChordWidthPx(layout.geometry, line.yOffsetPx), 2);
    }
  });
});

describe("Wave 143 — 탐욕적 줄바꿈 vs 마름모꼴 Knuth-Plass DP 비교 우위", () => {
  it("한국어 타원 말풍선: 마름모 DP가 탐욕적 기준선 대비 마름모 적합도·대칭성에서 우위이고 고아행·오버플로우가 0건이다", () => {
    const text = "잠깐만, 여기서 포기하면 지금까지 버텨 온 모든 시간이 한순간에 무너져 버린다!";
    const cmp = compareGreedyVsDiamondTypeset(text, "ko-KR", CLASSIC_ELLIPSE, { fontSizePx: 16 });
    expect(cmp.diamond.audit.overflowLineCount).toBe(0);
    expect(cmp.diamond.audit.widowCount).toBe(0);
    expect(cmp.diamond.diamondFitScore).toBeGreaterThan(cmp.greedy.diamondFitScore);
    expect(cmp.diamond.symmetryScore).toBeGreaterThan(cmp.greedy.symmetryScore);
    expect(cmp.diamondFitScoreGain).toBeGreaterThan(0);
  });

  it("일본어 타원 말풍선: 탐욕 기준선에서 깨지는 행두·행말 금칙을 마름모 DP가 0건으로 교정한다", () => {
    const text = "「待って！ここで諦めたら、今まで積み上げてきた全てが一瞬で崩れ去ってしまうんだよ…！」";
    const cmp = compareGreedyVsDiamondTypeset(text, "ja-JP", CLASSIC_ELLIPSE, { fontSizePx: 16 });
    expect(cmp.diamond.audit.lineStartKinsokuCount).toBe(0);
    expect(cmp.diamond.audit.lineEndKinsokuCount).toBe(0);
    expect(cmp.diamond.audit.overflowLineCount).toBe(0);
    expect(cmp.diamond.diamondFitScore).toBeGreaterThan(cmp.greedy.diamondFitScore);
  });

  it("영어 타원 말풍선: 탐욕적 줄바꿈의 쏠림·고아 막줄을 해소하고 중앙이 가장 넓은 마름모 실루엣을 만든다", () => {
    const text = "Hold on! If we give up right here, everything we fought through will crumble fast!";
    const cmp = compareGreedyVsDiamondTypeset(text, "en-US", CLASSIC_ELLIPSE, { fontSizePx: 15 });
    expect(cmp.diamond.audit.overflowLineCount).toBe(0);
    expect(cmp.diamond.audit.widowCount).toBe(0);
    expect(cmp.diamond.diamondFitScore).toBeGreaterThan(cmp.greedy.diamondFitScore);
    if (cmp.diamond.lines.length >= 3) {
      const midW = cmp.diamond.lines[Math.floor(cmp.diamond.lines.length / 2)]?.widthPx ?? 0;
      const topW = cmp.diamond.lines[0]?.widthPx ?? 0;
      const botW = cmp.diamond.lines[cmp.diamond.lines.length - 1]?.widthPx ?? 0;
      expect(midW).toBeGreaterThanOrEqual(Math.min(topW, botW));
    }
  });

  it("프랑스어 타원 말풍선: 길메·고부호 비분리 보호와 함께 탐욕 기준 대비 적합도를 개선한다", () => {
    const text = "« Attends ! Si on abandonne ici, tout ce qu'on a bâti va s'effondrer : tu le sais ? »";
    const cmp = compareGreedyVsDiamondTypeset(text, "fr-FR", CLASSIC_ELLIPSE, { fontSizePx: 14 });
    expect(cmp.diamond.audit.lineStartKinsokuCount).toBe(0);
    expect(cmp.diamond.audit.lineEndKinsokuCount).toBe(0);
    expect(cmp.diamond.audit.overflowLineCount).toBe(0);
    expect(cmp.diamond.diamondFitScore).toBeGreaterThanOrEqual(cmp.greedy.diamondFitScore);
  });

  it("스페인어 톱니 외침 말풍선: ¡·¿ 행말 고립 0건과 톱니 내부 오버플로우 0건을 달성하며 탐욕 대비 우위다", () => {
    const text = "¡Apártate ahora mismo! ¡Tenemos que cruzar antes de que se cierre la puerta de hierro!";
    const cmp = compareGreedyVsDiamondTypeset(text, "es-ES", SHOUT_JAGGED, { fontSizePx: 16 });
    expect(cmp.diamond.audit.lineEndKinsokuCount).toBe(0);
    expect(cmp.diamond.audit.overflowLineCount).toBe(0);
    expect(cmp.diamond.diamondFitScore).toBeGreaterThan(cmp.greedy.diamondFitScore);
  });

  it("rounded-rect-narration: 사각 내레이션 박스에서도 균등한 줄 길이로 탐욕 기준선 이상의 적합도를 달성한다", () => {
    const text = "그날 밤 열두 시, 오래된 종탑의 시계바늘이 마침내 거꾸로 돌기 시작했다.";
    const cmp = compareGreedyVsDiamondTypeset(text, "ko-KR", NARRATION_BOX, { fontSizePx: 16 });
    expect(cmp.diamond.audit.isClean).toBe(true);
    expect(cmp.diamond.diamondFitScore).toBeGreaterThanOrEqual(cmp.greedy.diamondFitScore);
  });

  it("명시적 줄바꿈(\\n)이 들어간 대사는 강제 개행 경계를 보존한다", () => {
    const layout = typesetBalloonDiamondOptimal("거기 멈춰!\n더 이상 다가오지 마!", "ko-KR", CLASSIC_ELLIPSE, { fontSizePx: 16 });
    expect(layout.lines.length).toBeGreaterThanOrEqual(2);
    expect(layout.lines[0]?.text).toBe("거기 멈춰!");
    expect(layout.audit.isClean).toBe(true);
  });

  it("빈 대사와 단문 1줄 대사를 예외 없이 clean 상태로 처리한다", () => {
    const emptyDiamond = typesetBalloonDiamondOptimal("   ", "ko-KR", CLASSIC_ELLIPSE);
    const emptyGreedy = layoutBalloonGreedyBaseline("", "en-US", CLASSIC_ELLIPSE);
    const shortLine = typesetBalloonDiamondOptimal("알겠어!", "ko-KR", CLASSIC_ELLIPSE, { fontSizePx: 18 });
    expect(emptyDiamond.lines.length).toBe(0);
    expect(emptyDiamond.audit.isClean).toBe(true);
    expect(emptyGreedy.lines.length).toBe(0);
    expect(shortLine.lines.length).toBe(1);
    expect(shortLine.audit.isClean).toBe(true);
  });
});

describe("Wave 143 — 자동 폰트·행간 피팅 및 말풍선 확대 배율 산출", () => {
  it("여유 있는 대사는 기준 폰트를 유지하며 optimal-fit · 오버플로우 0건 · 권장 확대 1.0배를 반환한다", () => {
    const fit = fitDialogueIntoBalloon("지금 바로 출발하자!", "ko-KR", CLASSIC_ELLIPSE, {
      minFontSizePx: 11,
      maxFontSizePx: 22,
      preferredFontSizePx: 18,
    });
    expect(fit.status).toBe("optimal-fit");
    expect(fit.layout.audit.overflowLineCount).toBe(0);
    expect(fit.layout.audit.isClean).toBe(true);
    expect(fit.recommendedBalloonScale).toBe(1);
    expect(fit.layout.fontSizePx).toBe(18);
  });

  it("기준 폰트로 넘치는 장문 대사는 자동 폰트 축소(fitted-with-shrink)로 오버플로우 0건을 달성한다", () => {
    const longDialogue =
      "지금 이 자리에서 물러서면 우리가 석 달 동안 목숨 걸고 지켜 낸 마지막 방어선이 오늘 밤 안으로 완전히 무너지고 만다!";
    const fit = fitDialogueIntoBalloon(longDialogue, "ko-KR", CLASSIC_ELLIPSE, {
      minFontSizePx: 10,
      maxFontSizePx: 22,
      preferredFontSizePx: 20,
      fontStepPx: 0.5,
    });
    expect(fit.status).toBe("fitted-with-shrink");
    expect(fit.layout.fontSizePx).toBeLessThan(20);
    expect(fit.layout.fontSizePx).toBeGreaterThanOrEqual(10);
    expect(fit.layout.audit.overflowLineCount).toBe(0);
    expect(fit.recommendedBalloonScale).toBe(1);
  });

  it("극단적 장문 대사가 최소 폰트에서도 넘치면 balloon-expansion-required와 1.0 초과 확대 배율을 보고한다", () => {
    const tinyBalloon: BalloonGeometrySpec = { kind: "ellipse-classic", widthPx: 150, heightPx: 110, safePaddingPx: 14 };
    const extremeText =
      "We need to evacuate every single district before sunrise because the northern floodgate pressure has already crossed the emergency limit and the backup turbines failed completely!";
    const fit = fitDialogueIntoBalloon(extremeText, "en-US", tinyBalloon, { minFontSizePx: 12, maxFontSizePx: 20, preferredFontSizePx: 18 });
    expect(fit.status).toBe("balloon-expansion-required");
    expect(fit.layout.audit.overflowLineCount).toBeGreaterThan(0);
    expect(fit.recommendedBalloonScale).toBeGreaterThan(1.05);
    expect(fit.diagnosticsKo).toContain("확대 필요");
  });

  it("확대 배율 역검증: 산출된 recommendedBalloonScale을 말풍선 크기에 적용하면 오버플로우 0건으로 피팅된다", () => {
    const tinyBalloon: BalloonGeometrySpec = { kind: "shout-jagged-ellipse", widthPx: 165, heightPx: 120, safePaddingPx: 14, spikeDepthRatio: 0.14 };
    const longKo = "지금 당장 옥상 비상구로 전원 대피하라! 3분 뒤에 지하 발전실 격벽이 완전히 봉쇄되니 아무도 남지 말고 전부 이동해!";
    const initialFit = fitDialogueIntoBalloon(longKo, "ko-KR", tinyBalloon, { minFontSizePx: 12, maxFontSizePx: 18, preferredFontSizePx: 16 });
    expect(initialFit.status).toBe("balloon-expansion-required");

    const refit = fitDialogueIntoBalloon(
      longKo,
      "ko-KR",
      { ...tinyBalloon, widthPx: tinyBalloon.widthPx * initialFit.recommendedBalloonScale, heightPx: tinyBalloon.heightPx * initialFit.recommendedBalloonScale },
      { minFontSizePx: 12, maxFontSizePx: 18, preferredFontSizePx: 16 },
    );
    expect(refit.status).not.toBe("balloon-expansion-required");
    expect(refit.layout.audit.overflowLineCount).toBe(0);
  });
});

describe("Wave 143 — 5개국어 일괄 배치 컴파일 · SHA-256 결정론 · 순수 OKLCH SVG · QA 브리프", () => {
  it("5개국어 × 4종 말풍선 일괄 배치 컴파일에서 모든 언어 집계와 0-오버플로우를 검증한다", () => {
    const batch = compileMultilingualBalloonBatch("제24화 종탑의 역행", makeFiveLocaleEntries(), { minFontSizePx: 10, maxFontSizePx: 20, preferredFontSizePx: 16 });
    expect(batch.totalBalloonVariants).toBe(20);
    expect(batch.localeSummaries.map((s) => s.locale)).toEqual(ALL_SUPPORTED_TYPESET_LOCALES);
    expect(batch.totalOverflowCount).toBe(0);
    expect(batch.totalKinsokuViolationCount).toBe(0);
    expect(batch.expansionRequiredCount).toBe(0);
    expect(batch.averageDiamondFitScore).toBeGreaterThan(batch.averageGreedyDiamondFitScore);
    expect(batch.typesetManifestSha256Hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("표준 FIPS 180-4 SHA-256 테스트 벡터('', 'abc') 및 정규 JSON 키 순서 무관성을 검증한다", () => {
    expect(sha256TypesetUtf8Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256TypesetUtf8Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(canonicalizeTypesetJson({ b: 2, a: 1 })).toBe(canonicalizeTypesetJson({ a: 1, b: 2 }));
  });

  it("입력 객체의 키 순서가 달라도 동일한 64자리 typesetManifestSha256Hex를 반환한다", () => {
    const batchA = compileMultilingualBalloonBatch("제24화", [
      {
        balloonId: "B1",
        panelId: "P1",
        speakerKo: "하늘",
        geometry: { kind: "ellipse-classic", widthPx: 260, heightPx: 190, safePaddingPx: 16 },
        textsByLocale: { "ko-KR": "지금 바로 출발하자!", "en-US": "Let us head out right now!" },
      },
    ]);
    const batchB = compileMultilingualBalloonBatch("제24화", [
      {
        textsByLocale: { "en-US": "Let us head out right now!", "ko-KR": "지금 바로 출발하자!" },
        geometry: { safePaddingPx: 16, heightPx: 190, widthPx: 260, kind: "ellipse-classic" },
        speakerKo: "하늘",
        panelId: "P1",
        balloonId: "B1",
      },
    ]);
    expect(batchA.typesetManifestSha256Hex).toBe(batchB.typesetManifestSha256Hex);
  });

  it("대사 한 글자가 바뀌면 매니페스트 SHA-256 지문이 즉시 달라진다", () => {
    const entries = makeFiveLocaleEntries();
    const base = compileMultilingualBalloonBatch("제24화", entries);
    const mutated = compileMultilingualBalloonBatch(
      "제24화",
      entries.map((entry) =>
        entry.balloonId === "B01"
          ? { ...entry, textsByLocale: { ...entry.textsByLocale, "ko-KR": `${entry.textsByLocale["ko-KR"] ?? ""}!` } }
          : entry,
      ),
    );
    expect(base.typesetManifestSha256Hex).not.toBe(mutated.typesetManifestSha256Hex);
  });

  it("renderBalloonTypesetAuditSvg: 4종 말풍선 윤곽선·현 가이드·5개국어 배지를 순수 oklch(...)로 렌더링하고 원시 색·NaN이 0건이다", () => {
    const batch = compileMultilingualBalloonBatch("제24화 종탑의 역행", makeFiveLocaleEntries(), { minFontSizePx: 10, maxFontSizePx: 20, preferredFontSizePx: 16 });
    const svg = renderBalloonTypesetAuditSvg(batch, { maxPreviewPairs: 4, focusLocale: "ko-KR" });

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).toContain("<ellipse ");
    expect(svg).toContain("<polygon ");
    expect(svg).toContain("<path ");
    expect(svg).toContain("<rect ");
    expect(svg).toContain("좌측 · 탐욕적 기준 식자");
    expect(svg).toContain("우측 · 마름모 Knuth-Plass DP");
    expect(svg).toContain("KO · 한국어");
    expect(svg).toContain("JA · 일본어");
    expect(svg).toContain("EN · 영어");
    expect(svg).toContain("FR · 프랑스어");
    expect(svg).toContain("ES · 스페인어");
    expect(svg).toContain("오버플로우 0건 통과");

    const rawHexPattern = new RegExp("#[0-9a-f]{3,8}\\b", "i");
    const rawFnPattern = new RegExp("\\b(?:rgba?|hsla?)\\(", "i");
    expect(rawHexPattern.test(svg)).toBe(false);
    expect(rawFnPattern.test(svg)).toBe(false);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("XML 특수문자(<, >, &, \", ')와 XSS 페이로드를 SVG에서 완전히 이스케이프한다", () => {
    const xss = `<script>alert("x&y'z")</script>`;
    expect(escapeTypesetXml(xss)).toBe("&lt;script&gt;alert(&quot;x&amp;y&apos;z&quot;)&lt;/script&gt;");

    const batch = compileMultilingualBalloonBatch(`회차 ${xss}`, [
      { balloonId: "B<1>", panelId: 'P"1"', speakerKo: "화자'A&B'", geometry: CLASSIC_ELLIPSE, textsByLocale: { "ko-KR": `위험 ${xss} 대사!` } },
    ]);
    const svg = renderBalloonTypesetAuditSvg(batch, { titleKo: `검수 ${xss}` });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&apos;");
  });

  it("summarizeMultilingualTypesetKo: 번역투 없는 한국어 QA 브리프와 확대 필요 경고를 정확히 출력한다", () => {
    const cleanBatch = compileMultilingualBalloonBatch("제24화 종탑의 역행", makeFiveLocaleEntries(), { minFontSizePx: 10, maxFontSizePx: 20, preferredFontSizePx: 16 });
    const cleanReport = summarizeMultilingualTypesetKo(cleanBatch);
    expect(cleanReport).toContain("[역식 말풍선 식자 검수 브리프]");
    expect(cleanReport).toContain("오버플로우 0건");
    expect(cleanReport).toContain("한국어(ko-KR)");
    expect(cleanReport).toContain("스페인어(es-ES)");
    expect(cleanReport).toContain(cleanBatch.typesetManifestSha256Hex);

    const banned = ["가능하게 합니다", "직관적인 경험을 제공합니다", "원활한 워크플로우", "보장하는 것을 목표로 합니다"];
    for (let i = 0; i < banned.length; i += 1) {
      const phrase = banned[i];
      if (phrase) expect(cleanReport).not.toContain(phrase);
    }

    const overflowBatch = compileMultilingualBalloonBatch("제25화 긴급 확대", [
      {
        balloonId: "B99",
        panelId: "P09",
        speakerKo: "지휘관",
        geometry: { kind: "ellipse-classic", widthPx: 140, heightPx: 96, safePaddingPx: 14 },
        textsByLocale: { "ko-KR": "지금 즉시 전 대원은 지하 대피소로 이동하고 예비 전력선과 통신 중계기를 전부 차단해 주길 바란다!" },
        fitOptions: { minFontSizePx: 13, maxFontSizePx: 18, preferredFontSizePx: 16 },
      },
    ]);
    const overflowReport = summarizeMultilingualTypesetKo(overflowBatch);
    expect(overflowReport).toContain("말풍선 확대 조치 목록");
    expect(overflowReport).toContain("배 이상 확대 권장");
  });

  it("비유한(NaN/Infinity) 옵션 폴백 및 입력 객체 불변성(mutation 0건)을 보장한다", () => {
    const entries = makeFiveLocaleEntries().map((entry) => ({
      ...entry,
      geometry: { ...entry.geometry },
      textsByLocale: { ...entry.textsByLocale },
    }));
    const beforeSnapshot = JSON.stringify(entries);

    const batch = compileMultilingualBalloonBatch("제24화", entries, {
      minFontSizePx: Number.NaN,
      maxFontSizePx: Number.POSITIVE_INFINITY,
      preferredFontSizePx: Number.NaN,
      fontStepPx: -2,
      letterSpacingEm: Number.NaN,
    });
    const svg = renderBalloonTypesetAuditSvg(batch, { widthPx: Number.NaN, maxPreviewPairs: Number.POSITIVE_INFINITY });

    expect(JSON.stringify(entries)).toBe(beforeSnapshot);
    expect(Number.isFinite(batch.averageDiamondFitScore)).toBe(true);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });
});
