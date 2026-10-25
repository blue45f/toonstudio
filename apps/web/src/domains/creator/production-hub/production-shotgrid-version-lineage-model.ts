/**
 * 오토데스크 샷그리드(Autodesk ShotGrid / Flow Production Tracking) REA 역공학 기반
 * 대형 웹툰 스튜디오용 고사양 미디어 버전·업스트림 에셋 계보(Lineage)·파이프라인 상태 매트릭스·스크리닝 룸 모델.
 *
 * - 8단계 파이프라인 상태 코드(`wtg`, `rdy`, `ip`, `rev`, `cbb`, `apr`, `fin`, `omt`) 및 선후행 공정 자동 인계(`wtg` -> `rdy`)
 * - `PublishedFile` 업스트림 에셋(3D 배경, 캐릭터 모델 시트, 소품, 컬러 LUT) 리비전 핀 대조 및 구버전 참조(Out-of-Date) 감지·원클릭 동기화
 * - 고사양 원고(`PSD`/`CLIP`/`EXR`/`PNG`, 색공간, 픽셀 규격, 레이어 수)용 Burn-in Slate 오버레이 메타데이터 생성
 * - Screening Room 플레이리스트 A/B 리비전 스펙 비교 및 타임코드/스크롤 Y축 감독 노트 관리
 */

export type ShotGridStatusCode =
  | "wtg" // Waiting to Start (선행 대기)
  | "rdy" // Ready to Start (착수 가능)
  | "ip"  // In Progress (작업 중)
  | "rev" // Pending Review (검수 대기)
  | "cbb" // Could Be Better (보완 권고)
  | "apr" // Approved (승인 완료)
  | "fin" // Final (최종 확정)
  | "omt"; // Omitted (컷/공정 제외)

export type ShotGridPipelineStep =
  | "storyboard"  // 콘티 / Layout
  | "lineart"     // 선화 / Line Art
  | "flat"        // 밑색 / Flat Color
  | "shading"     // 명암·채색 / Shading
  | "bg3d"        // 3D 배경·소품 / BG & 3D Asset
  | "compositing"; // 후보정·식자 / Comp & Typeset

export type ShotGridAssetKind =
  | "character_sheet"
  | "bg_3d_scene"
  | "prop_3d"
  | "color_lut";

export interface ShotGridStatusMeta {
  readonly code: ShotGridStatusCode;
  readonly shortCode: string;
  readonly labelKo: string;
  readonly badgeTone: "neutral" | "info" | "warning" | "success" | "danger";
  /** `omt`(제외)는 분모에서 제외하므로 `null` */
  readonly completionWeight: number | null;
}

export interface ShotGridPipelineStepMeta {
  readonly step: ShotGridPipelineStep;
  readonly code: string;
  readonly labelKo: string;
  readonly orderIndex: number;
}

export interface ShotGridPublishedAsset {
  readonly assetId: string;
  readonly assetCode: string;
  readonly assetName: string;
  readonly assetType: ShotGridAssetKind;
  readonly latestRevision: number;
  readonly publishedBy: string;
  readonly publishedAtIso: string;
  readonly fileFormat: "CLIP" | "PSD" | "BLEND" | "SKP" | "CUBE";
  readonly checksumSha256Short: string;
}

export interface ShotGridUpstreamPin {
  readonly assetId: string;
  readonly pinnedRevision: number;
}

export interface ShotGridDirectorNote {
  readonly noteId: string;
  readonly author: string;
  /** 세로형 웹툰 스크롤 Y 좌표(px) 또는 컷 내부 프레임 번호 */
  readonly scrollYOrFrame: number;
  readonly body: string;
  readonly resolved: boolean;
}

export interface ShotGridMediaSourceSpec {
  readonly fileFormat: "PSD" | "CLIP" | "PNG" | "EXR";
  readonly widthPx: number;
  readonly heightPx: number;
  readonly colorSpace: "sRGB" | "Display-P3" | "ACEScg";
  readonly layerCount: number;
  readonly fileSizeMb: number;
}

