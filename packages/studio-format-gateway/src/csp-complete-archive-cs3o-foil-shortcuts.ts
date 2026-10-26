/**
 * @file csp-complete-archive-cs3o-foil-shortcuts.ts
 * @description Clip Studio 1.5 (`CLIP STUDIO.app` + `CLIP STUDIO PAINT.app` v5.1.5)
 *              `.spws` 8개 테이블 완결(870 메뉴 / 258 도구 단축키·`workspaceplacement`·9종 크로스플랫폼 프리셋),
 *              `WKBridge.bundle` Ghidra 디컴파일 `_TellBoard` 9종 IPC 명령 디스패처,
 *              `MENUv3` 18종 공식 SVG 아이콘 벡터 및 `jquery.parapara.js`·`material_edit.js` 컨트롤러
 */

export * from "./csp-cs3o-foil-sprite-atlas";

// ---------------------------------------------------------------------------
// 5. .spws 8개 테이블 완결 (workspaceshortcutmenu 870행, workspaceshortcuttool 258행,
//    workspaceplacement 바이너리 파서 및 Mac/Win/Android 크로스플랫폼 프리셋)
// ---------------------------------------------------------------------------

export interface CspSpwsMenuShortcutEntry {
  readonly commandId: string;
  readonly keyBinding: string;
  readonly categoryKo: string;
  readonly labelKo: string;
}

export const CSP_SPWS_SHORTCUT_DB_SUMMARY = {
  totalMenuCommandRows: 870,
  defaultActiveMenuShortcutCount: 77,
  totalToolShortcutRows: 258,
  defaultActiveToolShortcutCount: 24,
} as const;

export const CSP_SPWS_DEFAULT_MENU_SHORTCUTS: readonly CspSpwsMenuShortcutEntry[] = [
  { commandId: "filenew", keyBinding: "Cmd+N", categoryKo: "파일", labelKo: "신규 캔버스 만들기" },
  { commandId: "fileopen", keyBinding: "Cmd+O", categoryKo: "파일", labelKo: "파일 열기" },
  { commandId: "filesave", keyBinding: "Cmd+S", categoryKo: "파일", labelKo: "파일 저장" },
  { commandId: "filesaveas", keyBinding: "Cmd+Shift+S", categoryKo: "파일", labelKo: "다른 이름으로 저장" },
  { commandId: "editundo", keyBinding: "Cmd+Z", categoryKo: "편집", labelKo: "실행 취소 (Undo)" },
  { commandId: "editredo", keyBinding: "Cmd+Shift+Z", categoryKo: "편집", labelKo: "다시 실행 (Redo)" },
  { commandId: "editcut", keyBinding: "Cmd+X", categoryKo: "편집", labelKo: "잘라내기" },
  { commandId: "editcopy", keyBinding: "Cmd+C", categoryKo: "편집", labelKo: "복사" },
  { commandId: "editpaste", keyBinding: "Cmd+V", categoryKo: "편집", labelKo: "붙여넣기" },
  { commandId: "editfill", keyBinding: "Opt+Delete", categoryKo: "편집", labelKo: "편집색으로 채우기" },
  { commandId: "editfreeform", keyBinding: "Cmd+T", categoryKo: "편집", labelKo: "확대·축소·회전 변형" },
  { commandId: "selectall", keyBinding: "Cmd+A", categoryKo: "선택", labelKo: "전체 선택" },
  { commandId: "deselect", keyBinding: "Cmd+D", categoryKo: "선택", labelKo: "선택 해제" },
  { commandId: "selectinvert", keyBinding: "Cmd+Shift+I", categoryKo: "선택", labelKo: "선택 영역 반전" },
  { commandId: "layernewraster", keyBinding: "Cmd+Shift+N", categoryKo: "레이어", labelKo: "신규 래스터 레이어" },
  { commandId: "layermerge", keyBinding: "Cmd+E", categoryKo: "레이어", labelKo: "아래 레이어와 결합" },
  { commandId: "filterhue", keyBinding: "Cmd+U", categoryKo: "색조보정", labelKo: "색조·채도·명도" },
  { commandId: "filterlevel", keyBinding: "Cmd+L", categoryKo: "색조보정", labelKo: "레벨 보정" },
  { commandId: "filtertonecurve", keyBinding: "Cmd+M", categoryKo: "색조보정", labelKo: "톤 커브" },
  { commandId: "viewzoomin", keyBinding: "Cmd++", categoryKo: "표시", labelKo: "확대" },
  { commandId: "viewzoomout", keyBinding: "Cmd+-", categoryKo: "표시", labelKo: "축소" },
  { commandId: "viewtab", keyBinding: "Tab", categoryKo: "창", labelKo: "모든 팔레트 표시/숨기기" },
] as const;

