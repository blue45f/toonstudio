/**
 * @file csp-tomd-spws-palette-dock.ts
 * @description Clip Studio Paint 5.1.5 수식 키 설정 데이터베이스(`DefaultToolModifyKey.tomd`, `UXToolModifyKey.tomd`)의
 * `ModifyKeySetting.SettingData` Big-Endian 바이너리 코덱,
 * 그리고 워크스페이스(`.spws` `presetMac_1..3.spws`) 내 35종 `palettekind*` 도킹 팔레트·21종 커맨드 바·단축키 명세.
 */

// ============================================================================
// 1. DefaultToolModifyKey.tomd & UXToolModifyKey.tomd Binary SettingData Codec
// ============================================================================

/**
 * `.tomd` `ModifyKeySetting.SettingData` 내부의 수식 키 비트마스크:
 * - `0x01` (1): Shift
 * - `0x02` (2): Ctrl / Command
 * - `0x04` (4): Alt / Option
 * - `0x08` (8): Space
 * - `0x2000` (8192): Stylus Tail Switch (펜 뒷부분 지우개 스위치)
 * - `0x00010000`: Middle Mouse Click (휠 클릭)
 * - `0x00100000`: Left Mouse Click
 * - `0x00200000`: Right Mouse Click (우클릭)
 */
export type CspModifierKeyActionKind =
  | "none"
  | "tool_specific_operation"
  | "temporary_tool_switch"
  | "common_command"
  | "change_brush_size_drag";

export interface CspTomdModifyKeyEntry {
  readonly entryByteLength: 16 | 36;
  readonly modifierFlags: number;
  readonly actionCode: number;
  readonly actionKind: CspModifierKeyActionKind;
  readonly subParameter: number;
  readonly targetNodeUuidHex: string | null;
  readonly resolvedTargetToolNameKo: string | null;
}

export interface CspTomdModifyKeySettingRecord {
  readonly headerByteLength: number;
  readonly entryCount: number;
  readonly entries: readonly CspTomdModifyKeyEntry[];
}

/**
 * `EditImageTool.todb` 및 `UXEditImageTool.todb`의 `Node.NodeUuid`(16바이트)와
 * `.tomd` `SettingData`가 참조하는 일시 전환 대상 보조 도구 매핑.
 */
export const CSP_TOMD_TARGET_UUID_TO_TOOL_KO: Readonly<Record<string, string>> = {
  // DefaultToolModifyKey.tomd (Studio Mode)
  "2374f61d92d44a74a6a4f104d8e73d2f": "손바닥",
  "9deef8fe2f1f4a769a45cd56ac0f9d2b": "줌 인",
  "d8e1fc78166f47c690d4e2bf3a6a8744": "줌 아웃",
  "60ed45f99281492898f7bd793e041b20": "회전",
  "36bd5b6145c6438dbf55634ef6f0fcfe": "지우개",
  "641c6cb9c30146bfb1d7bf2804b1d713": "오브젝트",
  "5285bb0e0b114db0a03c11728ca55def": "스포이트",
  "6a6b33e53d5b49269b660555acd5e2c7": "오브젝트",
  // UXToolModifyKey.tomd (Simple / Tablet UX Mode)
  "f420a3b2bb8f4eae88d6f931a9d67642": "스포이트",
  "e26391dbd33c4340952b2a4fe7ccf44b": "오브젝트",
};

function bytesToHex16(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    out += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return out;
}

function hex16ToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-f]/gi, "").padEnd(32, "0").slice(0, 32);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16) & 0xff;
  }
  return out;
}

function classifyTomdActionKind(
  entryLen: 16 | 36,
  actionCode: number,
): CspModifierKeyActionKind {
  if (entryLen === 36 && actionCode === 2) {
    return "temporary_tool_switch";
  }
  if (actionCode === 64) {
    return "change_brush_size_drag";
  }
  if (actionCode === 1) {
    return "tool_specific_operation";
  }
  if (actionCode === 4) {
    return "common_command";
  }
  return "none";
}

