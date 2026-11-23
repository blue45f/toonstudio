/**
 * 양방향 IP 트랜스포머 및 게임 에셋/비주얼 노벨 변환 엔진.
 * 6방향 변환 계획(`buildCrossMediaTransformPlan`)과 3단계 LOD·4/8방향 스프라이트 아틀라스·
 * Ink/Yarn/Unity Localization 대사 JSON·Rights BOM 상업 라이선스 감사(`buildGameAssetExportManifest`)를 수행한다.
 */

import {
  buildPipelineStagesForDirection,
  CROSS_MEDIA_DIRECTION_CATALOG,
  DEFAULT_IP_RIGHTS_BOM,
  GAME_ENGINE_PROFILES,
  type CrossMediaDirectionMeta,
  type CrossMediaTransformDirection,
  type DialogueExportFormat,
  type GameAssetLicenseScope,
  type GameAssetRightsEntry,
  type GameEngineProfile,
  type GameEngineTarget,
  type TransformPipelineStage,
} from "./ip-game-transformer-catalog";

export {
  CROSS_MEDIA_DIRECTION_CATALOG,
  DEFAULT_IP_RIGHTS_BOM,
  GAME_ENGINE_PROFILES,
  type CrossMediaDirectionMeta,
  type CrossMediaTransformDirection,
  type DialogueExportFormat,
  type GameAssetLicenseScope,
  type GameAssetRightsEntry,
  type GameEngineProfile,
  type GameEngineTarget,
  type TransformPipelineStage,
};

export interface GameAssetLodTier {
  readonly tier: "LOD0-High" | "LOD1-Mid" | "LOD2-Low";
  readonly labelKo: string;
  readonly triangleCount: number;
  readonly textureSizePx: 2048 | 1024 | 512;
  readonly screenCoverageThreshold: number;
  readonly maxDrawCalls: number;
  readonly fileSuffix: string;
  readonly targetDeviceKo: string;
}

export interface SpriteAtlasSpec {
  readonly directions: 4 | 8;
  readonly directionOrder: readonly string[];
  readonly frameWidthPx: number;
  readonly frameHeightPx: number;
  readonly framesPerClip: number;
  readonly clipCount: number;
  readonly totalFrames: number;
  readonly columns: number;
  readonly rows: number;
  readonly atlasWidthPx: number;
  readonly atlasHeightPx: number;
  readonly paddingPx: number;
  readonly pivot: { readonly x: number; readonly y: number };
  readonly estimatedVramMb: number;
}

export interface DialogueLocalizationBundle {
  readonly format: DialogueExportFormat;
  readonly formatLabelKo: string;
  readonly fileName: string;
  readonly locales: readonly string[];
  readonly entryCount: number;
  readonly samplePayloadJson: string;
}

export interface GameAssetRightsAuditEntry {
  readonly entryId: string;
  readonly assetTitle: string;
  readonly reasonKo: string;
}

export interface GameAssetRightsAudit {
  readonly commercialSafe: boolean;
  readonly status: "approved" | "review-required" | "blocked";
  readonly checkedCount: number;
  readonly blockedEntries: readonly GameAssetRightsAuditEntry[];
  readonly attributionCredits: readonly string[];
  readonly summaryKo: string;
}

export interface GameAssetExportInput {
  readonly assetId: string;
  readonly assetName: string;
  readonly targetEngine: GameEngineTarget;
  readonly baseTriangleCount?: number;
  readonly spriteDirections?: 4 | 8;
  readonly animationClipCount?: number;
  readonly dialogueFormat?: DialogueExportFormat;
  readonly locales?: readonly string[];
  readonly rightsBom: readonly GameAssetRightsEntry[];
}

export interface GameAssetExportManifest {
  readonly manifestVersion: "1.0.0";
  readonly assetId: string;
  readonly assetName: string;
  readonly engineProfile: GameEngineProfile;
  readonly lodTiers: readonly [GameAssetLodTier, GameAssetLodTier, GameAssetLodTier];
  readonly spriteAtlasSpec: SpriteAtlasSpec;
  readonly dialogueBundle: DialogueLocalizationBundle;
  readonly rightsBomAudit: GameAssetRightsAudit;
  readonly exportFiles: readonly string[];
}

export interface VisualNovelPlayableGraph {
  readonly sceneCount: number;
  readonly branchCount: number;
  readonly trackedVariables: readonly string[];
  readonly standingExpressionSlots: readonly string[];
  readonly runtimeEntryHtml: string;
  readonly dialogueFormat: DialogueExportFormat;
}

