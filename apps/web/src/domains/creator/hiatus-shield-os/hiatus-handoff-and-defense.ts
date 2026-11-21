/**
 * 10분 작화 통일 인계 키트(Style-Lock Continuity Handoff Kit),
 * 스마트 마이크로 슬라이스(25컷→8/8/9컷) 자동 분할,
 * 마감 18시간 이내 3단계 비상 연재 방어 플랜 엔진.
 */

import {
  STAGE_LABELS,
  clampNum,
  formatHiatusOklchCss,
  round1,
  round2,
  type ActiveCutSlice,
  type ArtBiblePaletteSwatch,
  type Bg3dCameraPreset,
  type BrushLineSpec,
  type DefenseScenarioCode,
  type EmergencyDefensePlanReport,
  type EmergencyDefenseScenario,
  type ForbiddenStyleRule,
  type MicroSliceAssignee,
  type MicroSlicePacket,
  type MicroSliceSplitResult,
  type OklchSample,
  type PipelineStageKey,
  type PreviousCutReference,
  type StyleLockHandoffKit,
  type StyleLockKitValidation,
} from "./hiatus-shield-types";

/** 3-A. 10분 작화 통일 인계 키트 필수 항목 완비 검증 */
export function validateStyleLockHandoffKit(
  kit: Omit<StyleLockHandoffKit, "validation">,
): StyleLockKitValidation {
  const missingSections: string[] = [];

  if (kit.artBiblePalette.length < 3) {
    missingSections.push("artBiblePalette");
  }
  const hasInvalidBrush = kit.brushLineSpecs.some(
    (spec) => spec.minPx <= 0 || spec.minPx > spec.targetPx || spec.targetPx > spec.maxPx,
  );
  if (kit.brushLineSpecs.length < 2 || hasInvalidBrush) {
    missingSections.push("brushLineSpecs");
  }
  if (kit.previousTwoCuts.length !== 2) {
    missingSections.push("previousTwoCuts");
  }
  const hasInvalidCam = kit.bg3dCameraPresets.some(
    (cam) => cam.focalLengthMm <= 0 || cam.fovDeg <= 10 || cam.fovDeg >= 140,
  );
  if (kit.bg3dCameraPresets.length < 1 || hasInvalidCam) {
    missingSections.push("bg3dCameraPresets");
  }
  const hasBlockerRule = kit.forbiddenChecklist.some((rule) => rule.severity === "blocker");
  if (kit.forbiddenChecklist.length < 3 || !hasBlockerRule) {
    missingSections.push("forbiddenChecklist");
  }

  const completenessPct = Math.round(((5 - missingSections.length) / 5) * 100);
  return {
    valid: missingSections.length === 0,
    completenessPct,
    missingSections,
  };
}