export interface ShotGridMediaVersion {
  readonly versionId: string;
  readonly versionCode: string;
  readonly episodeCode: string;
  readonly cutCode: string;
  readonly cutTitle: string;
  readonly pipelineStep: ShotGridPipelineStep;
  readonly revisionNumber: number;
  readonly status: ShotGridStatusCode;
  readonly artistName: string;
  readonly submittedAtIso: string;
  readonly sourceSpec: ShotGridMediaSourceSpec;
  readonly upstreamPins: readonly ShotGridUpstreamPin[];
  readonly directorNotes: readonly ShotGridDirectorNote[];
}

export interface OutdatedUpstreamDependency {
  readonly assetId: string;
  readonly assetCode: string;
  readonly assetName: string;
  readonly assetType: ShotGridAssetKind;
  readonly pinnedRevision: number;
  readonly latestRevision: number;
  readonly revisionDelta: number;
  readonly publishedBy: string;
}

export interface VersionLineageHealthReport {
  readonly versionId: string;
  readonly versionCode: string;
  readonly isUpToDate: boolean;
  readonly totalPinnedAssets: number;
  readonly outdatedAssets: readonly OutdatedUpstreamDependency[];
  readonly summaryLabel: string;
}

export interface BurnInSlateOverlay {
  readonly topLeft: string;
  readonly topRight: string;
  readonly bottomLeft: string;
  readonly bottomRight: string;
  readonly watermarkText: string;
  readonly lineageWarningBanner: string | null;
}

export interface ShotGridCutMatrixRow {
  readonly cutCode: string;
  readonly cutTitle: string;
  readonly sequenceName: string;
  readonly stepStatuses: Readonly<Record<ShotGridPipelineStep, ShotGridStatusCode>>;
}

export interface ShotGridMatrixSummary {
  readonly overallProgressPercent: number;
  readonly cutProgressByCode: Readonly<Record<string, number>>;
  readonly stepProgressByKey: Readonly<Record<ShotGridPipelineStep, number>>;
  readonly readyToStartCount: number;
  readonly pendingReviewCount: number;
  readonly cbbCount: number;
  readonly finalOrApprovedCount: number;
}

export interface MediaVersionComparisonDiff {
  readonly versionACode: string;
  readonly versionBCode: string;
  readonly revisionGap: number;
  readonly widthDeltaPx: number;
  readonly heightDeltaPx: number;
  readonly layerCountDelta: number;
  readonly fileSizeDeltaMb: number;
  readonly colorSpaceChanged: boolean;
  readonly unresolvedNotesA: number;
  readonly unresolvedNotesB: number;
}

export const SHOTGRID_PIPELINE_STEPS: readonly ShotGridPipelineStepMeta[] = [
  { step: "storyboard", code: "LAY", labelKo: "콘티(Layout)", orderIndex: 0 },
  { step: "bg3d", code: "BG3D", labelKo: "3D 배경(BG)", orderIndex: 1 },
  { step: "lineart", code: "LINE", labelKo: "선화(Line)", orderIndex: 2 },
  { step: "flat", code: "FLAT", labelKo: "밑색(Flat)", orderIndex: 3 },
  { step: "shading", code: "SHD", labelKo: "명암·채색(Shade)", orderIndex: 4 },
  { step: "compositing", code: "COMP", labelKo: "후보정·식자(Comp)", orderIndex: 5 },
] as const;

const STATUS_META_MAP: Readonly<Record<ShotGridStatusCode, ShotGridStatusMeta>> = {
  wtg: { code: "wtg", shortCode: "WTG", labelKo: "선행 대기", badgeTone: "neutral", completionWeight: 0 },
  rdy: { code: "rdy", shortCode: "RDY", labelKo: "착수 가능", badgeTone: "info", completionWeight: 0.15 },
  ip: { code: "ip", shortCode: "IP", labelKo: "작업 중", badgeTone: "info", completionWeight: 0.45 },
  rev: { code: "rev", shortCode: "REV", labelKo: "검수 대기", badgeTone: "warning", completionWeight: 0.75 },
  cbb: { code: "cbb", shortCode: "CBB", labelKo: "보완 권고", badgeTone: "warning", completionWeight: 0.8 },
  apr: { code: "apr", shortCode: "APR", labelKo: "승인 완료", badgeTone: "success", completionWeight: 0.95 },
  fin: { code: "fin", shortCode: "FIN", labelKo: "최종 확정", badgeTone: "success", completionWeight: 1.0 },
  omt: { code: "omt", shortCode: "OMT", labelKo: "공정 제외", badgeTone: "neutral", completionWeight: null },
};

