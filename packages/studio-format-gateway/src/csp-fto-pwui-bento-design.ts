/**
 * @file csp-fto-pwui-bento-design.ts
 * @description Clip Studio 1.5 (`CLIP STUDIO.app` + `CLIP STUDIO PAINT.app` v5.1.5) UI/UX 디자인 아키텍처 심층 내재화:
 * 1. `Resources/clipstudio_assets/asset01..05.fto` (`OTTO` OpenType CFF 내장 만화/코믹 폰트 5종 & 세로쓰기 `VORG`/`vhea`/`vmtx` 파서)
 * 2. `Resources/korean/742DEA58-ED6B-4402-BC11-20DFC6D08040` (스튜디오 모드 507개 다이얼로그/팔레트) 및
 *    `5634F3A9-5D0B-4f87-8BC1-DAB1F89966C3` (심플/터치 UX 40개 다이얼로그) 절대 오프셋 중첩 리소스 아카이브 & 27종 `PW*` UI 위젯 트리 코덱
 * 3. `Resources/korean/46B67EA9-0F39-4DE3-A9C2-EAFF2FE37099` 내장 `PWGLCalcVividColor` 3D 툰 셰이딩 & 비비드 반사광 색채 보정 엔진
 * 4. `Settings/CLIP STUDIO3/MENUv3/` (`menu.css`, `menu.js`, `icon_menu_*.svg` 18종) 라이트/다크 디자인 토큰 및 벤토(Bento) 런처 명세
 */

// ============================================================================
// 1. clipstudio_assets/asset01..05.fto (OpenType CFF Comic/Manga Fonts)
// ============================================================================

export interface CspFtoFontSpec {
  readonly assetFileName: string;
  readonly byteSize: number;
  readonly postScriptName: string;
  readonly familyName: string;
  readonly roleKo: string;
  readonly supportsVerticalTypesetting: boolean;
  readonly sfntTables: readonly string[];
}

/**
 * `/Applications/CLIP STUDIO 1.5/App/CLIP STUDIO PAINT.app/Contents/Resources/clipstudio_assets/asset01..05.fto`에서
 * 추출한 5종 내장 OpenType CFF(`OTTO`) 만화·웹툰 대사용 폰트 명세.
 */
export const CSP_BUILTIN_FTO_FONTS: readonly CspFtoFontSpec[] = [
  {
    assetFileName: "asset01.fto",
    byteSize: 2_594_464,
    postScriptName: "IwaAntStd-Bd",
    familyName: "Iwata Antic Std B",
    roleKo: "이와타 안틱체 Bold (만화 말풍선 세로·가로 조판 표준 서체)",
    supportsVerticalTypesetting: true,
    sfntTables: ["BASE", "CFF ", "GPOS", "GSUB", "OS/2", "VORG", "cmap", "head", "hhea", "hmtx", "maxp", "name", "post", "vhea", "vmtx"],
  },
  {
    assetFileName: "asset02.fto",
    byteSize: 574_552,
    postScriptName: "ClipStudioComic-Bold",
    familyName: "Clip Studio Comic",
    roleKo: "클립스튜디오 코믹 Bold (글로벌 웹툰·코믹 대사 강조 서체)",
    supportsVerticalTypesetting: true,
    sfntTables: ["CFF ", "DSIG", "GDEF", "GPOS", "GSUB", "OS/2", "VORG", "cmap", "head", "hhea", "hmtx", "maxp", "name", "post", "vhea", "vmtx"],
  },
  {
    assetFileName: "asset03.fto",
    byteSize: 581_344,
    postScriptName: "ClipStudioComic-BoldItalic",
    familyName: "Clip Studio Comic",
    roleKo: "클립스튜디오 코믹 Bold Italic (외침·효과음 대사 서체)",
    supportsVerticalTypesetting: true,
    sfntTables: ["CFF ", "DSIG", "GDEF", "GPOS", "GSUB", "OS/2", "VORG", "cmap", "head", "hhea", "hmtx", "maxp", "name", "post", "vhea", "vmtx"],
  },
  {
    assetFileName: "asset04.fto",
    byteSize: 581_588,
    postScriptName: "ClipStudioComic-Italic",
    familyName: "Clip Studio Comic",
    roleKo: "클립스튜디오 코믹 Italic (독백·내레이션 대사 서체)",
    supportsVerticalTypesetting: true,
    sfntTables: ["CFF ", "DSIG", "GDEF", "GPOS", "GSUB", "OS/2", "VORG", "cmap", "head", "hhea", "hmtx", "maxp", "name", "post", "vhea", "vmtx"],
  },
  {
    assetFileName: "asset05.fto",
    byteSize: 574_588,
    postScriptName: "ClipStudioComic-Regular",
    familyName: "Clip Studio Comic",
    roleKo: "클립스튜디오 코믹 Regular (기본 대사 서체)",
    supportsVerticalTypesetting: true,
    sfntTables: ["CFF ", "DSIG", "GDEF", "GPOS", "GSUB", "OS/2", "VORG", "cmap", "head", "hhea", "hmtx", "maxp", "name", "post", "vhea", "vmtx"],
  },
] as const;

