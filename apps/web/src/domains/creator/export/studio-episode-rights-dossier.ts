import type { WorkflowPackLicenseCode } from "../assistant/studio-workflow-pack";
import type { StudioWorkflowPackRightsReceipt } from "../assistant/studio-workflow-pack-rights-receipt";

export interface EpisodeRightsDossierAssetSummary {
  readonly assetLabel: string;
  readonly license: WorkflowPackLicenseCode;
  readonly commercialStatus: "cleared" | "blocked";
  readonly episodeCount: number;
}

export interface EpisodeRightsDossierEntry {
  readonly episodeLabel: string;
  readonly packId: string;
  readonly packName: string;
  readonly clearedForCommercialExport: boolean;
  readonly blockedLicenses: readonly WorkflowPackLicenseCode[];
  readonly integrityHash: string;
}

export interface EpisodeRightsDossier {
  readonly dossierSchemaVersion: 1;
  readonly seriesTitle: string;
  readonly generatedAtIso: string;
  readonly totalEpisodes: number;
  readonly clearedEpisodes: number;
  readonly blockedEpisodes: number;
  readonly commercialReadinessPercent: number;
  readonly allEpisodesCleared: boolean;
  readonly episodes: readonly EpisodeRightsDossierEntry[];
  readonly masterAssetLedger: readonly EpisodeRightsDossierAssetSummary[];
  readonly dossierHash: string;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export interface EpisodeReceiptInput {
  readonly episodeLabel: string;
  readonly receipt: StudioWorkflowPackRightsReceipt;
}

/**
 * 여러 회차의 `rights-bom-receipt.json`을 하나의 연재작 IP 실사(Due-Diligence) 리포트로 집계한다.
 */
export function buildEpisodeRightsDossier(
  seriesTitle: string,
  entries: readonly EpisodeReceiptInput[],
  generatedAtIso = new Date().toISOString(),
): EpisodeRightsDossier {
  const episodes: EpisodeRightsDossierEntry[] = entries.map(({ episodeLabel, receipt }) => ({
    episodeLabel,
    packId: receipt.packId,
    packName: receipt.packName,
    clearedForCommercialExport: receipt.clearedForCommercialExport,
    blockedLicenses: receipt.blockedLicenses,
    integrityHash: receipt.integrityHash,
  }));

  const assetMap = new Map<
    string,
    {
      assetLabel: string;
      license: WorkflowPackLicenseCode;
      commercialStatus: "cleared" | "blocked";
      episodeCount: number;
    }
  >();

  for (const { receipt } of entries) {
    const seenInEpisode = new Set<string>();
    for (const asset of receipt.assets) {
      const key = `${asset.assetLabel}::${asset.license}`;
      if (seenInEpisode.has(key)) continue;
      seenInEpisode.add(key);

      const existing = assetMap.get(key);
      if (existing) {
        existing.episodeCount += 1;
      } else {
        assetMap.set(key, {
          assetLabel: asset.assetLabel,
          license: asset.license,
          commercialStatus: asset.commercialStatus,
          episodeCount: 1,
        });
      }
    }
  }

  const masterAssetLedger = [...assetMap.values()].sort((a, b) =>
    a.assetLabel.localeCompare(b.assetLabel, "ko"),
  );

  const totalEpisodes = episodes.length;
  const clearedEpisodes = episodes.filter((ep) => ep.clearedForCommercialExport).length;
  const blockedEpisodes = totalEpisodes - clearedEpisodes;
  const commercialReadinessPercent =
    totalEpisodes > 0 ? Math.round((clearedEpisodes / totalEpisodes) * 100) : 100;

  const canonical = JSON.stringify({
    seriesTitle,
    episodes: episodes.map((ep) => ({
      episodeLabel: ep.episodeLabel,
      integrityHash: ep.integrityHash,
      cleared: ep.clearedForCommercialExport,
    })),
  });

  return {
    dossierSchemaVersion: 1,
    seriesTitle,
    generatedAtIso,
    totalEpisodes,
    clearedEpisodes,
    blockedEpisodes,
    commercialReadinessPercent,
    allEpisodesCleared: totalEpisodes > 0 && blockedEpisodes === 0,
    episodes,
    masterAssetLedger,
    dossierHash: fnv1aHex(canonical),
  };
}

/**
 * 플랫폼 계약·IP 2차 판권 실사 제출용 Markdown 요약 문서를 생성한다.
 */
export function formatEpisodeRightsDossierMarkdown(dossier: EpisodeRightsDossier): string {
  const episodeRows = dossier.episodes.map(
    (ep) =>
      `| ${ep.episodeLabel} | ${ep.packName} | ${ep.clearedForCommercialExport ? "PASS" : `BLOCKED (${ep.blockedLicenses.join(", ")})`} | \`${ep.integrityHash}\` |`,
  );
  const assetRows = dossier.masterAssetLedger.map(
    (asset) =>
      `| ${asset.assetLabel} | ${asset.license} | ${asset.commercialStatus === "cleared" ? "상업 클린" : "제한됨"} | ${asset.episodeCount}화 |`,
  );

  return [
    `# IP 저작권 실사 리포트 — ${dossier.seriesTitle}`,
    `- 집계 시각: ${dossier.generatedAtIso}`,
    `- 전체 회차: ${dossier.totalEpisodes}화 (통과 ${dossier.clearedEpisodes} / 제한 ${dossier.blockedEpisodes} · 상업 준비도 ${dossier.commercialReadinessPercent}%)`,
    `- 마스터 해시: \`${dossier.dossierHash}\``,
    "",
    "## 회차별 검증 현황",
    "| 회차 | 워크플로우 팩 | 상업 판정 | 무결성 해시 |",
    "| --- | --- | --- | --- |",
    ...episodeRows,
    "",
    "## 에셋 라이선스 원장",
    "| 에셋명 | 라이선스 | 판정 | 사용 회차 |",
    "| --- | --- | --- | --- |",
    ...assetRows,
  ].join("\n");
}
