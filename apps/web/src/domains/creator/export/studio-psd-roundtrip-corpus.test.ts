/**
 * PSD 라운드트립 회귀 코퍼스 — 가져오기 → (편집 없이) 재내보내기 → 다시 가져오기.
 *
 * 픽스처는 studio-psd-roundtrip-corpus.ts의 명세에서 매 실행마다 재생성한다(바이너리 미커밋).
 * 다리(leg) 구성:
 *  A. 직렬화 왕복 — 픽스처 바이트를 ag-psd로 읽고 다시 써서 구조·픽셀이 같은지 본다.
 *     (제품이 의존하는 파서/직렬화기 자체의 대칭성을 고정)
 *  B. 제품 가져오기 — 실제 importPsdFile로 Studio 요소·손실 명세를 단언한다.
 *  C. 제품 왕복 — 가져온 요소를 실제 exportPagePsd로 다시 쓰고 다시 가져와 안정성을 본다.
 *  D. Studio 텍스트 — Studio 텍스트 요소가 PSD descriptor를 거쳐 편집본으로 돌아오는지 본다.
 * 현재 보존되지 않는 속성은 실패로 숨기지 않고 "known-gap" 절에 현재 거동 그대로 고정한다.
 * 거동이 좋아지면 그 테스트가 깨지는 것이 정상이며, 갭 목록을 함께 갱신해야 한다.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { readPsd, writePsd, type Layer, type PixelData, type Psd } from "ag-psd";

import {
  importPsdFile,
  type PsdImportedElement,
  type PsdImportResult,
} from "../studio-psd-import";
import { exportPagePsd, type PsdExportEl, type PsdTextElLike } from "./studio-psd-export";
import {
  buildPsdFixtureBytes,
  coordPixels,
  decodePngDataUrl,
  fixtureById,
  installPsdRoundtripCanvas,
  PsdPixelCanvas,
  rasterizePsdMasksForCorpus,
  solidPixels,
  PSD_ROUNDTRIP_FIXTURES,
  type PsdRoundtripFixture,
} from "./studio-psd-roundtrip-corpus";

import type Konva from "konva";

beforeAll(() => {
  installPsdRoundtripCanvas();
});

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────────

const OPACITY_BYTE = 1 / 255;

function expectPixelsClose(actual: PixelData, expected: PixelData, tolerance: number, label: string): void {
  expect(actual.width, `${label}: 너비`).toBe(expected.width);
  expect(actual.height, `${label}: 높이`).toBe(expected.height);
  let worst = 0;
  let worstAt = "";
  for (let i = 0; i < expected.data.length; i += 1) {
    const diff = Math.abs(actual.data[i]! - expected.data[i]!);
    if (diff > worst) {
      worst = diff;
      const pixel = Math.floor(i / 4);
      worstAt = `(${pixel % expected.width},${Math.floor(pixel / expected.width)}) 채널 ${i % 4}`;
    }
  }
  expect(worst, `${label}: 최대 채널 오차 ${worstAt}`).toBeLessThanOrEqual(tolerance);
}

function readFixtureBytes(bytes: ArrayBuffer): Psd {
  return readPsd(bytes, {
    useImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
    skipLinkedFilesData: true,
  });
}

async function importBytes(bytes: ArrayBuffer, name: string, targetWidth: number): Promise<PsdImportResult> {
  return importPsdFile(new File([bytes], name), targetWidth, {
    rasterizeMaskImpl: rasterizePsdMasksForCorpus,
  });
}

function importFixture(fixture: PsdRoundtripFixture): Promise<PsdImportResult> {
  return importBytes(buildPsdFixtureBytes(fixture), `${fixture.id}.psd`, fixture.width);
}

interface LayerSummary {
  name: string;
  bounds: readonly [number, number, number, number];
  opacityByte: number;
  blendMode: string;
  clipping: boolean;
  hidden: boolean;
  hasMask: boolean;
  maskDisabled: boolean;
  adjustmentType: string | null;
  hasEffects: boolean;
  text: string | null;
  pixelDigest: number;
  children: LayerSummary[];
}

function pixelDigest(data: PixelData["data"]): number {
  // FNV-1a — 픽셀 전체 동등성을 한 숫자로 비교하기 위한 검증용 다이제스트.
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i += 1) {
    hash ^= data[i]!;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function summarizeLayer(layer: Layer): LayerSummary {
  return {
    name: layer.name ?? "",
    bounds: [layer.left ?? 0, layer.top ?? 0, layer.right ?? 0, layer.bottom ?? 0],
    opacityByte: Math.round((layer.opacity ?? 1) * 255),
    blendMode: layer.blendMode ?? "normal",
    clipping: !!layer.clipping,
    hidden: !!layer.hidden,
    hasMask: !!layer.mask,
    maskDisabled: !!layer.mask?.disabled,
    adjustmentType: layer.adjustment?.type ?? null,
    hasEffects: !!layer.effects,
    text: layer.text?.text ?? null,
    pixelDigest: layer.imageData ? pixelDigest(layer.imageData.data) : 0,
    children: (layer.children ?? []).map(summarizeLayer),
  };
}

function summarizePsd(psd: Psd): LayerSummary[] {
  return (psd.children ?? []).map(summarizeLayer);
}

function elementByName(result: PsdImportResult, name: string): PsdImportedElement {
  const element = result.elements.find((entry) => entry.name === name);
  if (!element) throw new Error(`가져온 요소에 ${name}이 없어요.`);
  return element;
}

function decisionOf(result: PsdImportResult, feature: string, disposition: string) {
  return result.lossManifest?.decisions.find(
    (decision) => decision.feature === feature && decision.disposition === disposition,
  );
}

// ── A. 직렬화 왕복 ───────────────────────────────────────────────────────────

describe("A. ag-psd 직렬화 왕복 (파서·직렬화기 대칭성)", () => {
  it("모든 픽스처가 읽고 다시 써도 구조·픽셀이 동일하다 (멱등)", () => {
    for (const fixture of PSD_ROUNDTRIP_FIXTURES) {
      const bytes = buildPsdFixtureBytes(fixture);
      const first = summarizePsd(readFixtureBytes(bytes));
      const rewritten = writePsd(readFixtureBytes(bytes), { noBackground: true });
      const second = summarizePsd(readFixtureBytes(rewritten));
      expect(second, `픽스처 ${fixture.id}`).toEqual(first);
    }
  });

  it("코퍼스 무결성 — id가 유일하고 생성 바이트가 결정적이다", () => {
    const ids = PSD_ROUNDTRIP_FIXTURES.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const fixture of PSD_ROUNDTRIP_FIXTURES) {
      const a = new Uint8Array(buildPsdFixtureBytes(fixture));
      const b = new Uint8Array(buildPsdFixtureBytes(fixture));
      expect(b.length).toBe(a.length);
      expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
    }
  });

  it("flat-basic — 이름·순서·경계·픽셀이 그대로다", () => {
    const fixture = fixtureById("flat-basic");
    const psd = readFixtureBytes(buildPsdFixtureBytes(fixture));
    expect(psd.children?.map((layer) => layer.name)).toEqual(["전경 점", "중간 도형", "배경판"]);
    const front = psd.children![0]!;
    expect([front.left, front.top, front.right, front.bottom]).toEqual([10, 1, 14, 5]);
    expectPixelsClose(psd.children![2]!.imageData!, coordPixels(16, 12), 0, "배경판 픽셀");
  });

  it("blend-opacity — 블렌드·클리핑·숨김이 직렬화에서는 전부 보존된다", () => {
    const fixture = fixtureById("blend-opacity");
    const psd = readFixtureBytes(buildPsdFixtureBytes(fixture));
    const byName = new Map((psd.children ?? []).map((layer) => [layer.name, layer]));
    expect(byName.get("곱하기")?.blendMode).toBe("multiply");
    // KG-10: PSD 불투명도는 8-bit로 저장돼 0.5가 128/255로 양자화된다.
    expect(byName.get("곱하기")?.opacity).toBe(128 / 255);
    expect(byName.get("디졸브")?.blendMode).toBe("dissolve");
    expect(byName.get("숨김 베이스")?.hidden).toBe(true);
    expectPixelsClose(byName.get("반투명")!.imageData!, coordPixels(8, 8, 128), 0, "반투명 픽셀");
  });

  it("groups-nested — 그룹 계층·블렌드·불투명도가 직렬화에서는 보존된다", () => {
    const fixture = fixtureById("groups-nested");
    const psd = readFixtureBytes(buildPsdFixtureBytes(fixture));
    const outer = psd.children![0]!;
    expect(outer.name).toBe("외부");
    expect(outer.blendMode).toBe("pass through");
    expect(outer.opacity).toBeCloseTo(0.8, 2);
    const inner = outer.children![0]!;
    expect(inner.name).toBe("내부");
    expect(inner.blendMode).toBe("multiply");
    expect(inner.children![0]!.name).toBe("안쪽 리프");
  });

  it("mask-basic — 마스크 채널 픽셀·비활성 플래그가 보존된다", () => {
    const fixture = fixtureById("mask-basic");
    const psd = readFixtureBytes(buildPsdFixtureBytes(fixture));
    const masked = psd.children![0]!;
    expect(masked.mask?.imageData).toBeDefined();
    const gradient = fixture.build().children![0]!.mask!.imageData!;
    expectPixelsClose(masked.mask!.imageData!, gradient, 0, "마스크 그라데이션");
    expect(psd.children![1]!.mask?.disabled).toBe(true);
  });

  it("adjustment-effects — 조정 타입과 효과가 직렬화에서는 보존된다", () => {
    const fixture = fixtureById("adjustment-effects");
    const psd = readFixtureBytes(buildPsdFixtureBytes(fixture));
    expect(psd.children![0]!.adjustment?.type).toBe("brightness/contrast");
    expect(psd.children![1]!.effects?.dropShadow?.length).toBe(1);
  });

  it("text-basic — 텍스트 내용·크기·색이 직렬화에서는 보존된다", () => {
    const fixture = fixtureById("text-basic");
    const psd = readFixtureBytes(buildPsdFixtureBytes(fixture));
    const caption = psd.children![0]!;
    expect(caption.text?.text.replace(/\r\n?/gu, "\n")).toBe("안녕\n세계");
    expect(caption.text?.style?.fontSize).toBe(18);
    const fill = caption.text?.style?.fillColor;
    expect(Math.abs((fill?.r ?? 0) - 12)).toBeLessThanOrEqual(1);
    expect(Math.abs((fill?.g ?? 0) - 34)).toBeLessThanOrEqual(1);
    expect(Math.abs((fill?.b ?? 0) - 56)).toBeLessThanOrEqual(1);
    expect(psd.children![1]!.text?.orientation).toBe("vertical");
  });
});

// ── B. 제품 가져오기 ─────────────────────────────────────────────────────────

describe("B. 제품 가져오기 (importPsdFile)", () => {
  it("flat-basic — Studio 순서(뒤→앞)·경계·픽셀이 보존된다", async () => {
    const result = await importFixture(fixtureById("flat-basic"));
    expect(result.elements.map((element) => element.name)).toEqual(["배경판", "중간 도형", "전경 점"]);
    const front = elementByName(result, "전경 점");
    expect([front.x, front.y, front.width, front.height]).toEqual([10, 1, 4, 4]);
    expectPixelsClose(decodePngDataUrl(front.src), coordPixels(4, 4), 0, "전경 점 src");
    expect(result.skipped).toEqual([]);
    expect(decisionOf(result, "layers", "preserved")?.count).toBe(3);
  });

  it("blend-opacity — 지원 블렌드는 매핑되고 숨김·불투명도가 전파된다", async () => {
    const result = await importFixture(fixtureById("blend-opacity"));
    expect(result.elements.map((element) => element.name)).toEqual([
      "숨김 베이스", "반투명", "디졸브", "스크린", "곱하기",
    ]);
    expect(elementByName(result, "숨김 베이스").hidden).toBe(true);
    expect(elementByName(result, "곱하기").blendMode).toBe("multiply");
    expect(elementByName(result, "곱하기").opacity).toBeCloseTo(0.5, 2);
    expect(elementByName(result, "스크린").blendMode).toBe("screen");
    expect(elementByName(result, "스크린").opacity).toBeCloseTo(0.75, 2);
    expectPixelsClose(decodePngDataUrl(elementByName(result, "반투명").src), coordPixels(8, 8, 128), 0, "반투명 src");
  });

  it("clipping — 아래 레이어 클리핑이 clipBelow로 보존된다", async () => {
    const result = await importFixture(fixtureById("clipping"));
    expect(result.elements.map((element) => element.name)).toEqual(["기준 레이어", "잘릴 레이어"]);
    expect(elementByName(result, "잘릴 레이어").clipBelow).toBe(true);
    expect(decisionOf(result, "clipping", "preserved")?.count).toBe(1);
  });

  it("groups-nested — 폴더 경로가 보존되고 그룹 불투명도가 자식에 누적된다", async () => {
    const result = await importFixture(fixtureById("groups-nested"));
    expect(result.elements.map((element) => element.name)).toEqual(["바깥 리프", "안쪽 리프"]);
    expect(elementByName(result, "바깥 리프").opacity).toBeCloseTo(0.8, 2);
    expect(elementByName(result, "안쪽 리프").opacity).toBeCloseTo(0.4, 2);
    expect(elementByName(result, "안쪽 리프").psdFolderPath?.map((folder) => folder.name)).toEqual(["외부", "내부"]);
    expect(result.groups?.map((group) => group.name)).toEqual(["외부", "외부 / 내부"]);
    expect(decisionOf(result, "groups", "preserved")?.count).toBe(2);
  });

  it("mask-basic — 마스크가 편집 가능한 알파 PNG로 보존되고 비활성 상태가 전파된다", async () => {
    const result = await importFixture(fixtureById("mask-basic"));
    const masked = elementByName(result, "마스크 레이어");
    expect(masked.maskSrc).toBeDefined();
    const decoded = decodePngDataUrl(masked.maskSrc!);
    // 마스크 알파 = 그라데이션 샘플 (x=0 → 0, x=7 → 255), RGB는 흰색 고정.
    expect(decoded.data[3]).toBe(0);
    expect(decoded.data[(7 * 4) + 3]).toBe(255);
    expect(decoded.data[(3 * 4) + 3]).toBeGreaterThanOrEqual(108);
    expect(decoded.data[(3 * 4) + 3]).toBeLessThanOrEqual(110);
    expect([decoded.data[0], decoded.data[1], decoded.data[2]]).toEqual([255, 255, 255]);
    const disabled = elementByName(result, "마스크 꺼짐");
    expect(disabled.maskSrc).toBeDefined();
    expect(disabled.maskEnabled).toBe(false);
    expect(decisionOf(result, "layer-mask", "preserved")?.count).toBe(2);
  });

  it("text-basic — 래스터가 보존되고 단순 서식만 숨은 편집본이 생긴다", async () => {
    const result = await importFixture(fixtureById("text-basic"));
    expect(result.elements.map((element) => element.name)).toEqual(["세로 글자", "자막"]);
    expect(result.editableTextElements).toHaveLength(1);
    const editable = result.editableTextElements![0]!;
    expect(editable).toMatchObject({
      type: "text",
      text: "안녕\n세계",
      fontSize: 18,
      fill: "#0c2238",
      hidden: true,
      psdRasterSourceId: elementByName(result, "자막").id,
    });
    expect(decisionOf(result, "text", "rasterized")?.count).toBe(2);
  });

  it("empty-doc — 요소 없이 건너뜀 고지만 남는다", async () => {
    const result = await importFixture(fixtureById("empty-doc"));
    expect(result.elements).toEqual([]);
    // 레이어 없는 문서를 ag-psd로 읽으면 크기 0인 빈 레이어 기록 1개가 잡혀 그 건너뜀만 고지된다.
    expect(result.skipped).toEqual(["레이어 1: 크기가 0이라 건너뜀"]);
  });
});

// ── C. 제품 왕복 ─────────────────────────────────────────────────────────────

interface FakeStageBundle {
  stage: Konva.Stage;
}

function toExportElement(element: PsdImportedElement): PsdExportEl {
  return {
    id: element.id,
    type: "image",
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    ...(element.name ? { name: element.name } : {}),
    ...(element.opacity !== undefined ? { opacity: element.opacity } : {}),
    ...(element.blendMode ? { blendMode: element.blendMode } : {}),
    ...(element.clipBelow ? { clipBelow: true } : {}),
    ...(element.groupId ? { groupId: element.groupId } : {}),
    ...(element.psdGroupId ? { psdGroupId: element.psdGroupId } : {}),
    ...(element.psdFolderPath ? { psdFolderPath: element.psdFolderPath } : {}),
    ...(element.maskSrc ? { maskSrc: element.maskSrc } : {}),
    ...(element.maskEnabled === false ? { maskEnabled: false } : {}),
  };
}

/** 마스크가 적용된 렌더 결과 — Konva가 마스크 래퍼 안에서 그리는 최종 픽셀과 같다. */
function renderedCanvasFor(element: PsdImportedElement): PsdPixelCanvas {
  const source = decodePngDataUrl(element.src);
  const canvas = new PsdPixelCanvas(source.width, source.height);
  canvas.pixels.set(source.data);
  if (element.maskSrc && element.maskEnabled !== false) {
    const mask = decodePngDataUrl(element.maskSrc);
    for (let i = 0; i < canvas.pixels.length; i += 4) {
      canvas.pixels[i + 3] = Math.round((canvas.pixels[i + 3]! * mask.data[i + 3]!) / 255);
    }
  }
  return canvas;
}

