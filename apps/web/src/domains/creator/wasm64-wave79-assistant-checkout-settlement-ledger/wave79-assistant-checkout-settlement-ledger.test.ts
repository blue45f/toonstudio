import { describe, expect, it } from "vitest";

import {
  AssistantSettlementAuditLedger,
  FREELANCER_WITHHOLDING_LABEL,
  SettlementPolicyError,
  calculateEpisodeSettlementStatement,
  computeLayerSliceDigest,
  constantTimeEqualHex,
  createScopedAssistantCheckoutPackage,
  exportSettlementStatementSummary,
  hmacSha256Hex,
  mergeVerifiedAssistantWorkSlice,
  openScopedAssistantCheckoutPackage,
  sha256Bytes,
  sha256CtrXor,
  sha256Hex,
  submitAssistantWorkSlice,
  utf8Decode,
  utf8Encode,
  verifyExportedSettlementReceipt,
  verifySettlementLedgerIntegrity,
  type AssistantLayerRole,
  type MasterEpisodeManuscript,
  type RightsBomAssetAttachment,
  type ScopedAssistantCheckoutPackage,
  type SettlementLedgerSnapshot,
} from "./index";

const AUTHOR_SECRET = "studio-author-master-secret-wave79-alpha";
const KEY_A = "assistant-seoyeon-session-key-01";
const KEY_B = "assistant-minjun-session-key-02";
const LEDGER_SECRET = "studio-settlement-audit-hmac-secret-79";

function createSampleManuscript(): MasterEpisodeManuscript {
  return {
    episodeId: "ep-042",
    projectId: "proj-seoul-noir",
    title: "42화: 빗속의 옥상 대치",
    authorId: "author-han",
    revision: 7,
    cuts: [
      {
        cutId: "cut-01",
        sequenceIndex: 1,
        title: "옥상 전경",
        layers: [
          { layerId: "layer-01-script", role: "rough-script", label: "비공개 대사", content: "SECRET-SCRIPT-DO-NOT-LEAK", version: 1, updatedBy: "author-han", updatedAtIso: "2026-11-28T01:00:00Z" },
          { layerId: "layer-01-bg", role: "background", label: "서울 야경 배경", content: "bg-mesh:seoul-rooftop-v1", version: 2, updatedBy: "author-han", updatedAtIso: "2026-11-28T01:10:00Z" },
          { layerId: "layer-01-flat", role: "flat-color", label: "인물 밑색", content: "flat-palette:raincoat-v1", version: 1, updatedBy: "author-han", updatedAtIso: "2026-11-28T01:15:00Z" },
        ],
      },
      {
        cutId: "cut-02",
        sequenceIndex: 2,
        title: "주인공 클로즈업",
        layers: [
          { layerId: "layer-02-char-sheet", role: "master-character-sheet", label: "마스터 시트", content: "MASTER-CHAR-RIG-9981", version: 4, updatedBy: "author-han", updatedAtIso: "2026-11-28T01:05:00Z" },
          { layerId: "layer-02-lineart", role: "lineart", label: "선화", content: "strokes:hero-closeup-v1", version: 1, updatedBy: "author-han", updatedAtIso: "2026-11-28T01:20:00Z" },
        ],
      },
      {
        cutId: "cut-99-finale",
        sequenceIndex: 99,
        title: "미공개 시즌 피날레 컷",
        unreleased: true,
        layers: [
          { layerId: "layer-99-finale", role: "unreleased-finale", label: "결말 스포일러", content: "UNRELEASED-FINALE-XYZ-777", version: 1, updatedBy: "author-han", updatedAtIso: "2026-11-28T00:30:00Z" },
        ],
      },
    ],
  };
}

function makeCheckout(
  manuscript: MasterEpisodeManuscript,
  opts: { id: string; assistantId?: string; key?: string; cuts?: readonly string[]; roles?: readonly AssistantLayerRole[]; expiresAtIso?: string },
): ScopedAssistantCheckoutPackage {
  return createScopedAssistantCheckoutPackage({
    manuscript,
    packageId: opts.id,
    assistantId: opts.assistantId ?? "asst-seoyeon",
    allowedCutIds: opts.cuts ?? ["cut-01"],
    allowedLayerRoles: opts.roles ?? ["background"],
    issuedAtIso: "2026-11-28T02:00:00Z",
    expiresAtIso: opts.expiresAtIso ?? "2026-11-28T10:00:00Z",
    authorMasterSecret: AUTHOR_SECRET,
    assistantKey: opts.key ?? KEY_A,
  });
}

function flipFirstHexChar(hex: string): string {
  return `${hex.charAt(0).toLowerCase() === "0" ? "1" : "0"}${hex.slice(1)}`;
}

function makeClearedAsset(id: string, name: string): RightsBomAssetAttachment {
  return { assetId: id, assetName: name, assetCategory: "3d-background", licenseTier: "commercial-cleared", sourceSha256: sha256Hex(`asset:${id}`), licenseReference: "ACON-PRO-2026" };
}

