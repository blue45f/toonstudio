// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { persistSession } from "@/domains/auth/public/session/auth-session-state";
import { reviewProductionFixture } from "../../review-production/studio-review-production-test-fixture";
import { StudioPinnedReviewShareManager } from "../StudioPinnedReviewShareManager";
import {
  StudioScopedHandoffDrawer,
  computeScopedHandoffSha256,
  createScopedHandoffEnvelope,
  createScopedHandoffLayerSnapshot,
  createScopedHandoffReturnPacket,
  decodeScopedHandoffLink,
  encodeScopedHandoffLink,
  encodeScopedHandoffReturnToken,
  mergeScopedHandoffReturn,
  previewScopedHandoffReturnMerge,
  verifyScopedHandoffEnvelope,
  verifyScopedHandoffReturnPacket,
  type ScopedHandoffCutSnapshot,
  type ScopedHandoffManuscriptSnapshot,
  type ScopedHandoffReturnPacket,
} from "./index";

vi.mock("../studio-pinned-review-share-client", () => ({
  listPinnedReviewShares: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  listPinnedReviewShareSources: vi.fn().mockResolvedValue({
    subject: { schemaVersion: 1, workId: "work", projectId: "graph", artifactId: "artifact", reviewId: "review", revisionId: "snapshot", rootGraphHash: "a".repeat(64) },
    pages: [], nextOffset: null, approved: true, expiresAt: "2030-09-23T00:00:00.000Z",
  }),
  createPinnedReviewShare: vi.fn(),
  revokePinnedReviewShare: vi.fn(),
}));

const BASE_NOW_MS = Date.parse("2026-11-22T12:00:00.000Z");

function makeCut(cutId: string, label: string, orderIndex: number): ScopedHandoffCutSnapshot {
  const layers = Object.freeze([
    createScopedHandoffLayerSnapshot({ layerId: `${cutId}-line`, role: "line-art", name: "선화", payload: `line-strokes:${cutId}` }),
    createScopedHandoffLayerSnapshot({ layerId: `${cutId}-flat`, role: "flat-color", name: "밑색", payload: `flat-base:${cutId}` }),
    createScopedHandoffLayerSnapshot({ layerId: `${cutId}-shade`, role: "shading", name: "명암", payload: `shade-pass:${cutId}` }),
    createScopedHandoffLayerSnapshot({ layerId: `${cutId}-bg3d`, role: "bg3d-place", name: "3D 배경", payload: `bg3d-cam:${cutId}` }),
    createScopedHandoffLayerSnapshot({ layerId: `${cutId}-text`, role: "lettering", name: "식자", payload: `balloon:${cutId}` }),
  ]);
  const revisionHash = computeScopedHandoffSha256({ cutId, layers: layers.map((layer) => layer.revisionHash) });
  return Object.freeze({ cutId, label, orderIndex, revisionHash, width: 800, height: 1280, previewDigest: computeScopedHandoffSha256(`preview:${cutId}`), layers });
}

function makeManuscript(): ScopedHandoffManuscriptSnapshot {
  const cuts = Object.freeze([
    makeCut("cut-1", "컷 1", 0),
    makeCut("cut-2", "컷 2", 1),
    makeCut("cut-3", "컷 3", 2),
    makeCut("cut-4", "컷 4", 3),
  ]);
  return Object.freeze({
    workId: "work-ep12", projectId: "proj-ep12", episodeLabel: "12화",
    baseRevisionId: "rev-012", baseRevisionHash: computeScopedHandoffSha256({ rev: "rev-012", cuts: cuts.map((c) => c.revisionHash) }),
    cuts,
  });
}

function forgeSignedPacket(base: ScopedHandoffReturnPacket, patch: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const { returnSha256: _ignored, ...rest } = base;
  const mutated: Record<string, unknown> = { ...rest, ...patch };
  return { ...mutated, returnSha256: computeScopedHandoffSha256(mutated) };
}

afterEach(() => {
  cleanup();
  persistSession(null);
  vi.clearAllMocks();
});

