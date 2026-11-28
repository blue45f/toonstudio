/**
 * Wave 97: 한국어 유니코드 자모 분해(`0xAC00..0xD7A3`) 및 다국어 12종 만화 비즘 변환기.
 *
 * - 초성·중성·종성 및 호환 자모, 라틴·영문 이중자모/철자, 문장부호 휴지를
 *   표준 12종 만화 비즘(`ComicVisemeId`) 시퀀스로 결정론적 분해한다.
 */

export interface LocalVoicePrivacyContract {
  readonly uploadsVoiceAudio: false;
  readonly storesBiometricVoiceprint: false;
  readonly runsLocallyOnly: true;
}

export const LOCAL_VOICE_PRIVACY_CONTRACT: LocalVoicePrivacyContract = {
  uploadsVoiceAudio: false,
  storesBiometricVoiceprint: false,
  runsLocallyOnly: true,
};

export type ComicVisemeId =
  | "SIL"
  | "A"
  | "E"
  | "I"
  | "O"
  | "U"
  | "M_B_P"
  | "F_V"
  | "L_N_T_D"
  | "S_Z_CH"
  | "K_G"
  | "W_OO";

export const COMIC_VISEME_ALPHABET: readonly ComicVisemeId[] = [
  "SIL", "A", "E", "I", "O", "U", "M_B_P", "F_V", "L_N_T_D", "S_Z_CH", "K_G", "W_OO",
];

export type VisemeTokenRole = "onset" | "nucleus" | "coda" | "pause";

export type VisemeAcousticClass =
  | "silence"
  | "bilabial"
  | "sibilant"
  | "fricative"
  | "sonorant"
  | "stop"
  | "vowel";

export interface ParsedVisemeToken {
  readonly index: number;
  readonly viseme: ComicVisemeId;
  readonly grapheme: string;
  readonly jamoLabel: string;
  readonly role: VisemeTokenRole;
  readonly syllableIndex: number;
  readonly intrinsicDurationMs: number;
  readonly acousticClass: VisemeAcousticClass;
  readonly isBilabial: boolean;
  readonly isStressedCandidate: boolean;
}

type JamoTuple = readonly [ComicVisemeId, number, VisemeAcousticClass];

const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;

const CHOSEONG_LABELS: readonly string[] = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
const JUNGSEONG_LABELS: readonly string[] = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ",
  "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
];
const JONGSEONG_LABELS: readonly string[] = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ",
  "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

const CHOSEONG_MAP: readonly (JamoTuple | null)[] = [
  ["K_G", 52, "stop"], ["K_G", 58, "stop"], ["L_N_T_D", 52, "sonorant"], ["L_N_T_D", 50, "stop"],
  ["L_N_T_D", 56, "stop"], ["L_N_T_D", 48, "sonorant"], ["M_B_P", 58, "bilabial"], ["M_B_P", 56, "bilabial"],
  ["M_B_P", 62, "bilabial"], ["S_Z_CH", 74, "sibilant"], ["S_Z_CH", 80, "sibilant"], null,
  ["S_Z_CH", 68, "sibilant"], ["S_Z_CH", 74, "sibilant"], ["S_Z_CH", 76, "sibilant"], ["K_G", 58, "stop"],
  ["L_N_T_D", 56, "stop"], ["M_B_P", 62, "bilabial"], ["K_G", 54, "fricative"],
];

const JUNGSEONG_MAP: readonly (readonly JamoTuple[])[] = [
  [["A", 138, "vowel"]], [["A", 132, "vowel"]], [["A", 142, "vowel"]], [["A", 136, "vowel"]],
  [["E", 130, "vowel"]], [["E", 128, "vowel"]], [["E", 136, "vowel"]], [["E", 132, "vowel"]],
  [["O", 134, "vowel"]], [["W_OO", 46, "vowel"], ["A", 112, "vowel"]], [["W_OO", 46, "vowel"], ["A", 108, "vowel"]],
  [["W_OO", 44, "vowel"], ["E", 108, "vowel"]], [["O", 138, "vowel"]], [["U", 132, "vowel"]],
  [["W_OO", 46, "vowel"], ["E", 110, "vowel"]], [["W_OO", 46, "vowel"], ["E", 108, "vowel"]],
  [["W_OO", 44, "vowel"], ["I", 106, "vowel"]], [["U", 136, "vowel"]], [["E", 118, "vowel"]],
  [["I", 124, "vowel"]], [["I", 126, "vowel"]],
];

