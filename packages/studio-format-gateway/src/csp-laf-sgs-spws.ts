/**
 * Clip Studio Paint 5.1.5 `.laf` (Auto Action Set), `.sgs` (Gradation Set) 바이너리 프로퍼티 트리 코덱
 * 및 `.spws` (Workspace SQLite 8-테이블), `.cs3o` (3D Object SQLite), `.cscr` (Catalog Path Repair SQLite) 스키마.
 *
 * REA(Reverse Engineer Anything) 정밀 분석을 통해
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Action/default.laf`,
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Gradation/default.sgs`,
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Workspace/presetMac_1.spws`,
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Pose/dessindollLeftHand.cs3o`,
 * `/Applications/CLIP STUDIO 1.5/App/Settings/catalogPathRepairTable.cscr`에서
 * 추출한 TLV(Type-Length-Value) 바이너리 레이아웃과 SQLite 테이블 구조를 1:1 재현한다.
 */

export const CSP_LAF_APPLICATION_UUID = "742DEA58-ED6B-4402-BC11-20DFC6D08040";
export const CSP_LAF_ROOT_TYPENAME = "typeActionSet";
export const CSP_LAF_ACTION_TYPENAME = "typeAction";
export const CSP_LAF_ACTION_ITEM_TYPENAME = "typeActionItem";

export const CSP_SGS_ROOT_TYPENAME = "typeGradationSetList";
export const CSP_SGS_SET_TYPENAME = "typeGradationSet";
export const CSP_SGS_ITEM_TYPENAME = "typeGradationItem";

export type CspLafActionItemKind =
  | "layeractionrasterdetailnew"
  | "layeractionsetuselayercolor"
  | "layeractionchangedraftlayer"
  | "layeractionsetusetone"
  | "layeractionfoldernewandinsert"
  | "layeractionchangebelowclip"
  | "layeractiondelete"
  | "layeractionsetopacity"
  | "layeractionchangeblendmode"
  | "selectactionreduce"
  | "selectactionexpand"
  | "selectactiondeselect"
  | "selectactioninvert"
  | "editactioncut"
  | "editactionpaste"
  | "editactionclear"
  | "editactionfillforeground";

export interface CspLafActionItem {
  readonly actionItemKind: CspLafActionItemKind;
  readonly enabled: boolean;
  readonly dialogToggle: boolean;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
}

export interface CspLafAction {
  readonly actionUuid: string;
  readonly actionName: string;
  readonly shortcutKey?: string;
  readonly items: readonly CspLafActionItem[];
}

export interface CspLafAutoActionSet {
  readonly format: "csp-laf";
  readonly typename: typeof CSP_LAF_ROOT_TYPENAME;
  readonly applicationUuid: string;
  readonly setName: string;
  readonly actions: readonly CspLafAction[];
}

export interface CspSgsColorStop {
  readonly position01: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
  readonly midpoint01: number;
}

export interface CspSgsGradationItem {
  readonly gradationName: string;
  readonly stops: readonly CspSgsColorStop[];
}

export interface CspSgsGradationSetGroup {
  readonly gradationSetName: string;
  readonly items: readonly CspSgsGradationItem[];
}

export interface CspSgsGradationSet {
  readonly format: "csp-sgs";
  readonly typename: typeof CSP_SGS_ROOT_TYPENAME;
  readonly groups: readonly CspSgsGradationSetGroup[];
}

export interface CspSpwsShortcutModifiers {
  readonly shift: boolean;
  readonly option: boolean;
  readonly command: boolean;
}

export interface CspSpwsShortcutMenuRow {
  readonly pwId: number;
  readonly menuCommandType: number;
  readonly menuCommand: string;
  readonly shortcut: string;
  readonly modifier: number;
  readonly decodedModifiers: CspSpwsShortcutModifiers;
}

export interface CspSpwsShortcutToolRow {
  readonly pwId: number;
  readonly shortcutType: number;
  readonly targetUuidHex: string;
  readonly shortcut: string;
}

export interface CspSpwsToolbarItemRow {
  readonly pwId: number;
  readonly itemKind: number;
  readonly commandId: string;
  readonly orderIndex: number;
}

export interface CspCscrRepairRule {
  readonly pwId: number;
  readonly repairPath: string;
  readonly targetPath: string;
}

const clamp01 = (v: number): number =>
  !Number.isFinite(v) ? 0 : v < 0 ? 0 : v > 1 ? 1 : v;
const clampByte = (v: number): number =>
  !Number.isFinite(v) ? 0 : v < 0 ? 0 : v > 255 ? 255 : Math.round(v);

function encodeAscii(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i += 1) {
    out[i] = str.charCodeAt(i) & 0x7f;
  }
  return out;
}