export interface CrossMediaTransformInput {
  readonly projectTitle: string;
  readonly direction: CrossMediaTransformDirection;
  readonly sourceEpisodeCount?: number;
  readonly panelCountPerEpisode?: number;
  readonly characterCount?: number;
  readonly targetGameEngine?: GameEngineTarget;
  readonly spriteDirections?: 4 | 8;
  readonly dialogueFormat?: DialogueExportFormat;
  readonly localizationLocales?: readonly string[];
  readonly rightsBom?: readonly GameAssetRightsEntry[];
}

export interface CrossMediaTransformPlan {
  readonly projectTitle: string;
  readonly direction: CrossMediaTransformDirection;
  readonly meta: CrossMediaDirectionMeta;
  readonly sourceEpisodeCount: number;
  readonly panelCountTotal: number;
  readonly characterCount: number;
  readonly targetGameEngine: GameEngineTarget;
  readonly stages: readonly TransformPipelineStage[];
  readonly deliverables: readonly string[];
  readonly continuityChecks: readonly string[];
  readonly estimatedManualMinutes: number;
  readonly estimatedPipelineMinutes: number;
  readonly estimatedMinutesSaved: number;
  readonly commercialReadiness: "ready" | "review-needed" | "blocked";
  readonly commercialReadinessSummaryKo: string;
  readonly visualNovelGraph: VisualNovelPlayableGraph | null;
  readonly gameManifest: GameAssetExportManifest | null;
}

const DIRECTION_4_ORDER: readonly string[] = ["S", "W", "N", "E"];
const DIRECTION_8_ORDER: readonly string[] = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"];

const FALLBACK_DIRECTION_META: CrossMediaDirectionMeta = {
  direction: "webtoon-to-novel",
  labelKo: "웹툰 → 웹소설",
  shortBadgeKo: "컷→산문",
  sourceMediumKo: "웹툰 컷·말풍선",
  targetMediumKo: "연재 웹소설 회차",
  summaryKo: "컷별 대사·행동·장면 전환 비트를 추출해 연재 회차 초고와 장면 지문으로 재구성합니다.",
  spritePath: "/assets/studio/vibrant-sprites/emblem-community.webp",
  primaryDeliverableKo: "회차별 마크다운 원고 · 화자별 대사 로그 · 감정선 요약",
};

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function nextPowerOfTwo(value: number): number {
  let size = 256;
  while (size < value && size < 8192) {
    size *= 2;
  }
  return size;
}

function sanitizeSlug(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return cleaned || "toonstudio-ip";
}

function buildDialogueSamplePayload(
  format: DialogueExportFormat,
  assetName: string,
  locales: readonly string[],
): DialogueLocalizationBundle {
  const slug = sanitizeSlug(assetName);
  const safeLocales = locales.length > 0 ? locales : ["ko-KR", "en-US"];

  if (format === "ink") {
    const payload = {
      inkVersion: 21,
      root: [
        ["^", `${assetName} — 첫 만남 장면`, "\n", "ev", { "f()": "check_affection" }, "/ev", "done"],
        "done",
      ],
      listDefs: {},
      locales: safeLocales,
      lines: [
        { id: `${slug}_line_01`, speaker: "주인공", text: "비 그치기 전에 옥상에서 다시 만나자." },
        { id: `${slug}_line_02`, speaker: "파트너", text: "약속 지킬 거지? 다음 선택이 결말을 바꿔." },
      ],
    };
    return {
      format,
      formatLabelKo: "Ink Narrative JSON",
      fileName: `${slug}.ink.json`,
      locales: safeLocales,
      entryCount: payload.lines.length * safeLocales.length,
      samplePayloadJson: JSON.stringify(payload, null, 2),
    };
  }

  if (format === "yarn") {
    const payload = {
      yarnFormatVersion: "2.4",
      project: assetName,
      locales: safeLocales,
      nodes: [
        {
          title: `${slug}_intro`,
          tags: ["webtoon-cut-01", "choice-hub"],
          lines: [
            { id: "line:001", speaker: "주인공", text: "지도가 가리킨 탑 꼭대기에 도착했어." },
            { id: "line:002", speaker: "파트너", text: "왼쪽 문으로 갈까, 바로 지붕을 탈까?" },
          ],
          choices: [
            { label: "왼쪽 계단으로 잠입", targetNode: `${slug}_stealth`, flagDelta: { trust: 1 } },
            { label: "옥상 정면 돌파", targetNode: `${slug}_action`, flagDelta: { courage: 1 } },
          ],
        },
      ],
    };
    return {
      format,
      formatLabelKo: "Yarn Spinner JSON",
      fileName: `${slug}.yarn.json`,
      locales: safeLocales,
      entryCount: 4 * safeLocales.length,
      samplePayloadJson: JSON.stringify(payload, null, 2),
    };
  }

  const localeEntries: Record<string, Record<string, string>> = {};
  for (const locale of safeLocales) {
    localeEntries[locale] = {
      [`${slug}.ep01.cut01`]: locale.startsWith("ko")
        ? "지금부터 선택하는 컷이 결말을 바꿉니다."
        : "The panel you choose next shifts the ending.",
      [`${slug}.ep01.cut02`]: locale.startsWith("ko")
        ? "동료와 합류해 숨겨진 아틀리에로 이동한다."
        : "Regroup with your partner and head to the hidden atelier.",
    };
  }
  const payload = {
    schema: "unity.localization.stringtable/v1",
    tableCollectionName: `${slug}_DialogueTable`,
    locales: safeLocales,
    tables: localeEntries,
  };
  return {
    format,
    formatLabelKo: "Unity Localization StringTable JSON",
    fileName: `${slug}.unity-localization.json`,
    locales: safeLocales,
    entryCount: 2 * safeLocales.length,
    samplePayloadJson: JSON.stringify(payload, null, 2),
  };
}

