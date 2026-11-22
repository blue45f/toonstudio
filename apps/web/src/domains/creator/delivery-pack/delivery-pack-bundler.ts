/**
 * 화수 일괄 납품 패키지 번들러 (Rights BOM 증명서 Markdown + delivery-manifest.json + ZIP).
 *
 * PRODUCT.md 규칙을 fail-closed로 강제한다:
 * - 상업 이용 불가(`non-commercial` / `restricted` / `unknown`), 출처 표기 누락,
 *   라이선스 만료 소재가 1건이라도 있으면 증명서·매니페스트·ZIP을 생성하지 않고 차단한다.
 * - 모든 검사를 통과한 경우에만 `RIGHTS-BOM-CERTIFICATE.md`, `delivery-manifest.json`,
 *   표준 파일 목록(`EP01_001.jpg` 등)과 결정적 ZIP 바이너리를 일괄 생성한다.
 */

import { zipSync, type Zippable } from "fflate";

import {
  getDeliveryPlatformSpec,
  resolveDeliveryFormat,
  type DeliveryImageFormat,
  type DeliveryPlatformId,
} from "./platform-delivery-specs";
import {
  DELIVERY_BOM_CATEGORY_LABELS,
  validateDeliveryRightsBom,
  type DeliveryRightsBomAsset,
  type DeliveryRightsBomAuditReport,
} from "./rights-bom-validator";
import {
  planBatchEpisodeDelivery,
  type BatchEpisodeDeliveryPlan,
  type EpisodeSliceInput,
} from "./safe-slice-planner";

export const EPISODE_DELIVERY_MANIFEST_SCHEMA_VERSION = 1 as const;
export const RIGHTS_BOM_CERTIFICATE_PATH = "RIGHTS-BOM-CERTIFICATE.md" as const;
export const DELIVERY_MANIFEST_PATH = "delivery-manifest.json" as const;

export interface BuildEpisodeDeliveryPackInput {
  readonly projectId: string;
  readonly seriesTitle: string;
  readonly authorName: string;
  readonly platformId: DeliveryPlatformId;
  readonly format?: DeliveryImageFormat;
  readonly episodes: readonly EpisodeSliceInput[];
  readonly rightsBomAssets: readonly DeliveryRightsBomAsset[];
  readonly generatedAt?: string;
}

export interface DeliveryPackFileEntry {
  readonly zipPath: string;
  readonly fileName: string;
  readonly role: "certificate" | "manifest" | "slice";
  readonly mimeType: string;
  readonly estimatedBytes: number;
  readonly episodeNumber?: number;
  readonly sliceIndex?: number;
}

export interface EpisodeDeliveryManifest {
  readonly schemaVersion: typeof EPISODE_DELIVERY_MANIFEST_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly projectId: string;
  readonly seriesTitle: string;
  readonly authorName: string;
  readonly digest: string;
  readonly platform: {
    readonly id: DeliveryPlatformId;
    readonly labelKo: string;
    readonly labelEn: string;
    readonly targetWidthPx: number;
    readonly maxSliceHeightPx: number;
    readonly maxSliceBytes: number;
    readonly maxEpisodeBytes: number;
    readonly format: DeliveryImageFormat;
    readonly colorSpace: "srgb";
  };
  readonly rightsCertification: {
    readonly clearedForDelivery: true;
    readonly evaluatedAt: string;
    readonly totalAssetCount: number;
    readonly attributionRequiredCount: number;
    readonly warningCount: number;
    readonly certificatePath: typeof RIGHTS_BOM_CERTIFICATE_PATH;
    readonly attributionLines: readonly string[];
    readonly assets: readonly {
      readonly id: string;
      readonly name: string;
      readonly category: DeliveryRightsBomAsset["category"];
      readonly licenseStatus: DeliveryRightsBomAsset["licenseStatus"];
      readonly licenseCode: string;
      readonly creatorOrVendor: string;
      readonly requiresAttribution: boolean;
      readonly attributionText: string | null;
      readonly sourceUrl: string | null;
      readonly licenseProofRef: string | null;
      readonly expiresAt: string | null;
    }[];
  };
  readonly summary: {
    readonly episodeCount: number;
    readonly totalSliceCount: number;
    readonly totalAdjustedCutCount: number;
    readonly totalEstimatedBytes: number;
  };
  readonly episodes: readonly {
    readonly episodeNumber: number;
    readonly episodeCode: string;
    readonly episodeTitle: string;
    readonly sourceWidthPx: number;
    readonly sourceHeightPx: number;
    readonly targetWidthPx: number;
    readonly scaledHeightPx: number;
    readonly sliceCount: number;
    readonly adjustedCutCount: number;
    readonly estimatedTotalBytes: number;
    readonly slices: readonly {
      readonly index: number;
      readonly fileName: string;
      readonly zipPath: string;
      readonly widthPx: number;
      readonly heightPx: number;
      readonly yStartPx: number;
      readonly yEndPx: number;
      readonly estimatedBytes: number;
      readonly adjusted: boolean;
      readonly avoidedZoneIds: readonly string[];
    }[];
  }[];
  readonly files: readonly DeliveryPackFileEntry[];
}

