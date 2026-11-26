/**
 * #32 제로-네트워크 콜드부트 준비 감사기(ZeroNetworkColdBootAuditor).
 *
 * - 비행기 모드·완전 오프라인 환경에서 ToonStudio가 네트워크 요청 0건으로 콜드부트할 수 있는지
 *   6개 핵심 영역(Service Worker 앱 셸 프리캐시, WASM 바이너리 SHA-256 무결성,
 *   OPFS+SQLite 로컬 저널, 로컬 내장 폰트, WebCrypto 로컬 암호화, 외부 CDN 차단)을 감사한다.
 */

export type ColdBootCheckId =
  | "service-worker-shell"
  | "wasm-binary-integrity"
  | "opfs-sqlite-persistence"
  | "bundled-lettering-fonts"
  | "webcrypto-local-engine"
  | "zero-external-cdn-deps";

export type ColdBootCheckSeverity = "blocker" | "warning";

export interface CachedAssetVerificationRecord {
  readonly assetPath: string;
  readonly kind: "app-shell" | "wasm" | "font" | "worker";
  readonly cached: boolean;
  readonly expectedSha256Hex: string;
  readonly actualSha256Hex?: string;
  readonly byteLength: number;
}

export interface ColdBootEnvironmentSnapshot {
  readonly serviceWorkerActive: boolean;
  readonly opfsWritable: boolean;
  readonly sqliteJournalHealthy: boolean;
  readonly webCryptoSubtleAvailable: boolean;
  readonly cachedAssets: readonly CachedAssetVerificationRecord[];
  /** 부트 매니페스트에서 참조하는 외부 네트워크 URL 목록(비어 있어야 완전 오프라인 통과). */
  readonly externalBootUrls: readonly string[];
  readonly estimatedAvailableStorageBytes: number;
  readonly minRecommendedStorageBytes?: number;
}

export interface ColdBootCheckResult {
  readonly checkId: ColdBootCheckId;
  readonly passed: boolean;
  readonly severity: ColdBootCheckSeverity;
  readonly weight: number;
  readonly titleKo: string;
  readonly detailKo: string;
  readonly remediationKo?: string;
}

export interface ColdBootReadinessReport {
  readonly readyForAirplaneMode: boolean;
  readonly readinessScore: number;
  readonly checks: readonly ColdBootCheckResult[];
  readonly blockingFailures: readonly ColdBootCheckResult[];
  readonly warnings: readonly ColdBootCheckResult[];
  readonly offlineAssetSummary: {
    readonly requiredAssetCount: number;
    readonly verifiedCachedAssetCount: number;
    readonly missingAssetPaths: readonly string[];
    readonly hashMismatchedAssetPaths: readonly string[];
    readonly totalCachedBytes: number;
  };
  readonly remediationStepsKo: readonly string[];
}

/**
 * 완전 오프라인(비행기 모드) 콜드부트 준비 상태를 검증하는 감사기.
 */