function auditGameRightsBom(entries: readonly GameAssetRightsEntry[]): GameAssetRightsAudit {
  if (entries.length === 0) {
    return {
      commercialSafe: false,
      status: "blocked",
      checkedCount: 0,
      blockedEntries: [
        {
          entryId: "bom-empty",
          assetTitle: "권리 BOM 미등록",
          reasonKo: "상업 게임 출고 전 최소 1건 이상의 에셋 권리 증빙(Rights BOM)이 필요합니다.",
        },
      ],
      attributionCredits: [],
      summaryKo: "권리 BOM이 비어 있어 상업 게임 패키징이 차단되었습니다.",
    };
  }

  const blockedEntries: GameAssetRightsAuditEntry[] = [];
  const attributionCredits: string[] = [];

  for (const entry of entries) {
    if (entry.licenseScope !== "commercial-game-ok") {
      const scopeReason =
        entry.licenseScope === "editorial-only"
          ? "웹툰 연재 전용 라이선스라 게임 바이너리 재배포가 허용되지 않습니다."
          : entry.licenseScope === "non-commercial"
            ? "비상업 전용 라이선스라 유료 게임 출고가 차단됩니다."
            : "라이선스 정보가 누락되어 권리 증빙이 필요합니다.";
      blockedEntries.push({ entryId: entry.id, assetTitle: entry.assetTitle, reasonKo: scopeReason });
    } else if (!entry.redistributableInBinary) {
      blockedEntries.push({
        entryId: entry.id,
        assetTitle: entry.assetTitle,
        reasonKo: "게임 실행 파일/패키지 내 에셋 재배포 권한이 비활성화되어 있습니다.",
      });
    }

    if (entry.attributionRequired) {
      attributionCredits.push(`${entry.assetTitle} — ${entry.authorName}`);
    }
  }

  if (blockedEntries.length > 0) {
    return {
      commercialSafe: false,
      status: "blocked",
      checkedCount: entries.length,
      blockedEntries,
      attributionCredits,
      summaryKo: `차단 항목 ${blockedEntries.length}건 해결 후 상업 게임 패키징이 가능합니다.`,
    };
  }

  if (attributionCredits.length > 0) {
    return {
      commercialSafe: true,
      status: "review-required",
      checkedCount: entries.length,
      blockedEntries: [],
      attributionCredits,
      summaryKo: `전 항목(${entries.length}건) 상업 출고 가능 · 엔딩 크레딧 표기 ${attributionCredits.length}건 자동 생성됨.`,
    };
  }

  return {
    commercialSafe: true,
    status: "approved",
    checkedCount: entries.length,
    blockedEntries: [],
    attributionCredits: [],
    summaryKo: `전 항목(${entries.length}건) 상업 게임 바이너리 출고 승인 완료.`,
  };
}

/**
 * 게임 엔진별 3단계 LOD·4/8방향 2D 스프라이트 아틀라스·대사 로컬라이제이션 JSON·Rights BOM 검증 매니페스트를 생성한다.
 */