export interface EpisodeDeliveryPackBlockedResult {
  readonly ok: false;
  readonly blocked: true;
  readonly blockReasons: readonly string[];
  readonly rightsReport: DeliveryRightsBomAuditReport;
  readonly batchPlan: BatchEpisodeDeliveryPlan;
  readonly digest: null;
  readonly certificateMarkdown: null;
  readonly manifest: null;
  readonly manifestJson: null;
  readonly files: readonly [];
}

export interface EpisodeDeliveryPackClearedResult {
  readonly ok: true;
  readonly blocked: false;
  readonly blockReasons: readonly [];
  readonly rightsReport: DeliveryRightsBomAuditReport;
  readonly batchPlan: BatchEpisodeDeliveryPlan;
  readonly digest: string;
  readonly certificateMarkdown: string;
  readonly manifest: EpisodeDeliveryManifest;
  readonly manifestJson: string;
  readonly files: readonly DeliveryPackFileEntry[];
}

export type EpisodeDeliveryPackResult =
  | EpisodeDeliveryPackBlockedResult
  | EpisodeDeliveryPackClearedResult;

const ZIP_FIXED_MTIME = new Date(Date.UTC(2026, 0, 1));
const STORE_ONLY_EXTENSION = /\.(?:jpe?g|png|webp|gif|zip)$/iu;
const MAX_ZIP_TOTAL_BYTES = 500 * 1024 * 1024;
const textEncoder = new TextEncoder();

function fnv1aHex(input: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function computeDeterministicDigest(payload: string): string {
  const partA = fnv1aHex(payload, 0x811c9dc5);
  const partB = fnv1aHex(`${payload.length}:${payload}`, 0x9e3779b1);
  return `tsbom-${partA}${partB}`;
}

function escapeMarkdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\r", " ").replaceAll("\n", " ").trim();
}

function formatLicenseStatusKo(status: DeliveryRightsBomAsset["licenseStatus"]): string {
  switch (status) {
    case "commercial-allowed":
      return "상업 허용";
    case "commercial-attribution":
      return "상업 허용(출처 필수)";
    case "non-commercial":
      return "비상업 전용(차단)";
    case "restricted":
      return "제한(차단)";
    case "unknown":
      return "미확인(차단)";
  }
}

