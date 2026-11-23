/**
 * 개방형 외부 협업·이슈 트래커 양방향 커넥터 엔진 (Wave 18 Track 1).
 *
 * - 6종 커넥터(Jira Cloud REST v3 ADF · Linear GraphQL · Slack Block Kit · Discord Rich Embed · Notion · GitHub Issues)
 *   드라이런 페이로드 생성 및 스키마·비밀값 무노출 검증
 * - 순수 동기식 FIPS 180-4 SHA-256 / RFC 2104 HMAC-SHA256 웹훅 서명 검증 + 재생 공격(Timestamp Skew) 방어
 * - 멱등성(Idempotency) 키 생성 및 재전송 중복 반영 0건 원장
 * - 외부 웹훅 상태 전이(Jira/Linear/GitHub/Notion/Slack/Discord) -> ToonStudio 컷 검수 상태 정규화
 */

export type ExternalTrackerProvider = "jira" | "linear" | "slack" | "discord" | "notion" | "github";
export type ToonStudioReviewEventKind = "redline-pin-created" | "cut-changes-requested" | "cut-approved" | "signoff-completed" | "deadline-urgent";
export type ToonStudioCutReviewStatus = "pending" | "in-review" | "in-progress" | "changes-requested" | "approved" | "archived";
export type ReviewSeverity = "low" | "medium" | "high" | "urgent";

export interface ToonStudioReviewEvent {
  readonly eventId: string; readonly eventKind: ToonStudioReviewEventKind;
  readonly workId: string; readonly workTitle: string;
  readonly episodeId: string; readonly episodeTitle: string;
  readonly cutId: string; readonly stageId: "conti" | "lineart" | "bg3d" | "flatting" | "shading" | "lettering" | "pd-final";
  readonly pinId?: string; readonly pinCoords?: { readonly xRatio: number; readonly yRatio: number };
  readonly summary: string; readonly description: string;
  readonly severity: ReviewSeverity; readonly reasonTags: readonly string[];
  readonly reporterName: string; readonly assigneeHandle?: string;
  readonly deepLinkUrl: string; readonly dueAtIso?: string; readonly occurredAtIso: string;
  readonly rightsBomStatus?: "clean" | "warning" | "blocked"; readonly sourceToolLabel?: string; readonly locale?: "ko" | "en";
}

export interface ExternalStatusMapping {
  readonly externalStatus: string; readonly toonStudioStatus: ToonStudioCutReviewStatus;
}

export interface ExternalTrackerConnectorConfig {
  readonly provider: ExternalTrackerProvider; readonly enabled: boolean; readonly dryRunOnly: boolean;
  readonly workspaceLabel: string; readonly targetKey: string;
  readonly cycleOrBoardId?: string; readonly siteDomain?: string;
  readonly authEnvVarName: string; readonly webhookSecretEnvVarName: string;
  readonly statusMappings: readonly ExternalStatusMapping[];
}

export interface ProviderMetadata {
  readonly provider: ExternalTrackerProvider; readonly nameKo: string; readonly nameEn: string;
  readonly protocolLabel: string; readonly bidirectional: boolean;
  readonly summaryKo: string; readonly summaryEn: string;
}

export interface DryRunEnvelope<TPayload = Record<string, unknown>> {
  readonly ok: boolean; readonly provider: ExternalTrackerProvider; readonly dryRun: boolean;
  readonly method: "POST"; readonly endpointTemplate: string; readonly authBinding: string;
  readonly idempotencyKey: string; readonly payload: TPayload;
  readonly validationErrors: readonly string[]; readonly leakedSecretFindings: readonly string[];
}

export interface WebhookSignatureVerificationInput {
  readonly provider: ExternalTrackerProvider; readonly rawBody: string;
  readonly signatureHeader: string | undefined; readonly secret: string;
  readonly timestampHeader?: string; readonly nowEpochSec?: number; readonly maxTimestampSkewSec?: number;
}

export interface WebhookSignatureVerificationResult {
  readonly valid: boolean; readonly scheme: "sha256-prefix" | "raw-hex" | "slack-v0" | "invalid"; readonly reason: string;
}

export interface IdempotencyKeyInput {
  readonly provider: ExternalTrackerProvider; readonly deliveryId: string;
  readonly eventType: string; readonly entityKey: string; readonly revisionToken?: string;
}

export interface IdempotencyLedgerEntry {
  readonly idempotencyKey: string; readonly provider: ExternalTrackerProvider;
  readonly deliveryId: string; readonly recordedAtIso: string;
}

export interface IdempotencyLedger {
  readonly entries: readonly IdempotencyLedgerEntry[]; readonly seenKeys: ReadonlySet<string>;
}

export interface NormalizedWebhookTransition {
  readonly accepted: boolean; readonly duplicate: boolean; readonly provider: ExternalTrackerProvider;
  readonly deliveryId: string; readonly idempotencyKey: string;
  readonly signatureStatus: "verified" | "invalid" | "skipped-dry-run";
  readonly externalEntityKey: string; readonly externalStatus: string;
  readonly mappedCutId: string | null; readonly mappedEpisodeId: string | null; readonly mappedPinId: string | null;
  readonly nextToonStudioStatus: ToonStudioCutReviewStatus | null;
  readonly actorName: string; readonly summary: string; readonly occurredAtIso: string;
  readonly errorReason?: string; readonly nextLedger: IdempotencyLedger;
}

export interface ParseExternalWebhookInput {
  readonly provider: ExternalTrackerProvider; readonly rawBody: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly webhookSecret?: string; readonly nowEpochSec?: number; readonly maxTimestampSkewSec?: number;
  readonly statusMappings?: readonly ExternalStatusMapping[]; readonly ledger?: IdempotencyLedger;
}