export function buildGameAssetExportManifest(input: GameAssetExportInput): GameAssetExportManifest {
  const engineProfile = GAME_ENGINE_PROFILES[input.targetEngine];
  const baseTris = clampInt(input.baseTriangleCount, 24000, 400, 250000);
  const spriteDirections: 4 | 8 = input.spriteDirections === 4 ? 4 : 8;
  const clipCount = clampInt(input.animationClipCount, 6, 1, 24);
  const framesPerClip = 6;
  const totalFrames = spriteDirections * clipCount * framesPerClip;
  const frameWidthPx = input.targetEngine === "phaser" ? 192 : 256;
  const frameHeightPx = input.targetEngine === "phaser" ? 192 : 256;
  const paddingPx = 4;
  const columns = Math.ceil(Math.sqrt(totalFrames));
  const rows = Math.ceil(totalFrames / columns);
  const atlasWidthPx = nextPowerOfTwo(columns * (frameWidthPx + paddingPx));
  const atlasHeightPx = nextPowerOfTwo(rows * (frameHeightPx + paddingPx));
  const estimatedVramMb = Number(((atlasWidthPx * atlasHeightPx * 4) / (1024 * 1024)).toFixed(2));
  const slug = sanitizeSlug(input.assetName || input.assetId);

  const lodTiers: readonly [GameAssetLodTier, GameAssetLodTier, GameAssetLodTier] = [
    {
      tier: "LOD0-High",
      labelKo: "LOD0 하이폴리 (컷신·근접)",
      triangleCount: baseTris,
      textureSizePx: 2048,
      screenCoverageThreshold: 0.45,
      maxDrawCalls: 4,
      fileSuffix: `${slug}_LOD0.glb`,
      targetDeviceKo: "데스크톱·콘솔·근접 대화 씬",
    },
    {
      tier: "LOD1-Mid",
      labelKo: "LOD1 표준 (인게임 주력)",
      triangleCount: Math.max(300, Math.round(baseTris * 0.45)),
      textureSizePx: 1024,
      screenCoverageThreshold: 0.18,
      maxDrawCalls: 2,
      fileSuffix: `${slug}_LOD1.glb`,
      targetDeviceKo: "노트북·태블릿·일반 필드",
    },
    {
      tier: "LOD2-Low",
      labelKo: "LOD2 경량 (원경·군중·모바일)",
      triangleCount: Math.max(150, Math.round(baseTris * 0.18)),
      textureSizePx: 512,
      screenCoverageThreshold: 0.05,
      maxDrawCalls: 1,
      fileSuffix: `${slug}_LOD2.glb`,
      targetDeviceKo: "모바일·웹 WebGL·군중 인스턴싱",
    },
  ];

  const spriteAtlasSpec: SpriteAtlasSpec = {
    directions: spriteDirections,
    directionOrder: spriteDirections === 4 ? DIRECTION_4_ORDER : DIRECTION_8_ORDER,
    frameWidthPx,
    frameHeightPx,
    framesPerClip,
    clipCount,
    totalFrames,
    columns,
    rows,
    atlasWidthPx,
    atlasHeightPx,
    paddingPx,
    pivot: { x: 0.5, y: 0.9 },
    estimatedVramMb,
  };

  const dialogueFormat = input.dialogueFormat ?? engineProfile.recommendedDialogueFormat;
  const dialogueBundle = buildDialogueSamplePayload(
    dialogueFormat,
    input.assetName || input.assetId,
    input.locales ?? ["ko-KR", "en-US", "ja-JP"],
  );
  const rightsBomAudit = auditGameRightsBom(input.rightsBom);

  const exportFiles = [
    ...lodTiers.map((lod) => lod.fileSuffix),
    `${slug}_atlas_${spriteDirections}dir.webp`,
    `${slug}_atlas_${spriteDirections}dir.json`,
    dialogueBundle.fileName,
    `${slug}_rights_bom_certificate.json`,
  ];

  return {
    manifestVersion: "1.0.0",
    assetId: input.assetId.trim() || slug,
    assetName: input.assetName.trim() || "이름 없는 에셋",
    engineProfile,
    lodTiers,
    spriteAtlasSpec,
    dialogueBundle,
    rightsBomAudit,
    exportFiles,
  };
}

/**
 * 6방향 양방향 IP 변환 파이프라인 실행 계획과 예상 절감 시간·상업 출고 준비도를 계산한다.
 */
