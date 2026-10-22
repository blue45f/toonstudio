import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseStudioBundleCatalog } from "../apps/web/src/domains/creator/studio-bundle-asset-delivery.ts";
import { loadPackRightsLedger } from "./lib/creator-bundle-pack-rights.mjs";
import {
  isDraftRenderSlot,
  planRenderManifestRights,
  RENDER_MANIFEST_FILE,
  RENDER_PACK_DIR,
  RENDER_RIGHTS_KEYS,
} from "./lib/creator-bundle-render-rights.mjs";
import {
  renderDraftSlot,
  renderLedger,
  renderManifest,
  renderSlot,
} from "./lib/creator-bundle-render-rights-test-support.mjs";

/**
 * 렌더 이미지 전달의 권리 판정은 두 곳이 나눠 가진다: CI 판정·스탬프(scripts/lib/creator-bundle-render-rights.mjs)와
 * 웹 로더(studio-bundle-asset-delivery.ts). 로더는 원장을 읽지 않고 스탬프된 블록만 믿으므로, 두 쪽이 같은 슬롯을
 * 전달 대상으로 보는지·블록 모양을 같게 읽는지·초안 판정이 같은지를 고정한다. 한쪽만 바뀌면 여기서 깨진다.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("렌더 권리 연동 정합 (CI 판정 · 웹 로더)", () => {
  const ledger = renderLedger();
  const slots = () => [
    renderSlot("open"),
    renderSlot("crowd"),
    renderSlot("hold"),
    renderSlot("bare"),
    renderSlot("pending"),
    renderSlot("noncommercial"),
    renderDraftSlot("open", { id: "slot-open-draft-001", path: "assets/slot-open-draft-001/prop.webp", previewPath: "assets/slot-open-draft-001/thumbnail.webp" }),
    renderDraftSlot("hold", { id: "slot-hold-draft-001", path: "assets/slot-hold-draft-001/prop.webp", previewPath: "assets/slot-hold-draft-001/thumbnail.webp" }),
  ];

  it("스탬프한 매니페스트에서 웹 로더가 전달하는 슬롯 = CI 판정이 전달 대상으로 본 슬롯", () => {
    const plan = planRenderManifestRights(ledger, renderManifest(slots()));
    const expected = plan.slots.filter((slot) => slot.deliverable).map((slot) => slot.slotId);
    expect(expected).toEqual(["slot-open-001", "slot-crowd-001"]);
    expect(parseStudioBundleCatalog(plan.stamped).map((asset) => asset.id)).toEqual(expected);
  });

  it("닫힌 팩의 완성 슬롯은 스탬프 전후 어느 쪽에서도 웹 로더가 전달하지 않는다", () => {
    const closed = ["hold", "bare", "pending", "noncommercial"].map((key) => renderSlot(key));
    expect(parseStudioBundleCatalog(renderManifest(closed))).toEqual([]);
    const plan = planRenderManifestRights(ledger, renderManifest(closed));
    expect(parseStudioBundleCatalog(plan.stamped)).toEqual([]);
  });

  it("스탬프가 싣는 블록은 웹 로더가 그대로 받고, 전달 슬롯의 권리 표기를 그 값에서 만든다", () => {
    const plan = planRenderManifestRights(ledger, renderManifest([renderSlot("open")]));
    const [asset] = parseStudioBundleCatalog(plan.stamped);
    expect(asset.rights).toEqual(plan.slots[0].expected);
    expect(Object.keys(asset.rights).sort()).toEqual([...RENDER_RIGHTS_KEYS].sort());
    expect(asset.derivedFromPack).toBe("cbv1-901-open-pack");
  });

  it("블록의 키 목록이 양쪽에서 같다: 키가 하나라도 빠지면 웹 로더가 거부하고, 모르는 키가 더해지면 로더는 무시하지만 CI 판정이 불일치로 잡는다", () => {
    const stamped = planRenderManifestRights(ledger, renderManifest([renderSlot("open")])).stamped.assets[0];
    expect(parseStudioBundleCatalog(renderManifest([stamped]))).toHaveLength(1);
    for (const key of RENDER_RIGHTS_KEYS) {
      const missing = {...stamped.rights};
      delete missing[key];
      expect(() => parseStudioBundleCatalog(renderManifest([{...stamped, rights: missing}])), `${key} 누락`).toThrow();
    }
    const extra = {...stamped, rights: {...stamped.rights, extra: 1}};
    expect(parseStudioBundleCatalog(renderManifest([extra]))).toHaveLength(1);
    expect(planRenderManifestRights(ledger, renderManifest([extra])).problems.map((problem) => problem.code)).toEqual(["rights-drift"]);
  });

  it("초안 판정이 양쪽에서 같다 (curationStatus가 draft로 시작할 때만 건너뛴다)", () => {
    const statuses = ["draft-pending-render", "draft", "Draft", " draft", "drafting-notes", "selected-after-visual-triage", "rejected", "unreviewed"];
    for (const curationStatus of statuses) {
      const slot = planRenderManifestRights(ledger, renderManifest([renderSlot("open", { curationStatus })])).stamped.assets[0];
      const draft = isDraftRenderSlot(slot);
      // 초안이면 CI가 블록을 지웠으므로 로더가 보지도 않고, 초안이 아니면 블록이 있어 전달된다. 어느 쪽이든 로더의 결과는 판정과 일치해야 한다.
      expect(Object.hasOwn(slot, "rights"), curationStatus).toBe(!draft);
      expect(parseStudioBundleCatalog(renderManifest([slot])).length, curationStatus).toBe(draft ? 0 : 1);
      // 블록이 낡아서 남아 있어도 로더는 초안 슬롯을 전달하지 않는다.
      const withStaleBlock = {...renderSlot("open", {curationStatus}), rights: planRenderManifestRights(ledger, renderManifest([renderSlot("open")])).stamped.assets[0].rights};
      expect(parseStudioBundleCatalog(renderManifest([withStaleBlock])).length, `${curationStatus} (낡은 블록)`).toBe(draft ? 0 : 1);
    }
  });

  /**
   * 건전성: CI 판정이 문제를 하나도 보고하지 않은 매니페스트에 대해서는 웹 로더가 던지지 않고(가용성), CI가 전달 대상으로 본 슬롯만 정확히 전달한다
   * (권리). 문제를 보고한 슬롯은 CI가 병합을 막으므로 로더 동작에 제약을 두지 않는다 — 단, 문제 없는 슬롯이 문제 있는 이웃 때문에 달라지지는 않는다.
   * 변조·실수 입력 모음마다 이 두 성질을 확인해, 한쪽 규칙만 느슨해져 CI는 초록인데 로더가 닫힌 팩을 전달하거나 카탈로그 전체를 던지는 틈을 막는다.
   */
  const open = () => planRenderManifestRights(ledger, renderManifest([renderSlot("open")])).slots[0].expected;
  const stamped = (key, overrides = {}) => ({...renderSlot(key, overrides), rights: open()});
  const corpus = [
    ["열린 팩 스탬프됨", [stamped("open")]],
    ["열린 팩 스탬프 전", [renderSlot("open")]],
    ["열린 군중 팩 스탬프됨", [{...renderSlot("crowd"), rights: planRenderManifestRights(ledger, renderManifest([renderSlot("crowd")])).slots[0].expected}]],
    ["닫힌 팩 슬롯", [renderSlot("hold")]],
    ["닫힌 팩 슬롯에 열린 팩 블록 복사", [stamped("hold")]],
    ["증빙 없는 allow 팩 슬롯에 블록 복사", [stamped("bare")]],
    ["pending 묶음 팩 슬롯에 블록 복사", [stamped("pending")]],
    ["비상업 grant 팩 슬롯에 블록 복사", [stamped("noncommercial")]],
    ["원장에 없는 팩 번호 + 블록", [stamped("open", {derivedFromPack: "cbv1-999-unregistered"})]],
    ["파생 팩 번호 없음 + 블록", [stamped("open", {derivedFromPack: undefined})]],
    ["파생 팩 번호 빈 문자열 + 블록", [stamped("open", {derivedFromPack: ""})]],
    ["제작사 불일치", [stamped("open", {license: {...renderSlot("open").license, provider: "RG Poly"}})]],
    ["다른 슬롯 파일을 가리킴", [stamped("open", {path: "assets/slot-hold-001/prop.webp"}), renderSlot("hold")]],
    ["미리보기가 다른 슬롯 파일", [stamped("open", {previewPath: "assets/slot-hold-001/thumbnail.webp"}), renderSlot("hold")]],
    ["하위 폴더 경로", [stamped("open", {path: "assets/slot-open-001/nested/prop.webp"})]],
    ["본 이미지가 webp가 아님", [stamped("open", {path: "assets/slot-open-001/prop.png"})]],
    ["미리보기는 png", [stamped("open", {previewPath: "assets/slot-open-001/thumbnail.png"})]],
    ["대문자 슬롯 id", [stamped("open", {id: "Slot-Upper-001", path: "assets/Slot-Upper-001/prop.webp", previewPath: "assets/Slot-Upper-001/thumbnail.webp"})]],
    ["한글 슬롯 id", [stamped("open", {id: "슬롯-001", path: "assets/슬롯-001/prop.webp", previewPath: "assets/슬롯-001/thumbnail.webp"})]],
    ["중복 슬롯 id", [stamped("open"), stamped("open")]],
    ["초안에 블록", [{...renderDraftSlot("open"), rights: open()}]],
    ["대문자 Draft 상태 + 블록", [stamped("open", {curationStatus: "Draft-pending"})]],
    ["공백으로 시작하는 draft 상태", [stamped("open", {curationStatus: " draft"})]],
    ["블록 licenseName 변조", [stamped("open", {})].map((slot) => ({...slot, rights: {...slot.rights, licenseName: "Edited"}}))],
    ["블록 ledgerPackId 변조", [stamped("open", {})].map((slot) => ({...slot, rights: {...slot.rights, ledgerPackId: "gen-hold"}}))],
    ["블록 serve hold", [stamped("open", {})].map((slot) => ({...slot, rights: {...slot.rights, serve: "hold"}}))],
    ["블록 status 변조", [stamped("open", {})].map((slot) => ({...slot, rights: {...slot.rights, status: "free"}}))],
    ["블록 commercialUse 거짓", [stamped("open", {})].map((slot) => ({...slot, rights: {...slot.rights, commercialUse: false}}))],
    ["블록 attributionRequired 참", [stamped("open", {})].map((slot) => ({...slot, rights: {...slot.rights, attributionRequired: true}}))],
    ["블록에 모르는 키", [stamped("open", {})].map((slot) => ({...slot, rights: {...slot.rights, extra: 1}}))],
    ["블록이 객체가 아님", [stamped("open", {rights: "allow"})].map((slot) => ({...slot, rights: "allow"}))],
    ["열린 슬롯 옆의 닫힌 슬롯", [stamped("open"), renderSlot("hold")]],
    ["열린 슬롯 옆의 변조된 슬롯", [stamped("open"), stamped("hold")]],
  ];

  it.each(corpus)("건전성 — %s", (_label, assets) => {
    const manifest = renderManifest(assets);
    const plan = planRenderManifestRights(ledger, manifest);
    const flagged = new Set(plan.problems.map((problem) => problem.slotId));
    let delivered;
    try {
      delivered = parseStudioBundleCatalog(manifest).map((asset) => asset.id);
    } catch (error) {
      // 가용성: CI가 아무 문제도 보고하지 않은 매니페스트를 웹 로더가 던지면 안 된다(카탈로그 전체가 막힌다).
      expect(plan.problems, `CI는 통과인데 웹 로더가 던졌습니다: ${error instanceof Error ? error.message : String(error)}`).not.toEqual([]);
      return;
    }
    for (const slot of plan.slots) {
      if (slot.slotId === null || flagged.has(slot.slotId)) continue;
      expect(delivered.includes(slot.slotId), `${slot.slotId}: 로더 전달 여부가 CI 판정(deliverable=${slot.deliverable})과 다릅니다`).toBe(slot.deliverable);
    }
    // 권리: 로더가 전달한 슬롯은 CI가 문제 없이 전달 대상으로 본 슬롯이거나, 문제로 보고된 슬롯이다 — 보고도 없고 전달 대상도 아닌 슬롯은 나가지 않는다.
    for (const id of delivered) {
      const slot = plan.slots.find((candidate) => candidate.slotId === id);
      expect(slot?.deliverable === true || flagged.has(id), `${id}: CI가 닫았다고 본 슬롯을 로더가 전달했습니다`).toBe(true);
    }
  });

  it("커밋된 렌더 매니페스트는 CI 판정을 통과하고 웹 로더가 전달하는 슬롯이 없다 (전부 초안)", () => {
    const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, RENDER_PACK_DIR, RENDER_MANIFEST_FILE), "utf8"));
    const plan = planRenderManifestRights(loadPackRightsLedger(), manifest);
    expect(plan.problems).toEqual([]);
    expect(parseStudioBundleCatalog(manifest)).toEqual([]);
    expect(plan.slots.filter((slot) => slot.deliverable)).toEqual([]);
  });
});
