/**
 * 한국어 웹툰 대본·웹소설 -> 세로 스크롤 멀티컷 콘티 자동 파서 엔진.
 *
 * - `"대사"`, `(지문)`, `[장면 전환]`, `SFX: 콰광!`, `속마음: ...` 및 웹소설 혼합 문단을 결정론적으로 분류한다.
 * - 컷 비율 · 드라마틱 여백 거터(px) · 추천 샷 크기(ECU/CU/MS/WS/Bird's-eye) ·
 *   말풍선 좌표 및 Z 시선 순서 · 예상 독자 스크롤 시간(초) · 텍스트 과밀 경고를 즉시 산출한다.
 */

export type ScriptTokenKind = "dialogue" | "stage-direction" | "scene-transition" | "sfx" | "inner-thought";
export type ContiShotSize = "ECU" | "CU" | "MS" | "WS" | "Bird's-eye";
export type ContiBalloonStyle = "speech" | "shout" | "thought" | "narration";
export type SfxIntensity = "subtle" | "medium" | "impact";

export interface ParsedScriptToken {
  readonly index: number;
  readonly kind: ScriptTokenKind;
  readonly rawLine: string;
  readonly text: string;
  readonly speaker: string | null;
  readonly deliveryCue: string | null;
  readonly sfxIntensity?: SfxIntensity;
  readonly isShout?: boolean;
}

export interface ContiBalloonPlacement {
  readonly id: string;
  readonly zOrder: number;
  readonly style: ContiBalloonStyle;
  readonly speaker: string | null;
  readonly text: string;
  readonly xPct: number;
  readonly yPct: number;
  readonly widthPct: number;
  readonly heightPct: number;
  readonly charCount: number;
  readonly estimatedMobileLines: number;
  readonly isOvercrowded: boolean;
  readonly suggestedSplits: readonly string[];
}

export interface ContiOvercrowdingWarning {
  readonly cutNumber: number;
  readonly balloonId: string | null;
  readonly kind: "balloon-overcrowded" | "cut-overcrowded";
  readonly severity: "warn" | "high";
  readonly charCount: number;
  readonly messageKo: string;
  readonly suggestionKo: string;
  readonly suggestedSplits: readonly string[];
}

export interface ContiCutSpec {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly sceneIndex: number;
  readonly sceneTitle: string;
  readonly isSceneOpening: boolean;
  readonly shotSize: ContiShotSize;
  readonly shotLabelKo: string;
  readonly shotReasonKo: string;
  readonly aspectRatioLabel: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly gutterAfterPx: number;
  readonly gutterMoodKo: string;
  readonly stageDirections: readonly string[];
  readonly sfxList: readonly { readonly text: string; readonly intensity: SfxIntensity }[];
  readonly balloons: readonly ContiBalloonPlacement[];
  readonly totalCharCount: number;
  readonly estimatedScrollSec: number;
  readonly hasOvercrowding: boolean;
}

export interface ScriptToContiOptions {
  readonly canvasWidthPx?: number;
  readonly maxBalloonsPerCut?: number;
  readonly balloonOvercrowdedChars?: number;
  readonly cutOvercrowdedChars?: number;
  readonly readingCharsPerSec?: number;
}

export interface ScriptToContiReport {
  readonly tokens: readonly ParsedScriptToken[];
  readonly tokenCounts: Readonly<Record<ScriptTokenKind, number>>;
  readonly cuts: readonly ContiCutSpec[];
  readonly warnings: readonly ContiOvercrowdingWarning[];
  readonly sceneCount: number;
  readonly totalHeightPx: number;
  readonly totalGutterPx: number;
  readonly averageGutterPx: number;
  readonly totalEstimatedScrollSec: number;
  readonly shotBreakdown: Readonly<Record<ContiShotSize, number>>;
  readonly overcrowdingRatePct: number;
}

export interface ScriptContiPreset {
  readonly id: "rooftop-confrontation" | "cafe-confession" | "webnovel-dungeon";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly script: string;
}

export const CONTI_SHOT_META: Readonly<Record<ContiShotSize, { readonly labelKo: string; readonly scanSec: number }>> =
  Object.freeze({
    ECU: Object.freeze({ labelKo: "익스트림 클로즈업", scanSec: 0.9 }),
    CU: Object.freeze({ labelKo: "클로즈업", scanSec: 1.15 }),
    MS: Object.freeze({ labelKo: "미디엄 샷", scanSec: 1.25 }),
    WS: Object.freeze({ labelKo: "와이드 샷", scanSec: 1.55 }),
    "Bird's-eye": Object.freeze({ labelKo: "버즈아이 부감", scanSec: 1.7 }),
  });

