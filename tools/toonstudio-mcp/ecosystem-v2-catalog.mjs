/**
 * ToonStudio MCP v2 정본 카탈로그 · 플러그인 샌드박스 검증기 · MCP 리소스/프롬프트 모듈.
 *
 * - 외부 네트워크 호출 없이 100% 결정론적 · 무과금(₩0 Fail-Closed)으로 동작한다.
 * - API 키/토큰/개인정보를 출력·저장·에코하지 않으며 모든 입력에 마스킹 가드를 적용한다.
 */

import { createHash } from "node:crypto";

export const SIX_PLATFORM_SPECS = Object.freeze({
  "naver-webtoon": {
    id: "naver-webtoon", labelKo: "네이버 웹툰", region: "KR",
    allowedWidthsPx: [690, 800], recommendedWidthPx: 800, maxSliceHeightPx: 20_000,
    maxFileSizeMb: 20, maxEpisodeTotalMb: 100, allowedFormats: ["jpg", "png"],
    requiredColorProfile: "sRGB", balloonSafeMarginX: 28, writingDirection: "horizontal",
  },
  kakaopage: {
    id: "kakaopage", labelKo: "카카오페이지·카카오웹툰", region: "KR",
    allowedWidthsPx: [720, 1080], recommendedWidthPx: 720, maxSliceHeightPx: 15_000,
    maxFileSizeMb: 20, maxEpisodeTotalMb: 100, allowedFormats: ["jpg", "png"],
    requiredColorProfile: "sRGB", balloonSafeMarginX: 32, writingDirection: "horizontal",
  },
  lezhin: {
    id: "lezhin", labelKo: "레진코믹스", region: "KR",
    allowedWidthsPx: [720, 1280], recommendedWidthPx: 1280, maxSliceHeightPx: 10_000,
    maxFileSizeMb: 20, maxEpisodeTotalMb: 120, allowedFormats: ["jpg", "png"],
    requiredColorProfile: "sRGB", balloonSafeMarginX: 30, writingDirection: "horizontal",
  },
  ridi: {
    id: "ridi", labelKo: "리디(RIDI)", region: "KR",
    allowedWidthsPx: [720, 1080, 1280], recommendedWidthPx: 1080, maxSliceHeightPx: 15_000,
    maxFileSizeMb: 15, maxEpisodeTotalMb: 100, allowedFormats: ["jpg", "png"],
    requiredColorProfile: "sRGB", balloonSafeMarginX: 30, writingDirection: "horizontal",
  },
  piccoma: {
    id: "piccoma", labelKo: "픽코마(SMARTOON)", region: "JP",
    allowedWidthsPx: [720, 800], recommendedWidthPx: 720, maxSliceHeightPx: 12_000,
    maxFileSizeMb: 15, maxEpisodeTotalMb: 80, allowedFormats: ["jpg", "png"],
    requiredColorProfile: "sRGB", balloonSafeMarginX: 36, writingDirection: "vertical-jp",
  },
  "webtoon-global": {
    id: "webtoon-global", labelKo: "WEBTOON Global", region: "GLOBAL",
    allowedWidthsPx: [800], recommendedWidthPx: 800, maxSliceHeightPx: 1_280,
    maxFileSizeMb: 2, maxEpisodeTotalMb: 20, allowedFormats: ["jpg"],
    requiredColorProfile: "sRGB", balloonSafeMarginX: 24, writingDirection: "horizontal",
  },
});

export const PLAZA_REGIONS = Object.freeze({
  KR: { countryKo: "대한민국", defaultCurrency: "KRW", offsetFromKstHours: 0, overlapHours: 9, syncQuality: "prime" },
  JP: { countryKo: "일본", defaultCurrency: "JPY", offsetFromKstHours: 0, overlapHours: 9, syncQuality: "prime" },
  VN: { countryKo: "베트남", defaultCurrency: "VND", offsetFromKstHours: -2, overlapHours: 7, syncQuality: "prime" },
  TH: { countryKo: "태국", defaultCurrency: "THB", offsetFromKstHours: -2, overlapHours: 7, syncQuality: "prime" },
  ID: { countryKo: "인도네시아(WIB)", defaultCurrency: "IDR", offsetFromKstHours: -2, overlapHours: 7, syncQuality: "good" },
  PH: { countryKo: "필리핀", defaultCurrency: "USD", offsetFromKstHours: -1, overlapHours: 8, syncQuality: "prime" },
  US: { countryKo: "미국(PST)", defaultCurrency: "USD", offsetFromKstHours: -17, overlapHours: 2, syncQuality: "async-handoff" },
});