export class ZeroNetworkColdBootAuditor {
  audit(snapshot: ColdBootEnvironmentSnapshot): ColdBootReadinessReport {
    const missingAssetPaths: string[] = [];
    const hashMismatchedAssetPaths: string[] = [];
    let verifiedCachedAssetCount = 0;
    let totalCachedBytes = 0;

    const appShellAssets: CachedAssetVerificationRecord[] = [];
    const wasmAssets: CachedAssetVerificationRecord[] = [];
    const fontAssets: CachedAssetVerificationRecord[] = [];

    for (let i = 0; i < snapshot.cachedAssets.length; i += 1) {
      const asset = snapshot.cachedAssets[i];
      if (asset.kind === "app-shell" || asset.kind === "worker") {
        appShellAssets.push(asset);
      } else if (asset.kind === "wasm") {
        wasmAssets.push(asset);
      } else if (asset.kind === "font") {
        fontAssets.push(asset);
      }

      if (!asset.cached) {
        missingAssetPaths.push(asset.assetPath);
        continue;
      }
      totalCachedBytes += Math.max(0, asset.byteLength);
      if (
        asset.actualSha256Hex !== undefined &&
        asset.actualSha256Hex.toLowerCase() === asset.expectedSha256Hex.toLowerCase()
      ) {
        verifiedCachedAssetCount += 1;
      } else {
        hashMismatchedAssetPaths.push(asset.assetPath);
      }
    }

    const isAssetVerified = (asset: CachedAssetVerificationRecord): boolean =>
      asset.cached &&
      asset.actualSha256Hex !== undefined &&
      asset.actualSha256Hex.toLowerCase() === asset.expectedSha256Hex.toLowerCase();

    const shellVerified =
      snapshot.serviceWorkerActive &&
      appShellAssets.length > 0 &&
      appShellAssets.every(isAssetVerified);

    const wasmVerified = wasmAssets.length > 0 && wasmAssets.every(isAssetVerified);
    const fontsVerified = fontAssets.length > 0 && fontAssets.every(isAssetVerified);
    const opfsHealthy = snapshot.opfsWritable && snapshot.sqliteJournalHealthy;
    const minStorage = snapshot.minRecommendedStorageBytes ?? 256 * 1024 * 1024;
    const storageAdequate = snapshot.estimatedAvailableStorageBytes >= minStorage;
    const zeroExternalDeps = snapshot.externalBootUrls.length === 0;

    const checks: ColdBootCheckResult[] = [
      {
        checkId: "service-worker-shell",
        passed: shellVerified,
        severity: "blocker",
        weight: 25,
        titleKo: "Service Worker 및 앱 셸 프리캐시",
        detailKo: shellVerified
          ? `활성 Service Worker와 앱 셸/워커 자산 ${appShellAssets.length}건이 검증되었습니다.`
          : "Service Worker가 비활성이거나 핵심 앱 셸 프리캐시가 누락/불일치 상태입니다.",
        remediationKo: shellVerified
          ? undefined
          : "오프라인 프리캐시 동기화를 실행해 앱 셸과 워커 번들을 CacheStorage에 고정하세요.",
      },
      {
        checkId: "wasm-binary-integrity",
        passed: wasmVerified,
        severity: "blocker",
        weight: 25,
        titleKo: "WASM 엔진 바이너리 로컬 캐시·SHA-256 검증",
        detailKo: wasmVerified
          ? `WASM 바이너리 ${wasmAssets.length}건의 로컬 캐시 및 SHA-256 해시가 일치합니다.`
          : "필수 WASM 바이너리가 캐시되지 않았거나 SHA-256 무결성이 일치하지 않습니다.",
        remediationKo: wasmVerified
          ? undefined
          : "손상되거나 누락된 WASM 바이너리를 다시 캐시하고 해시 검증을 재실행하세요.",
      },
      {
        checkId: "opfs-sqlite-persistence",
        passed: opfsHealthy,
        severity: "blocker",
        weight: 20,
        titleKo: "OPFS 쓰기 권한 및 SQLite 로컬 저널 상태",
        detailKo: opfsHealthy
          ? `OPFS 쓰기 및 SQLite 로컬 저널 정상(여유 저장 공간 ${Math.round(snapshot.estimatedAvailableStorageBytes / (1024 * 1024))} MiB${storageAdequate ? "" : ", 권장 용량 미만"}).`
          : "OPFS 쓰기 불가 또는 SQLite 로컬 저널 상태 점검이 필요합니다.",
        remediationKo: opfsHealthy
          ? undefined
          : "브라우저 영구 저장소 권한(navigator.storage.persist)을 허용하고 로컬 DB 저널 복구를 실행하세요.",
      },
      {
        checkId: "webcrypto-local-engine",
        passed: snapshot.webCryptoSubtleAvailable,
        severity: "blocker",
        weight: 10,
        titleKo: "WebCrypto 로컬 암호화·서명 엔진",
        detailKo: snapshot.webCryptoSubtleAvailable
          ? "WebCrypto(crypto.subtle) 로컬 서명·암호화 기능을 오프라인에서 즉시 사용할 수 있습니다."
          : "보안 컨텍스트(HTTPS/localhost)가 아니어서 WebCrypto를 사용할 수 없습니다.",
        remediationKo: snapshot.webCryptoSubtleAvailable
          ? undefined
          : "보안 컨텍스트(HTTPS 또는 PWA 설치 앱)에서 ToonStudio를 실행하세요.",
      },
      {
        checkId: "zero-external-cdn-deps",
        passed: zeroExternalDeps,
        severity: "blocker",
        weight: 10,
        titleKo: "부트 경로 외부 CDN 의존성 0건 검증",
        detailKo: zeroExternalDeps
          ? "콜드부트 매니페스트에 외부 CDN 차단 의존성이 없습니다."
          : `외부 URL ${snapshot.externalBootUrls.length}건이 부트 경로에 남아 오프라인 지연을 유발할 수 있습니다.`,
        remediationKo: zeroExternalDeps
          ? undefined
          : `부트 매니페스트에서 외부 URL(${snapshot.externalBootUrls.slice(0, 2).join(", ")})을 로컬 번들로 전환하세요.`,
      },
      {
        checkId: "bundled-lettering-fonts",
        passed: fontsVerified && storageAdequate,
        severity: "warning",
        weight: 10,
        titleKo: "로컬 식자 폰트 패키지 및 오프라인 여유 용량",
        detailKo:
          fontsVerified && storageAdequate
            ? `로컬 식자 폰트 ${fontAssets.length}건 캐시 완료 및 권장 저장 공간 확보됨.`
            : "일부 식자 폰트가 로컬 캐시에 없거나 권장 오프라인 저장 용량(256 MiB) 미만입니다.",
        remediationKo:
          fontsVerified && storageAdequate
            ? undefined
            : "기본 한글/영문 식자 폰트 팩을 로컬 캐시에 고정하고 불필요한 임시 캐시를 정리하세요.",
      },
    ];

    let score = 0;
    const blockingFailures: ColdBootCheckResult[] = [];
    const warnings: ColdBootCheckResult[] = [];
    const remediationStepsKo: string[] = [];

    for (let i = 0; i < checks.length; i += 1) {
      const check = checks[i];
      if (check.passed) {
        score += check.weight;
      } else {
        if (check.severity === "blocker") {
          blockingFailures.push(check);
        } else {
          warnings.push(check);
        }
        if (check.remediationKo) {
          remediationStepsKo.push(check.remediationKo);
        }
      }
    }

    return {
      readyForAirplaneMode: blockingFailures.length === 0,
      readinessScore: score,
      checks,
      blockingFailures,
      warnings,
      offlineAssetSummary: {
        requiredAssetCount: snapshot.cachedAssets.length,
        verifiedCachedAssetCount,
        missingAssetPaths,
        hashMismatchedAssetPaths,
        totalCachedBytes,
      },
      remediationStepsKo,
    };
  }
}
