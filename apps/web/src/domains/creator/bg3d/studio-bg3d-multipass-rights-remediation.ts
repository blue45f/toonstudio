/**
 * Phase 3: Blender 5.2 × ToonStudio 출판 자동화 3대 코어 엔진
 *
 * 1. 3D Toon 8-Pass PSD 렌더링 & `.toon3d` 패키징 예산 플래너 (`evaluateMultiPassToonPsdExportPlan`)
 * 2. 상용 웹툰 출판용 Rights BOM 라이선스 감사 & 저작자 표기 자동 생성기 (`evaluateRightsBomCommercialReadiness`)
 * 3. Verify AI 원클릭 Auto-Remediation(Face Normal 구면화, 2점 투시 보정, 바닥 접지 스냅, 화풍 피드백 루프) 생성기 (`buildVerifyAiAutoRemediationPlan`)
 */

import type { VerifyAiPreflightGateReport } from "./studio-bg3d-shot-continuity-linked-ink";

export type ToonRenderQualityTier = "draft" | "interactive" | "final";

export type ToonMultiPassChannelId =
  | "beauty-rgb"
  | "line-ink"
  | "shadow-ao"
  | "linear-depth"
  | "object-id"
  | "world-normal"
  | "material-id"
  | "motion-vector";

export interface ToonMultiPassSpec {
  readonly id: ToonMultiPassChannelId;
  readonly labelKo: string;
  readonly bitDepth: 8 | 16;
  readonly channelCount: 1 | 3 | 4;
  readonly psdLayerName: string;
  readonly purposeKo: string;
}

export const TOON_MULTI_PASS_SPECS: readonly ToonMultiPassSpec[] = Object.freeze([
  {
    id: "beauty-rgb",
    labelKo: "Beauty (툰 채색 본선)",
    bitDepth: 8,
    channelCount: 4,
    psdLayerName: "01_Toon_Beauty_RGB",
    purposeKo: "NPR 셰이더 컬러램프 및 림라이트 합성 색상",
  },
  {
    id: "line-ink",
    labelKo: "Line Ink (Freestyle 선화)",
    bitDepth: 8,
    channelCount: 4,
    psdLayerName: "02_Freestyle_Line_Ink",
    purposeKo: "실루엣·크리즈·재질 경계 캘리그래피 먹선",
  },
  {
    id: "shadow-ao",
    labelKo: "Shadow & AO (셀 암부·접지)",
    bitDepth: 8,
    channelCount: 4,
    psdLayerName: "03_Toon_Shadow_AO_Multiply",
    purposeKo: "카툰 그림자 단수 및 접지 앰비언트 오클루전",
  },
  {
    id: "linear-depth",
    labelKo: "Depth (16-bit 원근 안개·심도)",
    bitDepth: 16,
    channelCount: 1,
    psdLayerName: "04_Linear_Depth_16bit",
    purposeKo: "공기원근 안개(Mist Pass) 및 피사계 심도(DoF) 후보정",
  },
  {
    id: "object-id",
    labelKo: "Object ID (인물·소품 마스크)",
    bitDepth: 8,
    channelCount: 4,
    psdLayerName: "05_Cryptomatte_Object_ID",
    purposeKo: "캐릭터·무기·배경 오브젝트별 원클릭 선택 마스크",
  },
  {
    id: "world-normal",
    labelKo: "Normal (16-bit 재조명 법선)",
    bitDepth: 16,
    channelCount: 3,
    psdLayerName: "06_World_Normal_Relight",
    purposeKo: "2D 캔버스 내 후처리 역광·보조광 리라이팅",
  },
  {
    id: "material-id",
    labelKo: "Material ID (재질별 마스크)",
    bitDepth: 8,
    channelCount: 4,
    psdLayerName: "07_Cryptomatte_Material_ID",
    purposeKo: "금속·보석·피부·의상 재질별 톤 분리 마스크",
  },
  {
    id: "motion-vector",
    labelKo: "Motion Vector (액션 블러)",
    bitDepth: 16,
    channelCount: 3,
    psdLayerName: "08_Motion_Vector_Velocity",
    purposeKo: "어검술·타격 컷 방향성 스피드 블러 보간",
  },
]);

export interface MultiPassToonPsdExportInput {
  readonly qualityTier: ToonRenderQualityTier;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly enabledPasses?: readonly ToonMultiPassChannelId[];
  readonly webgpuComputeAvailable?: boolean;
}

