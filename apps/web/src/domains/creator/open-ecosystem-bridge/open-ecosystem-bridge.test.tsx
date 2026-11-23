// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioOpenEcosystemPanel } from "./StudioOpenEcosystemPanel";
import {
  DEFAULT_BYOT_LAYERS, DEFAULT_EXTERNAL_LINKED_ASSETS, ECOSYSTEM_CONNECTOR_MATRIX,
  NONPRINT_REDLINE_LAYER_NAME, SAMPLE_SAFE_PLUGIN_MANIFEST, SAMPLE_UNSAFE_PLUGIN_MANIFEST,
  createByotRoundtripSession, inheritRightsBomTags, parseAndValidatePluginManifestJson,
  reconcileByotLayerDiff, reconcileExternalAssetChanges, validateOpenPluginManifest,
} from "./byot-roundtrip-and-plugin-sdk";
import {
  DEFAULT_CONNECTOR_CONFIGS, EXTERNAL_TRACKER_PROVIDERS, SAMPLE_REVIEW_EVENT,
  buildDiscordEmbedPayload, buildExternalTrackerDryRunEnvelope, buildGitHubIssuePayload,
  buildJiraIssuePayload, buildLinearGraphqlPayload, buildNotionDatabaseRowPayload,
  buildSlackBlockKitPayload, computeIdempotencyKey, createIdempotencyLedger,
  detectRawSecretPatterns, hmacSha256Hex, parseExternalTrackerWebhook, sha256Hex,
  verifyWebhookHmacSignature,
} from "./external-tracker-connectors";

const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/i;

