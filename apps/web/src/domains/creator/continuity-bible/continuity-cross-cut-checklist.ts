/**
 * 컨티뉴이티 바이블 컷 간 연속성 대조 체크리스트 & 수정 컷 점프 요약 엔진 (₩0 로컬 순수 모듈).
 *
 * 캐릭터별 활성 복장·핵심 소품·상처/흉터 스펙을 컷 단위 관측 데이터와 대조해
 * 불일치(mismatch)·미확인(unverified) 체크리스트와 수정이 필요한 컷 점프 요약을 산출한다.
 * - browser storage(localStorage/sessionStorage/indexedDB) 직접 호출 0건.
 */

export type CrossCutTraitCategory = "outfit" | "prop" | "scar";
export type CrossCutHandPreference = "left" | "right" | "either";
export type CrossCutScarSeverity = "permanent" | "temporary" | "healed";
export type CrossCutCheckStatus = "matched" | "mismatch" | "unverified";
export type CrossCutCheckSeverity = "error" | "warn" | "info";

export interface CrossCutScarSpec {
  readonly id: string;
  readonly locationKo: string;
  readonly sinceEpisode: number;
  readonly resolvedEpisode?: number;
  readonly severity: CrossCutScarSeverity;
  readonly note: string;
}

export interface CrossCutOutfitSpec {
  readonly id: string;
  readonly label: string;
  readonly activeFromEpisode: number;
  readonly activeUntilEpisode?: number;
  readonly isDefault: boolean;
  readonly details: string;
}

export interface CrossCutPropSpec {
  readonly id: string;
  readonly label: string;
  readonly sinceEpisode: number;
  readonly lostAtEpisode?: number;
  readonly handPreference: CrossCutHandPreference;
  readonly carriedByDefault: boolean;
}

export interface CrossCutCharacterSpec {
  readonly characterId: string;
  readonly characterName: string;
  readonly scarsAndMarks: readonly CrossCutScarSpec[];
  readonly outfits: readonly CrossCutOutfitSpec[];
  readonly signatureProps: readonly CrossCutPropSpec[];
}

export interface CrossCutBibleSnapshot {
  readonly currentEpisodeNumber: number;
  readonly characters: readonly CrossCutCharacterSpec[];
}

export interface CutCharacterObservation {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly sceneLabelKo?: string;
  readonly characterId: string;
  /** 관측된 복장 ID. undefined면 복장 미확인 상태 */
  readonly observedOutfitId?: string | null;
  /** 관측된 복장명 텍스트(ID 없이 라벨로만 기록된 컷 지원) */
  readonly observedOutfitLabel?: string | null;
  /** 해당 컷에서 확인된 소품 ID 목록. undefined면 소품 미확인 상태 */
  readonly observedPropIds?: readonly string[];
  /** 소품별 관측 착용 손(좌/우 반전 불일치 감지) */
  readonly propHandOverrides?: Readonly<Record<string, CrossCutHandPreference>>;
  /** 해당 컷에서 확인된 상처·흉터 ID 목록. undefined면 상처 미확인 상태 */
  readonly observedScarIds?: readonly string[];
  /** 좌우 반전 컷 등에서 방향이 뒤집힌 상처 ID 목록 */
  readonly mirroredScarIds?: readonly string[];
  /** 원경·후면 컷 등 프레임 밖 가림으로 대조에서 제외할 카테고리 */
  readonly occludedCategories?: readonly CrossCutTraitCategory[];
  /** 사용자가 수동 대조 완료 체크한 항목 키(`${cutId}:${characterId}:${category}:${traitId}`) */
  readonly verifiedCheckKeys?: readonly string[];
}

export interface CrossCutChecklistItem {
  readonly checkKey: string;
  readonly cutId: string;
  readonly cutNumber: number;
  readonly sceneLabelKo: string;
  readonly characterId: string;
  readonly characterName: string;
  readonly category: CrossCutTraitCategory;
  readonly traitId: string;
  readonly expectedLabelKo: string;
  readonly observedLabelKo: string | null;
  readonly status: CrossCutCheckStatus;
  readonly severity: CrossCutCheckSeverity;
  readonly divergesFromPreviousCut: boolean;
  readonly previousCutNumber: number | null;
  readonly reasonKo: string;
  readonly fixHintKo: string;
}