/** 3-B. 10분 작화 통일 인계 키트(Style-Lock Continuity Handoff Kit) 자동 패키징 */
export function buildStyleLockHandoffKit(params: {
  readonly episodeId: string;
  readonly sliceId: string;
  readonly stage: PipelineStageKey;
  readonly startCut: number;
  readonly endCut: number;
  readonly targetArtistId: string;
  readonly targetArtistName: string;
  readonly targetLineWidthPx: number;
  readonly nowIso: string;
}): StyleLockHandoffKit {
  const paletteRaw: readonly {
    readonly chipId: string;
    readonly roleKo: string;
    readonly roleEn: string;
    readonly oklch: OklchSample;
    readonly maxAllowedDeltaE: number;
  }[] = [
    {
      chipId: "chip-skin-key",
      roleKo: "주인공 피부 기준톤",
      roleEn: "Lead Skin Base",
      oklch: { l: 0.87, c: 0.05, h: 58 },
      maxAllowedDeltaE: 3.5,
    },
    {
      chipId: "chip-coat-night",
      roleKo: "야간 외투 대표색",
      roleEn: "Night Coat Signature",
      oklch: { l: 0.34, c: 0.08, h: 248 },
      maxAllowedDeltaE: 4.0,
    },
    {
      chipId: "chip-ambient-shadow",
      roleKo: "공통 그림자 곱하기 톤",
      roleEn: "Global Shadow Multiply",
      oklch: { l: 0.42, c: 0.09, h: 274 },
      maxAllowedDeltaE: 4.5,
    },
    {
      chipId: "chip-lantern-rim",
      roleKo: "가로등 림라이트 포인트",
      roleEn: "Streetlight Rim Accent",
      oklch: { l: 0.82, c: 0.14, h: 76 },
      maxAllowedDeltaE: 4.5,
    },
  ];

  const artBiblePalette: ArtBiblePaletteSwatch[] = paletteRaw.map((entry) => ({
    ...entry,
    cssOklch: formatHiatusOklchCss(entry.oklch),
  }));

  const targetPx = round1(clampNum(params.targetLineWidthPx, 1.2, 6.0));
  const brushLineSpecs: BrushLineSpec[] = [
    {
      specId: "brush-char-contour",
      purposeKo: "인물 외곽선 (주선)",
      purposeEn: "Character Outer Contour",
      brushName: "ToonStudio G-Pen Crisp v2",
      minPx: round1(Math.max(0.8, targetPx - 0.6)),
      targetPx,
      maxPx: round1(targetPx + 0.8),
      antiAlias: true,
      pressureCurve: "S-Curve 68% / 최소 필압 22%",
    },
    {
      specId: "brush-face-detail",
      purposeKo: "얼굴·눈동자·머리카락 세선",
      purposeEn: "Face / Eyes / Hair Detail",
      brushName: "ToonStudio Tapered Liner 1.4",
      minPx: round1(Math.max(0.6, targetPx * 0.45)),
      targetPx: round1(Math.max(0.9, targetPx * 0.62)),
      maxPx: round1(Math.max(1.2, targetPx * 0.85)),
      antiAlias: true,
      pressureCurve: "Linear Soft / 끝단 14% 테이퍼",
    },
    {
      specId: "brush-bg-prop",
      purposeKo: "배경·소품 경계선",
      purposeEn: "Background & Prop Edge",
      brushName: "Mono Ink Technical 1.2",
      minPx: 0.9,
      targetPx: 1.2,
      maxPx: 1.6,
      antiAlias: true,
      pressureCurve: "Fixed 90% (원근 일관성 고정)",
    },
  ];

  const prevCutA = params.startCut >= 3 ? params.startCut - 2 : 1;
  const prevCutB = params.startCut >= 3 ? params.startCut - 1 : 2;
  const isFallbackA = params.startCut <= 1;
  const isFallbackB = params.startCut <= 2;

  const lightingA: OklchSample = { l: 0.36, c: 0.08, h: 252 };
  const lightingB: OklchSample = { l: 0.44, c: 0.1, h: 238 };

  const previousTwoCuts: PreviousCutReference[] = [
    {
      cutIndex: prevCutA,
      isBoundaryFallback: isFallbackA,
      shotNoteKo: isFallbackA
        ? "회차 오프닝 기준컷 (좌측 상단 가로등 역광)"
        : `직전 연결컷 #${prevCutA} (바스트 샷 · 좌측 45도 림라이트)`,
      shotNoteEn: isFallbackA
        ? "Episode opening anchor cut (top-left streetlight rim)"
        : `Preceding cut #${prevCutA} (bust shot, 45° left rim light)`,
      lightingOklch: lightingA,
      lightingCssOklch: formatHiatusOklchCss(lightingA),
      continuityNoteKo: "주인공 왼쪽 옷깃 빗물 얼룩 유지, 왼손 편지 봉투 착용 상태 고정",
      continuityNoteEn: "Keep rain stain on left lapel and letter envelope in left hand",
      checksumRef: `ref-${params.episodeId}-cut-${String(prevCutA).padStart(3, "0")}`,
    },
    {
      cutIndex: prevCutB,
      isBoundaryFallback: isFallbackB,
      shotNoteKo: isFallbackB
        ? "오프닝 직후 컷 기준 (전신 3D 골목 소실점 일치)"
        : `직전 연결컷 #${prevCutB} (클로즈업 · 눈썹 그림자 OKLCH 고정)`,
      shotNoteEn: isFallbackB
        ? "Post-opening anchor cut (matches 3D alley vanishing point)"
        : `Preceding cut #${prevCutB} (close-up, brow shadow OKLCH locked)`,
      lightingOklch: lightingB,
      lightingCssOklch: formatHiatusOklchCss(lightingB),
      continuityNoteKo: "배경 안개 농도 35% 유지, 말풍선 꼬리 방향 우측 상단 통일",
      continuityNoteEn: "Maintain 35% alley fog density and top-right speech tail direction",
      checksumRef: `ref-${params.episodeId}-cut-${String(prevCutB).padStart(3, "0")}`,
    },
  ];

  const bg3dCameraPresets: Bg3dCameraPreset[] = [
    {
      presetId: "cam-alley-eyelevel",
      sceneNameKo: "비 내리는 구시가지 우체국 골목 (아이레벨)",
      sceneNameEn: "Rainy Old-Town Post Alley (Eye Level)",
      focalLengthMm: 35,
      fovDeg: 54,
      horizonRatio: 0.46,
      pitchDeg: -3,
      yawDeg: 18,
      lightingAzimuthDeg: 225,
    },
    {
      presetId: "cam-office-lowangle",
      sceneNameKo: "편집국 로비 긴장 컷 (로우 앵글)",
      sceneNameEn: "Editorial Lobby Tension Shot (Low Angle)",
      focalLengthMm: 28,
      fovDeg: 65,
      horizonRatio: 0.34,
      pitchDeg: 9,
      yawDeg: -14,
      lightingAzimuthDeg: 140,
    },
  ];

  const forbiddenChecklist: ForbiddenStyleRule[] = [
    {
      itemId: "rule-no-deltae-drift",
      severity: "blocker",
      ruleKo: "아트 바이블 대표 팔레트 기준 OKLCH ΔE 4.5 초과 임의 색변조 금지",
      ruleEn: "No color drift exceeding OKLCH ΔE 4.5 from Art Bible swatches",
      checked: false,
    },
    {
      itemId: "rule-no-brush-swap",
      severity: "blocker",
      ruleKo: `주선 굵기(${targetPx}px ±0.8px) 이탈 및 연필·수채 질감 브러시 임의 교체 금지`,
      ruleEn: `No swapping away from ${targetPx}px (±0.8px) crisp pen or adding pencil texture`,
      checked: false,
    },
    {
      itemId: "rule-no-nc-assets",
      severity: "blocker",
      ruleKo: "상업 불가(NC/GPL/미검증) 외부 3D 소품·브러시·폰트 혼입 절대 금지",
      ruleEn: "Zero NC/GPL/unverified third-party 3D props, brushes, or fonts",
      checked: false,
    },
    {
      itemId: "rule-camera-horizon",
      severity: "warn",
      ruleKo: "3D 배경 카메라 프리셋 소실점(Horizon Ratio) 임의 회전 금지",
      ruleEn: "Do not alter 3D background camera preset horizon ratio",
      checked: false,
    },
    {
      itemId: "rule-mobile-readability",
      severity: "warn",
      ruleKo: "375px 모바일 세로 뷰 기준 말풍선 최소 가독 크기(11px 환산) 미만 축소 금지",
      ruleEn: "Keep bubble text readable (>= 11px equivalent on 375px mobile width)",
      checked: false,
    },
  ];

  const draft: Omit<StyleLockHandoffKit, "validation"> = {
    kitId: `kit-${params.episodeId}-${params.sliceId}-${params.targetArtistId}`,
    generatedAtIso: params.nowIso,
    episodeId: params.episodeId,
    sliceId: params.sliceId,
    stage: params.stage,
    cutRange: { startCut: params.startCut, endCut: params.endCut },
    targetArtistId: params.targetArtistId,
    targetArtistName: params.targetArtistName,
    onboardingBudgetMinutes: 10,
    artBiblePalette,
    brushLineSpecs,
    previousTwoCuts,
    bg3dCameraPresets,
    forbiddenChecklist,
  };

  return {
    ...draft,
    validation: validateStyleLockHandoffKit(draft),
  };
}