export const SCRIPT_CONTI_PRESETS: readonly ScriptContiPreset[] = Object.freeze([
  Object.freeze({
    id: "rooftop-confrontation",
    labelKo: "옥상 대치 · 액션 스릴러",
    labelEn: "Rooftop Confrontation",
    script: [
      "[장면 전환: 비 내리는 고층 빌딩 옥상]",
      "(거센 빗줄기 아래 도시 전경이 내려다보인다. 지우가 난간 끝에 서 있다.)",
      '지우: "더 이상 도망칠 곳은 없어."',
      "속마음: 여기서 진실을 꺼내지 않으면 모든 게 다시 묻혀 버린다.",
      "(현우의 눈동자가 미세하게 흔들린다. 손끝이 주머니 속 열쇠를 쥔다.)",
      "SFX: 콰광!",
      '현우(외치며): "지금 당장 그 기록을 넘기지 않으면 오늘 밤 안에 모든 증인이 사라지고 우리 둘 다 되돌릴 수 없는 함정에 빠지게 될 거야!"',
      "[장면 전환: 새벽 골목길]",
      "(젖은 아스팔트 위로 붉은 네온 불빛이 길게 번진다.)",
      '지우: "좋아. 끝을 보자."',
    ].join("\n"),
  }),
  Object.freeze({
    id: "cafe-confession",
    labelKo: "비 오는 카페 · 로맨스",
    labelEn: "Rainy Cafe Confession",
    script: [
      "[장면 전환: 창가 자리 작은 카페]",
      "(유리창에 빗방울이 흘러내린다. 따뜻한 라떼 김이 천천히 올라온다.)",
      '서연: "오늘따라 말이 없네."',
      "(민재가 머그잔을 감싼 손끝을 내려다본다.)",
      "속마음: 지금 말하지 않으면 이번 겨울도 그냥 지나가 버릴 것 같아.",
      "SFX: 딸랑",
      "(민재가 고개를 들어 서연의 표정을 마주 본다.)",
      '민재: "사실 너랑 같이 걷는 시간이 제일 좋아."',
    ].join("\n"),
  }),
  Object.freeze({
    id: "webnovel-dungeon",
    labelKo: "웹소설 각성 · 혼합 문단",
    labelEn: "Webnovel Awakening",
    script: [
      "[장면 전환: 무너진 지하 신전 광장]",
      '거대한 석상 사이로 푸른 균열이 열렸다. 태오가 검자루를 고쳐 잡았다. "이번엔 내가 먼저 들어간다." \'두려웠지만 물러설 수 없었다.\'',
      "SFX: 우르릉!",
      "(바닥이 갈라지며 붉은 빛이 동공에 비친다.)",
      '태오: "전원 뒤로 물러나!"',
    ].join("\n"),
  }),
]);

const IMPACT_SFX_RE = /(콰광|쾅|펑|번쩍|쩍|우르릉|탕|퍽|와장창|파직|!!!|!!)/;
const SUBTLE_SFX_RE = /(사락|스윽|딸랑|톡|소곤|두근|찰칵|뚝)/;
const BIRDS_EYE_RE = /(부감|내려다|위에서|전경|광장|조감|하늘에서|도시 전체|골목 전체|옥상 전체)/;
const WIDE_SHOT_RE = /(거리|복도|교실|건물|빌딩|숲|신전|카페|골목|멀리|배경|도착|아스팔트|유리창)/;
const ECU_RE = /(눈동자|동공|입술|손끝|방아쇠|칼날|심장|떨리는 손|극클로즈업|머그잔을 감싼 손)/;
const CU_RE = /(표정|눈물|미소|속삭|얼굴|고개|시선|눈빛|숨결|마주 본다|클로즈업)/;

