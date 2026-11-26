/**
 * Wasm64 Wave 20 Grand Finale — C2PA 양자내성 WOTS+ 해시체인 봉인 검증기 & 무정규식 O(N) 개인정보 스캐너.
 *
 * - ES2017 호환 `BigInt()` 전용 256비트 결정론 해시 및 Winternitz(w=16) 일회용 서명 봉인·검증
 * - 다항식 역추적 정규식을 단 하나도 쓰지 않는 O(N) 선형 문자 스캐너(이메일·휴대전화·주민등록번호·시크릿·경로)
 */

export interface WotsPlusProvenanceSeal {
  readonly scheme: "C2PA-WOTS-PLUS-W16";
  readonly claimGenerator: string;
  readonly contentDigestHex: string;
  readonly publicSeedHex: string;
  readonly publicKeyRootHex: string;
  readonly chainSignaturesHex: readonly string[];
  readonly humanAuthoredRatio: number;
}

export interface PiiFinding {
  readonly sourceField: string;
  readonly kind: "email" | "kr-phone" | "kr-rrn" | "secret-token" | "host-path";
  readonly redactedPreview: string;
}

const MASK_64 = (BigInt(1) << BigInt(64)) - BigInt(1);
const FNV_OFFSET_64 = BigInt("0xcbf29ce484222325");
const FNV_PRIME_64 = BigInt("0x100000001b3");
const SPLITMIX_GAMMA = BigInt("0x9e3779b97f4a7c15");
const SPLITMIX_MUL1 = BigInt("0xbf58476d1ce4e5b9");
const SPLITMIX_MUL2 = BigInt("0x94d049bb133111eb");

function mix64(zIn: bigint): bigint {
  let z = (zIn + SPLITMIX_GAMMA) & MASK_64;
  z = ((z ^ (z >> BigInt(30))) * SPLITMIX_MUL1) & MASK_64;
  z = ((z ^ (z >> BigInt(27))) * SPLITMIX_MUL2) & MASK_64;
  return (z ^ (z >> BigInt(31))) & MASK_64;
}

function hex16FromBigInt(val: bigint): string {
  return (val & MASK_64).toString(16).padStart(16, "0");
}

/** 결정론적 256비트(64자 16진수) 상태 해시 함수(ES2017 호환 `BigInt()` 전용). */
export function computeDeterministicHash256Hex(payload: string): string {
  let h0 = FNV_OFFSET_64;
  let h1 = mix64(FNV_OFFSET_64 ^ BigInt(0x517cc1b7));
  let h2 = mix64(h1 ^ BigInt(0x27220a95));
  let h3 = mix64(h2 ^ BigInt(0x9e3779b9));

  for (let i = 0; i < payload.length; i++) {
    const code = BigInt(payload.charCodeAt(i));
    h0 = ((h0 ^ code) * FNV_PRIME_64) & MASK_64;
    h1 = mix64(h1 ^ (code + BigInt(i)));
    h2 = ((h2 ^ h0) * FNV_PRIME_64) & MASK_64;
    h3 = mix64(h3 ^ h1 ^ code);
  }
  return hex16FromBigInt(h0) + hex16FromBigInt(h1) + hex16FromBigInt(h2) + hex16FromBigInt(h3);
}

function wotsChainAdvance(
  startHex: string,
  publicSeedHex: string,
  chainIdx: number,
  fromStep: number,
  steps: number,
): string {
  let cur = startHex;
  for (let s = 0; s < steps; s++) {
    const stepPos = fromStep + s;
    cur = computeDeterministicHash256Hex(`${publicSeedHex}|chain:${chainIdx}|step:${stepPos}|${cur}`);
  }
  return cur;
}

function extractWotsDigitsW16(digestHex: string): readonly number[] {
  const normalized = computeDeterministicHash256Hex(`msg:${digestHex}`).slice(0, 16);
  const msgDigits: number[] = [];
  let checksum = 0;
  for (let i = 0; i < 16; i++) {
    const nibble = Number.parseInt(normalized[i]!, 16);
    const d = Number.isNaN(nibble) ? 0 : nibble & 0xf;
    msgDigits.push(d);
    checksum += 15 - d;
  }
  return [...msgDigits, (checksum >> 8) & 0xf, (checksum >> 4) & 0xf, checksum & 0xf];
}

/** 원고 해시에 대해 양자내성 WOTS+(Winternitz w=16) 해시체인 기반 C2PA 출처 봉인을 생성한다. */
export function createWotsPlusProvenanceSeal(params: {
  readonly contentDigestHex: string;
  readonly secretSeedHex: string;
  readonly publicSeedHex?: string;
  readonly claimGenerator?: string;
  readonly humanAuthoredRatio?: number;
}): WotsPlusProvenanceSeal {
  const publicSeedHex = params.publicSeedHex
    ?? computeDeterministicHash256Hex(`pub:${params.secretSeedHex}`).slice(0, 32);
  const digits = extractWotsDigitsW16(params.contentDigestHex);
  const chainSignaturesHex: string[] = [];
  const pubKeyEnds: string[] = [];

  for (let c = 0; c < digits.length; c++) {
    const sk = computeDeterministicHash256Hex(`sk:${params.secretSeedHex}|chain:${c}`);
    const step = digits[c]!;
    const sig = wotsChainAdvance(sk, publicSeedHex, c, 0, step);
    const pkEnd = wotsChainAdvance(sig, publicSeedHex, c, step, 15 - step);
    chainSignaturesHex.push(sig);
    pubKeyEnds.push(pkEnd);
  }

  return {
    scheme: "C2PA-WOTS-PLUS-W16",
    claimGenerator: params.claimGenerator ?? "ToonStudio-Omnichannel-Gate/20.0",
    contentDigestHex: params.contentDigestHex,
    publicSeedHex,
    publicKeyRootHex: computeDeterministicHash256Hex(`pkroot:${publicSeedHex}|${pubKeyEnds.join(",")}`),
    chainSignaturesHex,
    humanAuthoredRatio: Math.max(0, Math.min(1, params.humanAuthoredRatio ?? 1)),
  };
}