function fakeStageFor(elements: readonly PsdImportedElement[]): FakeStageBundle {
  const nodes = elements.map((element) => {
    const rect = { x: element.x, y: element.y, width: element.width, height: element.height };
    const rendered = renderedCanvasFor(element);
    let composite = "source-over";
    const base = {
      getAttr: (name: string) => (name === "studioElementId" ? element.id : undefined),
      getClientRect: () => rect,
      globalCompositeOperation: (value?: string) => {
        if (value !== undefined) composite = value;
        return composite;
      },
    };
    if (element.maskSrc && element.maskEnabled !== false) {
      const wrapper = {
        getAttr: (name: string) => (name === "studioLayerMaskOwnerId" ? element.id : undefined),
        getClientRect: () => rect,
        getParent: () => null,
        toCanvas: () => rendered as unknown as HTMLCanvasElement,
      };
      return { ...base, getParent: () => wrapper, toCanvas: () => rendered as unknown as HTMLCanvasElement };
    }
    return { ...base, getParent: () => null, toCanvas: () => rendered as unknown as HTMLCanvasElement };
  });
  const stage = {
    findOne: (predicate: (node: (typeof nodes)[number]) => boolean) => nodes.find(predicate),
  } as unknown as Konva.Stage;
  return { stage };
}