const JONGSEONG_MAP: readonly (JamoTuple | null)[] = [
  null, ["K_G", 50, "stop"], ["K_G", 54, "stop"], ["K_G", 54, "stop"], ["L_N_T_D", 54, "sonorant"],
  ["L_N_T_D", 54, "sonorant"], ["L_N_T_D", 54, "sonorant"], ["L_N_T_D", 48, "stop"], ["L_N_T_D", 52, "sonorant"],
  ["K_G", 52, "stop"], ["M_B_P", 58, "bilabial"], ["M_B_P", 56, "bilabial"], ["L_N_T_D", 52, "sonorant"],
  ["L_N_T_D", 52, "stop"], ["M_B_P", 58, "bilabial"], ["L_N_T_D", 50, "sonorant"], ["M_B_P", 58, "bilabial"],
  ["M_B_P", 56, "bilabial"], ["M_B_P", 58, "bilabial"], ["S_Z_CH", 62, "sibilant"], ["S_Z_CH", 68, "sibilant"],
  ["K_G", 56, "sonorant"], ["S_Z_CH", 60, "sibilant"], ["S_Z_CH", 64, "sibilant"], ["K_G", 54, "stop"],
  ["L_N_T_D", 52, "stop"], ["M_B_P", 58, "bilabial"], ["K_G", 50, "fricative"],
];

const COMPAT_JAMO_MAP: Readonly<Record<string, JamoTuple>> = {
  ㄱ: ["K_G", 55, "stop"], ㄲ: ["K_G", 60, "stop"], ㄴ: ["L_N_T_D", 55, "sonorant"], ㄷ: ["L_N_T_D", 52, "stop"],
  ㄹ: ["L_N_T_D", 52, "sonorant"], ㅁ: ["M_B_P", 60, "bilabial"], ㅂ: ["M_B_P", 60, "bilabial"], ㅃ: ["M_B_P", 64, "bilabial"],
  ㅅ: ["S_Z_CH", 74, "sibilant"], ㅆ: ["S_Z_CH", 80, "sibilant"], ㅈ: ["S_Z_CH", 68, "sibilant"], ㅊ: ["S_Z_CH", 74, "sibilant"],
  ㅋ: ["K_G", 60, "stop"], ㅌ: ["L_N_T_D", 56, "stop"], ㅍ: ["M_B_P", 64, "bilabial"], ㅎ: ["K_G", 56, "fricative"],
  ㅏ: ["A", 132, "vowel"], ㅓ: ["E", 126, "vowel"], ㅗ: ["O", 130, "vowel"], ㅜ: ["U", 128, "vowel"], ㅡ: ["E", 118, "vowel"], ㅣ: ["I", 122, "vowel"],
};

const LATIN_DIGRAPH_MAP: Readonly<Record<string, JamoTuple>> = {
  oo: ["W_OO", 128, "vowel"], ee: ["I", 126, "vowel"], ea: ["I", 122, "vowel"], ch: ["S_Z_CH", 74, "sibilant"],
  sh: ["S_Z_CH", 78, "sibilant"], ph: ["F_V", 66, "fricative"], th: ["L_N_T_D", 60, "fricative"],
  wh: ["W_OO", 64, "vowel"], qu: ["W_OO", 70, "vowel"], ng: ["K_G", 58, "sonorant"], ck: ["K_G", 54, "stop"],
};

const LATIN_CHAR_MAP: Readonly<Record<string, JamoTuple>> = {
  a: ["A", 130, "vowel"], e: ["E", 120, "vowel"], i: ["I", 118, "vowel"], y: ["I", 112, "vowel"],
  o: ["O", 128, "vowel"], u: ["U", 124, "vowel"], m: ["M_B_P", 58, "bilabial"], b: ["M_B_P", 56, "bilabial"],
  p: ["M_B_P", 58, "bilabial"], f: ["F_V", 66, "fricative"], v: ["F_V", 64, "fricative"], l: ["L_N_T_D", 54, "sonorant"],
  n: ["L_N_T_D", 54, "sonorant"], t: ["L_N_T_D", 50, "stop"], d: ["L_N_T_D", 50, "stop"], r: ["L_N_T_D", 52, "sonorant"],
  s: ["S_Z_CH", 74, "sibilant"], z: ["S_Z_CH", 72, "sibilant"], c: ["S_Z_CH", 66, "sibilant"], j: ["S_Z_CH", 66, "sibilant"],
  x: ["S_Z_CH", 74, "sibilant"], k: ["K_G", 54, "stop"], g: ["K_G", 52, "stop"], q: ["K_G", 54, "stop"],
  h: ["K_G", 52, "fricative"], w: ["W_OO", 66, "vowel"],
};

function punctuationPauseMs(ch: string): number {
  if (ch === "…") return 340;
  if (ch === "." || ch === "!" || ch === "?" || ch === "。" || ch === "！" || ch === "？") return 260;
  if (ch === "," || ch === ";" || ch === ":" || ch === "·" || ch === "—") return 185;
  return 0;
}

/**
 * 한국어·라틴 대사를 실제 유니코드 한글 자모 분해(`0xAC00..0xD7A3`) 및 문장부호 휴지 규칙으로
 * 12종 만화 비즘 시퀀스로 변환한다.
 */