function buildSampleLedger(): AssistantSettlementAuditLedger {
  const ledger = new AssistantSettlementAuditLedger({ ledgerId: "ledger-ep042", episodeId: "ep-042", projectId: "proj-seoul-noir", studioSecret: LEDGER_SECRET });
  ledger.appendContribution({
    checkInId: "chk-01", episodeId: "ep-042", assistantId: "asst-seoyeon", assistantDisplayName: "김서연", role: "background",
    cutIds: ["cut-01", "cut-02", "cut-03"], strokeCount: 1420, editedPixelAreaPx: 2_840_000, activeWorkMinutes: 190,
    complexityMultiplier: 1.2, urgentBonusKrw: 30_000, rightsBomAssets: [makeClearedAsset("asset-rooftop-3d", "서울 옥상 3D 모델")], recordedAtIso: "2026-11-28T04:00:00Z",
  });
  ledger.appendContribution({
    checkInId: "chk-02", episodeId: "ep-042", assistantId: "asst-minjun", assistantDisplayName: "박민준", role: "colorist",
    cutIds: ["cut-01", "cut-02", "cut-03", "cut-04"], strokeCount: 980, editedPixelAreaPx: 3_120_000, activeWorkMinutes: 145,
    rightsBomAssets: [makeClearedAsset("asset-rain-brush", "빗방울 상업 브러시")], recordedAtIso: "2026-11-28T05:00:00Z",
  });
  ledger.appendContribution({
    checkInId: "chk-03", episodeId: "ep-042", assistantId: "asst-jiwoo", assistantDisplayName: "이지우", role: "letterer",
    cutIds: ["cut-01", "cut-02"], strokeCount: 260, editedPixelAreaPx: 420_000, activeWorkMinutes: 55,
    rightsBomAssets: [{ assetId: "asset-font-pro", assetName: "스튜디오 상업 폰트", assetCategory: "font", licenseTier: "commercial-cleared", sourceSha256: sha256Hex("font-v1") }],
    recordedAtIso: "2026-11-28T05:30:00Z",
  });
  return ledger;
}

describe("Wave 79: 순수 동기 암호 원시 연산", () => {
  it("FIPS 180-4 SHA-256과 RFC 2104 HMAC-SHA256 표준 테스트 벡터를 정확히 계산한다", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog")).toBe("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
    expect(constantTimeEqualHex("abcd", "abcd")).toBe(true);
    expect(constantTimeEqualHex("abcd", "abce")).toBe(false);
  });

  it("SHA-256-CTR 스트림 암호화가 UTF-8 한글·이모지 페이로드를 무손실 왕복 변환한다", () => {
    const key = sha256Bytes("wave79-ctr-test-key");
    const plain = "어시스턴트 배경 레이어: 서울 야경 42화 🌧️";
    const cipher = sha256CtrXor(key, "nonce-001", utf8Encode(plain));
    expect(utf8Decode(sha256CtrXor(key, "nonce-001", cipher))).toBe(plain);
  });
});

describe("Wave 79: 제로-트러스트 컷·레이어 스코프 체크아웃", () => {
  it("미배정 컷과 보호 레이어 평문이 패키지에 0바이트만 남도록 제거·마스킹한다", () => {
    const pkg = makeCheckout(createSampleManuscript(), { id: "pkg-bg-001" });
    expect(pkg.header.unassignedLayerBytesExposed).toBe(0);
    expect(pkg.header.omittedCutCount).toBe(2);
    expect(pkg.header.omittedLayerCount).toBe(5);
    expect(pkg.header.redactedStubs.every((stub) => stub.byteLengthExposed === 0)).toBe(true);

    const serialized = JSON.stringify(pkg);
    expect(serialized).not.toContain("SECRET-SCRIPT-DO-NOT-LEAK");
    expect(serialized).not.toContain("MASTER-CHAR-RIG-9981");
    expect(serialized).not.toContain("UNRELEASED-FINALE-XYZ-777");
    expect(serialized).not.toContain("flat-palette:raincoat-v1");
    expect(serialized).not.toContain("bg-mesh:seoul-rooftop-v1");
  });

  it("만료 시각이 발행 시각 이하이거나 빈 배정 컷 목록으로 체크아웃 생성 시 예외를 발생시킨다", () => {
    const manuscript = createSampleManuscript();
    expect(() => makeCheckout(manuscript, { id: "pkg-bad-exp", expiresAtIso: "2026-11-28T02:00:00Z" })).toThrow();
    expect(() => makeCheckout(manuscript, { id: "pkg-empty-cut", cuts: [] })).toThrow();
  });

  it("포렌식 워터마크 시드가 어시스턴트 ID별로 고유하게 바인딩된다", () => {
    const manuscript = createSampleManuscript();
    const pkgA = makeCheckout(manuscript, { id: "pkg-wm-a", assistantId: "asst-seoyeon", key: KEY_A });
    const pkgB = makeCheckout(manuscript, { id: "pkg-wm-b", assistantId: "asst-minjun", key: KEY_B, roles: ["flat-color"] });
    expect(pkgA.header.forensicWatermark.assistantId).toBe("asst-seoyeon");
    expect(pkgB.header.forensicWatermark.assistantId).toBe("asst-minjun");
    expect(pkgA.header.forensicWatermark.seedHex).not.toBe(pkgB.header.forensicWatermark.seedHex);
    expect(pkgA.header.forensicWatermark.invisiblePixelSpreadVector).toHaveLength(16);
  });

  it("권한이 있는 어시스턴트는 배정된 슬라이스만 정상 복호화한다", () => {
    const pkg = makeCheckout(createSampleManuscript(), { id: "pkg-bg-002" });
    const opened = openScopedAssistantCheckoutPackage(pkg, { assistantId: "asst-seoyeon", assistantKey: KEY_A, nowIso: "2026-11-28T03:00:00Z", authorMasterSecret: AUTHOR_SECRET });
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      expect(opened.workspace.cuts).toHaveLength(1);
      expect(opened.workspace.cuts[0]?.layers).toHaveLength(1);
      expect(opened.workspace.cuts[0]?.layers[0]?.content).toBe("bg-mesh:seoul-rooftop-v1");
    }
  });

  it("잘못된 어시스턴트 키로 열람 시 HMAC 검증 단계에서 SIGNATURE_INVALID로 거부한다", () => {
    const pkg = makeCheckout(createSampleManuscript(), { id: "pkg-wrong-key" });
    const res = openScopedAssistantCheckoutPackage(pkg, { assistantId: "asst-seoyeon", assistantKey: KEY_B, nowIso: "2026-11-28T03:00:00Z" });
    expect(res.ok).toBe(false);
    expect(res.denialCode).toBe("SIGNATURE_INVALID");
  });

  it("배정 대상과 다른 어시스턴트 ID로 열람 시 SIGNATURE_INVALID로 거부한다", () => {
    const pkg = makeCheckout(createSampleManuscript(), { id: "pkg-wrong-id" });
    const res = openScopedAssistantCheckoutPackage(pkg, { assistantId: "asst-minjun", assistantKey: KEY_A, nowIso: "2026-11-28T03:00:00Z" });
    expect(res.ok).toBe(false);
    expect(res.denialCode).toBe("SIGNATURE_INVALID");
  });

  it("만료된 체크아웃 패키지 열람을 LEASE_EXPIRED로 거부한다", () => {
    const pkg = makeCheckout(createSampleManuscript(), { id: "pkg-exp", expiresAtIso: "2026-11-28T04:00:00Z" });
    const res = openScopedAssistantCheckoutPackage(pkg, { assistantId: "asst-seoyeon", assistantKey: KEY_A, nowIso: "2026-11-28T04:00:01Z" });
    expect(res.ok).toBe(false);
    expect(res.denialCode).toBe("LEASE_EXPIRED");
  });

  it("체크아웃 암호문이 1바이트라도 변조되면 PAYLOAD_TAMPERED로 거부한다", () => {
    const pkg = makeCheckout(createSampleManuscript(), { id: "pkg-tamper" });
    const res = openScopedAssistantCheckoutPackage({ ...pkg, ciphertextHex: flipFirstHexChar(pkg.ciphertextHex) }, { assistantId: "asst-seoyeon", assistantKey: KEY_A, nowIso: "2026-11-28T03:00:00Z" });
    expect(res.ok).toBe(false);
    expect(res.denialCode).toBe("PAYLOAD_TAMPERED");
  });
});