interface RoundtripOutcome {
  first: PsdImportResult;
  second: PsdImportResult;
  exportedSkipped: string[];
  exportedDecisions: PsdImportResult["lossManifest"];
  exportedLayerCount: number;
  exportedBytes: ArrayBuffer;
}

async function roundtrip(fixture: PsdRoundtripFixture): Promise<RoundtripOutcome> {
  const first = await importFixture(fixture);
  // 호출부 계약: 숨김 요소는 Konva 노드가 없어 내보내기 입력에서 제외된다.
  const exportable = first.elements.filter((element) => !element.hidden);
  const { stage } = fakeStageFor(exportable);
  const exported = await exportPagePsd(
    stage,
    exportable.map(toExportElement),
    fixture.width,
    fixture.height,
    1,
    { includeBackground: false, groups: first.groups },
  );
  const exportedBytes = await exported.blob.arrayBuffer();
  const second = await importBytes(exportedBytes, "roundtrip.psd", fixture.width);
  return {
    first,
    second,
    exportedSkipped: exported.skipped,
    exportedDecisions: exported.lossManifest,
    exportedLayerCount: exported.layerCount,
    exportedBytes,
  };
}

describe("C. 제품 왕복 (가져오기 → 재내보내기 → 다시 가져오기)", () => {
  it("flat-basic — 이름·순서·경계·픽셀이 왕복 후에도 그대로다", async () => {
    const fixture = fixtureById("flat-basic");
    const { first, second } = await roundtrip(fixture);
    expect(second.elements.map((element) => element.name)).toEqual(
      first.elements.map((element) => element.name),
    );
    for (const element of first.elements) {
      const again = elementByName(second, element.name!);
      expect([again.x, again.y, again.width, again.height]).toEqual(
        [element.x, element.y, element.width, element.height],
      );
      expectPixelsClose(decodePngDataUrl(again.src), decodePngDataUrl(element.src), 0, `${element.name} 왕복 픽셀`);
    }
  });

  it("blend-opacity — 블렌드·불투명도가 왕복 후에도 안정적이다 (숨김 제외)", async () => {
    const { first, second } = await roundtrip(fixtureById("blend-opacity"));
    expect(second.elements.map((element) => element.name)).toEqual(["반투명", "디졸브", "스크린", "곱하기"]);
    expect(elementByName(second, "곱하기").blendMode).toBe("multiply");
    expect(elementByName(second, "곱하기").opacity).toBeCloseTo(
      elementByName(first, "곱하기").opacity!,
      2,
    );
    expect(elementByName(second, "스크린").opacity).toBeCloseTo(0.75, 2);
  });

  it("clipping — 클리핑 관계가 왕복 후에도 유지된다", async () => {
    const { second } = await roundtrip(fixtureById("clipping"));
    expect(elementByName(second, "잘릴 레이어").clipBelow).toBe(true);
  });

  it("groups-nested — 폴더 경로와 누적 불투명도가 왕복 후에도 유지된다", async () => {
    const { second, exportedBytes } = await roundtrip(fixtureById("groups-nested"));
    expect(second.groups?.map((group) => group.name)).toEqual(["외부", "외부 / 내부"]);
    expect(elementByName(second, "안쪽 리프").opacity).toBeCloseTo(0.4, 2);
    const tree = summarizePsd(readFixtureBytes(exportedBytes));
    expect(tree[0]?.name).toBe("외부");
    expect(tree[0]?.children.map((child) => child.name)).toEqual(expect.arrayContaining(["내부", "바깥 리프"]));
  });

  it("text-basic — 래스터 레이어 자체는 왕복 후에도 남는다", async () => {
    const { second } = await roundtrip(fixtureById("text-basic"));
    expect(second.elements.map((element) => element.name)).toEqual(["세로 글자", "자막"]);
  });
});