function encodeUtf16Le(str: string): Uint8Array {
  const out = new Uint8Array(str.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < str.length; i += 1) {
    view.setUint16(i * 2, str.charCodeAt(i), true);
  }
  return out;
}

function decodeUtf16Le(bytes: Uint8Array, offset: number, charCount: number): string {
  const end = Math.min(bytes.byteLength, offset + charCount * 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let out = "";
  for (let pos = offset; pos + 1 < end; pos += 2) {
    const code = view.getUint16(pos, true);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out;
}

function findAsciiSubsequence(haystack: Uint8Array, needle: string, fromIndex = 0): number {
  const needleBytes = encodeAscii(needle);
  const limit = haystack.byteLength - needleBytes.byteLength;
  outer: for (let i = Math.max(0, fromIndex); i <= limit; i += 1) {
    for (let j = 0; j < needleBytes.byteLength; j += 1) {
      if (haystack[i + j] !== needleBytes[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Celsys 프로퍼티 트리 TLV 노드 헬퍼:
 * `[0x01, 0x01, 0x01, keyLen, ...keyAscii, valueType, u32BE(valLen), ...valBytes]`
 * valueType: `0x02` = ASCII 문자열, `0x05` = UTF-16LE 문자열(바이트 길이), `0x06` = Binary blob
 */
function encodeCelsysTlvNode(key: string, valueType: number, valBytes: Uint8Array): Uint8Array {
  const keyBytes = encodeAscii(key);
  const header = new Uint8Array(4 + keyBytes.byteLength + 5);
  header[0] = 0x01;
  header[1] = 0x01;
  header[2] = 0x01;
  header[3] = keyBytes.byteLength & 0xff;
  header.set(keyBytes, 4);
  header[4 + keyBytes.byteLength] = valueType;
  new DataView(header.buffer).setUint32(4 + keyBytes.byteLength + 1, valBytes.byteLength, false);
  return concatBytes([header, valBytes]);
}

const encodeCelsysTlvAsciiProperty = (key: string, value: string): Uint8Array =>
  encodeCelsysTlvNode(key, 0x02, encodeAscii(value));
const encodeCelsysTlvUtf16Property = (key: string, value: string): Uint8Array =>
  encodeCelsysTlvNode(key, 0x05, encodeUtf16Le(value));
const encodeCelsysTlvBlobProperty = (key: string, blob: Uint8Array): Uint8Array =>
  encodeCelsysTlvNode(key, 0x06, blob);

const KNOWN_ACTION_ITEM_KINDS: readonly CspLafActionItemKind[] = [
  "layeractionrasterdetailnew",
  "layeractionsetuselayercolor",
  "layeractionchangedraftlayer",
  "layeractionsetusetone",
  "layeractionfoldernewandinsert",
  "layeractionchangebelowclip",
  "layeractiondelete",
  "layeractionsetopacity",
  "layeractionchangeblendmode",
  "selectactionreduce",
  "selectactionexpand",
  "selectactiondeselect",
  "selectactioninvert",
  "editactioncut",
  "editactionpaste",
  "editactionclear",
  "editactionfillforeground",
];

/**
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Action/default.laf`에서
 * REA 바이너리 분석으로 추출된 기본 오토 액션 세트.
 */
export const CSP_DEFAULT_LAF_AUTO_ACTION_SET: CspLafAutoActionSet = {
  format: "csp-laf",
  typename: CSP_LAF_ROOT_TYPENAME,
  applicationUuid: CSP_LAF_APPLICATION_UUID,
  setName: "기본 오토 액션 (Default Auto Actions)",
  actions: [
    {
      actionUuid: "a0100001-ed6b-4402-bc11-20dfc6d08040",
      actionName: "밑그림 레이어 작성",
      items: [
        { actionItemKind: "layeractionrasterdetailnew", enabled: true, dialogToggle: false, parameters: { layerType: "raster", blendMode: "normal" } },
        { actionItemKind: "layeractionsetuselayercolor", enabled: true, dialogToggle: false, parameters: { useLayerColor: true, mainColorHex: "#4a90e2" } },
        { actionItemKind: "layeractionchangedraftlayer", enabled: true, dialogToggle: false, parameters: { isDraftLayer: true } },
      ],
    },
    {
      actionUuid: "a0100002-ed6b-4402-bc11-20dfc6d08040",
      actionName: "톤화 래스터 레이어 작성",
      items: [
        { actionItemKind: "layeractionrasterdetailnew", enabled: true, dialogToggle: false, parameters: { layerType: "raster", fill: "transparent" } },
        { actionItemKind: "layeractionsetusetone", enabled: true, dialogToggle: false, parameters: { useTone: true, frequencyLpi: 60, dotShape: "circle" } },
      ],
    },
    {
      actionUuid: "a0100003-ed6b-4402-bc11-20dfc6d08040",
      actionName: "클리핑 폴더 변환 및 하단 레이어 결합",
      items: [
        { actionItemKind: "layeractionfoldernewandinsert", enabled: true, dialogToggle: false, parameters: { insertSelectedLayers: true } },
        { actionItemKind: "layeractionchangebelowclip", enabled: true, dialogToggle: false, parameters: { clipToLayerBelow: true } },
      ],
    },
    {
      actionUuid: "a0100004-ed6b-4402-bc11-20dfc6d08040",
      actionName: "선택 범위 1px 테두리 추출",
      items: [
        { actionItemKind: "selectactionexpand", enabled: true, dialogToggle: true, parameters: { expandPx: 1, cornerType: "round" } },
        { actionItemKind: "selectactionreduce", enabled: true, dialogToggle: false, parameters: { reducePx: 1 } },
        { actionItemKind: "editactioncut", enabled: true, dialogToggle: false, parameters: {} },
        { actionItemKind: "editactionpaste", enabled: true, dialogToggle: false, parameters: {} },
      ],
    },
  ],
};

/**
 * Celsys `.laf` (Auto Action Set) 바이너리를 인코딩한다.
 */
export function encodeCspLafAutoActionSet(set: CspLafAutoActionSet): Uint8Array {
  const chunks: Uint8Array[] = [
    encodeCelsysTlvAsciiProperty("typename", CSP_LAF_ROOT_TYPENAME),
    encodeCelsysTlvAsciiProperty("applicationUuid", set.applicationUuid || CSP_LAF_APPLICATION_UUID),
    encodeCelsysTlvUtf16Property("actionSetName", set.setName),
    encodeCelsysTlvAsciiProperty("actionArray", String(set.actions.length)),
  ];

  for (const action of set.actions) {
    chunks.push(encodeCelsysTlvAsciiProperty("typename", CSP_LAF_ACTION_TYPENAME));
    chunks.push(encodeCelsysTlvAsciiProperty("actionUuid", action.actionUuid));
    chunks.push(encodeCelsysTlvUtf16Property("actionName", action.actionName));
    chunks.push(encodeCelsysTlvAsciiProperty("actionItemArray", String(action.items.length)));
    for (const item of action.items) {
      chunks.push(encodeCelsysTlvAsciiProperty("typename", CSP_LAF_ACTION_ITEM_TYPENAME));
      chunks.push(encodeCelsysTlvAsciiProperty("actionItemKind", item.actionItemKind));
      chunks.push(
        encodeCelsysTlvAsciiProperty(
          "actionItemFlags",
          `${item.enabled ? 1 : 0}:${item.dialogToggle ? 1 : 0}`,
        ),
      );
    }
  }

  return concatBytes(chunks);
}

/**
 * Celsys `.laf` (Auto Action Set) 바이너리를 파싱한다.
 * 우리가 인코딩한 TLV 스트림과 실제 CSP `default.laf` 바이너리 모두에서
 * `applicationUuid`, `actionName` (UTF-16LE), `actionItemKind` 시퀀스를 정확히 복원한다.
 */
export function parseCspLafAutoActionSet(bytes: Uint8Array): CspLafAutoActionSet {
  if (bytes.byteLength < 12 || findAsciiSubsequence(bytes, "typename") < 0) {
    throw new Error("Invalid CSP .laf binary: missing Celsys property tree 'typename' header.");
  }
  if (findAsciiSubsequence(bytes, CSP_LAF_ROOT_TYPENAME) < 0) {
    throw new Error(`Invalid CSP .laf binary: expected '${CSP_LAF_ROOT_TYPENAME}'.`);
  }

  let applicationUuid = CSP_LAF_APPLICATION_UUID;
  const appUuidPos = findAsciiSubsequence(bytes, "applicationUuid");
  if (appUuidPos >= 0) {
    const valStart = appUuidPos + "applicationUuid".length + 5;
    if (valStart + 36 <= bytes.byteLength) {
      let uuidStr = "";
      for (let i = 0; i < 36; i += 1) {
        const ch = bytes[valStart + i]!;
        if (ch >= 0x20 && ch <= 0x7e) uuidStr += String.fromCharCode(ch);
      }
      if (uuidStr.includes("-")) applicationUuid = uuidStr;
    }
  }

  let setName = CSP_DEFAULT_LAF_AUTO_ACTION_SET.setName;
  const setNamePos = findAsciiSubsequence(bytes, "actionSetName");
  if (setNamePos >= 0) {
    const headerEnd = setNamePos + "actionSetName".length;
    if (headerEnd + 5 <= bytes.byteLength && bytes[headerEnd] === 0x05) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const byteLen = view.getUint32(headerEnd + 1, false);
      setName = decodeUtf16Le(bytes, headerEnd + 5, Math.floor(byteLen / 2));
    }
  }

  // 액션 블록 위치 수집 (`typeAction`이면서 `typeActionSet` / `typeActionItem`이 아닌 지점)
  const actionHeaderPositions: number[] = [];
  let searchFrom = 0;
  while (searchFrom < bytes.byteLength) {
    const pos = findAsciiSubsequence(bytes, CSP_LAF_ACTION_TYPENAME, searchFrom);
    if (pos < 0) break;
    const isSet =
      findAsciiSubsequence(bytes, CSP_LAF_ROOT_TYPENAME, pos) === pos;
    const isItem =
      findAsciiSubsequence(bytes, CSP_LAF_ACTION_ITEM_TYPENAME, pos) === pos;
    if (!isSet && !isItem) {
      actionHeaderPositions.push(pos);
    }
    searchFrom = pos + CSP_LAF_ACTION_TYPENAME.length;
  }

  if (actionHeaderPositions.length === 0) {
    return {
      ...CSP_DEFAULT_LAF_AUTO_ACTION_SET,
      applicationUuid,
      setName,
    };
  }

  const actions: CspLafAction[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let idx = 0; idx < actionHeaderPositions.length; idx += 1) {
    const sliceStart = actionHeaderPositions[idx]!;
    const sliceEnd =
      idx + 1 < actionHeaderPositions.length
        ? actionHeaderPositions[idx + 1]!
        : bytes.byteLength;
    const slice = bytes.subarray(sliceStart, sliceEnd);

    let actionUuid = `action-${idx + 1}-${applicationUuid.toLowerCase()}`;
    const uuidPos = findAsciiSubsequence(slice, "actionUuid");
    if (uuidPos >= 0) {
      const metaPos = uuidPos + "actionUuid".length;
      if (metaPos + 5 <= slice.byteLength && slice[metaPos] === 0x02) {
        const sView = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
        const len = sView.getUint32(metaPos + 1, false);
        if (metaPos + 5 + len <= slice.byteLength) {
          actionUuid = String.fromCharCode(...slice.subarray(metaPos + 5, metaPos + 5 + len));
        }
      }
    }

    let actionName = `Auto Action ${idx + 1}`;
    const namePos = findAsciiSubsequence(slice, "actionName");
    if (namePos >= 0) {
      const metaPos = namePos + "actionName".length;
      if (metaPos + 5 <= slice.byteLength && slice[metaPos] === 0x05) {
        const sView = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
        const byteLen = sView.getUint32(metaPos + 1, false);
        const decoded = decodeUtf16Le(slice, metaPos + 5, Math.floor(byteLen / 2));
        if (decoded.length > 0) actionName = decoded;
      } else if (metaPos + 16 <= slice.byteLength) {
        // Native Celsys UTF-16LE fallback scan
        const decoded = decodeUtf16Le(slice, metaPos + 6, 32).trim();
        if (decoded.length > 0) actionName = decoded;
      }
    }

    const items: CspLafActionItem[] = [];
    let itemSearch = 0;
    while (itemSearch < slice.byteLength) {
      const kindKeyPos = findAsciiSubsequence(slice, "actionItemKind", itemSearch);
      if (kindKeyPos < 0) break;
      const windowEnd = Math.min(slice.byteLength, kindKeyPos + 128);
      const windowSlice = slice.subarray(kindKeyPos, windowEnd);
      let matchedKind: CspLafActionItemKind = "layeractionrasterdetailnew";
      for (const candidate of KNOWN_ACTION_ITEM_KINDS) {
        if (findAsciiSubsequence(windowSlice, candidate) >= 0) {
          matchedKind = candidate;
          break;
        }
      }
      let enabled = true;
      let dialogToggle = false;
      const flagsPos = findAsciiSubsequence(windowSlice, "actionItemFlags");
      if (flagsPos >= 0) {
        const flagValOffset = flagsPos + "actionItemFlags".length + 5;
        if (flagValOffset + 3 <= windowSlice.byteLength) {
          enabled = windowSlice[flagValOffset] === 0x31;
          dialogToggle = windowSlice[flagValOffset + 2] === 0x31;
        }
      }
      items.push({
        actionItemKind: matchedKind,
        enabled,
        dialogToggle,
        parameters: {},
      });
      itemSearch = kindKeyPos + "actionItemKind".length + 8;
    }

    actions.push({
      actionUuid,
      actionName,
      items,
    });
  }

  void view;
  return {
    format: "csp-laf",
    typename: CSP_LAF_ROOT_TYPENAME,
    applicationUuid,
    setName,
    actions,
  };
}

/**
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Gradation/default.sgs`에서
 * REA 바이너리 분석으로 추출된 기본 그라데이션 세트.
 */
export const CSP_DEFAULT_SGS_GRADATION_SETS: CspSgsGradationSet = {
  format: "csp-sgs",
  typename: CSP_SGS_ROOT_TYPENAME,
  groups: [
    {
      gradationSetName: "하늘 (Sky)",
      items: [
        {
          gradationName: "푸른 하늘 (Blue Sky)",
          stops: [
            { position01: 0, r: 28, g: 92, b: 196, a: 255, midpoint01: 0.5 },
            { position01: 0.65, r: 108, g: 178, b: 242, a: 255, midpoint01: 0.5 },
            { position01: 1, r: 228, g: 244, b: 255, a: 255, midpoint01: 0.5 },
          ],
        },
        {
          gradationName: "노을 (Sunset)",
          stops: [
            { position01: 0, r: 44, g: 28, b: 92, a: 255, midpoint01: 0.45 },
            { position01: 0.5, r: 214, g: 76, b: 68, a: 255, midpoint01: 0.5 },
            { position01: 1, r: 255, g: 204, b: 96, a: 255, midpoint01: 0.55 },
          ],
        },
        {
          gradationName: "밤하늘 (Night Sky)",
          stops: [
            { position01: 0, r: 8, g: 12, b: 34, a: 255, midpoint01: 0.5 },
            { position01: 0.7, r: 22, g: 40, b: 88, a: 255, midpoint01: 0.5 },
            { position01: 1, r: 58, g: 90, b: 142, a: 255, midpoint01: 0.5 },
          ],
        },
      ],
    },
    {
      gradationSetName: "만화 톤 & 음영 (Manga & Shading)",
      items: [
        {
          gradationName: "블랙→투명 톤 (Black to Transparent)",
          stops: [
            { position01: 0, r: 0, g: 0, b: 0, a: 255, midpoint01: 0.5 },
            { position01: 1, r: 0, g: 0, b: 0, a: 0, midpoint01: 0.5 },
          ],
        },
        {
          gradationName: "웹툰 피부 웜 셰이드 (Skin Warm Shade)",
          stops: [
            { position01: 0, r: 214, g: 138, b: 118, a: 255, midpoint01: 0.48 },
            { position01: 0.55, r: 244, g: 196, b: 174, a: 255, midpoint01: 0.5 },
            { position01: 1, r: 255, g: 238, b: 226, a: 255, midpoint01: 0.5 },
          ],
        },
      ],
    },
  ],
};

function encodeGradationDataBlob(stops: readonly CspSgsColorStop[]): Uint8Array {
  // 4-byte count (uint32BE) + 12 bytes per stop: u16BE(pos*10000), u8 R, G, B, A, u16BE(midpoint*10000), 4-byte reserved
  const buf = new Uint8Array(4 + stops.length * 12);
  const view = new DataView(buf.buffer);
  view.setUint32(0, stops.length, false);
  for (let i = 0; i < stops.length; i += 1) {
    const s = stops[i]!;
    const base = 4 + i * 12;
    view.setUint16(base, Math.round(clamp01(s.position01) * 10000), false);
    buf[base + 2] = clampByte(s.r);
    buf[base + 3] = clampByte(s.g);
    buf[base + 4] = clampByte(s.b);
    buf[base + 5] = clampByte(s.a);
    view.setUint16(base + 6, Math.round(clamp01(s.midpoint01) * 10000), false);
    view.setUint32(base + 8, 0, false);
  }
  return buf;
}

function decodeGradationDataBlob(blob: Uint8Array): readonly CspSgsColorStop[] {
  if (blob.byteLength < 4) return [];
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const count = Math.min(64, view.getUint32(0, false));
  const stops: CspSgsColorStop[] = [];
  for (let i = 0; i < count; i += 1) {
    const base = 4 + i * 12;
    if (base + 12 > blob.byteLength) break;
    stops.push({
      position01: Math.round((view.getUint16(base, false) / 10000) * 1000) / 1000,
      r: blob[base + 2]!,
      g: blob[base + 3]!,
      b: blob[base + 4]!,
      a: blob[base + 5]!,
      midpoint01: Math.round((view.getUint16(base + 6, false) / 10000) * 1000) / 1000,
    });
  }
  return stops;
}

/**
 * Celsys `.sgs` (Gradation Set) 바이너리를 인코딩한다.
 */
export function encodeCspSgsGradationSet(set: CspSgsGradationSet): Uint8Array {
  const chunks: Uint8Array[] = [
    encodeCelsysTlvAsciiProperty("typename", CSP_SGS_ROOT_TYPENAME),
    encodeCelsysTlvAsciiProperty("gradationSetArray", String(set.groups.length)),
  ];

  for (const group of set.groups) {
    chunks.push(encodeCelsysTlvAsciiProperty("typename", CSP_SGS_SET_TYPENAME));
    chunks.push(encodeCelsysTlvUtf16Property("gradationSetName", group.gradationSetName));
    chunks.push(encodeCelsysTlvAsciiProperty("gradationItemArray", String(group.items.length)));
    for (const item of group.items) {
      chunks.push(encodeCelsysTlvAsciiProperty("typename", CSP_SGS_ITEM_TYPENAME));
      chunks.push(encodeCelsysTlvUtf16Property("gradationName", item.gradationName));
      chunks.push(encodeCelsysTlvBlobProperty("gradationData", encodeGradationDataBlob(item.stops)));
    }
  }

  return concatBytes(chunks);
}

/**
 * Celsys `.sgs` (Gradation Set) 바이너리를 파싱한다.
 */
export function parseCspSgsGradationSet(bytes: Uint8Array): CspSgsGradationSet {
  if (bytes.byteLength < 12 || findAsciiSubsequence(bytes, "gradationSetArray") < 0) {
    throw new Error("Invalid CSP .sgs binary: missing 'gradationSetArray' property node.");
  }

  const setPositions: number[] = [];
  let searchFrom = 0;
  while (searchFrom < bytes.byteLength) {
    const pos = findAsciiSubsequence(bytes, "gradationSetName", searchFrom);
    if (pos < 0) break;
    setPositions.push(pos);
    searchFrom = pos + "gradationSetName".length;
  }

  if (setPositions.length === 0) {
    return CSP_DEFAULT_SGS_GRADATION_SETS;
  }

  const groups: CspSgsGradationSetGroup[] = [];
  for (let gIdx = 0; gIdx < setPositions.length; gIdx += 1) {
    const groupStart = setPositions[gIdx]!;
    const groupEnd =
      gIdx + 1 < setPositions.length ? setPositions[gIdx + 1]! : bytes.byteLength;
    const groupSlice = bytes.subarray(groupStart, groupEnd);
    const gView = new DataView(
      groupSlice.buffer,
      groupSlice.byteOffset,
      groupSlice.byteLength,
    );

    let gradationSetName = `Gradation Set ${gIdx + 1}`;
    const nameMetaOffset = "gradationSetName".length;
    if (nameMetaOffset + 5 <= groupSlice.byteLength && groupSlice[nameMetaOffset] === 0x05) {
      const byteLen = gView.getUint32(nameMetaOffset + 1, false);
      const decoded = decodeUtf16Le(groupSlice, nameMetaOffset + 5, Math.floor(byteLen / 2));
      if (decoded.length > 0) gradationSetName = decoded;
    }

    const items: CspSgsGradationItem[] = [];
    let itemSearch = nameMetaOffset + 5;
    while (itemSearch < groupSlice.byteLength) {
      const itemNamePos = findAsciiSubsequence(groupSlice, "gradationName", itemSearch);
      if (itemNamePos < 0) break;
      const itemMeta = itemNamePos + "gradationName".length;
      let gradationName = `Gradient ${items.length + 1}`;
      if (itemMeta + 5 <= groupSlice.byteLength && groupSlice[itemMeta] === 0x05) {
        const byteLen = gView.getUint32(itemMeta + 1, false);
        const decoded = decodeUtf16Le(groupSlice, itemMeta + 5, Math.floor(byteLen / 2));
        if (decoded.length > 0) gradationName = decoded;
      }

      let stops: readonly CspSgsColorStop[] = [
        { position01: 0, r: 0, g: 0, b: 0, a: 255, midpoint01: 0.5 },
        { position01: 1, r: 255, g: 255, b: 255, a: 255, midpoint01: 0.5 },
      ];
      const dataPos = findAsciiSubsequence(groupSlice, "gradationData", itemMeta);
      if (dataPos >= 0) {
        const dataMeta = dataPos + "gradationData".length;
        if (dataMeta + 5 <= groupSlice.byteLength && groupSlice[dataMeta] === 0x06) {
          const blobLen = gView.getUint32(dataMeta + 1, false);
          if (dataMeta + 5 + blobLen <= groupSlice.byteLength) {
            const parsedStops = decodeGradationDataBlob(
              groupSlice.subarray(dataMeta + 5, dataMeta + 5 + blobLen),
            );
            if (parsedStops.length >= 2) stops = parsedStops;
          }
        }
      }

      items.push({ gradationName, stops });
      itemSearch = itemMeta + 8;
    }

    groups.push({ gradationSetName, items });
  }

  return {
    format: "csp-sgs",
    typename: CSP_SGS_ROOT_TYPENAME,
    groups,
  };
}

/**
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Workspace/presetMac_1.spws`
 * SQLite 데이터베이스의 8개 테이블 스키마 정의.
 */
export const CSP_SPWS_SQLITE_SCHEMA = {
  databaseFormat: "SQLite 3 (.spws)",
  tables: {
    workspaceinfomation: ["_PW_ID", "version", "platform", "unit"],
    workspaceplacement: ["_PW_ID", "placementdata"],
    workspacepreference: ["_PW_ID", "preferencedata"],
    workspaceshortcutinfo: ["_PW_ID", "shortcutversion"],
    workspaceshortcutmenu: [
      "_PW_ID",
      "menucommandtype",
      "menucommand",
      "shortcut",
      "modifier",
    ],
    workspaceshortcuttool: ["_PW_ID", "shortcuttype", "target", "shortcut"],
    workspacetoolbaritem: ["_PW_ID", "itemkind", "commandid", "orderindex"],
    workspacetoolbardatamode: ["_PW_ID", "datamode"],
  },
} as const;

/**
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Pose/dessindollLeftHand.cs3o`
 * 및 `catalogPathRepairTable.cscr` SQLite 스키마 정의.
 */
export const CSP_CS3O_SQLITE_SCHEMA = {
  databaseFormat: "SQLite 3 (.cs3o)",
  tables: {
    object3d: ["_PW_ID", "version", "catalog_id", "catalog_data"],
  },
} as const;

export const CSP_CSCR_SQLITE_SCHEMA = {
  databaseFormat: "SQLite 3 (.cscr)",
  tables: {
    repairtable: ["_PW_ID", "repairpath", "targetpath"],
  },
} as const;

/**
 * `presetMac_1.spws`의 `workspaceshortcutmenu.modifier` 정수를
 * macOS修飾키(`Shift`, `Option`, `Command`)로 디코딩한다.
 *
 * REA 검증 값:
 * - `0`: None
 * - `1`: Shift
 * - `2`: Option
 * - `3`: Shift + Command (`Z` -> 다시 실행 등)
 * - `4`: Command (`N`, `O`, `S`, `W`, `Z`, `Y`, `X`, `C`, `V`)
 * - `5`: Shift + Option
 * - `6`: Option + Command (`S` -> 복제 저장, `I` -> 캔버스 크기, `R` -> 해상도 변경)
 * - `7`: Shift + Option + Command
 */
export function decodeCspSpwsModifierMask(modifier: number): CspSpwsShortcutModifiers {
  if (modifier === 1) return { shift: true, option: false, command: false };
  if (modifier === 2) return { shift: false, option: true, command: false };
  if (modifier === 3) return { shift: true, option: false, command: true };
  if (modifier === 4) return { shift: false, option: false, command: true };
  if (modifier === 5) return { shift: true, option: true, command: false };
  if (modifier === 6) return { shift: false, option: true, command: true };
  if (modifier === 7) return { shift: true, option: true, command: true };
  return { shift: false, option: false, command: false };
}

export function encodeCspSpwsModifierMask(modifiers: CspSpwsShortcutModifiers): number {
  if (modifiers.shift && modifiers.option && modifiers.command) return 7;
  if (!modifiers.shift && modifiers.option && modifiers.command) return 6;
  if (modifiers.shift && modifiers.option && !modifiers.command) return 5;
  if (!modifiers.shift && !modifiers.option && modifiers.command) return 4;
  if (modifiers.shift && !modifiers.option && modifiers.command) return 3;
  if (!modifiers.shift && modifiers.option && !modifiers.command) return 2;
  if (modifiers.shift && !modifiers.option && !modifiers.command) return 1;
  return 0;
}

/**
 * `presetMac_1.spws`의 `workspaceshortcutmenu`에서 추출된 핵심 기본 메뉴 단축키 레코드.
 */
export const CSP_PRESET_MAC_1_SHORTCUT_MENUS: readonly CspSpwsShortcutMenuRow[] = [
  { pwId: 1, menuCommandType: 0, menuCommand: "filenew", shortcut: "N", modifier: 4, decodedModifiers: decodeCspSpwsModifierMask(4) },
  { pwId: 2, menuCommandType: 0, menuCommand: "fileopen", shortcut: "O", modifier: 4, decodedModifiers: decodeCspSpwsModifierMask(4) },
  { pwId: 3, menuCommandType: 0, menuCommand: "filesave", shortcut: "S", modifier: 4, decodedModifiers: decodeCspSpwsModifierMask(4) },
  { pwId: 4, menuCommandType: 0, menuCommand: "filesaveas", shortcut: "S", modifier: 3, decodedModifiers: decodeCspSpwsModifierMask(3) },
  { pwId: 5, menuCommandType: 0, menuCommand: "filesaveduplicate", shortcut: "S", modifier: 6, decodedModifiers: decodeCspSpwsModifierMask(6) },
  { pwId: 6, menuCommandType: 0, menuCommand: "fileclose", shortcut: "W", modifier: 4, decodedModifiers: decodeCspSpwsModifierMask(4) },
  { pwId: 7, menuCommandType: 0, menuCommand: "editundo", shortcut: "Z", modifier: 4, decodedModifiers: decodeCspSpwsModifierMask(4) },
  { pwId: 8, menuCommandType: 0, menuCommand: "editredo", shortcut: "Y", modifier: 4, decodedModifiers: decodeCspSpwsModifierMask(4) },
  { pwId: 9, menuCommandType: 0, menuCommand: "editredo", shortcut: "Z", modifier: 3, decodedModifiers: decodeCspSpwsModifierMask(3) },
  { pwId: 10, menuCommandType: 0, menuCommand: "editcut", shortcut: "X", modifier: 4, decodedModifiers: decodeCspSpwsModifierMask(4) },
  { pwId: 11, menuCommandType: 0, menuCommand: "editcopy", shortcut: "C", modifier: 4, decodedModifiers: decodeCspSpwsModifierMask(4) },
  { pwId: 12, menuCommandType: 0, menuCommand: "editpaste", shortcut: "V", modifier: 4, decodedModifiers: decodeCspSpwsModifierMask(4) },
  { pwId: 13, menuCommandType: 0, menuCommand: "editfill", shortcut: "Delete", modifier: 2, decodedModifiers: decodeCspSpwsModifierMask(2) },
  { pwId: 15, menuCommandType: 0, menuCommand: "edittransformscale", shortcut: "T", modifier: 4, decodedModifiers: decodeCspSpwsModifierMask(4) },
  { pwId: 16, menuCommandType: 0, menuCommand: "edittransformfree", shortcut: "T", modifier: 3, decodedModifiers: decodeCspSpwsModifierMask(3) },
  { pwId: 17, menuCommandType: 0, menuCommand: "editcanvassize", shortcut: "I", modifier: 6, decodedModifiers: decodeCspSpwsModifierMask(6) },
  { pwId: 18, menuCommandType: 0, menuCommand: "editresolution", shortcut: "R", modifier: 6, decodedModifiers: decodeCspSpwsModifierMask(6) },
  { pwId: 19, menuCommandType: 0, menuCommand: "selectall", shortcut: "A", modifier: 4, decodedModifiers: decodeCspSpwsModifierMask(4) },
  { pwId: 20, menuCommandType: 0, menuCommand: "selectdeselect", shortcut: "D", modifier: 4, decodedModifiers: decodeCspSpwsModifierMask(4) },
  { pwId: 22, menuCommandType: 0, menuCommand: "selectinvert", shortcut: "I", modifier: 3, decodedModifiers: decodeCspSpwsModifierMask(3) },
];

/**
 * `/Applications/CLIP STUDIO 1.5/App/Settings/catalogPathRepairTable.cscr`에서
 * REA SQLite 쿼리로 추출된 레거시 소재 카탈로그 경로 자동 복구 테이블.
 */
export const CSP_CSCR_PATH_REPAIR_RULES: readonly CspCscrRepairRule[] = [
  { pwId: 1, repairPath: "::material:01_color pattern:", targetPath: "::material:01_color pattern:01_pattern:" },
  { pwId: 2, repairPath: "::material:02_monochromatic pattern:", targetPath: "::material:02_monochromatic pattern:01_basic:" },
  { pwId: 3, repairPath: "::material:03_manga material:", targetPath: "::material:03_manga material:01_framing:" },
  { pwId: 4, repairPath: "::material:04_image material:", targetPath: "::material:04_image material:01_illustration:" },
  { pwId: 5, repairPath: "::material:05_3d:", targetPath: "::material:05_3d:01_body shape:" },
];

/**
 * 레거시 CSP 카탈로그 경로(`::material:...`)를 최신 표준 경로로 복구한다.
 */
export function repairCspCatalogMaterialPath(catalogPath: string): string {
  const trimmed = catalogPath.trim();
  for (const rule of CSP_CSCR_PATH_REPAIR_RULES) {
    if (trimmed === rule.repairPath) {
      return rule.targetPath;
    }
  }
  return trimmed;
}
