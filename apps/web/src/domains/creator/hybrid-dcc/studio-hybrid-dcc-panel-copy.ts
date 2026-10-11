import type { StudioDccWorkbenchMode } from "../studio-workspace-route";

/** 3D 작업대 패널의 모드 안내·저장 상태 문구 표. 패널 본체에서 분리한 정적 데이터다. */

export type BilingualPair = readonly [ko: string, en: string];

export const STUDIO_HYBRID_DCC_MODE_GUIDE: Record<
  StudioDccWorkbenchMode,
  { readonly title: BilingualPair; readonly description: BilingualPair }
> = {
  model: {
    title: ["오브젝트 만들기와 형태 편집", "Make objects and edit their shape"],
    description: [
      "기본 도형을 만들고 면을 밀거나 모서리를 다듬어 소품 형태를 완성합니다.",
      "Start from a basic shape, then push faces and refine edges to finish a prop.",
    ],
  },
  build: {
    title: ["방과 배경 세트 만들기", "Build rooms and background sets"],
    description: [
      "공간 프리셋과 건물 데이터로 웹툰 컷에 쓸 배경을 빠르게 구성합니다.",
      "Use room presets and building data to set up panel backgrounds quickly.",
    ],
  },
  cad: {
    title: ["치수가 정확한 솔리드 제작", "Solids with exact dimensions"],
    description: [
      "구멍·라운드·속 비우기·파이프 같은 정밀 형상을 CAD 커널로 계산합니다.",
      "A CAD kernel computes precise holes, fillets, shells and pipes.",
    ],
  },
  sculpt: {
    title: ["조형 실험실 · voxel-lite", "Sculpt lab · voxel-lite"],
    description: [
      "전문 조형 엔진이 연결되기 전까지 제한된 표면 변형과 메시 정리만 실험적으로 제공합니다.",
      "Until a full sculpting engine is connected, this offers limited, experimental surface edits and cleanup.",
    ],
  },
  material: {
    title: ["표면 방향과 UV 준비", "Prepare surfaces and UVs"],
    description: [
      "텍스처가 바르게 붙도록 UV와 겉면 방향을 정리하고 내보내기 결과를 점검합니다.",
      "Tidy UVs and face directions so textures land correctly, then check the export.",
    ],
  },
  shot: {
    title: ["카메라 컷과 웹툰용 선화 전달", "Camera shots and panel line art"],
    description: [
      "여러 컷을 만들고, 작가가 고친 선을 지킨 채 3D 배경 편집기로 넘겨 원고에 넣습니다.",
      "Frame several shots, keep artists' line fixes, and hand them to the 3D background editor for your page.",
    ],
  },
};

export type StudioHybridDccPersistenceStatus =
  | "checking"
  | "ready"
  | "saving"
  | "saved"
  | "session-only"
  | "error";

export const STUDIO_HYBRID_DCC_PERSISTENCE_COPY: Record<
  StudioHybridDccPersistenceStatus,
  { readonly label: BilingualPair; readonly detail: BilingualPair; readonly tone: "good" | "warn" | "neutral" }
> = {
  checking: {
    label: ["저장 공간 확인 중", "Checking storage"],
    detail: ["이전 작업이 있는지 확인하고 있습니다.", "Looking for earlier work on this device."],
    tone: "neutral",
  },
  ready: {
    label: ["자동 저장 준비됨", "Autosave ready"],
    detail: ["편집하면 이 기기에 자동 저장됩니다.", "Edits autosave on this device."],
    tone: "neutral",
  },
  saving: {
    label: ["저장 중", "Saving"],
    detail: ["방금 편집을 이 기기에 저장하고 있습니다.", "Saving your latest edit on this device."],
    tone: "neutral",
  },
  saved: {
    label: ["자동 저장됨", "Autosaved"],
    detail: ["이 기기의 브라우저에 저장했습니다. 클라우드 백업은 아닙니다.", "Saved in this browser on this device. Not a cloud backup."],
    tone: "good",
  },
  "session-only": {
    label: ["이 창에서만 유지", "This window only"],
    detail: [
      "로그인 확인 전이거나 브라우저가 저장 공간을 지원하지 않아 지금은 자동 저장되지 않습니다. 창을 닫기 전에 필요하면 .toon3d로 내보내 두세요.",
      "Autosave isn't available right now (sign-in is still being checked or the browser lacks storage support). Export a .toon3d package before closing if you need it.",
    ],
    tone: "warn",
  },
  error: {
    label: ["자동 저장 꺼짐", "Autosave off"],
    detail: [
      "저장 공간을 준비하지 못해 자동 저장이 멈췄습니다. 편집은 계속할 수 있지만 창을 닫기 전에 .toon3d로 내보내 두세요.",
      "Storage couldn't be prepared, so autosave stopped. You can keep editing, but export a .toon3d package before closing.",
    ],
    tone: "warn",
  },
};

export const PERSISTENCE_TONE_CLASS = {
  good: "border-good/35 bg-good/10 text-good",
  warn: "border-warn/45 bg-warn/10 text-warn",
  neutral: "border-line bg-panel text-fg-2",
} as const;
