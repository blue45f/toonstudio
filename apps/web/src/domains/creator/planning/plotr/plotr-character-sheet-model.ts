/**
 * Plotr 캐릭터 일관성 바이블 시트 모델 & 전 컷 드리프트 자동 감사·동기화 엔진.
 *
 * - 등록된 인물별 대표 3색 OKLCH 팔레트(머리색·눈색·대표 의상색),
 *   4종 표정 락(평온·긴장·분노·미소), 시그니처 소품·실루엣 규칙을 관리한다.
 * - 전 컷의 대사 화자·지문 언급·소재 참조 배열을 교차 검증해
 *   참조 누락·화자 표기 불일치·미등록 화자·외형 메모 누락을 자동 감지하고
 *   원클릭으로 전 컷 일관성을 동기화한다.
 */
import type { CodexEntityEntry } from "../../writer-room/studio-scrivenings-snapshot-codex";
import type {
  PlotrCharacterBibleSpec,
  PlotrCharacterPalette,
  PlotrConsistencyAsset,
  PlotrCutCard,
  PlotrDocumentState,
  PlotrExpressionLockId,
} from "./plotr-types";

export interface PlotrExpressionLockMeta {
  readonly id: PlotrExpressionLockId;
  readonly labelKo: string;
  readonly cueKo: string;
  readonly browTilt: number;
  readonly eyeScaleY: number;
  readonly mouthCurve: number;
  readonly badgeOklch: string;
}

export const PLOTR_EXPRESSION_LOCK_ORDER: readonly PlotrExpressionLockId[] =
  Object.freeze(["calm", "tense", "angry", "smile"]);

export const PLOTR_EXPRESSION_LOCK_META: Readonly<
  Record<PlotrExpressionLockId, PlotrExpressionLockMeta>
> = Object.freeze({
  calm: Object.freeze({
    id: "calm",
    labelKo: "평온",
    cueKo: "차분한 눈매 · 안정된 시선",
    browTilt: 0,
    eyeScaleY: 1,
    mouthCurve: 1.5,
    badgeOklch: "oklch(0.66 0.14 235)",
  }),
  tense: Object.freeze({
    id: "tense",
    labelKo: "긴장",
    cueKo: "좁아진 동공 · 살짝 올라간 눈썹",
    browTilt: -4,
    eyeScaleY: 0.78,
    mouthCurve: -1,
    badgeOklch: "oklch(0.7 0.17 75)",
  }),
  angry: Object.freeze({
    id: "angry",
    labelKo: "분노",
    cueKo: "날카로운 미간 · 강한 명암 대비",
    browTilt: 7,
    eyeScaleY: 0.72,
    mouthCurve: -4,
    badgeOklch: "oklch(0.6 0.21 25)",
  }),
  smile: Object.freeze({
    id: "smile",
    labelKo: "미소",
    cueKo: "부드러운 눈꼬리 · 따뜻한 하이라이트",
    browTilt: -2,
    eyeScaleY: 0.88,
    mouthCurve: 5,
    badgeOklch: "oklch(0.68 0.17 155)",
  }),
});

export const PLOTR_CHARACTER_PALETTE_PRESETS: readonly PlotrCharacterPalette[] =
  Object.freeze([
    Object.freeze({
      presetLabelKo: "은발 · 에메랄드 · 아이보리",
      hairOklch: "oklch(0.84 0.03 255)",
      eyeOklch: "oklch(0.67 0.18 158)",
      outfitOklch: "oklch(0.88 0.04 88)",
    }),
    Object.freeze({
      presetLabelKo: "흑발 · 회청안 · 딥네이비",
      hairOklch: "oklch(0.28 0.03 260)",
      eyeOklch: "oklch(0.62 0.14 242)",
      outfitOklch: "oklch(0.36 0.09 258)",
    }),
    Object.freeze({
      presetLabelKo: "갈발 · 호박안 · 민트 교복",
      hairOklch: "oklch(0.47 0.09 58)",
      eyeOklch: "oklch(0.72 0.16 78)",
      outfitOklch: "oklch(0.74 0.12 168)",
    }),
    Object.freeze({
      presetLabelKo: "잉크흑발 · 청록안 · 차콜 점퍼",
      hairOklch: "oklch(0.24 0.02 250)",
      eyeOklch: "oklch(0.66 0.16 205)",
      outfitOklch: "oklch(0.42 0.04 252)",
    }),
    Object.freeze({
      presetLabelKo: "로즈브라운 · 자수정안 · 버건디 코트",
      hairOklch: "oklch(0.5 0.11 20)",
      eyeOklch: "oklch(0.63 0.18 310)",
      outfitOklch: "oklch(0.46 0.14 14)",
    }),
    Object.freeze({
      presetLabelKo: "백금발 · 사파이어안 · 슬레이트 트렌치",
      hairOklch: "oklch(0.87 0.05 95)",
      eyeOklch: "oklch(0.6 0.19 255)",
      outfitOklch: "oklch(0.64 0.06 230)",
    }),
  ]);

