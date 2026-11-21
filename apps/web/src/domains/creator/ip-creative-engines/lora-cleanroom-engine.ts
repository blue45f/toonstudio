/**
 * Wave 17A — 작가 화풍 전용 로컬 LoRA 데이터셋 패키저(ComfyUI/Kohya 규격, ₩0) + 저작권 클린룸 유사도·출처 사전 검증기
 */

export interface LoraCutSample {
  readonly id: string;
  readonly episodeNumber: number;
  readonly widthPx: number;
  readonly heightPx: number;
  /** 16진 16자리 지각 해시(색상 코드가 아닌 이미지 지문) */
  readonly perceptualHash: string;
  readonly authorOwned: boolean;
  readonly consentSigned: boolean;
  readonly rawCaptionKo: string;
  readonly styleTags: readonly string[];
  readonly hasTextBubble: boolean;
}

export type LoraExclusionReason = "unauthorized-source" | "low-resolution" | "duplicate-hash" | "text-bubble-clutter";

export interface LoraAcceptedSample {
  readonly id: string;
  readonly fileName: string;
  readonly resolution: string;
  readonly cleanedCaption: string;
  readonly repeats: number;
}

export interface LoraExcludedSample {
  readonly id: string;
  readonly reason: LoraExclusionReason;
  readonly reasonKo: string;
}

export interface LocalLoraPackageManifest {
  readonly schemaVersion: "toonstudio.local-lora-manifest.v1";
  readonly costKrw: 0;
  readonly trainingRuntime: "local-only-kohya-comfyui";
  readonly styleName: string;
  readonly triggerToken: string;
  readonly authorId: string;
  readonly acceptedSamples: readonly LoraAcceptedSample[];
  readonly excludedSamples: readonly LoraExcludedSample[];
  readonly kohyaConfig: {
    readonly resolution: string;
    readonly networkDim: number;
    readonly networkAlpha: number;
    readonly learningRate: string;
    readonly epochs: number;
    readonly totalTrainSteps: number;
  };
  readonly comfyUiLoraLoaderSpec: {
    readonly loraFileName: string;
    readonly recommendedModelStrength: number;
    readonly recommendedClipStrength: number;
    readonly promptPrefix: string;
  };
  readonly manifestJson: string;
}