export const PLAZA_FX_PER_KRW = Object.freeze({
  KRW: { rate: 1, symbol: "₩", decimals: 0 },
  USD: { rate: 0.00072, symbol: "$", decimals: 2 },
  VND: { rate: 18.2, symbol: "₫", decimals: 0 },
  THB: { rate: 0.0248, symbol: "฿", decimals: 2 },
  IDR: { rate: 11.4, symbol: "Rp", decimals: 0 },
  JPY: { rate: 0.111, symbol: "¥", decimals: 0 },
});

export const SEVEN_COUNTRY_TAX_RULES = Object.freeze({
  KR: { countryKo: "대한민국", treatyPct: 3.3, statutoryPct: 3.3, formKo: "사업소득 원천징수영수증(3.3%)" },
  US: { countryKo: "미국", treatyPct: 10.0, statutoryPct: 30.0, formKo: "IRS W-8BEN-E" },
  JP: { countryKo: "일본", treatyPct: 10.0, statutoryPct: 20.42, formKo: "조세조약 적용신청서(Form 3) + 거주자증명서" },
  VN: { countryKo: "베트남", treatyPct: 10.0, statutoryPct: 10.0, formKo: "외국인계약세(FCT) 원천징수 확인서" },
  TH: { countryKo: "태국", treatyPct: 15.0, statutoryPct: 15.0, formKo: "태국 국세청 거주자증명서(P.N.D.54)" },
  ID: { countryKo: "인도네시아", treatyPct: 15.0, statutoryPct: 20.0, formKo: "DGT Form + 거주자증명서" },
  PH: { countryKo: "필리핀", treatyPct: 15.0, statutoryPct: 25.0, formKo: "BIR Form 0901-R(TTRA)" },
});

export const STANDBY_ASSISTANTS = Object.freeze([
  { id: "sos-a1", handle: "선화번개_민수", roles: ["lineart", "storyboard"], genres: ["modern-fantasy", "action"], styleMatchPct: 95, etaMinutes: 6, ratePerCutKrw: 20_000, verifiedRating: 4.94 },
  { id: "sos-a2", handle: "로판채색_하윤", roles: ["color", "vfx"], genres: ["romance-fantasy", "modern-fantasy"], styleMatchPct: 93, etaMinutes: 7, ratePerCutKrw: 18_000, verifiedRating: 4.91 },
  { id: "sos-a3", handle: "배경3D_준호", roles: ["bg3d", "vfx"], genres: ["modern-fantasy", "thriller", "action"], styleMatchPct: 92, etaMinutes: 8, ratePerCutKrw: 16_000, verifiedRating: 4.88 },
  { id: "sos-a4", handle: "식자마감_서연", roles: ["lettering", "storyboard"], genres: ["romance-fantasy", "slice-of-life", "modern-fantasy"], styleMatchPct: 96, etaMinutes: 5, ratePerCutKrw: 11_000, verifiedRating: 4.97 },
  { id: "sos-a5", handle: "멀티어시_도현", roles: ["lineart", "color", "vfx", "lettering"], genres: ["action", "thriller", "modern-fantasy"], styleMatchPct: 89, etaMinutes: 9, ratePerCutKrw: 21_000, verifiedRating: 4.85 },
]);

export const BRUSH_100_BENCHMARKS = Object.freeze({
  "g-pen-pro": { labelKo: "G펜 프로", pressure: 18, tilt: 16, spacing: 17, aa: 17, latency: 16, grain: 14 },
  "maru-pen-detail": { labelKo: "마루펜 세밀선", pressure: 18, tilt: 16, spacing: 17, aa: 17, latency: 16, grain: 13 },
  "turnip-pen-ink": { labelKo: "순무펜 잉크", pressure: 17, tilt: 16, spacing: 16, aa: 16, latency: 16, grain: 14 },
  "watercolor-wet-blend": { labelKo: "수채 습식 번짐", pressure: 17, tilt: 16, spacing: 16, aa: 16, latency: 15, grain: 16 },
  "crayon-wax-tooth": { labelKo: "크레용 왁스 지질", pressure: 17, tilt: 17, spacing: 16, aa: 15, latency: 16, grain: 17 },
  "charcoal-grain-dry": { labelKo: "목탄 건식 질감", pressure: 17, tilt: 16, spacing: 15, aa: 16, latency: 16, grain: 16 },
  "airbrush-soft-cel": { labelKo: "에어브러시 소프트 셀", pressure: 16, tilt: 15, spacing: 17, aa: 17, latency: 17, grain: 13 },
  "screentone-halftone-60l": { labelKo: "스크린톤 하프톤 60L", pressure: 16, tilt: 14, spacing: 17, aa: 17, latency: 17, grain: 14 },
});

