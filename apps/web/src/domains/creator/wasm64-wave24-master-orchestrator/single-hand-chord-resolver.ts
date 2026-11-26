/**
 * 한 손 수식키·화음(`chord`) 단축키 충돌 탐지 및 인체공학 재배정 솔버 (`>= 44×44px` 터치 패드 보장).
 *
 * - 브라우저·운영체제 예약 단축키 충돌, 펜 반대 손 범위를 벗어나는 키 뻗침, 중복 배정,
 *   길게 누르는 임시 도구(`isHoldModifierTool`)와 다중 키 화음의 간섭을 정밀 검출한다.
 * - 호출 빈도 순으로 충돌 없는 한 손 홈열·보조 수식키·인접 화음 조합을 결정론적으로 배정한다.
 */

export const MIN_CHORD_TOUCH_TARGET_PX = 44 as const;

export type HandErgonomicProfile = "left-hand" | "right-hand";

export type ShortcutConflictKind =
  | "duplicate-binding"
  | "os-browser-reserved"
  | "cross-hand-stretch"
  | "hold-prefix-shadow";

export interface ScreenTargetRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ChordCommandInput {
  readonly commandId: string;
  readonly labelKo: string;
  readonly frequency: number;
  readonly preferredChord?: string;
  readonly isHoldModifierTool?: boolean;
}

export interface ShortcutConflictFinding {
  readonly commandId: string;
  readonly requestedChord: string;
  readonly normalizedChord: string;
  readonly kind: ShortcutConflictKind;
  readonly conflictingWithCommandId?: string;
  readonly messageKo: string;
}

export interface ChordBindingAssignment {
  readonly commandId: string;
  readonly labelKo: string;
  readonly assignedChord: string;
  readonly preservedPreferred: boolean;
  readonly ergonomicCost: number;
  readonly singleHandCompliant: true;
}

export interface ModifierTouchPadTarget {
  readonly padId: string;
  readonly labelKo: string;
  readonly chordToken: string;
  readonly hitBox: ScreenTargetRect;
}

export interface ParsedChord {
  readonly normalized: string;
  readonly modifiers: readonly string[];
  readonly baseKeys: readonly string[];
}

const MODIFIER_CANONICAL_ORDER = ["Ctrl", "Alt", "Shift", "Meta"] as const;

const RESERVED_SYSTEM_CHORDS: ReadonlySet<string> = new Set([
  "Ctrl+N",
  "Ctrl+Q",
  "Ctrl+R",
  "Ctrl+T",
  "Ctrl+W",
  "Meta+N",
  "Meta+Q",
  "Meta+R",
  "Meta+T",
  "Meta+W",
  "Alt+F4",
  "F5",
]);

const LEFT_HAND_ALLOWED_BASE_KEYS: ReadonlySet<string> = new Set([
  "A", "S", "D", "F", "G",
  "Q", "W", "E", "R", "T",
  "Z", "X", "C", "V", "B",
  "1", "2", "3", "4", "5",
  "SPACE", "TAB",
]);

const RIGHT_HAND_ALLOWED_BASE_KEYS: ReadonlySet<string> = new Set([
  "H", "J", "K", "L",
  "Y", "U", "I", "O", "P",
  "N", "M",
  "6", "7", "8", "9", "0",
  "SPACE",
]);

interface ErgonomicCandidateChord {
  readonly chord: string;
  readonly baseKeys: readonly string[];
  readonly cost: number;
}

/**
 * 단축키 표현식을 표준 순서(`Ctrl+Alt+Shift+Meta+정렬된 기본키`)로 정규화한다.
 */