function buildRightsBomCertificateMarkdown(params: {
  readonly projectId: string;
  readonly seriesTitle: string;
  readonly authorName: string;
  readonly generatedAt: string;
  readonly digest: string;
  readonly rightsReport: DeliveryRightsBomAuditReport;
  readonly assets: readonly DeliveryRightsBomAsset[];
  readonly batchPlan: BatchEpisodeDeliveryPlan;
}): string {
  const { projectId, seriesTitle, authorName, generatedAt, digest, rightsReport, assets, batchPlan } = params;
  const spec = batchPlan.platformSpec;
  const episodeCodes = batchPlan.episodes.map((ep) => ep.episodeCode).join(", ");
  const lines: string[] = [
    "# 상업 납품 Rights BOM 증명서 (RIGHTS-BOM-CERTIFICATE)",
    "",
    `- **검증 판정**: 상업 납품 적합 (CLEARED · 차단 사유 0건)`,
    `- **작품명**: ${escapeMarkdownCell(seriesTitle)}`,
    `- **작가 / 제작사**: ${escapeMarkdownCell(authorName)}`,
    `- **프로젝트 ID**: \`${escapeMarkdownCell(projectId)}\``,
    `- **대상 플랫폼**: ${spec.labelKo} (${spec.labelEn}) — 가로 ${spec.targetWidthPx}px · 조각당 최대 ${spec.maxSliceHeightPx}px · ${batchPlan.format.toUpperCase()}`,
    `- **납품 회차**: ${episodeCodes} (총 ${batchPlan.episodeCount}화 · ${batchPlan.totalSliceCount}조각)`,
    `- **발급 시각(UTC)**: ${generatedAt}`,
    `- **증명서 다이제스트**: \`${digest}\``,
    "",
    "## 1. Rights BOM 검증 요약",
    "",
    "| 항목 | 수량 | 상태 |",
    "| --- | ---: | --- |",
    `| 총 점검 소재 | ${rightsReport.totalAssetCount} | 완료 |`,
    `| 상업 이용 적합 소재 | ${rightsReport.clearedAssetCount} | 통과 |`,
    `| 상업 불가 / 제한 / 출처 누락 | ${rightsReport.blockedAssetCount} | 0건 (통과) |`,
    `| 출처 표기 의무 소재 | ${rightsReport.attributionRequiredCount} | 전원 표기 완료 |`,
    `| 만료 임박 주의(30일 이내) | ${rightsReport.warningCount} | ${rightsReport.warningCount === 0 ? "없음" : "사전 확인 권장"} |`,
    "",
    "## 2. 사용 소재 권리 명세표",
    "",
  ];

  if (assets.length === 0) {
    lines.push("등록된 외부 제3자 소재가 없습니다(100% 자체 창작 원고 기준).", "");
  } else {
    lines.push(
      "| ID | 구분 | 소재명 | 라이선스 코드 | 상업 상태 | 권리자 / 제작사 | 출처 표기 | 증빙 / 만료일 |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const asset of assets) {
      const catLabel = DELIVERY_BOM_CATEGORY_LABELS[asset.category].ko;
      const attribution = asset.attributionText?.trim() || (asset.requiresAttribution ? "필수" : "불필요");
      const proofParts: string[] = [];
      if (asset.licenseProofRef?.trim()) proofParts.push(asset.licenseProofRef.trim());
      if (asset.expiresAt?.trim()) proofParts.push(`만료 ${asset.expiresAt.slice(0, 10)}`);
      const proofText = proofParts.length > 0 ? proofParts.join(" · ") : "—";
      lines.push(
        `| \`${escapeMarkdownCell(asset.id)}\` | ${catLabel} | ${escapeMarkdownCell(asset.name)} | \`${escapeMarkdownCell(asset.licenseCode)}\` | ${formatLicenseStatusKo(asset.licenseStatus)} | ${escapeMarkdownCell(asset.creatorOrVendor || "미기재")} | ${escapeMarkdownCell(attribution)} | ${escapeMarkdownCell(proofText)} |`,
      );
    }
    lines.push("");
  }

  lines.push("## 3. 플랫폼 게시용 필수 출처(크레딧) 표기", "");
  if (rightsReport.attributionLines.length === 0) {
    lines.push("- 출처 표기가 필수인 소재가 없습니다.", "");
  } else {
    for (const credit of rightsReport.attributionLines) {
      lines.push(`- ${credit}`);
    }
    lines.push("");
  }

  lines.push("## 4. 회차별 분할 파일 요약", "");
  lines.push("| 회차 | 원본 크기 | 납품 크기 | 조각 수 | 안전 절단 보정 | 예상 용량 |");
  lines.push("| --- | --- | --- | ---: | ---: | ---: |");
  for (const episode of batchPlan.episodes) {
    const mb = (episode.estimatedTotalBytes / (1024 * 1024)).toFixed(2);
    lines.push(
      `| ${episode.episodeCode} (${escapeMarkdownCell(episode.episodeTitle)}) | ${episode.sourceWidthPx}×${episode.sourceHeightPx}px | ${episode.targetWidthPx}×${episode.scaledHeightPx}px | ${episode.sliceCount} | ${episode.adjustedCutCount}곳 | ${mb}MB |`,
    );
  }

  lines.push(
    "",
    "---",
    "",
    "> 안내: 본 증명서는 ToonStudio Rights BOM 스냅샷을 기준으로 자동 검증한 납품 첨부 문서입니다. 실제 상업 계약의 최종 법적 효력은 각 소재의 원본 라이선스 문서 및 구매 증빙에 따릅니다.",
    "",
  );

  return lines.join("\n");
}