/**
 * `DefaultToolModifyKey.tomd` 및 `UXToolModifyKey.tomd`의 `ModifyKeySetting.SettingData` BLOB을 파싱합니다.
 * (실제 84개 행, 244개 엔트리 전수 검증 완료)
 */
export function parseCspTomdModifyKeySettingBlob(
  blob: Uint8Array,
): CspTomdModifyKeySettingRecord {
  if (blob.byteLength < 8) {
    throw new Error(`Invalid .tomd SettingData blob: byteLength=${blob.byteLength}`);
  }
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const headerByteLength = view.getUint32(0, false);
  const entryCount = view.getUint32(4, false);
  if (headerByteLength !== 8) {
    throw new Error(`Unexpected .tomd SettingData headerByteLength: ${headerByteLength}`);
  }

  const entries: CspTomdModifyKeyEntry[] = [];
  let cursor = 8;

  for (let i = 0; i < entryCount; i += 1) {
    if (cursor + 4 > blob.byteLength) {
      throw new Error(`Truncated .tomd SettingData entry at offset ${cursor}`);
    }
    const entryLen = view.getUint32(cursor, false);
    if (entryLen === 36) {
      const modifierFlags = view.getUint32(cursor + 4, false);
      const actionCode = view.getUint32(cursor + 8, false);
      const subParameter = view.getUint32(cursor + 12, false);
      const uuidLen = view.getUint32(cursor + 16, false);
      if (uuidLen !== 16) {
        throw new Error(`Unexpected .tomd UUID length: ${uuidLen}`);
      }
      const uuidHex = bytesToHex16(blob.subarray(cursor + 20, cursor + 36));
      entries.push({
        entryByteLength: 36,
        modifierFlags,
        actionCode,
        actionKind: classifyTomdActionKind(36, actionCode),
        subParameter,
        targetNodeUuidHex: uuidHex,
        resolvedTargetToolNameKo: CSP_TOMD_TARGET_UUID_TO_TOOL_KO[uuidHex] ?? null,
      });
      cursor += 36;
    } else if (entryLen === 16) {
      const modifierFlags = view.getUint32(cursor + 4, false);
      const actionCode = view.getUint32(cursor + 8, false);
      const subParameter = view.getUint32(cursor + 12, false);
      entries.push({
        entryByteLength: 16,
        modifierFlags,
        actionCode,
        actionKind: classifyTomdActionKind(16, actionCode),
        subParameter,
        targetNodeUuidHex: null,
        resolvedTargetToolNameKo: null,
      });
      cursor += 16;
    } else {
      throw new Error(`Unsupported .tomd entryByteLength: ${entryLen}`);
    }
  }

  return {
    headerByteLength,
    entryCount,
    entries,
  };
}

/**
 * `.tomd` `ModifyKeySetting.SettingData` 레코드를 Big-Endian 바이트열로 인코딩합니다.
 */
export function encodeCspTomdModifyKeySettingBlob(
  entries: readonly CspTomdModifyKeyEntry[],
): Uint8Array {
  let totalBytes = 8;
  for (const e of entries) {
    totalBytes += e.entryByteLength;
  }
  const out = new Uint8Array(totalBytes);
  const view = new DataView(out.buffer);
  view.setUint32(0, 8, false);
  view.setUint32(4, entries.length, false);

  let cursor = 8;
  for (const e of entries) {
    view.setUint32(cursor, e.entryByteLength, false);
    view.setUint32(cursor + 4, e.modifierFlags >>> 0, false);
    view.setUint32(cursor + 8, e.actionCode >>> 0, false);
    view.setUint32(cursor + 12, e.subParameter >>> 0, false);
    if (e.entryByteLength === 36) {
      view.setUint32(cursor + 16, 16, false);
      out.set(hex16ToBytes(e.targetNodeUuidHex ?? ""), cursor + 20);
      cursor += 36;
    } else {
      cursor += 16;
    }
  }
  return out;
}

/**
 * 수식 키 조합(Shift, Ctrl/Cmd, Alt/Option, Space, 펜 뒷부분 스위치)으로부터
 * 클립스튜디오 표준 일시 전환 도구 및 동작을 판정합니다.
 */