// ── D. Studio 텍스트 왕복 ────────────────────────────────────────────────────

describe("D. Studio 텍스트 → PSD descriptor → 다시 가져오기", () => {
  it("단순 가로 텍스트는 편집 가능한 descriptor로 왕복된다", async () => {
    const element: PsdTextElLike = {
      id: "studio-text-1",
      type: "text",
      text: "안녕\n세계",
      x: 20,
      y: 30,
      width: 220,
      fontSize: 32,
      fill: "#123456",
      rotation: 0,
      font: "Arial, sans-serif",
      align: "left",
      fontStyle: "normal",
    };
    const rect = { x: 20, y: 30, width: 220, height: 45 };
    const canvas = new PsdPixelCanvas(220, 45);
    canvas.pixels.set(solidPixels(220, 45, [18, 52, 86, 255]).data);
    const node = {
      getAttr: (name: string) => (name === "studioElementId" ? element.id : undefined),
      getClientRect: () => rect,
      getParent: () => null,
      toCanvas: () => canvas as unknown as HTMLCanvasElement,
    };
    const stage = { findOne: (predicate: (n: typeof node) => boolean) => (predicate(node) ? node : undefined) } as unknown as Konva.Stage;
    const exported = await exportPagePsd(stage, [element], 260, 120, 1, { includeBackground: false });
    const bytes = await exported.blob.arrayBuffer();

    const parsed = readFixtureBytes(bytes);
    const layer = parsed.children![0]!;
    expect(layer.text?.text.replace(/\r\n?/gu, "\n")).toBe("안녕\n세계");
    expect(layer.text?.style?.fontSize).toBe(32);

    const reimported = await importBytes(bytes, "studio-text.psd", 260);
    expect(reimported.editableTextElements).toHaveLength(1);
    expect(reimported.editableTextElements![0]).toMatchObject({
      type: "text",
      text: "안녕\n세계",
      fontSize: 32,
      fill: "#123456",
    });
  });
});