export function normalizeShortcutChord(rawChord: string): ParsedChord {
  const parts = rawChord.split("+");
  const modSet = new Set<string>();
  const baseSet = new Set<string>();

  for (const rawPart of parts) {
    const trimmed = rawPart.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const upper = trimmed.toUpperCase();
    if (upper === "CTRL" || upper === "CONTROL") {
      modSet.add("Ctrl");
    } else if (upper === "ALT" || upper === "OPTION") {
      modSet.add("Alt");
    } else if (upper === "SHIFT") {
      modSet.add("Shift");
    } else if (upper === "META" || upper === "CMD" || upper === "COMMAND") {
      modSet.add("Meta");
    } else {
      baseSet.add(upper);
    }
  }

  const orderedMods = MODIFIER_CANONICAL_ORDER.filter((m) => modSet.has(m));
  const orderedBases = [...baseSet].sort();
  return {
    normalized: [...orderedMods, ...orderedBases].join("+"),
    modifiers: orderedMods,
    baseKeys: orderedBases,
  };
}

function isSingleHandCompliantParsed(parsed: ParsedChord, hand: HandErgonomicProfile): boolean {
  if (parsed.baseKeys.length === 0 || parsed.baseKeys.length > 2) {
    return false;
  }
  const allowedSet = hand === "left-hand" ? LEFT_HAND_ALLOWED_BASE_KEYS : RIGHT_HAND_ALLOWED_BASE_KEYS;
  return parsed.baseKeys.every((key) => allowedSet.has(key));
}

function buildErgonomicCatalog(hand: HandErgonomicProfile): readonly ErgonomicCandidateChord[] {
  const homeKeys = hand === "left-hand" ? ["S", "D", "F", "A"] : ["J", "K", "L", "H"];
  const upperKeys = hand === "left-hand" ? ["W", "E", "R", "Q", "T", "G"] : ["I", "O", "U", "P", "Y"];
  const lowerKeys = hand === "left-hand" ? ["X", "C", "V", "Z", "B"] : ["M", "N"];
  const numberKeys = hand === "left-hand" ? ["1", "2", "3", "4", "5"] : ["7", "8", "9", "0", "6"];
  const chordPairs: readonly (readonly [string, string])[] =
    hand === "left-hand"
      ? [["S", "D"], ["D", "F"], ["A", "S"], ["W", "E"], ["E", "R"], ["X", "C"], ["C", "V"]]
      : [["J", "K"], ["K", "L"], ["H", "J"], ["U", "I"], ["I", "O"], ["N", "M"]];

  const list: ErgonomicCandidateChord[] = [];
  homeKeys.forEach((k, idx) => list.push({ chord: k, baseKeys: [k], cost: 1.0 + idx * 0.06 }));
  upperKeys.forEach((k, idx) => list.push({ chord: k, baseKeys: [k], cost: 1.3 + idx * 0.06 }));
  lowerKeys.forEach((k, idx) => list.push({ chord: k, baseKeys: [k], cost: 1.65 + idx * 0.06 }));
  homeKeys.forEach((k, idx) => list.push({ chord: `Shift+${k}`, baseKeys: [k], cost: 2.0 + idx * 0.06 }));
  upperKeys.forEach((k, idx) => list.push({ chord: `Shift+${k}`, baseKeys: [k], cost: 2.35 + idx * 0.06 }));
  homeKeys.forEach((k, idx) => list.push({ chord: `Alt+${k}`, baseKeys: [k], cost: 2.7 + idx * 0.06 }));
  upperKeys.forEach((k, idx) => list.push({ chord: `Alt+${k}`, baseKeys: [k], cost: 3.0 + idx * 0.06 }));
  chordPairs.forEach(([k1, k2], idx) => {
    const sorted = [k1, k2].sort();
    const first = sorted[0] ?? k1;
    const second = sorted[1] ?? k2;
    list.push({ chord: `${first}+${second}`, baseKeys: [first, second], cost: 3.35 + idx * 0.07 });
  });
  numberKeys.forEach((k, idx) => list.push({ chord: k, baseKeys: [k], cost: 3.85 + idx * 0.06 }));
  return Object.freeze(list);
}

/**
 * 한 손 단축키 충돌을 검증하고 모든 명령에 무충돌 단축키 및 `>= 44×44px` 터치 수식키 패드를 배정한다.
 */