export interface PlotrCharacterBibleProfile {
  readonly assetId: string;
  readonly name: string;
  readonly visualNote: string;
  readonly costumeOrMaterial: string;
  readonly palette: PlotrCharacterPalette;
  readonly expressionLock: PlotrExpressionLockId;
  readonly signatureProp: string;
  readonly silhouetteRule: string;
  readonly appearanceCutIds: readonly string[];
  readonly appearanceCutLabels: readonly string[];
  readonly missingReferenceCutIds: readonly string[];
  readonly consistencyScore: number;
}

export type PlotrConsistencyDriftKind =
  | "missing-asset-reference"
  | "speaker-alias-mismatch"
  | "unregistered-speaker"
  | "empty-visual-profile";

export interface PlotrConsistencyDriftIssue {
  readonly id: string;
  readonly kind: PlotrConsistencyDriftKind;
  readonly severity: "warn" | "info";
  readonly cutId: string | null;
  readonly cutLabel: string | null;
  readonly characterName: string;
  readonly canonicalName: string | null;
  readonly assetId: string | null;
  readonly messageKo: string;
}

export interface PlotrCharacterConsistencyAudit {
  readonly profiles: readonly PlotrCharacterBibleProfile[];
  readonly issues: readonly PlotrConsistencyDriftIssue[];
  readonly consistencyScore: number;
  readonly totalCharacterCount: number;
  readonly syncedCharacterCount: number;
  readonly summaryKo: string;
}

export interface PlotrSyncConsistencyResult {
  readonly nextDocument: PlotrDocumentState;
  readonly fixedIssueCount: number;
  readonly addedCharacterCount: number;
  readonly normalizedSpeakerCount: number;
  readonly linkedCutCount: number;
  readonly auditAfter: PlotrCharacterConsistencyAudit;
}