export interface JiraAdfIssuePayload {
  readonly fields: {
    readonly project: { readonly key: string };
    readonly issuetype: { readonly name: "Bug" | "Task" };
    readonly summary: string;
    readonly priority: { readonly name: "Highest" | "High" | "Medium" | "Low" };
    readonly labels: readonly string[]; readonly duedate?: string;
    readonly description: { readonly type: "doc"; readonly version: 1; readonly content: readonly Record<string, unknown>[] };
  };
  readonly toonstudioMeta: { readonly workId: string; readonly episodeId: string; readonly cutId: string; readonly stageId: string; readonly pinId: string | null };
}

export interface LinearGraphqlPayload {
  readonly operationName: "ToonStudioCreateReviewIssue";
  readonly query: string;
  readonly variables: {
    readonly input: {
      readonly teamId: string; readonly cycleId?: string; readonly title: string; readonly description: string;
      readonly priority: 1 | 2 | 3 | 4; readonly dueDate?: string; readonly labelNames: readonly string[];
    };
  };
}

export interface SlackBlockKitPayload {
  readonly channel: string; readonly text: string; readonly blocks: readonly Record<string, unknown>[];
}

export interface DiscordRichEmbedPayload {
  readonly username: string; readonly content: string;
  readonly embeds: readonly {
    readonly title: string; readonly description: string; readonly url: string;
    readonly color: number; readonly timestamp: string;
    readonly fields: readonly { readonly name: string; readonly value: string; readonly inline: boolean }[];
    readonly footer: { readonly text: string };
  }[];
}

export interface NotionDatabaseRowPayload {
  readonly parent: { readonly database_id: string };
  readonly properties: Readonly<Record<string, unknown>>;
  readonly children: readonly Record<string, unknown>[];
}

export interface GitHubIssuePayload {
  readonly title: string; readonly body: string; readonly labels: readonly string[]; readonly assignees?: readonly string[];
}

export const EXTERNAL_TRACKER_PROVIDERS: readonly ExternalTrackerProvider[] = [
  "jira", "linear", "slack", "discord", "notion", "github",
];

export const PROVIDER_METADATA: Readonly<Record<ExternalTrackerProvider, ProviderMetadata>> = {
  jira: { provider: "jira", nameKo: "Jira Cloud", nameEn: "Jira Cloud", protocolLabel: "REST v3 · ADF · Webhook", bidirectional: true, summaryKo: "레드라인 핀·반려 컷을 ADF 이슈로 자동 발행하고 상태 변경 웹훅을 양방향 반영합니다.", summaryEn: "Publishes redline pins & cut rejections as ADF issues and syncs status webhooks back." },
  linear: { provider: "linear", nameKo: "Linear", nameEn: "Linear", protocolLabel: "GraphQL · Cycle · Webhook", bidirectional: true, summaryKo: "팀·사이클·우선순위와 컷 딥링크를 GraphQL 뮤테이션으로 동기화합니다.", summaryEn: "Syncs team, cycle, priority, and cut deep links via GraphQL mutations." },
  slack: { provider: "slack", nameKo: "Slack", nameEn: "Slack", protocolLabel: "Block Kit · Interactive", bidirectional: true, summaryKo: "검수 요청·반려·결재 완료·긴급 마감 Block Kit 알림 카드와 인터랙티브 승인을 제공합니다.", summaryEn: "Delivers Block Kit review alerts and receives interactive approve/reject actions." },
  discord: { provider: "discord", nameKo: "Discord", nameEn: "Discord", protocolLabel: "Rich Embed · Action Hook", bidirectional: true, summaryKo: "어시스턴트·외주 팀 채널로 컷 검수 Embed 카드와 마감 경보를 전송합니다.", summaryEn: "Posts cut review Rich Embed cards and urgent deadline alerts to studio channels." },
  notion: { provider: "notion", nameKo: "Notion", nameEn: "Notion", protocolLabel: "Database Page · Sync", bidirectional: true, summaryKo: "연재 회차 캘린더·설정집 DB 행과 검수 상태·Rights BOM 속성을 동기화합니다.", summaryEn: "Syncs episode calendar & story bible DB rows with review status and Rights BOM tags." },
  github: { provider: "github", nameKo: "GitHub Issues", nameEn: "GitHub Issues", protocolLabel: "REST Issues · Checklist", bidirectional: true, summaryKo: "에셋 파이프라인 PR·QA 체크리스트 이슈를 생성하고 닫힘/재오픈 이벤트를 반영합니다.", summaryEn: "Creates QA checklist issues for asset pipelines and mirrors close/reopen events." },
};

// 1. 순수 동기식 FIPS 180-4 SHA-256 & RFC 2104 HMAC-SHA256
const SHA256_H0 = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const UTF8_ENCODER = new TextEncoder();

function rotr32(v: number, bits: number): number {
  return ((v >>> bits) | (v << (32 - bits))) >>> 0;
}

export function sha256Bytes(data: Uint8Array): Uint8Array {
  const paddedLen = Math.ceil((data.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor((data.length * 8) / 0x100000000) >>> 0, false);
  view.setUint32(paddedLen - 4, (data.length * 8) >>> 0, false);

  const hash = new Uint32Array(SHA256_H0);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ ((~e >>> 0) & g)) >>> 0;
      const t1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0; hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0; hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i += 1) outView.setUint32(i * 4, hash[i], false);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

export function sha256Hex(message: string): string {
  return bytesToHex(sha256Bytes(UTF8_ENCODER.encode(message)));
}