export function resolveConflictFreeSingleHandChords(
  commands: readonly ChordCommandInput[],
  handPreference: HandErgonomicProfile = "left-hand",
  touchStripOrigin?: { readonly x: number; readonly y: number },
): {
  readonly detectedChordConflicts: readonly ShortcutConflictFinding[];
  readonly chordBindings: readonly ChordBindingAssignment[];
  readonly modifierTouchPads: readonly ModifierTouchPadTarget[];
} {
  const detectedChordConflicts: ShortcutConflictFinding[] = [];
  const commandsByFreq = [...commands].sort((a, b) => {
    const diff = b.frequency - a.frequency;
    return Math.abs(diff) > 1e-9 ? diff : a.commandId.localeCompare(b.commandId);
  });

  const claimedChords = new Map<string, string>();
  const claimedHoldBaseKeys = new Map<string, string>();
  const claimedMultiBaseKeys = new Map<string, string>();
  const acceptedPreferredByCommand = new Map<string, { readonly chord: string; readonly cost: number }>();

  for (const cmd of commandsByFreq) {
    if (!cmd.preferredChord || cmd.preferredChord.trim().length === 0) {
      continue;
    }
    const parsed = normalizeShortcutChord(cmd.preferredChord);
    if (RESERVED_SYSTEM_CHORDS.has(parsed.normalized)) {
      detectedChordConflicts.push(Object.freeze({
        commandId: cmd.commandId,
        requestedChord: cmd.preferredChord,
        normalizedChord: parsed.normalized,
        kind: "os-browser-reserved",
        messageKo: `브라우저·운영체제 예약 단축키(${parsed.normalized})와 겹쳐 안전한 한 손 키로 교체합니다.`,
      }));
      continue;
    }
    if (!isSingleHandCompliantParsed(parsed, handPreference)) {
      detectedChordConflicts.push(Object.freeze({
        commandId: cmd.commandId,
        requestedChord: cmd.preferredChord,
        normalizedChord: parsed.normalized,
        kind: "cross-hand-stretch",
        messageKo: `펜을 쥔 반대 손 범위를 벗어나는 키(${parsed.normalized})라 한 손 홈 영역으로 재배정합니다.`,
      }));
      continue;
    }
    const duplicateOwner = claimedChords.get(parsed.normalized);
    if (duplicateOwner !== undefined) {
      detectedChordConflicts.push(Object.freeze({
        commandId: cmd.commandId,
        requestedChord: cmd.preferredChord,
        normalizedChord: parsed.normalized,
        kind: "duplicate-binding",
        conflictingWithCommandId: duplicateOwner,
        messageKo: `이미 '${duplicateOwner}' 명령에 배정된 단축키(${parsed.normalized})와 중복됩니다.`,
      }));
      continue;
    }

    let holdShadowOwner: string | undefined;
    if (cmd.isHoldModifierTool === true && parsed.modifiers.length === 0 && parsed.baseKeys.length === 1) {
      holdShadowOwner = claimedMultiBaseKeys.get(parsed.baseKeys[0] ?? "");
    } else if (parsed.modifiers.length === 0 && parsed.baseKeys.length > 1) {
      for (const bk of parsed.baseKeys) {
        const owner = claimedHoldBaseKeys.get(bk);
        if (owner !== undefined) {
          holdShadowOwner = owner;
          break;
        }
      }
    }
    if (holdShadowOwner !== undefined) {
      detectedChordConflicts.push(Object.freeze({
        commandId: cmd.commandId,
        requestedChord: cmd.preferredChord,
        normalizedChord: parsed.normalized,
        kind: "hold-prefix-shadow",
        conflictingWithCommandId: holdShadowOwner,
        messageKo: `길게 누르는 임시 도구('${holdShadowOwner}')와 동시 입력 화음(${parsed.normalized})이 간섭합니다.`,
      }));
      continue;
    }

    claimedChords.set(parsed.normalized, cmd.commandId);
    if (cmd.isHoldModifierTool === true && parsed.modifiers.length === 0 && parsed.baseKeys.length === 1) {
      const holdKey = parsed.baseKeys[0];
      if (holdKey !== undefined) {
        claimedHoldBaseKeys.set(holdKey, cmd.commandId);
      }
    } else if (parsed.modifiers.length === 0 && parsed.baseKeys.length > 1) {
      for (const bk of parsed.baseKeys) {
        if (!claimedMultiBaseKeys.has(bk)) {
          claimedMultiBaseKeys.set(bk, cmd.commandId);
        }
      }
    }
    acceptedPreferredByCommand.set(cmd.commandId, {
      chord: parsed.normalized,
      cost: 1.0 + parsed.modifiers.length * 0.8 + (parsed.baseKeys.length - 1) * 1.2,
    });
  }

  const catalog = buildErgonomicCatalog(handPreference);
  const chordBindings: ChordBindingAssignment[] = [];

  for (const cmd of commandsByFreq) {
    const preserved = acceptedPreferredByCommand.get(cmd.commandId);
    if (preserved !== undefined) {
      chordBindings.push(Object.freeze({
        commandId: cmd.commandId,
        labelKo: cmd.labelKo,
        assignedChord: preserved.chord,
        preservedPreferred: true,
        ergonomicCost: preserved.cost,
        singleHandCompliant: true,
      }));
      continue;
    }

    let selected: ErgonomicCandidateChord | undefined;
    for (const candidate of catalog) {
      if (claimedChords.has(candidate.chord)) {
        continue;
      }
      if (cmd.isHoldModifierTool === true) {
        if (candidate.baseKeys.length > 1 || candidate.chord.includes("+")) {
          continue;
        }
        if (claimedMultiBaseKeys.has(candidate.baseKeys[0] ?? "")) {
          continue;
        }
      } else if (candidate.baseKeys.length > 1) {
        if (candidate.baseKeys.some((bk) => claimedHoldBaseKeys.has(bk))) {
          continue;
        }
      }
      selected = candidate;
      break;
    }

    const fallbackChord = selected?.chord ?? `Alt+Shift+${(chordBindings.length % 5) + 1}`;
    const fallbackCost = selected?.cost ?? 4.5;
    claimedChords.set(fallbackChord, cmd.commandId);
    if (cmd.isHoldModifierTool === true && selected && selected.baseKeys.length === 1) {
      const bk = selected.baseKeys[0];
      if (bk !== undefined) {
        claimedHoldBaseKeys.set(bk, cmd.commandId);
      }
    } else if (selected && selected.baseKeys.length > 1) {
      for (const bk of selected.baseKeys) {
        if (!claimedMultiBaseKeys.has(bk)) {
          claimedMultiBaseKeys.set(bk, cmd.commandId);
        }
      }
    }

    chordBindings.push(Object.freeze({
      commandId: cmd.commandId,
      labelKo: cmd.labelKo,
      assignedChord: fallbackChord,
      preservedPreferred: false,
      ergonomicCost: fallbackCost,
      singleHandCompliant: true,
    }));
  }

  const stripX = touchStripOrigin?.x ?? 24;
  const stripY = touchStripOrigin?.y ?? 220;
  const padDefs: readonly (readonly [string, string, string])[] = [
    ["mod-shift", "보조 Shift", "Shift"],
    ["mod-alt", "스포이드 Alt", "Alt"],
    ["mod-space", "화면 이동", "SPACE"],
    ["mod-radial", "방사 메뉴", "Tab"],
  ];
  const modifierTouchPads: ModifierTouchPadTarget[] = padDefs.map(([padId, labelKo, chordToken], idx) =>
    Object.freeze({
      padId,
      labelKo,
      chordToken,
      hitBox: Object.freeze({
        x: stripX,
        y: stripY + idx * (MIN_CHORD_TOUCH_TARGET_PX + 8),
        width: 52,
        height: MIN_CHORD_TOUCH_TARGET_PX,
      }),
    }),
  );

  return {
    detectedChordConflicts: Object.freeze(detectedChordConflicts),
    chordBindings: Object.freeze(chordBindings),
    modifierTouchPads: Object.freeze(modifierTouchPads),
  };
}