export function inferCharacterPaletteFromAsset(
  asset: Pick<PlotrConsistencyAsset, "visualNote" | "costumeOrMaterial" | "swatchOklch">,
  fallbackIndex = 0,
): PlotrCharacterPalette {
  const combined = `${asset.visualNote} ${asset.costumeOrMaterial}`;
  const preset =
    PLOTR_CHARACTER_PALETTE_PRESETS[
      Math.abs(fallbackIndex) % PLOTR_CHARACTER_PALETTE_PRESETS.length
    ]!;

  let hairOklch = preset.hairOklch;
  let hairTag = "기본발";
  if (/은발|백발|백금/u.test(combined)) {
    hairOklch = "oklch(0.85 0.03 255)";
    hairTag = "은발";
  } else if (/흑발|검은\s*머리|검은\s*단발/u.test(combined)) {
    hairOklch = "oklch(0.25 0.03 258)";
    hairTag = "흑발";
  } else if (/갈색|갈발|브라운|밤색/u.test(combined)) {
    hairOklch = "oklch(0.48 0.09 56)";
    hairTag = "갈발";
  } else if (/금발|노란/u.test(combined)) {
    hairOklch = "oklch(0.82 0.13 92)";
    hairTag = "금발";
  } else if (/적발|붉은\s*머리/u.test(combined)) {
    hairOklch = "oklch(0.52 0.17 24)";
    hairTag = "적발";
  }

  let eyeOklch = preset.eyeOklch;
  let eyeTag = "포인트안";
  if (/에메랄드|초록|녹안/u.test(combined)) {
    eyeOklch = "oklch(0.67 0.18 158)";
    eyeTag = "에메랄드안";
  } else if (/회청|푸른|파란|청안/u.test(combined)) {
    eyeOklch = "oklch(0.62 0.15 245)";
    eyeTag = "회청안";
  } else if (/금안|호박|노란\s*눈/u.test(combined)) {
    eyeOklch = "oklch(0.74 0.16 82)";
    eyeTag = "호박안";
  } else if (/붉은\s*눈|적안/u.test(combined)) {
    eyeOklch = "oklch(0.6 0.21 25)";
    eyeTag = "적안";
  }

  let outfitOklch = asset.swatchOklch || preset.outfitOklch;
  let outfitTag = "시그니처 의상";
  if (/상아|아이보리|드레스/u.test(combined)) {
    outfitOklch = "oklch(0.88 0.04 86)";
    outfitTag = "아이보리 드레스";
  } else if (/남색|망토|제복|기관사/u.test(combined)) {
    outfitOklch = "oklch(0.38 0.1 255)";
    outfitTag = "딥네이비 제복";
  } else if (/민트|카디건|하복|교복/u.test(combined)) {
    outfitOklch = "oklch(0.75 0.12 168)";
    outfitTag = "민트 교복";
  } else if (/회색|점퍼|작업복/u.test(combined)) {
    outfitOklch = "oklch(0.44 0.04 252)";
    outfitTag = "차콜 점퍼";
  } else if (/베이지|트렌치|코트/u.test(combined)) {
    outfitOklch = "oklch(0.74 0.07 78)";
    outfitTag = "베이지 코트";
  }

  const hasParsedCue =
    hairTag !== "기본발" || eyeTag !== "포인트안" || outfitTag !== "시그니처 의상";

  return Object.freeze({
    hairOklch,
    eyeOklch,
    outfitOklch,
    presetLabelKo: hasParsedCue
      ? `${hairTag} · ${eyeTag} · ${outfitTag}`
      : preset.presetLabelKo,
  });
}

function inferExpressionFromText(text: string): PlotrExpressionLockId {
  if (/분노|노려|차가운|날카로운|경고|흉터/u.test(text)) return "angry";
  if (/웃|미소|부드러운|발랄|설렘|햇살/u.test(text)) return "smile";
  if (/땀|피곤|긴장|숨|다급|충격/u.test(text)) return "tense";
  return "calm";
}

function inferSignaturePropForCharacter(
  asset: PlotrConsistencyAsset,
  allAssets: readonly PlotrConsistencyAsset[],
  fallbackIndex: number,
): string {
  const combined = `${asset.visualNote} ${asset.costumeOrMaterial}`;
  const matchedProp = allAssets.find(
    (item) =>
      item.category === "prop" &&
      (combined.includes(item.name) || item.name.split(/\s+/u).some((tok) => tok.length >= 2 && combined.includes(tok))),
  );
  if (matchedProp) return matchedProp.name;
  const keywordMatch = /([가-힣]{1,8}(?:우산|시계|단검|스케치북|녹음기|편지|반지|열쇠|브로치|머리핀|사원증|수첩|망토))/u.exec(
    combined,
  );
  if (keywordMatch) return keywordMatch[1]!;
  const firstProp = allAssets.filter((a) => a.category === "prop")[fallbackIndex];
  return firstProp?.name ?? "고정 시그니처 소품 없음";
}

function inferSilhouetteRule(asset: PlotrConsistencyAsset): string {
  const note = asset.visualNote.trim();
  const costume = asset.costumeOrMaterial.trim();
  if (note && costume) {
    const shortHair = note.split(",")[0]?.trim() ?? note.slice(0, 18);
    return `${shortHair} · ${costume.slice(0, 26)}`;
  }
  if (note) return note.slice(0, 36);
  if (costume) return `${costume.slice(0, 28)} 중심 실루엣 유지`;
  return "어깨선·헤어 실루엣 컷 간 고정";
}