export interface RevisionCutJumpTarget {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly sceneLabelKo: string;
  readonly mismatchCount: number;
  readonly unverifiedCount: number;
  readonly highestSeverity: CrossCutCheckSeverity;
  readonly affectedCharacterNames: readonly string[];
  readonly affectedCategories: readonly CrossCutTraitCategory[];
  readonly firstIssueReasonKo: string;
  readonly jumpSummaryKo: string;
}

export interface CrossCutContinuityReport {
  readonly episodeNumber: number;
  readonly inspectedCutCount: number;
  readonly totalCheckCount: number;
  readonly matchedCount: number;
  readonly mismatchCount: number;
  readonly unverifiedCount: number;
  readonly passRatePct: number;
  readonly items: readonly CrossCutChecklistItem[];
  readonly actionableItems: readonly CrossCutChecklistItem[];
  readonly jumpTargets: readonly RevisionCutJumpTarget[];
  readonly summaryLineKo: string;
}

const CATEGORY_LABEL_KO: Readonly<Record<CrossCutTraitCategory, string>> = {
  outfit: "복장",
  prop: "소품",
  scar: "상처",
};

const STATUS_RANK: Readonly<Record<CrossCutCheckStatus, number>> = {
  mismatch: 0,
  unverified: 1,
  matched: 2,
};

const SEVERITY_RANK: Readonly<Record<CrossCutCheckSeverity, number>> = {
  error: 0,
  warn: 1,
  info: 2,
};

function isSpecActiveInEpisode(
  sinceEpisode: number,
  untilEpisode: number | undefined,
  episodeNumber: number,
): boolean {
  if (episodeNumber < sinceEpisode) return false;
  if (untilEpisode !== undefined && episodeNumber > untilEpisode) return false;
  return true;
}

function resolveEpisodeOutfit(
  outfits: readonly CrossCutOutfitSpec[],
  episodeNumber: number,
): CrossCutOutfitSpec | null {
  const matching = outfits.filter((item) =>
    isSpecActiveInEpisode(item.activeFromEpisode, item.activeUntilEpisode, episodeNumber),
  );
  if (matching.length === 0) {
    return outfits.find((item) => item.isDefault) ?? outfits[0] ?? null;
  }
  return [...matching].sort((a, b) => b.activeFromEpisode - a.activeFromEpisode)[0] ?? null;
}

function handLabelKo(hand: CrossCutHandPreference): string {
  if (hand === "left") return "왼손";
  if (hand === "right") return "오른손";
  return "양손";
}

export function buildCrossCutCheckKey(
  cutId: string,
  characterId: string,
  category: CrossCutTraitCategory,
  traitId: string,
): string {
  return `${cutId}:${characterId}:${category}:${traitId}`;
}

/**
 * 캐릭터 복장·소품·상처 항목을 컷 단위로 대조해 불일치·미확인 체크리스트와
 * 수정 컷 점프 요약을 산출한다.
 */