/** 3-C. 인계 키트 JSON 직렬화 */
export function serializeHandoffKitToJson(kit: StyleLockHandoffKit): string {
  return JSON.stringify(kit, null, 2);
}

/** 3-D. 10분 투입 체크리스트 텍스트 포맷 */
export function formatHandoffKitChecklistText(kit: StyleLockHandoffKit): string {
  return [
    `[10분 작화 통일 인계 키트] ${kit.kitId}`,
    `- 회차/구간: ${kit.episodeId} · ${kit.cutRange.startCut}~${kit.cutRange.endCut}컷 (${STAGE_LABELS[kit.stage].ko})`,
    `- 투입 대타: ${kit.targetArtistName} (목표 온보딩 ${kit.onboardingBudgetMinutes}분)`,
    "",
    "1) 아트 바이블 OKLCH 팔레트:",
    ...kit.artBiblePalette.map(
      (chip) => `   - ${chip.roleKo}: ${chip.cssOklch} (허용 ΔE <= ${chip.maxAllowedDeltaE})`,
    ),
    "",
    "2) 브러시·선폭 규격(px):",
    ...kit.brushLineSpecs.map(
      (b) => `   - ${b.purposeKo}: ${b.brushName} (${b.minPx}~${b.maxPx}px, 권장 ${b.targetPx}px)`,
    ),
    "",
    "3) 직전 2컷 연속성 레퍼런스:",
    ...kit.previousTwoCuts.map(
      (ref) => `   - 컷 #${ref.cutIndex} [${ref.checksumRef}]: ${ref.continuityNoteKo} (${ref.lightingCssOklch})`,
    ),
    "",
    "4) 3D 배경 카메라 프리셋:",
    ...kit.bg3dCameraPresets.map(
      (cam) =>
        `   - ${cam.sceneNameKo}: ${cam.focalLengthMm}mm / FOV ${cam.fovDeg}° / 수평선 ${Math.round(cam.horizonRatio * 100)}%`,
    ),
    "",
    "5) 금지 표현 체크리스트:",
    ...kit.forbiddenChecklist.map(
      (rule) => `   [${rule.checked ? "x" : " "}] (${rule.severity.toUpperCase()}) ${rule.ruleKo}`,
    ),
  ].join("\n");
}