export interface MultiPassToonPsdExportPlan {
  readonly qualityTier: ToonRenderQualityTier;
  readonly resolutionPx: readonly [number, number];
  readonly supersampleScale: number;
  readonly activePasses: readonly ToonMultiPassSpec[];
  readonly estimatedUncompressedMiB: number;
  readonly estimatedPsdArchiveMiB: number;
  readonly estimatedRenderTimeMs: number;
  readonly toon3dPackageReady: boolean;
  readonly summaryKo: string;
}

export type AssetLicenseKind =
  | "CC0"
  | "CC-BY-4.0"
  | "CC-BY-SA-4.0"
  | "CC-BY-NC-4.0"
  | "MIT"
  | "GPL-3.0"
  | "ToonStudio-Native";

export interface SceneAssetRightsEntry {
  readonly assetId: string;
  readonly nameKo: string;
  readonly license: AssetLicenseKind;
  readonly authorCredit?: string;
  readonly sourceUri?: string;
}

export interface RightsBomCommercialAuditResult {
  readonly commercialPublishAllowed: boolean;
  readonly riskLevel: "clean" | "attribution-required" | "blocked";
  readonly auditedAssetCount: number;
  readonly blockerReasonsKo: readonly string[];
  readonly warningReasonsKo: readonly string[];
  readonly autoAttributionCreditsKo: readonly string[];
  readonly rightsBomManifestDigest: string;
  readonly summaryKo: string;
}

export interface VerifyAiAutoRemediationAction {
  readonly gateId: string;
  readonly actionId:
    | "align-2point-perspective-shift-y"
    | "raycast-drop-to-floor-ao"
    | "spherize-face-normals"
    | "boost-rim-and-depth-mist"
    | "interpolate-shot-continuity-50pct"
    | "lock-linked-ink-homography";
  readonly titleKo: string;
  readonly parameterPatchSummaryKo: string;
  readonly estimatedScoreGain: number;
}

