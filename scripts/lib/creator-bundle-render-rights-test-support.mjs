/**
 * 렌더 권리 연동 테스트 지원: 합성 원장과 렌더 슬롯 픽스처.
 * creator-bundle-render-rights.test.mjs(판정·CLI)와 creator-bundle-render-rights-parity.test.mjs(CI 판정 ↔ 웹 로더 정합)가 같은 픽스처를 쓴다.
 */
import { fixtureLedger, ledgerEntry } from "./creator-bundle-pack-rights-test-support.mjs";

/** 합성 원장의 공식 카탈로그 번호. 생성기 번호(`gen-<키>`)와 일부러 다르게 둔다 — 렌더 슬롯은 공식 번호를 쓴다. */
export const RENDER_OFFICIAL_IDS = Object.freeze({
  open: "cbv1-901-open-pack",
  crowd: "cbv1-902-open-crowd",
  hold: "cbv1-903-hold-pack",
  bare: "cbv1-904-allow-without-evidence",
  pending: "cbv1-905-pending-pack",
  noncommercial: "cbv1-906-noncommercial-pack",
});

/**
 * 팩 6개짜리 합성 원장: 열린 팩·열린 군중 팩·hold·증빙 없는 allow·pending allow·비상업 grant.
 * 증빙 없는 allow와 pending allow는 검증기가 거부하는 항목이라(서빙 판정은 검증을 거치지 않은 값도 닫는지 보려고 둔다),
 * 검증을 통과해야 하는 시험은 validRenderLedger()를 쓴다.
 */
export function renderLedger() {
  const make = (key, { title, group = "pack", serve = "allow", evidence, grant } = {}) => {
    const entry = ledgerEntry({
      title, creator: "EmaceArt", catalogIds: [`gen-${key}`], group, licenseClass: "unstated-emaceart", serve, evidence, grant,
    });
    entry.officialCatalogIds = [RENDER_OFFICIAL_IDS[key]];
    return entry;
  };
  return fixtureLedger([
    make("open", { title: "Open Pack" }),
    make("crowd", { title: "Open Crowd", group: "crowd" }),
    make("hold", { title: "Hold Pack", serve: "hold" }),
    make("bare", { title: "Allow Without Evidence", evidence: [] }),
    make("pending", { title: "Pending Pack", group: "pending" }),
    make("noncommercial", {
      title: "Noncommercial Pack",
      grant: { status: "licensed", licenseName: "Fixture noncommercial license", commercialUse: false, attributionRequired: false },
    }),
  ]);
}

/** 검증기를 통과하는 합성 원장(CLI·검증기 시험용): 증빙 없는 allow와 pending allow를 뺀다. */
export function validRenderLedger() {
  const ledger = renderLedger();
  ledger.packs = ledger.packs.filter((entry) => !["gen-bare", "gen-pending"].includes(entry.id));
  return ledger;
}

/** 웹 로더의 전수 검증을 통과하는 완성 슬롯(권리 블록은 없다 — 스탬프 전 상태). */
export const renderSlot = (key, overrides = {}) => ({
  id: `slot-${key}-001`,
  name: `Fixture ${key} render`,
  kind: "prop-image",
  category: "rendered-prop",
  path: `assets/slot-${key}-001/prop.webp`,
  previewPath: `assets/slot-${key}-001/thumbnail.webp`,
  sha256: "a".repeat(64),
  bytes: 4096,
  width: 1536,
  height: 1536,
  renderResolution: [1536, 1536],
  curationStatus: "selected-after-visual-triage",
  visualReviewed: true,
  derivedFromPack: RENDER_OFFICIAL_IDS[key],
  license: {
    id: "EmaceArt-Asset-License",
    provider: "EmaceArt",
    sourceUrl: "https://itch.io/b/3905/creator-bundle-volume-1",
    commercialUse: true,
    redistributionAllowed: false,
    inServiceOnly: true,
    checkedOn: "2026-10-20",
  },
  ...overrides,
});

export const renderDraftSlot = (key, overrides = {}) => renderSlot(key, {
  curationStatus: "draft-pending-render",
  sha256: null,
  bytes: null,
  ...overrides,
});

export const renderManifest = (assets) => ({
  schema: "toonstudio.asset-delivery.v1",
  pack: { id: "bundle-renders-v1", title: "Creator Bundle 렌더 소품", inServiceOnly: true, downloadable: false },
  assets,
});