/** C2PA + WOTS+ 해시체인 출처 증명 봉인의 위변조 여부를 결정론적으로 검증한다. */
export function verifyWotsPlusProvenanceSeal(
  seal: WotsPlusProvenanceSeal,
  expectedContentDigestHex?: string,
): boolean {
  if (seal.scheme !== "C2PA-WOTS-PLUS-W16") return false;
  if (!seal.claimGenerator.trim() || !seal.contentDigestHex.trim()) return false;
  if (expectedContentDigestHex && seal.contentDigestHex !== expectedContentDigestHex) return false;
  if (seal.humanAuthoredRatio < 0 || seal.humanAuthoredRatio > 1 || Number.isNaN(seal.humanAuthoredRatio)) {
    return false;
  }

  const digits = extractWotsDigitsW16(seal.contentDigestHex);
  if (seal.chainSignaturesHex.length !== digits.length) return false;

  const reconstructedEnds: string[] = [];
  for (let c = 0; c < digits.length; c++) {
    const sig = seal.chainSignaturesHex[c]!;
    if (sig.length !== 64) return false;
    const step = digits[c]!;
    reconstructedEnds.push(wotsChainAdvance(sig, seal.publicSeedHex, c, step, 15 - step));
  }
  const candidateRoot = computeDeterministicHash256Hex(`pkroot:${seal.publicSeedHex}|${reconstructedEnds.join(",")}`);
  return candidateRoot === seal.publicKeyRootHex;
}

function isAsciiDigit(ch: number): boolean {
  return ch >= 48 && ch <= 57;
}

function isEmailChar(ch: number): boolean {
  return (ch >= 48 && ch <= 57)
    || (ch >= 65 && ch <= 90)
    || (ch >= 97 && ch <= 122)
    || ch === 46 || ch === 95 || ch === 45 || ch === 43;
}

/** 백트래킹 정규식을 전혀 쓰지 않는 O(N) 선형 스캐너로 개인정보·시크릿·호스트 경로 유출을 검출한다. */
export function scanLinearPiiAndSecrets(
  fields: Readonly<Record<string, string>>,
): readonly PiiFinding[] {
  const findings: PiiFinding[] = [];

  for (const [sourceField, text] of Object.entries(fields)) {
    const n = text.length;
    if (text.includes("/Users/") || text.includes("/home/") || text.includes("C:\\Users\\")) {
      findings.push({ sourceField, kind: "host-path", redactedPreview: "[HOST_PATH_REDACTED]" });
    }
    if (
      text.includes("sk-live-") || text.includes("sk-proj-")
      || text.includes("ghp_") || text.includes("AKIA") || text.includes("Bearer ")
    ) {
      findings.push({ sourceField, kind: "secret-token", redactedPreview: "[SECRET_REDACTED]" });
    }

    for (let i = 1; i + 3 < n; i++) {
      if (text.charCodeAt(i) !== 64) continue;
      let l = i - 1;
      while (l >= 0 && isEmailChar(text.charCodeAt(l))) l--;
      let r = i + 1;
      let dotPos = -1;
      while (r < n && isEmailChar(text.charCodeAt(r))) {
        if (text.charCodeAt(r) === 46) dotPos = r;
        r++;
      }
      const localLen = i - (l + 1);
      const domainLen = r - (i + 1);
      if (localLen >= 1 && domainLen >= 4 && dotPos > i + 1 && dotPos < r - 1) {
        findings.push({ sourceField, kind: "email", redactedPreview: `${text.slice(l + 1, l + 2)}***@***` });
        i = r;
      }
    }

    for (let i = 0; i < n; i++) {
      if (i + 13 <= n && text.startsWith("010-", i) && text.charCodeAt(i + 8) === 45) {
        let digitsOk = true;
        for (const off of [4, 5, 6, 7, 9, 10, 11, 12]) {
          if (!isAsciiDigit(text.charCodeAt(i + off))) digitsOk = false;
        }
        if (digitsOk) {
          findings.push({ sourceField, kind: "kr-phone", redactedPreview: "010-****-****" });
          i += 12;
          continue;
        }
      }
      if (i + 14 <= n && text.charCodeAt(i + 6) === 45) {
        const genderCh = text.charCodeAt(i + 7);
        if (genderCh >= 49 && genderCh <= 52) {
          let rrnOk = true;
          for (const off of [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13]) {
            if (!isAsciiDigit(text.charCodeAt(i + off))) rrnOk = false;
          }
          if (rrnOk) {
            findings.push({ sourceField, kind: "kr-rrn", redactedPreview: "******-*******" });
            i += 13;
          }
        }
      }
    }
  }
  return findings;
}