export function hmacSha256Hex(secret: string, payload: string): string {
  const keyRaw = UTF8_ENCODER.encode(secret);
  const keyBlock = new Uint8Array(64);
  keyBlock.set(keyRaw.length > 64 ? sha256Bytes(keyRaw) : keyRaw);
  const oKeyPad = new Uint8Array(64);
  const iKeyPad = new Uint8Array(64);
  for (let i = 0; i < 64; i += 1) {
    oKeyPad[i] = keyBlock[i] ^ 0x5c;
    iKeyPad[i] = keyBlock[i] ^ 0x36;
  }
  const msgBytes = UTF8_ENCODER.encode(payload);
  const innerInput = new Uint8Array(64 + msgBytes.length);
  innerInput.set(iKeyPad);
  innerInput.set(msgBytes, 64);
  const outerInput = new Uint8Array(96);
  outerInput.set(oKeyPad);
  outerInput.set(sha256Bytes(innerInput), 64);
  return bytesToHex(sha256Bytes(outerInput));
}

export function constantTimeEqualHex(left: string, right: string): boolean {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function verifyWebhookHmacSignature(input: WebhookSignatureVerificationInput): WebhookSignatureVerificationResult {
  if (!input.secret.trim()) return { valid: false, scheme: "invalid", reason: "missing-webhook-secret" };
  const rawSig = input.signatureHeader?.trim() ?? "";
  if (!rawSig) return { valid: false, scheme: "invalid", reason: "missing-signature-header" };

  if (input.provider === "slack" || rawSig.startsWith("v0=")) {
    const tsRaw = input.timestampHeader?.trim() ?? "";
    const tsNum = Number(tsRaw);
    if (!tsRaw || !Number.isFinite(tsNum)) return { valid: false, scheme: "slack-v0", reason: "missing-slack-timestamp" };
    if (typeof input.nowEpochSec === "number" && Math.abs(input.nowEpochSec - tsNum) > (input.maxTimestampSkewSec ?? 300)) {
      return { valid: false, scheme: "slack-v0", reason: "timestamp-skew-exceeded" };
    }
    const providedHex = rawSig.startsWith("v0=") ? rawSig.slice(3) : rawSig;
    const expectedHex = hmacSha256Hex(input.secret, `v0:${tsRaw}:${input.rawBody}`);
    const valid = /^[0-9a-f]{64}$/i.test(providedHex) && constantTimeEqualHex(providedHex, expectedHex);
    return { valid, scheme: "slack-v0", reason: valid ? "verified" : "signature-mismatch" };
  }

  const hasPrefix = rawSig.startsWith("sha256=") || rawSig.startsWith("hmac-sha256=");
  const providedHex = rawSig.startsWith("sha256=") ? rawSig.slice(7) : rawSig.startsWith("hmac-sha256=") ? rawSig.slice(12) : rawSig;
  if (!/^[0-9a-f]{64}$/i.test(providedHex)) return { valid: false, scheme: "invalid", reason: "malformed-hex-signature" };
  const valid = constantTimeEqualHex(providedHex, hmacSha256Hex(input.secret, input.rawBody));
  return { valid, scheme: hasPrefix ? "sha256-prefix" : "raw-hex", reason: valid ? "verified" : "signature-mismatch" };
}

// 2. 멱등성 키 & 중복 웹훅 차단 원장 + 비밀값 무노출 가드
export function computeIdempotencyKey(input: IdempotencyKeyInput): string {
  const canonical = [input.provider, input.deliveryId.trim(), input.eventType.trim(), input.entityKey.trim(), (input.revisionToken ?? "").trim()].join("|");
  return `idem_${sha256Hex(canonical).slice(0, 32)}`;
}

export function createIdempotencyLedger(initialEntries: readonly IdempotencyLedgerEntry[] = []): IdempotencyLedger {
  const seenKeys = new Set<string>();
  const entries: IdempotencyLedgerEntry[] = [];
  for (const entry of initialEntries) {
    if (seenKeys.has(entry.idempotencyKey)) continue;
    seenKeys.add(entry.idempotencyKey);
    entries.push(entry);
  }
  return { entries, seenKeys };
}

export function recordOrRejectIdempotencyKey(
  ledger: IdempotencyLedger,
  entry: IdempotencyLedgerEntry,
): { readonly accepted: boolean; readonly duplicate: boolean; readonly ledger: IdempotencyLedger } {
  if (ledger.seenKeys.has(entry.idempotencyKey)) return { accepted: false, duplicate: true, ledger };
  const nextSeen = new Set(ledger.seenKeys);
  nextSeen.add(entry.idempotencyKey);
  return { accepted: true, duplicate: false, ledger: { entries: [...ledger.entries, entry], seenKeys: nextSeen } };
}

const SECRET_LEAK_RULES: readonly { readonly code: string; readonly regex: RegExp }[] = [
  { code: "raw-bearer-credential", regex: /\bBearer\s+(?!<env:)[A-Za-z0-9._-]{16,}/ },
  { code: "raw-basic-credential", regex: /\bBasic\s+(?!<env:)[A-Za-z0-9+/=]{16,}/ },
  { code: "url-embedded-userinfo", regex: /https?:\/\/[^/\s:@]+:[^/\s@]+@/i },
  { code: "slack-token-prefix", regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}/ },
  { code: "github-pat-prefix", regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/ },
  { code: "atlassian-token-prefix", regex: /\bATATT[A-Za-z0-9_-]{16,}/ },
  { code: "linear-key-prefix", regex: /\blin_api_[A-Za-z0-9]{16,}/ },
];

export function detectRawSecretPatterns(serialized: string): readonly string[] {
  return SECRET_LEAK_RULES.filter((rule) => rule.regex.test(serialized)).map((rule) => rule.code);
}

// 3. 6종 외부 협업·이슈 트래커 드라이런 페이로드 빌더
function severityToJiraPriority(severity: ReviewSeverity): "Highest" | "High" | "Medium" | "Low" {
  return severity === "urgent" ? "Highest" : severity === "high" ? "High" : severity === "medium" ? "Medium" : "Low";
}