export function resolveCharacterBibleSpec(
  asset: PlotrConsistencyAsset,
  allAssets: readonly PlotrConsistencyAsset[],
  fallbackIndex = 0,
): PlotrCharacterBibleSpec {
  if (asset.characterBible) return asset.characterBible;
  return Object.freeze({
    palette: inferCharacterPaletteFromAsset(asset, fallbackIndex),
    expressionLock: inferExpressionFromText(
      `${asset.visualNote} ${asset.costumeOrMaterial}`,
    ),
    signatureProp: inferSignaturePropForCharacter(asset, allAssets, fallbackIndex),
    silhouetteRule: inferSilhouetteRule(asset),
  });
}

function buildNameTokensForCharacter(
  asset: PlotrConsistencyAsset,
  codexEntries: readonly CodexEntityEntry[],
): readonly string[] {
  const tokens = new Set<string>();
  const canonical = asset.name.trim();
  if (!canonical) return Object.freeze([]);
  tokens.add(canonical);

  // 한국어 3글자 성명(예: 강도윤 → 도윤)의 이름 2글자 축약 호출도 추적한다.
  if (/^[가-힣]{3}$/u.test(canonical)) {
    tokens.add(canonical.slice(1));
  }

  for (const entry of codexEntries) {
    if (entry.kind !== "character") continue;
    if (
      entry.canonical.trim() === canonical ||
      entry.aliases.some((alias) => alias.trim() === canonical)
    ) {
      if (entry.canonical.trim()) tokens.add(entry.canonical.trim());
      for (const alias of entry.aliases) {
        if (alias.trim().length >= 2) tokens.add(alias.trim());
      }
    }
  }
  return Object.freeze(Array.from(tokens));
}

function resolveCanonicalCharacterForSpeaker(
  speaker: string,
  characterAssets: readonly PlotrConsistencyAsset[],
  tokenMap: ReadonlyMap<string, readonly string[]>,
): {
  readonly asset: PlotrConsistencyAsset | null;
  readonly isExactMatch: boolean;
} {
  const clean = speaker.trim();
  if (!clean) return { asset: null, isExactMatch: false };

  const exact = characterAssets.find((a) => a.name.trim() === clean);
  if (exact) return { asset: exact, isExactMatch: true };

  for (const asset of characterAssets) {
    const tokens = tokenMap.get(asset.id) ?? [];
    if (
      tokens.some(
        (token) =>
          token === clean ||
          (token.length >= 2 && clean.includes(token)) ||
          (clean.length >= 2 && asset.name.trim().endsWith(clean)),
      )
    ) {
      return { asset, isExactMatch: false };
    }
  }
  return { asset: null, isExactMatch: false };
}

function isNonCharacterSpeaker(
  speaker: string,
  allAssets: readonly PlotrConsistencyAsset[],
): boolean {
  const clean = speaker.trim();
  if (!clean) return true;
  if (/^(?:나레이션|독백|등장인물|안내방송|시스템|알림)$/u.test(clean)) return true;
  // 녹음기·시계 등 소품이 화자로 표기된 경우 인물 누락 오탐을 막는다.
  return allAssets.some(
    (asset) =>
      asset.category !== "character" &&
      (asset.name.trim() === clean || asset.name.includes(clean)),
  );
}

/**
 * 전 컷 등장 일관성 감사:
 * - 인물별 등장 컷·참조 누락 컷·화자 표기 불일치·미등록 화자·빈 외형 프로필을 정밀 산출한다.
 */
