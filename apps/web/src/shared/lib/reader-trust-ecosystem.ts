/**
 * Waves 80–89: 독자 신뢰 생태계·불법유출 포렌식·투명 후원 엔진 (Reader Trust Ecosystem)
 * - W80: Reader Clean-IP Trust Score & Tier Aggregator
 * - W81: Piracy Leak Forensics & Cut-Hash Matcher
 * - W82: Reader Patronage & Direct Tip Transparent Split
 * - W83: Spoiler Shield & Episode Unlock Gate Policy
 * - W84: Community Fan-Translation Attribution Ledger
 * - W85: Content Warning & Trigger Tag Compliance Engine
 * - W86: Reader Accessibility Preset & Dyslexia-Safe Spec
 * - W87: Creator-Reader Q&A & Behind-the-Scenes Rights Gate
 * - W88: Anti-Bot Scraping & TDMRep Header Enforcement Audit
 * - W89: Reader Ecosystem Trust Index Rollup
 */

export interface ReaderPatronageSplit {
  readonly grossTipKrw: number;
  readonly paymentFeeKrw: number;
  readonly creatorDirectKrw: number;
  readonly fanTranslatorBonusKrw: number;
}

export interface ReaderEcosystemIndex {
  readonly trustScore: number;
  readonly trustTier: "platinum-clean-ip" | "gold-verified" | "standard";
  readonly piracyMatchDetected: boolean;
  readonly tdmRepHeaderEnforced: boolean;
  readonly accessibilityCompliant: boolean;
  readonly ecosystemDigestHash: string;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** W81: 불법 유출본 컷 해시 매칭 포렌식 */
export function matchPiracyLeakCutHashes(
  officialCutHashes: readonly string[],
  suspectedLeakHashes: readonly string[],
): { readonly matchedCount: number; readonly matchedHashes: readonly string[] } {
  const officialSet = new Set(officialCutHashes);
  const matchedHashes = suspectedLeakHashes.filter((h) => officialSet.has(h));
  return { matchedCount: matchedHashes.length, matchedHashes };
}

/** W82 + W84: 독자 직접 후원금 1원 단위 투명 분배 (창작자 + 공식 팬 번역가 보너스) */
export function splitReaderPatronageTip(params: {
  readonly grossTipKrw: number;
  readonly paymentFeeRatePercent: number;
  readonly fanTranslatorBonusPercent: number;
}): ReaderPatronageSplit {
  const grossTipKrw = Math.max(0, Math.round(params.grossTipKrw));
  const paymentFeeKrw = Math.round((grossTipKrw * params.paymentFeeRatePercent) / 100);
  const net = Math.max(0, grossTipKrw - paymentFeeKrw);
  const fanTranslatorBonusKrw = Math.round((net * params.fanTranslatorBonusPercent) / 100);
  const creatorDirectKrw = net - fanTranslatorBonusKrw;
  return {
    grossTipKrw,
    paymentFeeKrw,
    creatorDirectKrw,
    fanTranslatorBonusKrw,
  };
}

/** W80 + W83 + W85 + W86 + W87 + W88 + W89: 독자 신뢰 생태계 종합 지표 산출 */
export function evaluateReaderEcosystemTrustIndex(params: {
  readonly sealActive: boolean;
  readonly tenStageVerified: boolean;
  readonly spoilerShieldEnabled: boolean;
  readonly triggerTagsDeclared: boolean;
  readonly dyslexiaSafeTypography: boolean;
  readonly tdmRepHeaderEnforced: boolean;
  readonly piracyMatchDetected: boolean;
}): ReaderEcosystemIndex {
  let score = 0;
  if (params.sealActive) score += 30;
  if (params.tenStageVerified) score += 25;
  if (params.spoilerShieldEnabled) score += 10;
  if (params.triggerTagsDeclared) score += 10;
  if (params.dyslexiaSafeTypography) score += 10;
  if (params.tdmRepHeaderEnforced) score += 15;
  if (params.piracyMatchDetected) score = Math.max(0, score - 15);

  const trustTier: "platinum-clean-ip" | "gold-verified" | "standard" =
    score >= 90 ? "platinum-clean-ip" : score >= 70 ? "gold-verified" : "standard";

  const ecosystemDigestHash = fnv1aHex(
    JSON.stringify({
      trustScore: score,
      trustTier,
      piracyMatchDetected: params.piracyMatchDetected,
      tdmRepHeaderEnforced: params.tdmRepHeaderEnforced,
    }),
  );

  return {
    trustScore: score,
    trustTier,
    piracyMatchDetected: params.piracyMatchDetected,
    tdmRepHeaderEnforced: params.tdmRepHeaderEnforced,
    accessibilityCompliant: params.dyslexiaSafeTypography && params.triggerTagsDeclared,
    ecosystemDigestHash,
  };
}