export const UNIFIED_MATERIAL_CATALOG = Object.freeze([
  { id: "mat-bg-rooftop-01", titleKo: "서울 도심 옥상 노을 3D 세트", category: "bg3d", license: "cc0", commercialSafe: true, format: "glb", tags: ["옥상", "노을", "현대판타지", "도시", "rooftop"] },
  { id: "mat-bg-classroom-02", titleKo: "한국 고등학교 교실 주간/석양 3D", category: "bg3d", license: "cc0", commercialSafe: true, format: "glb", tags: ["교실", "학원물", "학교", "classroom"] },
  { id: "mat-bg-palace-03", titleKo: "로판 황궁 연회장 대리석 홀 3D", category: "bg3d", license: "commercial-safe", commercialSafe: true, format: "glb", tags: ["로판", "황궁", "연회장", "드레스"] },
  { id: "mat-brush-gpen-01", titleKo: "웹툰 주선 G펜 프로 브러시팩", category: "brush", license: "cc0", commercialSafe: true, format: "tsbrush", tags: ["선화", "g펜", "잉크", "lineart"] },
  { id: "mat-brush-crayon-02", titleKo: "오일 파스텔·왁스 크레용 100점 브러시", category: "brush", license: "cc0", commercialSafe: true, format: "tsbrush", tags: ["크레용", "질감", "동화", "수채"] },
  { id: "mat-tex-paper-01", titleKo: "코튼 수채지 300g 심리스 텍스처", category: "texture", license: "cc0", commercialSafe: true, format: "png", tags: ["종이", "질감", "수채", "paper"] },
  { id: "mat-tex-marble-02", titleKo: "비앙코 대리석 PBR 타일 텍스처", category: "texture", license: "mit", commercialSafe: true, format: "png", tags: ["대리석", "궁전", "건축", "pbr"] },
  { id: "mat-pose-action-01", titleKo: "헌터 공중 검격 VRM 포즈 12종", category: "pose", license: "cc0", commercialSafe: true, format: "vrma", tags: ["액션", "검격", "점프", "vrm", "포즈"] },
  { id: "mat-pose-romance-02", titleKo: "로판 왈츠·손키스 커플 VRM 포즈 8종", category: "pose", license: "commercial-safe", commercialSafe: true, format: "vrma", tags: ["로판", "커플", "포즈", "vrm"] },
  { id: "mat-tone-60l-01", titleKo: "60L 그라데이션 하프톤 스크린톤 24종", category: "screentone", license: "cc0", commercialSafe: true, format: "png", tags: ["스크린톤", "하프톤", "흑백", "만화"] },
  { id: "mat-sfx-impact-01", titleKo: "한·일·영 액션 임팩트 효과음 벡터 40종", category: "sfx", license: "cc0", commercialSafe: true, format: "svg", tags: ["효과음", "액션", "콰앙", "sfx"] },
]);

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/gu,
  /\bghp_[A-Za-z0-9]{20,}\b/gu,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/gu,
  /\bAIza[A-Za-z0-9_-]{24,}\b/gu,
  /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gu,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/gu,
];

export function redactSensitiveText(raw) {
  let out = String(raw ?? "");
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[비밀값 마스킹됨]");
  }
  return out.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gu, "[이메일 비공개]");
}

