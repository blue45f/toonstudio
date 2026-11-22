/**
 * 장기 연재 작화 일관성 바이블 (Continuity Bible) 순수 도메인 모델 (₩0 100% 브라우저 로컬).
 *
 * 캐릭터별 화수 간 유지 항목(눈 색·헤어·상처 위치·교복/복장·핵심 소품·상태 변화 이력)과
 * 직전 화 대비 변경·누락 경고(예: "12화 왼뺨 흉터 누락 체크") 체크시트를 계산·영속화한다.
 */

import type { StudioStoryCharacter } from "../studio-story-bible";

export type ContinuityTraitCategory = "visual" | "scar" | "outfit" | "prop" | "status";
export type ContinuityWarningSeverity = "error" | "warn" | "info";
export type ContinuityScarSeverity = "permanent" | "temporary" | "healed";
export type ContinuityHandPreference = "left" | "right" | "either";

export interface ContinuityScarItem {
  readonly id: string;
  readonly locationKo: string;
  readonly sinceEpisode: number;
  readonly resolvedEpisode?: number;
  readonly severity: ContinuityScarSeverity;
  readonly note: string;
}

export interface ContinuityOutfitItem {
  readonly id: string;
  readonly label: string;
  readonly activeFromEpisode: number;
  readonly activeUntilEpisode?: number;
  readonly isDefault: boolean;
  readonly details: string;
}

export interface ContinuityPropItem {
  readonly id: string;
  readonly label: string;
  readonly sinceEpisode: number;
  readonly lostAtEpisode?: number;
  readonly handPreference: ContinuityHandPreference;
  readonly carriedByDefault: boolean;
}

export interface ContinuityStateEvent {
  readonly id: string;
  readonly episodeNumber: number;
  readonly category: ContinuityTraitCategory;
  readonly summaryKo: string;
  readonly detailKo: string;
}

export interface CharacterContinuityProfile {
  readonly characterId: string;
  readonly characterName: string;
  readonly roleLabel: string;
  readonly eyeColorLabel: string;
  readonly hairStyleAndColor: string;
  readonly scarsAndMarks: readonly ContinuityScarItem[];
  readonly outfits: readonly ContinuityOutfitItem[];
  readonly signatureProps: readonly ContinuityPropItem[];
  readonly stateHistory: readonly ContinuityStateEvent[];
}

export interface ContinuityChecklistItem {
  readonly itemId: string;
  readonly category: ContinuityTraitCategory;
  readonly labelKo: string;
  readonly detailKo: string;
  readonly sinceEpisode: number;
  readonly critical: boolean;
  readonly carriedFromPreviousEpisode: boolean;
  readonly introducedThisEpisode: boolean;
  readonly checked: boolean;
}

export interface ContinuityDeltaWarning {
  readonly id: string;
  readonly characterId: string;
  readonly characterName: string;
  readonly itemId: string;
  readonly category: ContinuityTraitCategory;
  readonly severity: ContinuityWarningSeverity;
  readonly sinceEpisode: number;
  readonly headlineKo: string;
  readonly actionHintKo: string;
}

export interface CharacterContinuityEvaluation {
  readonly characterId: string;
  readonly characterName: string;
  readonly currentEpisodeNumber: number;
  readonly previousEpisodeNumber: number;
  readonly activeOutfit: ContinuityOutfitItem | null;
  readonly previousOutfit: ContinuityOutfitItem | null;
  readonly activeScars: readonly ContinuityScarItem[];
  readonly activeProps: readonly ContinuityPropItem[];
  readonly checklist: readonly ContinuityChecklistItem[];
  readonly warnings: readonly ContinuityDeltaWarning[];
  readonly checkedCount: number;
  readonly totalRequiredCount: number;
  readonly consistencyScore: number;
}

export interface SeriesContinuitySummary {
  readonly episodeNumber: number;
  readonly characterEvaluations: readonly CharacterContinuityEvaluation[];
  readonly allWarnings: readonly ContinuityDeltaWarning[];
  readonly errorCount: number;
  readonly warnCount: number;
  readonly overallScore: number;
}

export interface ContinuityBibleState {
  readonly projectId: string;
  readonly currentEpisodeNumber: number;
  readonly characters: readonly CharacterContinuityProfile[];
  /** key: `${characterId}:${episodeNumber}` -> checked itemId[] */
  readonly checkedItemsByKey: Readonly<Record<string, readonly string[]>>;
}