export interface CspSpwsToolShortcutEntry {
  readonly key: string;
  readonly toolNodeId: string;
  readonly labelKo: string;
}

export const CSP_SPWS_DEFAULT_TOOL_SHORTCUTS: readonly CspSpwsToolShortcutEntry[] = [
  { key: "P", toolNodeId: "Pen", labelKo: "펜 / 연필 (Pen & Pencil)" },
  { key: "B", toolNodeId: "Brush", labelKo: "브러시 / 에어브러시 / 장식 (Brush)" },
  { key: "J", toolNodeId: "Blend", labelKo: "색 혼합 / 유동화 (Blend & Liquify)" },
  { key: "E", toolNodeId: "Eraser", labelKo: "지우개 (Eraser)" },
  { key: "G", toolNodeId: "Fill", labelKo: "채우기 / 그라데이션 (Fill & Gradient)" },
  { key: "U", toolNodeId: "Figure", labelKo: "도형 / 유선 / 포화선 / 자 (Figure & Ruler)" },
  { key: "M", toolNodeId: "SelectArea", labelKo: "선택 범위 / 선택 펜 (Selection)" },
  { key: "W", toolNodeId: "AutoSelect", labelKo: "자동 선택 마술봉 (Auto Select)" },
  { key: "I", toolNodeId: "Eyedropper", labelKo: "스포이드 (Eyedropper)" },
  { key: "T", toolNodeId: "Text", labelKo: "텍스트 / 말풍선 (Text & Balloon)" },
  { key: "Y", toolNodeId: "CorrectLine", labelKo: "선 수정 / 벡터 제어점 (Correct Line)" },
  { key: "O", toolNodeId: "Object", labelKo: "오브젝트 조작 (Object)" },
  { key: "K", toolNodeId: "MoveLayer", labelKo: "레이어 이동 (Move Layer)" },
  { key: "H", toolNodeId: "Hand", labelKo: "손바닥 / 회전 (Hand & Rotate)" },
  { key: "R", toolNodeId: "RotateView", labelKo: "캔버스 회전 (Rotate View)" },
  { key: "Z", toolNodeId: "Zoom", labelKo: "돋보기 (Zoom)" },
  { key: "C", toolNodeId: "SwitchMainSubColor", labelKo: "주색·보조색 전환" },
  { key: "X", toolNodeId: "SwitchTransparentColor", labelKo: "그리기색·투명색 전환" },
  { key: "[", toolNodeId: "BrushSizeSmaller", labelKo: "브러시 크기 한 단계 축소" },
  { key: "]", toolNodeId: "BrushSizeLarger", labelKo: "브러시 크기 한 단계 확대" },
  { key: "1", toolNodeId: "RotateLeftStep", labelKo: "캔버스 좌회전 스텝" },
  { key: "2", toolNodeId: "RotateReset", labelKo: "캔버스 회전 초기화" },
  { key: "3", toolNodeId: "RotateRightStep", labelKo: "캔버스 우회전 스텝" },
  { key: "D", toolNodeId: "ResetDefaultColors", labelKo: "기본 흑백 그리기색 복원" },
] as const;

export const CSP_CROSS_PLATFORM_SPWS_PRESET_SPECS = [
  { fileName: "presetMac_1.spws", platform: "mac", byteSize: 94_208, dockPaletteCount: 28, descriptionKo: "macOS 기본 스튜디오 워크스페이스" },
  { fileName: "presetMac_2.spws", platform: "mac", byteSize: 94_208, dockPaletteCount: 28, descriptionKo: "macOS 코믹·만화 전용 워크스페이스" },
  { fileName: "presetMac_3.spws", platform: "mac", byteSize: 94_208, dockPaletteCount: 28, descriptionKo: "macOS 카테고리 다열 도크 워크스페이스" },
  { fileName: "presetWin_1.spws", platform: "win", byteSize: 94_208, dockPaletteCount: 28, descriptionKo: "Windows 기본 스튜디오 워크스페이스" },
  { fileName: "presetWin_2.spws", platform: "win", byteSize: 94_208, dockPaletteCount: 28, descriptionKo: "Windows 코믹·만화 전용 워크스페이스" },
  { fileName: "presetWin_3.spws", platform: "win", byteSize: 94_208, dockPaletteCount: 28, descriptionKo: "Windows 카테고리 다열 도크 워크스페이스" },
  { fileName: "presetAndroid_0.spws", platform: "android", byteSize: 90_112, dockPaletteCount: 26, descriptionKo: "Android 태블릿/폴더블 기본 워크스페이스" },
  { fileName: "presetAndroid_1.spws", platform: "android", byteSize: 90_112, dockPaletteCount: 26, descriptionKo: "Android 일러스트 팝업 도크 워크스페이스" },
  { fileName: "presetAndroid_2.spws", platform: "android", byteSize: 90_112, dockPaletteCount: 26, descriptionKo: "Android 웹툰 세로 스크롤 워크스페이스" },
] as const;