export function evaluateCrossCutContinuity(
  bible: CrossCutBibleSnapshot,
  observations: readonly CutCharacterObservation[],
): CrossCutContinuityReport {
  const episodeNumber = Math.max(1, Math.round(bible.currentEpisodeNumber));
  const characterById = new Map(bible.characters.map((c) => [c.characterId, c] as const));

  const sortedObservations = [...observations].sort((a, b) => {
    if (a.cutNumber !== b.cutNumber) return a.cutNumber - b.cutNumber;
    const cutCmp = a.cutId.localeCompare(b.cutId);
    if (cutCmp !== 0) return cutCmp;
    return a.characterId.localeCompare(b.characterId);
  });

  const inspectedCuts = new Set<string>();
  const items: CrossCutChecklistItem[] = [];
  // key: `${characterId}:${category}:${traitId}` -> 직전 관측 컷 번호 & 상태
  const lastSeenByTrait = new Map<
    string,
    { readonly cutNumber: number; readonly status: CrossCutCheckStatus; readonly observedKey: string }
  >();

  for (const obs of sortedObservations) {
    const profile = characterById.get(obs.characterId);
    if (!profile) continue;

    inspectedCuts.add(obs.cutId);
    const sceneLabelKo = obs.sceneLabelKo?.trim() || `컷 #${obs.cutNumber}`;
    const occluded = new Set(obs.occludedCategories ?? []);
    const verifiedSet = new Set(obs.verifiedCheckKeys ?? []);

    // 1) 복장(outfit) 대조
    const activeOutfit = resolveEpisodeOutfit(profile.outfits, episodeNumber);
    if (activeOutfit && !occluded.has("outfit")) {
      const checkKey = buildCrossCutCheckKey(obs.cutId, profile.characterId, "outfit", activeOutfit.id);
      const traitKey = `${profile.characterId}:outfit:${activeOutfit.id}`;
      const prev = lastSeenByTrait.get(traitKey) ?? null;

      let status: CrossCutCheckStatus;
      let severity: CrossCutCheckSeverity;
      let observedLabelKo: string | null = null;
      let reasonKo: string;
      let fixHintKo: string;
      let observedSignature = "unverified";

      if (verifiedSet.has(checkKey)) {
        status = "matched";
        severity = "info";
        observedLabelKo = activeOutfit.label;
        observedSignature = activeOutfit.id;
        reasonKo = `컷 #${obs.cutNumber} 복장 일치 확인`;
        fixHintKo = "수정 불필요";
      } else if (obs.observedOutfitId !== undefined || obs.observedOutfitLabel !== undefined) {
        const obsId = obs.observedOutfitId ?? null;
        const obsLabel = obs.observedOutfitLabel?.trim() || null;
        const matchedOutfit = obsId
          ? profile.outfits.find((o) => o.id === obsId) ?? null
          : null;
        observedLabelKo = obsLabel ?? matchedOutfit?.label ?? obsId ?? "미착용/불명";
        observedSignature = obsId ?? observedLabelKo;

        const isMatch =
          obsId === activeOutfit.id ||
          (obsLabel !== null && obsLabel === activeOutfit.label.trim());

        if (isMatch) {
          status = "matched";
          severity = "info";
          reasonKo = `기준 복장(${activeOutfit.label})과 일치`;
          fixHintKo = "수정 불필요";
        } else {
          status = "mismatch";
          severity = "error";
          reasonKo = `복장 불일치 — 기준 '${activeOutfit.label}', 관측 '${observedLabelKo}'`;
          fixHintKo = `컷 #${obs.cutNumber}에서 ${profile.characterName} 복장을 '${activeOutfit.label}'(${activeOutfit.details}) 기준으로 수정하세요.`;
        }
      } else {
        status = "unverified";
        severity = "warn";
        reasonKo = `컷 #${obs.cutNumber} 복장('${activeOutfit.label}') 대조 미확인`;
        fixHintKo = `컷 #${obs.cutNumber}로 이동해 '${activeOutfit.label}' 착용 여부를 확인하세요.`;
      }

      const divergesFromPreviousCut =
        prev !== null &&
        status === "mismatch" &&
        (prev.status === "matched" || prev.observedKey !== observedSignature);

      const annotatedReasonKo =
        divergesFromPreviousCut && prev !== null
          ? `직전 등장 컷 #${prev.cutNumber} 대비 ${reasonKo}`
          : reasonKo;

      items.push({
        checkKey,
        cutId: obs.cutId,
        cutNumber: obs.cutNumber,
        sceneLabelKo,
        characterId: profile.characterId,
        characterName: profile.characterName,
        category: "outfit",
        traitId: activeOutfit.id,
        expectedLabelKo: activeOutfit.label,
        observedLabelKo,
        status,
        severity,
        divergesFromPreviousCut,
        previousCutNumber: prev?.cutNumber ?? null,
        reasonKo: annotatedReasonKo,
        fixHintKo,
      });

      if (status !== "unverified") {
        lastSeenByTrait.set(traitKey, {
          cutNumber: obs.cutNumber,
          status,
          observedKey: observedSignature,
        });
      }
    }

    // 2) 핵심 소품(prop) 대조
    const activeProps = profile.signatureProps.filter(
      (prop) =>
        prop.carriedByDefault &&
        isSpecActiveInEpisode(prop.sinceEpisode, prop.lostAtEpisode, episodeNumber),
    );

    if (!occluded.has("prop")) {
      for (const prop of activeProps) {
        const checkKey = buildCrossCutCheckKey(obs.cutId, profile.characterId, "prop", prop.id);
        const traitKey = `${profile.characterId}:prop:${prop.id}`;
        const prev = lastSeenByTrait.get(traitKey) ?? null;

        let status: CrossCutCheckStatus;
        let severity: CrossCutCheckSeverity;
        let observedLabelKo: string | null = null;
        let reasonKo: string;
        let fixHintKo: string;
        let observedSignature = "unverified";

        if (verifiedSet.has(checkKey)) {
          status = "matched";
          severity = "info";
          observedLabelKo = `${prop.label} (${handLabelKo(prop.handPreference)})`;
          observedSignature = `present:${prop.handPreference}`;
          reasonKo = `컷 #${obs.cutNumber} 소품 일치 확인`;
          fixHintKo = "수정 불필요";
        } else if (obs.observedPropIds !== undefined) {
          const isPresent = obs.observedPropIds.includes(prop.id);
          const observedHand = obs.propHandOverrides?.[prop.id];
          const handMismatch =
            isPresent &&
            prop.handPreference !== "either" &&
            observedHand !== undefined &&
            observedHand !== prop.handPreference;

          if (!isPresent) {
            status = "mismatch";
            severity = "warn";
            observedLabelKo = "누락";
            observedSignature = "missing";
            reasonKo = `핵심 소품 '${prop.label}' 누락`;
            fixHintKo = `컷 #${obs.cutNumber}에서 ${profile.characterName}의 ${handLabelKo(prop.handPreference)}에 '${prop.label}'을 추가하세요.`;
          } else if (handMismatch) {
            status = "mismatch";
            severity = "warn";
            observedLabelKo = `${prop.label} (${handLabelKo(observedHand)} · 반전)`;
            observedSignature = `hand:${observedHand}`;
            reasonKo = `소품 '${prop.label}' 착용 방향 불일치 (기준 ${handLabelKo(prop.handPreference)} → 관측 ${handLabelKo(observedHand)})`;
            fixHintKo = `컷 #${obs.cutNumber}의 '${prop.label}' 위치를 ${handLabelKo(prop.handPreference)} 기준으로 보정하세요.`;
          } else {
            status = "matched";
            severity = "info";
            observedLabelKo = `${prop.label} (${handLabelKo(observedHand ?? prop.handPreference)})`;
            observedSignature = `present:${observedHand ?? prop.handPreference}`;
            reasonKo = `소품 '${prop.label}' 일치`;
            fixHintKo = "수정 불필요";
          }
        } else {
          status = "unverified";
          severity = "info";
          reasonKo = `컷 #${obs.cutNumber} 소품 '${prop.label}' 대조 미확인`;
          fixHintKo = `컷 #${obs.cutNumber}에서 '${prop.label}'(${handLabelKo(prop.handPreference)}) 지참 여부를 확인하세요.`;
        }

        const divergesFromPreviousCut =
          prev !== null &&
          status === "mismatch" &&
          (prev.status === "matched" || prev.observedKey !== observedSignature);

        const annotatedReasonKo =
          divergesFromPreviousCut && prev !== null
            ? `직전 등장 컷 #${prev.cutNumber} 대비 ${reasonKo}`
            : reasonKo;

        items.push({
          checkKey,
          cutId: obs.cutId,
          cutNumber: obs.cutNumber,
          sceneLabelKo,
          characterId: profile.characterId,
          characterName: profile.characterName,
          category: "prop",
          traitId: prop.id,
          expectedLabelKo: `${prop.label} (${handLabelKo(prop.handPreference)})`,
          observedLabelKo,
          status,
          severity,
          divergesFromPreviousCut,
          previousCutNumber: prev?.cutNumber ?? null,
          reasonKo: annotatedReasonKo,
          fixHintKo,
        });

        if (status !== "unverified") {
          lastSeenByTrait.set(traitKey, {
            cutNumber: obs.cutNumber,
            status,
            observedKey: observedSignature,
          });
        }
      }
    }

    // 3) 상처·흉터(scar) 대조
    const activeScars = profile.scarsAndMarks.filter(
      (scar) =>
        scar.severity !== "healed" &&
        isSpecActiveInEpisode(scar.sinceEpisode, scar.resolvedEpisode, episodeNumber),
    );

    if (!occluded.has("scar")) {
      for (const scar of activeScars) {
        const checkKey = buildCrossCutCheckKey(obs.cutId, profile.characterId, "scar", scar.id);
        const traitKey = `${profile.characterId}:scar:${scar.id}`;
        const prev = lastSeenByTrait.get(traitKey) ?? null;

        let status: CrossCutCheckStatus;
        let severity: CrossCutCheckSeverity;
        let observedLabelKo: string | null = null;
        let reasonKo: string;
        let fixHintKo: string;
        let observedSignature = "unverified";

        if (verifiedSet.has(checkKey)) {
          status = "matched";
          severity = "info";
          observedLabelKo = scar.locationKo;
          observedSignature = "present";
          reasonKo = `컷 #${obs.cutNumber} 상처·흉터 일치 확인`;
          fixHintKo = "수정 불필요";
        } else if (obs.observedScarIds !== undefined) {
          const isPresent = obs.observedScarIds.includes(scar.id);
          const isMirrored = obs.mirroredScarIds?.includes(scar.id) ?? false;

          if (!isPresent) {
            status = "mismatch";
            severity = "error";
            observedLabelKo = "누락";
            observedSignature = "missing";
            reasonKo = `${scar.sinceEpisode}화 '${scar.locationKo}' 누락`;
            fixHintKo = `컷 #${obs.cutNumber}에 '${scar.locationKo}'(${scar.note})를 복원하세요.`;
          } else if (isMirrored) {
            status = "mismatch";
            severity = "error";
            observedLabelKo = `${scar.locationKo} (좌우 반전)`;
            observedSignature = "mirrored";
            reasonKo = `${scar.sinceEpisode}화 '${scar.locationKo}' 좌우 반전 불일치`;
            fixHintKo = `컷 #${obs.cutNumber}의 '${scar.locationKo}' 방향을 원래 위치로 되돌리세요.`;
          } else {
            status = "matched";
            severity = "info";
            observedLabelKo = scar.locationKo;
            observedSignature = "present";
            reasonKo = `'${scar.locationKo}' 유지 확인`;
            fixHintKo = "수정 불필요";
          }
        } else {
          status = "unverified";
          severity = "warn";
          reasonKo = `컷 #${obs.cutNumber} '${scar.locationKo}' 대조 미확인`;
          fixHintKo = `컷 #${obs.cutNumber}에서 '${scar.locationKo}' 누락·반전 여부를 점검하세요.`;
        }

        const divergesFromPreviousCut =
          prev !== null &&
          status === "mismatch" &&
          (prev.status === "matched" || prev.observedKey !== observedSignature);

        const annotatedReasonKo =
          divergesFromPreviousCut && prev !== null
            ? `직전 등장 컷 #${prev.cutNumber} 대비 ${reasonKo}`
            : reasonKo;

        items.push({
          checkKey,
          cutId: obs.cutId,
          cutNumber: obs.cutNumber,
          sceneLabelKo,
          characterId: profile.characterId,
          characterName: profile.characterName,
          category: "scar",
          traitId: scar.id,
          expectedLabelKo: `${scar.sinceEpisode}화 ${scar.locationKo}`,
          observedLabelKo,
          status,
          severity,
          divergesFromPreviousCut,
          previousCutNumber: prev?.cutNumber ?? null,
          reasonKo: annotatedReasonKo,
          fixHintKo,
        });

        if (status !== "unverified") {
          lastSeenByTrait.set(traitKey, {
            cutNumber: obs.cutNumber,
            status,
            observedKey: observedSignature,
          });
        }
      }
    }
  }

  // 정렬: 불일치 → 미확인 → 일치, 심각도 순, 컷 번호 오름차순
  items.sort((a, b) => {
    if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) {
      return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    }
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    }
    if (a.cutNumber !== b.cutNumber) return a.cutNumber - b.cutNumber;
    return a.checkKey.localeCompare(b.checkKey);
  });

  const actionableItems = items.filter((item) => item.status !== "matched");

  // 수정 컷 점프 요약 생성 (컷 번호 오름차순)
  const cutGroupMap = new Map<string, CrossCutChecklistItem[]>();
  for (const item of actionableItems) {
    const existing = cutGroupMap.get(item.cutId);
    if (existing) existing.push(item);
    else cutGroupMap.set(item.cutId, [item]);
  }

  const jumpTargets: RevisionCutJumpTarget[] = [];
  for (const [cutId, cutItems] of cutGroupMap.entries()) {
    const first = cutItems[0];
    if (!first) continue;
    const mismatchCount = cutItems.filter((i) => i.status === "mismatch").length;
    const unverifiedCount = cutItems.filter((i) => i.status === "unverified").length;

    let highestSeverity: CrossCutCheckSeverity = "info";
    for (const item of cutItems) {
      if (SEVERITY_RANK[item.severity] < SEVERITY_RANK[highestSeverity]) {
        highestSeverity = item.severity;
      }
    }

    const affectedCharacterNames = Array.from(new Set(cutItems.map((i) => i.characterName)));
    const affectedCategories = Array.from(new Set(cutItems.map((i) => i.category)));
    const categorySummary = affectedCategories.map((c) => CATEGORY_LABEL_KO[c]).join("·");

    const countParts: string[] = [];
    if (mismatchCount > 0) countParts.push(`불일치 ${mismatchCount}건`);
    if (unverifiedCount > 0) countParts.push(`미확인 ${unverifiedCount}건`);

    jumpTargets.push({
      cutId,
      cutNumber: first.cutNumber,
      sceneLabelKo: first.sceneLabelKo,
      mismatchCount,
      unverifiedCount,
      highestSeverity,
      affectedCharacterNames,
      affectedCategories,
      firstIssueReasonKo: first.reasonKo,
      jumpSummaryKo: `컷 #${first.cutNumber} (${first.sceneLabelKo}) · ${countParts.join(" / ")} (${categorySummary}) · ${affectedCharacterNames.join(", ")}`,
    });
  }

  jumpTargets.sort((a, b) => a.cutNumber - b.cutNumber);

  const matchedCount = items.filter((i) => i.status === "matched").length;
  const mismatchCount = items.filter((i) => i.status === "mismatch").length;
  const unverifiedCount = items.filter((i) => i.status === "unverified").length;
  const totalCheckCount = items.length;
  const passRatePct =
    totalCheckCount === 0 ? 100 : Math.round((matchedCount / totalCheckCount) * 100);

  const summaryLineKo =
    actionableItems.length === 0
      ? `${episodeNumber}화 ${inspectedCuts.size}개 컷 대조 완료 · 전 항목 일치 (${passRatePct}%)`
      : `${episodeNumber}화 ${inspectedCuts.size}개 컷 대조 · 불일치 ${mismatchCount}건 · 미확인 ${unverifiedCount}건 · 수정 점프 대상 ${jumpTargets.length}컷`;

  return {
    episodeNumber,
    inspectedCutCount: inspectedCuts.size,
    totalCheckCount,
    matchedCount,
    mismatchCount,
    unverifiedCount,
    passRatePct,
    items,
    actionableItems,
    jumpTargets,
    summaryLineKo,
  };
}