function severityToLinearPriority(severity: ReviewSeverity): 1 | 2 | 3 | 4 {
  return severity === "urgent" ? 1 : severity === "high" ? 2 : severity === "medium" ? 3 : 4;
}

const EVENT_KIND_META: Readonly<Record<ToonStudioReviewEventKind, { readonly ko: string; readonly en: string }>> = {
  "redline-pin-created": { ko: "레드라인 검수 핀", en: "Redline Review Pin" },
  "cut-changes-requested": { ko: "컷 결재 반려", en: "Cut Changes Requested" },
  "cut-approved": { ko: "컷 승인 완료", en: "Cut Approved" },
  "signoff-completed": { ko: "회차 결재 완료", en: "Episode Sign-off Complete" },
  "deadline-urgent": { ko: "긴급 마감 경보", en: "Urgent Deadline Alert" },
};

function labelEvent(event: ToonStudioReviewEvent): string {
  return event.locale === "en" ? EVENT_KIND_META[event.eventKind].en : EVENT_KIND_META[event.eventKind].ko;
}

// Discord Embed color는 24비트 정수 규격(원시 hex 문자열 미사용)
function discordColorDecimal(kind: ToonStudioReviewEventKind, severity: ReviewSeverity): number {
  if (kind === "cut-approved" || kind === "signoff-completed") return 3066993;
  if (kind === "cut-changes-requested" || severity === "urgent") return 15158332;
  return kind === "deadline-urgent" || severity === "high" ? 15105570 : 3447003;
}

export function buildJiraIssuePayload(event: ToonStudioReviewEvent, config: ExternalTrackerConnectorConfig): JiraAdfIssuePayload {
  const en = event.locale === "en";
  const coordText = event.pinCoords ? `x=${(event.pinCoords.xRatio * 100).toFixed(1)}%, y=${(event.pinCoords.yRatio * 100).toFixed(1)}%` : en ? "Full cut canvas" : "전체 컷 영역";
  const labels = ["toonstudio", `episode-${event.episodeId}`, `cut-${event.cutId}`, `stage-${event.stageId}`, ...(event.pinId ? [`pin-${event.pinId}`] : []), ...event.reasonTags.map((t) => `reason-${t}`)];
  const bullets = [
    `${en ? "Episode/Cut/Stage" : "회차/컷/공정"}: ${event.episodeTitle} / ${event.cutId} / ${event.stageId}`,
    `${en ? "Pin" : "핀 위치"}: ${coordText} · ${en ? "Reporter" : "요청자"}: ${event.reporterName}`,
    `${en ? "BYOT Tool" : "외부 드로잉 툴"}: ${event.sourceToolLabel ?? "ToonStudio"} · Rights BOM: ${event.rightsBomStatus ?? "clean"}`,
  ];
  return {
    fields: {
      project: { key: config.targetKey || "WEBTOON" },
      issuetype: { name: event.eventKind === "cut-changes-requested" || event.eventKind === "redline-pin-created" ? "Bug" : "Task" },
      summary: `[${event.episodeTitle} · ${event.cutId.toUpperCase()}] ${event.summary}${event.pinId ? ` [${event.pinId}]` : ""}`,
      priority: { name: severityToJiraPriority(event.severity) }, labels,
      ...(event.dueAtIso ? { duedate: event.dueAtIso.slice(0, 10) } : {}),
      description: {
        type: "doc", version: 1,
        content: [
          { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: `${labelEvent(event)} — ${event.workTitle}` }] },
          { type: "paragraph", content: [{ type: "text", text: event.description }] },
          { type: "bulletList", content: bullets.map((text) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })) },
          { type: "paragraph", content: [{ type: "text", text: en ? "Open in ToonStudio: " : "ToonStudio 컷 검수 바로가기: " }, { type: "text", text: event.deepLinkUrl, marks: [{ type: "link", attrs: { href: event.deepLinkUrl } }] }] },
        ],
      },
    },
    toonstudioMeta: { workId: event.workId, episodeId: event.episodeId, cutId: event.cutId, stageId: event.stageId, pinId: event.pinId ?? null },
  };
}

export function buildLinearGraphqlPayload(event: ToonStudioReviewEvent, config: ExternalTrackerConnectorConfig): LinearGraphqlPayload {
  const description = [
    `### ${labelEvent(event)} (${event.workTitle} · ${event.episodeTitle})`, "", event.description, "",
    `- **Cut**: \`${event.cutId}\` · **Stage**: \`${event.stageId}\``,
    `- **Reporter**: ${event.reporterName} · **BYOT Tool**: ${event.sourceToolLabel ?? "ToonStudio"}`,
    `- **Rights BOM**: \`${event.rightsBomStatus ?? "clean"}\``,
    `- **Deep Link**: [Open in ToonStudio](${event.deepLinkUrl})`,
  ].join("\n");
  return {
    operationName: "ToonStudioCreateReviewIssue",
    query: "mutation ToonStudioCreateReviewIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url state { name type } } } }",
    variables: {
      input: {
        teamId: config.targetKey || "team-webtoon-prod", ...(config.cycleOrBoardId ? { cycleId: config.cycleOrBoardId } : {}),
        title: `[${event.episodeId}/${event.cutId}] ${event.summary}`, description, priority: severityToLinearPriority(event.severity),
        ...(event.dueAtIso ? { dueDate: event.dueAtIso.slice(0, 10) } : {}), labelNames: ["toonstudio", event.stageId, ...event.reasonTags],
      },
    },
  };
}