describe("Wave 79: 체크인 쓰기 ACL·원자적 병합·동시성 충돌 제어", () => {
  it("배정된 컷·레이어 편집과 허용 역할 신규 레이어를 원자적으로 병합하고 보호 레이어를 보존한다", () => {
    const manuscript = createSampleManuscript();
    const pkg = makeCheckout(manuscript, { id: "pkg-merge-ok" });
    const sub = submitAssistantWorkSlice({
      checkoutPackage: pkg, submissionId: "sub-01", assistantId: "asst-seoyeon", assistantKey: KEY_A, submittedAtIso: "2026-11-28T03:30:00Z",
      editedSlices: [
        { cutId: "cut-01", layerId: "layer-01-bg", role: "background", content: "bg-mesh:rain-lit-v2", baseDigestHex: pkg.header.baseSliceDigests["cut-01::layer-01-bg"] ?? null },
        { cutId: "cut-01", layerId: "layer-01-bg-rain", role: "background", label: "빗줄기", content: "rain-v1", baseDigestHex: null },
      ],
    });
    const merged = mergeVerifiedAssistantWorkSlice({ manuscript, checkoutPackage: pkg, submission: sub, authorMasterSecret: AUTHOR_SECRET, assistantKey: KEY_A, nowIso: "2026-11-28T03:35:00Z" });
    expect(merged.accepted).toBe(true);
    expect(merged.appliedRevision).toBe(8);
    expect(merged.mergedSliceKeys).toEqual(["cut-01::layer-01-bg", "cut-01::layer-01-bg-rain"]);
    const cut1 = merged.updatedManuscript.cuts.find((c) => c.cutId === "cut-01");
    expect(cut1?.layers.find((l) => l.layerId === "layer-01-bg")?.version).toBe(3);
    expect(cut1?.layers.find((l) => l.layerId === "layer-01-script")?.content).toBe("SECRET-SCRIPT-DO-NOT-LEAK");
  });

  it("미배정 컷 수정이 포함되면 정상 슬라이스까지 포함해 전체를 SCOPE_CUT_DENIED로 원자적 거부한다", () => {
    const manuscript = createSampleManuscript();
    const pkg = makeCheckout(manuscript, { id: "pkg-cut-deny" });
    const sub = submitAssistantWorkSlice({
      checkoutPackage: pkg, submissionId: "sub-cut-deny", assistantId: "asst-seoyeon", assistantKey: KEY_A, submittedAtIso: "2026-11-28T03:00:00Z",
      editedSlices: [
        { cutId: "cut-01", layerId: "layer-01-bg", role: "background", content: "must-not-apply", baseDigestHex: pkg.header.baseSliceDigests["cut-01::layer-01-bg"] ?? null },
        { cutId: "cut-02", layerId: "layer-02-bg", role: "background", content: "illegal-cut-write", baseDigestHex: null },
      ],
    });
    const res = mergeVerifiedAssistantWorkSlice({ manuscript, checkoutPackage: pkg, submission: sub, authorMasterSecret: AUTHOR_SECRET, assistantKey: KEY_A, nowIso: "2026-11-28T03:05:00Z" });
    expect(res.accepted).toBe(false);
    expect(res.denialCode).toBe("SCOPE_CUT_DENIED");
    expect(res.offendingCutId).toBe("cut-02");
    expect(res.updatedManuscript).toBe(manuscript);
  });

  it("허용 외 레이어 역할 수정 및 보호 레이어 ID 위조 덮어쓰기를 SCOPE_LAYER_DENIED로 차단한다", () => {
    const manuscript = createSampleManuscript();
    const pkg = makeCheckout(manuscript, { id: "pkg-layer-deny" });
    const sub1 = submitAssistantWorkSlice({
      checkoutPackage: pkg, submissionId: "sub-role", assistantId: "asst-seoyeon", assistantKey: KEY_A, submittedAtIso: "2026-11-28T03:00:00Z",
      editedSlices: [{ cutId: "cut-01", layerId: "layer-01-flat", role: "flat-color", content: "hijack", baseDigestHex: null }],
    });
    expect(mergeVerifiedAssistantWorkSlice({ manuscript, checkoutPackage: pkg, submission: sub1, authorMasterSecret: AUTHOR_SECRET, assistantKey: KEY_A, nowIso: "2026-11-28T03:05:00Z" }).denialCode).toBe("SCOPE_LAYER_DENIED");

    const sub2 = submitAssistantWorkSlice({
      checkoutPackage: pkg, submissionId: "sub-spoof", assistantId: "asst-seoyeon", assistantKey: KEY_A, submittedAtIso: "2026-11-28T03:00:00Z",
      editedSlices: [{ cutId: "cut-01", layerId: "layer-01-script", role: "background", content: "overwrite-script", baseDigestHex: null }],
    });
    expect(mergeVerifiedAssistantWorkSlice({ manuscript, checkoutPackage: pkg, submission: sub2, authorMasterSecret: AUTHOR_SECRET, assistantKey: KEY_A, nowIso: "2026-11-28T03:05:00Z" }).denialCode).toBe("SCOPE_LAYER_DENIED");
  });

  it("만료된 체크아웃 리스의 체크인을 LEASE_EXPIRED로 거부한다", () => {
    const manuscript = createSampleManuscript();
    const pkg = makeCheckout(manuscript, { id: "pkg-exp-ci", expiresAtIso: "2026-11-28T04:00:00Z" });
    const sub = submitAssistantWorkSlice({
      checkoutPackage: pkg, submissionId: "sub-late", assistantId: "asst-seoyeon", assistantKey: KEY_A, submittedAtIso: "2026-11-28T04:05:00Z",
      editedSlices: [{ cutId: "cut-01", layerId: "layer-01-bg", role: "background", content: "late", baseDigestHex: pkg.header.baseSliceDigests["cut-01::layer-01-bg"] ?? null }],
    });
    const res = mergeVerifiedAssistantWorkSlice({ manuscript, checkoutPackage: pkg, submission: sub, authorMasterSecret: AUTHOR_SECRET, assistantKey: KEY_A, nowIso: "2026-11-28T04:06:00Z" });
    expect(res.accepted).toBe(false);
    expect(res.denialCode).toBe("LEASE_EXPIRED");
  });

  it("체크인 제출 암호문 1바이트 변조를 PAYLOAD_TAMPERED로 거부한다", () => {
    const manuscript = createSampleManuscript();
    const pkg = makeCheckout(manuscript, { id: "pkg-ci-tamper" });
    const sub = submitAssistantWorkSlice({
      checkoutPackage: pkg, submissionId: "sub-t1", assistantId: "asst-seoyeon", assistantKey: KEY_A, submittedAtIso: "2026-11-28T03:00:00Z",
      editedSlices: [{ cutId: "cut-01", layerId: "layer-01-bg", role: "background", content: "ok", baseDigestHex: pkg.header.baseSliceDigests["cut-01::layer-01-bg"] ?? null }],
    });
    const res = mergeVerifiedAssistantWorkSlice({
      manuscript, checkoutPackage: pkg, submission: { ...sub, ciphertextHex: flipFirstHexChar(sub.ciphertextHex) },
      authorMasterSecret: AUTHOR_SECRET, assistantKey: KEY_A, nowIso: "2026-11-28T03:05:00Z",
    });
    expect(res.accepted).toBe(false);
    expect(res.denialCode).toBe("PAYLOAD_TAMPERED");
  });

  it("잘못된 어시스턴트 키 서명이나 리스 범위 임의 확장을 SIGNATURE_INVALID로 거부한다", () => {
    const manuscript = createSampleManuscript();
    const pkg = makeCheckout(manuscript, { id: "pkg-ci-sig" });
    const sub = submitAssistantWorkSlice({
      checkoutPackage: pkg, submissionId: "sub-s1", assistantId: "asst-seoyeon", assistantKey: KEY_A, submittedAtIso: "2026-11-28T03:00:00Z",
      editedSlices: [{ cutId: "cut-01", layerId: "layer-01-bg", role: "background", content: "ok", baseDigestHex: pkg.header.baseSliceDigests["cut-01::layer-01-bg"] ?? null }],
    });
    expect(mergeVerifiedAssistantWorkSlice({ manuscript, checkoutPackage: pkg, submission: sub, authorMasterSecret: AUTHOR_SECRET, assistantKey: KEY_B, nowIso: "2026-11-28T03:05:00Z" }).denialCode).toBe("SIGNATURE_INVALID");

    const forgedPkg = { ...pkg, header: { ...pkg.header, allowedCutIds: ["cut-01", "cut-99-finale"] } };
    expect(mergeVerifiedAssistantWorkSlice({ manuscript, checkoutPackage: forgedPkg, submission: sub, authorMasterSecret: AUTHOR_SECRET, assistantKey: KEY_A, nowIso: "2026-11-28T03:05:00Z" }).denialCode).toBe("SIGNATURE_INVALID");
  });

  it("서로 다른 레이어 역할의 동시 체크아웃은 순차 병합에 성공하고 동일 슬라이스 경합은 BASE_DIGEST_CONFLICT로 차단한다", () => {
    const manuscript = createSampleManuscript();
    const pkgBgA = makeCheckout(manuscript, { id: "pkg-a", assistantId: "asst-seoyeon", key: KEY_A, roles: ["background"] });
    const pkgFlatB = makeCheckout(manuscript, { id: "pkg-b", assistantId: "asst-minjun", key: KEY_B, roles: ["flat-color"] });
    const pkgBgConflict = makeCheckout(manuscript, { id: "pkg-c", assistantId: "asst-minjun", key: KEY_B, roles: ["background"] });

    const mergedA = mergeVerifiedAssistantWorkSlice({
      manuscript, checkoutPackage: pkgBgA, authorMasterSecret: AUTHOR_SECRET, assistantKey: KEY_A, nowIso: "2026-11-28T03:01:00Z",
      submission: submitAssistantWorkSlice({
        checkoutPackage: pkgBgA, submissionId: "sub-a", assistantId: "asst-seoyeon", assistantKey: KEY_A, submittedAtIso: "2026-11-28T03:00:00Z",
        editedSlices: [{ cutId: "cut-01", layerId: "layer-01-bg", role: "background", content: "bg-seoyeon-v2", baseDigestHex: pkgBgA.header.baseSliceDigests["cut-01::layer-01-bg"] ?? null }],
      }),
    });
    expect(mergedA.accepted).toBe(true);

    const mergedFlatB = mergeVerifiedAssistantWorkSlice({
      manuscript: mergedA.updatedManuscript, checkoutPackage: pkgFlatB, authorMasterSecret: AUTHOR_SECRET, assistantKey: KEY_B, nowIso: "2026-11-28T03:03:00Z",
      submission: submitAssistantWorkSlice({
        checkoutPackage: pkgFlatB, submissionId: "sub-b", assistantId: "asst-minjun", assistantKey: KEY_B, submittedAtIso: "2026-11-28T03:02:00Z",
        editedSlices: [{ cutId: "cut-01", layerId: "layer-01-flat", role: "flat-color", content: "flat-minjun-v2", baseDigestHex: pkgFlatB.header.baseSliceDigests["cut-01::layer-01-flat"] ?? null }],
      }),
    });
    expect(mergedFlatB.accepted).toBe(true);
    expect(mergedFlatB.appliedRevision).toBe(9);

    const conflict = mergeVerifiedAssistantWorkSlice({
      manuscript: mergedFlatB.updatedManuscript, checkoutPackage: pkgBgConflict, authorMasterSecret: AUTHOR_SECRET, assistantKey: KEY_B, nowIso: "2026-11-28T03:05:00Z",
      submission: submitAssistantWorkSlice({
        checkoutPackage: pkgBgConflict, submissionId: "sub-c", assistantId: "asst-minjun", assistantKey: KEY_B, submittedAtIso: "2026-11-28T03:04:00Z",
        editedSlices: [{ cutId: "cut-01", layerId: "layer-01-bg", role: "background", content: "overwrite-attempt", baseDigestHex: pkgBgConflict.header.baseSliceDigests["cut-01::layer-01-bg"] ?? null }],
      }),
    });
    expect(conflict.accepted).toBe(false);
    expect(conflict.denialCode).toBe("BASE_DIGEST_CONFLICT");
    const liveBg = conflict.updatedManuscript.cuts[0]?.layers.find((l) => l.layerId === "layer-01-bg");
    const prevBg = mergedFlatB.updatedManuscript.cuts[0]?.layers.find((l) => l.layerId === "layer-01-bg");
    expect(liveBg && prevBg ? computeLayerSliceDigest("cut-01", liveBg) : "").toBe(prevBg ? computeLayerSliceDigest("cut-01", prevBg) : "mismatch");
  });
});