export function getShotGridStatusMeta(status: ShotGridStatusCode): ShotGridStatusMeta {
  return STATUS_META_MAP[status];
}

export function getShotGridStepMeta(step: ShotGridPipelineStep): ShotGridPipelineStepMeta {
  return (
    SHOTGRID_PIPELINE_STEPS.find((item) => item.step === step) ?? {
      step,
      code: step.toUpperCase(),
      labelKo: step,
      orderIndex: 99,
    }
  );
}

/**
 * 컷 미디어 버전이 참조 중인 업스트림 퍼블리시 에셋(`PublishedFile`) 핀들과
 * 현재 스튜디오 최신 에셋 리비전을 대조하여 Out-of-Date 참조 여부를 판정한다.
 */
export function evaluateVersionLineageHealth(
  version: ShotGridMediaVersion,
  publishedAssets: readonly ShotGridPublishedAsset[],
): VersionLineageHealthReport {
  const assetById = new Map(publishedAssets.map((asset) => [asset.assetId, asset]));
  const outdatedAssets: OutdatedUpstreamDependency[] = [];

  for (const pin of version.upstreamPins) {
    const asset = assetById.get(pin.assetId);
    if (!asset) continue;
    if (pin.pinnedRevision < asset.latestRevision) {
      outdatedAssets.push({
        assetId: asset.assetId,
        assetCode: asset.assetCode,
        assetName: asset.assetName,
        assetType: asset.assetType,
        pinnedRevision: pin.pinnedRevision,
        latestRevision: asset.latestRevision,
        revisionDelta: asset.latestRevision - pin.pinnedRevision,
        publishedBy: asset.publishedBy,
      });
    }
  }

  const isUpToDate = outdatedAssets.length === 0;
  const summaryLabel = isUpToDate
    ? `업스트림 에셋 ${version.upstreamPins.length}종 모두 최신 리비전 일치`
    : `구버전 에셋 참조 ${outdatedAssets.length}건 감지 (${outdatedAssets.map((item) => `${item.assetCode} v${item.pinnedRevision}→v${item.latestRevision}`).join(", ")})`;

  return {
    versionId: version.versionId,
    versionCode: version.versionCode,
    isUpToDate,
    totalPinnedAssets: version.upstreamPins.length,
    outdatedAssets,
    summaryLabel,
  };
}

function formatRevisionSuffix(revision: number): string {
  return `v${String(Math.max(1, Math.trunc(revision))).padStart(3, "0")}`;
}

function replaceVersionCodeRevision(versionCode: string, nextRevision: number): string {
  const nextSuffix = formatRevisionSuffix(nextRevision);
  if (/_v\d+$/i.test(versionCode)) {
    return versionCode.replace(/_v\d+$/i, `_${nextSuffix}`);
  }
  return `${versionCode}_${nextSuffix}`;
}

/**
 * 구버전 업스트림 에셋을 참조 중인 컷 미디어 버전을 최신 `PublishedFile` 리비전으로 일괄 리바인딩하고
 * 새 리비전 번호(`v00X+1`)와 검수 대기(`rev`) 상태로 승격한다.
 */
export function syncVersionToLatestUpstream(
  version: ShotGridMediaVersion,
  publishedAssets: readonly ShotGridPublishedAsset[],
  syncedAtIso: string,
): ShotGridMediaVersion {
  const assetById = new Map(publishedAssets.map((asset) => [asset.assetId, asset]));
  let changed = false;

  const updatedPins = version.upstreamPins.map((pin) => {
    const asset = assetById.get(pin.assetId);
    if (asset && pin.pinnedRevision < asset.latestRevision) {
      changed = true;
      return {
        ...pin,
        pinnedRevision: asset.latestRevision,
      };
    }
    return pin;
  });

  if (!changed) {
    return version;
  }

  const nextRevision = version.revisionNumber + 1;
  const nextStatus: ShotGridStatusCode =
    version.status === "cbb" || version.status === "ip" || version.status === "rdy"
      ? "rev"
      : version.status;

  return {
    ...version,
    revisionNumber: nextRevision,
    versionCode: replaceVersionCodeRevision(version.versionCode, nextRevision),
    status: nextStatus,
    submittedAtIso: syncedAtIso,
    upstreamPins: updatedPins,
  };
}

