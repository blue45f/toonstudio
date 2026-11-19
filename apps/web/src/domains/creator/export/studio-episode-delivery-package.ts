import { buildWorkflowPackExportReceiptAttachment } from "../assistant/studio-workflow-pack-export-bundle";

import {
  buildCutPerceptualRightsEntry,
  serializeCutPerceptualRightsLedger,
  type CutPerceptualRightsLedger,
} from "./studio-cut-perceptual-rights-ledger";
import {
  buildEpisodeRightsDossier,
  formatEpisodeRightsDossierMarkdown,
  type EpisodeRightsDossier,
} from "./studio-episode-rights-dossier";

import type { StudioWorkflowPack } from "../assistant/studio-workflow-pack";

export interface EpisodeDeliveryCutInput {
  readonly cutId: string;
  readonly luma9x8: Uint8Array | readonly number[];
}

export interface EpisodeDeliveryPackage {
  readonly packageSchemaVersion: 1;
  readonly seriesTitle: string;
  readonly episodeLabel: string;
  readonly commercialReady: boolean;
  readonly receiptFilename: string;
  readonly receiptJson: string;
  readonly pngTextKeyword: string;
  readonly pngTextValue: string;
  readonly ledgerFilename: string;
  readonly ledgerJson: string;
  readonly dossierFilename: string;
  readonly dossierMarkdown: string;
  readonly dossier: EpisodeRightsDossier;
  readonly ledger: CutPerceptualRightsLedger;
  readonly packageIntegrityHash: string;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * 원고 납품 ZIP에 포함되는 Rights BOM 증명서 · PNG 메타데이터 · 퍼셉추얼 원장 · IP 실사 리포트를
 * 단일 결정적 패키지로 묶어 생성한다.
 */
export function buildEpisodeDeliveryPackage(params: {
  readonly seriesTitle: string;
  readonly episodeLabel: string;
  readonly pack: StudioWorkflowPack;
  readonly cuts: readonly EpisodeDeliveryCutInput[];
  readonly generatedAtIso?: string;
}): EpisodeDeliveryPackage {
  const generatedAtIso = params.generatedAtIso ?? new Date().toISOString();
  const attachment = buildWorkflowPackExportReceiptAttachment(params.pack, generatedAtIso);

  const ledger: CutPerceptualRightsLedger = {
    ledgerSchemaVersion: 1,
    seriesTitle: params.seriesTitle,
    entries: params.cuts.map((cut) =>
      buildCutPerceptualRightsEntry({
        cutId: cut.cutId,
        episodeLabel: params.episodeLabel,
        luma9x8: cut.luma9x8,
        receipt: attachment.receipt,
        recordedAtIso: generatedAtIso,
      }),
    ),
  };

  const dossier = buildEpisodeRightsDossier(
    params.seriesTitle,
    [{ episodeLabel: params.episodeLabel, receipt: attachment.receipt }],
    generatedAtIso,
  );
  const ledgerJson = serializeCutPerceptualRightsLedger(ledger);
  const dossierMarkdown = formatEpisodeRightsDossierMarkdown(dossier);

  const packageIntegrityHash = fnv1aHex(
    JSON.stringify({
      seriesTitle: params.seriesTitle,
      episodeLabel: params.episodeLabel,
      receiptHash: attachment.receipt.integrityHash,
      dossierHash: dossier.dossierHash,
      cutHashes: ledger.entries.map((e) => e.dHash64),
    }),
  );

  return {
    packageSchemaVersion: 1,
    seriesTitle: params.seriesTitle,
    episodeLabel: params.episodeLabel,
    commercialReady: attachment.receipt.clearedForCommercialExport,
    receiptFilename: attachment.filename,
    receiptJson: attachment.content,
    pngTextKeyword: attachment.pngTextChunk.keyword,
    pngTextValue: attachment.pngTextChunk.text,
    ledgerFilename: "perceptual-rights-ledger.json",
    ledgerJson,
    dossierFilename: "IP-RIGHTS-DOSSIER.md",
    dossierMarkdown,
    dossier,
    ledger,
    packageIntegrityHash,
  };
}