export function continuityEpisodeCheckKey(characterId: string, episodeNumber: number): string {
  return `${characterId}:${Math.max(1, Math.round(episodeNumber))}`;
}

export function isActiveInEpisode(
  sinceEpisode: number,
  untilEpisode: number | undefined,
  episodeNumber: number,
): boolean {
  if (episodeNumber < sinceEpisode) return false;
  if (untilEpisode !== undefined && episodeNumber > untilEpisode) return false;
  return true;
}

export function resolveActiveOutfit(
  outfits: readonly ContinuityOutfitItem[],
  episodeNumber: number,
): ContinuityOutfitItem | null {
  const matching = outfits.filter((item) =>
    isActiveInEpisode(item.activeFromEpisode, item.activeUntilEpisode, episodeNumber),
  );
  if (matching.length === 0) {
    return outfits.find((item) => item.isDefault) ?? outfits[0] ?? null;
  }
  // 가장 최근 화수에서 시작된 복장을 우선한다.
  return [...matching].sort((a, b) => b.activeFromEpisode - a.activeFromEpisode)[0] ?? null;
}

function handPreferenceLabelKo(pref: ContinuityHandPreference): string {
  if (pref === "left") return "왼손";
  if (pref === "right") return "오른손";
  return "양손/가변";
}

/**
 * 단일 캐릭터의 현재 화수 작화 체크리스트 및 직전 화 대비 변경·누락 경고를 산출한다.
 */