export function containsSensitiveSecret(raw) {
  const text = String(raw ?? "");
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

export function clampNum(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function sha256Hex(input) {
  return createHash("sha256").update(String(input), "utf8").digest("hex");
}

export function formatPlazaCurrencyAmount(amount, code) {
  const spec = PLAZA_FX_PER_KRW[code] ?? PLAZA_FX_PER_KRW.KRW;
  const rounded = spec.decimals === 0 ? Math.round(amount) : Number(amount.toFixed(spec.decimals));
  return `${spec.symbol}${rounded.toLocaleString("en-US")}`;
}

const KNOWN_SCOPES = new Set([
  "canvas.read", "asset.insert", "export.hook", "material.publish",
  "canvas.write", "network.external", "storage.raw",
  "auth.session", "filesystem.host", "shell.unrestricted", "secrets.read",
]);
const FORBIDDEN_SCOPES = new Set(["auth.session", "filesystem.host", "shell.unrestricted", "secrets.read"]);
const ELEVATED_SCOPES = new Set(["canvas.write", "network.external", "storage.raw"]);

const DANGEROUS_SCOPE_COMBOS = Object.freeze([
  { code: "EXFILTRATION_CANVAS_NET", pair: ["canvas.read", "network.external"], messageKo: "캔버스 읽기(canvas.read)와 외부 네트워크(network.external) 조합은 원고 무단 반출 위험으로 차단됩니다." },
  { code: "EXFILTRATION_EXPORT_NET", pair: ["export.hook", "network.external"], messageKo: "내보내기 후크(export.hook)와 외부 네트워크(network.external) 조합은 완성 원고 반출 위험으로 차단됩니다." },
  { code: "EXFILTRATION_PUBLISH_NET", pair: ["material.publish", "network.external"], messageKo: "소재 게시(material.publish)와 외부 네트워크(network.external) 조합은 무단 재배포 위험으로 차단됩니다." },
  { code: "TAMPER_STORAGE_CANVAS", pair: ["storage.raw", "canvas.write"], messageKo: "원시 저장소(storage.raw)와 캔버스 직접 쓰기(canvas.write) 조합은 로컬 원고 변조 위험으로 차단됩니다." },
  { code: "EXFILTRATION_STORAGE_NET", pair: ["storage.raw", "network.external"], messageKo: "원시 저장소(storage.raw)와 외부 네트워크(network.external) 조합은 전체 프로젝트 유출 위험으로 차단됩니다." },
]);

const PLUGIN_ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+){1,5}$/u;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const SDK_RANGE_RE = /^\^?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const SAFE_ENTRY_RE = /^\.?\/?[a-zA-Z0-9._/-]+\.(?:js|mjs|wasm)$/u;

export function verifyPluginManifestSandbox(manifest) {
  const violations = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return {
      ok: false, valid: false, verdict: "blocked", normalizedScopes: [],
      violations: [{ code: "INVALID_MANIFEST_OBJECT", severity: "error", messageKo: "매니페스트는 JSON 객체여야 합니다.", scopes: [] }],
      sandboxProfile: { isolationMode: "denied", networkAccess: "blocked", memoryCapMb: 0, cpuBudgetMs: 0, allowedApis: [] },
      manifestFingerprintSha256: sha256Hex("invalid-manifest"),
    };
  }

  if (containsSensitiveSecret(JSON.stringify(manifest))) {
    violations.push({
      code: "PLAINTEXT_SECRET_DETECTED",
      severity: "error",
      messageKo: "매니페스트 내부에 평문 API 키 또는 개인키 패턴이 감지되어 설치를 즉시 차단합니다.",
      scopes: [],
    });
  }

  const id = String(manifest.id ?? "").trim();
  const name = String(manifest.name ?? "").trim();
  const version = String(manifest.version ?? "").trim();
  const sdkApiVersion = String(manifest.sdkApiVersion ?? "^2.4.0").trim();
  const entryModule = String(manifest.entryModule ?? "").trim();
  const authorName = String(manifest.authorName ?? "").trim();

  if (!PLUGIN_ID_RE.test(id)) {
    violations.push({ code: "INVALID_PLUGIN_ID", severity: "error", messageKo: "플러그인 ID는 영소문자·숫자·점(.)·하이픈(-) 네임스페이스 형식이어야 합니다.", scopes: [] });
  }
  if (!name || !authorName) {
    violations.push({ code: "MISSING_IDENTITY", severity: "error", messageKo: "플러그인 이름(name)과 제작자(authorName)는 필수입니다.", scopes: [] });
  }
  if (!SEMVER_RE.test(version)) {
    violations.push({ code: "INVALID_SEMVER", severity: "error", messageKo: "버전은 SemVer(예: 2.4.0) 형식이어야 합니다.", scopes: [] });
  }
  const sdkMatch = SDK_RANGE_RE.exec(sdkApiVersion);
  if (!sdkMatch || Number(sdkMatch[1]) !== 2) {
    violations.push({ code: "UNSUPPORTED_SDK_VERSION", severity: "error", messageKo: "호환 SDK 버전은 2.x 대역(^2.0.0~^2.4.0)이어야 합니다.", scopes: [] });
  }
  if (!SAFE_ENTRY_RE.test(entryModule) || entryModule.includes("..")) {
    violations.push({ code: "UNSAFE_ENTRY_MODULE", severity: "error", messageKo: "진입 모듈(entryModule)은 상위 경로(..) 없는 로컬 .js/.mjs/.wasm 경로여야 합니다.", scopes: [] });
  }

  const rawScopes = Array.isArray(manifest.requestedScopes)
    ? manifest.requestedScopes
    : Array.isArray(manifest.permissions?.scopes)
      ? manifest.permissions.scopes
      : [];
  const normalizedScopes = [...new Set(rawScopes.map((s) => String(s).trim()).filter(Boolean))];
  const scopeSet = new Set(normalizedScopes);

  for (const scope of normalizedScopes) {
    if (!KNOWN_SCOPES.has(scope)) {
      violations.push({ code: "UNKNOWN_SCOPE", severity: "error", messageKo: `정의되지 않은 권한 스코프(${scope})는 샌드박스에서 거부됩니다.`, scopes: [scope] });
    } else if (FORBIDDEN_SCOPES.has(scope)) {
      violations.push({ code: "FORBIDDEN_SCOPE", severity: "error", messageKo: `영구 금지 권한(${scope})은 서드파티 플러그인에 부여할 수 없습니다.`, scopes: [scope] });
    } else if (ELEVATED_SCOPES.has(scope)) {
      violations.push({ code: "ELEVATED_SCOPE_REVIEW", severity: "warning", messageKo: `고위험 권한(${scope})이 포함되어 수동 보안 검토가 필요합니다.`, scopes: [scope] });
    }
  }
  for (const combo of DANGEROUS_SCOPE_COMBOS) {
    if (scopeSet.has(combo.pair[0]) && scopeSet.has(combo.pair[1])) {
      violations.push({ code: combo.code, severity: "error", messageKo: combo.messageKo, scopes: [...combo.pair] });
    }
  }

  const hasError = violations.some((v) => v.severity === "error");
  const hasWarn = violations.some((v) => v.severity === "warning");
  const verdict = hasError ? "blocked" : hasWarn ? "review-required" : "approved";
  const safeFingerprintSource = JSON.stringify({ id, version, sdkApiVersion, entryModule, requestedScopes: [...normalizedScopes].sort() });

  return {
    ok: !hasError,
    valid: !hasError,
    verdict,
    normalizedScopes,
    violations,
    sandboxProfile: {
      isolationMode: hasError ? "denied" : hasWarn ? "reviewed-isolated-worker" : "sandboxed-worker-no-network",
      networkAccess: !hasError && scopeSet.has("network.external") ? "allowlist-review" : "blocked",
      memoryCapMb: hasError ? 0 : hasWarn ? 128 : 256,
      cpuBudgetMs: hasError ? 0 : 1200,
      allowedApis: hasError ? [] : normalizedScopes,
    },
    manifestFingerprintSha256: sha256Hex(safeFingerprintSource),
  };
}