/**
 * ShotGrid Screening Room / RV 스타일의 Burn-in Slate 오버레이 메타데이터를 생성한다.
 */
export function buildBurnInSlateOverlay(
  version: ShotGridMediaVersion,
  projectTitle: string,
  publishedAssets: readonly ShotGridPublishedAsset[],
): BurnInSlateOverlay {
  const statusMeta = getShotGridStatusMeta(version.status);
  const stepMeta = getShotGridStepMeta(version.pipelineStep);
  const health = evaluateVersionLineageHealth(version, publishedAssets);
  const unresolvedNotes = version.directorNotes.filter((note) => !note.resolved).length;

  return {
    topLeft: `${projectTitle} · ${version.episodeCode} · ${version.cutCode} (${version.cutTitle})`,
    topRight: `${version.versionCode} · [${statusMeta.shortCode}] ${statusMeta.labelKo}`,
    bottomLeft: `공정: ${stepMeta.labelKo} | 담당: ${version.artistName} | 미해결 노트: ${unresolvedNotes}건`,
    bottomRight: `${version.sourceSpec.fileFormat} ${version.sourceSpec.widthPx}×${version.sourceSpec.heightPx}px · ${version.sourceSpec.colorSpace} · ${version.sourceSpec.layerCount} Layers (${version.sourceSpec.fileSizeMb.toFixed(1)}MB)`,
    watermarkText: `TOONSTUDIO SHOTGRID REVIEW · ${version.artistName} · ${version.submittedAtIso.slice(0, 10)}`,
    lineageWarningBanner: health.isUpToDate ? null : `주의: ${health.summaryLabel}`,
  };
}

/**
 * 컷별 × 파이프라인 스텝별 상태 매트릭스에서 전체 공정률, 컷별 공정률, 스텝별 공정률을 집계한다.
 * `omt`(제외된 스텝, 예: 3D 배경이 필요 없는 클로즈업 컷)는 분모에서 자동 제외한다.
 */
export function computePipelineMatrixSummary(
  rows: readonly ShotGridCutMatrixRow[],
): ShotGridMatrixSummary {
  const cutProgressByCode: Record<string, number> = {};
  const stepSums: Record<ShotGridPipelineStep, { weighted: number; count: number }> = {
    storyboard: { weighted: 0, count: 0 },
    bg3d: { weighted: 0, count: 0 },
    lineart: { weighted: 0, count: 0 },
    flat: { weighted: 0, count: 0 },
    shading: { weighted: 0, count: 0 },
    compositing: { weighted: 0, count: 0 },
  };

  let totalWeighted = 0;
  let totalActiveCells = 0;
  let readyToStartCount = 0;
  let pendingReviewCount = 0;
  let cbbCount = 0;
  let finalOrApprovedCount = 0;

  for (const row of rows) {
    let rowWeighted = 0;
    let rowActive = 0;

    for (const stepMeta of SHOTGRID_PIPELINE_STEPS) {
      const status = row.stepStatuses[stepMeta.step];
      const meta = getShotGridStatusMeta(status);
      if (status === "rdy") readyToStartCount += 1;
      if (status === "rev") pendingReviewCount += 1;
      if (status === "cbb") cbbCount += 1;
      if (status === "apr" || status === "fin") finalOrApprovedCount += 1;

      if (meta.completionWeight !== null) {
        rowWeighted += meta.completionWeight;
        rowActive += 1;
        totalWeighted += meta.completionWeight;
        totalActiveCells += 1;
        stepSums[stepMeta.step].weighted += meta.completionWeight;
        stepSums[stepMeta.step].count += 1;
      }
    }

    cutProgressByCode[row.cutCode] =
      rowActive > 0 ? Math.round((rowWeighted / rowActive) * 100) : 100;
  }

  const stepProgressByKey = {
    storyboard:
      stepSums.storyboard.count > 0
        ? Math.round((stepSums.storyboard.weighted / stepSums.storyboard.count) * 100)
        : 100,
    bg3d:
      stepSums.bg3d.count > 0
        ? Math.round((stepSums.bg3d.weighted / stepSums.bg3d.count) * 100)
        : 100,
    lineart:
      stepSums.lineart.count > 0
        ? Math.round((stepSums.lineart.weighted / stepSums.lineart.count) * 100)
        : 100,
    flat:
      stepSums.flat.count > 0
        ? Math.round((stepSums.flat.weighted / stepSums.flat.count) * 100)
        : 100,
    shading:
      stepSums.shading.count > 0
        ? Math.round((stepSums.shading.weighted / stepSums.shading.count) * 100)
        : 100,
    compositing:
      stepSums.compositing.count > 0
        ? Math.round((stepSums.compositing.weighted / stepSums.compositing.count) * 100)
        : 100,
  };

  return {
    overallProgressPercent:
      totalActiveCells > 0 ? Math.round((totalWeighted / totalActiveCells) * 100) : 0,
    cutProgressByCode,
    stepProgressByKey,
    readyToStartCount,
    pendingReviewCount,
    cbbCount,
    finalOrApprovedCount,
  };
}