/**
 * 패널 초기 진입 시 현재 화수의 캐릭터 스펙을 반영한 컷 단위 샘플 관측 목록을 생성한다.
 * (정상 기준 컷 + 상처 누락/소품 방향 반전 컷 + 복장 불일치 컷 + 미확인 클로즈업 컷 포함)
 */
export function createStarterCutObservations(
  bible: CrossCutBibleSnapshot,
): readonly CutCharacterObservation[] {
  const episode = Math.max(1, Math.round(bible.currentEpisodeNumber));
  const lead = bible.characters[0];
  if (!lead) return [];

  const leadOutfit = resolveEpisodeOutfit(lead.outfits, episode);
  const leadAltOutfit = lead.outfits.find((o) => o.id !== leadOutfit?.id) ?? null;
  const leadActiveProps = lead.signatureProps.filter(
    (p) => p.carriedByDefault && isSpecActiveInEpisode(p.sinceEpisode, p.lostAtEpisode, episode),
  );
  const leadActiveScars = lead.scarsAndMarks.filter(
    (s) => s.severity !== "healed" && isSpecActiveInEpisode(s.sinceEpisode, s.resolvedEpisode, episode),
  );

  const firstProp = leadActiveProps[0];
  const oppositeHand: CrossCutHandPreference =
    firstProp?.handPreference === "left" ? "right" : "left";

  const observations: CutCharacterObservation[] = [
    // 컷 #3: 기준 일치 컷
    {
      cutId: `ep-${episode}-cut-003`,
      cutNumber: 3,
      sceneLabelKo: "등교 복도 진입 샷",
      characterId: lead.characterId,
      observedOutfitId: leadOutfit?.id ?? null,
      observedPropIds: leadActiveProps.map((p) => p.id),
      observedScarIds: leadActiveScars.map((s) => s.id),
    },
    // 컷 #14: 직전 컷 #3 대비 상처 누락 + 소품 좌우 반전 불일치
    {
      cutId: `ep-${episode}-cut-014`,
      cutNumber: 14,
      sceneLabelKo: "옥상 대치 클로즈업",
      characterId: lead.characterId,
      observedOutfitId: leadOutfit?.id ?? null,
      observedPropIds: leadActiveProps.map((p) => p.id),
      propHandOverrides: firstProp ? { [firstProp.id]: oppositeHand } : undefined,
      observedScarIds: [],
    },
    // 컷 #22: 복장 불일치 컷
    {
      cutId: `ep-${episode}-cut-022`,
      cutNumber: 22,
      sceneLabelKo: "계단 추격전 미디엄 샷",
      characterId: lead.characterId,
      observedOutfitId: leadAltOutfit?.id ?? null,
      observedOutfitLabel: leadAltOutfit?.label ?? "임의 평상복(후드집업)",
      observedPropIds: leadActiveProps.map((p) => p.id),
      observedScarIds: leadActiveScars.map((s) => s.id),
    },
    // 컷 #31: 대조 미확인 컷
    {
      cutId: `ep-${episode}-cut-031`,
      cutNumber: 31,
      sceneLabelKo: "엔딩 반전 리액션 컷",
      characterId: lead.characterId,
    },
  ];

  const partner = bible.characters[1];
  if (partner) {
    const partnerOutfit = resolveEpisodeOutfit(partner.outfits, episode);
    const partnerProps = partner.signatureProps.filter(
      (p) => p.carriedByDefault && isSpecActiveInEpisode(p.sinceEpisode, p.lostAtEpisode, episode),
    );
    const partnerScars = partner.scarsAndMarks.filter(
      (s) => s.severity !== "healed" && isSpecActiveInEpisode(s.sinceEpisode, s.resolvedEpisode, episode),
    );
    observations.push({
      cutId: `ep-${episode}-cut-027`,
      cutNumber: 27,
      sceneLabelKo: "복도 대화 투샷",
      characterId: partner.characterId,
      observedOutfitId: partnerOutfit?.id ?? null,
      observedPropIds: partnerProps.map((p) => p.id),
      observedScarIds: partnerScars.length > 0 ? [] : [],
    });
  }

  return observations;
}