export const MCP_RESOURCES_CATALOG = Object.freeze([
  { uri: "toonstudio://state/snapshot", name: "ToonStudio 세션 상태 스냅샷", description: "현재 캔버스·분업·프리플라이트·에코시스템 v2 로컬 세션 상태(시크릿 무포함)", mimeType: "application/json" },
  { uri: "toonstudio://catalog/platforms", name: "6대 연재 플랫폼 출고 규격 정본", description: "네이버·카카오·레진·리디·픽코마·WEBTOON Global 폭·슬라이스·용량·여백 기준", mimeType: "application/json" },
  { uri: "toonstudio://policy/zero-bill-ai", name: "₩0 Fail-Closed 무료 AI 가드레일 상태", description: "무료 공급자 안전 할당량 및 유료 자동전환 차단 상태(API 키 미노출)", mimeType: "application/json" },
  { uri: "toonstudio://catalog/materials", name: "통합 CC0/상업 안전 소재 카탈로그", description: "3D 배경·브러시·텍스처·VRM 포즈·스크린톤·효과음 기본 소재 목록", mimeType: "application/json" },
]);

export const MCP_PROMPTS_CATALOG = Object.freeze([
  {
    name: "episode-preflight-audit",
    description: "6대 연재 플랫폼 출고 규격 + 국가별 심의/라이선스 + C2PA 저작권 증빙 원스톱 점검",
    arguments: [
      { name: "workTitle", description: "작품 제목", required: false },
      { name: "platform", description: "대상 플랫폼(all 또는 개별 플랫폼 ID)", required: false },
    ],
  },
  {
    name: "hyper-auto-episode-kickoff",
    description: "한 줄 아이디어에서 공정별 0~99% 하이퍼 오토메이션 계획과 분업 패킷을 생성",
    arguments: [
      { name: "idea", description: "회차 한 줄 아이디어", required: true },
      { name: "mode", description: "manual-pro|assisted|balanced|turbo|one-click-99", required: false },
    ],
  },
  {
    name: "hiatus-sos-rescue-handoff",
    description: "결원 발생 시 10분 긴급 대타 매칭 + 글로벌 6통화 에스크로 견적 산출",
    arguments: [
      { name: "missingRole", description: "결원 직군(lineart|color|bg3d|vfx|lettering|storyboard)", required: true },
      { name: "partnerRegion", description: "외주 지역(KR|JP|VN|TH|ID|PH|US)", required: false },
    ],
  },
  {
    name: "osmu-ip-expansion-pack",
    description: "웹툰 원고의 웹소설·드라마 피치·24fps 애니 X-Sheet 변환 및 BEP·7개국 세무 계산",
    arguments: [
      { name: "workTitle", description: "작품 제목", required: false },
      { name: "plannedEpisodes", description: "계획 회차 수", required: false },
    ],
  },
]);