export function buildSlackBlockKitPayload(event: ToonStudioReviewEvent, config: ExternalTrackerConnectorConfig): SlackBlockKitPayload {
  const en = event.locale === "en";
  const headline = `[${labelEvent(event)}] ${event.episodeTitle} ${event.cutId.toUpperCase()} — ${event.summary}`;
  return {
    channel: config.targetKey || "#webtoon-review", text: headline,
    blocks: [
      { type: "header", text: { type: "plain_text", text: headline.slice(0, 150) } },
      {
        type: "section", text: { type: "mrkdwn", text: event.description },
        fields: [
          { type: "mrkdwn", text: `*${en ? "Work / Episode" : "작품/회차"}*\n${event.workTitle} · ${event.episodeTitle}` },
          { type: "mrkdwn", text: `*${en ? "Cut / Stage" : "컷/공정"}*\n${event.cutId} · ${event.stageId}` },
          { type: "mrkdwn", text: `*${en ? "Reporter" : "요청자"}*\n${event.reporterName}` },
          { type: "mrkdwn", text: `*Rights BOM*\n${event.rightsBomStatus ?? "clean"}` },
        ],
      },
      { type: "context", elements: [{ type: "mrkdwn", text: `BYOT: ${event.sourceToolLabel ?? "ToonStudio"} · ${en ? "Severity" : "심각도"}: ${event.severity}${event.dueAtIso ? ` · ${en ? "Due" : "마감"}: ${event.dueAtIso}` : ""}` }] },
      {
        type: "actions",
        elements: [
          { type: "button", text: { type: "plain_text", text: en ? "Open Cut in ToonStudio" : "ToonStudio 컷 열기" }, url: event.deepLinkUrl, action_id: "toonstudio_open_cut" },
          { type: "button", text: { type: "plain_text", text: en ? "Approve Cut" : "컷 승인 반영" }, value: `${event.episodeId}:${event.cutId}:approved`, action_id: "toonstudio_approve_cut" },
        ],
      },
    ],
  };
}

export function buildDiscordEmbedPayload(event: ToonStudioReviewEvent, config: ExternalTrackerConnectorConfig): DiscordRichEmbedPayload {
  const en = event.locale === "en";
  return {
    username: "ToonStudio Review Bridge",
    content: `[${config.targetKey || "review-feed"}] ${labelEvent(event)} — ${event.cutId.toUpperCase()}`,
    embeds: [{
      title: `${event.episodeTitle} · ${event.cutId.toUpperCase()} — ${event.summary}`,
      description: event.description, url: event.deepLinkUrl,
      color: discordColorDecimal(event.eventKind, event.severity), timestamp: event.occurredAtIso,
      fields: [
        { name: en ? "Stage" : "공정", value: event.stageId, inline: true }, { name: en ? "Severity" : "심각도", value: event.severity, inline: true },
        { name: en ? "Reporter" : "요청자", value: event.reporterName, inline: true }, { name: en ? "Source Tool" : "드로잉 소스", value: event.sourceToolLabel ?? "ToonStudio", inline: true },
        { name: "Rights BOM", value: event.rightsBomStatus ?? "clean", inline: true }, { name: en ? "Due" : "마감", value: event.dueAtIso ?? (en ? "Unscheduled" : "지정 없음"), inline: true },
      ],
      footer: { text: `ToonStudio Open Ecosystem · ${event.workId}/${event.episodeId}` },
    }],
  };
}

export function buildNotionDatabaseRowPayload(event: ToonStudioReviewEvent, config: ExternalTrackerConnectorConfig): NotionDatabaseRowPayload {
  const isDone = event.eventKind === "cut-approved" || event.eventKind === "signoff-completed";
  return {
    parent: { database_id: config.targetKey || "notion-db-episode-calendar" },
    properties: {
      Name: { title: [{ text: { content: `[${event.cutId.toUpperCase()}] ${event.summary}` } }] },
      Work: { rich_text: [{ text: { content: event.workTitle } }] },
      Episode: { select: { name: event.episodeTitle } },
      CutId: { rich_text: [{ text: { content: event.cutId } }] },
      Stage: { select: { name: event.stageId } },
      ReviewStatus: { select: { name: isDone ? "Approved" : event.eventKind === "cut-changes-requested" ? "Changes Requested" : "In Review" } },
      RightsBOM: { select: { name: event.rightsBomStatus ?? "clean" } },
      DeepLink: { url: event.deepLinkUrl },
      ...(event.dueAtIso ? { DueDate: { date: { start: event.dueAtIso } } } : {}),
    },
    children: [{ object: "block", type: "to_do", to_do: { rich_text: [{ type: "text", text: { content: event.description } }], checked: isDone } }],
  };
}

export function buildGitHubIssuePayload(event: ToonStudioReviewEvent, config: ExternalTrackerConnectorConfig): GitHubIssuePayload {
  const checked = event.eventKind === "cut-approved" || event.eventKind === "signoff-completed" ? "x" : " ";
  const body = [
    `## ToonStudio Review Sync (${config.targetKey || "studio/webtoon-pipeline"})`, "",
    `- **Work / Episode**: ${event.workTitle} · ${event.episodeTitle}`,
    `- **Cut / Stage**: \`${event.cutId}\` · \`${event.stageId}\``,
    `- **Source Tool**: ${event.sourceToolLabel ?? "ToonStudio"}`,
    `- **Deep Link**: ${event.deepLinkUrl}`, "",
    "### QA & Sign-off Checklist",
    `- [${checked}] ${event.summary}: ${event.description}`,
    `- [${event.rightsBomStatus === "blocked" ? " " : "x"}] Rights BOM license clearance (${event.rightsBomStatus ?? "clean"})`,
  ].join("\n");
  return {
    title: `[${event.episodeId}][${event.cutId}] ${event.summary}`,
    body,
    labels: ["toonstudio-review", `stage:${event.stageId}`, `cut:${event.cutId}`, ...event.reasonTags],
    ...(event.assigneeHandle ? { assignees: [event.assigneeHandle.replace(/^@/, "")] } : {}),
  };
}