describe("Wave 79: 기여도·Rights BOM 머클 감사 원장 및 3대 정산 모델", () => {
  it("SHA-256 해시 체인·이진 머클 루트·스튜디오 HMAC 검증을 정상 통과한다", () => {
    const snapshot = buildSampleLedger().exportSnapshot();
    const res = verifySettlementLedgerIntegrity(snapshot, { studioSecret: LEDGER_SECRET });
    expect(res.valid).toBe(true);
    expect(res.checkedEntryCount).toBe(3);
    expect(verifySettlementLedgerIntegrity(snapshot, { studioSecret: "wrong-secret" }).valid).toBe(false);
  });

  it("과거 항목의 긴급 보너스 1원 변조·컷 수 변조·라이선스 등급 변조를 머클 검증기가 결정론적으로 탐지한다", () => {
    const snapshot = buildSampleLedger().exportSnapshot();
    const mutateEntry = (idx: number, patch: (e: SettlementLedgerSnapshot["entries"][number]) => SettlementLedgerSnapshot["entries"][number]): SettlementLedgerSnapshot => ({
      ...snapshot,
      entries: snapshot.entries.map((entry, i) => (i === idx ? patch(entry) : entry)),
    });

    const bonusTamper = mutateEntry(0, (e) => ({ ...e, payload: { ...e.payload, urgentBonusKrw: e.payload.urgentBonusKrw + 1 } }));
    const cutTamper = mutateEntry(1, (e) => ({ ...e, payload: { ...e.payload, cutIds: [...e.payload.cutIds, "cut-99"] } }));
    const licenseTamper = mutateEntry(0, (e) => ({
      ...e,
      payload: { ...e.payload, rightsBomAssets: e.payload.rightsBomAssets.map((a) => ({ ...a, licenseTier: "unverified" as const })) },
    }));

    expect(verifySettlementLedgerIntegrity(bonusTamper, { studioSecret: LEDGER_SECRET }).valid).toBe(false);
    expect(verifySettlementLedgerIntegrity(cutTamper).valid).toBe(false);
    expect(verifySettlementLedgerIntegrity(licenseTamper).valid).toBe(false);
  });

  it("변조된 원장 스냅샷이나 잘못된 해시/회차 입력은 fail-closed 오류로 거부한다", () => {
    const ledger = buildSampleLedger();
    expect(() =>
      ledger.appendContribution({
        checkInId: "chk-bad-ep", episodeId: "ep-999", assistantId: "asst-seoyeon", role: "background",
        cutIds: ["cut-01"], strokeCount: 10, editedPixelAreaPx: 100, activeWorkMinutes: 5, rightsBomAssets: [], recordedAtIso: "2026-11-28T05:00:00Z",
      }),
    ).toThrowError(SettlementPolicyError);

    const snapshot = ledger.exportSnapshot();
    const tampered: SettlementLedgerSnapshot = {
      ...snapshot,
      entries: snapshot.entries.map((e, i) => (i === 0 ? { ...e, payload: { ...e.payload, strokeCount: 999999 } } : e)),
    };
    expect(() =>
      calculateEpisodeSettlementStatement(tampered, { model: "milestone-fixed", defaultFixedFeeKrw: 300_000 }, { calculatedAtIso: "2026-11-28T06:00:00Z", studioSecret: LEDGER_SECRET }),
    ).toThrowError(SettlementPolicyError);
  });

  it("컷당 단가 정산(per-cut-rate)이 동일 (컷, 역할) 중복 체크인을 제거하고 승인 컷 필터·복잡도 가산을 정확 계산한다", () => {
    const ledger = buildSampleLedger();
    ledger.appendContribution({
      checkInId: "chk-01-fix", episodeId: "ep-042", assistantId: "asst-seoyeon", assistantDisplayName: "김서연", role: "background",
      cutIds: ["cut-01"], strokeCount: 80, editedPixelAreaPx: 120_000, activeWorkMinutes: 15, complexityMultiplier: 1.2, rightsBomAssets: [], recordedAtIso: "2026-11-28T05:45:00Z",
    });

    const statement = calculateEpisodeSettlementStatement(
      ledger.exportSnapshot(),
      { model: "per-cut-rate", defaultRatePerCutKrw: 10_000, rateByRoleKrw: { background: 25_000, colorist: 15_000, letterer: 8_000 }, backgroundComplexityBonusRate: 0.1 },
      { calculatedAtIso: "2026-11-28T06:00:00Z", studioSecret: LEDGER_SECRET },
    );
    const seoyeon = statement.lineItems.find((i) => i.assistantId === "asst-seoyeon");
    expect(seoyeon?.approvedCutCount).toBe(3);
    expect(seoyeon?.basePayoutKrw).toBe(75_000);
    expect(seoyeon?.complexityAndUrgentBonusKrw).toBe(52_500);
    expect(seoyeon?.grossPayoutKrw).toBe(127_500);
    expect(statement.totalAssistantGrossPayoutKrw).toBe(203_500);

    const filtered = calculateEpisodeSettlementStatement(
      ledger.exportSnapshot(),
      { model: "per-cut-rate", defaultRatePerCutKrw: 10_000, approvedCutIds: ["cut-01", "cut-02"] },
      { calculatedAtIso: "2026-11-28T06:00:00Z", studioSecret: LEDGER_SECRET },
    );
    expect(filtered.lineItems.find((i) => i.assistantId === "asst-minjun")?.approvedCutCount).toBe(2);
  });

  it("회차 공정 정액 정산(milestone-fixed)이 역할·개인별 정액과 긴급 가산을 합산한다", () => {
    const statement = calculateEpisodeSettlementStatement(
      buildSampleLedger().exportSnapshot(),
      { model: "milestone-fixed", fixedFeeByRoleKrw: { background: 450_000, colorist: 350_000, letterer: 150_000 }, fixedFeeByAssistantKrw: { "asst-minjun": 380_000 } },
      { calculatedAtIso: "2026-11-28T06:00:00Z", studioSecret: LEDGER_SECRET },
    );
    expect(statement.lineItems.find((i) => i.assistantId === "asst-seoyeon")?.grossPayoutKrw).toBe(480_000);
    expect(statement.lineItems.find((i) => i.assistantId === "asst-minjun")?.grossPayoutKrw).toBe(380_000);
    expect(statement.lineItems.find((i) => i.assistantId === "asst-jiwoo")?.grossPayoutKrw).toBe(150_000);
    expect(statement.totalAssistantGrossPayoutKrw).toBe(1_010_000);
  });

  it("기본료+수익 지분 혼합 정산(hybrid-revenue-share)이 다중 어시스턴트 분할에서 1원 오차도 없이 정합한다", () => {
    const snapshot = buildSampleLedger().exportSnapshot();
    const pool = 1_000_003;
    const fullSplit = calculateEpisodeSettlementStatement(
      snapshot,
      {
        model: "hybrid-revenue-share", distributableRevenuePoolKrw: pool,
        baseFeeByAssistantKrw: { "asst-seoyeon": 200_000, "asst-minjun": 150_000, "asst-jiwoo": 100_000 },
        revenueSharePercentByAssistant: { "asst-seoyeon": 33.3333333333, "asst-minjun": 33.3333333333, "asst-jiwoo": 33.3333333334 },
        authorRetainedSharePercent: 0,
      },
      { calculatedAtIso: "2026-11-28T06:00:00Z", studioSecret: LEDGER_SECRET },
    );
    expect(fullSplit.lineItems.reduce((sum, item) => sum + item.revenueShareKrw, 0)).toBe(pool);
    expect(fullSplit.roundingRemainderKrw).toBeGreaterThan(0);
    expect(fullSplit.lineItems.every((item) => Number.isInteger(item.grossPayoutKrw))).toBe(true);

    const withAuthor = calculateEpisodeSettlementStatement(
      snapshot,
      {
        model: "hybrid-revenue-share", distributableRevenuePoolKrw: 100_001,
        revenueSharePercentByAssistant: { "asst-seoyeon": 15.5, "asst-minjun": 12.25, "asst-jiwoo": 5.25 },
        remainderRecipientId: "asst-seoyeon",
      },
      { calculatedAtIso: "2026-11-28T06:00:00Z", studioSecret: LEDGER_SECRET },
    );
    expect(withAuthor.totalAssistantRevenueShareKrw + withAuthor.authorRetainedKrw).toBe(100_001);
    expect(withAuthor.lineItems.find((i) => i.assistantId === "asst-seoyeon")?.roundingAdjustmentKrw).toBe(withAuthor.roundingRemainderKrw);
  });

  it("수익 지분율 합계가 100%를 초과하면 REVENUE_SHARE_SUM_EXCEEDS_100 오류로 거부한다", () => {
    const snapshot = buildSampleLedger().exportSnapshot();
    let caughtCode: string | null = null;
    try {
      calculateEpisodeSettlementStatement(
        snapshot,
        { model: "hybrid-revenue-share", distributableRevenuePoolKrw: 1_000_000, revenueSharePercentByAssistant: { "asst-seoyeon": 45, "asst-minjun": 40, "asst-jiwoo": 20 } },
        { calculatedAtIso: "2026-11-28T06:00:00Z", studioSecret: LEDGER_SECRET },
      );
    } catch (error) {
      if (error instanceof SettlementPolicyError) caughtCode = error.code;
    }
    expect(caughtCode).toBe("REVENUE_SHARE_SUM_EXCEEDS_100");

    expect(() =>
      calculateEpisodeSettlementStatement(
        snapshot,
        { model: "hybrid-revenue-share", distributableRevenuePoolKrw: 1_000_000, revenueSharePercentByAssistant: { "asst-seoyeon": 30, "asst-minjun": 30 }, authorRetainedSharePercent: 45 },
        { calculatedAtIso: "2026-11-28T06:00:00Z", studioSecret: LEDGER_SECRET },
      ),
    ).toThrowError(SettlementPolicyError);
  });

  it("Rights BOM 에셋이 모두 commercial-cleared이면 상업 정산 게이트를 통과한다", () => {
    const statement = calculateEpisodeSettlementStatement(
      buildSampleLedger().exportSnapshot(),
      { model: "milestone-fixed", defaultFixedFeeKrw: 200_000 },
      { calculatedAtIso: "2026-11-28T06:00:00Z", studioSecret: LEDGER_SECRET },
    );
    expect(statement.rightsBomGate.commercialClearancePassed).toBe(true);
    expect(statement.rightsBomGate.clearedAssetCount).toBe(3);
    expect(statement.rightsBomGate.blockers).toHaveLength(0);
  });

  it("Rights BOM에 unverified 또는 editorial-only 에셋이 첨부되면 상업 정산 게이트가 차단 항목을 식별한다", () => {
    const ledger = buildSampleLedger();
    ledger.appendContribution({
      checkInId: "chk-04-risky", episodeId: "ep-042", assistantId: "asst-seoyeon", assistantDisplayName: "김서연", role: "background",
      cutIds: ["cut-05"], strokeCount: 300, editedPixelAreaPx: 900_000, activeWorkMinutes: 40,
      rightsBomAssets: [
        { assetId: "asset-unverified-brush", assetName: "출처 미확인 브러시", assetCategory: "brush-preset", licenseTier: "unverified", sourceSha256: sha256Hex("b1") },
        { assetId: "asset-editorial-photo", assetName: "보도용 사진 텍스처", assetCategory: "texture", licenseTier: "editorial-only", sourceSha256: sha256Hex("t1") },
      ],
      recordedAtIso: "2026-11-28T05:50:00Z",
    });

    const statement = calculateEpisodeSettlementStatement(
      ledger.exportSnapshot(),
      { model: "milestone-fixed", defaultFixedFeeKrw: 200_000 },
      { calculatedAtIso: "2026-11-28T06:00:00Z", studioSecret: LEDGER_SECRET },
    );
    expect(statement.rightsBomGate.commercialClearancePassed).toBe(false);
    expect(statement.rightsBomGate.unverifiedCount).toBe(1);
    expect(statement.rightsBomGate.editorialOnlyCount).toBe(1);
    expect(statement.rightsBomGate.blockers.map((b) => b.assetId)).toEqual(["asset-unverified-brush", "asset-editorial-photo"]);
    expect(statement.lineItems.find((i) => i.assistantId === "asst-seoyeon")?.rightsClearancePassed).toBe(false);
  });
});