export function readMcpResourceByUri(uri, { state, inspectQuota }) {
  if (uri === "toonstudio://state/snapshot") return { ok: true, mimeType: "application/json", text: JSON.stringify(state, null, 2) };
  if (uri === "toonstudio://catalog/platforms") return { ok: true, mimeType: "application/json", text: JSON.stringify(SIX_PLATFORM_SPECS, null, 2) };
  if (uri === "toonstudio://policy/zero-bill-ai") return { ok: true, mimeType: "application/json", text: JSON.stringify(inspectQuota(), null, 2) };
  if (uri === "toonstudio://catalog/materials") return { ok: true, mimeType: "application/json", text: JSON.stringify(UNIFIED_MATERIAL_CATALOG, null, 2) };
  return { ok: false, error: `Unknown resource URI: ${String(uri)}` };
}

export function buildMcpPromptMessages(name, args = {}) {
  const safeTitle = redactSensitiveText(args.workTitle || "현재 연재작");
  if (name === "episode-preflight-audit") {
    const platform = redactSensitiveText(args.platform || "all");
    return {
      ok: true,
      description: "6대 플랫폼 출고 전 규격·심의·C2PA 종합 점검 워크플로",
      messages: [{ role: "user", content: { type: "text", text: `'${safeTitle}' 원고를 출고하기 전에 toonstudio_preflight_6platforms(platform="${platform}"), toonstudio_ai_qa_compliance_scan, toonstudio_c2pa_provenance_pack을 순서대로 실행해 ₩0 무과금 증빙 리포트를 정리해 주세요.` } }],
    };
  }
  if (name === "hyper-auto-episode-kickoff") {
    const idea = redactSensitiveText(args.idea || "서울 옥상에서 각성한 헌터의 첫 전투");
    const mode = redactSensitiveText(args.mode || "balanced");
    return {
      ok: true,
      description: "한 줄 아이디어 기반 하이퍼 오토메이션 + 분업 패킷 생성",
      messages: [{ role: "user", content: { type: "text", text: `아이디어 "${idea}"로 toonstudio_hyper_automate_episode(mode="${mode}")를 실행한 뒤 studio.division.split_episode_cuts로 직군별 분업 패킷을 생성해 주세요.` } }],
    };
  }
  if (name === "hiatus-sos-rescue-handoff") {
    const role = redactSensitiveText(args.missingRole || "lineart");
    const region = redactSensitiveText(args.partnerRegion || "VN");
    return {
      ok: true,
      description: "결원 10분 긴급 대타 매칭 + 글로벌 6통화 견적",
      messages: [{ role: "user", content: { type: "text", text: `${role} 직군 결원에 대해 toonstudio_hiatus_sos_match로 긴급 대타 랭킹과 작화 인계 키트를 만들고, toonstudio_global_plaza_quote(partnerRegion="${region}")로 에스크로 견적을 산출해 주세요.` } }],
    };
  }
  if (name === "osmu-ip-expansion-pack") {
    const episodes = Math.round(clampNum(args.plannedEpisodes, 50, 1, 500));
    return {
      ok: true,
      description: "OSMU 2차 IP 확장 패키지 + BEP·7개국 원천징수 정산",
      messages: [{ role: "user", content: { type: "text", text: `'${safeTitle}'(${episodes}화 기준)에 대해 toonstudio_osmu_adapt_ip와 toonstudio_bep_crossborder_tax를 실행해 웹소설/드라마/애니 X-Sheet 계획과 손익분기·원천징수 정산표를 작성해 주세요.` } }],
    };
  }
  return { ok: false, error: `Unknown prompt: ${String(name)}` };
}

