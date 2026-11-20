import { CheckCircle2, Copy, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "../studio-panel-ui";
import { copyStudioText } from "../studio-workbench-clipboard";

import { evaluateAgencySubmissionBatch } from "./studio-agency-submission-preview";
import {
  buildDerivativeIpChainManifest,
  DERIVATIVE_IP_MEDIUM_LABELS,
} from "./studio-derivative-ip-chain-bridge";
import { verifySeriesIpProvenanceChain } from "./studio-ip-provenance-chain-verifier";
import { buildIpSlateFundDdReport } from "./studio-ip-slate-fund-dd";
import { buildGlobalLocalizationRightsManifest } from "./studio-localization-rights-chain";
import { buildReaderTrustSealFromAudit } from "./studio-reader-trust-seal-bridge";
import { runSeriesCommercialPipeline } from "./studio-rights-monetization-pipeline";
import { evaluateVoiceSynthesisConsentLedger } from "./studio-voice-synthesis-consent-ledger";

import type { StudioWorkflowPack } from "../assistant/studio-workflow-pack";

import { ReaderTrustSealBadge } from "@/shared/components/ReaderTrustSealBadge";
import { verifyReaderTrustSealDigest } from "@/shared/lib/reader-trust-seal";
import { buildSealRevocationLedger } from "@/shared/lib/reader-trust-seal-revocation";
import { cn } from "@/shared/lib/utils";

const SAMPLE_LUMA_9X8 = new Uint8Array(72).map((_, idx) => (idx * 19) % 256);
const FIXED_PARTICIPANTS = [
  { role: "story" as const, displayName: "원작자", sharePercent: 50 },
  { role: "art" as const, displayName: "작화가", sharePercent: 35 },
  { role: "bg3d-assistant" as const, displayName: "3D·배경 어시스턴트", sharePercent: 15 },
];

/**
 * 스튜디오 제작자가 독자 열람 페이지·작품 카드에 노출될
 * 클린 IP 트러스트 배지(Reader Trust Seal), 철회 시뮬레이션, 파생 IP 승계 상태를 확인·복사하는 미리보기 카드.
 */
export function StudioReaderTrustSealPreviewCard({
  seriesTitle = "내 연재작",
  pack,
  episodeFeeKrw = 2_000_000,
}: {
  readonly seriesTitle?: string;
  readonly pack: StudioWorkflowPack;
  readonly episodeFeeKrw?: number;
}) {
  const [compactPreview, setCompactPreview] = useState(false);
  const [simulateFontRevocation, setSimulateFontRevocation] = useState(false);
  const [copied, setCopied] = useState(false);

  const { seal, digestValid, derivativeManifest } = useMemo(() => {
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

    const voiceLedger = evaluateVoiceSynthesisConsentLedger({
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
      ],
      request: {
        targetLocales: ["en-US", "ja-JP"],
        usesAiVoiceClone: true,
        usesModelTrainingReuse: false,
        releaseAtIso: "2026-12-01T00:00:00.000Z",
      },
      evaluatedAtIso: ts,
    });

    const audit10 = verifySeriesIpProvenanceChain(pipeline, dd, locManifest, voiceLedger);
    const builtSeal = buildReaderTrustSealFromAudit({
      audit: audit10,
      deliveryPackage: pipeline.deliveryPackages[0],
      localizationManifest: locManifest,
      voiceLedger,
      issuedAtIso: ts,
    });

    const revocationLedger = buildSealRevocationLedger({
      entries: simulateFontRevocation
        ? [
            {
              revocationId: "REV-SIM-FONT-01",
              sealDigestHash: builtSeal.sealDigestHash,
              reasonCode: "font-license-expired",
              reasonDetail: "외주 타이틀 폰트 연간 라이선스 만료 시뮬레이션",
              revokedAtIso: "2026-11-20T00:00:00.000Z",
            },
          ]
        : [],
      updatedAtIso: ts,
    });

    const manifest = buildDerivativeIpChainManifest({
      seal: builtSeal,
      revocationLedger,
      asOfIso: "2026-11-21T00:00:00.000Z",
      requests: [
        {
          medium: "movingtoon-shortform",
          projectTitle: `${seriesTitle} 숏폼 무빙툰`,
          partnerName: "ToonStudio Motion",
          targetLocales: ["en-US", "ja-JP"],
          requiresVoiceSynthesis: true,
        },
        {
          medium: "merchandise-goods",
          projectTitle: `${seriesTitle} 굿즈 에디션`,
          partnerName: "Studio Goods",
          targetLocales: [],
          requiresVoiceSynthesis: false,
        },
        {
          medium: "video-adaptation",
          projectTitle: `${seriesTitle} 영상화 패키지`,
          partnerName: "IP Video Partners",
          targetLocales: ["en-US"],
          requiresVoiceSynthesis: true,
        },
      ],
    });

    return {
      seal: builtSeal,
      digestValid: verifyReaderTrustSealDigest(builtSeal),
      derivativeManifest: manifest,
    };
  }, [seriesTitle, pack, episodeFeeKrw, simulateFontRevocation]);

  async function handleCopySealJson() {
    const ok = await copyStudioText(JSON.stringify(seal, null, 2));
    if (ok) {
      setCopied(true);
    }
  }

  return (
    <section
      data-testid="studio-reader-trust-seal-preview-card"
      aria-label="독자 뷰어용 클린 IP 트러스트 배지 미리보기"
      className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3 text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold">
          <ShieldCheck className="size-4 text-accent" aria-hidden />
          <span>독자 뷰어용 클린 IP 트러스트 배지 & 파생 IP 승계 미리보기</span>
        </div>
        <span
          data-testid="reader-trust-seal-digest-status"
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[0.62rem] font-bold",
            digestValid && derivativeManifest.allDerivativesCleared
              ? "bg-good/10 text-good"
              : "bg-warn/10 text-warn",
          )}
        >
          <CheckCircle2 className="size-3" aria-hidden />
          <span>
            {!digestValid
              ? "서명 해시 불일치"
              : derivativeManifest.allDerivativesCleared
                ? "서명 해시 검증됨 · 파생 IP 3종 승계 가능"
                : "철회 감지 · 파생 IP 승계 차단됨"}
          </span>
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line/70 bg-raised/60 p-2.5">
        <ReaderTrustSealBadge
          seal={seal}
          compact={compactPreview}
          liveStatus={derivativeManifest.sourceLiveStatus}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-card px-2 text-[0.64rem] font-semibold text-fg-2">
            <input
              type="checkbox"
              checked={compactPreview}
              onChange={(event) => setCompactPreview(event.target.checked)}
              className="accent-accent"
            />
            <span>카드용 컴팩트 배지 보기</span>
          </label>
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-card px-2 text-[0.64rem] font-semibold text-fg-2">
            <input
              type="checkbox"
              checked={simulateFontRevocation}
              onChange={(event) => setSimulateFontRevocation(event.target.checked)}
              className="accent-accent"
            />
            <span>폰트 만료 철회 시뮬레이션</span>
          </label>
        </div>
      </div>

      <ul
        data-testid="derivative-ip-clearance-list"
        className="flex flex-wrap gap-1.5 text-[0.62rem] font-semibold"
      >
        {derivativeManifest.items.map((item) => (
          <li
            key={item.medium}
            className={cn(
              "rounded-md border px-2 py-1",
              item.cleared
                ? "border-good/30 bg-good/10 text-good"
                : "border-warn/30 bg-warn/10 text-warn",
            )}
          >
            {DERIVATIVE_IP_MEDIUM_LABELS[item.medium]}: {item.cleared ? "승계 가능" : "승계 차단"}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2">
        <span className="font-mono text-[0.6rem] text-fg-3">
          Seal: {seal.sealDigestHash} · Derivative: {derivativeManifest.derivativeChainHash}
        </span>
        <button
          type="button"
          onClick={() => {
            void handleCopySealJson();
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border border-line bg-raised px-2.5 text-[0.64rem] font-bold text-fg hover:bg-card",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
            STUDIO_TOUCH_TARGET,
          )}
        >
          <Copy className="size-3" aria-hidden />
          <span>{copied ? "트러스트 배지 JSON 복사됨" : "트러스트 배지 JSON 복사"}</span>
        </button>
      </div>
    </section>
  );
}