export function resolveCspModifierKeyBehavior(params: {
  readonly shiftKey?: boolean;
  readonly ctrlOrMetaKey?: boolean;
  readonly altKey?: boolean;
  readonly spaceKey?: boolean;
  readonly stylusTailEraser?: boolean;
}): {
  readonly modifierFlags: number;
  readonly labelKo: string;
  readonly temporaryToolKo: string;
  readonly descriptionKo: string;
} {
  let flags = 0;
  if (params.shiftKey) flags |= 1;
  if (params.ctrlOrMetaKey) flags |= 2;
  if (params.altKey) flags |= 4;
  if (params.spaceKey) flags |= 8;
  if (params.stylusTailEraser) flags |= 8192;

  if (params.stylusTailEraser) {
    return {
      modifierFlags: flags,
      labelKo: "펜 뒷부분 스위치",
      temporaryToolKo: "지우개",
      descriptionKo: "스타일러스 뒷부분 스위치 입력 중 지우개 도구로 일시 전환",
    };
  }
  if (params.spaceKey && params.ctrlOrMetaKey) {
    return {
      modifierFlags: flags,
      labelKo: "Space + Ctrl/Cmd",
      temporaryToolKo: "줌 인",
      descriptionKo: "캔버스 드래그로 실시간 확대/축소",
    };
  }
  if (params.spaceKey && params.altKey) {
    return {
      modifierFlags: flags,
      labelKo: "Space + Alt",
      temporaryToolKo: "줌 아웃",
      descriptionKo: "캔버스 클릭·드래그로 축소",
    };
  }
  if (params.spaceKey && params.shiftKey) {
    return {
      modifierFlags: flags,
      labelKo: "Space + Shift",
      temporaryToolKo: "회전",
      descriptionKo: "캔버스 뷰포트 자유 회전",
    };
  }
  if (params.spaceKey) {
    return {
      modifierFlags: flags,
      labelKo: "Space",
      temporaryToolKo: "손바닥",
      descriptionKo: "캔버스 패닝(이동) 도구로 일시 전환",
    };
  }
  if (params.ctrlOrMetaKey && params.altKey) {
    return {
      modifierFlags: flags,
      labelKo: "Ctrl/Cmd + Alt",
      temporaryToolKo: "브러시 크기 조절",
      descriptionKo: "좌우 드래그로 브러시 직경 및 불투명도 실시간 변경 (actionCode=64)",
    };
  }
  if (params.altKey) {
    return {
      modifierFlags: flags,
      labelKo: "Alt / Option",
      temporaryToolKo: "스포이트",
      descriptionKo: "캔버스 표시색 즉시 추출",
    };
  }
  if (params.ctrlOrMetaKey) {
    return {
      modifierFlags: flags,
      labelKo: "Ctrl / Cmd",
      temporaryToolKo: "오브젝트",
      descriptionKo: "벡터 제어점·레이어 이동·3D 조작 오브젝트 도구로 일시 전환",
    };
  }
  if (params.shiftKey) {
    return {
      modifierFlags: flags,
      labelKo: "Shift",
      temporaryToolKo: "직선 그리기",
      descriptionKo: "직전 스트로크 끝점에서 현재 커서까지 직선 보간 (subParameter=100)",
    };
  }
  return {
    modifierFlags: 0,
    labelKo: "기본 입력",
    temporaryToolKo: "현재 보조 도구",
    descriptionKo: "수식 키 오버라이드 없이 선택된 브러시/도구 실행",
  };
}

// ============================================================================
// 2. .spws (presetMac_1..3.spws) 35 Dock Palettes, 21 Command Bar Items, Shortcuts
// ============================================================================

export interface CspSpwsDockPaletteSpec {
  readonly paletteKindId: string;
  readonly titleKo: string;
  readonly defaultDockSide: "left" | "right" | "bottom" | "floating";
  readonly statePropertyKeys: readonly string[];
}

/**
 * `presetMac_1.spws` (`일러스트`), `presetMac_2.spws` (`코믹`), `presetMac_3.spws` (`카테고리별`)의
 * `workspaceplacement` BLOB에서 추출한 28종 핵심 팔레트(+ 소재 10탭) 도킹 명세.
 */