export function evaluateCharacterContinuity(
  profile: CharacterContinuityProfile,
  currentEpisodeNumber: number,
  checkedItemIds: readonly string[],
): CharacterContinuityEvaluation {
  const episode = Math.max(1, Math.round(currentEpisodeNumber));
  const previousEpisode = Math.max(1, episode - 1);
  const checkedSet = new Set(checkedItemIds);

  const activeOutfit = resolveActiveOutfit(profile.outfits, episode);
  const previousOutfit = episode > 1 ? resolveActiveOutfit(profile.outfits, previousEpisode) : null;

  const activeScars = profile.scarsAndMarks.filter(
    (scar) =>
      scar.severity !== "healed" &&
      isActiveInEpisode(scar.sinceEpisode, scar.resolvedEpisode, episode),
  );

  const activeProps = profile.signatureProps.filter(
    (prop) =>
      prop.carriedByDefault &&
      isActiveInEpisode(prop.sinceEpisode, prop.lostAtEpisode, episode),
  );

  const checklist: ContinuityChecklistItem[] = [];
  const warnings: ContinuityDeltaWarning[] = [];

  // 1. 고정 외형(눈 색 · 헤어)
  const visualItemId = `visual:${profile.characterId}`;
  const visualChecked = checkedSet.has(visualItemId);
  checklist.push({
    itemId: visualItemId,
    category: "visual",
    labelKo: `눈 색·헤어 고정 스펙`,
    detailKo: `${profile.eyeColorLabel} / ${profile.hairStyleAndColor}`,
    sinceEpisode: 1,
    critical: false,
    carriedFromPreviousEpisode: episode > 1,
    introducedThisEpisode: episode === 1,
    checked: visualChecked,
  });

  // 2. 활성 복장(교복/의상) + 직전 화 대비 복장 전환 감지
  if (activeOutfit) {
    const outfitItemId = `outfit:${activeOutfit.id}`;
    const outfitChecked = checkedSet.has(outfitItemId);
    const outfitChangedFromPrev =
      episode > 1 && previousOutfit !== null && previousOutfit.id !== activeOutfit.id;

    checklist.push({
      itemId: outfitItemId,
      category: "outfit",
      labelKo: `복장 · ${activeOutfit.label}`,
      detailKo: activeOutfit.details,
      sinceEpisode: activeOutfit.activeFromEpisode,
      critical: true,
      carriedFromPreviousEpisode: !outfitChangedFromPrev && episode > activeOutfit.activeFromEpisode,
      introducedThisEpisode: outfitChangedFromPrev || episode === activeOutfit.activeFromEpisode,
      checked: outfitChecked,
    });

    if (outfitChangedFromPrev && !outfitChecked && previousOutfit) {
      warnings.push({
        id: `warn:outfit-change:${profile.characterId}:${episode}`,
        characterId: profile.characterId,
        characterName: profile.characterName,
        itemId: outfitItemId,
        category: "outfit",
        severity: "warn",
        sinceEpisode: activeOutfit.activeFromEpisode,
        headlineKo: `${episode}화 복장 전환 확인 (${previousOutfit.label} → ${activeOutfit.label})`,
        actionHintKo: `직전 ${previousEpisode}화 복장과 달라졌습니다. 환복 컷이나 시간 경과 연출이 있는지 확인 후 체크하세요.`,
      });
    } else if (!outfitChecked) {
      warnings.push({
        id: `warn:outfit-missing:${profile.characterId}:${episode}`,
        characterId: profile.characterId,
        characterName: profile.characterName,
        itemId: outfitItemId,
        category: "outfit",
        severity: "info",
        sinceEpisode: activeOutfit.activeFromEpisode,
        headlineKo: `${activeOutfit.activeFromEpisode}화~ 유지 복장(${activeOutfit.label}) 미확인`,
        actionHintKo: activeOutfit.details,
      });
    }
  }

  // 3. 활성 상처·흉터 — 누락 시 최고 우선순위(error) 경고
  for (const scar of activeScars) {
    const scarItemId = `scar:${scar.id}`;
    const scarChecked = checkedSet.has(scarItemId);
    const carried = episode > scar.sinceEpisode;
    const introduced = episode === scar.sinceEpisode;

    checklist.push({
      itemId: scarItemId,
      category: "scar",
      labelKo: `${scar.sinceEpisode}화 ${scar.locationKo}`,
      detailKo: `${scar.severity === "permanent" ? "영구 유지" : "임시 유지"} · ${scar.note}`,
      sinceEpisode: scar.sinceEpisode,
      critical: true,
      carriedFromPreviousEpisode: carried,
      introducedThisEpisode: introduced,
      checked: scarChecked,
    });

    if (!scarChecked) {
      warnings.push({
        id: `warn:scar:${profile.characterId}:${scar.id}:${episode}`,
        characterId: profile.characterId,
        characterName: profile.characterName,
        itemId: scarItemId,
        category: "scar",
        severity: "error",
        sinceEpisode: scar.sinceEpisode,
        headlineKo: `${scar.sinceEpisode}화 ${scar.locationKo} 누락 체크`,
        actionHintKo: carried
          ? `${scar.sinceEpisode}화에서 생긴 표식이 이전 화(${previousEpisode}화)부터 이어집니다. 좌우 반전 컷에서도 방향이 뒤집히지 않았는지 점검하세요.`
          : `이번 ${episode}화에서 새로 발생하는 상처·흉터입니다. 발생 직후 컷부터 일관되게 그려졌는지 확인하세요.`,
      });
    }
  }

  // 4. 핵심 소품 — 누락 시 주의(warn) 경고
  for (const prop of activeProps) {
    const propItemId = `prop:${prop.id}`;
    const propChecked = checkedSet.has(propItemId);
    const carried = episode > prop.sinceEpisode;

    checklist.push({
      itemId: propItemId,
      category: "prop",
      labelKo: `소품 · ${prop.label} (${handPreferenceLabelKo(prop.handPreference)})`,
      detailKo: `${prop.sinceEpisode}화부터 지참${prop.lostAtEpisode ? ` (${prop.lostAtEpisode}화까지)` : ""}`,
      sinceEpisode: prop.sinceEpisode,
      critical: true,
      carriedFromPreviousEpisode: carried,
      introducedThisEpisode: episode === prop.sinceEpisode,
      checked: propChecked,
    });

    if (!propChecked) {
      warnings.push({
        id: `warn:prop:${profile.characterId}:${prop.id}:${episode}`,
        characterId: profile.characterId,
        characterName: profile.characterName,
        itemId: propItemId,
        category: "prop",
        severity: "warn",
        sinceEpisode: prop.sinceEpisode,
        headlineKo: `${prop.sinceEpisode}화 핵심 소품(${prop.label}) 누락 체크`,
        actionHintKo: `주로 ${handPreferenceLabelKo(prop.handPreference)}에 착용/지참하는 소품입니다. 클로즈업·전신 컷에서 빠지지 않았는지 확인하세요.`,
      });
    }
  }

  // 5. 이번 화 또는 직전 화 상태 변화 이력 리마인더
  const recentEvents = profile.stateHistory.filter(
    (event) => event.episodeNumber === episode || event.episodeNumber === previousEpisode,
  );
  for (const event of recentEvents) {
    const eventItemId = `event:${event.id}`;
    const eventChecked = checkedSet.has(eventItemId);
    checklist.push({
      itemId: eventItemId,
      category: "status",
      labelKo: `${event.episodeNumber}화 상태 이력 · ${event.summaryKo}`,
      detailKo: event.detailKo,
      sinceEpisode: event.episodeNumber,
      critical: false,
      carriedFromPreviousEpisode: event.episodeNumber < episode,
      introducedThisEpisode: event.episodeNumber === episode,
      checked: eventChecked,
    });
  }

  // 중요도 순 정렬(error -> warn -> info)
  const severityRank: Record<ContinuityWarningSeverity, number> = { error: 0, warn: 1, info: 2 };
  warnings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const checkedCount = checklist.filter((item) => item.checked).length;
  const totalRequiredCount = checklist.length;
  const consistencyScore =
    totalRequiredCount === 0 ? 100 : Math.round((checkedCount / totalRequiredCount) * 100);

  return {
    characterId: profile.characterId,
    characterName: profile.characterName,
    currentEpisodeNumber: episode,
    previousEpisodeNumber: previousEpisode,
    activeOutfit,
    previousOutfit,
    activeScars,
    activeProps,
    checklist,
    warnings,
    checkedCount,
    totalRequiredCount,
    consistencyScore,
  };
}

