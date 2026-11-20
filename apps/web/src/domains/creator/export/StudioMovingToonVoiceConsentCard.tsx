import { CheckCircle2, Copy, Mic2, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "../studio-panel-ui";
import { copyStudioText } from "../studio-workbench-clipboard";

import { evaluateAgencySubmissionBatch } from "./studio-agency-submission-preview";
import { verifySeriesIpProvenanceChain } from "./studio-ip-provenance-chain-verifier";
import { buildIpSlateFundDdReport } from "./studio-ip-slate-fund-dd";
import { buildGlobalLocalizationRightsManifest } from "./studio-localization-rights-chain";
import { runSeriesCommercialPipeline } from "./studio-rights-monetization-pipeline";
import {
  evaluateVoiceSynthesisConsentLedger,
  formatVoiceSynthesisConsentMarkdown,
} from "./studio-voice-synthesis-consent-ledger";

import type { StudioWorkflowPack } from "../assistant/studio-workflow-pack";

import { cn } from "@/shared/lib/utils";

const SAMPLE_LUMA_9X8 = new Uint8Array(72).map((_, idx) => (idx * 19) % 256);
const FIXED_PARTICIPANTS = [
  { role: "story" as const, displayName: "원작자", sharePercent: 50 },
  { role: "art" as const, displayName: "작화가", sharePercent: 35 },
  { role: "bg3d-assistant" as const, displayName: "3D·배경 어시스턴트", sharePercent: 15 },
];

export function StudioMovingToonVoiceConsentCard({
  seriesTitle = "내 연재작",
  pack,
  episodeFeeKrw = 2_000_000,
}: {
  readonly seriesTitle?: string;
  readonly pack: StudioWorkflowPack;
  readonly episodeFeeKrw?: number;
}) {
  const [usesAiVoiceClone, setUsesAiVoiceClone] = useState(true);
  const [usesModelTrainingReuse, setUsesModelTrainingReuse] = useState(false);
  const [copied, setCopied] = useState(false);

  const { voiceLedger, audit10 } = useMemo(() => {
    const ts = "2026-11-20T00:00:00.000Z";
    const subId = `SUB-${pack.id}`;
    const pipeline = runSeriesCommercialPipeline({
      seriesTitle,
      rightsHolder: pack.teamPolicyLock?.teamLabel ?? "ToonStudio Creator",
      tier: "episode-serialization-only",
      participants: FIXED_PARTICIPANTS,
      episodes: [1, 2, 3].map((ep) => ({
        episodeLabel: `${ep}화`,
        pack,
        cuts: [{ cutId: `${subId}-ep${ep}-c01`, luma9x8: SAMPLE_LUMA_9X8 }],
        baseLicenseFeeKrw: episodeFeeKrw,
      })),
      platformFeeBps: 500,
      timestampIso: ts,
    });

    const batch = evaluateAgencySubmissionBatch(
      [
        {
          submissionId: subId,
          seriesTitle,
          rightsHolder: pack.teamPolicyLock?.teamLabel ?? "ToonStudio Creator",
          pack,
          episodeCount: 3,
          proposedEpisodeFeeKrw: episodeFeeKrw,
          tier: "episode-serialization-only",
          participants: FIXED_PARTICIPANTS,
          platformFeeBps: 500,
        },
      ],
      ts,
    );

    const dd = buildIpSlateFundDdReport({
      fundName: "ToonStudio IP Slate",
      batchReport: batch,
      targetSlateBudgetKrw: 10_000_000,
      evaluatedAtIso: ts,
    });

    const receiptHash = pipeline.seriesDossier.episodes[0]?.integrityHash ?? "";
    const packageHash = pipeline.deliveryPackages[0]?.packageIntegrityHash ?? "";

    const locManifest = buildGlobalLocalizationRightsManifest({
      seriesTitle,
      episodeLabel: "1화",
      sourceReceiptIntegrityHash: receiptHash,
      sourcePackageIntegrityHash: packageHash,
      tracks: [
        {
          locale: "en-US",
          translatorLabel: "북미 현지화 팀",
          letteringFontAsset: "ToonStudio Sans EN",
          letteringFontLicense: "MIT",
          sfxAssetLicense: "CC0",
          aiTranslationUsed: true,
          humanPostEdited: true,
          includesVoiceDubbing: true,
          voiceActorConsentVerified: true,
        },
        {
          locale: "ja-JP",
          translatorLabel: "일본 현지화 팀",
          letteringFontAsset: "Source Han Sans JP",
          letteringFontLicense: "MIT",
          sfxAssetLicense: "CC0",
          aiTranslationUsed: true,
          humanPostEdited: true,
          includesVoiceDubbing: true,
          voiceActorConsentVerified: true,
        },
      ],
      issuedAtIso: ts,
    });

    const ledger = evaluateVoiceSynthesisConsentLedger({
      seriesTitle,
      episodeLabel: "1화",
      sourceReceiptIntegrityHash: receiptHash,
      localizationChainHash: locManifest.localizationChainHash,
      contracts: [
        {
          contractId: "VA-MAIN-01",
          characterName: "주연 캐릭터 A",
          voiceActorName: "전속 성우 1",
          allowedLocales: ["en-US", "ja-JP"],
          allowAiVoiceClone: true,
          allowModelTrainingReuse: false,
          royaltyPerEpisodeKrw: 300_000,
          consentExpiresAtIso: "2028-12-31T23:59:59.000Z",
        },
        {
          contractId: "VA-MAIN-02",
          characterName: "주연 캐릭터 B",
          voiceActorName: "전속 성우 2",
          allowedLocales: ["en-US", "ja-JP"],
          allowAiVoiceClone: true,
          allowModelTrainingReuse: false,
          royaltyPerEpisodeKrw: 250_000,
          consentExpiresAtIso: "2028-12-31T23:59:59.000Z",
        },
      ],
      request: {
        targetLocales: ["en-US", "ja-JP"],
        usesAiVoiceClone,
        usesModelTrainingReuse,
        releaseAtIso: "2026-12-01T00:00:00.000Z",
      },
      evaluatedAtIso: ts,
    });

    return {
      voiceLedger: ledger,
      audit10: verifySeriesIpProvenanceChain(pipeline, dd, locManifest, ledger),
    };
  }, [seriesTitle, pack, episodeFeeKrw, usesAiVoiceClone, usesModelTrainingReuse]);

  async function handleCopyVoiceMarkdown() {
    const ok = await copyStudioText(formatVoiceSynthesisConsentMarkdown(voiceLedger));
    if (ok) {
      setCopied(true);
    }
  }

  return (
    <section
      data-testid="studio-movingtoon-voice-consent-card"
      aria-label="무빙툰 성우 AI 음성권 및 10단계 공급망 검증"
      className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3 text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold">
          <Mic2 className="size-4 text-accent" aria-hidden />
          <span>무빙툰 성우 AI 음성권 원장 & 10단계 완결 검증</span>
        </div>
        <span
          data-testid="voice-consent-status-badge"
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[0.62rem] font-bold",
            audit10.allStagesVerified ? "bg-good/10 text-good" : "bg-warn/10 text-warn",
          )}
        >
          {audit10.allStagesVerified ? (
            <CheckCircle2 className="size-3" aria-hidden />
          ) : (
            <ShieldAlert className="size-3" aria-hidden />
          )}
          <span>
            {audit10.allStagesVerified
              ? `10/10 완결 통과 · 로열티 ${voiceLedger.totalVoiceRoyaltyKrw.toLocaleString("ko-KR")}원`
              : `보류 구간 ${audit10.brokenStages.join(", ")}`}
          </span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[0.64rem] font-semibold text-fg-2">
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-raised px-2">
          <input
            type="checkbox"
            checked={usesAiVoiceClone}
            onChange={(event) => {
              setUsesAiVoiceClone(event.target.checked);
              setCopied(false);
            }}
            className="accent-accent"
          />
          <span>다국어 AI 음성 합성 사용 (계약 동의됨)</span>
        </label>
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-raised px-2">
          <input
            type="checkbox"
            checked={usesModelTrainingReuse}
            onChange={(event) => {
              setUsesModelTrainingReuse(event.target.checked);
              setCopied(false);
            }}
            className="accent-accent"
          />
          <span>외부 파운데이션 모델 학습 재사용 요청</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2">
        <span className="font-mono text-[0.6rem] text-fg-3">
          Voice Hash: {voiceLedger.voiceConsentLedgerHash}
        </span>
        <button
          type="button"
          onClick={() => {
            void handleCopyVoiceMarkdown();
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border border-line bg-raised px-2.5 text-[0.64rem] font-bold text-fg hover:bg-card",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
            STUDIO_TOUCH_TARGET,
          )}
        >
          <Copy className="size-3" aria-hidden />
          <span>{copied ? "음성권 원장 복사됨" : "성우 음성권 원장 복사"}</span>
        </button>
      </div>
    </section>
  );
}