const clamp = (v: number, min: number, max: number): number => (Number.isFinite(v) ? (v < min ? min : v > max ? max : v) : min);
const round2 = (v: number): number => Math.round(v * 100) / 100;
const classifySfx = (t: string): SfxIntensity => (IMPACT_SFX_RE.test(t) || t.includes("!") ? "impact" : SUBTLE_SFX_RE.test(t) ? "subtle" : "medium");
const stripQuotes = (raw: string): string => raw.trim().replace(/^["“「『'‘]+/, "").replace(/["”」』'’]+$/, "").trim();

/** 과밀 한국어 대사를 모바일 2~3줄 호흡에 맞게 자연스럽게 2개 이상의 말풍선으로 분할한다. */
export function splitKoreanBalloonText(text: string, maxCharsPerBalloon = 32): readonly string[] {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= maxCharsPerBalloon) return [clean];

  const sentencePieces = clean.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentencePieces.length >= 2) {
    const merged: string[] = [];
    let current = "";
    for (const piece of sentencePieces) {
      if (!current) current = piece;
      else if (current.length + 1 + piece.length <= maxCharsPerBalloon) current = `${current} ${piece}`;
      else {
        merged.push(current);
        current = piece;
      }
    }
    if (current) merged.push(current);
    if (merged.length >= 2 && merged.every((m) => m.length <= maxCharsPerBalloon + 14)) return merged;
  }

  const mid = Math.floor(clean.length / 2);
  const clauseRegex = /[,，]\s+|\s+(?=(?:하지만|그러나|그리고|그래서|그런데|그러니까|우리|오늘|지금))|(?:지만|는데|니까|면|고)\s+/g;
  let bestSplit = -1;
  let bestDist = Infinity;
  let m = clauseRegex.exec(clean);
  while (m !== null) {
    const pos = m.index + m[0].length;
    if (pos >= 8 && pos <= clean.length - 8 && Math.abs(pos - mid) < bestDist) {
      bestDist = Math.abs(pos - mid);
      bestSplit = pos;
    }
    m = clauseRegex.exec(clean);
  }
  if (bestSplit === -1) {
    for (let offset = 0; offset < mid - 4; offset += 1) {
      if (clean[mid + offset] === " ") {
        bestSplit = mid + offset + 1;
        break;
      }
      if (clean[mid - offset] === " ") {
        bestSplit = mid - offset + 1;
        break;
      }
    }
  }
  if (bestSplit <= 0 || bestSplit >= clean.length) {
    return [clean.slice(0, mid).trim(), clean.slice(mid).trim()].filter(Boolean);
  }
  const left = clean.slice(0, bestSplit).trim();
  const right = clean.slice(bestSplit).trim();
  const out: string[] = [];
  if (left.length > maxCharsPerBalloon + 16) out.push(...splitKoreanBalloonText(left, maxCharsPerBalloon));
  else if (left) out.push(left);
  if (right.length > maxCharsPerBalloon + 16) out.push(...splitKoreanBalloonText(right, maxCharsPerBalloon));
  else if (right) out.push(right);
  return out.length > 0 ? out : [clean];
}