export interface VerifyAiAutoRemediationPlan {
  readonly actions: readonly VerifyAiAutoRemediationAction[];
  readonly projectedPostRemediationScore: number;
  readonly styleFeedbackDelta: {
    readonly preferredFocalLengthDeltaMm: number;
    readonly preferredKelvinDelta: number;
    readonly faceNormalSpherizeWeight: number;
    readonly rimBoostMultiplier: number;
  };
  readonly summaryKo: string;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * 1. 3D Toon 8-Pass PSD 렌더링 & `.toon3d` 패키징 예산 플래너.
 */
export function evaluateMultiPassToonPsdExportPlan(
  input: MultiPassToonPsdExportInput,
): MultiPassToonPsdExportPlan {
  const tier = input.qualityTier;
  const defaultDims: Readonly<Record<ToonRenderQualityTier, readonly [number, number]>> = {
    draft: [960, 1350],
    interactive: [1440, 2048],
    final: [2400, 3840],
  };
  const [baseW, baseH] = defaultDims[tier];
  const widthPx = clamp(Math.round(input.widthPx ?? baseW), 320, 8192);
  const heightPx = clamp(Math.round(input.heightPx ?? baseH), 320, 16384);
  const supersampleScale = tier === "final" ? 2.0 : tier === "interactive" ? 1.25 : 1.0;

  const enabledIds = input.enabledPasses
    ? new Set(input.enabledPasses)
    : new Set(TOON_MULTI_PASS_SPECS.map((p) => p.id));
  const activePasses = TOON_MULTI_PASS_SPECS.filter((p) => enabledIds.has(p.id));

  const pixelCount = widthPx * heightPx;
  let totalBytes = 0;
  for (const pass of activePasses) {
    const bytesPerChannel = pass.bitDepth === 16 ? 2 : 1;
    totalBytes += pixelCount * pass.channelCount * bytesPerChannel;
  }

  const estimatedUncompressedMiB = round2(totalBytes / (1024 * 1024));
  // RLE/ZIP64 PSD + .toon3d KTX2/layerbin 압축률 반영 (~38%)
  const estimatedPsdArchiveMiB = round2(estimatedUncompressedMiB * 0.38);

  const webgpuAccel = input.webgpuComputeAvailable !== false ? 0.42 : 1.0;
  const baseMsPerMegapixel = tier === "final" ? 68 : tier === "interactive" ? 24 : 11;
  const megapixels = (pixelCount * supersampleScale) / 1_000_000;
  const estimatedRenderTimeMs = Math.round(
    megapixels * baseMsPerMegapixel * (0.55 + activePasses.length * 0.08) * webgpuAccel,
  );

  const toon3dPackageReady =
    activePasses.some((p) => p.id === "beauty-rgb") &&
    activePasses.some((p) => p.id === "line-ink");

  return {
    qualityTier: tier,
    resolutionPx: [widthPx, heightPx],
    supersampleScale,
    activePasses,
    estimatedUncompressedMiB,
    estimatedPsdArchiveMiB,
    estimatedRenderTimeMs,
    toon3dPackageReady,
    summaryKo: `Multi-Pass PSD(${tier.toUpperCase()} ${widthPx}×${heightPx}, ${activePasses.length}패스): 압축 ${estimatedPsdArchiveMiB}MiB · 예상 렌더 ${estimatedRenderTimeMs}ms`,
  };
}

export const DEFAULT_SCENE_RIGHTS_BOM_ENTRIES: readonly SceneAssetRightsEntry[] =
  Object.freeze([
    {
      assetId: "asset-sanctum-altar-v1",
      nameKo: "왕국 대성채 알현실 & 어검 제단 세트",
      license: "ToonStudio-Native",
      authorCredit: "ToonStudio 3D Lab",
    },
    {
      assetId: "asset-celestial-swords-12",
      nameKo: "천검 12궁 부유 어검진 리그",
      license: "CC0",
      authorCredit: "Public Domain / CC0",
    },
    {
      assetId: "asset-calamity-dragon-ignis",
      nameKo: "고대 재앙룡 이그니스 iTaSC 아머처",
      license: "CC-BY-4.0",
      authorCredit: "ToonStudio Creature Forge",
      sourceUri: "https://www.toonstudio.cloud/market",
    },
  ]);

/**
 * 2. 상용 웹툰 출판용 Rights BOM 라이선스 감사 & 자동 크레딧 생성기.
 */
export function evaluateRightsBomCommercialReadiness(
  entries: readonly SceneAssetRightsEntry[] = DEFAULT_SCENE_RIGHTS_BOM_ENTRIES,
): RightsBomCommercialAuditResult {
  const blockerReasonsKo: string[] = [];
  const warningReasonsKo: string[] = [];
  const autoAttributionCreditsKo: string[] = [];

  for (const item of entries) {
    if (item.license === "CC-BY-NC-4.0") {
      blockerReasonsKo.push(
        `[${item.nameKo}] CC-BY-NC-4.0(비상업적 전용) 라이선스는 상용 유료 웹툰 연재에 사용할 수 없습니다.`,
      );
    } else if (item.license === "GPL-3.0") {
      blockerReasonsKo.push(
        `[${item.nameKo}] GPL-3.0 에셋은 상용 원고·패키지 배포 시 소스 공개 의무 충돌이 발생합니다.`,
      );
    } else if (item.license === "CC-BY-4.0" || item.license === "CC-BY-SA-4.0") {
      const author = item.authorCredit?.trim() || "작자 미상(확인 필요)";
      autoAttributionCreditsKo.push(`${item.nameKo} (© ${author}, ${item.license})`);
      if (!item.authorCredit?.trim()) {
        warningReasonsKo.push(`[${item.nameKo}] ${item.license} 저작자 표기란이 비어 있습니다.`);
      }
      if (item.license === "CC-BY-SA-4.0") {
        warningReasonsKo.push(
          `[${item.nameKo}] CC-BY-SA-4.0 파생 3D 에셋 공유 시 동일 조건 유지 여부를 확인하세요.`,
        );
      }
    }
  }

  const commercialPublishAllowed = blockerReasonsKo.length === 0;
  const riskLevel: RightsBomCommercialAuditResult["riskLevel"] = !commercialPublishAllowed
    ? "blocked"
    : autoAttributionCreditsKo.length > 0 || warningReasonsKo.length > 0
      ? "attribution-required"
      : "clean";

  const rightsBomManifestDigest = `bom-v1:${entries.length}:${entries.map((e) => `${e.assetId}:${e.license}`).join("|")}`;

  const summaryKo = !commercialPublishAllowed
    ? `Rights BOM 차단 (${blockerReasonsKo.length}건): 상용 연재 불가 에셋 포함`
    : autoAttributionCreditsKo.length > 0
      ? `Rights BOM 상용 출판 가능 (${entries.length}개 에셋 검증 · 자동 크레딧 ${autoAttributionCreditsKo.length}건 생성)`
      : `Rights BOM 상용 출판 클린 통과 (${entries.length}개 에셋 무제한 상용 호환)`;

  return {
    commercialPublishAllowed,
    riskLevel,
    auditedAssetCount: entries.length,
    blockerReasonsKo,
    warningReasonsKo,
    autoAttributionCreditsKo,
    rightsBomManifestDigest,
    summaryKo,
  };
}

/**
 * 3. Verify AI 원클릭 Auto-Remediation 실행 계획 및 작가 화풍 피드백 학습 델타 생성기.
 */
export function buildVerifyAiAutoRemediationPlan(
  preflight: VerifyAiPreflightGateReport,
  customKelvin = 5600,
): VerifyAiAutoRemediationPlan {
  const actions: VerifyAiAutoRemediationAction[] = [
    {
      gateId: "V06_FACIAL_SHADOW",
      actionId: "spherize-face-normals",
      titleKo: "캐릭터 Face Normal 구면화(Spherize) 보정",
      parameterPatchSummaryKo: "face_mask 영역 법선 구면 보간 가중치 0.65 적용 → 코·볼 암부 파편 0.3% 이하로 억제",
      estimatedScoreGain: 1.4,
    },
    {
      gateId: "V01_PERSPECTIVE",
      actionId: "align-2point-perspective-shift-y",
      titleKo: "건축 배경 2점 투시 수직선 자동 정렬",
      parameterPatchSummaryKo: "Camera Lens Shift-Y +0.12 고정 및 수직 소실점 스냅 활성화",
      estimatedScoreGain: 1.1,
    },
    {
      gateId: "V02_GROUNDING",
      actionId: "raycast-drop-to-floor-ao",
      titleKo: "발바닥·소품 Raycast 지면 밀착 및 접지 AO 강화",
      parameterPatchSummaryKo: "Z-Raycast 지면 오프셋 0.0mm 스냅 + Contact Shadow 반경 0.18m 적용",
      estimatedScoreGain: 1.2,
    },
    {
      gateId: "V08_FG_BG_CONTRAST",
      actionId: "boost-rim-and-depth-mist",
      titleKo: "전경·배경 분리용 Depth Mist & 역광 Rim +20% 부스트",
      parameterPatchSummaryKo: "16-bit Depth 패스 안개 밀도 0.06 및 후방 림라이트 강도 ×1.20 자동 증폭",
      estimatedScoreGain: 1.8,
    },
  ];

  if (preflight.shotContinuity.status !== "pass") {
    actions.unshift({
      gateId: "V07_SHOT_CONTINUITY",
      actionId: "interpolate-shot-continuity-50pct",
      titleKo: "인접 컷 카메라·조명 50% 중간 보간",
      parameterPatchSummaryKo: `권장 초점거리 ${preflight.shotContinuity.blendedFocalLengthRecommendationMm}mm 및 Key Light 회전각 50% 블렌딩`,
      estimatedScoreGain: 4.5,
    });
  }

  if (preflight.linkedInkBridge.mode !== "live-bidirectional") {
    actions.unshift({
      gateId: "V05_LINKED_INK",
      actionId: "lock-linked-ink-homography",
      titleKo: "작가 수동 가필(ink_manual_delta) 비파괴 Homography 잠금",
      parameterPatchSummaryKo: "베이스 3D 추출선 리베이킹 + 작가 가필 레이어 2D 평면 투영 보존",
      estimatedScoreGain: 3.8,
    });
  }

  const totalGain = actions.reduce((acc, a) => acc + a.estimatedScoreGain, 0);
  const projectedPostRemediationScore = round2(
    clamp(preflight.totalGateScore + totalGain * 0.45, 0, 99.6),
  );

  const styleFeedbackDelta = {
    preferredFocalLengthDeltaMm:
      preflight.archetypeRecommendation.recommendedFocalLengthMm - 35,
    preferredKelvinDelta: customKelvin - 5600,
    faceNormalSpherizeWeight: 0.65,
    rimBoostMultiplier: 1.2,
  };

  return {
    actions,
    projectedPostRemediationScore,
    styleFeedbackDelta,
    summaryKo: `원클릭 자동 보정 ${actions.length}건 준비 완료 → 예상 품질 게이트 ${preflight.totalGateScore}점 → ${projectedPostRemediationScore}점 (화풍 Δf ${styleFeedbackDelta.preferredFocalLengthDeltaMm >= 0 ? "+" : ""}${styleFeedbackDelta.preferredFocalLengthDeltaMm}mm 기록)`,
  };
}