export function buildExternalTrackerDryRunEnvelope(event: ToonStudioReviewEvent, config: ExternalTrackerConnectorConfig): DryRunEnvelope {
  const validationErrors: string[] = [];
  if (!config.targetKey.trim()) validationErrors.push("targetKey-required");
  if (!config.authEnvVarName.trim()) validationErrors.push("authEnvVarName-required");
  if (!event.cutId.trim()) validationErrors.push("cutId-required");
  if (!/^https?:\/\//i.test(event.deepLinkUrl)) validationErrors.push("invalid-deep-link-url");

  const dispatch: Record<ExternalTrackerProvider, () => { endpoint: string; payload: Record<string, unknown> }> = {
    jira: () => ({ endpoint: `https://${config.siteDomain || "your-studio.atlassian.net"}/rest/api/3/issue`, payload: buildJiraIssuePayload(event, config) as unknown as Record<string, unknown> }),
    linear: () => ({ endpoint: "https://api.linear.app/graphql", payload: buildLinearGraphqlPayload(event, config) as unknown as Record<string, unknown> }),
    slack: () => ({ endpoint: "https://slack.com/api/chat.postMessage", payload: buildSlackBlockKitPayload(event, config) as unknown as Record<string, unknown> }),
    discord: () => ({ endpoint: "https://discord.com/api/v10/webhooks/<channel-slot>/<env:DISCORD_WEBHOOK_SLOT>", payload: buildDiscordEmbedPayload(event, config) as unknown as Record<string, unknown> }),
    notion: () => ({ endpoint: "https://api.notion.com/v1/pages", payload: buildNotionDatabaseRowPayload(event, config) as unknown as Record<string, unknown> }),
    github: () => ({ endpoint: `https://api.github.com/repos/${config.targetKey || "studio/webtoon-pipeline"}/issues`, payload: buildGitHubIssuePayload(event, config) as unknown as Record<string, unknown> }),
  };
  const { endpoint, payload } = dispatch[config.provider]();
  const leakedSecretFindings = detectRawSecretPatterns(`${endpoint}\n${JSON.stringify(payload)}`);
  if (leakedSecretFindings.length > 0) validationErrors.push(`secret-leak-detected:${leakedSecretFindings.join(",")}`);

  return {
    ok: validationErrors.length === 0, provider: config.provider, dryRun: config.dryRunOnly, method: "POST",
    endpointTemplate: endpoint, authBinding: `env:${config.authEnvVarName}`,
    idempotencyKey: computeIdempotencyKey({ provider: config.provider, deliveryId: event.eventId, eventType: event.eventKind, entityKey: `${event.episodeId}:${event.cutId}:${event.pinId ?? "cut"}`, revisionToken: event.occurredAtIso }),
    payload, validationErrors, leakedSecretFindings,
  };
}

// 4. 양방향 외부 웹훅 수신 정규화
const DEFAULT_STATUS_TABLE: Readonly<Record<string, ToonStudioCutReviewStatus>> = {
  "to do": "pending", backlog: "pending", open: "in-review", "in review": "in-review",
  "in progress": "in-progress", started: "in-progress", "changes requested": "changes-requested",
  reopened: "changes-requested", rejected: "changes-requested", done: "approved",
  completed: "approved", closed: "approved", approved: "approved", canceled: "archived", cancelled: "archived",
};

function mapExternalStatusToToonStudio(status: string, custom?: readonly ExternalStatusMapping[]): ToonStudioCutReviewStatus | null {
  const norm = status.trim().toLowerCase();
  if (!norm) return null;
  return custom?.find((r) => r.externalStatus.trim().toLowerCase() === norm)?.toonStudioStatus ?? DEFAULT_STATUS_TABLE[norm] ?? null;
}

function readHeader(headers: Readonly<Record<string, string | undefined>>, target: string): string | undefined {
  const low = target.toLowerCase();
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === low) return v;
  return undefined;
}

function extractTag(labels: readonly string[], prefix: string): string | null {
  for (const l of labels) if (l.startsWith(`${prefix}-`) || l.startsWith(`${prefix}:`)) return l.slice(prefix.length + 1) || null;
  return null;
}

const asRec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

function rejectedWebhook(
  provider: ExternalTrackerProvider, deliveryId: string, signatureStatus: "verified" | "invalid" | "skipped-dry-run",
  errorReason: string, ledger: IdempotencyLedger,
): NormalizedWebhookTransition {
  return {
    accepted: false, duplicate: false, provider, deliveryId,
    idempotencyKey: computeIdempotencyKey({ provider, deliveryId, eventType: errorReason, entityKey: "rejected" }),
    signatureStatus, externalEntityKey: "", externalStatus: "",
    mappedCutId: null, mappedEpisodeId: null, mappedPinId: null, nextToonStudioStatus: null,
    actorName: "", summary: "", occurredAtIso: new Date(0).toISOString(), errorReason, nextLedger: ledger,
  };
}

interface ExtractedWebhookFields {
  eventType: string; externalEntityKey: string; externalStatus: string;
  mappedCutId: string | null; mappedEpisodeId: string | null; mappedPinId: string | null;
  actorName: string; summary: string; occurredAtIso: string;
}

