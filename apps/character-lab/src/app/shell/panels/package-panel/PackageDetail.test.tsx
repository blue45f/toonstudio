// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CHARACTER_SLOT_KINDS } from "../../../../contracts";
import { buildPackagePlanDetailed } from "../../../../domains/authored/package-plan";
import { FIXTURE_GLB_SHA256, characterPackageManifestFixture } from "../../../../testing/manifest-fixtures";

import { PackageDetail, shortSha } from "./PackageDetail";

import type { PackageReadyState } from "./PackageDetail";

function readyState(): PackageReadyState {
  const manifest = characterPackageManifestFixture({
    glbBytes: 3,
    characterLab: { slotCapabilities: { ears: { status: "partial", reasonKo: "소품 없음" }, top: { status: "available" } } },
  });
  const built = buildPackagePlanDetailed(manifest, "/assets/characters/mina", {
    glbSha256: FIXTURE_GLB_SHA256, glbBytes: 3,
  }, { licenseNote: "자체 제작 fixture", now: 1 });
  if (!built.ok) throw new Error(built.failure.reasonKo);
  const { mappings } = built.judgement;
  return {
    phase: "ready", applied: "registry", vrm: null, vrmNoteKo: "GLB에 VRM 확장 없음",
    result: {
      ok: true, plan: built.plan,
      detail: {
        judgement: {
          ...built.judgement,
          mappings: {
            shapeKeys: { ...mappings.shapeKeys, unmapped: [] },
            bones: { ...mappings.bones, unmapped: [] },
            meshes: { ...mappings.meshes, unknown: [] },
          },
        },
        hairLod: built.hairLod, conversion: null, gaps: [], warnings: [],
        glbBytes: new Uint8Array([1, 2, 3]), observedSha256: FIXTURE_GLB_SHA256,
      },
    },
  };
}

afterEach(cleanup);

describe("PackageDetail 표시 계약", () => {
  it.each([
    [undefined, "-"], [null, "-"], ["", "-"],
    ["0123456789abcdef", "0123456789ab…"],
  ])("SHA %s의 기존 요약 표기를 유지한다", (value, expected) => {
    expect(shortSha(value)).toBe(expected);
  });

  it.each([
    ["registry", "플랜을 등록했습니다(엔진이 준비되면 적용 루프가 올립니다)"],
    ["engine", "엔진에 올렸습니다"],
  ] as const)("%s 적용 결과와 검증 SHA·바이트·품질·라이선스를 그대로 표시한다", (applied, message) => {
    render(<PackageDetail state={{ ...readyState(), applied }} />);
    const status = screen.getByRole("status").textContent;
    expect(status).toContain(message);
    expect(status).toContain(`GLB SHA-256 ${FIXTURE_GLB_SHA256.slice(0, 12)}… 검증 일치`);
    expect(status).toContain("3 B");
    expect(screen.getByText("0.91 / 최소 0.8 · 통과")).toBeTruthy();
    expect(screen.getByText("자체 제작 fixture")).toBeTruthy();
    expect(screen.getByText("GLB에 VRM 확장 없음")).toBeTruthy();
  });

  it("모든 슬롯의 선언·규칙 차이와 미지원 사유를 누락하지 않는다", () => {
    const { container } = render(<PackageDetail state={readyState()} />);
    const table = screen.getByRole("table");
    expect(table.className).toBe("cl-package-capabilities");
    expect(within(table).getAllByRole("row")).toHaveLength(CHARACTER_SLOT_KINDS.length + 1);
    expect(Array.from(container.querySelectorAll("tr[data-slot]")).map((row) => row.getAttribute("data-slot"))).toEqual(CHARACTER_SLOT_KINDS);
    const ears = container.querySelector('tr[data-slot="ears"]');
    expect(ears?.getAttribute("data-status")).toBe("partial");
    expect(ears?.textContent).toContain("부분 지원선언 (규칙 판정: 지원)소품 없음");
    const top = container.querySelector('tr[data-slot="top"]');
    expect(top?.textContent).toContain("선언 (규칙 판정: 미지원)");
    expect(within(table).getByText(/불일치 2개/u)).toBeTruthy();
  });

  it("경고·패키지 격차·규약 밖 세 종류 이름의 사유를 그대로 노출한다", () => {
    const state = readyState();
    const { detail } = state.result;
    const { mappings } = detail.judgement;
    render(<PackageDetail state={{ ...state, result: { ...state.result, detail: {
      ...detail, warnings: ["선언 파일 확인 필요"],
      gaps: [{ id: "fixture-gap", severity: "medium", summary: "리그 확인 필요" }],
      judgement: { ...detail.judgement, mappings: {
        shapeKeys: { ...mappings.shapeKeys, unmapped: [{ name: "shape", reasonKo: "형태 키 미매핑" }] },
        bones: { ...mappings.bones, unmapped: [{ name: "bone", reasonKo: "본 미매핑" }] },
        meshes: { ...mappings.meshes, unknown: [{ name: "mesh", reasonKo: "메시 미분류" }] },
      } },
    } } }} />);
    expect(within(screen.getByRole("list", { name: "경고" })).getByText("선언 파일 확인 필요")).toBeTruthy();
    expect(screen.getByText("[medium] fixture-gap: 리그 확인 필요")).toBeTruthy();
    expect(screen.getByText("shape key 형태 키 미매핑")).toBeTruthy();
    expect(screen.getByText("본 본 미매핑")).toBeTruthy();
    expect(screen.getByText("메시 메시 미분류")).toBeTruthy();
    expect(screen.getByText("패키지 격차 1개").closest("details")?.open).toBe(false);
    expect(screen.getByText("규약 밖 이름(사유)").closest("details")?.open).toBe(false);
  });

  it("경고·격차·규약 밖 이름이 없으면 빈 진단 블록을 만들지 않는다", () => {
    const { container } = render(<PackageDetail state={readyState()} />);
    expect(screen.queryByRole("list", { name: "경고" })).toBeNull();
    expect(container.querySelector(".cl-package-gaps")).toBeNull();
    expect(container.querySelector(".cl-package-unmapped")).toBeNull();
  });

  it("VRM이 있으면 저자·라이선스·본·표정 정보를 대체 문구 대신 표시한다", () => {
    render(<PackageDetail state={{ ...readyState(), vrm: {
      specVersion: "1.0", family: "vrm-1.0", expressions: ["happy", "blink"],
      humanoid: { hips: 0 }, humanoidMissingRequired: [], unknownHumanBones: [],
      meta: {
        name: "Fixture Avatar", version: "1", authors: ["Fixture Author"],
        licenseUrl: null, licenseName: "자체 제작", commercialUsage: null,
        allowRedistribution: null, modification: null,
      },
    } }} />);
    expect(screen.getByText("vrm-1.0 · Fixture Avatar · 저자 Fixture Author · 라이선스 자체 제작 · humanoid 1본 · 표정 2개")).toBeTruthy();
    expect(screen.queryByText("GLB에 VRM 확장 없음")).toBeNull();
  });
});
