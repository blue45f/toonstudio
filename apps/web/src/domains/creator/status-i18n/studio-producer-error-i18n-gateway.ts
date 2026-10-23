/**
 * 생산자 구조화 에러 해석 모듈 — gateway 구간: studio-format-gateway 파서
 * (kpp·krita-bundle·csp-sut·myb) 오류 코드 23종 (A4 D4 조건부 묶음 7호, R21
 * 설계 r16 §7.3).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와
 * 동일하다: 생산자는 코드만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * brush-pack 경계(brush/studio-brush-pack-import.ts)가 하위 파서 코드를
 * params.causeCode(파서 접두 포함 문자열 — 같은 코드 문자열이 파서마다 겹칠
 * 수 있어, 예: bundle:source-too-large와 csp:source-too-large)로 전파하고,
 * brush 구간 리졸버(resolveStudioBrushPackError)가 이 모듈로 2단 해석해
 * params.detail 패스스루를 대체한다. 해석할 수 없는 causeCode는 null —
 * 호출자는 detail 패스스루를 그대로 유지한다. csp:aborted는 이름 기반
 * 처리 유지라 의도적으로 키가 없다(표시 제외).
 *
 * 원문 언어 메모: 게이트웨이 생산자 원문은 영어다. 그래서 이 구간만
 * en 값이 이관 전 원문 템플릿(params 정규화·코드 단위 대표 문구 채택)과
 * 대응하고, ko 값은 신규 번역이다. 폴백 맵도 영어 원문을 싣는다.
 * 코드 단위 병합: 한 코드에 원문 템플릿이 여럿인 경우(동적 삽입·지점별
 * 문구) 키는 코드 의미를 대표하는 단일 문구이며, 동적 상세값(오프셋·
 * CRC 값·XML 내부 문구 등)은 코드 단위 표시로 대체된다 — 지점별 잔존은
 * r21-d4-brush.md에 명시한다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

/**
 * brush-pack이 params.causeCode로 전파하는 파서 접두 포함 코드.
 * 게이트웨이 클래스들의 code 타입(kpp 6·bundle 6·csp 9·myb 3 = 24종)에서
 * 표시 제외인 csp:aborted를 뺀 23종이다.
 */
export type StudioGatewayCauseCode =
  | "kpp:not-png"
  | "kpp:truncated"
  | "kpp:crc-mismatch"
  | "kpp:missing-preset"
  | "kpp:unsupported-compression"
  | "kpp:malformed-preset"
  | "bundle:archive-invalid"
  | "bundle:manifest-invalid"
  | "bundle:manifest-missing"
  | "bundle:metadata-invalid"
  | "bundle:metadata-missing"
  | "bundle:source-too-large"
  | "csp:invalid-options"
  | "csp:source-too-large"
  | "csp:pressure-graph-truncated"
  | "csp:pressure-graph-unsupported-version"
  | "csp:pressure-graph-invalid-header"
  | "csp:pressure-graph-value-out-of-range"
  | "csp:snapshot-invalid-structure"
  | "csp:snapshot-limit-exceeded"
  | "myb:invalid-utf8"
  | "myb:invalid-document"
  | "myb:unsupported-version";

function resolveProducerError(
  key: string,
  fallback: string,
  params?: Readonly<Record<string, string>>,
): string {
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  const values = params ?? {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(values, token) ? String(values[token]) : placeholder,
  );
}