function assertSafeZipPath(path: string): void {
  if (!/^[A-Za-z0-9_./-]+$/u.test(path) || path.startsWith("/") || path.split("/").includes("..")) {
    throw new Error(`안전하지 않은 ZIP 파일 경로입니다: ${path}`);
  }
}

/**
 * Rights BOM 상업 라이선스 검증과 플랫폼 자동 슬라이스를 결합해 일괄 납품 패키지를 구성한다.
 * 차단 사유가 1건이라도 있으면 fail-closed로 증명서·매니페스트 생성을 거부한다.
 */
export function buildEpisodeDeliveryPack(
  input: BuildEpisodeDeliveryPackInput,
): EpisodeDeliveryPackResult {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new Error("납품 패키지 생성 시각(generatedAt)이 올바른 ISO 날짜 형식이 아닙니다.");
  }

  const projectId = input.projectId.trim();
  const seriesTitle = input.seriesTitle.trim() || "제목 없는 웹툰";
  const authorName = input.authorName.trim() || "ToonStudio 창작자";
  const format = resolveDeliveryFormat(input.platformId, input.format);
  const spec = getDeliveryPlatformSpec(input.platformId);

  const rightsReport = validateDeliveryRightsBom(input.rightsBomAssets, {
    evaluatedAt: generatedAt,
  });
  const batchPlan = planBatchEpisodeDelivery(input.episodes, {
    platformId: input.platformId,
    format,
  });

  const blockReasons: string[] = [];
  if (!projectId) {
    blockReasons.push("프로젝트 ID가 비어 있어 납품 패키지를 생성할 수 없습니다.");
  }
  if (input.episodes.length === 0) {
    blockReasons.push("납품할 화수가 1화 이상 필요합니다.");
  }
  for (const blocker of rightsReport.blockers) {
    blockReasons.push(`[Rights BOM] ${blocker.messageKo}`);
  }
  for (const diag of batchPlan.diagnostics) {
    if (diag.severity === "blocker") {
      blockReasons.push(`[규격] ${diag.messageKo}`);
    }
  }

  if (blockReasons.length > 0 || !rightsReport.clearedForDelivery || !batchPlan.valid) {
    return Object.freeze({
      ok: false,
      blocked: true,
      blockReasons: Object.freeze(blockReasons),
      rightsReport,
      batchPlan,
      digest: null,
      certificateMarkdown: null,
      manifest: null,
      manifestJson: null,
      files: Object.freeze([] as const),
    });
  }

  const digestSeed = JSON.stringify({
    projectId,
    seriesTitle,
    platformId: input.platformId,
    format,
    generatedAt,
    assets: input.rightsBomAssets.map((a) => [a.id, a.licenseStatus, a.licenseCode, a.attributionText ?? ""]),
    episodes: batchPlan.episodes.map((ep) => [
      ep.episodeCode,
      ep.slices.map((s) => [s.fileName, s.widthPx, s.heightPx, s.yStartPx, s.yEndPx]),
    ]),
  });
  const digest = computeDeterministicDigest(digestSeed);

  const certificateMarkdown = buildRightsBomCertificateMarkdown({
    projectId,
    seriesTitle,
    authorName,
    generatedAt,
    digest,
    rightsReport,
    assets: input.rightsBomAssets,
    batchPlan,
  });

  const sliceFiles: DeliveryPackFileEntry[] = [];
  for (const episode of batchPlan.episodes) {
    for (const slice of episode.slices) {
      sliceFiles.push(
        Object.freeze({
          zipPath: slice.zipPath,
          fileName: slice.fileName,
          role: "slice",
          mimeType: slice.mimeType,
          estimatedBytes: slice.estimatedBytes,
          episodeNumber: episode.episodeNumber,
          sliceIndex: slice.index,
        }),
      );
    }
  }

  const certificateBytes = textEncoder.encode(certificateMarkdown).byteLength;

  const baseManifestPayload = {
    schemaVersion: EPISODE_DELIVERY_MANIFEST_SCHEMA_VERSION,
    generatedAt,
    projectId,
    seriesTitle,
    authorName,
    digest,
    platform: Object.freeze({
      id: spec.id,
      labelKo: spec.labelKo,
      labelEn: spec.labelEn,
      targetWidthPx: spec.targetWidthPx,
      maxSliceHeightPx: spec.maxSliceHeightPx,
      maxSliceBytes: spec.maxSliceBytes,
      maxEpisodeBytes: spec.maxEpisodeBytes,
      format,
      colorSpace: spec.colorSpace,
    }),
    rightsCertification: Object.freeze({
      clearedForDelivery: true as const,
      evaluatedAt: rightsReport.evaluatedAt,
      totalAssetCount: rightsReport.totalAssetCount,
      attributionRequiredCount: rightsReport.attributionRequiredCount,
      warningCount: rightsReport.warningCount,
      certificatePath: RIGHTS_BOM_CERTIFICATE_PATH,
      attributionLines: rightsReport.attributionLines,
      assets: Object.freeze(
        input.rightsBomAssets.map((asset) =>
          Object.freeze({
            id: asset.id,
            name: asset.name,
            category: asset.category,
            licenseStatus: asset.licenseStatus,
            licenseCode: asset.licenseCode,
            creatorOrVendor: asset.creatorOrVendor,
            requiresAttribution: asset.requiresAttribution,
            attributionText: asset.attributionText?.trim() || null,
            sourceUrl: asset.sourceUrl?.trim() || null,
            licenseProofRef: asset.licenseProofRef?.trim() || null,
            expiresAt: asset.expiresAt?.trim() || null,
          }),
        ),
      ),
    }),
    summary: Object.freeze({
      episodeCount: batchPlan.episodeCount,
      totalSliceCount: batchPlan.totalSliceCount,
      totalAdjustedCutCount: batchPlan.totalAdjustedCutCount,
      totalEstimatedBytes: batchPlan.totalEstimatedBytes,
    }),
    episodes: Object.freeze(
      batchPlan.episodes.map((episode) =>
        Object.freeze({
          episodeNumber: episode.episodeNumber,
          episodeCode: episode.episodeCode,
          episodeTitle: episode.episodeTitle,
          sourceWidthPx: episode.sourceWidthPx,
          sourceHeightPx: episode.sourceHeightPx,
          targetWidthPx: episode.targetWidthPx,
          scaledHeightPx: episode.scaledHeightPx,
          sliceCount: episode.sliceCount,
          adjustedCutCount: episode.adjustedCutCount,
          estimatedTotalBytes: episode.estimatedTotalBytes,
          slices: Object.freeze(
            episode.slices.map((slice) =>
              Object.freeze({
                index: slice.index,
                fileName: slice.fileName,
                zipPath: slice.zipPath,
                widthPx: slice.widthPx,
                heightPx: slice.heightPx,
                yStartPx: slice.yStartPx,
                yEndPx: slice.yEndPx,
                estimatedBytes: slice.estimatedBytes,
                adjusted: slice.adjusted,
                avoidedZoneIds: slice.avoidedZoneIds,
              }),
            ),
          ),
        }),
      ),
    ),
  };

  const certificateFile: DeliveryPackFileEntry = Object.freeze({
    zipPath: RIGHTS_BOM_CERTIFICATE_PATH,
    fileName: RIGHTS_BOM_CERTIFICATE_PATH,
    role: "certificate",
    mimeType: "text/markdown;charset=utf-8",
    estimatedBytes: certificateBytes,
  });

  const preliminaryFiles: DeliveryPackFileEntry[] = [
    certificateFile,
    Object.freeze({
      zipPath: DELIVERY_MANIFEST_PATH,
      fileName: DELIVERY_MANIFEST_PATH,
      role: "manifest",
      mimeType: "application/json;charset=utf-8",
      estimatedBytes: 0,
    }),
    ...sliceFiles,
  ];

  const roughJson = `${JSON.stringify({ ...baseManifestPayload, files: preliminaryFiles }, null, 2)}\n`;
  const manifestBytes = textEncoder.encode(roughJson).byteLength;

  const finalFiles: readonly DeliveryPackFileEntry[] = Object.freeze([
    certificateFile,
    Object.freeze({
      zipPath: DELIVERY_MANIFEST_PATH,
      fileName: DELIVERY_MANIFEST_PATH,
      role: "manifest",
      mimeType: "application/json;charset=utf-8",
      estimatedBytes: manifestBytes,
    }),
    ...sliceFiles,
  ]);

  const manifest: EpisodeDeliveryManifest = Object.freeze({
    ...baseManifestPayload,
    files: finalFiles,
  });
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;

  return Object.freeze({
    ok: true,
    blocked: false,
    blockReasons: Object.freeze([] as const),
    rightsReport,
    batchPlan,
    digest,
    certificateMarkdown,
    manifest,
    manifestJson,
    files: finalFiles,
  });
}