/**
 * 특정 컷의 파이프라인 스텝 상태를 변경하며, 만약 `"apr"`(승인) 또는 `"fin"`(최종 확정)으로 전환되면
 * 바로 다음 활성 공정(`omt`가 아닌 다음 스텝)이 `"wtg"`(선행 대기)일 경우 자동으로 `"rdy"`(착수 가능)로 승격한다.
 */
export function transitionCutStepWithAutoHandoff(
  rows: readonly ShotGridCutMatrixRow[],
  cutCode: string,
  step: ShotGridPipelineStep,
  nextStatus: ShotGridStatusCode,
): {
  readonly updatedRows: readonly ShotGridCutMatrixRow[];
  readonly autoPromotedStep: ShotGridPipelineStep | null;
} {
  let autoPromotedStep: ShotGridPipelineStep | null = null;
  const currentStepIndex = SHOTGRID_PIPELINE_STEPS.findIndex((item) => item.step === step);

  const updatedRows = rows.map((row) => {
    if (row.cutCode !== cutCode) return row;

    const nextStatuses: Record<ShotGridPipelineStep, ShotGridStatusCode> = {
      ...row.stepStatuses,
      [step]: nextStatus,
    };

    if ((nextStatus === "apr" || nextStatus === "fin") && currentStepIndex >= 0) {
      for (let idx = currentStepIndex + 1; idx < SHOTGRID_PIPELINE_STEPS.length; idx += 1) {
        const candidateStep = SHOTGRID_PIPELINE_STEPS[idx]!.step;
        const candidateStatus = nextStatuses[candidateStep];
        if (candidateStatus === "omt") {
          continue;
        }
        if (candidateStatus === "wtg") {
          nextStatuses[candidateStep] = "rdy";
          autoPromotedStep = candidateStep;
        }
        break;
      }
    }

    return {
      ...row,
      stepStatuses: nextStatuses,
    };
  });

  return { updatedRows, autoPromotedStep };
}

/**
 * Screening Room A/B 리비전 비교를 위해 두 미디어 버전의 사양 및 미해결 감독 노트 편차를 계산한다.
 */