export function auditCharacterConsistencyAcrossCuts(
  assets: readonly PlotrConsistencyAsset[],
  cuts: readonly PlotrCutCard[],
  codexEntries: readonly CodexEntityEntry[] = [],
): PlotrCharacterConsistencyAudit {
  const characterAssets = assets.filter((a) => a.category === "character");
  const tokenMap = new Map<string, readonly string[]>();
  characterAssets.forEach((asset) => {
    tokenMap.set(asset.id, buildNameTokensForCharacter(asset, codexEntries));
  });

  const issues: PlotrConsistencyDriftIssue[] = [];
  const appearanceByAssetId = new Map<string, Set<string>>();
  const missingRefByAssetId = new Map<string, Set<string>>();
  characterAssets.forEach((asset) => {
    appearanceByAssetId.set(asset.id, new Set<string>());
    missingRefByAssetId.set(asset.id, new Set<string>());
    if (!asset.visualNote.trim()) {
      issues.push({
        id: `drift-empty-${asset.id}`,
        kind: "empty-visual-profile",
        severity: "info",
        cutId: null,
        cutLabel: null,
        characterName: asset.name,
        canonicalName: asset.name,
        assetId: asset.id,
        messageKo: `'${asset.name}' 외형 메모가 비어 있어 컷마다 외모 기준이 흔들릴 수 있어요.`,
      });
    }
  });

  for (const cut of cuts) {
    const cutText = `${cut.actionSummary} ${cut.dialogues.map((d) => `${d.speaker} ${d.text}`).join(" ")}`;

    // 1) 컷 참조 배열에 이미 연결된 인물 기록
    for (const refId of cut.referencedAssetIds) {
      appearanceByAssetId.get(refId)?.add(cut.id);
    }

    // 2) 대사 화자 표기 일관성 & 미등록 화자 검사
    for (const dlg of cut.dialogues) {
      if (dlg.kind === "narration") continue;
      const speaker = dlg.speaker.trim();
      if (!speaker || isNonCharacterSpeaker(speaker, assets)) continue;

      const resolved = resolveCanonicalCharacterForSpeaker(
        speaker,
        characterAssets,
        tokenMap,
      );
      if (!resolved.asset) {
        issues.push({
          id: `drift-unreg-${cut.id}-${speaker}`,
          kind: "unregistered-speaker",
          severity: "warn",
          cutId: cut.id,
          cutLabel: cut.sceneTitle,
          characterName: speaker,
          canonicalName: null,
          assetId: null,
          messageKo: `${cut.sceneTitle}의 화자 '${speaker}'가 인물 바이블에 등록되지 않았어요.`,
        });
        continue;
      }

      appearanceByAssetId.get(resolved.asset.id)?.add(cut.id);
      if (!resolved.isExactMatch) {
        issues.push({
          id: `drift-alias-${cut.id}-${resolved.asset.id}-${speaker}`,
          kind: "speaker-alias-mismatch",
          severity: "warn",
          cutId: cut.id,
          cutLabel: cut.sceneTitle,
          characterName: speaker,
          canonicalName: resolved.asset.name,
          assetId: resolved.asset.id,
          messageKo: `${cut.sceneTitle} 화자 '${speaker}'가 바이블 정식 이름 '${resolved.asset.name}'과 다릅니다.`,
        });
      }
      if (!cut.referencedAssetIds.includes(resolved.asset.id)) {
        missingRefByAssetId.get(resolved.asset.id)?.add(cut.id);
      }
    }

    // 3) 지문·대사에 이름 또는 별칭이 언급됐는데 컷 참조(referencedAssetIds)가 빠진 인물 검출
    for (const asset of characterAssets) {
      const tokens = tokenMap.get(asset.id) ?? [];
      const mentioned = tokens.some((token) => token.length >= 2 && cutText.includes(token));
      if (mentioned) {
        appearanceByAssetId.get(asset.id)?.add(cut.id);
        if (!cut.referencedAssetIds.includes(asset.id)) {
          missingRefByAssetId.get(asset.id)?.add(cut.id);
        }
      }
    }
  }

  for (const asset of characterAssets) {
    const missingCutIds = Array.from(missingRefByAssetId.get(asset.id) ?? []);
    for (const cutId of missingCutIds) {
      const cut = cuts.find((c) => c.id === cutId);
      if (!cut) continue;
      issues.push({
        id: `drift-missing-ref-${cut.id}-${asset.id}`,
        kind: "missing-asset-reference",
        severity: "warn",
        cutId: cut.id,
        cutLabel: cut.sceneTitle,
        characterName: asset.name,
        canonicalName: asset.name,
        assetId: asset.id,
        messageKo: `${cut.sceneTitle}에 '${asset.name}'이 등장하지만 일관성 소재 참조가 누락됐어요.`,
      });
    }
  }

  const profiles: PlotrCharacterBibleProfile[] = characterAssets.map((asset, idx) => {
    const spec = resolveCharacterBibleSpec(asset, assets, idx);
    const appearedIds = cuts
      .filter((c) => appearanceByAssetId.get(asset.id)?.has(c.id))
      .map((c) => c.id);
    const appearedLabels = cuts
      .filter((c) => appearanceByAssetId.get(asset.id)?.has(c.id))
      .map((c) => c.sceneTitle);
    const missingIds = Array.from(missingRefByAssetId.get(asset.id) ?? []);
    const relatedIssueCount = issues.filter((item) => item.assetId === asset.id).length;
    const score = Math.max(20, 100 - relatedIssueCount * 18);

    return Object.freeze({
      assetId: asset.id,
      name: asset.name,
      visualNote: asset.visualNote,
      costumeOrMaterial: asset.costumeOrMaterial,
      palette: spec.palette,
      expressionLock: spec.expressionLock,
      signatureProp: spec.signatureProp,
      silhouetteRule: spec.silhouetteRule,
      appearanceCutIds: Object.freeze(appearedIds),
      appearanceCutLabels: Object.freeze(appearedLabels),
      missingReferenceCutIds: Object.freeze(missingIds),
      consistencyScore: score,
    });
  });

  const syncedCharacterCount = profiles.filter((p) => p.consistencyScore === 100).length;
  const totalPenalty = issues.reduce(
    (sum, item) => sum + (item.severity === "warn" ? 14 : 8),
    0,
  );
  const consistencyScore =
    characterAssets.length === 0 && issues.length === 0
      ? 100
      : Math.max(15, 100 - totalPenalty);

  const summaryKo =
    issues.length === 0
      ? characterAssets.length === 0
        ? "등록된 인물이 없어요. 1문장 아이디어나 장르 샘플로 인물을 채워 보세요."
        : `인물 ${characterAssets.length}명 전 컷 일관성 100% 통과`
      : `전 컷 일관성 불일치 ${issues.length}건 감지 · 원클릭 동기화로 바로 맞출 수 있어요.`;

  return Object.freeze({
    profiles: Object.freeze(profiles),
    issues: Object.freeze(issues),
    consistencyScore,
    totalCharacterCount: characterAssets.length,
    syncedCharacterCount,
    summaryKo,
  });
}