export const CSP_SPWS_DOCK_PALETTE_KIND_SPECS: readonly CspSpwsDockPaletteSpec[] = [
  {
    paletteKindId: "palettekindtool",
    titleKo: "도구",
    defaultDockSide: "left",
    statePropertyKeys: ["toolviewinforeordertype", "toolviewinfoshowcoloricon", "toolviewinfotoolicontype"],
  },
  {
    paletteKindId: "palettekindsubtool",
    titleKo: "보조 도구",
    defaultDockSide: "left",
    statePropertyKeys: ["subtoolviewinforeordertype", "subtoolviewinfoshowtoolbar", "subtoolviewinfoitemsizekey"],
  },
  {
    paletteKindId: "palettekindtooloption",
    titleKo: "도구 속성",
    defaultDockSide: "left",
    statePropertyKeys: ["toolpropertyshowstrokepreview", "toolpropertyshowobjectparameter", "toolpropertyopendetailkey"],
  },
  {
    paletteKindId: "palettekindbrushsize",
    titleKo: "브러시 크기",
    defaultDockSide: "left",
    statePropertyKeys: ["brushsizeviewinfoopendetailkey", "brushsizeviewinfosettingversion"],
  },
  {
    paletteKindId: "palettekindtoolslider",
    titleKo: "도구 슬라이더",
    defaultDockSide: "left",
    statePropertyKeys: ["xscaleI", "yscaleI"],
  },
  {
    paletteKindId: "palettekindcolorcircle",
    titleKo: "컬러 서클",
    defaultDockSide: "left",
    statePropertyKeys: ["colorcircleviewinfobarstyle", "colorcircleviewinfoishsv", "colorselectionshowcoloricon"],
  },
  {
    paletteKindId: "palettekindcolorslider",
    titleKo: "컬러 슬라이더",
    defaultDockSide: "left",
    statePropertyKeys: ["colorselectionview0", "colorselectionview1", "colorselectionview2"],
  },
  {
    paletteKindId: "palettekindcolorset",
    titleKo: "컬러 세트",
    defaultDockSide: "left",
    statePropertyKeys: ["colorsetviewinforeordertype", "colorsetviewinfocelldisplaytype", "colorsetviewinfocolorsetindex"],
  },
  {
    paletteKindId: "palettekindcolorblend",
    titleKo: "중간색",
    defaultDockSide: "left",
    statePropertyKeys: ["colorblendviewinfobarstyle", "colorblendviewinfotilemode", "colorblendviewinfotilesize", "colorblendviewinfoshowgrid"],
  },
  {
    paletteKindId: "palettekindcolorguide",
    titleKo: "근사색",
    defaultDockSide: "left",
    statePropertyKeys: ["colorguideviewinfobarstyle", "colorguideviewinfotilesize", "colorguideviewinfotilemode", "colorguideviewinfoshowgrid"],
  },
  {
    paletteKindId: "palettekindcolorhistory",
    titleKo: "컬러 히스토리",
    defaultDockSide: "left",
    statePropertyKeys: ["colorhistoryviewinfocolorinfobarstyle", "colorhistoryviewinfocelldisplaytype"],
  },
  {
    paletteKindId: "palettekindmix",
    titleKo: "색 혼합",
    defaultDockSide: "left",
    statePropertyKeys: ["mixpaletteshowcolorset", "mixpaletteshowtoolbar"],
  },
  {
    paletteKindId: "palettekindquickaccess",
    titleKo: "빠른 액세스",
    defaultDockSide: "left",
    statePropertyKeys: ["toolbarbuttonstep", "toolbarbuttonsize", "toolbarviewstyle", "setviewtype"],
  },
  {
    paletteKindId: "palettekindnavigator",
    titleKo: "네비게이터",
    defaultDockSide: "right",
    statePropertyKeys: ["navigatorviewinfoshowtoolbar"],
  },
  {
    paletteKindId: "palettekindsubview",
    titleKo: "보조 뷰",
    defaultDockSide: "right",
    statePropertyKeys: ["subviewshowrotate", "subviewshowtoolbar", "subviewshowspuitcircle", "subviewtoolkind"],
  },
  {
    paletteKindId: "palettekinditembank",
    titleKo: "아이템 뱅크",
    defaultDockSide: "right",
    statePropertyKeys: ["tenantsH"],
  },
  {
    paletteKindId: "palettekindmemoryinformation",
    titleKo: "정보",
    defaultDockSide: "right",
    statePropertyKeys: ["informationviewinfoshowworktimeinfo", "informationviewinfoshowhvlinfo", "informationviewinfoshowmousepointinfo", "informationviewinfoshowmemoryinfo"],
  },
  {
    paletteKindId: "palettekindlayercomp",
    titleKo: "레이어 컴프",
    defaultDockSide: "right",
    statePropertyKeys: ["layercompviewinfoshowtoolbar", "layercompviewinfoshowaddedlayer"],
  },
  {
    paletteKindId: "palettekindproperty",
    titleKo: "레이어 속성",
    defaultDockSide: "right",
    statePropertyKeys: ["layerpropertyviewinfoopendetailkey", "layerpropertyviewinfosettingversion"],
  },
  {
    paletteKindId: "palettekindlayerfind",
    titleKo: "레이어 검색",
    defaultDockSide: "right",
    statePropertyKeys: ["LayerFindKeywordHistoryH", "LayerFindExcludeAttributeH", "LayerFindAcceptAttributeH", "LayerFindLayerTypeH"],
  },
  {
    paletteKindId: "palettekindlighttable",
    titleKo: "애니메이션 셀 (라이트 테이블)",
    defaultDockSide: "right",
    statePropertyKeys: ["LightTableShowReferOnLayer", "LightTableShowReferOnCanvas", "LightTableThumnailMode"],
  },
  {
    paletteKindId: "palettekindaligndistribute",
    titleKo: "정렬·분포",
    defaultDockSide: "right",
    statePropertyKeys: ["tenantsH"],
  },
  {
    paletteKindId: "palettekindlayerorder",
    titleKo: "레이어",
    defaultDockSide: "right",
    statePropertyKeys: ["LayerPutToolBarBottom", "LayerShowPropertyBar", "LayerThumnailDrawTransparent", "LayerThumnailSize"],
  },
  {
    paletteKindId: "palettekindhistory",
    titleKo: "히스토리",
    defaultDockSide: "right",
    statePropertyKeys: ["tenantsH"],
  },
  {
    paletteKindId: "palettekindaction",
    titleKo: "오토 액션",
    defaultDockSide: "right",
    statePropertyKeys: ["ActionIsButtonMode", "ActionShowToolBar", "ActionShowActionSetBar", "ActionCurrentSetIndex"],
  },
  {
    paletteKindId: "palettekindmaterial0",
    titleKo: "소재 (전체·컬러패턴·단색패턴·만화·이미지·3D·브러시·다운로드)",
    defaultDockSide: "right",
    statePropertyKeys: ["materialshowdetailview", "materialsortmode", "materialliststyle", "materialtagandlistsplitterpos"],
  },
  {
    paletteKindId: "palettekindtimeline",
    titleKo: "타임라인",
    defaultDockSide: "bottom",
    statePropertyKeys: ["timelineviewthumbnailsizemain", "timelineviewtracktitlewidthmain", "timelineviewthumbnaildrawtransparentmain"],
  },
  {
    paletteKindId: "palettekindmultiview",
    titleKo: "4면도",
    defaultDockSide: "floating",
    statePropertyKeys: ["multicanvashorizontalsplitter", "multicanvasverticalsplitter", "multicanvassyncpersview", "multicanvasshowfaceedge"],
  },
] as const;