function extractWebhookFields(provider: ExternalTrackerProvider, body: Record<string, unknown>): ExtractedWebhookFields {
  const fallbackIso = asStr(body.timestamp) || "2026-11-23T10:30:00+09:00";
  if (provider === "jira") {
    const issue = asRec(body.issue);
    const fields = asRec(issue?.fields);
    const labels = Array.isArray(fields?.labels) ? fields.labels.map(asStr).filter(Boolean) : [];
    const key = asStr(issue?.key) || "JIRA-UNKNOWN";
    return {
      eventType: asStr(body.webhookEvent) || "jira:issue_updated", externalEntityKey: key,
      externalStatus: asStr(asRec(fields?.status)?.name),
      mappedCutId: extractTag(labels, "cut"), mappedEpisodeId: extractTag(labels, "episode"), mappedPinId: extractTag(labels, "pin"),
      actorName: asStr(asRec(body.user)?.displayName) || "Jira Member", summary: asStr(fields?.summary) || key, occurredAtIso: fallbackIso,
    };
  }
  if (provider === "linear") {
    const data = asRec(body.data);
    const labels = Array.isArray(data?.labels) ? data.labels.map((i) => asStr(asRec(i)?.name) || asStr(i)).filter(Boolean) : [];
    const title = asStr(data?.title);
    const m = title.match(/\[([^/\]]+)\/(cut-[^\]]+)\]/i);
    const key = asStr(data?.identifier) || asStr(data?.id) || "LIN-UNKNOWN";
    return {
      eventType: `${asStr(body.type) || "Issue"}:${asStr(body.action) || "update"}`, externalEntityKey: key,
      externalStatus: asStr(asRec(data?.state)?.name) || asStr(asRec(data?.state)?.type),
      mappedEpisodeId: extractTag(labels, "episode") ?? (m?.[1] ?? null), mappedCutId: extractTag(labels, "cut") ?? (m?.[2] ?? null),
      mappedPinId: extractTag(labels, "pin"), actorName: asStr(asRec(body.actor)?.name) || "Linear Member",
      summary: title || key, occurredAtIso: asStr(body.createdAt) || fallbackIso,
    };
  }
  if (provider === "github") {
    const issue = asRec(body.issue);
    const labels = Array.isArray(issue?.labels) ? issue.labels.map((i) => asStr(asRec(i)?.name) || asStr(i)).filter(Boolean) : [];
    const action = asStr(body.action) || "edited";
    const key = `#${String(issue?.number ?? "0")}`;
    return {
      eventType: `issues:${action}`, externalEntityKey: key,
      externalStatus: action === "reopened" ? "reopened" : asStr(issue?.state) || action,
      mappedCutId: extractTag(labels, "cut"), mappedEpisodeId: extractTag(labels, "episode"), mappedPinId: extractTag(labels, "pin"),
      actorName: asStr(asRec(body.sender)?.login) || "GitHub Member", summary: asStr(issue?.title) || key, occurredAtIso: asStr(issue?.updated_at) || fallbackIso,
    };
  }
  if (provider === "notion") {
    const data = asRec(body.data);
    const props = asRec(data?.properties);
    const key = asStr(data?.id) || "notion-page";
    return {
      eventType: asStr(body.type) || "page.properties_updated", externalEntityKey: key,
      externalStatus: asStr(asRec(asRec(props?.ReviewStatus)?.select)?.name),
      mappedCutId: asStr(props?.cutId) || asStr(body.cutId) || null, mappedEpisodeId: asStr(props?.episodeId) || asStr(body.episodeId) || null,
      mappedPinId: null, actorName: asStr(body.actorName) || "Notion Editor", summary: asStr(body.summary) || key, occurredAtIso: fallbackIso,
    };
  }
  const firstAction = asRec(Array.isArray(body.actions) ? body.actions[0] : null);
  const actionId = asStr(firstAction?.action_id) || asStr(body.action_id);
  const rawValue = asStr(firstAction?.value) || asStr(body.value);
  const parts = rawValue.split(":");
  const externalStatus = parts[2] || (actionId.includes("approve") ? "approved" : "changes requested");
  return {
    eventType: actionId || "interactive-action", externalEntityKey: asStr(body.messageId) || rawValue || `${provider}-action`,
    externalStatus, mappedEpisodeId: parts[0] || null, mappedCutId: parts[1] || null, mappedPinId: null,
    actorName: asStr(asRec(body.user)?.name) || asStr(body.actorName) || `${provider} reviewer`,
    summary: asStr(body.summary) || `${parts[1] || "cut"} ${externalStatus}`, occurredAtIso: fallbackIso,
  };
}

export function parseExternalTrackerWebhook(input: ParseExternalWebhookInput): NormalizedWebhookTransition {
  const ledger = input.ledger ?? createIdempotencyLedger();
  const sigHeader = readHeader(input.headers, "x-hub-signature-256") ?? readHeader(input.headers, "x-atlassian-webhook-signature")
    ?? readHeader(input.headers, "linear-signature") ?? readHeader(input.headers, "x-slack-signature") ?? readHeader(input.headers, "x-toonstudio-signature");
  const deliveryId = readHeader(input.headers, "x-github-delivery") ?? readHeader(input.headers, "x-atlassian-webhook-identifier")
    ?? readHeader(input.headers, "linear-delivery") ?? readHeader(input.headers, "x-idempotency-key") ?? `sha-${sha256Hex(input.rawBody).slice(0, 16)}`;

  let signatureStatus: "verified" | "invalid" | "skipped-dry-run" = "skipped-dry-run";
  if (input.webhookSecret !== undefined) {
    const verification = verifyWebhookHmacSignature({
      provider: input.provider, rawBody: input.rawBody, signatureHeader: sigHeader, secret: input.webhookSecret,
      timestampHeader: readHeader(input.headers, "x-slack-request-timestamp"),
      nowEpochSec: input.nowEpochSec, maxTimestampSkewSec: input.maxTimestampSkewSec,
    });
    if (!verification.valid) return rejectedWebhook(input.provider, deliveryId, "invalid", verification.reason, ledger);
    signatureStatus = "verified";
  }

  let body: Record<string, unknown>;
  try {
    body = asRec(JSON.parse(input.rawBody)) ?? {};
  } catch {
    return rejectedWebhook(input.provider, deliveryId, signatureStatus, "invalid-json-payload", ledger);
  }

  const f = extractWebhookFields(input.provider, body);
  const nextStatus = mapExternalStatusToToonStudio(f.externalStatus, input.statusMappings);
  const idempotencyKey = computeIdempotencyKey({ provider: input.provider, deliveryId, eventType: f.eventType, entityKey: f.externalEntityKey, revisionToken: f.externalStatus });
  const ledgerRes = recordOrRejectIdempotencyKey(ledger, { idempotencyKey, provider: input.provider, deliveryId, recordedAtIso: f.occurredAtIso });
  const errorReason = ledgerRes.duplicate ? "duplicate-delivery" : nextStatus === null ? "unmapped-external-status" : undefined;
  return {
    accepted: !ledgerRes.duplicate && nextStatus !== null, duplicate: ledgerRes.duplicate,
    provider: input.provider, deliveryId, idempotencyKey, signatureStatus,
    externalEntityKey: f.externalEntityKey, externalStatus: f.externalStatus, mappedCutId: f.mappedCutId,
    mappedEpisodeId: f.mappedEpisodeId, mappedPinId: f.mappedPinId, nextToonStudioStatus: nextStatus,
    actorName: f.actorName, summary: f.summary, occurredAtIso: f.occurredAtIso,
    ...(errorReason ? { errorReason } : {}), nextLedger: ledgerRes.ledger,
  };
}