export function evaluateSixPlatformPreflight(args, canvas) {
  const requested = String(args.platform || "all");
  const targetKeys =
    requested === "all" ? Object.keys(SIX_PLATFORM_SPECS) : SIX_PLATFORM_SPECS[requested] ? [requested] : [];
  if (targetKeys.length === 0) {
    return { ok: false, error: `지원하지 않는 플랫폼입니다: ${requested}` };
  }
  const widthPx = Math.round(clampNum(args.widthPx, canvas.width, 64, 8000));
  const heightPx = Math.round(clampNum(args.heightPx, canvas.height, 64, 500_000));
  const totalSizeMb = Number(clampNum(args.totalSizeMb, 12, 0.1, 1000).toFixed(2));
  const format = String(args.format || "jpg").toLowerCase();
  const colorProfile = String(args.colorProfile || "sRGB");
  const rightsBomClean = args.rightsBomClean !== false;
  const forbiddenWords = [
    "TODO", "임시대사", "TBD",
    ...(Array.isArray(args.customForbiddenWords) ? args.customForbiddenWords.map(String) : []),
  ];
  const balloonTexts = canvas.balloons.map((b) => String(b.text || ""));
  const matchedWords = forbiddenWords.filter(
    (word) => word && balloonTexts.some((line) => line.toLowerCase().includes(word.toLowerCase())),
  );

  const reports = targetKeys.map((key) => {
    const spec = SIX_PLATFORM_SPECS[key];
    const issues = [];
    if (!spec.allowedWidthsPx.includes(widthPx)) {
      issues.push({ severity: "fix", code: "WIDTH_MISMATCH", detail: `현재 폭 ${widthPx}px → 허용 폭 ${spec.allowedWidthsPx.join("/")}px (권장 ${spec.recommendedWidthPx}px)` });
    }
    if (!spec.allowedFormats.includes(format)) {
      issues.push({ severity: "fix", code: "FORMAT_UNSUPPORTED", detail: `${format.toUpperCase()} 포맷은 미지원입니다. 허용 포맷: ${spec.allowedFormats.join(", ")}` });
    }
    if (colorProfile !== spec.requiredColorProfile) {
      issues.push({ severity: "fix", code: "COLOR_PROFILE_MISMATCH", detail: `${colorProfile} 프로파일을 ${spec.requiredColorProfile}로 변환해야 합니다.` });
    }
    if (totalSizeMb > spec.maxEpisodeTotalMb) {
      issues.push({ severity: "fix", code: "TOTAL_SIZE_EXCEEDED", detail: `총 용량 ${totalSizeMb}MB가 상한(${spec.maxEpisodeTotalMb}MB)을 초과했습니다.` });
    }
    if (!rightsBomClean) {
      issues.push({ severity: "blocked", code: "RIGHTS_BOM_BLOCKED", detail: "Rights BOM 미검증 소재가 포함되어 출고를 차단합니다." });
    }
    if (matchedWords.length > 0) {
      issues.push({ severity: "warn", code: "FORBIDDEN_OR_PLACEHOLDER_TEXT", detail: `말풍선에서 임시/금칙어 감지: ${matchedWords.join(", ")}` });
    }
    const hasBlocked = issues.some((i) => i.severity === "blocked");
    const hasFix = issues.some((i) => i.severity === "fix");
    return {
      platformId: spec.id,
      labelKo: spec.labelKo,
      region: spec.region,
      verdict: hasBlocked ? "blocked" : hasFix ? "needs-fix" : "ready",
      recommendedWidthPx: spec.recommendedWidthPx,
      estimatedSliceCount: Math.max(1, Math.ceil(heightPx / spec.maxSliceHeightPx)),
      writingDirection: spec.writingDirection,
      issues,
    };
  });

  const summary = {
    checkedPlatforms: reports.length,
    readyCount: reports.filter((r) => r.verdict === "ready").length,
    needsFixCount: reports.filter((r) => r.verdict === "needs-fix").length,
    blockedCount: reports.filter((r) => r.verdict === "blocked").length,
  };
  return { ok: summary.blockedCount === 0, summary, reports, costGuaranteedZeroUsd: 0 };
}