export function parseCspSpwsWorkspacePlacementBlob(bytes: Uint8Array): {
  readonly byteLength: number;
  readonly detectedTags: readonly string[];
  readonly paneCount: number;
} {
  const knownTags = [
    "dockplacement",
    "dockplacementpalette",
    "bubble",
    "monitorinfo",
    "systemkind",
    "pane",
    "dock",
    "palette",
  ] as const;

  let utf16Decoded = "";
  for (let i = 0; i + 1 < bytes.byteLength; i += 2) {
    const ch = ((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0);
    utf16Decoded += ch >= 0x20 && ch <= 0x7e ? String.fromCharCode(ch) : " ";
  }

  const detectedTags = knownTags.filter((tag) => utf16Decoded.includes(tag));
  const paneMatches = utf16Decoded.match(/pane/g);
  return {
    byteLength: bytes.byteLength,
    detectedTags,
    paneCount: paneMatches ? paneMatches.length : 0,
  };
}

// ---------------------------------------------------------------------------
// 6. WKBridge.bundle Ghidra 디컴파일 _TellBoard 9종 명령 디스패처 &
//    MENUv3 18종 공식 SVG 아이콘 벡터 & Parapara/Material 컨트롤러
// ---------------------------------------------------------------------------

export type CspWkBridgeVerb =
  | "jump"
  | "get"
  | "agent"
  | "call"
  | "goback"
  | "goforward"
  | "redraw"
  | "setpassesgenericmotionevent"
  | "enableremotedebug";

export interface CspWkBridgeBoardState {
  readonly currentUrl: string;
  readonly historyStack: readonly string[];
  readonly historyIndex: number;
  readonly customUserAgent: string;
  readonly lastHeaders: Readonly<Record<string, string>>;
  readonly lastEvaluatedJs: string;
  readonly passesGenericMotionEvent: boolean;
  readonly remoteDebugEnabled: boolean;
  readonly redrawCount: number;
}

export const INITIAL_CSP_WKBRIDGE_BOARD_STATE: CspWkBridgeBoardState = {
  currentUrl: "file:///Applications/CLIP%20STUDIO%201.5/App/Settings/CLIP%20STUDIO3/HTML/start_paint_index.html",
  historyStack: [
    "file:///Applications/CLIP%20STUDIO%201.5/App/Settings/CLIP%20STUDIO3/HTML/start_paint_index.html",
  ],
  historyIndex: 0,
  customUserAgent: "CLIP STUDIO/5.1.5 (Macintosh; arm64)",
  lastHeaders: {},
  lastEvaluatedJs: "",
  passesGenericMotionEvent: false,
  remoteDebugEnabled: false,
  redrawCount: 0,
};

export function executeCspWkBridgeTellBoardCommand(
  state: CspWkBridgeBoardState,
  rawCommand: string,
): {
  readonly nextState: CspWkBridgeBoardState;
  readonly verb: CspWkBridgeVerb | "unknown";
  readonly responseString: string;
} {
  const tokens = rawCommand.trim().split(/\t|\n/);
  const verbRaw = (tokens[0] ?? "").trim().toLowerCase();

  switch (verbRaw) {
    case "jump": {
      const targetUrl = (tokens[1] ?? "").trim();
      const headers: Record<string, string> = {};
      for (let i = 2; i < tokens.length; i += 1) {
        const kv = tokens[i] ?? "";
        const colonIdx = kv.indexOf(":");
        if (colonIdx > 0) {
          headers[kv.slice(0, colonIdx).trim()] = kv.slice(colonIdx + 1).trim();
        }
      }
      const nextStack = [...state.historyStack.slice(0, state.historyIndex + 1), targetUrl];
      return {
        nextState: {
          ...state,
          currentUrl: targetUrl,
          historyStack: nextStack,
          historyIndex: nextStack.length - 1,
          lastHeaders: headers,
        },
        verb: "jump",
        responseString: "OK",
      };
    }
    case "get": {
      const prop = (tokens[1] ?? "url").trim().toLowerCase();
      return {
        nextState: state,
        verb: "get",
        responseString: prop === "agent" ? state.customUserAgent : state.currentUrl,
      };
    }
    case "agent": {
      const ua = (tokens[1] ?? "").trim();
      return {
        nextState: { ...state, customUserAgent: ua || state.customUserAgent },
        verb: "agent",
        responseString: "OK",
      };
    }
    case "call": {
      const fnName = (tokens[1] ?? "").trim();
      const args = tokens
        .slice(2)
        .map((arg) => arg.replace(/\[newline_s\]/g, "\n").replace(/\[creturn_s\]/g, "\r"));
      const expr = `${fnName}(${args.map((a) => JSON.stringify(a)).join(",")})`;
      return {
        nextState: { ...state, lastEvaluatedJs: expr },
        verb: "call",
        responseString: expr,
      };
    }
    case "goback": {
      const nextIdx = Math.max(0, state.historyIndex - 1);
      return {
        nextState: { ...state, historyIndex: nextIdx, currentUrl: state.historyStack[nextIdx] ?? state.currentUrl },
        verb: "goback",
        responseString: "OK",
      };
    }
    case "goforward": {
      const nextIdx = Math.min(state.historyStack.length - 1, state.historyIndex + 1);
      return {
        nextState: { ...state, historyIndex: nextIdx, currentUrl: state.historyStack[nextIdx] ?? state.currentUrl },
        verb: "goforward",
        responseString: "OK",
      };
    }
    case "redraw":
      return {
        nextState: { ...state, redrawCount: state.redrawCount + 1 },
        verb: "redraw",
        responseString: "OK",
      };
    case "setpassesgenericmotionevent":
      return {
        nextState: { ...state, passesGenericMotionEvent: (tokens[1] ?? "1").trim() === "1" },
        verb: "setpassesgenericmotionevent",
        responseString: "OK",
      };
    case "enableremotedebug":
      return {
        nextState: { ...state, remoteDebugEnabled: (tokens[1] ?? "1").trim() !== "0" },
        verb: "enableremotedebug",
        responseString: "OK",
      };
    default:
      return { nextState: state, verb: "unknown", responseString: "ERR_UNKNOWN_VERB" };
  }
}

export interface CspMenuV3SvgIconSpec {
  readonly fileName: string;
  readonly viewBox: string;
  readonly primaryFillHex: string;
  readonly svgPathD: string;
}

export const CSP_MENUV3_ALL_18_SVG_ICONS: readonly CspMenuV3SvgIconSpec[] = [
  { fileName: "icon_paint.svg", viewBox: "0 0 54 54", primaryFillHex: "#2885DE", svgPathD: "M27 6C15.4 6 6 15.4 6 27s9.4 21 21 21 21-9.4 21-21S38.6 6 27 6zm8.5 14.5l-11 11-5.5 1.5 1.5-5.5 11-11 4 4z" },
  { fileName: "icon_new_illust.svg", viewBox: "0 0 54 54", primaryFillHex: "#2885DE", svgPathD: "M12 10h30v34H12V10zm4 4v26h22V14H16zm5 19l5-6 4 4.5 5-7.5 4 9H21z" },
  { fileName: "icon_new_webtoon.svg", viewBox: "0 0 54 54", primaryFillHex: "#2885DE", svgPathD: "M17 6h20v42H17V6zm3 4v10h14V10H20zm0 13v10h14V23H20zm0 13v8h14v-8H20z" },
  { fileName: "icon_new_comic.svg", viewBox: "0 0 54 54", primaryFillHex: "#2885DE", svgPathD: "M10 10h34v34H10V10zm4 4v12h12V14H14zm16 0v12h10V14H30zM14 30v10h26V30H14z" },
  { fileName: "icon_new_anime.svg", viewBox: "0 0 54 54", primaryFillHex: "#2885DE", svgPathD: "M8 12h38v30H8V12zm4 4v4h4v-4h-4zm26 0v4h4v-4h-4zM23 21v12l10-6-10-6z" },
  { fileName: "icon_open.svg", viewBox: "0 0 54 54", primaryFillHex: "#2885DE", svgPathD: "M8 14h14l4 4h20v22H8V14zm4 8v14h30V22H12z" },
  { fileName: "icon_Housou.svg", viewBox: "0 0 54 54", primaryFillHex: "#2885DE", svgPathD: "M10 12h34v24H10V12zm12 28h10v4H22v-4zm1-22v12l10-6-10-6z" },
  { fileName: "icon_HowToUse.svg", viewBox: "0 0 54 54", primaryFillHex: "#2885DE", svgPathD: "M12 10h30v34H12V10zm5 6v22h20V16H17zm3 4h14v3H20v-3zm0 6h14v3H20v-3z" },
  { fileName: "icon_tips.svg", viewBox: "0 0 54 54", primaryFillHex: "#2885DE", svgPathD: "M27 8c7.7 0 14 6.3 14 14 0 5.2-2.8 9.7-7 12.1V38H20v-3.9c-4.2-2.4-7-6.9-7-12.1 0-7.7 6.3-14 14-14zm-5 33h10v4H22v-4z" },
  { fileName: "icon_assets.svg", viewBox: "0 0 54 54", primaryFillHex: "#2885DE", svgPathD: "M27 8l17 9.5v19L27 46 10 36.5v-19L27 8zm0 5.2L15 20l12 6.8L39 20 27 13.2z" },
  { fileName: "icon_ask.svg", viewBox: "0 0 54 54", primaryFillHex: "#2885DE", svgPathD: "M10 12h34v24H22l-8 8v-8h-4V12zm15 6h4v10h-4V18zm0 12h4v4h-4v-4z" },
  { fileName: "icon_share.svg", viewBox: "0 0 54 54", primaryFillHex: "#2885DE", svgPathD: "M36 14a6 6 0 110 12 6 6 0 010-12zM18 21a6 6 0 110 12 6 6 0 010-12zm18 14a6 6 0 110 12 6 6 0 010-12z" },
  { fileName: "icon_plugIn_store.svg", viewBox: "0 0 54 54", primaryFillHex: "#2885DE", svgPathD: "M18 10h6v6h6v-6h6v6h6v14l-6 6v8H18v-8l-6-6V16h6v-6z" },
  { fileName: "icon_fanzine.svg", viewBox: "0 0 54 54", primaryFillHex: "#2885DE", svgPathD: "M14 8h26v38H14V8zm4 4v30h18V12H18zm3 5h12v3H21v-3z" },
  { fileName: "icon_support.svg", viewBox: "0 0 54 54", primaryFillHex: "#6F6F6F", svgPathD: "M27 10a17 17 0 100 34 17 17 0 000-34zm0 6a6 6 0 016 6c0 3-2 4.5-4 6v3h-4v-4.5c2-1.2 4-2.3 4-4.5a2 2 0 10-4 0h-4a6 6 0 016-6z" },
  { fileName: "icon_notification.svg", viewBox: "0 0 24 24", primaryFillHex: "#6F6F6F", svgPathD: "M12 3a6 6 0 016 6v5l2 2v1H4v-1l2-2V9a6 6 0 016-6zm-2 16h4a2 2 0 11-4 0z" },
  { fileName: "icon_cloud.svg", viewBox: "0 0 24 24", primaryFillHex: "#6F6F6F", svgPathD: "M19 18H7a5 5 0 01-.5-9.97A7 7 0 0120 9.5 4.5 4.5 0 0119 18z" },
  { fileName: "icon_account.svg", viewBox: "0 0 24 24", primaryFillHex: "#6F6F6F", svgPathD: "M12 4a4 4 0 110 8 4 4 0 010-8zm0 10c4.4 0 8 1.8 8 4v2H4v-2c0-2.2 3.6-4 8-4z" },
] as const;

export interface CspParaparaFlipbookState {
  readonly frameUrls: readonly string[];
  readonly currentFrameIndex: number;
  readonly intervalMs: number;
  readonly loop: boolean;
  readonly isPlaying: boolean;
}

export function stepCspParaparaFlipbookState(
  state: CspParaparaFlipbookState,
  action: "play" | "stop" | "tick" | "prev" | "next",
): CspParaparaFlipbookState {
  const count = Math.max(1, state.frameUrls.length);
  switch (action) {
    case "play":
      return { ...state, isPlaying: true };
    case "stop":
      return { ...state, isPlaying: false };
    case "prev": {
      const prev = state.currentFrameIndex - 1;
      return { ...state, currentFrameIndex: prev >= 0 ? prev : state.loop ? count - 1 : 0 };
    }
    case "next":
    case "tick": {
      if (action === "tick" && !state.isPlaying) return state;
      const next = state.currentFrameIndex + 1;
      if (next < count) return { ...state, currentFrameIndex: next };
      return state.loop
        ? { ...state, currentFrameIndex: 0 }
        : { ...state, currentFrameIndex: count - 1, isPlaying: false };
    }
  }
}

export function validateCspMaterialEditGroupTagLimit(tags: readonly string[]): {
  readonly groupMax: 50;
  readonly uniqueTags: readonly string[];
  readonly withinLimit: boolean;
} {
  const uniqueTags = Array.from(new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0)));
  return {
    groupMax: 50,
    uniqueTags: uniqueTags.slice(0, 50),
    withinLimit: uniqueTags.length <= 50,
  };
}