export function updateCharacterBibleOnAsset(
  assets: readonly PlotrConsistencyAsset[],
  assetId: string,
  patch: Partial<PlotrCharacterBibleSpec>,
): readonly PlotrConsistencyAsset[] {
  return Object.freeze(
    assets.map((asset, idx) => {
      if (asset.id !== assetId) return asset;
      const current = resolveCharacterBibleSpec(asset, assets, idx);
      const nextBible: PlotrCharacterBibleSpec = Object.freeze({
        palette: patch.palette ?? current.palette,
        expressionLock: patch.expressionLock ?? current.expressionLock,
        signatureProp:
          patch.signatureProp !== undefined ? patch.signatureProp : current.signatureProp,
        silhouetteRule:
          patch.silhouetteRule !== undefined
            ? patch.silhouetteRule
            : current.silhouetteRule,
      });
      return Object.freeze({
        ...asset,
        swatchOklch: nextBible.palette.outfitOklch,
        characterBible: nextBible,
      });
    }),
  );
}

/**
 * 원클릭 '전 컷 일관성 동기화':
 * 1) 미등록 화자를 인물 바이블에 자동 등록
 * 2) 빈 외형 메모를 3색 팔레트·표정 락·실루엣 규칙으로 보완
 * 3) 컷 대사의 별칭/축약 화자 표기를 정식 바이블 이름으로 통일(대사 원문 보존)
 * 4) 전 컷에 등장하는 인물·배경·소품 소재 참조를 일괄 동기화
 */