function hammingDistanceHex(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let distance = Math.abs(a.length - b.length) * 4;
  for (let i = 0; i < len; i += 1) {
    const nibA = Number.parseInt(a[i] ?? "0", 16);
    const nibB = Number.parseInt(b[i] ?? "0", 16);
    if (Number.isNaN(nibA) || Number.isNaN(nibB)) {
      if (a[i] !== b[i]) distance += 4;
      continue;
    }
    let xor = nibA ^ nibB;
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

function normalizeTriggerToken(rawToken: string): string {
  const cleaned = rawToken
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  return cleaned.length > 0 ? cleaned : "ts_author_style";
}

export function packageLocalLoraDataset(input: {
  readonly styleName: string;
  readonly triggerToken: string;
  readonly authorId: string;
  readonly minResolutionPx?: number;
  readonly excludeTextBubbles?: boolean;
  readonly samples: readonly LoraCutSample[];
}): LocalLoraPackageManifest {
  const minRes = Math.max(512, input.minResolutionPx ?? 1024);
  const excludeTextBubbles = input.excludeTextBubbles ?? true;
  const triggerToken = normalizeTriggerToken(input.triggerToken);
  const acceptedSamples: LoraAcceptedSample[] = [];
  const excludedSamples: LoraExcludedSample[] = [];
  const seenHashes: string[] = [];

  for (const sample of input.samples) {
    if (!sample.authorOwned || !sample.consentSigned) {
      excludedSamples.push({
        id: sample.id,
        reason: "unauthorized-source",
        reasonKo: "작가 본인 소유 또는 학습 동의 서명이 없는 컷이라 로컬 학습 세트에서 차단했습니다.",
      });
      continue;
    }
    if (Math.min(sample.widthPx, sample.heightPx) < minRes) {
      excludedSamples.push({
        id: sample.id,
        reason: "low-resolution",
        reasonKo: `해상도(${sample.widthPx}×${sample.heightPx})가 최소 기준(${minRes}px) 미만입니다.`,
      });
      continue;
    }
    if (excludeTextBubbles && sample.hasTextBubble) {
      excludedSamples.push({
        id: sample.id,
        reason: "text-bubble-clutter",
        reasonKo: "말풍선·식자가 포함된 컷이라 화풍 오염 방지를 위해 제외했습니다.",
      });
      continue;
    }
    const normalizedHash = sample.perceptualHash.trim().toLowerCase();
    const isNearDuplicate = seenHashes.some((existing) => hammingDistanceHex(existing, normalizedHash) <= 3);
    if (isNearDuplicate) {
      excludedSamples.push({
        id: sample.id,
        reason: "duplicate-hash",
        reasonKo: "이미 포함된 컷과 시각 지문이 중복(해밍 거리 <= 3)돼 과적합 방지를 위해 제외했습니다.",
      });
      continue;
    }
    seenHashes.push(normalizedHash);

    const uniqueTags = [...new Set(sample.styleTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
    const cleanedCaption = [triggerToken, ...uniqueTags].join(", ");
    acceptedSamples.push({
      id: sample.id,
      fileName: `ep${String(sample.episodeNumber).padStart(3, "0")}_${sample.id}.png`,
      resolution: `${sample.widthPx}x${sample.heightPx}`,
      cleanedCaption,
      repeats: 8,
    });
  }

  const epochs = acceptedSamples.length >= 15 ? 8 : 10;
  const totalTrainSteps = acceptedSamples.length * 8 * epochs;
  const kohyaConfig = {
    resolution: `${minRes},${minRes}`,
    networkDim: 32,
    networkAlpha: 16,
    learningRate: "1e-4",
    epochs,
    totalTrainSteps,
  };
  const comfyUiLoraLoaderSpec = {
    loraFileName: `${triggerToken}_v1.safetensors`,
    recommendedModelStrength: 0.78,
    recommendedClipStrength: 0.72,
    promptPrefix: `${triggerToken}, clean webtoon lineart, author signature shading`,
  };

  const payloadForJson = {
    schemaVersion: "toonstudio.local-lora-manifest.v1",
    costKrw: 0,
    trainingRuntime: "local-only-kohya-comfyui",
    styleName: input.styleName,
    triggerToken,
    authorId: input.authorId,
    acceptedCount: acceptedSamples.length,
    excludedCount: excludedSamples.length,
    kohyaConfig,
    comfyUiLoraLoaderSpec,
    dataset: acceptedSamples,
  };

  return {
    schemaVersion: "toonstudio.local-lora-manifest.v1",
    costKrw: 0,
    trainingRuntime: "local-only-kohya-comfyui",
    styleName: input.styleName,
    triggerToken,
    authorId: input.authorId,
    acceptedSamples,
    excludedSamples,
    kohyaConfig,
    comfyUiLoraLoaderSpec,
    manifestJson: JSON.stringify(payloadForJson, null, 2),
  };
}

export type CleanroomAssetKind = "font" | "3d-asset" | "brush" | "texture" | "reference";
export type CleanroomLicenseKind =
  | "author-original"
  | "cc0"
  | "commercial-paid"
  | "commercial-free-attribution"
  | "non-commercial-only"
  | "unknown";

export interface CleanroomAssetRecord {
  readonly id: string;
  readonly nameKo: string;
  readonly kind: CleanroomAssetKind;
  readonly license: CleanroomLicenseKind;
  readonly attributionProvided: boolean;
  readonly sourceProof: string;
  /** 외부 레퍼런스 코퍼스 대비 구조·구도 유사도 점수(0~100) */
  readonly similarityScore: number;
}

export interface CleanroomAuditFinding {
  readonly assetId: string;
  readonly assetNameKo: string;
  readonly severity: "pass" | "warning" | "blocked";
  readonly messageKo: string;
}

export interface CopyrightCleanroomReport {
  readonly cutId: string;
  readonly cleanroomPassed: boolean;
  readonly verdict: "passed" | "review-required" | "blocked";
  readonly riskScore: number;
  readonly certificateId: string;
  readonly findings: readonly CleanroomAuditFinding[];
  readonly blockingReasonsKo: readonly string[];
  readonly warningsKo: readonly string[];
  readonly bomCounts: Readonly<Record<CleanroomAssetKind, number>>;
}

function deterministicFingerprint(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

export function runCopyrightCleanroomAudit(input: {
  readonly cutId: string;
  readonly assets: readonly CleanroomAssetRecord[];
}): CopyrightCleanroomReport {
  const findings: CleanroomAuditFinding[] = [];
  const blockingReasonsKo: string[] = [];
  const warningsKo: string[] = [];
  const bomCounts: Record<CleanroomAssetKind, number> = {
    font: 0,
    "3d-asset": 0,
    brush: 0,
    texture: 0,
    reference: 0,
  };

  let riskAccumulator = 0;

  for (const asset of input.assets) {
    bomCounts[asset.kind] += 1;
    let severity: CleanroomAuditFinding["severity"] = "pass";
    const notes: string[] = [];

    if (asset.license === "non-commercial-only" || asset.license === "unknown") {
      severity = "blocked";
      riskAccumulator += 45;
      const msg = `${asset.nameKo}: 상업 연재 불가 또는 미확인 라이선스(${asset.license})로 내보내기가 차단됩니다.`;
      notes.push(msg);
      blockingReasonsKo.push(msg);
    } else if (asset.license === "commercial-free-attribution" && !asset.attributionProvided) {
      severity = "warning";
      riskAccumulator += 22;
      const msg = `${asset.nameKo}: 출처 표기 필수 라이선스지만 크레딧 문구가 누락됐습니다.`;
      notes.push(msg);
      warningsKo.push(msg);
    }

    if (asset.similarityScore >= 80) {
      severity = "blocked";
      riskAccumulator += 45;
      const msg = `${asset.nameKo}: 외부 레퍼런스 유사도 ${asset.similarityScore}%로 트레이싱 고위험 경보가 발령됐습니다.`;
      notes.push(msg);
      blockingReasonsKo.push(msg);
    } else if (asset.similarityScore >= 65) {
      if (severity === "pass") severity = "warning";
      riskAccumulator += 18;
      const msg = `${asset.nameKo}: 외부 레퍼런스 유사도 ${asset.similarityScore}% — 구도 변형 검토가 필요합니다.`;
      notes.push(msg);
      warningsKo.push(msg);
    }

    if (asset.license !== "author-original" && asset.sourceProof.trim().length === 0) {
      if (severity === "pass") severity = "warning";
      riskAccumulator += 14;
      const msg = `${asset.nameKo}: 외부 에셋 영수증 또는 출처 URL 증빙이 비어 있습니다.`;
      notes.push(msg);
      warningsKo.push(msg);
    }

    findings.push({
      assetId: asset.id,
      assetNameKo: asset.nameKo,
      severity,
      messageKo:
        notes.length > 0
          ? notes.join(" ")
          : `${asset.nameKo}: 상업 라이선스·출처 증빙·유사도(${asset.similarityScore}%) 모두 클린룸 통과`,
    });
  }

  const verdict: CopyrightCleanroomReport["verdict"] =
    blockingReasonsKo.length > 0 ? "blocked" : warningsKo.length > 0 ? "review-required" : "passed";
  const cleanroomPassed = verdict === "passed";
  const riskScore = Math.max(0, Math.min(100, riskAccumulator));
  const fingerprintSeed = `${input.cutId}|${verdict}|${input.assets.map((a) => `${a.id}:${a.license}:${a.similarityScore}`).join(",")}`;
  const certificateId = `CLN-${verdict.slice(0, 3).toUpperCase()}-${deterministicFingerprint(fingerprintSeed)}`;

  return {
    cutId: input.cutId,
    cleanroomPassed,
    verdict,
    riskScore,
    certificateId,
    findings,
    blockingReasonsKo,
    warningsKo,
    bomCounts,
  };
}
