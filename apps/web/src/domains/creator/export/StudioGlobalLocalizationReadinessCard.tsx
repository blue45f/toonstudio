import { CheckCircle2, Copy, Globe2, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "../studio-panel-ui";
import { copyStudioText } from "../studio-workbench-clipboard";

import { evaluateAgencySubmissionBatch } from "./studio-agency-submission-preview";
import { verifySeriesIpProvenanceChain } from "./studio-ip-provenance-chain-verifier";
import { buildIpSlateFundDdReport } from "./studio-ip-slate-fund-dd";
import {
  buildGlobalLocalizationRightsManifest,
  formatGlobalLocalizationRightsMarkdown,
  type SupportedGlobalLocale,
} from "./studio-localization-rights-chain";
import { runSeriesCommercialPipeline } from "./studio-rights-monetization-pipeline";

import type { StudioWorkflowPack } from "../assistant/studio-workflow-pack";

import { cn } from "@/shared/lib/utils";

const SAMPLE_LUMA_9X8 = new Uint8Array(72).map((_, idx) => (idx * 19) % 256);
const FIXED_PARTICIPANTS = [
  { role: "story" as const, displayName: "원작자", sharePercent: 50 },
  { role: "art" as const, displayName: "작화가", sharePercent: 35 },
  { role: "bg3d-assistant" as const, displayName: "3D·배경 어시스턴트", sharePercent: 15 },
];

const DEFAULT_LOCALES: readonly {
  readonly locale: SupportedGlobalLocale;
  readonly label: string;
  readonly font: string;
}[] = [
  { locale: "en-US", label: "영어 (북미)", font: "ToonStudio Sans EN" },
  { locale: "ja-JP", label: "일본어", font: "Source Han Sans JP" },
  { locale: "es-ES", label: "스페인어", font: "ToonStudio Sans ES" },
];

export function StudioGlobalLocalizationReadinessCard({
  seriesTitle = "내 연재작",
  pack,
  episodeFeeKrw = 2_000_000,
}: {
  readonly seriesTitle?: string;
  readonly pack: StudioWorkflowPack;
  readonly episodeFeeKrw?: number;
}) {
  const [humanPostEdited, setHumanPostEdited] = useState(true);
  const [includesDubbing, setIncludesDubbing] = useState(false);
  const [voiceConsentVerified, setVoiceConsentVerified] = useState(true);
  const [copied, setCopied] = useState(false);

  const { locManifest, audit9 } = useMemo(() => {
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

    const manifest = buildGlobalLocalizationRightsManifest({
      seriesTitle,
      episodeLabel: "1화",
      sourceReceiptIntegrityHash: receiptHash,
      sourcePackageIntegrityHash: packageHash,
      tracks: DEFAULT_LOCALES.map((item) => ({
        locale: item.locale,
        translatorLabel: `${item.label} 현지화 팀`,
        letteringFontAsset: item.font,
        letteringFontLicense: "MIT",
        sfxAssetLicense: "CC0",
        aiTranslationUsed: true,
        humanPostEdited,
        includesVoiceDubbing: includesDubbing,
        voiceActorConsentVerified: voiceConsentVerified,
      })),
      issuedAtIso: ts,
    });

    return {
      locManifest: manifest,
      audit9: verifySeriesIpProvenanceChain(pipeline, dd, manifest),
    };
  }, [seriesTitle, pack, episodeFeeKrw, humanPostEdited, includesDubbing, voiceConsentVerified]);

  async function handleCopyMarkdown() {
    const ok = await copyStudioText(formatGlobalLocalizationRightsMarkdown(locManifest));
    if (ok) {
      setCopied(true);
    }
  }

  return (
    <section
      data-testid="studio-global-localization-card"
      aria-label="글로벌 동시 연재 9단계 현지화 공급망 검증"
      className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3 text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold">
          <Globe2 className="size-4 text-accent" aria-hidden />
          <span>글로벌 다국어(EN·JA·ES) 현지화 & 9단계 공급망 검증</span>
        </div>
        <span
          data-testid="global-localization-badge"
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[0.62rem] font-bold",
            audit9.allStagesVerified ? "bg-good/10 text-good" : "bg-warn/10 text-warn",
          )}
        >
          {audit9.allStagesVerified ? (
            <CheckCircle2 className="size-3" aria-hidden />
          ) : (
            <ShieldAlert className="size-3" aria-hidden />
          )}
          <span>
            {audit9.allStagesVerified
              ? `9/9 글로벌 체인 통과 · ${locManifest.clearedLocaleCount}개국`
              : `보류 구간 ${audit9.brokenStages.join(", ")}`}
          </span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[0.64rem] font-semibold text-fg-2">
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-raised px-2">
          <input
            type="checkbox"
            checked={humanPostEdited}
            onChange={(event) => {
              setHumanPostEdited(event.target.checked);
              setCopied(false);
            }}
            className="accent-accent"
          />
          <span>AI 번역 인간 감수 완료</span>
        </label>
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-raised px-2">
          <input
            type="checkbox"
            checked={includesDubbing}
            onChange={(event) => {
              setIncludesDubbing(event.target.checked);
              setCopied(false);
            }}
            className="accent-accent"
          />
          <span>보이스 더빙 포함</span>
        </label>
        {includesDubbing ? (
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-raised px-2">
            <input
              type="checkbox"
              checked={voiceConsentVerified}
              onChange={(event) => {
                setVoiceConsentVerified(event.target.checked);
                setCopied(false);
              }}
              className="accent-accent"
            />
            <span>성우 권리 동의 검증됨</span>
          </label>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2">
        <span className="font-mono text-[0.6rem] text-fg-3">
          Localization Hash: {locManifest.localizationChainHash}
        </span>
        <button
          type="button"
          onClick={() => {
            void handleCopyMarkdown();
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border border-line bg-raised px-2.5 text-[0.64rem] font-bold text-fg hover:bg-card",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
            STUDIO_TOUCH_TARGET,
          )}
        >
          <Copy className="size-3" aria-hidden />
          <span>{copied ? "글로벌 승인서 복사됨" : "글로벌 배포 승인서 복사"}</span>
        </button>
      </div>
    </section>
  );
}