export function syncCharacterConsistencyAcrossCuts(
  doc: PlotrDocumentState,
): PlotrSyncConsistencyResult {
  const before = auditCharacterConsistencyAcrossCuts(
    doc.assets,
    doc.cuts,
    doc.codexEntries,
  );

  const nextAssets: PlotrConsistencyAsset[] = [...doc.assets];
  let addedCharacterCount = 0;

  // 1) 미등록 화자 자동 등록
  const unregisteredNames = Array.from(
    new Set(
      before.issues
        .filter((issue) => issue.kind === "unregistered-speaker")
        .map((issue) => issue.characterName.trim())
        .filter(Boolean),
    ),
  );

  for (const name of unregisteredNames) {
    if (nextAssets.some((a) => a.category === "character" && a.name.trim() === name)) {
      continue;
    }
    const preset =
      PLOTR_CHARACTER_PALETTE_PRESETS[
        nextAssets.length % PLOTR_CHARACTER_PALETTE_PRESETS.length
      ]!;
    const spec: PlotrCharacterBibleSpec = Object.freeze({
      palette: preset,
      expressionLock: "calm",
      signatureProp: "대사 장면 핵심 소품",
      silhouetteRule: `${name} 고정 헤어·의상 실루엣`,
    });
    nextAssets.push(
      Object.freeze({
        id: `asset-bible-sync-${nextAssets.length + 1}`,
        category: "character",
        name,
        visualNote: `${preset.presetLabelKo} · 평온 표정 기준`,
        swatchOklch: preset.outfitOklch,
        costumeOrMaterial: preset.presetLabelKo,
        characterBible: spec,
      }),
    );
    addedCharacterCount += 1;
  }

  // 2) 인물 바이블 스펙 확정 및 빈 외형 메모 보완
  const hydratedAssets: readonly PlotrConsistencyAsset[] = Object.freeze(
    nextAssets.map((asset, idx) => {
      if (asset.category !== "character") return asset;
      const spec = resolveCharacterBibleSpec(asset, nextAssets, idx);
      const exprMeta = PLOTR_EXPRESSION_LOCK_META[spec.expressionLock];
      const visualNote =
        asset.visualNote.trim().length > 0
          ? asset.visualNote
          : `${spec.palette.presetLabelKo} · ${exprMeta.labelKo} 표정 · ${spec.silhouetteRule}`;
      return Object.freeze({
        ...asset,
        visualNote,
        characterBible: spec,
      });
    }),
  );

  const characterAssets = hydratedAssets.filter((a) => a.category === "character");
  const tokenMap = new Map<string, readonly string[]>();
  characterAssets.forEach((asset) => {
    tokenMap.set(asset.id, buildNameTokensForCharacter(asset, doc.codexEntries));
  });

  // 3) 전 컷 화자 정식 이름 통일 + 누락 참조 일괄 연결
  let normalizedSpeakerCount = 0;
  let linkedCutCount = 0;

  const nextCuts: readonly PlotrCutCard[] = Object.freeze(
    doc.cuts.map((cut) => {
      const refSet = new Set<string>(cut.referencedAssetIds);
      const initialRefSize = refSet.size;

      const nextDialogues = Object.freeze(
        cut.dialogues.map((dlg) => {
          if (dlg.kind === "narration") return dlg;
          const speaker = dlg.speaker.trim();
          if (!speaker) return dlg;
          const resolved = resolveCanonicalCharacterForSpeaker(
            speaker,
            characterAssets,
            tokenMap,
          );
          if (!resolved.asset) return dlg;
          refSet.add(resolved.asset.id);
          if (!resolved.isExactMatch) {
            normalizedSpeakerCount += 1;
            return Object.freeze({ ...dlg, speaker: resolved.asset.name });
          }
          return dlg;
        }),
      );

      const cutText = `${cut.actionSummary} ${nextDialogues.map((d) => `${d.speaker} ${d.text}`).join(" ")}`;
      for (const asset of characterAssets) {
        const tokens = tokenMap.get(asset.id) ?? [];
        if (tokens.some((token) => token.length >= 2 && cutText.includes(token))) {
          refSet.add(asset.id);
        }
      }

      if (refSet.size > initialRefSize) {
        linkedCutCount += 1;
      }

      return Object.freeze({
        ...cut,
        dialogues: nextDialogues,
        referencedAssetIds: Object.freeze(Array.from(refSet)),
      });
    }),
  );

  const nextDocument: PlotrDocumentState = Object.freeze({
    ...doc,
    assets: hydratedAssets,
    cuts: nextCuts,
  });

  const auditAfter = auditCharacterConsistencyAcrossCuts(
    nextDocument.assets,
    nextDocument.cuts,
    nextDocument.codexEntries,
  );

  return Object.freeze({
    nextDocument,
    fixedIssueCount: Math.max(0, before.issues.length - auditAfter.issues.length),
    addedCharacterCount,
    normalizedSpeakerCount,
    linkedCutCount,
    auditAfter,
  });
}