registerI18nLocaleEntries("ko", {
  "studio.producerError.gateway.kppNotPng": "PNG 컨테이너가 아닙니다(KPP 프리셋은 `preset` 텍스트 청크를 담은 PNG 파일입니다).",
  "studio.producerError.gateway.kppTruncated": "PNG 청크가 파일 길이를 넘어섰습니다(파일이 잘렸습니다).",
  "studio.producerError.gateway.kppCrcMismatch": "PNG 청크의 CRC32 검증에 실패했습니다.",
  "studio.producerError.gateway.kppMissingPreset": "`preset` tEXt 청크가 없어 Krita 브러시 프리셋이 아닙니다(프리셋 메타데이터가 제거됐을 수 있습니다).",
  "studio.producerError.gateway.kppUnsupportedCompression": "프리셋 데이터가 압축되어(zTXt/iTXt) 압축되지 않은 tEXt 프리셋만 읽을 수 있습니다.",
  "studio.producerError.gateway.kppMalformedPreset": "프리셋 정의 형식이 올바르지 않습니다.",
  "studio.producerError.gateway.bundleArchiveInvalid": "Krita 번들 ZIP 컨테이너가 올바르지 않습니다.",
  "studio.producerError.gateway.bundleManifestInvalid": "Krita 번들 manifest(META-INF/manifest.xml)가 올바르지 않습니다.",
  "studio.producerError.gateway.bundleManifestMissing": "Krita 번들에 META-INF/manifest.xml이 없습니다.",
  "studio.producerError.gateway.bundleMetadataInvalid": "Krita 번들 메타데이터(meta.xml)가 올바르지 않습니다.",
  "studio.producerError.gateway.bundleMetadataMissing": "Krita 번들에 meta.xml이 없습니다.",
  "studio.producerError.gateway.bundleSourceTooLarge": "Krita 번들이 아카이브 안전 한도를 초과했습니다.",
  "studio.producerError.gateway.cspInvalidOptions": "CSP 가져오기 한도 옵션이 허용 범위의 정수가 아닙니다.",
  "studio.producerError.gateway.cspSourceTooLarge": "SUT/SUTG 파일이 원본 안전 한도를 초과했습니다.",
  "studio.producerError.gateway.cspPressureGraphTruncated": "CSP 필압 그래프 데이터가 잘렸거나 길이가 헤더와 일치하지 않습니다.",
  "studio.producerError.gateway.cspPressureGraphUnsupportedVersion": "지원하지 않는 CSP 필압 그래프 버전입니다(v1만 지원).",
  "studio.producerError.gateway.cspPressureGraphInvalidHeader": "CSP 필압 그래프 헤더(개수/간격/예약 워드)가 올바르지 않습니다.",
  "studio.producerError.gateway.cspPressureGraphValueOutOfRange": "CSP 필압 그래프 값이 [0,1] 범위를 벗어났습니다.",
  "studio.producerError.gateway.cspSnapshotInvalidStructure": "SQLite 리더가 잘못된 형식의 테이블 스냅샷을 반환했습니다.",
  "studio.producerError.gateway.cspSnapshotLimitExceeded": "SQLite 리더 스냅샷이 안전 한도(행 수·텍스트·blob 크기)를 초과했습니다.",
  "studio.producerError.gateway.mybInvalidUtf8": ".myb 파일이 올바른 UTF-8 JSON이 아닙니다.",
  "studio.producerError.gateway.mybInvalidDocument": ".myb v3 문서가 아닙니다.",
  "studio.producerError.gateway.mybUnsupportedVersion": ".myb 버전 3만 지원합니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.gateway.kppNotPng": "The file is not a PNG container (KPP presets are PNG files with a `preset` text chunk).",
  "studio.producerError.gateway.kppTruncated": "A PNG chunk exceeds the file length (the file is truncated).",
  "studio.producerError.gateway.kppCrcMismatch": "A PNG chunk fails CRC32 verification.",
  "studio.producerError.gateway.kppMissingPreset": "no `preset` tEXt chunk found — not a Krita brush preset (or preset metadata was stripped)",
  "studio.producerError.gateway.kppUnsupportedCompression": "The preset payload is compressed (zTXt/iTXt); only uncompressed tEXt presets can be read.",
  "studio.producerError.gateway.kppMalformedPreset": "The preset definition is malformed.",
  "studio.producerError.gateway.bundleArchiveInvalid": "The Krita bundle ZIP container is invalid.",
  "studio.producerError.gateway.bundleManifestInvalid": "The Krita bundle manifest (META-INF/manifest.xml) is invalid.",
  "studio.producerError.gateway.bundleManifestMissing": "Krita bundle has no META-INF/manifest.xml",
  "studio.producerError.gateway.bundleMetadataInvalid": "The Krita bundle metadata (meta.xml) is invalid.",
  "studio.producerError.gateway.bundleMetadataMissing": "Krita bundle has no meta.xml",
  "studio.producerError.gateway.bundleSourceTooLarge": "Krita bundle exceeds the archive safety limit",
  "studio.producerError.gateway.cspInvalidOptions": "A CSP import limit option is not an integer within its allowed range.",
  "studio.producerError.gateway.cspSourceTooLarge": "SUT/SUTG exceeds the source safety limit",
  "studio.producerError.gateway.cspPressureGraphTruncated": "The CSP pressure graph data is truncated or its length does not match its header.",
  "studio.producerError.gateway.cspPressureGraphUnsupportedVersion": "The CSP pressure graph version is unsupported (v1 only).",
  "studio.producerError.gateway.cspPressureGraphInvalidHeader": "The CSP pressure graph header (count/stride/reserved words) is invalid.",
  "studio.producerError.gateway.cspPressureGraphValueOutOfRange": "A CSP pressure graph value is outside [0,1].",
  "studio.producerError.gateway.cspSnapshotInvalidStructure": "The SQLite reader returned a malformed table snapshot.",
  "studio.producerError.gateway.cspSnapshotLimitExceeded": "The SQLite reader snapshot exceeds a safety limit (rows, text, or blob size).",
  "studio.producerError.gateway.mybInvalidUtf8": "The .myb file is not valid UTF-8 JSON.",
  "studio.producerError.gateway.mybInvalidDocument": "The file is not a .myb v3 document.",
  "studio.producerError.gateway.mybUnsupportedVersion": "Only .myb version 3 is supported.",
});