/**
 * 4-A. 스마트 마이크로 슬라이스 자동 재분배
 * 예: 25컷 병목 슬라이스 → 3인 병렬 작업용 8 / 8 / 9컷 무중복 자동 분할.
 */
export function splitBottleneckSliceIntoMicroSlices(params: {
  readonly slices: readonly ActiveCutSlice[];
  readonly sliceId: string;
  readonly assignees: readonly MicroSliceAssignee[];
  readonly nowIso: string;
}): MicroSliceSplitResult {
  const target = params.slices.find((s) => s.sliceId === params.sliceId);
  if (!target || params.assignees.length === 0) {
    return {
      ok: false,
      parentSliceId: params.sliceId,
      microSlices: [],
      updatedSlices: params.slices,
      integrityCheck: {
        totalOriginalCuts: 0,
        totalSplitCuts: 0,
        overlapCount: 0,
        gapCount: 0,
        preserved: false,
      },
      singleWorkerHours: 0,
      parallelCompletionHours: 0,
      parallelSpeedupFactor: 1,
    };
  }

  const totalCuts = Math.max(0, target.endCut - target.startCut + 1);
  const maxEpisodeCut = params.slices.reduce((acc, s) => Math.max(acc, s.endCut), target.endCut);
  const workerCount = Math.min(params.assignees.length, Math.max(1, totalCuts));
  const activeAssignees = params.assignees.slice(0, workerCount);

  const baseSize = Math.floor(totalCuts / workerCount);
  const remainder = totalCuts % workerCount;
  // 뒤쪽 슬라이스에 +1컷 배정 → 25컷 / 3인 = [8, 8, 9]
  const partitionSizes = activeAssignees.map((_, idx) =>
    idx >= workerCount - remainder ? baseSize + 1 : baseSize,
  );

  const microSlices: MicroSlicePacket[] = [];
  const replacementActiveSlices: ActiveCutSlice[] = [];
  let cursor = target.startCut;

  for (let i = 0; i < activeAssignees.length; i += 1) {
    const assignee = activeAssignees[i];
    const size = partitionSizes[i] ?? 0;
    if (!assignee || size <= 0) continue;
    const startCut = cursor;
    const endCut = cursor + size - 1;
    cursor = endCut + 1;

    const microSliceId = `${target.sliceId}-micro-${String(i + 1).padStart(2, "0")}`;
    const safeSpeed = Math.max(0.5, assignee.cutsPerHour);
    const estimatedHours = round1(size / safeSpeed);

    microSlices.push({
      microSliceId,
      parentSliceId: target.sliceId,
      stage: target.stage,
      startCut,
      endCut,
      cutCount: size,
      previousCutContextIndex: startCut > 1 ? startCut - 1 : null,
      nextCutContextIndex: endCut < maxEpisodeCut ? endCut + 1 : null,
      assigneeId: assignee.assigneeId,
      assigneeName: assignee.assigneeName,
      roleTagKo: assignee.roleTagKo,
      roleTagEn: assignee.roleTagEn,
      estimatedHours,
    });

    replacementActiveSlices.push({
      sliceId: microSliceId,
      episodeId: target.episodeId,
      stage: target.stage,
      startCut,
      endCut,
      completedCount: 0,
      holderId: assignee.assigneeId,
      holderName: assignee.assigneeName,
      holderRegion: assignee.region,
      lockStatus: "micro_split",
      leaseToken: `micro-${target.episodeId}-${microSliceId}-${assignee.assigneeId}`,
      leaseExpiresAtIso: new Date(Date.parse(params.nowIso) + 8 * 3600 * 1000).toISOString(),
      handoffKitId: target.handoffKitId,
      parentSliceId: target.sliceId,
    });
  }

  const seen = new Set<number>();
  let overlapCount = 0;
  for (const ms of microSlices) {
    for (let cut = ms.startCut; cut <= ms.endCut; cut += 1) {
      if (seen.has(cut)) overlapCount += 1;
      seen.add(cut);
    }
  }
  let gapCount = 0;
  for (let cut = target.startCut; cut <= target.endCut; cut += 1) {
    if (!seen.has(cut)) gapCount += 1;
  }
  const totalSplitCuts = microSlices.reduce((sum, ms) => sum + ms.cutCount, 0);
  const preserved =
    totalSplitCuts === totalCuts && overlapCount === 0 && gapCount === 0 && seen.size === totalCuts;

  const updatedSlices: ActiveCutSlice[] = [];
  for (const slice of params.slices) {
    if (slice.sliceId === target.sliceId) {
      updatedSlices.push(...replacementActiveSlices);
    } else {
      updatedSlices.push(slice);
    }
  }

  const singleWorkerSpeed = Math.max(0.5, activeAssignees[0]?.cutsPerHour ?? 1.5);
  const singleWorkerHours = round1(totalCuts / singleWorkerSpeed);
  const parallelCompletionHours = microSlices.reduce(
    (maxH, ms) => Math.max(maxH, ms.estimatedHours),
    0,
  );
  const parallelSpeedupFactor =
    parallelCompletionHours > 0 ? round2(singleWorkerHours / parallelCompletionHours) : 1;

  return {
    ok: preserved,
    parentSliceId: target.sliceId,
    microSlices,
    updatedSlices,
    integrityCheck: {
      totalOriginalCuts: totalCuts,
      totalSplitCuts,
      overlapCount,
      gapCount,
      preserved,
    },
    singleWorkerHours,
    parallelCompletionHours,
    parallelSpeedupFactor,
  };
}