describe("Zero-Account Scoped Cut Handoff 프로토콜 (#061–#065)", () => {
  it("배정 컷·허용 레이어 역할·앞뒤 ±1 읽기전용 문맥 컷·순수 SHA-256 봉투와 fragment 링크를 왕복 검증한다", () => {
    const manuscript = makeManuscript();
    const envelope = createScopedHandoffEnvelope({
      manuscript, cutIds: ["cut-2"], allowedRoles: ["flat-color", "shading"],
      title: "12화 컷 2 밑색·채색 외주", instructions: "그림자는 따뜻한 톤으로 정리해 주세요.",
      expiresInHours: 72, contextWindow: 1, handoffId: "sh-ep12-001", nowMs: BASE_NOW_MS,
    });

    expect(envelope.zeroAccount).toBe(true);
    expect(envelope.cutIds).toEqual(["cut-2"]);
    expect(envelope.allowedRoles).toEqual(["flat-color", "shading"]);
    expect(envelope.envelopeSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(envelope.assignedCuts[0]?.editableLayers.map((l) => l.role)).toEqual(["flat-color", "shading"]);
    expect(envelope.assignedCuts[0]?.referenceLayers.map((l) => l.role)).toEqual(["line-art", "bg3d-place", "lettering"]);
    expect(envelope.contextCuts.map((c) => ({ id: c.cutId, ro: c.readOnly, rels: c.relations }))).toEqual([
      { id: "cut-1", ro: true, rels: ["before"] },
      { id: "cut-3", ro: true, rels: ["after"] },
    ]);

    const link = encodeScopedHandoffLink(envelope, "https://www.toonstudio.cloud");
    expect(link).toContain("/production/scoped-handoff#envelope=");
    expect(link).not.toContain("?envelope=");

    const decoded = decodeScopedHandoffLink(link, { nowMs: BASE_NOW_MS + 1000 });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.envelope.envelopeSha256).toBe(envelope.envelopeSha256);
      expect(decoded.envelope.title).toBe("12화 컷 2 밑색·채색 외주");
    }

    const middleShared = createScopedHandoffEnvelope({
      manuscript, cutIds: ["cut-1", "cut-3"], allowedRoles: ["line-art"], title: "중간 문맥 중복 제거", nowMs: BASE_NOW_MS,
    });
    expect(middleShared.contextCuts.map((c) => ({ id: c.cutId, rels: c.relations, adj: c.adjacentToCutIds }))).toEqual([
      { id: "cut-2", rels: ["after", "before"], adj: ["cut-1", "cut-3"] },
      { id: "cut-4", rels: ["after"], adj: ["cut-3"] },
    ]);
  });

  it("봉투 위변조와 만료 시각 경과를 Fail-Closed로 즉시 거부한다", () => {
    const manuscript = makeManuscript();
    const envelope = createScopedHandoffEnvelope({
      manuscript, cutIds: ["cut-2"], allowedRoles: ["bg3d-place"], title: "배경 배치", expiresInHours: 24, nowMs: BASE_NOW_MS,
    });

    const tampered = verifyScopedHandoffEnvelope({ ...envelope, expiresAt: "2099-01-01T00:00:00.000Z" }, { nowMs: BASE_NOW_MS + 1000 });
    expect(tampered.ok).toBe(false);
    if (!tampered.ok) expect(tampered.code).toBe("envelope-integrity-failed");

    const expired = verifyScopedHandoffEnvelope(envelope, { nowMs: BASE_NOW_MS + 24 * 3_600_000 + 1 });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.code).toBe("handoff-expired");
  });

  it("히든 디테일(#065): 메인 원고 컷 순서가 바뀌어도 배열 인덱스가 아니라 불변 cutId + 기준 리비전 해시로 매칭·병합한다", () => {
    const issuedManuscript = makeManuscript();
    const envelope = createScopedHandoffEnvelope({
      manuscript: issuedManuscript, cutIds: ["cut-2"], allowedRoles: ["flat-color"],
      title: "컷 2 밑색 작업", handoffId: "sh-reorder-065", nowMs: BASE_NOW_MS,
    });

    const updatedFlat = createScopedHandoffLayerSnapshot({ layerId: "cut-2-flat", role: "flat-color", name: "밑색", payload: "flat-finished-v2" });
    const addedFlat = createScopedHandoffLayerSnapshot({ layerId: "cut-2-flat-accent", role: "flat-color", name: "밑색 보조", payload: "flat-accent-v1" });
    const returnPacket = createScopedHandoffReturnPacket({
      envelope, assistantLabel: "밑색 어시스턴트 A", note: "컷 2 밑색 및 보조 레이어 완료",
      submittedAtMs: BASE_NOW_MS + 3_600_000,
      cuts: [{ cutId: "cut-2", layers: [updatedFlat, addedFlat] }],
    });

    // 메인 원고에서 새 컷 삽입 및 순서 대폭 변경: cut-2가 배열 인덱스 1 → 3으로 이동
    const insertedCut = makeCut("cut-0", "도입 컷 0", 0);
    const reorderedManuscript: ScopedHandoffManuscriptSnapshot = Object.freeze({
      ...issuedManuscript,
      cuts: Object.freeze([
        { ...insertedCut, orderIndex: 0 },
        { ...issuedManuscript.cuts[3], orderIndex: 1 },
        { ...issuedManuscript.cuts[0], orderIndex: 2 },
        { ...issuedManuscript.cuts[1], orderIndex: 3 },
        { ...issuedManuscript.cuts[2], orderIndex: 4 },
      ]),
    });

    const preview = previewScopedHandoffReturnMerge({
      currentManuscript: reorderedManuscript, envelope, returnPacket, nowMs: BASE_NOW_MS + 7_200_000,
    });
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.matchedByCutId).toBe(true);
      expect(preview.reorderedCutIds).toEqual(["cut-2"]);
      expect(preview.cutPlans[0]).toMatchObject({
        cutId: "cut-2", issuedOrderIndex: 1, currentOrderIndex: 3, orderChanged: true,
        updatedLayerIds: ["cut-2-flat"], addedLayerIds: ["cut-2-flat-accent"], untouchedLockedLayerCount: 4,
      });
    }

    const merged = mergeScopedHandoffReturn({
      currentManuscript: reorderedManuscript, envelope, returnPacket, nowMs: BASE_NOW_MS + 7_200_000,
    });
    expect(merged.ok).toBe(true);
    if (merged.ok) {
      expect(merged.manuscript.cuts.map((c) => c.cutId)).toEqual(["cut-0", "cut-4", "cut-1", "cut-2", "cut-3"]);
      const mergedCut2 = merged.manuscript.cuts[3];
      expect(mergedCut2.layers.find((l) => l.layerId === "cut-2-flat")?.payload).toBe("flat-finished-v2");
      expect(mergedCut2.layers.find((l) => l.layerId === "cut-2-flat-accent")?.payload).toBe("flat-accent-v1");
      // 잠금 레이어와 미배정 컷은 1바이트도 변경되지 않는다.
      expect(mergedCut2.layers.find((l) => l.layerId === "cut-2-line")?.payload).toBe("line-strokes:cut-2");
      expect(merged.manuscript.cuts[1].layers.find((l) => l.layerId === "cut-4-flat")?.payload).toBe("flat-base:cut-4");
    }

    // 메인 원고에서 배정 컷 자체가 이미 수정된 경우 기준 리비전 해시 불일치로 Fail-Closed 거부
    const driftedCut2 = {
      ...issuedManuscript.cuts[1],
      layers: issuedManuscript.cuts[1].layers.map((l) =>
        l.layerId === "cut-2-line" ? createScopedHandoffLayerSnapshot({ layerId: l.layerId, role: "line-art", name: l.name, payload: "author-edited-line" }) : l),
    };
    const driftedManuscript: ScopedHandoffManuscriptSnapshot = {
      ...reorderedManuscript,
      cuts: reorderedManuscript.cuts.map((c) => (c.cutId === "cut-2" ? driftedCut2 : c)),
    };
    const conflict = mergeScopedHandoffReturn({
      currentManuscript: driftedManuscript, envelope, returnPacket, nowMs: BASE_NOW_MS + 7_200_000,
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.code).toBe("baseline-revision-mismatch");
  });

  it("히든 디테일(#065): 미배정 컷·문맥 컷·허용 외 레이어·역할 위조·해시 변조가 감지되면 Fail-Closed로 즉시 거부한다", () => {
    const manuscript = makeManuscript();
    const envelope = createScopedHandoffEnvelope({
      manuscript, cutIds: ["cut-2"], allowedRoles: ["flat-color"], title: "밑색 전용", nowMs: BASE_NOW_MS,
    });
    const validFlat = createScopedHandoffLayerSnapshot({ layerId: "cut-2-flat", role: "flat-color", name: "밑색", payload: "ok-flat" });
    const baseReturn = createScopedHandoffReturnPacket({
      envelope, assistantLabel: "외주 B", submittedAtMs: BASE_NOW_MS + 1000,
      cuts: [{ cutId: "cut-2", layers: [validFlat] }],
    });

    // 1) 읽기 전용 문맥 컷(cut-3) 변조 주입 (SHA-256까지 재계산한 악의적 패킷)
    const unassignedCutAttack = forgeSignedPacket(baseReturn, {
      returnedCuts: [
        ...baseReturn.returnedCuts,
        {
          cutId: "cut-3",
          baselineCutRevisionHash: envelope.contextCuts[1].baselineCutRevisionHash,
          lockedLayersSha256: baseReturn.returnedCuts[0].lockedLayersSha256,
          layers: [createScopedHandoffLayerSnapshot({ layerId: "cut-3-flat", role: "flat-color", name: "밑색", payload: "hijack-cut-3" })],
        },
      ],
    });
    const r1 = mergeScopedHandoffReturn({ currentManuscript: manuscript, envelope, returnPacket: unassignedCutAttack, nowMs: BASE_NOW_MS + 2000 });
    expect(r1.ok).toBe(false);
    if (!r1.ok) {
      expect(r1.code).toBe("unassigned-cut-mutation");
      expect(r1.offendingCutIds).toEqual(["cut-3"]);
    }

    // 2) 허용 외 역할(line-art) 레이어 변조 주입
    const disallowedRoleAttack = forgeSignedPacket(baseReturn, {
      returnedCuts: [{
        ...baseReturn.returnedCuts[0],
        layers: [validFlat, createScopedHandoffLayerSnapshot({ layerId: "cut-2-line-new", role: "line-art", name: "선화", payload: "hijack-line" })],
      }],
    });
    const r2 = mergeScopedHandoffReturn({ currentManuscript: manuscript, envelope, returnPacket: disallowedRoleAttack, nowMs: BASE_NOW_MS + 2000 });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.code).toBe("disallowed-layer-mutation");
      expect(r2.offendingLayerIds).toEqual(["cut-2-line-new"]);
    }

    // 3) 잠금 레이어 ID(cut-2-line)를 허용 역할(flat-color)로 위장한 역할 스푸핑 공격
    const roleSpoofAttack = forgeSignedPacket(baseReturn, {
      returnedCuts: [{
        ...baseReturn.returnedCuts[0],
        layers: [createScopedHandoffLayerSnapshot({ layerId: "cut-2-line", role: "flat-color", name: "위장 레이어", payload: "spoofed" })],
      }],
    });
    const r3 = verifyScopedHandoffReturnPacket(roleSpoofAttack, envelope, { nowMs: BASE_NOW_MS + 2000 });
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.code).toBe("disallowed-layer-mutation");

    // 4) lockedLayersSha256 변조
    const lockedHashAttack = forgeSignedPacket(baseReturn, {
      returnedCuts: [{ ...baseReturn.returnedCuts[0], lockedLayersSha256: "f".repeat(64) }],
    });
    const r4 = verifyScopedHandoffReturnPacket(lockedHashAttack, envelope, { nowMs: BASE_NOW_MS + 2000 });
    expect(r4.ok).toBe(false);
    if (!r4.ok) expect(r4.code).toBe("disallowed-layer-mutation");

    // 5) 해시 재계산 없는 바이트 변조
    const byteTamper = { ...baseReturn, note: "변조된 메모" };
    const r5 = verifyScopedHandoffReturnPacket(byteTamper, envelope, { nowMs: BASE_NOW_MS + 2000 });
    expect(r5.ok).toBe(false);
    if (!r5.ok) expect(r5.code).toBe("return-integrity-failed");
  });
});