export interface CspFtoTableRecord {
  readonly tag: string;
  readonly checkSum: number;
  readonly offset: number;
  readonly length: number;
}

export interface CspFtoFontHeaderResult {
  readonly sfntSignature: "OTTO" | "TTF";
  readonly numTables: number;
  readonly searchRange: number;
  readonly entrySelector: number;
  readonly rangeShift: number;
  readonly tables: readonly CspFtoTableRecord[];
  readonly supportsVerticalTypesetting: boolean;
}

/**
 * `.fto`(`asset01..05.fto`, `.otf` 역순 확장자) OpenType CFF 바이너리 헤더 및 SFNT 테이블 디렉터리를 파싱합니다.
 */
export function parseCspFtoOpenTypeFontHeader(bytes: Uint8Array): CspFtoFontHeaderResult {
  if (bytes.byteLength < 12) {
    throw new Error(`Invalid .fto OpenType font buffer: byteLength=${bytes.byteLength}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sig = view.getUint32(0, false);
  const sfntSignature: "OTTO" | "TTF" =
    sig === 0x4f54544f ? "OTTO" : sig === 0x00010000 ? "TTF" : (() => {
      throw new Error(`Unsupported .fto sfnt signature: 0x${sig.toString(16)}`);
    })();

  const numTables = view.getUint16(4, false);
  const searchRange = view.getUint16(6, false);
  const entrySelector = view.getUint16(8, false);
  const rangeShift = view.getUint16(10, false);

  if (bytes.byteLength < 12 + numTables * 16) {
    throw new Error(`Truncated .fto table directory: numTables=${numTables}`);
  }

  const tables: CspFtoTableRecord[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const base = 12 + i * 16;
    const tag = String.fromCharCode(
      bytes[base] ?? 32,
      bytes[base + 1] ?? 32,
      bytes[base + 2] ?? 32,
      bytes[base + 3] ?? 32,
    );
    tables.push({
      tag,
      checkSum: view.getUint32(base + 4, false),
      offset: view.getUint32(base + 8, false),
      length: view.getUint32(base + 12, false),
    });
  }

  const tagSet = new Set(tables.map((t) => t.tag));
  const supportsVerticalTypesetting =
    tagSet.has("VORG") && tagSet.has("vhea") && tagSet.has("vmtx");

  return {
    sfntSignature,
    numTables,
    searchRange,
    entrySelector,
    rangeShift,
    tables,
    supportsVerticalTypesetting,
  };
}

// ============================================================================
// 2. PW* UI Widget Classes & Absolute-Offset Nested UI Dialog Archive Codec
// ============================================================================

export type CspPwWidgetClassName =
  | "PWWindow"
  | "PWView"
  | "PWViewAttachment"
  | "PWScrollView"
  | "PWGroupBox"
  | "PWPiece"
  | "PWPushButton"
  | "PWPopupButton"
  | "PWPopupSliderButton"
  | "PWColorButton"
  | "PWColorSlider"
  | "PWSliderBar"
  | "PWEditBox"
  | "PWScrollEditBox"
  | "PWEditSliderJoint"
  | "PWEditComboJoint"
  | "PWCheckBox"
  | "PWCheckBoxEnabler"
  | "PWRadioGroup"
  | "PWListBox"
  | "PWProgressBar"
  | "PWStaticIcon"
  | "PWStaticText"
  | "PWMenu"
  | "PWMenuItem"
  | "PWCommandShortcut"
  | "PWModuleInfo";

export interface CspPwWidgetClassSpec {
  readonly className: CspPwWidgetClassName;
  readonly category: "container" | "composite_control" | "button" | "input" | "menu";
  readonly descriptionKo: string;
}

/**
 * `742DEA58-ED6B-4402-BC11-20DFC6D08040` (스튜디오 모드 507개 다이얼로그) 및
 * `5634F3A9-5D0B-4f87-8BC1-DAB1F89966C3` (심플/터치 UX 40개 다이얼로그)에서 추출한 27종 `PW*` 위젯 명세.
 */
export const CSP_PW_UI_WIDGET_CLASSES: readonly CspPwWidgetClassSpec[] = [
  { className: "PWWindow", category: "container", descriptionKo: "모달/비모달 최상위 다이얼로그 윈도우 컨테이너" },
  { className: "PWView", category: "container", descriptionKo: "패널·탭·서브영역 레이아웃 뷰 컨테이너" },
  { className: "PWViewAttachment", category: "container", descriptionKo: "동적 서브뷰 도킹 어태치먼트 슬롯" },
  { className: "PWScrollView", category: "container", descriptionKo: "스크롤 가능한 팔레트/리스트 컨테이너" },
  { className: "PWGroupBox", category: "container", descriptionKo: "제목과 테두리를 가진 설정 그룹 박스" },
  { className: "PWPiece", category: "container", descriptionKo: "팔레트 내부 모듈형 UI 조각(Piece) 단위" },
  { className: "PWEditSliderJoint", category: "composite_control", descriptionKo: "게이지 슬라이더 바와 정밀 수치 입력 박스를 결합한 클립스튜디오 시그니처 복합 컨트롤" },
  { className: "PWEditComboJoint", category: "composite_control", descriptionKo: "프리셋 드롭다운 팝업과 수치 에디트 박스를 결합한 복합 컨트롤" },
  { className: "PWCheckBoxEnabler", category: "composite_control", descriptionKo: "체크 상태에 따라 하위 위젯 그룹 전체의 활성/비활성 상태를 제어하는 인에이블러" },
  { className: "PWPopupSliderButton", category: "composite_control", descriptionKo: "클릭 시 팝업 슬라이더 바를 펼치는 컴팩트 툴바 버튼" },
  { className: "PWPushButton", category: "button", descriptionKo: "표준 푸시 액션 버튼 (OK/취소/초기화/실행)" },
  { className: "PWPopupButton", category: "button", descriptionKo: "드롭다운 메뉴/선택지를 여는 팝업 버튼" },
  { className: "PWColorButton", category: "button", descriptionKo: "클릭 시 컬러 피커를 여는 색상 스와치 버튼" },
  { className: "PWColorSlider", category: "input", descriptionKo: "채널별 그라데이션 트랙을 표시하는 컬러 슬라이더" },
  { className: "PWSliderBar", category: "input", descriptionKo: "단일 수치 조작용 슬라이더 바" },
  { className: "PWEditBox", category: "input", descriptionKo: "단일 행 텍스트/수치 입력 에디트 박스" },
  { className: "PWScrollEditBox", category: "input", descriptionKo: "다중 행 스크롤 텍스트 에디트 박스" },
  { className: "PWCheckBox", category: "input", descriptionKo: "불리언 옵션 토글 체크박스" },
  { className: "PWRadioGroup", category: "input", descriptionKo: "배타적 단일 선택 라디오 버튼 그룹" },
  { className: "PWListBox", category: "input", descriptionKo: "다중 항목 선택 리스트 박스" },
  { className: "PWProgressBar", category: "input", descriptionKo: "작업 진행률 표시 프로그레스 바" },
  { className: "PWStaticIcon", category: "input", descriptionKo: "고정 아이콘 이미지/벡터 글리프 뷰" },
  { className: "PWStaticText", category: "input", descriptionKo: "고정 레이블 텍스트 뷰" },
  { className: "PWMenu", category: "menu", descriptionKo: "컨텍스트/팔레트 팝업 메뉴 루트" },
  { className: "PWMenuItem", category: "menu", descriptionKo: "메뉴 개별 명령 항목" },
  { className: "PWCommandShortcut", category: "menu", descriptionKo: "단축키 매핑 바인딩 엔트리" },
  { className: "PWModuleInfo", category: "menu", descriptionKo: "애플리케이션 모듈 메타데이터 헤더" },
] as const;

export interface CspUiDialogEntry {
  readonly dialogId: number;
  readonly strings: Readonly<Record<number, string>>;
  readonly widgetClassNames: readonly string[];
}

export interface CspUiDialogArchiveResult {
  readonly dialogCount: number;
  readonly dialogs: readonly CspUiDialogEntry[];
}

function readBeIndexTable(
  raw: Uint8Array,
  view: DataView,
  tableOffset: number,
): readonly { readonly id: number; readonly offset: number; readonly length: number }[] {
  if (tableOffset < 0 || tableOffset + 4 > raw.byteLength) {
    return [];
  }
  const count = view.getUint32(tableOffset, false);
  if (count === 0 || count > 4096 || tableOffset + 4 + count * 12 > raw.byteLength) {
    return [];
  }
  const entries: { id: number; offset: number; length: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const base = tableOffset + 4 + i * 12;
    entries.push({
      id: view.getUint32(base, false),
      offset: view.getUint32(base + 4, false),
      length: view.getUint32(base + 8, false),
    });
  }
  return entries;
}

function extractAsciiPwWidgets(slice: Uint8Array): readonly string[] {
  const found: string[] = [];
  for (let i = 0; i + 4 <= slice.byteLength; i += 1) {
    if (slice[i] === 0x50 && slice[i + 1] === 0x57) {
      // 'PW'
      let end = i + 2;
      while (
        end < slice.byteLength &&
        ((slice[end]! >= 0x30 && slice[end]! <= 0x39) ||
          (slice[end]! >= 0x41 && slice[end]! <= 0x5a) ||
          (slice[end]! >= 0x61 && slice[end]! <= 0x7a) ||
          slice[end] === 0x5f)
      ) {
        end += 1;
      }
      if (end - i >= 5) {
        let token = "";
        for (let k = i; k < end; k += 1) {
          token += String.fromCharCode(slice[k]!);
        }
        found.push(token);
        i = end - 1;
      }
    }
  }
  return found;
}

/**
 * `Resources/korean/742DEA58-ED6B-4402-BC11-20DFC6D08040` 및 `5634F3A9-5D0B-4f87-8BC1-DAB1F89966C3`와 동일한
 * 절대 파일 오프셋(Absolute File Offset) 기반 중첩 Big-Endian UI 다이얼로그 리소스 아카이브를 파싱합니다.
 */
export function parseCspUiDialogResourceArchive(
  raw: Uint8Array,
  maxDialogs = 600,
): CspUiDialogArchiveResult {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const topEntries = readBeIndexTable(raw, view, 0);
  if (topEntries.length === 0) {
    throw new Error("Invalid CSP UI Dialog Resource Archive: empty top index");
  }

  const c1 = topEntries[0]!;
  const dialogEntries = readBeIndexTable(raw, view, c1.offset);
  const decoder = new TextDecoder("utf-8");
  const dialogs: CspUiDialogEntry[] = [];

  const limit = Math.min(dialogEntries.length, maxDialogs);
  for (let i = 0; i < limit; i += 1) {
    const dlg = dialogEntries[i]!;
    const subParts = readBeIndexTable(raw, view, dlg.offset);
    const strings: Record<number, string> = {};
    let widgetClassNames: readonly string[] = [];

    for (const part of subParts) {
      if (part.id === 1) {
        const strIndex = readBeIndexTable(raw, view, part.offset);
        for (const sEntry of strIndex) {
          if (
            sEntry.length >= 4 &&
            sEntry.offset + 4 <= raw.byteLength &&
            sEntry.offset + sEntry.length <= raw.byteLength
          ) {
            const utf8Len = view.getUint32(sEntry.offset, false);
            const safeEnd = Math.min(
              sEntry.offset + sEntry.length,
              sEntry.offset + 4 + utf8Len,
            );
            if (safeEnd >= sEntry.offset + 4) {
              strings[sEntry.id] = decoder.decode(
                raw.subarray(sEntry.offset + 4, safeEnd),
              );
            }
          }
        }
      } else if (part.id === 4) {
        if (part.offset + part.length <= raw.byteLength) {
          widgetClassNames = extractAsciiPwWidgets(
            raw.subarray(part.offset, part.offset + part.length),
          );
        }
      }
    }

    dialogs.push({
      dialogId: dlg.id,
      strings,
      widgetClassNames,
    });
  }

  return {
    dialogCount: dialogEntries.length,
    dialogs,
  };
}

/**
 * 테스트 및 커스텀 다이얼로그 패키징을 위해 `CspUiDialogEntry[]`를 절대 파일 오프셋 기반
 * 중첩 Big-Endian UI 리소스 아카이브 바이트열로 인코딩합니다.
 */
export function encodeCspUiDialogResourceArchive(
  dialogs: readonly CspUiDialogEntry[],
): Uint8Array {
  const encoder = new TextEncoder();

  // Top header: 1 chunk (id=1) -> 4 + 12 = 16 bytes
  const topHeaderSize = 16;
  const c1IndexSize = 4 + dialogs.length * 12;

  // Measure each dialog size
  const encodedDialogs: {
    dialogId: number;
    strPayloads: { id: number; bytes: Uint8Array }[];
    widgetBytes: Uint8Array;
    byteLength: number;
  }[] = [];

  for (const dlg of dialogs) {
    const strPayloads: { id: number; bytes: Uint8Array }[] = [];
    for (const [idStr, text] of Object.entries(dlg.strings)) {
      const u8 = encoder.encode(text);
      const buf = new Uint8Array(4 + u8.byteLength);
      new DataView(buf.buffer).setUint32(0, u8.byteLength, false);
      buf.set(u8, 4);
      strPayloads.push({ id: Number(idStr), bytes: buf });
    }
    const widgetText = dlg.widgetClassNames.join("\0");
    const widgetBytes = encoder.encode(widgetText);

    const dlgIndexSize = 4 + 2 * 12; // part 1 (strings) + part 4 (widgets)
    const strIndexSize = 4 + strPayloads.length * 12;
    const strDataSize = strPayloads.reduce((acc, s) => acc + s.bytes.byteLength, 0);
    const totalDlgBytes = dlgIndexSize + strIndexSize + strDataSize + widgetBytes.byteLength;

    encodedDialogs.push({
      dialogId: dlg.dialogId,
      strPayloads,
      widgetBytes,
      byteLength: totalDlgBytes,
    });
  }

  const totalC1Size =
    c1IndexSize + encodedDialogs.reduce((acc, d) => acc + d.byteLength, 0);
  const totalFileSize = topHeaderSize + totalC1Size;

  const out = new Uint8Array(totalFileSize);
  const view = new DataView(out.buffer);

  // Top header
  view.setUint32(0, 1, false);
  view.setUint32(4, 1, false);
  view.setUint32(8, topHeaderSize, false);
  view.setUint32(12, totalC1Size, false);

  // c1 index table
  view.setUint32(topHeaderSize, encodedDialogs.length, false);
  let dlgCursor = topHeaderSize + c1IndexSize;

  for (let i = 0; i < encodedDialogs.length; i += 1) {
    const d = encodedDialogs[i]!;
    const idxBase = topHeaderSize + 4 + i * 12;
    view.setUint32(idxBase, d.dialogId, false);
    view.setUint32(idxBase + 4, dlgCursor, false);
    view.setUint32(idxBase + 8, d.byteLength, false);

    // Inside dialog at dlgCursor: 2 parts (id=1 strings, id=4 widgets)
    const dlgIndexSize = 4 + 2 * 12;
    const part1Offset = dlgCursor + dlgIndexSize;
    const strIndexSize = 4 + d.strPayloads.length * 12;
    const strDataSize = d.strPayloads.reduce((acc, s) => acc + s.bytes.byteLength, 0);
    const part1Length = strIndexSize + strDataSize;
    const part4Offset = part1Offset + part1Length;
    const part4Length = d.widgetBytes.byteLength;

    view.setUint32(dlgCursor, 2, false);
    view.setUint32(dlgCursor + 4, 1, false);
    view.setUint32(dlgCursor + 8, part1Offset, false);
    view.setUint32(dlgCursor + 12, part1Length, false);
    view.setUint32(dlgCursor + 16, 4, false);
    view.setUint32(dlgCursor + 20, part4Offset, false);
    view.setUint32(dlgCursor + 24, part4Length, false);

    // Part 1: string index + payloads
    view.setUint32(part1Offset, d.strPayloads.length, false);
    let strCursor = part1Offset + strIndexSize;
    for (let sIdx = 0; sIdx < d.strPayloads.length; sIdx += 1) {
      const sp = d.strPayloads[sIdx]!;
      const sBase = part1Offset + 4 + sIdx * 12;
      view.setUint32(sBase, sp.id, false);
      view.setUint32(sBase + 4, strCursor, false);
      view.setUint32(sBase + 8, sp.bytes.byteLength, false);
      out.set(sp.bytes, strCursor);
      strCursor += sp.bytes.byteLength;
    }

    // Part 4: widget bytes
    out.set(d.widgetBytes, part4Offset);
    dlgCursor += d.byteLength;
  }

  return out;
}

// ============================================================================
// 3. 46B67EA9 PWGLCalcVividColor 3D Toon & Vivid Shadow Chroma Shader Engine
// ============================================================================

export interface CspPwglVividToonParams {
  readonly texRgb01: readonly [number, number, number];
  readonly ambientMaterialRgb01: readonly [number, number, number];
  readonly diffuseMaterialRgb01: readonly [number, number, number];
  readonly lightRgb01: readonly [number, number, number];
  readonly maxLight?: number;
  readonly vividness?: number;
  readonly maxSaturationEffect?: number;
  readonly brightness?: number;
  readonly toonShading?: boolean;
  readonly toonFaultList?: readonly [number, number];
}

function rgb01ToHsv06(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const v = max;
  const s = max <= 1e-6 ? 0 : d / max;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) {
      h = (g - b) / d;
      if (h < 0) h += 6;
    } else if (max === g) {
      h = 2 + (b - r) / d;
    } else {
      h = 4 + (r - g) / d;
    }
  }
  return [h, s, v];
}

function hsv06ToRgb01(
  h: number,
  s: number,
  v: number,
): [number, number, number] {
  const sc = Math.max(0, Math.min(1, s));
  const vc = Math.max(0, Math.min(1, v));
  if (sc <= 1e-6) {
    return [vc, vc, vc];
  }
  const hWrap = ((h % 6) + 6) % 6;
  const i = Math.floor(hWrap);
  const f = hWrap - i;
  const p = vc * (1 - sc);
  const q = vc * (1 - sc * f);
  const t = vc * (1 - sc * (1 - f));
  switch (i) {
    case 0:
      return [vc, t, p];
    case 1:
      return [q, vc, p];
    case 2:
      return [p, vc, t];
    case 3:
      return [p, q, vc];
    case 4:
      return [t, p, vc];
    default:
      return [vc, p, q];
  }
}

/**
 * `Resources/korean/46B67EA9-0F39-4DE3-A9C2-EAFF2FE37099` 내장 GLSL 함수 `PWGLCalcVividColor`를
 * 수식 그대로 재현한 3D 툰 셰이딩 & 비비드 음영 채도 부스트 엔진.
 * - MODELER/六角 호환 재질 보정 계수(`ambient * 0.621118` vs `diffuse`)
 * - `PWGLtoonfaultlist` 4단계 계단화(`0.0`, `fault0`, `fault1`, `1.0`)
 * - 밝고 채도 높은 텍스처의 음영 채도를 높이고 명도 저하를 억제하는 `addSaturation` 보정
 */
export function evaluateCspPwglVividToonShading(
  params: CspPwglVividToonParams,
): {
  readonly shadedRgb01: readonly [number, number, number];
  readonly quantizedLightValue: number;
  readonly appliedSaturationBoost: number;
} {
  const maxLight = params.maxLight ?? 1.0;
  const vividness = params.vividness ?? 5.0;
  const maxSaturationEffect = params.maxSaturationEffect ?? 0.1;
  const brightness = params.brightness ?? 0.8;
  const toonShading = params.toonShading ?? true;
  const fault0 = params.toonFaultList?.[0] ?? 0.35;
  const fault1 = params.toonFaultList?.[1] ?? 0.7;

  // texcolor.rgb *= max(ambient * 0.621118, diffuse)
  const modR =
    params.texRgb01[0] *
    Math.max(params.ambientMaterialRgb01[0] * 0.621118, params.diffuseMaterialRgb01[0]);
  const modG =
    params.texRgb01[1] *
    Math.max(params.ambientMaterialRgb01[1] * 0.621118, params.diffuseMaterialRgb01[1]);
  const modB =
    params.texRgb01[2] *
    Math.max(params.ambientMaterialRgb01[2] * 0.621118, params.diffuseMaterialRgb01[2]);

  const lR = Math.min(maxLight, Math.max(0, params.lightRgb01[0]));
  const lG = Math.min(maxLight, Math.max(0, params.lightRgb01[1]));
  const lB = Math.min(maxLight, Math.max(0, params.lightRgb01[2]));

  const [hue, saturation, value] = rgb01ToHsv06(modR, modG, modB);

  let saturationChange = 0;
  let hueChange = 0;
  let lightValue: number;
  const kError = 1e-4;

  if (
    Math.abs(lR - lG) > kError ||
    Math.abs(lR - lB) > kError
  ) {
    const [lightHue, lightSat, lVal] = rgb01ToHsv06(lR, lG, lB);
    lightValue = lVal;
    saturationChange = lightSat;
    let hueDiff = lightHue - hue;
    if (hueDiff > 3.0) hueDiff -= 6.0;
    else if (hueDiff < -3.0) hueDiff += 6.0;
    hueChange = hueDiff * lightSat * lightValue;
    if (hueChange < 0.0) hueChange += 6.0;
  } else {
    lightValue = lR;
  }

  if (lightValue < 0) lightValue = 0;

  if (toonShading) {
    if (lightValue < 0.05) {
      lightValue = 0.0;
    } else if (lightValue < fault0) {
      lightValue = fault0;
    } else if (lightValue < fault1) {
      lightValue = fault1;
    } else {
      lightValue = 1.0;
    }
  }

  let valueChange = 1.0 - lightValue;
  let addSaturation = 0;
  if (valueChange > 0.0) {
    const satEffect = Math.min(saturation, maxSaturationEffect);
    addSaturation = valueChange * satEffect * value * vividness;
    saturationChange += addSaturation;
    valueChange -= addSaturation * value * brightness;
  }

  const outRgb = hsv06ToRgb01(
    hue + hueChange,
    saturation + saturationChange,
    value - valueChange,
  );

  return {
    shadedRgb01: outRgb,
    quantizedLightValue: lightValue,
    appliedSaturationBoost: addSaturation,
  };
}

// ============================================================================
// 4. Settings/CLIP STUDIO3/MENUv3 Design Tokens & Bento Menu Spec
// ============================================================================

export interface CspThemeColorTokenSet {
  readonly themeId: "light" | "dark";
  readonly colorMain: string;
  readonly colorMain50: string;
  readonly colorMain25: string;
  readonly colorBgMain: string;
  readonly colorBorder: string;
  readonly colorRedBadge: string;
  readonly colorScrollBg: string;
  readonly colorScrollBar: string;
  readonly colorScrollHover: string;
  readonly colorScrollActive: string;
}

/**
 * `/Applications/CLIP STUDIO 1.5/Settings/CLIP STUDIO3/MENUv3/assets/menu.css`에서 추출한
 * 클립스튜디오 공식 라이트(`:root`) 및 다크(`.dark`) 테마 디자인 토큰.
 */
export const CSP_MENUV3_THEME_TOKENS: Readonly<
  Record<"light" | "dark", CspThemeColorTokenSet>
> = {
  light: {
    themeId: "light",
    colorMain: "#424242",
    colorMain50: "#878787",
    colorMain25: "#C0C0C0",
    colorBgMain: "#FAF9F9",
    colorBorder: "#E7E7E7",
    colorRedBadge: "#FF4444",
    colorScrollBg: "#F1F1F1",
    colorScrollBar: "#D4D4D4",
    colorScrollHover: "#C0C0C0",
    colorScrollActive: "#9A9A9A",
  },
  dark: {
    themeId: "dark",
    colorMain: "#FFFFFF",
    colorMain50: "#A7A7A7",
    colorMain25: "#878787",
    colorBgMain: "#4E4E4E",
    colorBorder: "#878787",
    colorRedBadge: "#FF4444",
    colorScrollBg: "#2B2B2B",
    colorScrollBar: "#494949",
    colorScrollHover: "#585858",
    colorScrollActive: "#6A6A9A",
  },
} as const;

export interface CspBentoMenuItemSpec {
  readonly id: string;
  readonly sectionId: "mService" | "mPaint" | "mOutput" | "mHelp" | "mEtc";
  readonly nameKo: string;
  readonly subLabel: string | null;
  readonly svgIconFileName: string;
  readonly actionType: "webview" | "ice" | "settings" | "browser";
  readonly targetCommandOrPage: string;
}

/**
 * `/Applications/CLIP STUDIO 1.5/Settings/CLIP STUDIO3/MENUv3/assets/menu.js`의 `menuSetting["ko-kr"]`에서
 * 추출한 클립스튜디오 벤토(Bento) 퀵 런처 메뉴 항목.
 */
export const CSP_MENUV3_KOREAN_BENTO_ITEMS: readonly CspBentoMenuItemSpec[] = [
  {
    id: "tutorial",
    sectionId: "mService",
    nameKo: "공식 강좌",
    subLabel: "TIPS",
    svgIconFileName: "icon_menu_tips_official.svg",
    actionType: "webview",
    targetCommandOrPage: "https://tips.clip-studio.com/ko-kr/official",
  },
  {
    id: "material",
    sectionId: "mService",
    nameKo: "소재 찾기",
    subLabel: "ASSETS",
    svgIconFileName: "icon_menu_assets.svg",
    actionType: "webview",
    targetCommandOrPage: "https://assets.clip-studio.com/ko-kr/",
  },
  {
    id: "tips",
    sectionId: "mService",
    nameKo: "그림 그리는 요령",
    subLabel: "TIPS",
    svgIconFileName: "icon_menu_tips.svg",
    actionType: "webview",
    targetCommandOrPage: "https://tips.clip-studio.com/ko-kr/",
  },
  {
    id: "share",
    sectionId: "mOutput",
    nameKo: "작품 공유하기",
    subLabel: "SHARE",
    svgIconFileName: "icon_menu_share.svg",
    actionType: "webview",
    targetCommandOrPage: "https://share.clip-studio.com/ko-kr/",
  },
  {
    id: "fanzine",
    sectionId: "mOutput",
    nameKo: "동인지 만들기",
    subLabel: "PRINT",
    svgIconFileName: "icon_menu_make_doujin.svg",
    actionType: "settings",
    targetCommandOrPage: "start_fanzine_index.html",
  },
  {
    id: "epub",
    sectionId: "mOutput",
    nameKo: "EPUB 데이터 출력",
    subLabel: "EPUB",
    svgIconFileName: "icon_menu_export_epub.svg",
    actionType: "settings",
    targetCommandOrPage: "start_epub_index.html",
  },
  {
    id: "support",
    sectionId: "mHelp",
    nameKo: "공식 지원",
    subLabel: "지원",
    svgIconFileName: "icon_menu_support.svg",
    actionType: "browser",
    targetCommandOrPage: "https://support.clip-studio.com/ko-kr/",
  },
  {
    id: "ask",
    sectionId: "mHelp",
    nameKo: "질문/답변하기",
    subLabel: "ASK",
    svgIconFileName: "icon_menu_ask.svg",
    actionType: "webview",
    targetCommandOrPage: "https://ask.clip-studio.com/ko-kr/",
  },
  {
    id: "modeler",
    sectionId: "mEtc",
    nameKo: "MODELER",
    subLabel: "3D",
    svgIconFileName: "icon_menu_modeler.svg",
    actionType: "ice",
    targetCommandOrPage: "runModeler",
  },
] as const;