const GATEWAY_ERROR_KEYS: Readonly<Record<StudioGatewayCauseCode, string>> = {
  "kpp:not-png": "studio.producerError.gateway.kppNotPng",
  "kpp:truncated": "studio.producerError.gateway.kppTruncated",
  "kpp:crc-mismatch": "studio.producerError.gateway.kppCrcMismatch",
  "kpp:missing-preset": "studio.producerError.gateway.kppMissingPreset",
  "kpp:unsupported-compression": "studio.producerError.gateway.kppUnsupportedCompression",
  "kpp:malformed-preset": "studio.producerError.gateway.kppMalformedPreset",
  "bundle:archive-invalid": "studio.producerError.gateway.bundleArchiveInvalid",
  "bundle:manifest-invalid": "studio.producerError.gateway.bundleManifestInvalid",
  "bundle:manifest-missing": "studio.producerError.gateway.bundleManifestMissing",
  "bundle:metadata-invalid": "studio.producerError.gateway.bundleMetadataInvalid",
  "bundle:metadata-missing": "studio.producerError.gateway.bundleMetadataMissing",
  "bundle:source-too-large": "studio.producerError.gateway.bundleSourceTooLarge",
  "csp:invalid-options": "studio.producerError.gateway.cspInvalidOptions",
  "csp:source-too-large": "studio.producerError.gateway.cspSourceTooLarge",
  "csp:pressure-graph-truncated": "studio.producerError.gateway.cspPressureGraphTruncated",
  "csp:pressure-graph-unsupported-version": "studio.producerError.gateway.cspPressureGraphUnsupportedVersion",
  "csp:pressure-graph-invalid-header": "studio.producerError.gateway.cspPressureGraphInvalidHeader",
  "csp:pressure-graph-value-out-of-range": "studio.producerError.gateway.cspPressureGraphValueOutOfRange",
  "csp:snapshot-invalid-structure": "studio.producerError.gateway.cspSnapshotInvalidStructure",
  "csp:snapshot-limit-exceeded": "studio.producerError.gateway.cspSnapshotLimitExceeded",
  "myb:invalid-utf8": "studio.producerError.gateway.mybInvalidUtf8",
  "myb:invalid-document": "studio.producerError.gateway.mybInvalidDocument",
  "myb:unsupported-version": "studio.producerError.gateway.mybUnsupportedVersion",
};