export function evaluateBepCrossBorderTax(args) {
  const plannedEpisodes = Math.round(clampNum(args.plannedEpisodes, 50, 1, 500));
  const cutsPerEpisode = Math.round(clampNum(args.cutsPerEpisode, 60, 10, 200));
  const costPerCutKrw = Math.round(clampNum(args.costPerCutKrw, 45_000, 1_000, 500_000));
  const fixedOverheadPerEpisodeKrw = Math.round(clampNum(args.fixedOverheadPerEpisodeKrw, 600_000, 0, 50_000_000));
  const initialSetupCostKrw = Math.round(clampNum(args.initialSetupCostKrw, 5_000_000, 0, 500_000_000));
  const mgPerEpisodeKrw = Math.round(clampNum(args.mgPerEpisodeKrw, 2_500_000, 0, 100_000_000));
  const rsRatePct = clampNum(args.rsRatePct, 50, 0, 100);
  const grossRevenuePerEpisodeKrw = Math.round(clampNum(args.grossRevenuePerEpisodeKrw, 7_500_000, 0, 500_000_000));

  const costPerEpisodeKrw = cutsPerEpisode * costPerCutKrw + fixedOverheadPerEpisodeKrw;
  const rsPerEpisodeKrw = Math.round((grossRevenuePerEpisodeKrw * rsRatePct) / 100);
  const effectiveRevenuePerEpisodeKrw = Math.max(mgPerEpisodeKrw, rsPerEpisodeKrw);
  const netMarginPerEpKrw = effectiveRevenuePerEpisodeKrw - costPerEpisodeKrw;
  const bepEpisode = netMarginPerEpKrw > 0 ? Math.ceil(initialSetupCostKrw / netMarginPerEpKrw) : null;
  const totalCostKrw = initialSetupCostKrw + costPerEpisodeKrw * plannedEpisodes;
  const totalStudioRevenueKrw = effectiveRevenuePerEpisodeKrw * plannedEpisodes;

  const rawLines =
    Array.isArray(args.crossBorderLines) && args.crossBorderLines.length > 0
      ? args.crossBorderLines
      : [
          { jurisdiction: "KR", grossKrw: 4_000_000, treatySubmitted: true },
          { jurisdiction: "JP", grossKrw: 2_000_000, treatySubmitted: true },
          { jurisdiction: "US", grossKrw: 1_500_000, treatySubmitted: true },
        ];

  const taxLines = rawLines.map((line) => {
    const code = String(line?.jurisdiction || "KR").toUpperCase();
    const rule = SEVEN_COUNTRY_TAX_RULES[code] ?? SEVEN_COUNTRY_TAX_RULES.KR;
    const grossKrw = Math.max(0, Math.round(Number(line?.grossKrw ?? 0)));
    const treatySubmitted = line?.treatySubmitted !== false;
    const withholdingRatePct = treatySubmitted ? rule.treatyPct : rule.statutoryPct;
    const withholdingTaxKrw = Math.round((grossKrw * withholdingRatePct) / 100);
    return {
      jurisdiction: code, countryKo: rule.countryKo, grossKrw, treatySubmitted,
      withholdingRatePct, withholdingTaxKrw, netRemittanceKrw: grossKrw - withholdingTaxKrw, requiredFormKo: rule.formKo,
    };
  });

  return {
    supportedJurisdictions: Object.keys(SEVEN_COUNTRY_TAX_RULES),
    bep: {
      plannedEpisodes, costPerEpisodeKrw, effectiveRevenuePerEpisodeKrw, bepEpisode,
      mgRecouped: rsPerEpisodeKrw >= mgPerEpisodeKrw, totalCostKrw, totalStudioRevenueKrw,
      totalNetProfitKrw: totalStudioRevenueKrw - totalCostKrw,
    },
    crossBorderTax: {
      lines: taxLines,
      totalGrossKrw: taxLines.reduce((s, l) => s + l.grossKrw, 0),
      totalWithholdingKrw: taxLines.reduce((s, l) => s + l.withholdingTaxKrw, 0),
      totalNetRemittanceKrw: taxLines.reduce((s, l) => s + l.netRemittanceKrw, 0),
    },
  };
}