describe("open-ecosystem-bridge: 외부 협업 트래커 · BYOT 라운드트립 · Wasm 플러그인 SDK · UI", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("FIPS 180-4 SHA-256 & RFC 4231 HMAC-SHA256 표준 테스트 벡터와 웹훅 서명·재생 공격 방어가 정확히 일치한다", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

    // RFC 4231 Test Case 2: Key = "Jefe", Data = "what do ya want for nothing?"
    expect(hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );

    const secret = "unit-test-webhook-signing-slot";
    const body = JSON.stringify({ event: "jira:issue_updated", key: "WEBTOON-142" });
    const sig = hmacSha256Hex(secret, body);

    expect(verifyWebhookHmacSignature({ provider: "jira", rawBody: body, signatureHeader: `sha256=${sig}`, secret }).valid).toBe(true);
    expect(verifyWebhookHmacSignature({ provider: "linear", rawBody: body, signatureHeader: sig, secret }).valid).toBe(true);
    expect(verifyWebhookHmacSignature({ provider: "jira", rawBody: `${body}!`, signatureHeader: `sha256=${sig}`, secret }).valid).toBe(false);

    // Slack v0 서명 및 300초 초과 재생 공격 차단
    const slackTs = "1795400000";
    const slackSig = `v0=${hmacSha256Hex(secret, `v0:${slackTs}:${body}`)}`;
    expect(verifyWebhookHmacSignature({ provider: "slack", rawBody: body, signatureHeader: slackSig, secret, timestampHeader: slackTs, nowEpochSec: 1795400120 }).valid).toBe(true);
    const replay = verifyWebhookHmacSignature({ provider: "slack", rawBody: body, signatureHeader: slackSig, secret, timestampHeader: slackTs, nowEpochSec: 1795400900 });
    expect(replay.valid).toBe(false);
    expect(replay.reason).toBe("timestamp-skew-exceeded");
  });

  it("6종 외부 트래커(Jira ADF · Linear GraphQL · Slack Block Kit · Discord Embed · Notion · GitHub) 드라이런 페이로드와 비밀값 무노출을 검증한다", () => {
    expect(EXTERNAL_TRACKER_PROVIDERS).toEqual(["jira", "linear", "slack", "discord", "notion", "github"]);

    for (const cfg of DEFAULT_CONNECTOR_CONFIGS) {
      const env = buildExternalTrackerDryRunEnvelope(SAMPLE_REVIEW_EVENT, cfg);
      expect(env.ok).toBe(true);
      expect(env.dryRun).toBe(true);
      expect(env.authBinding).toBe(`env:${cfg.authEnvVarName}`);
      expect(env.leakedSecretFindings).toEqual([]);
      expect(env.idempotencyKey).toMatch(/^idem_[0-9a-f]{32}$/);
    }

    const jira = buildJiraIssuePayload(SAMPLE_REVIEW_EVENT, DEFAULT_CONNECTOR_CONFIGS[0]);
    expect(jira.fields.project.key).toBe("WEBTOON");
    expect(jira.fields.issuetype.name).toBe("Bug");
    expect(jira.fields.priority.name).toBe("High");
    expect(jira.fields.description.type).toBe("doc");
    expect(jira.fields.description.version).toBe(1);
    expect(jira.fields.labels).toContain("cut-cut-07");
    expect(JSON.stringify(jira.fields.description)).toContain(SAMPLE_REVIEW_EVENT.deepLinkUrl);

    const linear = buildLinearGraphqlPayload(SAMPLE_REVIEW_EVENT, DEFAULT_CONNECTOR_CONFIGS[1]);
    expect(linear.query).toContain("issueCreate");
    expect(linear.variables.input.teamId).toBe("team-ep-prod");
    expect(linear.variables.input.cycleId).toBe("cycle-2026-w47");
    expect(linear.variables.input.priority).toBe(2);
    expect(linear.variables.input.description).toContain(SAMPLE_REVIEW_EVENT.deepLinkUrl);

    const slack = buildSlackBlockKitPayload({ ...SAMPLE_REVIEW_EVENT, eventKind: "deadline-urgent" }, DEFAULT_CONNECTOR_CONFIGS[2]);
    expect(slack.channel).toBe("#ep14-signoff-alerts");
    expect(slack.blocks.map((b) => b.type)).toEqual(["header", "section", "context", "actions"]);

    const discord = buildDiscordEmbedPayload({ ...SAMPLE_REVIEW_EVENT, eventKind: "signoff-completed" }, DEFAULT_CONNECTOR_CONFIGS[3]);
    expect(discord.embeds[0]?.color).toBe(3066993);
    expect(RAW_COLOR_REGEX.test(JSON.stringify(discord))).toBe(false);

    const notion = buildNotionDatabaseRowPayload(SAMPLE_REVIEW_EVENT, DEFAULT_CONNECTOR_CONFIGS[4]);
    expect(notion.parent.database_id).toBe("notion-db-ep14-calendar");
    expect(notion.children).toHaveLength(1);

    const github = buildGitHubIssuePayload(SAMPLE_REVIEW_EVENT, DEFAULT_CONNECTOR_CONFIGS[5]);
    expect(github.body).toContain("- [ ]");
    expect(github.labels).toContain("cut:cut-07");

    // 런타임 조립 합성 토큰 패턴으로 비밀값 유출 가드 작동 검증 (정적 secretlint 무오탐)
    const syntheticBearer = ["Bearer ", "eyJhbGciOiSynthetic", "PayloadToken987654321"].join("");
    const syntheticPat = ["gh", "p_", "0123456789abcdefghijklmno"].join("");
    expect(detectRawSecretPatterns(syntheticBearer)).toContain("raw-bearer-credential");
    expect(detectRawSecretPatterns(syntheticPat)).toContain("github-pat-prefix");
    expect(detectRawSecretPatterns("Authorization: Bearer <env:JIRA_API_TOKEN>")).toEqual([]);
  });

  it("Jira/Linear/GitHub/Notion/Slack 양방향 웹훅 정규화와 멱등성 중복 차단을 검증한다", () => {
    const secret = "bidirectional-sync-test-key";
    let ledger = createIdempotencyLedger();

    // 1) Jira In Progress -> in-progress, 동일 deliveryId 재전송 -> duplicate 차단
    const jiraBody = JSON.stringify({
      webhookEvent: "jira:issue_updated",
      user: { displayName: "김서연 PD" },
      issue: { key: "WEBTOON-142", fields: { summary: "cut-07 보정", status: { name: "In Progress" }, labels: ["toonstudio", "episode-ep-14", "cut-cut-07", "pin-pin-07a"] } },
    });
    const jiraHeaders = {
      "x-atlassian-webhook-signature": `sha256=${hmacSha256Hex(secret, jiraBody)}`,
      "x-atlassian-webhook-identifier": "jira-dlv-001",
    };
    const first = parseExternalTrackerWebhook({ provider: "jira", rawBody: jiraBody, headers: jiraHeaders, webhookSecret: secret, ledger });
    expect(first.accepted).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(first.signatureStatus).toBe("verified");
    expect(first.mappedCutId).toBe("cut-07");
    expect(first.mappedPinId).toBe("pin-07a");
    expect(first.nextToonStudioStatus).toBe("in-progress");
    ledger = first.nextLedger;

    const dup = parseExternalTrackerWebhook({ provider: "jira", rawBody: jiraBody, headers: jiraHeaders, webhookSecret: secret, ledger });
    expect(dup.accepted).toBe(false);
    expect(dup.duplicate).toBe(true);
    expect(dup.errorReason).toBe("duplicate-delivery");
    expect(dup.idempotencyKey).toBe(first.idempotencyKey);
    expect(dup.nextLedger.entries).toHaveLength(1);

    // 2) Jira Done -> approved (새 deliveryId)
    const jiraDoneBody = JSON.stringify({
      webhookEvent: "jira:issue_updated",
      issue: { key: "WEBTOON-142", fields: { summary: "cut-07 완료", status: { name: "Done" }, labels: ["episode-ep-14", "cut-cut-07"] } },
    });
    const doneRes = parseExternalTrackerWebhook({
      provider: "jira", rawBody: jiraDoneBody,
      headers: { "x-atlassian-webhook-signature": `sha256=${hmacSha256Hex(secret, jiraDoneBody)}`, "x-atlassian-webhook-identifier": "jira-dlv-002" },
      webhookSecret: secret, ledger,
    });
    expect(doneRes.accepted).toBe(true);
    expect(doneRes.nextToonStudioStatus).toBe("approved");
    ledger = doneRes.nextLedger;

    // 3) Linear completed -> approved, GitHub reopened -> changes-requested, Notion Approved -> approved, Slack interactive -> changes-requested
    const linearBody = JSON.stringify({ type: "Issue", action: "update", data: { identifier: "WTN-12", title: "[ep-14/cut-08] 색보정", state: { name: "Done", type: "completed" } } });
    const linRes = parseExternalTrackerWebhook({ provider: "linear", rawBody: linearBody, headers: { "linear-signature": hmacSha256Hex(secret, linearBody), "linear-delivery": "lin-1" }, webhookSecret: secret, ledger });
    expect(linRes.accepted).toBe(true);
    expect(linRes.mappedCutId).toBe("cut-08");
    expect(linRes.nextToonStudioStatus).toBe("approved");

    const ghBody = JSON.stringify({ action: "reopened", sender: { login: "qa-bot" }, issue: { number: 9, title: "QA", state: "open", labels: [{ name: "cut:cut-09" }] } });
    const ghRes = parseExternalTrackerWebhook({ provider: "github", rawBody: ghBody, headers: { "x-hub-signature-256": `sha256=${hmacSha256Hex(secret, ghBody)}`, "x-github-delivery": "gh-1" }, webhookSecret: secret, ledger: linRes.nextLedger });
    expect(ghRes.accepted).toBe(true);
    expect(ghRes.nextToonStudioStatus).toBe("changes-requested");

    const notionBody = JSON.stringify({ type: "page.properties_updated", cutId: "cut-10", data: { id: "pg-10", properties: { ReviewStatus: { select: { name: "Approved" } } } } });
    const notionRes = parseExternalTrackerWebhook({ provider: "notion", rawBody: notionBody, headers: { "x-idempotency-key": "not-1" }, ledger: ghRes.nextLedger });
    expect(notionRes.accepted).toBe(true);
    expect(notionRes.nextToonStudioStatus).toBe("approved");

    const slackBody = JSON.stringify({ messageId: "slk-1", user: { name: "PD" }, actions: [{ action_id: "toonstudio_request_changes", value: "ep-14:cut-11:changes requested" }] });
    const ts = "1795400000";
    const slackRes = parseExternalTrackerWebhook({
      provider: "slack", rawBody: slackBody,
      headers: { "x-slack-request-timestamp": ts, "x-slack-signature": `v0=${hmacSha256Hex(secret, `v0:${ts}:${slackBody}`)}`, "x-idempotency-key": "slk-1" },
      webhookSecret: secret, nowEpochSec: 1795400010, ledger: notionRes.nextLedger,
    });
    expect(slackRes.accepted).toBe(true);
    expect(slackRes.nextToonStudioStatus).toBe("changes-requested");

    // 4) 변조된 서명 즉시 거부 확인
    const badSig = parseExternalTrackerWebhook({ provider: "jira", rawBody: jiraBody, headers: { "x-atlassian-webhook-signature": `sha256=${"0".repeat(64)}` }, webhookSecret: secret, ledger });
    expect(badSig.accepted).toBe(false);
    expect(badSig.signatureStatus).toBe("invalid");
    expect(computeIdempotencyKey({ provider: "jira", deliveryId: "d1", eventType: "e", entityKey: "k" })).toBe(
      computeIdempotencyKey({ provider: "jira", deliveryId: "d1", eventType: "e", entityKey: "k" }),
    );
  });

  it("BYOT Clip Studio/Photoshop/Blender 라운드트립이 layerUid·비출력 레드라인·Rights BOM 상속을 무손실 보장한다", () => {
    const session = createByotRoundtripSession({
      workId: "work-moonlight-atelier", episodeId: "ep-14", cutId: "cut-07",
      sourceTool: "clip-studio-paint", storageBackend: "s3-r2",
      enabledModules: ["nonprint-redline-review", "auto-qa-pinhole-bleed", "smart-publish-slice", "rights-bom-governance"],
      layers: DEFAULT_BYOT_LAYERS, externalAssets: DEFAULT_EXTERNAL_LINKED_ASSETS,
    });

    const initialRedline = session.layers.find((l) => l.name === NONPRINT_REDLINE_LAYER_NAME);
    expect(initialRedline).toBeTruthy();
    expect(initialRedline?.exportable).toBe(false);

    // CSP에서 레이어 이름 변경 + 픽셀 수정 + 신규 레이어 추가 + 외부 툴이 실수로 비출력 레드라인에 exportable=true 오염
    const diff = reconcileByotLayerDiff(session, [
      { ...DEFAULT_BYOT_LAYERS[0] },
      { ...DEFAULT_BYOT_LAYERS[1], name: "02_Char_Lineart_CSP_Revised", pixelHashSha256: sha256Hex("cut07:lineart:v2") },
      { ...DEFAULT_BYOT_LAYERS[2], pixelHashSha256: sha256Hex("cut07:flat:v2") },
      { name: "05_CSP_Highlight", kind: "raster", visible: true, opacity: 0.65, blendMode: "add-glow", pixelHashSha256: sha256Hex("cut07:hl:v1"), exportable: true },
      { layerUid: "ts-layer-nonprint-redline-99", name: NONPRINT_REDLINE_LAYER_NAME, kind: "nonprint-redline", visible: true, opacity: 1, blendMode: "normal", pixelHashSha256: sha256Hex("tampered"), exportable: true },
    ]);

    expect(diff.summary.roundtripGeneration).toBe(2);
    expect(diff.summary.preservedUidCount).toBe(3);
    expect(diff.summary.renamedButPreservedCount).toBe(1);
    expect(diff.summary.modifiedCount).toBe(2);
    expect(diff.summary.addedCount).toBe(1);
    expect(diff.summary.removedCount).toBe(1);
    expect(diff.summary.redlinePreserved).toBe(true);
    expect(diff.summary.redlineNonExportableEnforced).toBe(true);
    expect(diff.summary.losslessRoundtripOk).toBe(true);
    expect(diff.warnings).toContain("nonprint-redline-export-flag-reset-to-false");

    const renamedEntry = diff.diffEntries.find((d) => d.layerUid === "uid-char-lineart-02");
    expect(renamedEntry?.status).toBe("renamed-uid-preserved");
    expect(renamedEntry?.currentName).toBe("02_Char_Lineart_CSP_Revised");

    // 3D 배경(Blender/SketchUp) SHA-256 변경 감지 및 비상업(CC-BY-NC)/만료 대여 Rights BOM 라이선스 세탁 차단 검증
    const restrictedAssets = [
      ...DEFAULT_EXTERNAL_LINKED_ASSETS,
      {
        assetId: "asset-nc-prop", name: "fanart_statue.blend", sourceTool: "blender" as const, storageBackend: "dropbox" as const,
        storageUri: "dropbox://props/fanart_statue.blend", contentSha256: sha256Hex("nc:v1"),
        rightsBom: { licenseCode: "CC-BY-NC" as const, commercialAllowed: false, attributionRequired: true, attributionText: "Indie 3D Artist", originAssetId: "asset-nc-prop", inheritedFromParent: false, evaluatedTags: ["NON_COMMERCIAL_BLOCK" as const, "ATTRIBUTION_REQUIRED" as const] },
        derivedCutIds: ["cut-07"], updatedAtIso: "2026-11-20T10:00:00+09:00",
      },
    ];
    const assetReport = reconcileExternalAssetChanges(restrictedAssets, [
      { assetId: "asset-blender-hallway", name: "academy_corridor_night.glb", sourceTool: "blender", storageBackend: "s3-r2", storageUri: "r2://studio-assets/bg3d/academy_corridor_night.glb", contentDigestSeed: "blender:v2-changed" },
      { assetId: "asset-sketchup-chandelier", name: "vintage_chandelier_ref.skp", sourceTool: "sketchup", storageBackend: "google-drive", storageUri: "gdrive://ep14-refs/vintage_chandelier_ref.skp", contentSha256: DEFAULT_EXTERNAL_LINKED_ASSETS[1].contentSha256 },
      { assetId: "asset-nc-derived-cut07", name: "fanart_statue_baked.png", sourceTool: "blender", storageBackend: "dropbox", storageUri: "dropbox://baked/fanart_statue_baked.png", parentAssetId: "asset-nc-prop", claimedLicenseCode: "CC0", contentDigestSeed: "baked:v1" },
    ]);

    expect(assetReport.modifiedAssetIds).toEqual(["asset-blender-hallway"]);
    expect(assetReport.missingAssetIds).toEqual(["asset-nc-prop"]);
    expect(assetReport.commercialPublishReady).toBe(false);
    const derived = assetReport.entries.find((e) => e.assetId === "asset-nc-derived-cut07");
    expect(derived?.rightsBom.inheritedFromParent).toBe(true);
    expect(derived?.rightsBom.licenseCode).toBe("CC-BY-NC");
    expect(derived?.licenseDowngradeBlocked).toBe(true);
    expect(derived?.commercialPublishAllowed).toBe(false);
    expect(assetReport.requiredAttributions).toContain("Atelier Props Studio (CC-BY 4.0)");

    // 만료 대여(COMMERCIAL-RENTAL) 상속 차단 확인
    const expiredBom = inheritRightsBomTags(
      { licenseCode: "COMMERCIAL-RENTAL", commercialAllowed: true, attributionRequired: false, originAssetId: "rent-1", inheritedFromParent: false, rentalExpiresAtIso: "2026-11-01T00:00:00Z", evaluatedTags: ["COMMERCIAL_OK", "RENTAL_ACTIVE"] },
      "2026-11-23T10:30:00+09:00",
    );
    expect(expiredBom.evaluatedTags).toContain("RENTAL_EXPIRED_BLOCK");
    expect(ECOSYSTEM_CONNECTOR_MATRIX.length).toBeGreaterThanOrEqual(6);
  });

  it("오픈 플러그인 Wasm 샌드박스 매니페스트 검증기가 최소 권한을 통과시키고 위험 권한·초과 메모리를 차단한다", () => {
    const safeRes = validateOpenPluginManifest(SAMPLE_SAFE_PLUGIN_MANIFEST);
    expect(safeRes.valid).toBe(true);
    expect(safeRes.securityGrade).toBe("verified-sandbox");
    expect(safeRes.grantedScopes).toEqual(["canvas:read", "qa:annotate"]);
    expect(safeRes.deniedScopes).toEqual([]);

    const unsafeRes = validateOpenPluginManifest(SAMPLE_UNSAFE_PLUGIN_MANIFEST);
    expect(unsafeRes.valid).toBe(false);
    expect(unsafeRes.securityGrade).toBe("rejected");
    expect(unsafeRes.deniedScopes).toEqual(["secrets:read", "network:unrestricted", "*"]);
    expect(unsafeRes.errors).toContain("invalid-semver");
    expect(unsafeRes.errors).toContain("unsupported-runtime:host-eval");
    expect(unsafeRes.errors).toContain("unsafe-entry-module-path");
    expect(unsafeRes.errors).toContain("memory-limit-out-of-range:1..256MB");
    expect(unsafeRes.errors).toContain("forbidden-network-policy:unrestricted");
    expect(unsafeRes.errors).toContain("forbidden-secret-access:read-env");

    const brokenJson = parseAndValidatePluginManifestJson("{broken");
    expect(brokenJson.result.valid).toBe(false);
    expect(brokenJson.result.errors).toContain("invalid-manifest-json");
  });

  it("StudioOpenEcosystemPanel 3탭 인터랙션·KO/EN 전환(EN 한글 0자)·Calm Atelier 토큰 위생을 전수 검증한다", () => {
    const onConnectorToggle = vi.fn();
    const onByotReconcile = vi.fn();
    const onPluginValidate = vi.fn();

    // 1) KO 모드 (props 없이도 마운트 가능 확인 후 콜백 props 테스트)
    const zeroPropView = render(<StudioOpenEcosystemPanel />);
    expect(screen.getByText("개방형 하이브리드 웹툰 생태계")).toBeTruthy();
    zeroPropView.unmount();

    const { container, unmount } = render(
      <StudioOpenEcosystemPanel
        onConnectorToggle={onConnectorToggle}
        onByotReconcile={onByotReconcile}
        onPluginValidate={onPluginValidate}
      />,
    );
    expect(container.innerHTML).toContain("[word-break:keep-all]");
    expect(container.innerHTML).toContain("tabular-nums");
    expect(container.innerHTML).not.toContain("transition-all");
    expect(RAW_COLOR_REGEX.test(container.innerHTML)).toBe(false);

    // 탭 1: 커넥터 토글 + 프로바이더 전환 + 웹훅 시뮬레이션 & 중복 재전송 차단
    fireEvent.click(screen.getByRole("button", { name: "Linear" }));
    expect(screen.getByTestId("tracker-dryrun-json").textContent).toContain("issueCreate");
    const firstToggle = screen.getAllByRole("button", { name: /연결 ON|연결 OFF/ })[0];
    fireEvent.click(firstToggle);
    expect(onConnectorToggle).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "웹훅 수신 시뮬레이션" }));
    expect(screen.getByTestId("webhook-sync-result").textContent).toContain("수신 반영 완료");
    fireEvent.click(screen.getByRole("button", { name: "중복 재전송 방어 테스트" }));
    expect(screen.getByTestId("webhook-sync-result").textContent).toContain("중복 차단됨");

    // 탭 2: BYOT 타사 툴 브리지
    fireEvent.click(screen.getByRole("tab", { name: "BYOT 타사 툴 브리지" }));
    fireEvent.click(screen.getByRole("button", { name: /Blender 3D/ }));
    fireEvent.click(screen.getByRole("button", { name: "외부 편집 후 라운드트립 Diff 검증" }));
    expect(onByotReconcile).toHaveBeenCalledTimes(1);
    expect(within(screen.getByTestId("byot-layer-list")).getByText(NONPRINT_REDLINE_LAYER_NAME)).toBeTruthy();
    expect(screen.getByTestId("byot-asset-list").textContent).toContain("원저작 라이선스 유지");

    // 탭 3: 오픈 플러그인·웹훅 SDK
    fireEvent.click(screen.getByRole("tab", { name: "오픈 플러그인·웹훅 SDK" }));
    expect(screen.getByTestId("plugin-security-grade").textContent).toBe("verified-sandbox");
    fireEvent.click(screen.getByRole("button", { name: "위험 권한 차단 샘플" }));
    expect(onPluginValidate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("plugin-security-grade").textContent).toBe("rejected");
    expect(screen.getByText(/ACON3D · Sketchfab · Booth/)).toBeTruthy();
    expect(RAW_COLOR_REGEX.test(container.innerHTML)).toBe(false);
    unmount();

    // 2) EN 모드 전수 3탭 (한글 0자 + 원시 색상 0건 확인)
    useI18n.setState({ lang: "en" });
    const enView = render(<StudioOpenEcosystemPanel />);
    expect(screen.getByText("Open Hybrid Webtoon Ecosystem")).toBeTruthy();
    expect(enView.container.textContent).not.toMatch(/[가-힣]/);

    fireEvent.click(screen.getByRole("tab", { name: "BYOT Tool Bridge" }));
    fireEvent.click(screen.getByRole("button", { name: "Run Roundtrip Layer & BOM Diff" }));
    expect(enView.container.textContent).not.toMatch(/[가-힣]/);

    fireEvent.click(screen.getByRole("tab", { name: "Open Plugin & Webhook SDK" }));
    fireEvent.click(screen.getByRole("button", { name: "Unsafe Policy Sample" }));
    expect(enView.container.textContent).not.toMatch(/[가-힣]/);
    expect(RAW_COLOR_REGEX.test(enView.container.innerHTML)).toBe(false);
  });

  it("소유 폴더 4파일은 배럴 금지 · 줄수 상한 · 원시 색상/localStorage/transition-all 0건 계약을 지킨다", () => {
    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/open-ecosystem-bridge");
    expect(existsSync(resolve(dir, "index.ts"))).toBe(false);
    expect(existsSync(resolve(dir, "index.tsx"))).toBe(false);

    const caps: readonly { readonly name: string; readonly maxLines: number; readonly checkColors: boolean }[] = [
      { name: "external-tracker-connectors.ts", maxLines: 700, checkColors: true },
      { name: "byot-roundtrip-and-plugin-sdk.ts", maxLines: 700, checkColors: true },
      { name: "StudioOpenEcosystemPanel.tsx", maxLines: 470, checkColors: true },
      { name: "open-ecosystem-bridge.test.tsx", maxLines: 750, checkColors: false },
    ];

    for (const entry of caps) {
      const src = readFileSync(resolve(dir, entry.name), "utf8");
      expect(src.split("\n").length).toBeLessThanOrEqual(entry.maxLines);
      if (entry.checkColors) {
        expect(RAW_COLOR_REGEX.test(src)).toBe(false);
        expect(src).not.toContain("localStorage");
        expect(src).not.toContain("sessionStorage");
      }
    }

    const panelSrc = readFileSync(resolve(dir, "StudioOpenEcosystemPanel.tsx"), "utf8");
    expect(panelSrc).not.toContain("transition-all");
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("tabular-nums");
  });
});