export function buildCrossMediaTransformPlan(input: CrossMediaTransformInput): CrossMediaTransformPlan {
  const meta =
    CROSS_MEDIA_DIRECTION_CATALOG.find((item) => item.direction === input.direction) ??
    FALLBACK_DIRECTION_META;
  const projectTitle = input.projectTitle.trim() || "신작 IP 프로젝트";
  const sourceEpisodeCount = clampInt(input.sourceEpisodeCount, 5, 1, 200);
  const panelCountPerEpisode = clampInt(input.panelCountPerEpisode, 60, 8, 180);
  const characterCount = clampInt(input.characterCount, 4, 1, 40);
  const panelCountTotal = sourceEpisodeCount * panelCountPerEpisode;
  const targetGameEngine: GameEngineTarget = input.targetGameEngine ?? "unity";
  const engineProfile = GAME_ENGINE_PROFILES[targetGameEngine];
  const rightsBom = input.rightsBom ?? DEFAULT_IP_RIGHTS_BOM;

  const needsGameManifest =
    input.direction === "webtoon-to-game-assets" ||
    input.direction === "webtoon-to-visual-novel-playable";

  const gameManifest = needsGameManifest
    ? buildGameAssetExportManifest({
        assetId: sanitizeSlug(projectTitle),
        assetName: projectTitle,
        targetEngine: targetGameEngine,
        baseTriangleCount: 24000,
        spriteDirections: input.spriteDirections ?? 8,
        animationClipCount: Math.max(4, Math.min(12, characterCount * 2)),
        dialogueFormat: input.dialogueFormat ?? engineProfile.recommendedDialogueFormat,
        locales: input.localizationLocales ?? ["ko-KR", "en-US", "ja-JP"],
        rightsBom,
      })
    : null;

  const visualNovelGraph: VisualNovelPlayableGraph | null =
    input.direction === "webtoon-to-visual-novel-playable"
      ? {
          sceneCount: sourceEpisodeCount * 4,
          branchCount: Math.max(3, sourceEpisodeCount * 2),
          trackedVariables: ["affection_main", "trust_partner", "secret_clue_unlocked"],
          standingExpressionSlots: ["평온", "기쁨", "분노", "놀람", "슬픔", "당황", "결의", "미소"],
          runtimeEntryHtml: `${sanitizeSlug(projectTitle)}-vn-playable.html`,
          dialogueFormat: input.dialogueFormat ?? "ink",
        }
      : null;

  const stages = buildPipelineStagesForDirection(input.direction, engineProfile);
  const baseManualPerEp =
    input.direction === "webtoon-to-game-assets"
      ? 240
      : input.direction === "webtoon-to-visual-novel-playable"
        ? 180
        : input.direction === "webtoon-to-drama-previz"
          ? 150
          : 120;
  const estimatedManualMinutes = sourceEpisodeCount * baseManualPerEp;
  const avgAuto =
    stages.reduce((acc, stage) => acc + stage.automatedRatioPercent, 0) / Math.max(1, stages.length);
  const estimatedPipelineMinutes = Math.max(
    12,
    Math.round(estimatedManualMinutes * (1 - avgAuto / 100) + sourceEpisodeCount * 6),
  );
  const estimatedMinutesSaved = Math.max(0, estimatedManualMinutes - estimatedPipelineMinutes);

  const continuityChecks = [
    `캐릭터 바이블 ${characterCount}인 고유 팔레트·말투 일관성 잠금`,
    `총 ${panelCountTotal.toLocaleString("ko-KR")}컷 기준 장면 순서·복선 ID 자동 추적`,
    gameManifest
      ? `Rights BOM ${gameManifest.rightsBomAudit.checkedCount}건 상업 게임 재배포 검사 포함`
      : `Rights BOM ${rightsBom.length}건 2차 저작물 출처 기록 연동`,
  ];

  const rightsAudit = gameManifest ? gameManifest.rightsBomAudit : auditGameRightsBom(rightsBom);
  const commercialReadiness: CrossMediaTransformPlan["commercialReadiness"] =
    rightsAudit.status === "blocked"
      ? "blocked"
      : rightsAudit.status === "review-required"
        ? "review-needed"
        : "ready";

  const deliverables = gameManifest
    ? gameManifest.exportFiles
    : stages.map((stage) => stage.artifactKo);

  return {
    projectTitle,
    direction: input.direction,
    meta,
    sourceEpisodeCount,
    panelCountTotal,
    characterCount,
    targetGameEngine,
    stages,
    deliverables,
    continuityChecks,
    estimatedManualMinutes,
    estimatedPipelineMinutes,
    estimatedMinutesSaved,
    commercialReadiness,
    commercialReadinessSummaryKo: rightsAudit.summaryKo,
    visualNovelGraph,
    gameManifest,
  };
}