describe("Calm Atelier 컷 단위 제한 링크 드로어 UI 및 최소 연결", () => {
  it("3클릭으로 제한 링크를 발급하고, 순서가 바뀐 원고에서도 반납 미리보기·병합과 Fail-Closed 거부를 표시한다", () => {
    const issuedManuscript = makeManuscript();
    const onClose = vi.fn();
    const onApplyMerge = vi.fn();

    const { rerender } = render(
      <StudioScopedHandoffDrawer
        open
        onClose={onClose}
        manuscript={issuedManuscript}
        onApplyMerge={onApplyMerge}
        initialNowMs={BASE_NOW_MS}
        origin="https://www.toonstudio.cloud"
      />,
    );

    const drawer = screen.getByTestId("studio-scoped-handoff-drawer");
    expect(drawer.className).toContain("[word-break:keep-all]");
    expect((screen.getByTestId("scoped-handoff-issue-btn") as HTMLButtonElement).disabled).toBe(true);

    // 1클릭: 컷 2 선택 -> 앞뒤 문맥 컷(±1) 읽기 전용 자동 표시
    fireEvent.click(screen.getByTestId("scoped-handoff-cut-cut-2"));
    expect(screen.getByTestId("scoped-handoff-cut-cut-1").getAttribute("data-context-relation")).toBe("before");
    expect(screen.getByTestId("scoped-handoff-cut-cut-3").getAttribute("data-context-relation")).toBe("after");

    // 2클릭: 허용 레이어 역할(lettering) 선택
    fireEvent.click(screen.getByTestId("scoped-handoff-role-lettering"));
    expect((screen.getByTestId("scoped-handoff-issue-btn") as HTMLButtonElement).disabled).toBe(false);

    // 3클릭: 컷 제한 링크 발급
    fireEvent.click(screen.getByTestId("scoped-handoff-issue-btn"));
    const linkInput = screen.getByTestId("scoped-handoff-link-input") as HTMLInputElement;
    expect(linkInput.value).toContain("/production/scoped-handoff#envelope=");
    const decoded = decodeScopedHandoffLink(linkInput.value, { nowMs: BASE_NOW_MS + 1000 });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    // 메인 원고 컷 순서를 바꾼 상태로 드로어 리렌더 (cut-2가 2번째 -> 4번째로 이동)
    const reorderedManuscript: ScopedHandoffManuscriptSnapshot = Object.freeze({
      ...issuedManuscript,
      cuts: Object.freeze([
        { ...issuedManuscript.cuts[3], orderIndex: 0 },
        { ...issuedManuscript.cuts[0], orderIndex: 1 },
        { ...issuedManuscript.cuts[2], orderIndex: 2 },
        { ...issuedManuscript.cuts[1], orderIndex: 3 },
      ]),
    });
    rerender(
      <StudioScopedHandoffDrawer
        open
        onClose={onClose}
        manuscript={reorderedManuscript}
        onApplyMerge={onApplyMerge}
        initialNowMs={BASE_NOW_MS + 5000}
        origin="https://www.toonstudio.cloud"
      />,
    );

    // 반납 검증 탭 전환 -> 허용 외 레이어 변조 패킷 즉시 Fail-Closed 거부 확인
    fireEvent.click(screen.getByTestId("scoped-handoff-tab-return"));
    const validLettering = createScopedHandoffLayerSnapshot({ layerId: "cut-2-text", role: "lettering", name: "식자", payload: "대사 식자 완료" });
    const validPacket = createScopedHandoffReturnPacket({
      envelope: decoded.envelope, assistantLabel: "식자 어시스턴트", submittedAtMs: BASE_NOW_MS + 2000,
      cuts: [{ cutId: "cut-2", layers: [validLettering] }],
    });
    const tamperedPacket = forgeSignedPacket(validPacket, {
      returnedCuts: [{
        ...validPacket.returnedCuts[0],
        layers: [validLettering, createScopedHandoffLayerSnapshot({ layerId: "cut-2-line-rogue", role: "line-art", name: "선화", payload: "rogue" })],
      }],
    });

    fireEvent.change(screen.getByTestId("scoped-handoff-return-input"), { target: { value: JSON.stringify(tamperedPacket) } });
    fireEvent.click(screen.getByTestId("scoped-handoff-verify-btn"));
    expect(screen.getByTestId("scoped-handoff-reject-alert").textContent).toContain("disallowed-layer-mutation");
    expect(screen.queryByTestId("scoped-handoff-apply-merge-btn")).toBeNull();

    // 정상 Base64URL 반납 토큰 검증 -> 컷 순서 변경 안내 + cutId 매칭 병합 적용
    fireEvent.change(screen.getByTestId("scoped-handoff-return-input"), { target: { value: encodeScopedHandoffReturnToken(validPacket) } });
    fireEvent.click(screen.getByTestId("scoped-handoff-verify-btn"));
    expect(screen.getByTestId("scoped-handoff-preview-ok")).toBeTruthy();
    expect(screen.getByTestId("scoped-handoff-reorder-notice").textContent).toContain("cut-2");

    fireEvent.click(screen.getByTestId("scoped-handoff-apply-merge-btn"));
    expect(onApplyMerge).toHaveBeenCalledOnce();
    const mergedArg = onApplyMerge.mock.calls[0]?.[0] as ScopedHandoffManuscriptSnapshot;
    expect(mergedArg.cuts[3]?.cutId).toBe("cut-2");
    expect(mergedArg.cuts[3]?.layers.find((l) => l.layerId === "cut-2-text")?.payload).toBe("대사 식자 완료");

    // Escape 키로 서랍 닫힘 확인
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("StudioPinnedReviewShareManager의 단일 버튼으로 컷 단위 어시스턴트 전달 드로어를 연다", () => {
    persistSession({ user: { id: "owner" }, token: null });
    render(<StudioPinnedReviewShareManager verified={reviewProductionFixture().verified} />);
    expect(screen.queryByTestId("studio-scoped-handoff-drawer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "컷 단위 어시스턴트 전달" }));
    expect(screen.getByTestId("studio-scoped-handoff-drawer")).toBeTruthy();
  });
});