/**
 * 전체 캐릭터에 대한 화수 작화 일관성 요약을 산출한다.
 */
export function evaluateSeriesContinuity(state: ContinuityBibleState): SeriesContinuitySummary {
  const evaluations = state.characters.map((profile) => {
    const key = continuityEpisodeCheckKey(profile.characterId, state.currentEpisodeNumber);
    const checked = state.checkedItemsByKey[key] ?? [];
    return evaluateCharacterContinuity(profile, state.currentEpisodeNumber, checked);
  });

  const allWarnings = evaluations.flatMap((ev) => ev.warnings);
  const errorCount = allWarnings.filter((w) => w.severity === "error").length;
  const warnCount = allWarnings.filter((w) => w.severity === "warn").length;
  const overallScore =
    evaluations.length === 0
      ? 100
      : Math.round(
          evaluations.reduce((sum, ev) => sum + ev.consistencyScore, 0) / evaluations.length,
        );

  return {
    episodeNumber: state.currentEpisodeNumber,
    characterEvaluations: evaluations,
    allWarnings,
    errorCount,
    warnCount,
    overallScore,
  };
}

function defaultProfileFromStoryCharacter(
  character: StudioStoryCharacter,
  index: number,
): CharacterContinuityProfile {
  if (index === 0) {
    return {
      characterId: character.id,
      characterName: character.name,
      roleLabel: "주인공",
      eyeColorLabel: "호박색 금안 (동공 하이라이트 좌상단 고정)",
      hairStyleAndColor: "흑발 숏컷 · 오른쪽 앞머리 5:5 가르마 · 귀 위 잔머리 2가닥",
      scarsAndMarks: [
        {
          id: `${character.id}-scar-cheek`,
          locationKo: "왼뺨 흉터",
          sinceEpisode: 12,
          severity: "permanent",
          note: "12화 옥상 결투에서 생긴 눈 밑 2cm 사선 흉터(거울 반전 주의)",
        },
      ],
      outfits: [
        {
          id: `${character.id}-outfit-winter`,
          label: character.defaultCostumeId || "동복 교복(네이비 블레이저 + 와인 넥타이)",
          activeFromEpisode: 1,
          activeUntilEpisode: 19,
          isDefault: true,
          details: "왼쪽 가슴 은색 배지, 소매 단추 2개, 안쪽 회색 조끼 고정",
        },
        {
          id: `${character.id}-outfit-summer`,
          label: "하복 셔츠 + 검은 가디건",
          activeFromEpisode: 20,
          isDefault: false,
          details: "20화 계절 전환 이후 착용, 소매 두 번 접어 올림",
        },
      ],
      signatureProps: [
        {
          id: `${character.id}-prop-watch`,
          label: "금 간 은빛 회중시계",
          sinceEpisode: 3,
          handPreference: "left",
          carriedByDefault: true,
        },
      ],
      stateHistory: [
        {
          id: `${character.id}-ev-12`,
          episodeNumber: 12,
          category: "scar",
          summaryKo: "왼뺨 사선 흉터 발생",
          detailKo: "옥상 전투 이후 13화부터 모든 근접 컷에 흉터 유지 필요",
        },
        {
          id: `${character.id}-ev-15`,
          episodeNumber: 15,
          category: "prop",
          summaryKo: "회중시계 유리 대각선 균열",
          detailKo: "클로즈업 컷에서 깨진 유리선 2줄 표현 유지",
        },
      ],
    };
  }

  return {
    characterId: character.id,
    characterName: character.name,
    roleLabel: "주요 인물",
    eyeColorLabel: "짙은 남색 눈동자 · 날카로운 눈꼬리",
    hairStyleAndColor: "애쉬 브라운 중단발 · 낮은 반묶음",
    scarsAndMarks: [
      {
        id: `${character.id}-scar-wrist`,
        locationKo: "오른쪽 손목 붕대",
        sinceEpisode: 9,
        resolvedEpisode: 16,
        severity: "temporary",
        note: "9화~16화 회복기 동안 흰 탄력 붕대 착용",
      },
    ],
    outfits: [
      {
        id: `${character.id}-outfit-default`,
        label: character.defaultCostumeId || "차콜 롱코트 + 검은 터틀넥",
        activeFromEpisode: 1,
        isDefault: true,
        details: "코트 깃 안쪽 체크 안감, 왼손 검지 은반지 고정",
      },
    ],
    signatureProps: [
      {
        id: `${character.id}-prop-glasses`,
        label: "무테 은색 안경",
        sinceEpisode: 1,
        handPreference: "right",
        carriedByDefault: true,
      },
    ],
    stateHistory: [
      {
        id: `${character.id}-ev-9`,
        episodeNumber: 9,
        category: "scar",
        summaryKo: "오른쪽 손목 부상(붕대)",
        detailKo: "16화 완치 전까지 손 클로즈업 컷에 붕대 필수",
      },
    ],
  };
}