/** 4-B. 마감 18시간 이내 극한 위기 감지 및 3단계 연재 방어 시나리오 (A/B/C) 제안 */
export function generateEmergencyDefenseScenarios(params: {
  readonly seriesTitle: string;
  readonly episodeNumber: number;
  readonly hoursUntilDeadline: number;
  readonly remainingCuts: number;
  readonly targetTotalCuts: number;
  readonly completedCuts: number;
  readonly availableTeamCutsPerHour: number;
  readonly standbyBoostCutsPerHour: number;
}): EmergencyDefensePlanReport {
  const safeDeadline = Math.max(1, params.hoursUntilDeadline);
  const isExtremeCrisis = safeDeadline <= 18;
  const safeRemaining = Math.max(0, params.remainingCuts);
  const safeTeamSpeed = Math.max(0.4, params.availableTeamCutsPerHour);
  const boostedSpeed = safeTeamSpeed + Math.max(0, params.standbyBoostCutsPerHour);

  const planAHours = round1(safeRemaining / Math.max(0.5, boostedSpeed));
  const planAFeasible = planAHours <= safeDeadline;

  const planBMainCuts = 55;
  const planBBonusCuts = 5;
  const planBRemainingMain = Math.max(0, planBMainCuts - params.completedCuts);
  const planBHours = round1(planBRemainingMain / Math.max(0.5, boostedSpeed) + 1.5);
  const planBFeasible = planBHours <= safeDeadline;

  const partOneTargetCuts = Math.max(
    Math.min(params.completedCuts + Math.floor(safeDeadline * safeTeamSpeed * 0.65), 40),
    Math.min(35, params.targetTotalCuts),
  );
  const partOneRemaining = Math.max(0, partOneTargetCuts - params.completedCuts);
  const partTwoDeferredCuts = Math.max(0, params.targetTotalCuts - partOneTargetCuts);
  const planCHours = round1(partOneRemaining / Math.max(0.5, boostedSpeed) + 0.5);
  const planCFeasible = planCHours <= safeDeadline;

  const recommendedCode: DefenseScenarioCode = planAFeasible
    ? "A"
    : planBFeasible
      ? "B"
      : "C";

  const noticeAKo = `[정상 연재 안내] 《${params.seriesTitle}》 ${params.episodeNumber}화는 예정 시각에 정규 분량(${params.targetTotalCuts}컷)으로 정상 공개됩니다.`;
  const noticeAEn = `[On-Time Notice] "${params.seriesTitle}" Episode ${params.episodeNumber} will publish on schedule at full length (${params.targetTotalCuts} cuts).`;

  const noticeBKo = `안녕하세요, 《${params.seriesTitle}》 제작팀입니다.\n이번 ${params.episodeNumber}화는 핵심 전개 55컷 본편과 함께 독자분들이 요청하신 캐릭터 설정화·제작 후기 5컷(총 60컷)을 묶어 정시에 공개합니다. 다음 ${params.episodeNumber + 1}화는 기존 정규 분량으로 찾아뵙겠습니다. 기다려 주셔서 감사합니다.`;
  const noticeBEn = `Hello from the "${params.seriesTitle}" team.\nEpisode ${params.episodeNumber} publishes on time with 55 main story cuts plus 5 exclusive character sheet & behind-the-scenes bonus cuts (60 cuts total). Episode ${params.episodeNumber + 1} returns to full standard length. Thank you for reading.`;

  const noticeCKo = `안녕하세요, 《${params.seriesTitle}》 제작팀입니다.\n갑작스러운 제작진 건강 이슈로 완성도를 타협하지 않기 위해 이번 ${params.episodeNumber}화를 상편(${partOneTargetCuts}컷)·하편(${partTwoDeferredCuts}컷)으로 나누어 공개합니다.\n- 상편(${partOneTargetCuts}컷): 예정 연재 시각 정시 공개\n- 하편(${partTwoDeferredCuts}컷): 36시간 내 추가 무료 합본 업데이트\n무단 휴재 없이 약속을 지키겠습니다. 양해 부탁드립니다.`;
  const noticeCEn = `Hello from the "${params.seriesTitle}" team.\nDue to a sudden crew health issue, we are releasing Episode ${params.episodeNumber} in two parts to preserve art quality without going on hiatus:\n- Part 1 (${partOneTargetCuts} cuts): Published on time\n- Part 2 (${partTwoDeferredCuts} cuts): Merged update within 36 hours\nThank you for your patience and support.`;

  const scenarios: EmergencyDefenseScenario[] = [
    {
      code: "A",
      id: "plan-a-micro-sos-full",
      titleKo: "A안: 마이크로 컷 재분배 + 긴급 대타 정규 완주",
      titleEn: "Plan A: Micro-Slice Split + Standby Full Run",
      badgeKo: "정규 분량 100%",
      badgeEn: "100% Full Length",
      recommended: recommendedCode === "A",
      feasibleBeforeDeadline: planAFeasible,
      mainCutsCount: params.targetTotalCuts,
      bonusCutsCount: 0,
      partTwoDeferredCuts: 0,
      projectedCompletionHours: planAHours,
      hiatusPrevented: true,
      readerTrustScore: 98,
      actionStepsKo: [
        "병목 25컷 슬라이스를 잔여 팀원+대타 3인(8/8/9컷)으로 병렬 분할",
        "10분 작화 통일 인계 키트(OKLCH·선폭·카메라 프리셋) 즉시 전송",
        `예상 완료 ${planAHours}시간 (마감 잔여 ${safeDeadline}시간)`,
      ],
      actionStepsEn: [
        "Split 25-cut bottleneck into 8/8/9 parallel micro-slices with standby relief",
        "Dispatch 10-min Style-Lock kit (OKLCH, stroke px, 3D camera presets)",
        `Projected ${planAHours}h vs ${safeDeadline}h left`,
      ],
      readerNoticeDraftKo: noticeAKo,
      readerNoticeDraftEn: noticeAEn,
    },
    {
      code: "B",
      id: "plan-b-condensed-bonus-bundle",
      titleKo: "B안: 55컷 본편 + 특별 후기·설정화 5컷 합본",
      titleEn: "Plan B: 55 Main Cuts + 5 Bonus Art Sheet Cuts",
      badgeKo: "총 60컷 방어",
      badgeEn: "60-Cut Shield",
      recommended: recommendedCode === "B",
      feasibleBeforeDeadline: planBFeasible,
      mainCutsCount: planBMainCuts,
      bonusCutsCount: planBBonusCuts,
      partTwoDeferredCuts: 0,
      projectedCompletionHours: planBHours,
      hiatusPrevented: true,
      readerTrustScore: 89,
      actionStepsKo: [
        "전개 압축으로 핵심 55컷 본편 마무리선 고정",
        "기제작 아트 바이블 설정화·컬러 스크립트·작가 후기 5컷 합본 조립(총 60컷)",
        "플랫폼 최소 분량 규정 충족 및 무단 휴재 0% 달성",
      ],
      actionStepsEn: [
        "Tighten pacing to lock 55 core story cuts",
        "Append 5 pre-built character sheet & studio note cuts (60 total)",
        "Meet platform minimum cut contract with zero hiatus",
      ],
      readerNoticeDraftKo: noticeBKo,
      readerNoticeDraftEn: noticeBEn,
    },
    {
      code: "C",
      id: "plan-c-part1-part2-split-notice",
      titleKo: "C안: 상/하 분할 업로드 + 독자 사전 공지 자동 생성",
      titleEn: "Plan C: Part 1 / Part 2 Split + Auto Reader Notice",
      badgeKo: "무단 휴재 차단",
      badgeEn: "Zero Silent Hiatus",
      recommended: recommendedCode === "C",
      feasibleBeforeDeadline: planCFeasible,
      mainCutsCount: partOneTargetCuts,
      bonusCutsCount: 0,
      partTwoDeferredCuts,
      projectedCompletionHours: planCHours,
      hiatusPrevented: true,
      readerTrustScore: 81,
      actionStepsKo: [
        `완료 컷 중심 상편 ${partOneTargetCuts}컷 정시 납품(마감 전 ${planCHours}시간 소요)`,
        `하편 ${partTwoDeferredCuts}컷 36시간 내 추가 병합 일정 플랫폼 담당 PD 사전 공유`,
        "아래 독자 사전 공지 초안을 회차 상단·커뮤니티에 동시 게시",
      ],
      actionStepsEn: [
        `Deliver Part 1 (${partOneTargetCuts} cuts) on time (${planCHours}h needed)`,
        `Coordinate Part 2 (${partTwoDeferredCuts} cuts) 36h merge with platform editor`,
        "Publish auto-generated reader notice draft ahead of release",
      ],
      readerNoticeDraftKo: noticeCKo,
      readerNoticeDraftEn: noticeCEn,
    },
  ];

  return {
    isExtremeCrisis,
    hoursUntilDeadline: safeDeadline,
    recommendedCode,
    scenarios,
  };
}