/**
 * 특정 컷 체크 항목을 바이블 기준으로 수정 완료(일치) 반영한다 (불변 반환).
 */
export function markCrossCutCheckResolved(
  observations: readonly CutCharacterObservation[],
  item: CrossCutChecklistItem,
): readonly CutCharacterObservation[] {
  return observations.map((obs) => {
    if (obs.cutId !== item.cutId || obs.characterId !== item.characterId) {
      return obs;
    }
    const existingVerified = obs.verifiedCheckKeys ?? [];
    if (existingVerified.includes(item.checkKey)) return obs;
    return {
      ...obs,
      verifiedCheckKeys: [...existingVerified, item.checkKey],
    };
  });
}

/**
 * 수정 컷 점프 요약을 클립보드/리뷰용 간결한 한글 텍스트로 포맷한다.
 */
export function formatCrossCutJumpSummaryText(report: CrossCutContinuityReport): string {
  const lines: string[] = [
    `[${report.episodeNumber}화 컷 간 연속성 대조 요약]`,
    report.summaryLineKo,
  ];
  if (report.jumpTargets.length === 0) {
    lines.push("- 수정이 필요한 컷이 없습니다.");
    return lines.join("\n");
  }
  lines.push("");
  lines.push("수정 컷 점프 목록:");
  for (const target of report.jumpTargets) {
    lines.push(`- ${target.jumpSummaryKo} → ${target.firstIssueReasonKo}`);
  }
  return lines.join("\n");
}