/**
 * 프로젝트 캐릭터 목록으로 초기 연재 일관성 바이블을 생성하거나 기존 상태와 동기화한다.
 */
export function createStarterContinuityBible(
  projectId: string,
  storyCharacters?: readonly StudioStoryCharacter[],
): ContinuityBibleState {
  const source: readonly StudioStoryCharacter[] =
    storyCharacters && storyCharacters.length > 0
      ? storyCharacters
      : [
          {
            id: "char-lead-1",
            name: "서하진",
            aliases: ["하진"],
            defaultCostumeId: "동복 교복(네이비 블레이저 + 와인 넥타이)",
            defaultAppearanceId: null,
          },
          {
            id: "char-partner-2",
            name: "윤서아",
            aliases: ["서아"],
            defaultCostumeId: "차콜 롱코트 + 검은 터틀넥",
            defaultAppearanceId: null,
          },
        ];

  return {
    projectId,
    currentEpisodeNumber: 13,
    characters: source.map((char, index) => defaultProfileFromStoryCharacter(char, index)),
    checkedItemsByKey: {},
  };
}

/**
 * 호스트(StudioCharacterSheetPanel)에서 캐릭터가 추가·이름 변경되었을 때 기존 바이블에 병합한다.
 */
export function syncContinuityBibleCharacters(
  state: ContinuityBibleState,
  storyCharacters: readonly StudioStoryCharacter[],
): ContinuityBibleState {
  if (storyCharacters.length === 0) return state;
  const byId = new Map(state.characters.map((c) => [c.characterId, c] as const));
  let changed = false;

  const merged: CharacterContinuityProfile[] = [...state.characters];
  storyCharacters.forEach((storyChar, index) => {
    const existing = byId.get(storyChar.id);
    if (!existing) {
      merged.push(defaultProfileFromStoryCharacter(storyChar, index));
      changed = true;
    } else if (existing.characterName !== storyChar.name) {
      const idx = merged.findIndex((c) => c.characterId === storyChar.id);
      if (idx >= 0) {
        merged[idx] = { ...existing, characterName: storyChar.name };
        changed = true;
      }
    }
  });

  return changed ? { ...state, characters: merged } : state;
}

export function toggleContinuityCheckItem(
  state: ContinuityBibleState,
  characterId: string,
  itemId: string,
): ContinuityBibleState {
  const key = continuityEpisodeCheckKey(characterId, state.currentEpisodeNumber);
  const current = state.checkedItemsByKey[key] ?? [];
  const exists = current.includes(itemId);
  const next = exists ? current.filter((id) => id !== itemId) : [...current, itemId];
  return {
    ...state,
    checkedItemsByKey: {
      ...state.checkedItemsByKey,
      [key]: next,
    },
  };
}