/** 한국어 대본·웹소설 텍스트를 토큰 열(대사/지문/장면전환/SFX/속마음)로 분해한다. */
export function parseKoreanScriptTokens(scriptText: string): readonly ParsedScriptToken[] {
  const lines = scriptText.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const tokens: ParsedScriptToken[] = [];
  const push = (token: Omit<ParsedScriptToken, "index">): void => {
    if (token.text.trim().length > 0) tokens.push({ ...token, index: tokens.length });
  };

  for (const line of lines) {
    const sceneBracket = /^\[(.+?)\]$/.exec(line);
    if (sceneBracket) {
      const inner = (sceneBracket[1] ?? "").trim();
      const cleaned = inner.replace(/^(?:장면\s*전환|씬\s*\d*|scene\s*\d*)\s*[:-]?\s*/i, "").trim();
      push({ kind: "scene-transition", rawLine: line, text: cleaned || inner, speaker: null, deliveryCue: null });
      continue;
    }
    if (/^[-=*]{3,}$/.test(line)) {
      push({ kind: "scene-transition", rawLine: line, text: "장면 전환", speaker: null, deliveryCue: null });
      continue;
    }

    const sfxMatch = /^(?:SFX|SE|효과음)\s*[:：]\s*(.+)$/i.exec(line) ?? /^<([^>]+)>$/.exec(line);
    if (sfxMatch) {
      const sfxText = (sfxMatch[1] ?? "").trim();
      push({ kind: "sfx", rawLine: line, text: sfxText, speaker: null, deliveryCue: null, sfxIntensity: classifySfx(sfxText) });
      continue;
    }

    const thoughtPrefix = /^(?:속마음|독백|내면|생각)\s*[:：]\s*(.+)$/.exec(line);
    if (thoughtPrefix) {
      push({ kind: "inner-thought", rawLine: line, text: stripQuotes(thoughtPrefix[1] ?? ""), speaker: null, deliveryCue: "속마음" });
      continue;
    }
    const speakerThought = /^([^\s:(]{1,16})\s*\((?:속마음|독백|내면)\)\s*[:：]\s*(.+)$/.exec(line);
    if (speakerThought) {
      push({ kind: "inner-thought", rawLine: line, text: stripQuotes(speakerThought[2] ?? ""), speaker: (speakerThought[1] ?? "").trim(), deliveryCue: "속마음" });
      continue;
    }

    const stageOnly = /^\(\(?(.+?)\)?\)$/.exec(line);
    if (stageOnly) {
      push({ kind: "stage-direction", rawLine: line, text: (stageOnly[1] ?? "").trim(), speaker: null, deliveryCue: null });
      continue;
    }

    const speakerDial = /^([^\s:(]{1,16})(?:\(([^)]{1,18})\))?\s*[:：]\s*(.+)$/.exec(line);
    if (speakerDial) {
      const cue = speakerDial[2]?.trim() ?? null;
      const body = stripQuotes(speakerDial[3] ?? "");
      push({
        kind: "dialogue",
        rawLine: line,
        text: body,
        speaker: (speakerDial[1] ?? "").trim(),
        deliveryCue: cue,
        isShout: body.includes("!") || (cue !== null && /(외치|소리|격앙|절규)/.test(cue)),
      });
      continue;
    }

    if (/^["“「『].+["”」』]$/.test(line)) {
      const body = stripQuotes(line);
      push({ kind: "dialogue", rawLine: line, text: body, speaker: null, deliveryCue: null, isShout: body.includes("!") });
      continue;
    }
    if (/^['‘].+['’]$/.test(line)) {
      push({ kind: "inner-thought", rawLine: line, text: stripQuotes(line), speaker: null, deliveryCue: "속마음" });
      continue;
    }

    // 웹소설 혼합 문단 인라인 분해
    const inlineRegex = /(["“「『][^"”」』]+["”」』]|['‘][^'’]+['’]|\([^)]+\))/g;
    let cursor = 0;
    let foundInline = false;
    let m = inlineRegex.exec(line);
    while (m !== null) {
      foundInline = true;
      const before = line.slice(cursor, m.index).trim();
      if (before) push({ kind: "stage-direction", rawLine: before, text: before, speaker: null, deliveryCue: null });
      const chunk = m[0];
      if (chunk.startsWith("(")) {
        push({ kind: "stage-direction", rawLine: chunk, text: chunk.slice(1, -1).trim(), speaker: null, deliveryCue: null });
      } else if (chunk.startsWith("'") || chunk.startsWith("‘")) {
        push({ kind: "inner-thought", rawLine: chunk, text: stripQuotes(chunk), speaker: null, deliveryCue: "속마음" });
      } else {
        const body = stripQuotes(chunk);
        push({ kind: "dialogue", rawLine: chunk, text: body, speaker: null, deliveryCue: null, isShout: body.includes("!") });
      }
      cursor = m.index + chunk.length;
      m = inlineRegex.exec(line);
    }
    const tail = line.slice(cursor).trim();
    if (tail) push({ kind: "stage-direction", rawLine: foundInline ? tail : line, text: tail, speaker: null, deliveryCue: null });
  }
  return tokens;
}

interface RawCutDraft {
  readonly sceneIndex: number;
  readonly sceneTitle: string;
  readonly isSceneOpening: boolean;
  readonly stageDirections: string[];
  readonly sfxList: { readonly text: string; readonly intensity: SfxIntensity }[];
  readonly balloonTokens: ParsedScriptToken[];
}

function inferShotForDraft(draft: RawCutDraft): { readonly shot: ContiShotSize; readonly reasonKo: string } {
  const combined = [draft.sceneTitle, ...draft.stageDirections, ...draft.balloonTokens.map((b) => `${b.deliveryCue ?? ""} ${b.text}`)].join(" ");
  const hasImpactSfx = draft.sfxList.some((s) => s.intensity === "impact");
  const hasThought = draft.balloonTokens.some((b) => b.kind === "inner-thought");
  const onlyThought = draft.balloonTokens.length > 0 && draft.balloonTokens.every((b) => b.kind === "inner-thought");

  if (BIRDS_EYE_RE.test(combined)) return { shot: "Bird's-eye", reasonKo: "공간 전경·부감 시점 지문에 맞춘 조감 구도" };
  if (draft.isSceneOpening && !ECU_RE.test(combined)) return { shot: "WS", reasonKo: "장면 전환 직후 위치·분위기 설정용 와이드 샷" };
  if (ECU_RE.test(combined) || (hasImpactSfx && draft.balloonTokens.length <= 1)) {
    return {
      shot: "ECU",
      reasonKo: hasImpactSfx ? "강한 효과음 임팩트를 집중 전달하는 익스트림 클로즈업" : "눈동자·손끝 디테일 강조를 위한 익스트림 클로즈업",
    };
  }
  if (WIDE_SHOT_RE.test(combined) && draft.balloonTokens.length === 0 && !CU_RE.test(combined)) {
    return { shot: "WS", reasonKo: "배경 동선과 공간감을 확보하는 와이드 샷" };
  }
  if (onlyThought || CU_RE.test(combined) || (hasThought && draft.balloonTokens.length <= 2)) {
    return { shot: "CU", reasonKo: onlyThought ? "속마음·독백 몰입을 높이는 인물 클로즈업" : "표정·감정선을 전면에 두는 클로즈업" };
  }
  return { shot: "MS", reasonKo: "인물 간 대사 호흡과 제스처가 균형 잡힌 미디엄 샷" };
}

function selectCutAspectRatio(shot: ContiShotSize, hasImpactSfx: boolean, balloonCount: number, w: number): { readonly label: string; readonly widthPx: number; readonly heightPx: number } {
  if (shot === "Bird's-eye") return { label: "9:14", widthPx: w, heightPx: Math.round((w * 14) / 9) };
  if (shot === "ECU") return hasImpactSfx ? { label: "9:16", widthPx: w, heightPx: Math.round((w * 16) / 9) } : { label: "16:9", widthPx: w, heightPx: Math.round((w * 9) / 16) };
  if (shot === "WS") return { label: "4:5", widthPx: w, heightPx: Math.round((w * 5) / 4) };
  if (shot === "CU") return balloonCount >= 2 ? { label: "9:13", widthPx: w, heightPx: Math.round((w * 13) / 9) } : { label: "4:5", widthPx: w, heightPx: Math.round((w * 5) / 4) };
  return balloonCount >= 2 ? { label: "4:5", widthPx: w, heightPx: Math.round((w * 5) / 4) } : { label: "1:1", widthPx: w, heightPx: w };
}

function placeCutBalloonsZOrder(cutNumber: number, balloonTokens: readonly ParsedScriptToken[], maxChars: number): readonly ContiBalloonPlacement[] {
  const count = balloonTokens.length;
  return balloonTokens.map((tok, idx) => {
    const zOrder = idx + 1;
    const style: ContiBalloonStyle = tok.kind === "inner-thought" ? "thought" : tok.isShout ? "shout" : "speech";
    const charCount = tok.text.length;
    const estimatedMobileLines = Math.max(1, Math.ceil(charCount / 13));
    const isOvercrowded = charCount > maxChars || estimatedMobileLines >= 4;
    const widthPct = Math.round(clamp(28 + Math.min(charCount, 48) * 0.52, 30, 56));
    const heightPct = Math.round(clamp(13 + estimatedMobileLines * 5.2, 16, 36));
    const yStep = count === 1 ? 0 : 62 / Math.max(1, count - 1);
    const yPct = Math.round(clamp(16 + idx * yStep, 12, 84 - heightPct * 0.35));
    const xPct = idx % 2 === 0 ? Math.round(clamp(12 + widthPct * 0.35, 16, 40)) : Math.round(clamp(88 - widthPct * 0.35, 60, 84));
    return {
      id: `cut-${cutNumber}-b-${zOrder}`,
      zOrder,
      style,
      speaker: tok.speaker,
      text: tok.text,
      xPct,
      yPct,
      widthPct,
      heightPct,
      charCount,
      estimatedMobileLines,
      isOvercrowded,
      suggestedSplits: isOvercrowded ? splitKoreanBalloonText(tok.text, 30) : [tok.text],
    };
  });
}

/** 한국어 웹툰 대본·웹소설 텍스트를 세로 스크롤 멀티컷 콘티 리포트로 즉시 변환한다. */
export function parseKoreanScriptToConti(scriptText: string, options: ScriptToContiOptions = {}): ScriptToContiReport {
  const canvasWidthPx = Math.round(clamp(options.canvasWidthPx ?? 800, 480, 1600));
  const maxBalloonsPerCut = Math.round(clamp(options.maxBalloonsPerCut ?? 3, 1, 6));
  const balloonOvercrowdedChars = Math.round(clamp(options.balloonOvercrowdedChars ?? 45, 24, 120));
  const cutOvercrowdedChars = Math.round(clamp(options.cutOvercrowdedChars ?? 90, 50, 240));
  const readingCharsPerSec = clamp(options.readingCharsPerSec ?? 11.5, 6, 22);

  const tokens = parseKoreanScriptTokens(scriptText);
  const tokenCounts: Record<ScriptTokenKind, number> = { dialogue: 0, "stage-direction": 0, "scene-transition": 0, sfx: 0, "inner-thought": 0 };
  for (const tok of tokens) tokenCounts[tok.kind] += 1;

  const drafts: RawCutDraft[] = [];
  let sceneIndex = 1;
  let sceneTitle = "씬 1";
  let nextIsOpening = true;
  let current: RawCutDraft | null = null;

  const flush = (): void => {
    if (!current) return;
    if (current.stageDirections.length > 0 || current.sfxList.length > 0 || current.balloonTokens.length > 0 || current.isSceneOpening) {
      drafts.push(current);
    }
    current = null;
  };
  const ensure = (): RawCutDraft => {
    if (!current) {
      current = { sceneIndex, sceneTitle, isSceneOpening: nextIsOpening, stageDirections: [], sfxList: [], balloonTokens: [] };
      nextIsOpening = false;
    }
    return current;
  };

  for (const tok of tokens) {
    if (tok.kind === "scene-transition") {
      flush();
      if (drafts.length > 0) sceneIndex += 1;
      sceneTitle = tok.text;
      nextIsOpening = true;
      continue;
    }
    if (tok.kind === "stage-direction") {
      if (current && (current.balloonTokens.length > 0 || current.sfxList.length > 0)) flush();
      ensure().stageDirections.push(tok.text);
      continue;
    }
    if (tok.kind === "sfx") {
      const intensity = tok.sfxIntensity ?? "medium";
      if (current && current.balloonTokens.length > 0 && intensity === "impact") flush();
      ensure().sfxList.push({ text: tok.text, intensity });
      continue;
    }
    // 장면 도입 설정 지문(와이드/부감) 직후 대사가 시작되면 설정 컷과 인물 대사 컷을 자연스럽게 분리
    if (
      current &&
      current.isSceneOpening &&
      current.stageDirections.length > 0 &&
      current.balloonTokens.length === 0 &&
      tok.kind === "dialogue" &&
      (WIDE_SHOT_RE.test(current.stageDirections.join(" ")) || BIRDS_EYE_RE.test(current.stageDirections.join(" ")))
    ) {
      flush();
    } else if (current && current.balloonTokens.length >= maxBalloonsPerCut) {
      flush();
    } else if (current && tok.kind === "inner-thought" && current.balloonTokens.some((b) => b.kind === "dialogue")) {
      flush();
    }
    ensure().balloonTokens.push(tok);
  }
  flush();

  if (drafts.length === 0 && tokens.some((t) => t.kind === "scene-transition")) {
    drafts.push({ sceneIndex, sceneTitle, isSceneOpening: true, stageDirections: [], sfxList: [], balloonTokens: [] });
  }

  const warnings: ContiOvercrowdingWarning[] = [];
  const shotBreakdown: Record<ContiShotSize, number> = { ECU: 0, CU: 0, MS: 0, WS: 0, "Bird's-eye": 0 };

  const cuts: ContiCutSpec[] = drafts.map((draft, idx) => {
    const cutNumber = idx + 1;
    const nextDraft = drafts[idx + 1];
    const { shot, reasonKo } = inferShotForDraft(draft);
    shotBreakdown[shot] += 1;

    const hasImpactSfx = draft.sfxList.some((s) => s.intensity === "impact");
    const hasThought = draft.balloonTokens.some((b) => b.kind === "inner-thought");
    const ratio = selectCutAspectRatio(shot, hasImpactSfx, draft.balloonTokens.length, canvasWidthPx);

    let gutterAfterPx = 160;
    let gutterMoodKo = "표준 세로 거터";
    if (!nextDraft) {
      gutterAfterPx = 360;
      gutterMoodKo = "엔딩 여운 여백";
    } else if (nextDraft.sceneIndex !== draft.sceneIndex) {
      gutterAfterPx = 420;
      gutterMoodKo = "장면 전환 암전 여백";
    } else if (hasImpactSfx) {
      gutterAfterPx = 320;
      gutterMoodKo = "임팩트 여백";
    } else if (hasThought || shot === "CU" || shot === "ECU") {
      gutterAfterPx = 240;
      gutterMoodKo = "감정 호흡 여백";
    } else if (shot === "MS" && draft.balloonTokens.length >= 1) {
      gutterAfterPx = 110;
      gutterMoodKo = "빠른 대사 호흡";
    }

    const balloons = placeCutBalloonsZOrder(cutNumber, draft.balloonTokens, balloonOvercrowdedChars);
    const totalCharCount = balloons.reduce((acc, b) => acc + b.charCount, 0);
    let hasOvercrowding = false;

    for (const b of balloons) {
      if (b.isOvercrowded) {
        hasOvercrowding = true;
        warnings.push({
          cutNumber,
          balloonId: b.id,
          kind: "balloon-overcrowded",
          severity: b.charCount > balloonOvercrowdedChars + 20 ? "high" : "warn",
          charCount: b.charCount,
          messageKo: `${cutNumber}컷 Z${b.zOrder} 말풍선이 ${b.charCount}자(약 ${b.estimatedMobileLines}줄)로 모바일 읽기 기준을 초과했습니다.`,
          suggestionKo: `${b.suggestedSplits.length}개 말풍선으로 분할해 스크롤 호흡을 확보하세요.`,
          suggestedSplits: b.suggestedSplits,
        });
      }
    }
    if (totalCharCount > cutOvercrowdedChars || balloons.length >= 4) {
      hasOvercrowding = true;
      warnings.push({
        cutNumber,
        balloonId: null,
        kind: "cut-overcrowded",
        severity: "high",
        charCount: totalCharCount,
        messageKo: `${cutNumber}컷 전체 대사량이 ${totalCharCount}자(${balloons.length}개 말풍선)로 밀집되어 있습니다.`,
        suggestionKo: "지문·리액션 컷을 사이에 넣어 2개 세로 컷으로 나누는 것을 권장합니다.",
        suggestedSplits: [],
      });
    }

    const estimatedScrollSec = round2(
      CONTI_SHOT_META[shot].scanSec + (ratio.heightPx + gutterAfterPx) / 920 + totalCharCount / readingCharsPerSec + draft.sfxList.length * 0.45,
    );

    return {
      cutId: `conti-cut-${cutNumber}`,
      cutNumber,
      sceneIndex: draft.sceneIndex,
      sceneTitle: draft.sceneTitle,
      isSceneOpening: draft.isSceneOpening,
      shotSize: shot,
      shotLabelKo: CONTI_SHOT_META[shot].labelKo,
      shotReasonKo: reasonKo,
      aspectRatioLabel: ratio.label,
      widthPx: ratio.widthPx,
      heightPx: ratio.heightPx,
      gutterAfterPx,
      gutterMoodKo,
      stageDirections: draft.stageDirections,
      sfxList: draft.sfxList,
      balloons,
      totalCharCount,
      estimatedScrollSec,
      hasOvercrowding,
    };
  });

  const totalGutterPx = cuts.reduce((acc, c) => acc + c.gutterAfterPx, 0);
  const totalHeightPx = cuts.reduce((acc, c) => acc + c.heightPx + c.gutterAfterPx, 0);
  return {
    tokens,
    tokenCounts,
    cuts,
    warnings,
    sceneCount: cuts.length > 0 ? Math.max(...cuts.map((c) => c.sceneIndex)) : 0,
    totalHeightPx,
    totalGutterPx,
    averageGutterPx: cuts.length > 0 ? Math.round(totalGutterPx / cuts.length) : 0,
    totalEstimatedScrollSec: round2(cuts.reduce((acc, c) => acc + c.estimatedScrollSec, 0)),
    shotBreakdown,
    overcrowdingRatePct: cuts.length > 0 ? Math.round((cuts.filter((c) => c.hasOvercrowding).length / cuts.length) * 100) : 0,
  };
}
