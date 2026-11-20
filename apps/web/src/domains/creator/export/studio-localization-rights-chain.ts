import type { WorkflowPackLicenseCode } from "../assistant/studio-workflow-pack";

export type SupportedGlobalLocale =
  | "en-US"
  | "ja-JP"
  | "zh-TW"
  | "es-ES"
  | "fr-FR"
  | "th-TH"
  | "id-ID";

export interface LocalizationLocaleTrack {
  readonly locale: SupportedGlobalLocale;
  readonly translatorLabel: string;
  readonly letteringFontAsset: string;
  readonly letteringFontLicense: WorkflowPackLicenseCode;
  readonly sfxAssetLicense: WorkflowPackLicenseCode;
  readonly aiTranslationUsed: boolean;
  readonly humanPostEdited: boolean;
  readonly includesVoiceDubbing: boolean;
  readonly voiceActorConsentVerified: boolean;
}

export interface EvaluatedLocaleTrackStatus {
  readonly locale: SupportedGlobalLocale;
  readonly clearedForGlobalRelease: boolean;
  readonly issues: readonly string[];
}

export interface GlobalLocalizationRightsManifest {
  readonly localizationSchemaVersion: 1;
  readonly seriesTitle: string;
  readonly episodeLabel: string;
  readonly sourceReceiptIntegrityHash: string;
  readonly sourcePackageIntegrityHash: string;
  readonly allLocalesCleared: boolean;
  readonly clearedLocaleCount: number;
  readonly blockedLocaleCount: number;
  readonly tracks: readonly LocalizationLocaleTrack[];
  readonly trackEvaluations: readonly EvaluatedLocaleTrackStatus[];
  readonly issuedAtIso: string;
  readonly localizationChainHash: string;
}

const RESTRICTED_LICENSES: ReadonlySet<WorkflowPackLicenseCode> = new Set([
  "CC-BY-NC",
  "GPL-3.0",
]);

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * 글로벌 동시 연재용 다국어 번역·식자 폰트·현지화 효과음·보이스 더빙 동의 내역을 검증하고
 * 원작 Rights BOM 및 납품 패키지 해시에 바인딩된 현지화 공급망 매니페스트를 생성한다.
 */
export function buildGlobalLocalizationRightsManifest(params: {
  readonly seriesTitle: string;
  readonly episodeLabel: string;
  readonly sourceReceiptIntegrityHash: string;
  readonly sourcePackageIntegrityHash: string;
  readonly tracks: readonly LocalizationLocaleTrack[];
  readonly issuedAtIso?: string;
}): GlobalLocalizationRightsManifest {
  const issuedAtIso = params.issuedAtIso ?? new Date().toISOString();

  const trackEvaluations: EvaluatedLocaleTrackStatus[] = params.tracks.map((track) => {
    const issues: string[] = [];
    if (!track.translatorLabel.trim()) {
      issues.push("번역/감수 담당자 표기가 비어 있습니다.");
    }
    if (RESTRICTED_LICENSES.has(track.letteringFontLicense)) {
      issues.push(`현지 식자 폰트 라이선스 제한(${track.letteringFontLicense})`);
    }
    if (RESTRICTED_LICENSES.has(track.sfxAssetLicense)) {
      issues.push(`현지화 효과음 라이선스 제한(${track.sfxAssetLicense})`);
    }
    if (track.aiTranslationUsed && !track.humanPostEdited) {
      issues.push("기계/AI 초벌 번역 사용 시 인간 감수(humanPostEdited) 완료 확인이 필요합니다.");
    }
    if (track.includesVoiceDubbing && !track.voiceActorConsentVerified) {
      issues.push("보이스 더빙 트랙 포함 시 성우 권리·학습 범위 동의 검증이 필요합니다.");
    }
    return {
      locale: track.locale,
      clearedForGlobalRelease: issues.length === 0,
      issues,
    };
  });

  const clearedLocaleCount = trackEvaluations.filter((t) => t.clearedForGlobalRelease).length;
  const blockedLocaleCount = trackEvaluations.length - clearedLocaleCount;
  const allLocalesCleared = trackEvaluations.length > 0 && blockedLocaleCount === 0;

  const localizationChainHash = fnv1aHex(
    JSON.stringify({
      seriesTitle: params.seriesTitle,
      episodeLabel: params.episodeLabel,
      sourceReceiptIntegrityHash: params.sourceReceiptIntegrityHash,
      sourcePackageIntegrityHash: params.sourcePackageIntegrityHash,
      allLocalesCleared,
      tracks: params.tracks.map((t) => ({
        locale: t.locale,
        fontLic: t.letteringFontLicense,
        sfxLic: t.sfxAssetLicense,
        ai: t.aiTranslationUsed,
        pe: t.humanPostEdited,
        dub: t.includesVoiceDubbing,
        consent: t.voiceActorConsentVerified,
      })),
    }),
  );

  return {
    localizationSchemaVersion: 1,
    seriesTitle: params.seriesTitle,
    episodeLabel: params.episodeLabel,
    sourceReceiptIntegrityHash: params.sourceReceiptIntegrityHash,
    sourcePackageIntegrityHash: params.sourcePackageIntegrityHash,
    allLocalesCleared,
    clearedLocaleCount,
    blockedLocaleCount,
    tracks: params.tracks,
    trackEvaluations,
    issuedAtIso,
    localizationChainHash,
  };
}

export function formatGlobalLocalizationRightsMarkdown(
  manifest: GlobalLocalizationRightsManifest,
): string {
  const rows = manifest.trackEvaluations.map((ev, idx) => {
    const track = manifest.tracks[idx];
    const status = ev.clearedForGlobalRelease ? "PASS" : `BLOCKED (${ev.issues.join("; ")})`;
    return `| ${ev.locale} | ${track.translatorLabel} | ${track.letteringFontLicense} | ${track.sfxAssetLicense} | ${status} |`;
  });

  return [
    `# 글로벌 현지화 공급망 저작권 매니페스트 — ${manifest.seriesTitle} (${manifest.episodeLabel})`,
    `- 발급 시각: ${manifest.issuedAtIso}`,
    `- 전체 판정: ${manifest.allLocalesCleared ? "전 언어 배포 승인 (PASS)" : `보류 언어 ${manifest.blockedLocaleCount}건`}`,
    `- 해시 체인: 원본 Receipt \`${manifest.sourceReceiptIntegrityHash}\` · 원본 Package \`${manifest.sourcePackageIntegrityHash}\` · Localization \`${manifest.localizationChainHash}\``,
    "",
    "| 로케일 | 번역·감수 | 식자 폰트 | 효과음 | 글로벌 배포 판정 |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}