export function decomposeKoreanTextToVisemeSequence(text: string): readonly ParsedVisemeToken[] {
  const tokens: ParsedVisemeToken[] = [];
  let syllableIndex = 0;

  const pushSpec = (
    spec: JamoTuple,
    grapheme: string,
    jamoLabel: string,
    role: VisemeTokenRole,
    sylIdx: number,
    stressed: boolean,
    durationOverride?: number,
  ): void => {
    tokens.push({
      index: tokens.length,
      viseme: spec[0],
      grapheme,
      jamoLabel,
      role,
      syllableIndex: sylIdx,
      intrinsicDurationMs: durationOverride ?? spec[1],
      acousticClass: spec[2],
      isBilabial: spec[0] === "M_B_P",
      isStressedCandidate: stressed,
    });
  };

  const pushPause = (grapheme: string, durationMs: number): void => {
    const prev = tokens.length > 0 ? tokens[tokens.length - 1] : null;
    if (prev && prev.viseme === "SIL") {
      tokens[tokens.length - 1] = {
        ...prev,
        grapheme: `${prev.grapheme}${grapheme}`,
        jamoLabel: `${prev.jamoLabel}${grapheme}`,
        intrinsicDurationMs: Math.max(prev.intrinsicDurationMs, durationMs),
      };
      return;
    }
    pushSpec(["SIL", durationMs, "silence"], grapheme, grapheme, "pause", -1, false);
  };

  let cursor = 0;
  while (cursor < text.length) {
    const ch = text.charAt(cursor);
    const code = text.charCodeAt(cursor);

    if (code >= HANGUL_BASE && code <= HANGUL_END) {
      const offset = code - HANGUL_BASE;
      const choIdx = Math.floor(offset / 588);
      const jungIdx = Math.floor((offset % 588) / 28);
      const jongIdx = offset % 28;
      const syl = syllableIndex;
      syllableIndex += 1;

      const choSpec = CHOSEONG_MAP[choIdx];
      if (choSpec) pushSpec(choSpec, ch, CHOSEONG_LABELS[choIdx], "onset", syl, false);

      const jungSpecs = JUNGSEONG_MAP[jungIdx];
      for (let j = 0; j < jungSpecs.length; j += 1) {
        pushSpec(jungSpecs[j], ch, JUNGSEONG_LABELS[jungIdx], "nucleus", syl, j === jungSpecs.length - 1);
      }

      const jongSpec = JONGSEONG_MAP[jongIdx];
      if (jongSpec) pushSpec(jongSpec, ch, JONGSEONG_LABELS[jongIdx], "coda", syl, false);
      cursor += 1;
      continue;
    }

    const compat = COMPAT_JAMO_MAP[ch];
    if (compat) {
      const syl = syllableIndex;
      syllableIndex += 1;
      const isVowel = compat[2] === "vowel";
      pushSpec(compat, ch, ch, isVowel ? "nucleus" : "onset", syl, isVowel);
      cursor += 1;
      continue;
    }

    const pair = text.slice(cursor, cursor + 2).toLowerCase();
    if (pair.length === 2 && LATIN_DIGRAPH_MAP[pair]) {
      const spec = LATIN_DIGRAPH_MAP[pair];
      const isVowel = spec[2] === "vowel";
      const syl = syllableIndex;
      if (isVowel) syllableIndex += 1;
      pushSpec(spec, text.slice(cursor, cursor + 2), pair, isVowel ? "nucleus" : "onset", syl, isVowel);
      cursor += 2;
      continue;
    }

    const lower = ch.toLowerCase();
    if (LATIN_CHAR_MAP[lower]) {
      const spec = LATIN_CHAR_MAP[lower];
      const doubled = spec[2] !== "vowel" && text.charAt(cursor + 1).toLowerCase() === lower;
      const isVowel = spec[2] === "vowel";
      const syl = syllableIndex;
      if (isVowel) syllableIndex += 1;
      pushSpec(
        spec,
        doubled ? text.slice(cursor, cursor + 2) : ch,
        doubled ? `${lower}${lower}` : lower,
        isVowel ? "nucleus" : "onset",
        syl,
        isVowel,
        doubled ? Math.round(spec[1] * 1.15) : spec[1],
      );
      cursor += doubled ? 2 : 1;
      continue;
    }

    if (text.slice(cursor, cursor + 3) === "...") {
      pushPause("...", 340);
      cursor += 3;
      continue;
    }

    const pauseMs = punctuationPauseMs(ch);
    if (pauseMs > 0) pushPause(ch, pauseMs);
    cursor += 1;
  }

  if (tokens.length === 0) {
    pushSpec(["SIL", 200, "silence"], "", "SIL", "pause", -1, false);
  }
  return tokens;
}