/** 코드별 영어 원문 대응 문구 — 미등록 로케일·미해석 시 폴백이다(원문이 영어인 구간이라 폴백도 영어). */
const GATEWAY_ERROR_FALLBACK: Readonly<Record<StudioGatewayCauseCode, string>> = {
  "kpp:not-png": "The file is not a PNG container (KPP presets are PNG files with a `preset` text chunk).",
  "kpp:truncated": "A PNG chunk exceeds the file length (the file is truncated).",
  "kpp:crc-mismatch": "A PNG chunk fails CRC32 verification.",
  "kpp:missing-preset": "no `preset` tEXt chunk found — not a Krita brush preset (or preset metadata was stripped)",
  "kpp:unsupported-compression": "The preset payload is compressed (zTXt/iTXt); only uncompressed tEXt presets can be read.",
  "kpp:malformed-preset": "The preset definition is malformed.",
  "bundle:archive-invalid": "The Krita bundle ZIP container is invalid.",
  "bundle:manifest-invalid": "The Krita bundle manifest (META-INF/manifest.xml) is invalid.",
  "bundle:manifest-missing": "Krita bundle has no META-INF/manifest.xml",
  "bundle:metadata-invalid": "The Krita bundle metadata (meta.xml) is invalid.",
  "bundle:metadata-missing": "Krita bundle has no meta.xml",
  "bundle:source-too-large": "Krita bundle exceeds the archive safety limit",
  "csp:invalid-options": "A CSP import limit option is not an integer within its allowed range.",
  "csp:source-too-large": "SUT/SUTG exceeds the source safety limit",
  "csp:pressure-graph-truncated": "The CSP pressure graph data is truncated or its length does not match its header.",
  "csp:pressure-graph-unsupported-version": "The CSP pressure graph version is unsupported (v1 only).",
  "csp:pressure-graph-invalid-header": "The CSP pressure graph header (count/stride/reserved words) is invalid.",
  "csp:pressure-graph-value-out-of-range": "A CSP pressure graph value is outside [0,1].",
  "csp:snapshot-invalid-structure": "The SQLite reader returned a malformed table snapshot.",
  "csp:snapshot-limit-exceeded": "The SQLite reader snapshot exceeds a safety limit (rows, text, or blob size).",
  "myb:invalid-utf8": "The .myb file is not valid UTF-8 JSON.",
  "myb:invalid-document": "The file is not a .myb v3 document.",
  "myb:unsupported-version": "Only .myb version 3 is supported.",
};

export function isStudioGatewayCauseCode(value: unknown): value is StudioGatewayCauseCode {
  return typeof value === "string" && Object.hasOwn(GATEWAY_ERROR_KEYS, value);
}

/**
 * 표시 지점 전용 2단 해석 (gateway 하위 코드): brush-pack이 전파한
 * params.causeCode를 현재 로케일 문구로 바꾼다. 등록되지 않은 코드
 * (csp:aborted 등 표시 제외 포함)는 null — 호출자는 params.detail
 * 패스스루를 그대로 유지한다.
 */
export function resolveStudioGatewayError(causeCode: string): string | null {
  if (!isStudioGatewayCauseCode(causeCode)) return null;
  return resolveProducerError(
    GATEWAY_ERROR_KEYS[causeCode],
    GATEWAY_ERROR_FALLBACK[causeCode],
  );
}