// 5. 기본 커넥터 프리셋 & 샘플 검수 이벤트 (실제 시크릿·토큰 0건)
const COMMON_STATUS_MAPPINGS: readonly ExternalStatusMapping[] = [
  { externalStatus: "To Do", toonStudioStatus: "pending" },
  { externalStatus: "In Progress", toonStudioStatus: "in-progress" },
  { externalStatus: "In Review", toonStudioStatus: "in-review" },
  { externalStatus: "Changes Requested", toonStudioStatus: "changes-requested" },
  { externalStatus: "Done", toonStudioStatus: "approved" },
];

export const DEFAULT_CONNECTOR_CONFIGS: readonly ExternalTrackerConnectorConfig[] = [
  { provider: "jira", enabled: true, dryRunOnly: true, workspaceLabel: "Moonlight Studio Jira", targetKey: "WEBTOON", siteDomain: "moonlight-studio.atlassian.net", authEnvVarName: "JIRA_API_TOKEN", webhookSecretEnvVarName: "JIRA_WEBHOOK_SECRET", statusMappings: COMMON_STATUS_MAPPINGS },
  { provider: "linear", enabled: true, dryRunOnly: true, workspaceLabel: "Webtoon Production", targetKey: "team-ep-prod", cycleOrBoardId: "cycle-2026-w47", authEnvVarName: "LINEAR_API_KEY", webhookSecretEnvVarName: "LINEAR_WEBHOOK_SECRET", statusMappings: COMMON_STATUS_MAPPINGS },
  { provider: "slack", enabled: true, dryRunOnly: true, workspaceLabel: "Studio Collab Slack", targetKey: "#ep14-signoff-alerts", authEnvVarName: "SLACK_BOT_TOKEN", webhookSecretEnvVarName: "SLACK_SIGNING_SECRET", statusMappings: COMMON_STATUS_MAPPINGS },
  { provider: "discord", enabled: false, dryRunOnly: true, workspaceLabel: "Assistants Discord", targetKey: "cut-qa-feed", authEnvVarName: "DISCORD_WEBHOOK_URL", webhookSecretEnvVarName: "DISCORD_INTERACTION_SECRET", statusMappings: COMMON_STATUS_MAPPINGS },
  { provider: "notion", enabled: true, dryRunOnly: true, workspaceLabel: "Episode Calendar & Bible", targetKey: "notion-db-ep14-calendar", authEnvVarName: "NOTION_INTEGRATION_SECRET", webhookSecretEnvVarName: "NOTION_WEBHOOK_SECRET", statusMappings: COMMON_STATUS_MAPPINGS },
  { provider: "github", enabled: false, dryRunOnly: true, workspaceLabel: "Asset Pipeline Repo", targetKey: "moonlight-studio/ep14-assets", authEnvVarName: "GITHUB_APP_TOKEN", webhookSecretEnvVarName: "GITHUB_WEBHOOK_SECRET", statusMappings: COMMON_STATUS_MAPPINGS },
];

export const SAMPLE_REVIEW_EVENT: ToonStudioReviewEvent = {
  eventId: "evt-ep14-cut07-redline-01", eventKind: "redline-pin-created",
  workId: "work-moonlight-atelier", workTitle: "달빛 아틀리에 계약서",
  episodeId: "ep-14", episodeTitle: "14화 봉인 균열", cutId: "cut-07", stageId: "lineart",
  pinId: "pin-07a", pinCoords: { xRatio: 0.62, yRatio: 0.38 },
  summary: "오른손 검지 파지 각도·소매 주름 선화 보정 요청",
  description: "클립스튜디오에서 그린 선화 레이어는 유지하고, 비출력 레드라인 핀 위치의 손가락 실루엣과 말풍선 여백(12px)만 보정해 주세요.",
  severity: "high", reasonTags: ["art", "lettering"], reporterName: "김서연 PD", assigneeHandle: "hayun-lineart",
  deepLinkUrl: "https://www.toonstudio.cloud/studio/work-moonlight-atelier/ep-14/cut-07?pin=pin-07a",
  dueAtIso: "2026-11-25T18:00:00+09:00", occurredAtIso: "2026-11-23T10:15:00+09:00",
  rightsBomStatus: "clean", sourceToolLabel: "Clip Studio Paint (.psd)",
};