export function compareMediaVersionSpecs(
  versionA: ShotGridMediaVersion,
  versionB: ShotGridMediaVersion,
): MediaVersionComparisonDiff {
  const unresolvedNotesA = versionA.directorNotes.filter((note) => !note.resolved).length;
  const unresolvedNotesB = versionB.directorNotes.filter((note) => !note.resolved).length;

  return {
    versionACode: versionA.versionCode,
    versionBCode: versionB.versionCode,
    revisionGap: versionB.revisionNumber - versionA.revisionNumber,
    widthDeltaPx: versionB.sourceSpec.widthPx - versionA.sourceSpec.widthPx,
    heightDeltaPx: versionB.sourceSpec.heightPx - versionA.sourceSpec.heightPx,
    layerCountDelta: versionB.sourceSpec.layerCount - versionA.sourceSpec.layerCount,
    fileSizeDeltaMb: Number(
      (versionB.sourceSpec.fileSizeMb - versionA.sourceSpec.fileSizeMb).toFixed(1),
    ),
    colorSpaceChanged: versionA.sourceSpec.colorSpace !== versionB.sourceSpec.colorSpace,
    unresolvedNotesA,
    unresolvedNotesB,
  };
}

export const INITIAL_SHOTGRID_PUBLISHED_ASSETS: readonly ShotGridPublishedAsset[] = [
  {
    assetId: "asset-bg-citadel",
    assetCode: "AST-BG-CITADEL",
    assetName: "북부 대공 성채 3D 메인 홀 세트",
    assetType: "bg_3d_scene",
    latestRevision: 4,
    publishedBy: "배경3D팀 박도윤",
    publishedAtIso: "2026-10-26T03:20:00Z",
    fileFormat: "BLEND",
    checksumSha256Short: "8f3c91a2",
  },
  {
    assetId: "asset-char-kael",
    assetCode: "AST-CHAR-KAEL",
    assetName: "카엘 동계 기사단 예복 모델 시트",
    assetType: "character_sheet",
    latestRevision: 3,
    publishedBy: "총괄작화 김서연",
    publishedAtIso: "2026-10-25T18:00:00Z",
    fileFormat: "CLIP",
    checksumSha256Short: "4e19b70c",
  },
  {
    assetId: "asset-prop-sealstone",
    assetCode: "AST-PROP-SEALSTONE",
    assetName: "고대 룬 봉인석 발광 파츠 3D 소품",
    assetType: "prop_3d",
    latestRevision: 2,
    publishedBy: "배경3D팀 박도윤",
    publishedAtIso: "2026-10-24T11:30:00Z",
    fileFormat: "SKP",
    checksumSha256Short: "c72d04e9",
  },
  {
    assetId: "asset-lut-night",
    assetCode: "AST-LUT-NIGHTFALL",
    assetName: "심야 창백 달빛 컬러 그레이딩 LUT",
    assetType: "color_lut",
    latestRevision: 2,
    publishedBy: "후보정팀 정하늘",
    publishedAtIso: "2026-10-25T09:15:00Z",
    fileFormat: "CUBE",
    checksumSha256Short: "91a0fe33",
  },
];