export function addCharacterScar(
  state: ContinuityBibleState,
  characterId: string,
  scar: Omit<ContinuityScarItem, "id">,
): ContinuityBibleState {
  const id = `scar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const nextScar: ContinuityScarItem = { ...scar, id };
  const event: ContinuityStateEvent = {
    id: `ev-${id}`,
    episodeNumber: scar.sinceEpisode,
    category: "scar",
    summaryKo: `${scar.locationKo} 추가`,
    detailKo: scar.note || `${scar.sinceEpisode}화부터 유지`,
  };
  return {
    ...state,
    characters: state.characters.map((c) =>
      c.characterId === characterId
        ? {
            ...c,
            scarsAndMarks: [...c.scarsAndMarks, nextScar],
            stateHistory: [...c.stateHistory, event].sort(
              (a, b) => a.episodeNumber - b.episodeNumber,
            ),
          }
        : c,
    ),
  };
}

export function addCharacterProp(
  state: ContinuityBibleState,
  characterId: string,
  prop: Omit<ContinuityPropItem, "id">,
): ContinuityBibleState {
  const id = `prop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const nextProp: ContinuityPropItem = { ...prop, id };
  return {
    ...state,
    characters: state.characters.map((c) =>
      c.characterId === characterId
        ? { ...c, signatureProps: [...c.signatureProps, nextProp] }
        : c,
    ),
  };
}

export function addCharacterOutfit(
  state: ContinuityBibleState,
  characterId: string,
  outfit: Omit<ContinuityOutfitItem, "id">,
): ContinuityBibleState {
  const id = `outfit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const nextOutfit: ContinuityOutfitItem = { ...outfit, id };
  return {
    ...state,
    characters: state.characters.map((c) =>
      c.characterId === characterId ? { ...c, outfits: [...c.outfits, nextOutfit] } : c,
    ),
  };
}

export function updateCharacterVisualAnchors(
  state: ContinuityBibleState,
  characterId: string,
  patch: { readonly eyeColorLabel?: string; readonly hairStyleAndColor?: string },
): ContinuityBibleState {
  return {
    ...state,
    characters: state.characters.map((c) =>
      c.characterId === characterId
        ? {
            ...c,
            eyeColorLabel: patch.eyeColorLabel ?? c.eyeColorLabel,
            hairStyleAndColor: patch.hairStyleAndColor ?? c.hairStyleAndColor,
          }
        : c,
    ),
  };
}

export function formatContinuityChecksheetMarkdown(
  summary: SeriesContinuitySummary,
): string {
  const lines: string[] = [
    `# ${summary.episodeNumber}화 작화 일관성 체크시트 (일치율 ${summary.overallScore}%)`,
    `필수 누락 경고 ${summary.errorCount}건 · 주의 ${summary.warnCount}건`,
    "",
  ];
  for (const ev of summary.characterEvaluations) {
    lines.push(`## ${ev.characterName} (${ev.checkedCount}/${ev.totalRequiredCount} 확인)`);
    for (const item of ev.checklist) {
      lines.push(`- [${item.checked ? "x" : " "}] ${item.labelKo} — ${item.detailKo}`);
    }
    if (ev.warnings.length > 0) {
      lines.push("  경고:");
      for (const warning of ev.warnings) {
        lines.push(`  * [${warning.severity.toUpperCase()}] ${warning.headlineKo}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

const STORAGE_PREFIX = "toonstudio:continuity-bible:v1:";

export function loadContinuityBible(
  storage: Storage | null | undefined,
  projectId: string,
): ContinuityBibleState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(`${STORAGE_PREFIX}${projectId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Partial<ContinuityBibleState>;
    if (
      typeof candidate.projectId !== "string" ||
      typeof candidate.currentEpisodeNumber !== "number" ||
      !Array.isArray(candidate.characters)
    ) {
      return null;
    }
    return {
      projectId: candidate.projectId,
      currentEpisodeNumber: Math.max(1, Math.round(candidate.currentEpisodeNumber)),
      characters: candidate.characters,
      checkedItemsByKey:
        typeof candidate.checkedItemsByKey === "object" && candidate.checkedItemsByKey !== null
          ? candidate.checkedItemsByKey
          : {},
    };
  } catch {
    return null;
  }
}

export function saveContinuityBible(
  storage: Storage | null | undefined,
  state: ContinuityBibleState,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(`${STORAGE_PREFIX}${state.projectId}`, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
