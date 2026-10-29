/**
 * 장면 메타데이터와 실제 형상이 함께 있는 SKP 바이트 픽스처.
 * MFC는 OpenSKP 작성기를 사용하고 VFF는 배포된 1.3.0 파서가 읽는 TLV/ZIP을 조립한다.
 * VFF 합성 바이트는 실제 SketchUp 작성 파일의 호환성 증거가 아니며, 파서/변환 파이프라인 회귀용이다.
 */

import { strToU8, zipSync } from "fflate";
import { create } from "openskp";

function join(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result;
}

/** tag는 2바이트 little-endian 수다. 예: 0x09c4 → C409 정점 레코드. */
function tlv(tag: number, ...parts: readonly Uint8Array[]): Uint8Array {
  const payload = join(...parts), header = new Uint8Array(6), view = new DataView(header.buffer);
  view.setUint16(0, tag, true); view.setUint32(2, payload.byteLength, true);
  return join(header, payload);
}

function f64(...values: readonly number[]): Uint8Array {
  const result = new Uint8Array(values.length * 8), view = new DataView(result.buffer);
  values.forEach((value, index) => view.setFloat64(index * 8, value, true));
  return result;
}

function id(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 255) throw new Error("픽스처 ID는 한 바이트 범위여야 합니다.");
  return new Uint8Array([value]);
}

/** C409 정점·B80B 모서리·AC0D 면과 방향 있는 co-edge 루프가 실제 삼각형 하나를 만든다. */
function triangle(baseId: number, size: number): Uint8Array {
  const vertices = [[0, 0, 0], [size, 0, 0], [0, size, 0]].map((point, index) =>
    tlv(0x09c4, tlv(0x05de, id(baseId + index)), tlv(0x09c5, f64(...point))));
  const edges = [0, 1, 2].map((index) => tlv(0x0bb8, tlv(0x05de, id(baseId + 10 + index)),
    tlv(0x0bb9, id(baseId + index)), tlv(0x0bba, id(baseId + (index + 1) % 3))));
  const coEdges = [0, 1, 2].map((index) => tlv(0x0fa0, tlv(0x0fa1, id(baseId + 10 + index)), tlv(0x0fa2, id(0))));
  const face = tlv(0x0dac, tlv(0x05de, id(baseId + 20)), tlv(0x0dad, f64(0, 0, 1)), tlv(0x0dae, tlv(0x1194, ...coEdges)));
  return join(...vertices, ...edges, face);
}

function page(name: string, parallel: boolean, eye: readonly number[] | null): Uint8Array {
  return tlv(29000, tlv(28500, tlv(28501, strToU8(name))),
    tlv(29002, tlv(13500, ...(eye ? [tlv(13501, f64(...eye))] : []),
      tlv(13502, f64(10, 20, 30)), tlv(13503, f64(0, 0, 1)), tlv(13506, id(parallel ? 0 : 1)),
      tlv(13507, f64(parallel ? 144 : 0)), tlv(13508, f64(47.5)))),
    // ID 99는 파서가 이름으로 풀지 못하는 참조다. 원본 총수 미확인 한계가 사라지지 않아야 한다.
    tlv(29008, new Uint8Array([1, 2, 1, 99])));
}

/** 실제 MFC/v17 작성기 결과. 루트 형상과 중첩 정의·숨김 태그·동적 속성을 포함한다. */
export function createStudioBg3dSkpSceneSourceMfcBytes(): Uint8Array {
  const builder = create();
  const layer = builder.addLayer("가구", { color: [31, 63, 127], hidden: true });
  const leg = builder.addComponentDefinition("다리", (definition) => {
    definition.addFace([[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
  });
  const chair = builder.addComponentDefinition("의자", (definition) => {
    definition.addInstance(leg, { translation: [0, 0, 12], layer });
  });
  builder.addFace([[0, 0, 0], [100, 0, 0], [0, 100, 0]]);
  builder.addInstance(chair, { name: "의자 A", translation: [100, 200, 300], layer, hidden: true,
    attributes: { onclick: 'ANIMATE("RotZ", 0, 90)', label: "문" }, attributeDictName: "dynamic_attributes" });
  return builder.toBytes();
}

/** 실제 parseSkp→buildScene→toGLB를 통과하는 VFF 합성 바이트. 좌표·행렬은 인치/Z-up이다. */
export function createStudioBg3dSkpSceneSourceVffBytes(): Uint8Array {
  const pages = tlv(0x0207, tlv(28000, tlv(28001,
    page("원근 컷", false, [100, -200, 300]), page("평행 컷", true, [0, 0, 500]), page("카메라 없는 장면", false, null))));
  const layers = tlv(0x3a99, tlv(0x3c8c, tlv(0x05dc, id(2)), tlv(0x3c8d, strToU8("지붕")), tlv(0x3c8e, id(1))));
  const definition = tlv(0x157c, tlv(0x05de, id(42)), tlv(0x157e, strToU8("VFF 컴포넌트")), triangle(101, 10));
  const instance = tlv(0x1964, tlv(0x1967, id(42)), tlv(0x1965, strToU8("VFF 배치")),
    tlv(0x1966, f64(1, 0, 0, 0, 1, 0, 0, 0, 1, 101, 202, 303, 1)),
    tlv(0x07d0, tlv(0x07d2, id(2)), tlv(0x07d3, id(1))));
  const root = tlv(0x01f6, triangle(1, 100), instance);
  const zip = zipSync({
    "model.dat": join(pages, layers, definition, root),
    "meta/meta.dat": tlv(100, tlv(109, strToU8("Millimeter"))),
    "materials/layer/material.xml": strToU8('<material name="Layer_지붕" colorRed="10" colorGreen="20" colorBlue="30"/>'),
  });
  const version = "{21.0.339}", text = new Uint8Array(version.length * 2), view = new DataView(text.buffer);
  for (let index = 0; index < version.length; index += 1) view.setUint16(index * 2, version.charCodeAt(index), true);
  const header = join(new Uint8Array([255, 254, 255, 14, 0, 0, 255, 254, 255, version.length]), text);
  return join(header, zip);
}