export const INITIAL_SHOTGRID_MEDIA_VERSIONS: readonly ShotGridMediaVersion[] = [
  {
    versionId: "ver-ep04-cut012-v2",
    versionCode: "EP04_CUT012_SHD_v002",
    episodeCode: "EP04",
    cutCode: "CUT-012",
    cutTitle: "성채 대연회장 봉인석 각성 롱샷",
    pipelineStep: "shading",
    revisionNumber: 2,
    status: "cbb",
    artistName: "채색팀 이지안",
    submittedAtIso: "2026-10-25T21:10:00Z",
    sourceSpec: {
      fileFormat: "CLIP",
      widthPx: 1440,
      heightPx: 4200,
      colorSpace: "Display-P3",
      layerCount: 64,
      fileSizeMb: 186.4,
    },
    upstreamPins: [
      { assetId: "asset-bg-citadel", pinnedRevision: 2 },
      { assetId: "asset-char-kael", pinnedRevision: 2 },
      { assetId: "asset-prop-sealstone", pinnedRevision: 2 },
    ],
    directorNotes: [
      {
        noteId: "note-1",
        author: "총괄PD 최현우",
        scrollYOrFrame: 1280,
        body: "배경 성채 기둥 조명이 구버전(v2) 세트 기준이라 그림자 방향이 어긋났습니다. 최신 v4 세트로 교체 바랍니다.",
        resolved: false,
      },
      {
        noteId: "note-2",
        author: "연출감독 한소희",
        scrollYOrFrame: 2940,
        body: "카엘 망토 견장 금장 디테일 v3 캐릭터 시트 반영 필요.",
        resolved: false,
      },
    ],
  },
  {
    versionId: "ver-ep04-cut012-v3",
    versionCode: "EP04_CUT012_SHD_v003",
    episodeCode: "EP04",
    cutCode: "CUT-012",
    cutTitle: "성채 대연회장 봉인석 각성 롱샷",
    pipelineStep: "shading",
    revisionNumber: 3,
    status: "rev",
    artistName: "채색팀 이지안",
    submittedAtIso: "2026-10-26T04:05:00Z",
    sourceSpec: {
      fileFormat: "PSD",
      widthPx: 1440,
      heightPx: 4320,
      colorSpace: "Display-P3",
      layerCount: 72,
      fileSizeMb: 214.8,
    },
    upstreamPins: [
      { assetId: "asset-bg-citadel", pinnedRevision: 3 },
      { assetId: "asset-char-kael", pinnedRevision: 3 },
      { assetId: "asset-prop-sealstone", pinnedRevision: 2 },
    ],
    directorNotes: [
      {
        noteId: "note-1",
        author: "총괄PD 최현우",
        scrollYOrFrame: 1280,
        body: "배경 성채 기둥 조명이 v3로 갱신되었으나 방금 배포된 v4 천장 스테인드글라스 리비전 동기화가 남아 있습니다.",
        resolved: false,
      },
      {
        noteId: "note-2",
        author: "연출감독 한소희",
        scrollYOrFrame: 2940,
        body: "카엘 망토 견장 v3 시트 반영 확인 완료.",
        resolved: true,
      },
    ],
  },
  {
    versionId: "ver-ep04-cut018-v1",
    versionCode: "EP04_CUT018_COMP_v001",
    episodeCode: "EP04",
    cutCode: "CUT-018",
    cutTitle: "심야 성벽 위 카엘 독백 클로즈업",
    pipelineStep: "compositing",
    revisionNumber: 1,
    status: "apr",
    artistName: "후보정팀 정하늘",
    submittedAtIso: "2026-10-26T05:30:00Z",
    sourceSpec: {
      fileFormat: "PSD",
      widthPx: 1440,
      heightPx: 3600,
      colorSpace: "Display-P3",
      layerCount: 48,
      fileSizeMb: 142.0,
    },
    upstreamPins: [
      { assetId: "asset-char-kael", pinnedRevision: 3 },
      { assetId: "asset-lut-night", pinnedRevision: 2 },
    ],
    directorNotes: [
      {
        noteId: "note-3",
        author: "총괄PD 최현우",
        scrollYOrFrame: 840,
        body: "달빛 역광 림라이트와 식자 효과음 배치 모두 완벽합니다.",
        resolved: true,
      },
    ],
  },
];

export const INITIAL_SHOTGRID_CUT_MATRIX: readonly ShotGridCutMatrixRow[] = [
  {
    cutCode: "CUT-011",
    cutTitle: "성채 외경 인트로 버드아이뷰",
    sequenceName: "SEQ-02 북부 성채 진입",
    stepStatuses: {
      storyboard: "fin",
      bg3d: "fin",
      lineart: "fin",
      flat: "apr",
      shading: "apr",
      compositing: "ip",
    },
  },
  {
    cutCode: "CUT-012",
    cutTitle: "성채 대연회장 봉인석 각성 롱샷",
    sequenceName: "SEQ-02 북부 성채 진입",
    stepStatuses: {
      storyboard: "fin",
      bg3d: "apr",
      lineart: "apr",
      flat: "apr",
      shading: "rev",
      compositing: "wtg",
    },
  },
  {
    cutCode: "CUT-018",
    cutTitle: "심야 성벽 위 카엘 독백 클로즈업",
    sequenceName: "SEQ-03 야간 경계",
    stepStatuses: {
      storyboard: "fin",
      bg3d: "omt",
      lineart: "fin",
      flat: "fin",
      shading: "apr",
      compositing: "apr",
    },
  },
];