describe("Wave 79: 한국어 정산 명세서·영수증 내보내기 및 종단간 파이프라인", () => {
  it("참고용 예상 원천징수(3.3%)·비자문 고지·머클 루트가 포함된 Markdown 표와 정규 JSON 영수증을 내보내고 검증한다", () => {
    const ledger = new AssistantSettlementAuditLedger({ ledgerId: "ledger-exp-042", episodeId: "ep-042", projectId: "proj-seoul-noir", studioSecret: LEDGER_SECRET });
    ledger.appendContribution({
      checkInId: "chk-exp-01", episodeId: "ep-042", assistantId: "asst-seoyeon", assistantDisplayName: "김서연", role: "background",
      cutIds: ["cut-01", "cut-02"], strokeCount: 800, editedPixelAreaPx: 1_500_000, activeWorkMinutes: 120,
      rightsBomAssets: [makeClearedAsset("asset-city-3d", "도시 야경 3D")], recordedAtIso: "2026-11-28T04:00:00Z",
    });
    const statement = calculateEpisodeSettlementStatement(
      ledger.exportSnapshot(),
      { model: "milestone-fixed", fixedFeeByAssistantKrw: { "asst-seoyeon": 1_000_000 } },
      { calculatedAtIso: "2026-11-28T06:00:00Z", studioSecret: LEDGER_SECRET },
    );
    const exported = exportSettlementStatementSummary(statement, { receiptId: "rcpt-ep042-001", studioSecret: LEDGER_SECRET });

    expect(exported.markdownSummary).toContain(FREELANCER_WITHHOLDING_LABEL);
    expect(exported.markdownSummary).toContain("세무 신고·법률 자문 효력이 없습니다");
    expect(exported.markdownSummary).toContain(statement.merkleRootHex);
    expect(exported.totals.estimatedIncomeTaxKrw).toBe(30_000);
    expect(exported.totals.estimatedLocalIncomeTaxKrw).toBe(3_000);
    expect(exported.totals.estimatedWithholdingTotalKrw).toBe(33_000);
    expect(exported.totals.estimatedNetPayoutKrw).toBe(967_000);
    expect(verifyExportedSettlementReceipt(exported, LEDGER_SECRET).valid).toBe(true);
    expect(verifyExportedSettlementReceipt({ ...exported, canonicalReceiptJson: exported.canonicalReceiptJson.replace("1000000", "2000000") }, LEDGER_SECRET).valid).toBe(false);
  });

  it("Rights BOM 차단 항목이 있는 정산서 내보내기 시 보류 권고 상태가 명세서에 반영된다", () => {
    const ledger = buildSampleLedger();
    ledger.appendContribution({
      checkInId: "chk-blocked", episodeId: "ep-042", assistantId: "asst-jiwoo", assistantDisplayName: "이지우", role: "letterer",
      cutIds: ["cut-03"], strokeCount: 40, editedPixelAreaPx: 50_000, activeWorkMinutes: 10,
      rightsBomAssets: [{ assetId: "font-unverified", assetName: "미확인 폰트", assetCategory: "font", licenseTier: "unverified", sourceSha256: sha256Hex("bad-font") }],
      recordedAtIso: "2026-11-28T05:55:00Z",
    });
    const statement = calculateEpisodeSettlementStatement(
      ledger.exportSnapshot(),
      { model: "milestone-fixed", defaultFixedFeeKrw: 150_000 },
      { calculatedAtIso: "2026-11-28T06:00:00Z", studioSecret: LEDGER_SECRET },
    );
    const exported = exportSettlementStatementSummary(statement);
    expect(exported.rightsClearanceSummary.commercialClearancePassed).toBe(false);
    expect(exported.markdownSummary).toContain("정산 보류 권고");
    expect(exported.markdownSummary).toContain("차단(1건)");
  });

  it("체크아웃 → 복호화 → 체크인 병합 → 머클 원장 → 정산서·영수증 발행 종단간 흐름이 일관되게 동작한다", () => {
    const manuscript = createSampleManuscript();
    const pkg = makeCheckout(manuscript, { id: "pkg-e2e-01", expiresAtIso: "2026-11-28T12:00:00Z" });
    const opened = openScopedAssistantCheckoutPackage(pkg, { assistantId: "asst-seoyeon", assistantKey: KEY_A, nowIso: "2026-11-28T03:00:00Z" });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const submission = submitAssistantWorkSlice({
      checkoutPackage: pkg, submissionId: "sub-e2e-01", assistantId: "asst-seoyeon", assistantKey: KEY_A, submittedAtIso: "2026-11-28T05:00:00Z",
      editedSlices: [{ cutId: "cut-01", layerId: "layer-01-bg", role: "background", content: "bg-final", baseDigestHex: opened.workspace.baseSliceDigests["cut-01::layer-01-bg"] ?? null }],
    });
    const merged = mergeVerifiedAssistantWorkSlice({ manuscript, checkoutPackage: pkg, submission, authorMasterSecret: AUTHOR_SECRET, assistantKey: KEY_A, nowIso: "2026-11-28T05:10:00Z" });
    expect(merged.accepted).toBe(true);

    const ledger = new AssistantSettlementAuditLedger({ ledgerId: "ledger-e2e-042", episodeId: manuscript.episodeId, projectId: manuscript.projectId, studioSecret: LEDGER_SECRET });
    ledger.appendContribution({
      checkInId: submission.header.submissionId, episodeId: manuscript.episodeId, assistantId: "asst-seoyeon", assistantDisplayName: "김서연", role: "background",
      cutIds: ["cut-01"], strokeCount: 612, editedPixelAreaPx: 1_920_000, activeWorkMinutes: 95,
      rightsBomAssets: [makeClearedAsset("asset-rooftop-final", "옥상 배경 최종팩")],
      checkInDigestHex: merged.auditCheckInDigestHex ?? undefined, recordedAtIso: "2026-11-28T05:15:00Z",
    });

    const statement = calculateEpisodeSettlementStatement(
      ledger.exportSnapshot(),
      { model: "hybrid-revenue-share", distributableRevenuePoolKrw: 500_000, baseFeeByAssistantKrw: { "asst-seoyeon": 150_000 }, revenueSharePercentByAssistant: { "asst-seoyeon": 15 } },
      { calculatedAtIso: "2026-11-28T06:00:00Z", studioSecret: LEDGER_SECRET },
    );
    const exported = exportSettlementStatementSummary(statement, { studioSecret: LEDGER_SECRET });
    expect(statement.totalAssistantGrossPayoutKrw).toBe(225_000);
    expect(statement.authorRetainedKrw).toBe(425_000);
    expect(exported.rightsClearanceSummary.commercialClearancePassed).toBe(true);
    expect(verifyExportedSettlementReceipt(exported, LEDGER_SECRET).valid).toBe(true);
  });
});