/**
 * 통과한 납품 패키지 결과를 결정적 ZIP 아카이브(`Uint8Array`)로 묶는다.
 * Rights BOM 또는 규격 검사를 통과하지 못한 결과는 즉시 예외로 차단한다.
 *
 * `sliceBlobs`에 렌더링된 슬라이스 바이너리(`zipPath -> Uint8Array`)를 전달하면 함께 포함하며,
 * 이미지 바이너리가 없는 사전 번들 모드에서는 증명서·매니페스트만 정직하게 수록한다(더미 이미지 생성 금지).
 */
export function createEpisodeDeliveryPackZip(
  pack: EpisodeDeliveryPackResult,
  sliceBlobs?: Readonly<Record<string, Uint8Array>>,
): Uint8Array {
  if (!pack.ok) {
    throw new Error(
      `Rights BOM 또는 규격 검증에서 차단된 납품 패키지는 ZIP으로 내보낼 수 없습니다: ${pack.blockReasons[0] ?? "차단됨"}`,
    );
  }

  const zippable: Zippable = {};
  let totalBytes = 0;

  const addFile = (zipPath: string, data: Uint8Array): void => {
    assertSafeZipPath(zipPath);
    totalBytes += data.byteLength;
    if (totalBytes > MAX_ZIP_TOTAL_BYTES) {
      throw new Error("납품 ZIP 총 용량이 브라우저 안전 상한(500MB)을 초과했습니다.");
    }
    zippable[zipPath] = [
      data,
      { level: STORE_ONLY_EXTENSION.test(zipPath) ? 0 : 6, mtime: ZIP_FIXED_MTIME },
    ];
  };

  addFile(RIGHTS_BOM_CERTIFICATE_PATH, textEncoder.encode(pack.certificateMarkdown));
  addFile(DELIVERY_MANIFEST_PATH, textEncoder.encode(pack.manifestJson));

  if (sliceBlobs) {
    const allowedSlicePaths = new Set(
      pack.files.filter((entry) => entry.role === "slice").map((entry) => entry.zipPath),
    );
    for (const [zipPath, bytes] of Object.entries(sliceBlobs)) {
      if (!allowedSlicePaths.has(zipPath)) {
        throw new Error(`매니페스트에 선언되지 않은 슬라이스 경로입니다: ${zipPath}`);
      }
      addFile(zipPath, bytes);
    }
  }

  return zipSync(zippable);
}
