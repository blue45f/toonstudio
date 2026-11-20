import type { SupportedGlobalLocale } from "./studio-localization-rights-chain";

export interface VoiceActorConsentContract {
  readonly contractId: string;
  readonly characterName: string;
  readonly voiceActorName: string;
  readonly allowedLocales: readonly SupportedGlobalLocale[];
  readonly allowAiVoiceClone: boolean;
  readonly allowModelTrainingReuse: boolean;
  readonly royaltyPerEpisodeKrw: number;
  readonly consentExpiresAtIso: string;
}

export interface MovingToonSynthesisRequest {
  readonly targetLocales: readonly SupportedGlobalLocale[];
  readonly usesAiVoiceClone: boolean;
  readonly usesModelTrainingReuse: boolean;
  readonly releaseAtIso: string;
}

export interface EvaluatedVoiceContractCheck {
  readonly contractId: string;
  readonly characterName: string;
  readonly voiceActorName: string;
  readonly cleared: boolean;
  readonly violations: readonly string[];
  readonly payableRoyaltyKrw: number;
}

export interface VoiceSynthesisConsentLedger {
  readonly voiceLedgerSchemaVersion: 1;
  readonly seriesTitle: string;
  readonly episodeLabel: string;
  readonly sourceReceiptIntegrityHash: string;
  readonly localizationChainHash: string;
  readonly allContractsCleared: boolean;
  readonly totalVoiceRoyaltyKrw: number;
  readonly checks: readonly EvaluatedVoiceContractCheck[];
  readonly evaluatedAtIso: string;
  readonly voiceConsentLedgerHash: string;
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
 * 무빙툰 · 보이스 웹툰 제작 시 캐릭터별 성우 계약 범위(허용 로케일, AI 음성 복제 허용,
 * 학습 재사용 금지, 계약 만료일)를 배포 요청과 대조하고 회당 성우 로열티 총액을 산출한다.
 */
export function evaluateVoiceSynthesisConsentLedger(params: {
  readonly seriesTitle: string;
  readonly episodeLabel: string;
  readonly sourceReceiptIntegrityHash: string;
  readonly localizationChainHash: string;
  readonly contracts: readonly VoiceActorConsentContract[];
  readonly request: MovingToonSynthesisRequest;
  readonly evaluatedAtIso?: string;
}): VoiceSynthesisConsentLedger {
  const evaluatedAtIso = params.evaluatedAtIso ?? new Date().toISOString();
  const releaseTime = Date.parse(params.request.releaseAtIso);

  const checks: EvaluatedVoiceContractCheck[] = params.contracts.map((contract) => {
    const violations: string[] = [];
    const expiryTime = Date.parse(contract.consentExpiresAtIso);

    if (!contract.voiceActorName.trim()) {
      violations.push("성우 실명/예명 표기가 누락되었습니다.");
    }
    if (Number.isNaN(expiryTime) || (!Number.isNaN(releaseTime) && releaseTime > expiryTime)) {
      violations.push(`성우 음성권 계약 기간 만료(${contract.consentExpiresAtIso})`);
    }

    const unauthorizedLocales = params.request.targetLocales.filter(
      (loc) => !contract.allowedLocales.includes(loc),
    );
    if (unauthorizedLocales.length > 0) {
      violations.push(`미허가 다국어 더빙 로케일(${unauthorizedLocales.join(", ")})`);
    }

    if (params.request.usesAiVoiceClone && !contract.allowAiVoiceClone) {
      violations.push("AI 음성 복제·다국어 합성 미동의 계약");
    }
    if (params.request.usesModelTrainingReuse && !contract.allowModelTrainingReuse) {
      violations.push("외부 파운데이션 모델 학습 재사용 미동의 계약");
    }

    const cleared = violations.length === 0;
    const payableRoyaltyKrw = cleared ? Math.max(0, Math.round(contract.royaltyPerEpisodeKrw)) : 0;

    return {
      contractId: contract.contractId,
      characterName: contract.characterName,
      voiceActorName: contract.voiceActorName,
      cleared,
      violations,
      payableRoyaltyKrw,
    };
  });

  const allContractsCleared = checks.length > 0 && checks.every((c) => c.cleared);
  const totalVoiceRoyaltyKrw = allContractsCleared
    ? checks.reduce((sum, c) => sum + c.payableRoyaltyKrw, 0)
    : 0;

  const voiceConsentLedgerHash = fnv1aHex(
    JSON.stringify({
      seriesTitle: params.seriesTitle,
      episodeLabel: params.episodeLabel,
      sourceReceiptIntegrityHash: params.sourceReceiptIntegrityHash,
      localizationChainHash: params.localizationChainHash,
      allContractsCleared,
      totalVoiceRoyaltyKrw,
      checks: checks.map((c) => ({
        contractId: c.contractId,
        cleared: c.cleared,
        payableRoyaltyKrw: c.payableRoyaltyKrw,
      })),
    }),
  );

  return {
    voiceLedgerSchemaVersion: 1,
    seriesTitle: params.seriesTitle,
    episodeLabel: params.episodeLabel,
    sourceReceiptIntegrityHash: params.sourceReceiptIntegrityHash,
    localizationChainHash: params.localizationChainHash,
    allContractsCleared,
    totalVoiceRoyaltyKrw,
    checks,
    evaluatedAtIso,
    voiceConsentLedgerHash,
  };
}

export function formatVoiceSynthesisConsentMarkdown(ledger: VoiceSynthesisConsentLedger): string {
  const rows = ledger.checks.map(
    (c) =>
      `| ${c.characterName} | ${c.voiceActorName} | ${c.cleared ? "PASS" : `BLOCKED (${c.violations.join("; ")})`} | ${c.payableRoyaltyKrw.toLocaleString("ko-KR")}원 |`,
  );

  return [
    `# 무빙툰·보이스 웹툰 성우 AI 음성권 원장 — ${ledger.seriesTitle} (${ledger.episodeLabel})`,
    `- 평가 시각: ${ledger.evaluatedAtIso}`,
    `- 전체 판정: ${ledger.allContractsCleared ? "전 캐릭터 음성권 승인 (PASS)" : "음성권 범위 위반 감지 (BLOCKED)"}`,
    `- 회당 성우 로열티 합계: ${ledger.totalVoiceRoyaltyKrw.toLocaleString("ko-KR")}원`,
    `- 해시 체인: Receipt \`${ledger.sourceReceiptIntegrityHash}\` · Localization \`${ledger.localizationChainHash}\` · Voice \`${ledger.voiceConsentLedgerHash}\``,
    "",
    "| 캐릭터 | 성우 | 음성권 판정 | 회당 로열티 |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}