export interface CspSpwsCommandBarItemSpec {
  readonly pwId: number;
  readonly categoryIndex: number;
  readonly itemGroupIndex: number;
  readonly commandIdType: "basiccommand" | "advancedcommand";
  readonly command: string;
  readonly labelKo: string;
}

/**
 * `presetMac_1..3.spws`의 `workspacetoolbaritem` 테이블에서 추출한 상단 커맨드 바 21개 기본 항목.
 */
export const CSP_SPWS_COMMAND_BAR_ITEMS: readonly CspSpwsCommandBarItemSpec[] = [
  { pwId: 22, categoryIndex: 0, itemGroupIndex: 0, commandIdType: "advancedcommand", command: "filebootclipstudio", labelKo: "CLIP STUDIO 열기" },
  { pwId: 23, categoryIndex: 1, itemGroupIndex: 0, commandIdType: "advancedcommand", command: "filenew", labelKo: "신규 작품" },
  { pwId: 24, categoryIndex: 1, itemGroupIndex: 1, commandIdType: "advancedcommand", command: "fileopen", labelKo: "열기" },
  { pwId: 25, categoryIndex: 1, itemGroupIndex: 2, commandIdType: "advancedcommand", command: "filesave", labelKo: "저장" },
  { pwId: 26, categoryIndex: 1, itemGroupIndex: 3, commandIdType: "advancedcommand", command: "filesavemergeimagejpg", labelKo: "화상을 통합하여 .jpg 내보내기" },
  { pwId: 27, categoryIndex: 1, itemGroupIndex: 4, commandIdType: "advancedcommand", command: "filesavemergeimagepng", labelKo: "화상을 통합하여 .png 내보내기" },
  { pwId: 28, categoryIndex: 1, itemGroupIndex: 5, commandIdType: "advancedcommand", command: "3D617F46-7D99-44b2-80C1-2BEF6F9EBE33", labelKo: ".psd(Photoshop 문서)로 저장" },
  { pwId: 29, categoryIndex: 2, itemGroupIndex: 0, commandIdType: "basiccommand", command: "undo", labelKo: "실행 취소" },
  { pwId: 30, categoryIndex: 2, itemGroupIndex: 1, commandIdType: "basiccommand", command: "redo", labelKo: "다시 실행" },
  { pwId: 31, categoryIndex: 3, itemGroupIndex: 0, commandIdType: "basiccommand", command: "clear", labelKo: "삭제" },
  { pwId: 32, categoryIndex: 3, itemGroupIndex: 1, commandIdType: "advancedcommand", command: "editclearoutofselectarea", labelKo: "선택 범위 밖 삭제" },
  { pwId: 33, categoryIndex: 3, itemGroupIndex: 2, commandIdType: "advancedcommand", command: "editpaint", labelKo: "채우기" },
  { pwId: 34, categoryIndex: 3, itemGroupIndex: 3, commandIdType: "advancedcommand", command: "transformstretch", labelKo: "확대·축소·회전" },
  { pwId: 35, categoryIndex: 4, itemGroupIndex: 0, commandIdType: "advancedcommand", command: "selectdeselect", labelKo: "선택 해제" },
  { pwId: 36, categoryIndex: 4, itemGroupIndex: 1, commandIdType: "advancedcommand", command: "selectinvert", labelKo: "선택 범위 반전" },
  { pwId: 37, categoryIndex: 4, itemGroupIndex: 2, commandIdType: "advancedcommand", command: "selectshow", labelKo: "선택 범위 경계선 표시" },
  { pwId: 38, categoryIndex: 5, itemGroupIndex: 0, commandIdType: "advancedcommand", command: "viewsnapruler", labelKo: "자에 스냅" },
  { pwId: 39, categoryIndex: 5, itemGroupIndex: 1, commandIdType: "advancedcommand", command: "viewsnapspecialruler", labelKo: "특수 자에 스냅" },
  { pwId: 40, categoryIndex: 5, itemGroupIndex: 2, commandIdType: "advancedcommand", command: "viewsnapgrid", labelKo: "그리드에 스냅" },
  { pwId: 41, categoryIndex: 6, itemGroupIndex: 0, commandIdType: "advancedcommand", command: "helponlinehowto", labelKo: "사용법 강좌" },
  { pwId: 42, categoryIndex: 6, itemGroupIndex: 1, commandIdType: "advancedcommand", command: "helponlinesupport", labelKo: "고객 지원" },
] as const;