// ── known-gap: 현재 보존되지 않는 속성 (현재 거동을 그대로 고정) ────────────

describe("known-gap — 현재 손실되는 속성 (개선되면 이 절을 갱신할 것)", () => {
  it("KG-1 조정 레이어는 가져오기에서 제외되고 재내보내기에도 없다", async () => {
    const { first, second } = await roundtrip(fixtureById("adjustment-effects"));
    expect(first.skipped).toContain("밝기 조정: 조정 레이어라 제외됨");
    expect(decisionOf(first, "adjustment-layer", "dropped")?.count).toBe(1);
    expect(second.elements.map((element) => element.name)).not.toContain("밝기 조정");
  });

  it("KG-2 레이어 효과는 파라미터가 소실되고 고지만 남는다", async () => {
    const { first, exportedBytes } = await roundtrip(fixtureById("adjustment-effects"));
    expect(first.skipped.some((line) => line.startsWith("그림자 레이어: 레이어 스타일"))).toBe(true);
    expect(decisionOf(first, "layer-effects", "dropped")?.count).toBe(1);
    const tree = summarizePsd(readFixtureBytes(exportedBytes));
    const flat = tree.map((layer) => layer.name);
    expect(flat).toContain("그림자 레이어");
    const shadow = tree.find((layer) => layer.name === "그림자 레이어")!;
    expect(shadow.hasEffects).toBe(false);
  });

  it("KG-3 Canvas에 없는 블렌드 모드(dissolve)는 일반 합성으로 강등된다", async () => {
    const { first, second } = await roundtrip(fixtureById("blend-opacity"));
    expect(elementByName(first, "디졸브").blendMode).toBeUndefined();
    expect(first.skipped).toContain("디졸브: dissolve 블렌드 모드는 일반 합성으로 가져왔어요.");
    expect(decisionOf(first, "blend-mode", "dropped")?.count).toBe(1);
    expect(elementByName(second, "디졸브").blendMode).toBeUndefined();
  });

  it("KG-4 그룹 블렌드·불투명도는 그룹 속성으로 왕복되지 않고 자식에 평탄화된다", async () => {
    const { first, exportedBytes } = await roundtrip(fixtureById("groups-nested"));
    expect(first.skipped.some((line) => line.includes("multiply 격리 합성"))).toBe(true);
    expect(first.skipped.some((line) => line.includes("그룹 불투명도"))).toBe(true);
    const tree = summarizePsd(readFixtureBytes(exportedBytes));
    // 재내보내기 그룹은 전부 pass through·불투명도 1로 기록된다 (groupPsdExportLayers 규약).
    expect(tree[0]?.blendMode).toBe("pass through");
    expect(tree[0]?.opacityByte).toBe(255);
    const inner = tree[0]?.children.find((child) => child.name === "내부");
    expect(inner?.blendMode).toBe("pass through");
  });

  it("KG-5 그룹 마스크는 개별 레이어로 전파되지 않고 경고만 남는다", async () => {
    const result = await importFixture(fixtureById("group-mask"));
    expect(result.elements.map((element) => element.name)).toEqual(["그룹 안"]);
    expect(elementByName(result, "그룹 안").maskSrc).toBeUndefined();
    expect(result.skipped.some((line) => line.includes("그룹 마스크"))).toBe(true);
  });

  it("KG-6 숨긴 레이어는 가져와지지만 내보내기에서 제외된다", async () => {
    const fixture = fixtureById("blend-opacity");
    const first = await importFixture(fixture);
    const hidden = elementByName(first, "숨김 베이스");
    expect(hidden.hidden).toBe(true);
    // 숨김 요소를 입력에 포함해도 Konva 노드가 없어 캡처 단계에서 건너뛴다.
    const { stage } = fakeStageFor(first.elements.filter((element) => !element.hidden));
    const exported = await exportPagePsd(
      stage,
      first.elements.map(toExportElement),
      fixture.width,
      fixture.height,
      1,
      { includeBackground: false, groups: first.groups },
    );
    expect(exported.skipped.some((line) => line.includes("숨김 베이스") && line.includes("캔버스에서 찾지 못해"))).toBe(true);
    const bytes = await exported.blob.arrayBuffer();
    const tree = summarizePsd(readFixtureBytes(bytes));
    expect(tree.map((layer) => layer.name)).not.toContain("숨김 베이스");
  });

  it("KG-7 마스크는 재내보내기에서 픽셀에 구워져 별도 마스크로 돌아오지 않는다", async () => {
    const { first, second, exportedDecisions } = await roundtrip(fixtureById("mask-basic"));
    expect(elementByName(first, "마스크 레이어").maskSrc).toBeDefined();
    const bakedDecision = exportedDecisions?.decisions.find(
      (decision) => decision.feature === "layer-mask" && decision.disposition === "rasterized",
    );
    expect(bakedDecision?.count).toBe(1);
    const again = elementByName(second, "마스크 레이어");
    expect(again.maskSrc).toBeUndefined();
    // 대신 알파에 마스크 그라데이션이 구워져 있다.
    const decoded = decodePngDataUrl(again.src);
    expect(decoded.data[3]).toBe(0);
    expect(decoded.data[(7 * 4) + 3]).toBe(255);
  });

  it("KG-8 PSD 텍스트의 숨은 편집본은 재내보내기 대상이 아니라 descriptor가 남지 않는다", async () => {
    const { second } = await roundtrip(fixtureById("text-basic"));
    expect(second.editableTextElements ?? []).toHaveLength(0);
  });

  it("KG-9 빈 그룹은 폴더로 만들어지지 않고 소실된다", async () => {
    const result = await importFixture(fixtureById("group-mask"));
    expect(result.groups?.map((group) => group.name)).toEqual(["마스크 그룹"]);
    expect(decisionOf(result, "groups", "dropped")?.count).toBeGreaterThanOrEqual(1);
  });
});
