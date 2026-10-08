import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · three-d 카테고리 중 "화면에 그리기" 계열 카드: three.js·R3F 뷰포트, WebGPU/WebGL2 엔진 선택.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const BG3D_DIR = "apps/web/src/domains/creator/bg3d";
const DCC_DIR = "apps/web/src/domains/creator/hybrid-dcc";
const VRM_DIR = "apps/web/src/domains/creator/vrm";

export const THREE_R3F_VIEWPORT: EngineeringAtlasEntry = {
  id: "three-r3f-viewport",
  category: "three-d",
  name: "Three.js · React Three Fiber",
  title: t("React 화면 안에서 3D를 그리고, 그리는 횟수를 아끼는 뷰포트", "A 3D viewport inside React that saves frames when nothing moves"),
  status: "live",
  tagline: t(
    "움직임이 있을 때만 그리고, 느려지면 해상도 배율을 낮춰 프레임 예산을 지킵니다.",
    "Draws only when something moves, and lowers the resolution scale when frames run late.",
  ),
  background: [
    t(
      "3D 화면은 영화 필름처럼 1초에 수십 장을 새로 그립니다. 그런데 편집기에서는 대부분의 시간 그림이 멈춰 있고, 같은 장면을 계속 다시 그리는 것은 전기와 배터리만 쓰는 일입니다. ToonStudio의 3D 뷰포트는 three.js(웹 3D 라이브러리)를 React 안에서 쓰게 해 주는 React Three Fiber(R3F) 위에 있고, 정지 구도에서는 바뀔 때만 한 장씩 그립니다.",
      "A 3D view redraws dozens of frames a second, like film. In an editor, though, the picture sits still most of the time, and redrawing the same scene only burns power and battery. ToonStudio's 3D viewport sits on React Three Fiber (R3F), which lets three.js (the web 3D library) live inside React, and for a still composition it draws one frame only when something changes.",
    ),
    t(
      "R3F의 프레임 루프는 세 가지입니다. always는 쉬지 않고, demand는 invalidate()가 불릴 때만 한 장, never는 멈춤입니다. 배경 3D 편집기는 모델 애니메이션·물리·캡처·일괄 렌더 중 하나라도 있을 때만 always로 두고, 기즈모를 잡고 끄는 동안을 포함한 나머지는 demand입니다. 느려지면 거버너가 프레임 시간의 평활 평균(EMA)을 재서, 프레임 예산(1초를 목표 fps로 나눈 시간, 60fps면 약 16.7ms)의 1.15배를 45샘플 연속 넘을 때 해상도 배율(DPR)을 1 → 0.85 → 0.7 → 0.55로 한 단계씩 낮춥니다. 0.78배 미만이 300샘플 이어지면 한 단계 올립니다.",
      "R3F has three frame loops: always draws constantly, demand draws one frame only when invalidate() is called, and never stops. The background 3D editor uses always only while a model animation, physics, a capture or a batch render is active; everything else, including while a gizmo is held and dragged, is demand. When it slows down, a governor measures a smoothed average (EMA) of frame time and, after 45 consecutive samples above 1.15 times the frame budget (one second divided by the target fps, about 16.7 ms at 60 fps), lowers the resolution scale (DPR) one step along 1, 0.85, 0.7, 0.55. It steps back up after 300 samples below 0.78 times.",
    ),
    t(
      "대안은 Babylon.js 같은 별도 엔진이지만, 같은 장면을 엔진 둘이 함께 소유하면 선택·기즈모·GPU 자원·캡처 시점이 충돌합니다. 그래서 대화형 편집 장면의 소유자는 Three/R3F 하나로 두고, 영속 상태는 엔진 객체가 아니라 문서(StudioBg3dSceneDocument)에 저장합니다. 다른 엔진은 격리된 전문 작업에만 씁니다. 패치도 하나 있습니다. R3F 9.6.1이 three r183에서 폐기된 THREE.Clock을 쓰므로, 경고 없이 Canvas가 마운트되도록 Timer 기반 어댑터로 바꿨습니다.",
      "The alternative is a separate engine such as Babylon.js, but if two engines co-own one scene, selection, gizmos, GPU resources and capture timing collide. So Three/R3F alone owns the interactive editing scene, and persistent state lives in a document (StudioBg3dSceneDocument), not in engine objects. Other engines are used only for isolated specialist jobs. There is one patch too: R3F 9.6.1 uses THREE.Clock, deprecated since three r183, so it was swapped for a Timer-based adapter so a Canvas mounts without a warning.",
    ),
    t(
      "한계: 거버너는 '작가의 입력 간격'과 'GPU 시간'을 구분해야 합니다. 탭 복귀처럼 250ms를 넘거나 1ms 미만인 간격은 GPU 성능이 아니라서 무시하고, demand 모드의 간격은 아예 재지 않습니다. 해상도 배율은 화면 표시용이고 내보내기는 요청 크기의 별도 렌더 타깃을 쓴다고 설계 문서가 밝힙니다. 또 Hybrid DCC 뷰포트는 drei의 PerformanceMonitor를 따로 써서, 두 뷰포트의 적응 정책이 둘로 나뉘어 있습니다.",
      "Limits: the governor must tell the artist's input cadence from GPU time. Gaps over 250 ms or under 1 ms, such as after returning to a tab, are not GPU performance and are ignored, and gaps in demand mode are not measured at all. The resolution scale affects only the on-screen view; a design doc states exports use a separate render target at the requested size. The Hybrid DCC viewport also uses drei's PerformanceMonitor on its own, so the two viewports adapt by two different policies.",
    ),
  ],
  keyPoints: [
    t("정지 구도는 demand: 바뀔 때만 한 장씩 그립니다", "Still scenes use demand: one frame only when something changes"),
    t("예산을 넘으면 해상도 배율을 1에서 0.55까지 4단계로 낮춥니다", "Over budget, the resolution scale steps from 1 down to 0.55 in four steps"),
    t("입력 간격과 GPU 시간을 구분해 잘못된 강등을 막습니다", "Input gaps are told apart from GPU time to prevent false downgrades"),
    t("대화형 장면의 소유자는 three/R3F 하나, 상태는 문서에 둡니다", "Three/R3F alone owns the live scene; state lives in the document"),
  ],
  diagram: {
    id: "three-r3f-viewport-diagram",
    kind: "graph",
    title: t("그릴 때와 아낄 때를 가르는 프레임 루프", "The frame loop that decides when to draw and when to save"),
    caption: t(
      "시간이 흐르는 작업만 쉬지 않고 그리고, 느려지면 해상도 배율이 내려가 다시 예산 안으로 돌아옵니다.",
      "Only time-based work draws constantly, and when frames run late the resolution scale drops to get back within budget.",
    ),
    alt: t(
      "재생·물리·캡처는 always 모드로, 편집 변경과 기즈모 조작은 demand 모드로 한 프레임 그리기에 들어갑니다. 그린 뒤 프레임 시간을 재고, 예산의 1.15배를 넘는 상태가 이어지면 해상도 배율을 낮추며, 낮춘 배율은 다시 그리기에 반영됩니다.",
      "Playback, physics and capture feed one frame of drawing in always mode, while edits and gizmo moves feed it in demand mode. After drawing, frame time is measured; if it stays above 1.15 times the budget, the resolution scale is lowered, and the lowered scale applies to the next drawing.",
    ),
    nodes: [
      { id: "work", label: t("재생·물리·캡처", "Play, physics, capture"), sub: t("시간이 흐르는 작업", "Time-based work"), tone: "local", shape: "pill", at: [0, 0] },
      { id: "edit", label: t("편집 변경·기즈모", "Edits and gizmo"), sub: t("바뀐 순간만", "Only when changed"), tone: "local", shape: "pill", at: [1, 0] },
      { id: "draw", label: t("한 프레임 그리기", "Draw one frame"), sub: t("three 렌더러", "three renderer"), tone: "local", at: [1, 1] },
      { id: "meter", label: t("프레임 시간 재기", "Time each frame"), sub: t("EMA · demand 간격 제외", "EMA, demand gaps excluded"), tone: "local", at: [2, 1] },
      { id: "gov", label: t("예산×1.15 초과?", "Over 1.15x budget?"), tone: "warn", shape: "diamond", at: [3, 1] },
      { id: "dpr", label: t("해상도 배율↓", "Lower resolution"), sub: t("1 → 0.85 → 0.7 → 0.55", "1, 0.85, 0.7, 0.55"), tone: "warn", at: [4, 1] },
    ],
    edges: [
      { from: "work", to: "draw", label: t("always: 매 프레임", "always: each frame") },
      { from: "edit", to: "draw", label: t("demand: 한 장", "demand: one frame") },
      { from: "draw", to: "meter", label: t("프레임 시간", "frame time") },
      { from: "meter", to: "gov", label: t("평활 평균", "smoothed") },
      { from: "gov", to: "dpr", label: t("45샘플 연속", "45 in a row") },
      { from: "dpr", to: "draw", label: t("배율 반영", "apply scale"), style: "dashed" },
    ],
  },
  usage: [
    {
      feature: t("3D 배경 편집기 · 뷰포트", "3D background editor · viewport"),
      role: t(
        "R3F Canvas가 프레임 루프(always/demand)와 해상도 배율을 정하고, 거버너가 프레임 시간을 재서 배율을 조절합니다.",
        "The R3F Canvas sets the frame loop (always or demand) and the resolution scale, and the governor adjusts the scale by measuring frame time.",
      ),
      paths: [
        `${BG3D_DIR}/StudioBg3dEditorViewport.tsx`,
        `${BG3D_DIR}/studio-bg3d-render-policy.ts#resolveStudioBg3dFrameLoop`,
        `${BG3D_DIR}/studio-bg3d-frame-quality-governor.ts#advanceStudioBg3dFrameQuality`,
        `${BG3D_DIR}/StudioBg3dSceneNodes.tsx`,
      ],
      route: "/studio/bg3d",
    },
    {
      feature: t("Hybrid DCC 뷰포트", "Hybrid DCC viewport"),
      role: t(
        "항상 demand로 그리고, drei의 PerformanceMonitor로 해상도를 따로 조절합니다.",
        "Always draws on demand and adjusts resolution separately with drei's PerformanceMonitor.",
      ),
      paths: [`${DCC_DIR}/StudioHybridDccViewportCore.tsx#StudioHybridDccAdaptiveDpr`],
    },
    {
      feature: t("3D 캐릭터 편집기 · 포저 뷰포트", "3D character editor · poser viewport"),
      role: t(
        "화면에 보이지 않고 캡처 중도 아니면 프레임 루프를 never로 멈춰 GPU를 쉬게 합니다.",
        "Sets the frame loop to never when the view is not visible and no capture is running, so the GPU rests.",
      ),
      paths: [`${VRM_DIR}/StudioVrmPoserViewport.tsx`],
      route: "/studio/poser",
    },
    {
      feature: t("R3F 호환 패치", "R3F compatibility patch"),
      role: t(
        "폐기된 THREE.Clock 대신 Timer로 구동해 Canvas 마운트 경고를 없앱니다.",
        "Drives R3F with a Timer instead of the deprecated THREE.Clock to remove the Canvas mount warning.",
      ),
      paths: ["patches/@react-three__fiber@9.6.1.patch"],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("프레임 거버너: 측정해서 해상도 배율을 고르기", "Frame governor: pick the resolution scale by measuring"),
      language: "ts",
      code: `const DPR_STEPS = [1, 0.85, 0.7, 0.55] as const;

export interface Governor { step: number; ema: number; over: number; calm: number }

/** 프레임 시간을 재서 해상도 배율 단계를 정한다. 워밍업·쿨다운은 생략한 단순판. */
export function advance(g: Governor, deltaSec: number, targetFps: number): Governor {
  const ms = deltaSec * 1000;
  // 탭 복귀나 긴 작업은 GPU 처리량이 아니므로 측정에서 뺀다
  if (!(ms >= 1 && ms <= 250)) return { ...g, over: 0, calm: 0 };
  const budget = 1000 / targetFps; // 프레임 예산(ms): 60fps면 약 16.7
  const ema = g.ema + (ms - g.ema) * 0.08; // 평활 평균
  const over = ema > budget * 1.15 ? g.over + 1 : Math.max(0, g.over - 2);
  const calm = ema < budget * 0.78 ? g.calm + 1 : Math.max(0, g.calm - 2);
  if (over >= 45 && g.step < DPR_STEPS.length - 1) return { step: g.step + 1, ema, over: 0, calm: 0 }; // 낮춤
  if (calm >= 300 && g.step > 0) return { step: g.step - 1, ema, over: 0, calm: 0 }; // 천천히 복구
  return { ...g, ema, over, calm };
}

export const dprScale = (g: Governor): number => DPR_STEPS[g.step] ?? 1;`,
      codeEn: `const DPR_STEPS = [1, 0.85, 0.7, 0.55] as const;

export interface Governor { step: number; ema: number; over: number; calm: number }

/** Measures frame time and picks the resolution-scale step. A simplified version without warm-up and cooldown. */
export function advance(g: Governor, deltaSec: number, targetFps: number): Governor {
  const ms = deltaSec * 1000;
  // A returning tab or a long task is not GPU throughput, so leave it out of the measurement
  if (!(ms >= 1 && ms <= 250)) return { ...g, over: 0, calm: 0 };
  const budget = 1000 / targetFps; // frame budget (ms): about 16.7 at 60 fps
  const ema = g.ema + (ms - g.ema) * 0.08; // smoothed average
  const over = ema > budget * 1.15 ? g.over + 1 : Math.max(0, g.over - 2);
  const calm = ema < budget * 0.78 ? g.calm + 1 : Math.max(0, g.calm - 2);
  if (over >= 45 && g.step < DPR_STEPS.length - 1) return { step: g.step + 1, ema, over: 0, calm: 0 }; // lower
  if (calm >= 300 && g.step > 0) return { step: g.step - 1, ema, over: 0, calm: 0 }; // recover slowly
  return { ...g, ema, over, calm };
}

export const dprScale = (g: Governor): number => DPR_STEPS[g.step] ?? 1;`,
      explain: t(
        "낮출 때는 45샘플, 올릴 때는 300샘플을 요구해 배율이 출렁이지 않게 합니다. 실제 코드는 30샘플 워밍업과 120샘플 쿨다운이 더 있고, 일시정지 상태도 따로 다룹니다.",
        "Lowering needs 45 samples and raising needs 300, so the scale does not oscillate. The real code adds a 30-sample warm-up and a 120-sample cooldown and handles a paused state separately.",
      ),
      source: `${BG3D_DIR}/studio-bg3d-frame-quality-governor.ts`,
      verify: "types",
    },
    {
      kind: "teaching",
      title: t("R3F demand 루프: 바뀐 뒤 한 장만 그리기", "R3F demand loop: draw one frame after a change"),
      language: "tsx",
      code: `import { Canvas, useThree } from "@react-three/fiber";
import { useEffect } from "react";

/** 값이 바뀐 뒤 한 프레임만 다시 그려 달라고 요청한다. */
function RedrawOn({ deps }: { deps: readonly unknown[] }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    invalidate();
  }, [invalidate, ...deps]);
  return null;
}

export function Viewport({ animating, pose }: { animating: boolean; pose: number }) {
  return (
    // 시간이 흐를 때만 always, 정지 구도는 demand
    <Canvas frameloop={animating ? "always" : "demand"} dpr={[1, 2]}>
      <RedrawOn deps={[pose]} />
    </Canvas>
  );
}`,
      codeEn: `import { Canvas, useThree } from "@react-three/fiber";
import { useEffect } from "react";

/** Ask for one more frame after a value changes. */
function RedrawOn({ deps }: { deps: readonly unknown[] }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    invalidate();
  }, [invalidate, ...deps]);
  return null;
}

export function Viewport({ animating, pose }: { animating: boolean; pose: number }) {
  return (
    // always only while time flows; a still composition uses demand
    <Canvas frameloop={animating ? "always" : "demand"} dpr={[1, 2]}>
      <RedrawOn deps={[pose]} />
    </Canvas>
  );
}`,
      explain: t(
        "demand 모드의 Canvas는 invalidate()가 불릴 때만 그립니다. 드래그처럼 변경 이벤트가 이어지면 이벤트마다 한 장이 그려지고, 멈추면 GPU도 쉽니다.",
        "A demand-mode Canvas draws only when invalidate() is called. During a drag each change event draws one frame, and when it stops the GPU rests too.",
      ),
      verify: "types",
    },
  ],
  links: [
    {
      title: "React Three Fiber · Canvas",
      url: "https://r3f.docs.pmnd.rs/api/canvas",
      kind: "docs",
      note: t("frameloop·dpr 같은 Canvas 속성", "Canvas props such as frameloop and dpr"),
    },
    {
      title: "React Three Fiber · Scaling performance",
      url: "https://r3f.docs.pmnd.rs/advanced/scaling-performance",
      kind: "guide",
      note: t("필요할 때만 그리기(on-demand)와 성능 조절", "On-demand rendering and performance tuning"),
    },
    {
      title: "three.js documentation",
      url: "https://threejs.org/docs/",
      kind: "docs",
    },
    {
      title: "pmndrs · drei",
      url: "https://github.com/pmndrs/drei",
      kind: "repo",
      note: t("PerformanceMonitor 등 R3F 보조 컴포넌트", "Helpers for R3F such as PerformanceMonitor"),
    },
  ],
  chapterIds: ["web-3d-engine", "performance"],
  talk: {
    pitch: t(
      "3D 편집기가 가장 아끼는 것은 '그리지 않는 시간'입니다. 정지한 장면은 바뀔 때만 한 장씩 그리고, 재생이나 물리처럼 시간이 흐를 때만 계속 그립니다. 그래도 느려지면 거버너가 프레임 시간을 재서 해상도 배율을 네 단계로 낮췄다가 여유가 생기면 천천히 되돌립니다. 이 모든 걸 React 안에서 three.js로 합니다.",
      "What a 3D editor saves most is time spent not drawing. A still scene is drawn one frame at a time only when it changes, and drawn continuously only while time flows, as in playback or physics. If it still slows down, a governor measures frame time, lowers the resolution scale in four steps and slowly restores it when there is headroom. All of this runs inside React on three.js.",
    ),
    analogy: t(
      "움직이는 장면에만 필름을 돌리고, 멈춘 장면에는 사진 한 장만 걸어 두는 영사기입니다.",
      "A projector that runs film only for moving scenes and just holds up a single photo for still ones.",
    ),
    questions: [
      {
        question: t("왜 항상 60프레임으로 그리지 않나요?", "Why not always draw at 60 frames?"),
        answer: t(
          "정지 구도에서는 같은 그림을 다시 그릴 뿐이라 GPU와 배터리만 씁니다. 느린 WebGPU 큐에서는 요청이 쌓이기도 합니다. 변경 이벤트가 오면 한 장 그리고, 애니메이션·물리·캡처 때만 계속 그립니다.",
          "On a still composition it only redraws the same picture, costing GPU and battery, and on a slow WebGPU queue requests can pile up. It draws one frame on a change event and draws continuously only for animation, physics and capture.",
        ),
      },
      {
        question: t("해상도를 낮추면 내보내기 화질도 떨어지나요?", "Does lowering resolution also lower export quality?"),
        answer: t(
          "화면 표시용 배율만 낮춥니다. 설계 문서는 캡처가 요청 크기의 별도 렌더 타깃이라 내보내기 해상도는 유지된다고 밝힙니다. 이 카드에서 픽셀 단위 실측은 하지 않았습니다.",
          "Only the on-screen scale drops. A design doc states that capture uses a separate render target at the requested size, so export resolution is kept. I did not measure this pixel by pixel for this card.",
        ),
      },
      {
        question: t("Babylon.js 같은 다른 엔진은 왜 같이 쓰지 않나요?", "Why not use another engine such as Babylon.js alongside?"),
        answer: t(
          "한 장면을 엔진 둘이 소유하면 선택·기즈모·GPU 자원·캡처 시점이 충돌합니다. 그래서 대화형 편집은 three/R3F 하나로 두고 다른 엔진은 격리된 전문 작업에만 씁니다.",
          "If two engines own one scene, selection, gizmos, GPU resources and capture timing collide, so interactive editing stays on three/R3F alone and other engines serve only isolated specialist jobs.",
        ),
      },
    ],
    pitfall: t(
      "'항상 부드럽다'고 말하지 마세요. 거버너는 해상도를 낮춰 속도를 지키는 방식이고, 기기별 프레임 시간 측정값은 이 카드에서 제시하지 못합니다. BG3D와 Hybrid DCC의 적응 정책이 다르다는 점(이원화)도 사실입니다.",
      "Do not say it is always smooth. The governor keeps speed by lowering resolution, and this card has no per-device frame-time measurements. It is also true that BG3D and Hybrid DCC use different adaptation policies.",
    ),
  },
  technologies: ["Three.js", "React Three Fiber", "Drei", "WebGL2", "WebGPU"],
  facts: [
    { value: "1 / 0.85 / 0.7 / 0.55", label: t("거버너가 쓰는 해상도 배율 4단계", "The four resolution-scale steps the governor uses"), source: `${BG3D_DIR}/studio-bg3d-frame-quality-governor.ts` },
    { value: "45 / 300", label: t("배율을 낮추는 데 필요한 연속 샘플 / 되돌리는 데 필요한 연속 샘플", "Consecutive samples needed to lower the scale / to restore it"), source: `${BG3D_DIR}/studio-bg3d-frame-quality-governor.ts` },
    { value: "250 ms", label: t("이 간격을 넘는 프레임은 GPU 성능이 아닌 것으로 보고 제외", "Frame gaps beyond this are excluded as not GPU performance"), source: `${BG3D_DIR}/studio-bg3d-frame-quality-governor.ts` },
  ],
  reviewedAt: "2026-10-07",
};

export const WEBGPU_EXPLICIT_ENGINE: EngineeringAtlasEntry = {
  id: "webgpu-explicit-engine",
  category: "three-d",
  name: "WebGPU · WebGL2",
  title: t("엔진은 폴백이 아니라 '선택'입니다", "The engine is a choice, not a fallback"),
  status: "live",
  tagline: t(
    "고른 엔진이 안 되면 몰래 바꾸지 않고, 안 되는 이유를 보여 주고 선택은 사용자가 바꿉니다.",
    "If the chosen engine cannot run, the app says why and lets the user switch instead of switching silently.",
  ),
  background: [
    t(
      "그래픽 엔진을 자동차 엔진에 빗대 보겠습니다. WebGPU는 신형, WebGL2는 검증된 구형입니다. 많은 앱은 신형이 안 되면 몰래 구형으로 바꿔 달리는데, 그러면 테스트한 화면과 사용자가 본 화면이 달라지고 같은 프로젝트가 사람마다 다른 색으로 나올 수 있습니다. ToonStudio는 반대로, 고른 엔진이 안 되면 안 된다는 사실과 이유를 보여 주고 선택은 사용자가 직접 바꾸게 합니다.",
      "Think of graphics engines as car engines: WebGPU is the new one and WebGL2 the proven older one. Many apps quietly swap to the old one when the new one fails, but then the tested screen and the screen users see can differ, and one project can come out in different colors for different people. ToonStudio does the opposite: when the chosen engine cannot run, it states that and why, and the user changes the choice.",
    ),
    t(
      "구현은 순수 함수 한 개입니다. 입력은 아티스트의 선택(WebGPU 또는 WebGL2), GPU 어댑터 점검 결과(보안 연결 여부, 버퍼 한도 128MiB, 저장 버퍼 한도 32MiB), 인앱 브라우저 신뢰도, VRM 캐릭터나 WebXR 사용 여부입니다. 출력은 백엔드와 상태(사용 가능·불가·실패), 사유 코드, 한국어 안내문입니다. 막힘이 있어도 백엔드 값은 그대로이고 상태만 바뀝니다. WebGPU 코드는 정책이 WebGPU를 고른 뒤에만 지연 로드되는 한 곳(entry)에 모아 뒀습니다.",
      "The implementation is a single pure function. Its inputs are the artist's choice (WebGPU or WebGL2), the GPU adapter probe (secure context, buffer limit 128 MiB, storage-buffer limit 32 MiB), in-app browser trust, and whether a VRM character or WebXR is in use. Its output is the backend, a status (available, unavailable, failed), a reason code and a Korean notice. Even when blocked, the backend value stays and only the status changes. WebGPU code is gathered in one entry that loads lazily only after the policy picks WebGPU.",
    ),
    t(
      "이 정책을 굳힌 사건이 있습니다. 같은 VRM 캐릭터를 두 엔진으로 그려 실루엣 픽셀 수를 비교하는 검사는 계속 통과했는데, 색을 처음 비교해 보니 합성 최대 차이가 255 중 164~169나 났습니다(번들 VRM 한 개, 한 장면 기준). 같은 엔진으로 두 번 그리면 차이가 0이라 원인은 툰 셰이더(MToon) 자체였습니다. three-vrm이 같은 규격을 두 번 따로 구현했기 때문입니다. 그래서 캐릭터가 있는 장면은 WebGL2로 고정하고, 격차를 상수로 박은 검사(합성 최대 200, 초과 채널 25%)를 만들었습니다.",
      "One incident hardened this policy. A check comparing silhouette pixel counts for the same VRM character on both engines kept passing, but the first color comparison showed a composited maximum difference of 164 to 169 out of 255 (one bundled VRM, one scene). Rendering twice on the same engine gave a difference of 0, so the cause was the toon shader (MToon) itself, which three-vrm implements twice independently. So scenes with a character are fixed to WebGL2, and a check was added with the gap pinned as constants (composited maximum 200, over-tolerance channels 25%).",
    ),
    t(
      "대가도 있습니다. 캐릭터가 있는 장면에서는 WebGPU의 이점을 쓰지 못하고, 실행 중에 캐릭터를 넣으면 캔버스가 다시 마운트됩니다. three의 WebGPURenderer는 장치 생성에 실패하면 내부에서 WebGL2로 내려가는 비공개 훅(_getFallback)이 있는데 ToonStudio는 이를 끊어 둡니다. 비공개 필드에 기대는 방식이라, 함수가 아니면 버전 계약 위반으로 초기화를 거부합니다.",
      "There are costs. A scene with a character cannot use WebGPU's benefits, and adding a character mid-session remounts the canvas. three's WebGPURenderer has a private hook (_getFallback) that silently drops to WebGL2 when device creation fails, and ToonStudio cuts it. Because this relies on a private field, initialization is refused as a version-contract violation if it is not a function.",
    ),
  ],
  keyPoints: [
    t("선택은 WebGPU 또는 WebGL2 둘뿐이고 자동 전환은 없습니다", "Only two choices, WebGPU or WebGL2, and no automatic switching"),
    t("막히면 백엔드는 유지하고 상태와 사유만 바꿉니다", "When blocked, the backend stays and only status and reason change"),
    t("실루엣은 같았지만 MToon 색은 최대 169/255 달랐습니다", "Silhouettes matched, but MToon colors differed by up to 169/255"),
    t("three의 숨은 WebGL2 폴백 훅도 끊어 둡니다", "three's hidden WebGL2 fallback hook is cut as well"),
  ],
  diagram: {
    id: "webgpu-explicit-engine-diagram",
    kind: "sequence",
    title: t("엔진 선택이 막혔을 때의 대화", "The conversation when an engine choice is blocked"),
    caption: t(
      "정책은 사용 가능 여부만 답하고, 다른 엔진으로 바꾸는 결정은 언제나 아티스트의 몫입니다.",
      "The policy only answers whether the choice can run; switching to another engine is always the artist's decision.",
    ),
    alt: t(
      "아티스트가 WebGPU를 고르면 정책이 가능하다고 답하고 WebGPU 청크가 지연 로드됩니다. 장면에 VRM 캐릭터를 추가하면 정책이 백엔드는 그대로 둔 채 사용 불가와 사유를 돌려주고, 패널은 WebGL2를 직접 선택하라고 안내합니다. 아티스트가 WebGL2를 고르면 그때서야 WebGL2 캔버스가 마운트됩니다.",
      "When the artist picks WebGPU, the policy says it is available and the WebGPU chunk loads lazily. When a VRM character is added, the policy returns unavailable with a reason while keeping the backend, and the panel tells the artist to choose WebGL2 directly. Only when the artist picks WebGL2 is a WebGL2 canvas mounted.",
    ),
    actors: [
      { id: "artist", label: t("아티스트", "Artist"), tone: "local" },
      { id: "panel", label: t("3D 렌더 엔진 카드", "3D engine card"), sub: t("편집기 뷰 패널", "Editor view panel"), tone: "local" },
      { id: "policy", label: t("엔진 선택 정책", "Engine policy"), sub: t("순수 함수 · 사유 코드", "Pure, with reasons"), tone: "good" },
      { id: "gpu", label: t("WebGPU 렌더러", "WebGPU renderer"), sub: t("지연 로드 청크", "Lazy chunk"), tone: "local" },
      { id: "gl", label: t("WebGL2 렌더러", "WebGL2 renderer"), sub: t("기준선", "Baseline"), tone: "local" },
    ],
    messages: [
      { from: "artist", to: "panel", label: t("엔진 선택 (기본 WebGPU)", "Pick engine (default WebGPU)") },
      { from: "panel", to: "policy", label: t("선택 + 프로브 + 신호", "Choice + probe + signals"), note: t("GPU 한도·인앱 브라우저·VRM·WebXR", "GPU limits, in-app browser, VRM, WebXR") },
      { from: "policy", to: "panel", label: t("available", "available"), style: "dashed", note: t("막힘 사유 없음", "No blocking reason") },
      { from: "panel", to: "gpu", label: t("청크 지연 로드 후 마운트", "Lazy-load chunk, then mount") },
      { from: "artist", to: "panel", label: t("VRM 캐릭터를 장면에 추가", "Add a VRM character") },
      { from: "panel", to: "policy", label: t("신호 갱신: vrmCharacters", "Signal update: vrmCharacters") },
      { from: "policy", to: "panel", label: t("unavailable + 사유", "unavailable + reason"), style: "dashed", note: t("백엔드는 webgpu 그대로", "Backend stays webgpu") },
      { from: "panel", to: "artist", label: t("WebGL2를 직접 선택해 주세요", "Please choose WebGL2 yourself"), style: "dashed" },
      { from: "artist", to: "panel", label: t("WebGL2 직접 선택", "Choose WebGL2 explicitly") },
      { from: "panel", to: "gl", label: t("WebGL2 캔버스 마운트", "Mount the WebGL2 canvas"), note: t("자동 전환은 없음", "Never automatic") },
    ],
  },
  usage: [
    {
      feature: t("3D 배경 편집기 · 3D 렌더 엔진 카드", "3D background editor · engine card"),
      role: t(
        "현재 엔진·사유·측정 프레임 시간을 보여 주고, 아티스트가 WebGPU와 WebGL2를 직접 고르게 합니다.",
        "Shows the current engine, reason and measured frame time, and lets the artist pick WebGPU or WebGL2 directly.",
      ),
      paths: [
        `${BG3D_DIR}/StudioBg3dEnginePanel.tsx`,
        `${BG3D_DIR}/studio-bg3d-engine-selection.ts#selectStudioBg3dEngine`,
        `${BG3D_DIR}/useStudioBg3dEngineRuntime.ts`,
      ],
      route: "/studio/bg3d",
    },
    {
      feature: t("WebGPU 점검과 인앱 브라우저 판정", "WebGPU probe and in-app browser verdict"),
      role: t(
        "장치를 만들지 않고 어댑터 한도를 확인하며, 인앱 브라우저의 GPU 신뢰도를 차단·선택 동의로 나눕니다.",
        "Checks adapter limits without creating a device and sorts in-app browsers into blocked or opt-in GPU trust.",
      ),
      paths: [`${BG3D_DIR}/studio-bg3d-webgpu-capability.ts`, `${BG3D_DIR}/studio-bg3d-inapp-browser.ts`],
    },
    {
      feature: t("WebGPU 렌더러 생성", "WebGPU renderer creation"),
      role: t(
        "숨은 WebGL2 폴백을 끊고, 초기화 시간 제한과 WebGPU 백엔드 확인, 장치 손실 보고를 맡습니다.",
        "Cuts the hidden WebGL2 fallback and handles the initialization timeout, the WebGPU backend check and device-loss reporting.",
      ),
      paths: [
        `${BG3D_DIR}/studio-bg3d-three-webgpu-renderer.ts#createStudioBg3dThreeWebGpuRenderer`,
        `${BG3D_DIR}/studio-bg3d-three-webgpu-entry.ts`,
        `${BG3D_DIR}/studio-bg3d-frame-backpressure.ts`,
      ],
    },
    {
      feature: t("실브라우저 검사와 색 격차 기록", "Real-browser gate and color-gap record"),
      role: t(
        "엔진 간 캡처 동등성과 VRM 색 격차를 상수로 단언합니다. WebGPU가 없는 환경에서는 패리티를 주장하지 않고 건너뜁니다.",
        "Asserts capture parity between engines and the VRM color gap as constants. Where WebGPU is absent it claims no parity and skips.",
      ),
      paths: [
        "scripts/verify-studio-bg3d-webgpu-engine.mjs",
        "docs/studio-bg3d-vrm-mtoon-backend-color-divergence-2026-08-29.md",
      ],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("선택은 유지하고 상태와 사유만 바꾸는 정책", "A policy that keeps the choice and changes only status and reason"),
      language: "ts",
      code: `type Backend = "webgpu" | "webgl2";
type Status = "available" | "unavailable";
interface Plan { backend: Backend; status: Status; reason: string }

export function selectEngine(choice: Backend, gpuOk: boolean, webglOnly: boolean): Plan {
  // 아티스트가 WebGL2를 직접 골랐다면 그대로 허용한다
  if (choice === "webgl2") return { backend: "webgl2", status: "available", reason: "user-webgl2" };
  if (!gpuOk || webglOnly) {
    // 다른 백엔드를 몰래 고르지 않는다: 선택은 유지하고 상태와 사유만 바꾼다
    const reason = webglOnly ? "webgl-only-feature" : "no-gpu";
    return { backend: "webgpu", status: "unavailable", reason };
  }
  return { backend: "webgpu", status: "available", reason: "user-webgpu" };
}`,
      codeEn: `type Backend = "webgpu" | "webgl2";
type Status = "available" | "unavailable";
interface Plan { backend: Backend; status: Status; reason: string }

export function selectEngine(choice: Backend, gpuOk: boolean, webglOnly: boolean): Plan {
  // If the artist explicitly chose WebGL2, allow it as is
  if (choice === "webgl2") return { backend: "webgl2", status: "available", reason: "user-webgl2" };
  if (!gpuOk || webglOnly) {
    // Never pick another backend quietly: keep the choice and change only status and reason
    const reason = webglOnly ? "webgl-only-feature" : "no-gpu";
    return { backend: "webgpu", status: "unavailable", reason };
  }
  return { backend: "webgpu", status: "available", reason: "user-webgpu" };
}`,
      explain: t(
        "실제 함수(selectStudioBg3dEngine)는 막힘 사유를 여러 개 모아 첫 번째를 대표 사유로 쓰고, 실패한 경우는 failed 상태로 구분합니다. 핵심은 반환값의 backend가 사용자의 선택과 다르게 바뀌는 경로가 없다는 점입니다.",
        "The real function (selectStudioBg3dEngine) collects several blocking reasons, uses the first as the headline reason and marks runtime failures as failed. The key point is that no path returns a backend different from the user's choice.",
      ),
      source: `${BG3D_DIR}/studio-bg3d-engine-selection.ts`,
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("'WebGPU'라고 표시한 렌더러는 WebGPU이거나 실패해야 한다", "A renderer labeled WebGPU must be WebGPU or fail"),
      language: "ts",
      code: `import { WebGPURenderer } from "three/webgpu";

export async function createStrictWebGpuRenderer(canvas: HTMLCanvasElement, timeoutMs = 10_000) {
  const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true });
  const internal = renderer as unknown as { _getFallback: unknown; backend: { isWebGPUBackend?: boolean } };
  // three의 비공개 훅이 사라졌다면 버전 계약이 바뀐 것이므로 시작하지 않는다
  if (typeof internal._getFallback !== "function") throw new Error("version-contract-unsupported");
  internal._getFallback = null; // 장치 생성이 실패해도 몰래 WebGL2로 내려가지 않는다
  await Promise.race([
    renderer.init(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("init timeout")), timeoutMs)),
  ]);
  if (internal.backend.isWebGPUBackend !== true) {
    await renderer.dispose();
    throw new Error("backend-unavailable");
  }
  return renderer;
}`,
      codeEn: `import { WebGPURenderer } from "three/webgpu";

export async function createStrictWebGpuRenderer(canvas: HTMLCanvasElement, timeoutMs = 10_000) {
  const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true });
  const internal = renderer as unknown as { _getFallback: unknown; backend: { isWebGPUBackend?: boolean } };
  // If three's private hook is gone, the version contract changed, so do not start
  if (typeof internal._getFallback !== "function") throw new Error("version-contract-unsupported");
  internal._getFallback = null; // even if device creation fails, never drop to WebGL2 quietly
  await Promise.race([
    renderer.init(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("init timeout")), timeoutMs)),
  ]);
  if (internal.backend.isWebGPUBackend !== true) {
    await renderer.dispose();
    throw new Error("backend-unavailable");
  }
  return renderer;
}`,
      explain: t(
        "비공개 필드에 기대는 방식이라 three를 올릴 때마다 확인이 필요합니다. 실제 코드는 여기에 요구 한도(버퍼 128MiB 등) 지정, 장치 손실 보고, 실패한 캔버스 재사용 금지까지 더합니다.",
        "Because it relies on a private field, it must be rechecked on every three upgrade. The real code adds required limits (such as a 128 MiB buffer), device-loss reporting and a ban on reusing a failed canvas.",
      ),
      source: `${BG3D_DIR}/studio-bg3d-three-webgpu-renderer.ts`,
      verify: "types",
    },
  ],
  links: [
    {
      title: "MDN · WebGPU API",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API",
      kind: "docs",
    },
    {
      title: "W3C · WebGPU",
      url: "https://www.w3.org/TR/webgpu/",
      kind: "spec",
    },
    {
      title: "three.js · WebGPURenderer",
      url: "https://threejs.org/docs/pages/WebGPURenderer.html",
      kind: "docs",
    },
    {
      title: "VRM specification · VRMC_materials_mtoon-1.0",
      url: "https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_materials_mtoon-1.0",
      kind: "spec",
      note: t("MToon 툰 셰이더 규격", "The MToon toon-shader specification"),
    },
    {
      title: "MDN · GPUQueue.onSubmittedWorkDone()",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/GPUQueue/onSubmittedWorkDone",
      kind: "docs",
      note: t("제출한 GPU 작업이 끝났는지 기다리는 API", "The API that waits for submitted GPU work to finish"),
    },
  ],
  chapterIds: ["web-3d-engine", "quality"],
  talk: {
    pitch: t(
      "많은 앱은 새 그래픽 엔진이 안 되면 몰래 옛 엔진으로 바꿉니다. 우리는 반대로 고른 엔진이 안 되면 안 된다고 말하고 이유를 보여 주는 정책입니다. 이유는 실측에서 나왔습니다. 같은 캐릭터가 두 엔진에서 실루엣은 같았지만 색은 최대 169/255나 달랐습니다. 그래서 캐릭터가 있는 장면은 WebGL2로 고정하고 그 격차를 검사 상수로 박아 두었습니다.",
      "Many apps quietly switch to the old graphics engine when the new one fails. We do the opposite: if the chosen engine cannot run, we say so and show why. The reason came from measurement. The same character had identical silhouettes on both engines but colors differing by up to 169 out of 255. So scenes with a character are fixed to WebGL2, and that gap is pinned as test constants.",
    ),
    analogy: t(
      "원고를 인쇄소에 넘겼는데 인쇄 방식이 몰래 바뀌어 색이 달라진 것과 같습니다. 방식이 바뀌면 반드시 알려 줘야 합니다.",
      "It is like handing a manuscript to a print shop that quietly changes the printing method and the colors shift. If the method changes, you must be told.",
    ),
    questions: [
      {
        question: t("WebGPU가 기본 아닌가요?", "Isn't WebGPU the default?"),
        answer: t(
          "기본 선호값은 WebGPU입니다. 다만 인앱 브라우저·VRM 캐릭터·WebXR 등으로 막히면 사용 불가로 표시하고, WebGL2는 아티스트가 직접 고르도록 안내합니다. 자동 전환은 없습니다.",
          "The default preference is WebGPU. But when it is blocked, for example by an in-app browser, a VRM character or WebXR, it is shown as unavailable and the artist is guided to pick WebGL2 manually. There is no automatic switch.",
        ),
      },
      {
        question: t("왜 자동 폴백이 나쁜가요?", "Why is automatic fallback bad?"),
        answer: t(
          "테스트한 렌더러와 사용자가 본 픽셀이 어긋나고, 장치 손실 같은 실패가 다른 엔진의 성공으로 가려집니다. 협업 프로젝트라면 사람마다 다른 색으로 나올 수도 있습니다.",
          "The tested renderer and the pixels users see drift apart, and failures like device loss are hidden behind another engine's success. In a collaborative project, people could even see different colors.",
        ),
      },
      {
        question: t("색 차이는 고칠 수 없나요?", "Can't the color difference be fixed?"),
        answer: t(
          "상류 라이브러리가 같은 규격을 독립적으로 두 번 구현한 차이라 우리 층에서 고칠 수 있는 종류가 아니라고 문서가 판단했습니다. 상류가 수렴하면 검사 수치가 내려가고, 그때 제한을 풉니다.",
          "The doc concluded it comes from the upstream library implementing one spec twice independently, so it cannot be fixed at our layer. If upstream converges, the check values drop and the restriction can be lifted.",
        ),
      },
    ],
    pitfall: t(
      "'WebGPU가 항상 기본으로 동작한다'고 말하면 과장입니다. 인앱 브라우저·VRM 캐릭터·WebXR에서는 막히고 WebGL2는 직접 골라야 합니다. 색 수치(164–169/255)는 번들 VRM 1개·한 장면의 측정값이며, 이 검사는 WebGPU가 있는 브라우저에서만 실행되고 없으면 종료 코드 2로 명시적으로 건너뜁니다.",
      "Saying WebGPU always runs by default is an overstatement: it is blocked in in-app browsers, with VRM characters and in WebXR, and WebGL2 must be chosen manually. The color figures (164 to 169 out of 255) are one bundled VRM in one scene, and this check runs only in a browser that has WebGPU; otherwise it explicitly skips with exit code 2.",
    ),
  },
  technologies: ["WebGPU", "WebGL2", "Three.js", "@pixiv/three-vrm", "VRM"],
  facts: [
    { value: "164–169 / 255", label: t("같은 VRM의 두 엔진 합성 색 최대 차이(번들 VRM 1개, 한 장면)", "Max composited color difference of one VRM across engines (one bundled VRM, one scene)"), source: "docs/studio-bg3d-vrm-mtoon-backend-color-divergence-2026-08-29.md" },
    { value: "128 MiB / 32 MiB", label: t("WebGPU 점검 하한: 버퍼 크기 / 저장 버퍼 바인딩 크기", "WebGPU probe floors: buffer size / storage-buffer binding size"), source: `${BG3D_DIR}/studio-bg3d-webgpu-capability.ts` },
    { value: "200 / 25 %", label: t("검사 상수: 합성 최대 차이 / 허용치 초과 채널 비율", "Gate constants: max composited difference / over-tolerance channel share"), source: "scripts/verify-studio-bg3d-webgpu-engine.mjs" },
  ],
  reviewedAt: "2026-10-07",
};

export const TOON_SHADING_OUTLINE: EngineeringAtlasEntry = {
  id: "toon-shading-outline",
  category: "three-d",
  name: "LT 변환 · Sobel · 스크린톤",
  title: t(
    "3D 장면을 만화의 '선'과 '톤'으로 갈라 주는 계산",
    "The math that splits a 3D scene into a manga's lines and tones",
  ),
  status: "live",
  tagline: t(
    "3D 캡처의 색·깊이·법선을 읽어 컬러·톤·질감선·주선 네 레이어로 나눕니다.",
    "It reads a 3D capture's colour, depth and normals and splits it into four layers.",
  ),
  background: [
    t(
      "만화가는 사진을 보며 윤곽을 따라 선을 긋고, 어두운 곳에는 점무늬 종이(스크린톤)를 붙여 명암을 냅니다. 3D 장면을 만화 배경으로 쓰려면 이 두 일을 컴퓨터가 대신해 줘야 합니다. ToonStudio의 LT(선과 톤) 변환은 3D 화면을 한 장 찍은 뒤 선과 톤을 서로 다른 레이어로 갈라 놓습니다. 그래서 작가는 선 위에 펜을 덧대거나, 선만 지우고 톤만 남기는 식으로 고칠 수 있습니다. 이름과 개념은 Clip Studio Paint의 같은 기능을 본떴다고 코드 주석이 밝힙니다.",
      "A manga artist traces outlines while looking at a photo and pastes dotted paper (screentone) on dark areas to show shading. To use a 3D scene as a manga background, the computer has to do both jobs. ToonStudio's LT (line and tone) conversion takes one picture of the 3D view and splits the lines and tones into separate layers, so an artist can pen over the lines, or erase the lines and keep only the tones. A code comment says the name and idea are modelled on the same feature in Clip Studio Paint.",
    ),
    t(
      "선은 네 가지 단서를 겹쳐 찾습니다. 밝기가 급히 변하는 곳(Sobel 필터), 물체와 빈 배경의 경계(알파 실루엣), 깊이가 계단처럼 변하는 곳, 면의 방향(법선)이 꺾이는 주름입니다. 깊이 윤곽에는 요령이 있습니다. 완만한 경사는 이웃의 앞뒤 차이가 같아 서로 상쇄되고, 깊이 계단은 가리는 쪽(가까운 면)에만 남겨서 먼 쪽에 후광이 생기지 않습니다. 단서 중 가장 센 값을 고르고 설정한 굵기만큼 부풀려 주선을 만듭니다.",
      "Lines are found by layering four clues: where brightness changes sharply (a Sobel filter), the border between an object and empty background (alpha silhouette), where depth changes like a step, and creases where the face direction (normal) bends. Depth contours have a trick. A gentle slope has equal changes toward the front and back, which cancel out, while a depth step is kept only on the occluding (nearer) surface so no halo forms on the far side. The strongest clue wins and is thickened to the chosen width to make the main line.",
    ),
    t(
      "톤은 밝기를 2~8단계로 나눈 뒤 어두울수록 큰 점을 찍습니다. 점·선·교차선·노이즈 무늬 중에서 고르고, 격자를 기울여(기본 45°) 인쇄된 망점처럼 만듭니다. 점의 넓이가 곧 잉크의 양이라 밝기와 비례합니다. 결과는 컬러·톤·질감선·주선이 뒤에서 앞 순서인 한 묶음('3D LT 배경')으로 한꺼번에 들어가고, 중간에 실패해도 일부만 남지 않습니다. 같은 입력이면 같은 출력이며 AI는 쓰지 않습니다.",
      "Tone splits brightness into 2 to 8 levels and prints bigger dots where it is darker. The pattern can be dots, lines, crosshatch or noise, and the grid is tilted (45° by default) to look like printed halftone. The dot's area is the amount of ink, so it follows brightness. The result goes in all at once as one bundle ('3D LT background') with colour, tone, texture line and main line from back to front, and a failure midway leaves nothing half-done. The same input gives the same output, and no AI is involved.",
    ),
    t(
      "대안은 메시의 윤곽을 기하로 뽑는 방식입니다. 하지만 조명과 재질이 반영된 최종 화면의 선은 기하만으로 못 만들고 사진에도 같은 도구가 돌아야 해서 이미지 기반을 택했다고 검토 문서(2026-09-30)가 밝힙니다. 대가도 분명합니다. 결과는 벡터 선이 아니라 픽셀이고, 얇은 형태는 해상도와 부드러움 설정에 민감합니다. 캡처는 약 838만 화소 이내로 제한되고, 계산은 Worker에서 최대 120초까지 기다립니다.",
      "The alternative is to extract outlines from the mesh geometry. But the review document (2026-09-30) explains that the lines of a final picture with lighting and materials cannot come from geometry alone, and the same tool must work on photos, so an image-based approach was chosen. The cost is clear: the result is pixels, not vector lines, and thin shapes are sensitive to resolution and smoothing. A capture is limited to about 8.4 million pixels, and the work waits up to 120 seconds in a Worker.",
    ),
  ],
  keyPoints: [
    t("선은 밝기·실루엣·깊이·법선 네 단서 중 가장 센 값으로 정합니다", "A line takes the strongest of four clues: brightness, silhouette, depth, normal"),
    t("깊이 계단은 가리는 쪽에만 선을 남겨 후광을 막습니다", "A depth step keeps a line only on the occluding side, so no halo"),
    t("톤은 어두울수록 큰 점: 점의 넓이가 곧 잉크의 양입니다", "Tone prints bigger dots where darker: dot area is the amount of ink"),
    t("컬러·톤·질감선·주선 네 레이어가 한 묶음으로 들어갑니다", "Colour, tone, texture and main lines enter as one four-layer bundle"),
  ],
  diagram: {
    id: "toon-shading-outline-diagram",
    kind: "graph",
    title: t("한 장의 캡처가 선 레이어와 톤 레이어로 갈라지는 길", "How one capture splits into line layers and a tone layer"),
    caption: t(
      "위쪽은 선, 아래쪽은 톤입니다. 두 갈래는 같은 캡처에서 시작해 마지막에 한 묶음으로 합쳐집니다.",
      "The top row is lines and the bottom row is tone. Both start from the same capture and join as one bundle at the end.",
    ),
    alt: t(
      "3D 화면 캡처에서 두 길이 갈라집니다. 위쪽 길은 밝기, 실루엣, 깊이, 법선 네 단서를 합친 뒤 가장 센 값을 고르고 굵기만큼 부풀려 주선과 질감선 레이어를 만듭니다. 아래쪽 길은 밝기를 몇 단계로 나눈 뒤 기울인 점 격자로 어두울수록 큰 점을 찍어 톤 레이어를 만듭니다. 두 길의 결과는 마지막에 3D LT 배경 묶음으로 합쳐집니다.",
      "Two roads split from the 3D view capture. The top road combines the four clues of brightness, silhouette, depth and normal, picks the strongest value and thickens it to make the main-line and texture-line layers. The bottom road splits brightness into levels and prints bigger dots where it is darker on a tilted dot grid to make the tone layer. Both results join at the end as the 3D LT background bundle.",
    ),
    nodes: [
      { id: "capture", label: t("3D 화면 캡처", "3D view capture"), sub: t("색 · 깊이 · 법선 화소", "Colour, depth, normal pixels"), tone: "local", at: [0, 0] },
      { id: "clues", label: t("선의 단서 넷", "Four line clues"), sub: t("밝기·실루엣·깊이·법선", "Brightness, silhouette, depth, normal"), tone: "local", at: [1, 0] },
      { id: "strongest", label: t("가장 센 값", "Strongest wins"), sub: t("max(단서) × 선 세기", "max of clues × strength"), tone: "local", at: [2, 0] },
      { id: "thicken", label: t("굵기만큼 부풀림", "Thicken the line"), sub: t("최대값 필터, 반경 ≤ 4px", "Max filter, radius up to 4 px"), tone: "local", at: [3, 0] },
      { id: "lines", label: t("주선 · 질감선", "Main and texture lines"), sub: t("선 색 + 알파", "Line colour plus alpha"), tone: "good", at: [4, 0] },
      { id: "levels", label: t("밝기를 단계로", "Brightness to levels"), sub: t("2~8단계로 나눔", "Split into 2 to 8 levels"), tone: "local", at: [1, 1] },
      { id: "dots", label: t("기울인 점 격자", "Tilted dot grid"), sub: t("어두울수록 큰 점", "Darker means bigger dots"), tone: "local", at: [2, 1] },
      { id: "tone", label: t("톤 레이어", "Tone layer"), sub: t("스크린톤 알파", "Screentone alpha"), tone: "good", at: [3, 1] },
      { id: "bundle", label: t("3D LT 배경 묶음", "3D LT background"), sub: t("네 레이어를 한 번에", "All four layers at once"), tone: "good", at: [4, 1] },
    ],
    edges: [
      { from: "capture", to: "clues" },
      { from: "clues", to: "strongest" },
      { from: "strongest", to: "thicken" },
      { from: "thicken", to: "lines" },
      { from: "capture", to: "levels", label: t("밝기(휘도)", "luminance") },
      { from: "levels", to: "dots" },
      { from: "dots", to: "tone" },
      { from: "lines", to: "bundle", label: t("선 레이어", "lines") },
      { from: "tone", to: "bundle", label: t("톤", "tone") },
    ],
  },
  usage: [
    {
      feature: t("3D 배경 편집기 · LT 출력 패널", "3D background editor · LT output panel"),
      role: t(
        "선(굵기·깊이 선·질감선)과 톤(방식·무늬·각도·빈도)을 정하고 내장 프리셋 5종을 고릅니다. 삽입하면 3D 장면이 컬러·톤·질감선·주선 레이어 묶음으로 들어갑니다.",
        "Sets lines (width, depth lines, texture lines) and tone (mode, pattern, angle, frequency) and picks from 5 built-in presets. Inserting puts the 3D scene in as a bundle of colour, tone, texture-line and main-line layers.",
      ),
      paths: [
        `${BG3D_DIR}/StudioBg3dLtPanel.tsx`,
        `${BG3D_DIR}/studio-bg3d-lt-presets.ts`,
        `${BG3D_DIR}/studio-bg3d-editor-insert-host.ts`,
      ],
      route: "/studio/bg3d",
    },
    {
      feature: t("선과 톤 계산 (래스터 단계)", "Line and tone computation (raster stage)"),
      role: t(
        "캡처한 색·깊이·법선을 받아 Sobel, 깊이 윤곽, 법선 주름, 점 무늬를 순수 함수로 계산합니다. 입력 버퍼를 바꾸지 않고 새 버퍼를 돌려줍니다.",
        "Takes the captured colour, depth and normals and computes Sobel, depth contours, normal creases and dot patterns as pure functions. It returns new buffers without modifying the input.",
      ),
      paths: [
        `${BG3D_DIR}/studio-bg3d-lt-render.ts#renderStudioBg3dLtLayers`,
        `${BG3D_DIR}/studio-bg3d-lt-depth-edges.ts#extractStudioBg3dLtDepthEdges`,
        `${BG3D_DIR}/studio-bg3d-lt-normal-edges.ts#extractStudioBg3dLtNormalEdges`,
        `${BG3D_DIR}/studio-bg3d-lt-three-depth.ts`,
      ],
    },
    {
      feature: t("Worker 실행과 레이어 묶음 교체", "Worker execution and bundle replacement"),
      role: t(
        "계산을 Web Worker로 보내 화면을 막지 않고, 결과를 네 역할의 레이어 묶음으로 한 번에 교체합니다. 실패하면 일부만 남지 않습니다.",
        "Sends the computation to a Web Worker so the screen is not blocked, and swaps the result in as one four-role layer bundle. A failure leaves nothing partial.",
      ),
      paths: [
        `${BG3D_DIR}/studio-bg3d-lt-render-worker-client.ts`,
        `${BG3D_DIR}/studio-bg3d-lt-render.worker.ts`,
        `${BG3D_DIR}/studio-bg3d-lt-layer-plan.ts#planStudioBg3dLtLayers`,
      ],
    },
    {
      feature: t("캐릭터 셰이퍼 · 이미지 파일 LT 변환", "Character shaper · image-file LT conversion"),
      role: t(
        "이미지 파일을 선화·톤 두 레이어로 바꿉니다(Gaussian, Sobel, 임계, 팽창, Bayer 4×4 톤). 3D 뷰 캡처 연결은 아직 없어 파일 변환과 PNG 저장만 쓸 수 있습니다.",
        "Turns an image file into line and tone layers (Gaussian, Sobel, threshold, dilation, Bayer 4×4 tone). There is no 3D-view capture connection yet, so only file conversion and PNG saving work.",
      ),
      paths: [
        "apps/web/src/domains/creator/lt-convert/studio-lt-convert.ts",
        "apps/web/src/domains/creator/lt-convert/StudioLtConvertDialog.tsx",
        "apps/web/src/domains/creator/character-shaper/CharacterShaperViewportHud.tsx",
      ],
      route: "/studio/character",
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("깊이 계단에서 가리는 쪽에만 윤곽을 남기기", "Keep a contour only on the occluding side of a depth step"),
      language: "ts",
      code: `/** 깊이 한 줄(작을수록 가까움)에서 i 번 화소의 윤곽 세기. 가리는 쪽(가까운 면)에만 값이 남는다. */
export function foregroundContour(depth: readonly number[], i: number): number {
  const center = depth[i]!;
  const left = depth[i - 1]! - center; // 양수면 왼쪽 이웃이 더 멀다
  const right = depth[i + 1]! - center; // 양수면 오른쪽 이웃이 더 멀다
  const farther = Math.max(0, left, right); // 더 먼 이웃과의 차이
  const nearer = Math.max(0, -left, -right); // 더 가까운 이웃과의 차이
  // 완만한 경사는 앞뒤 차이가 같아 0이 되고, 깊이 계단은 가까운 쪽에만 남는다
  return Math.max(0, farther - nearer);
}

const wall = [0.3, 0.3, 0.9, 0.9]; // 가까운 벽(0.3) 뒤로 먼 벽(0.9)
export const nearEdge = foregroundContour(wall, 1); // 약 0.6: 가까운 벽의 끝에 선이 선다
export const farEdge = foregroundContour(wall, 2); // 0: 먼 벽에는 후광이 생기지 않는다
export const slope = foregroundContour([0.4, 0.5, 0.6], 1); // 0: 경사는 선이 되지 않는다`,
      codeEn: `/** Contour strength of pixel i in one row of depth (smaller is nearer). It stays only on the occluding (nearer) side. */
export function foregroundContour(depth: readonly number[], i: number): number {
  const center = depth[i]!;
  const left = depth[i - 1]! - center; // positive: the left neighbour is farther
  const right = depth[i + 1]! - center; // positive: the right neighbour is farther
  const farther = Math.max(0, left, right); // difference to the farther neighbour
  const nearer = Math.max(0, -left, -right); // difference to the nearer neighbour
  // A gentle slope has equal front and back differences and gives 0; a depth step stays only on the nearer side
  return Math.max(0, farther - nearer);
}

const wall = [0.3, 0.3, 0.9, 0.9]; // a near wall (0.3) in front of a far wall (0.9)
export const nearEdge = foregroundContour(wall, 1); // about 0.6: a line stands at the near wall's end
export const farEdge = foregroundContour(wall, 2); // 0: the far wall gets no halo
export const slope = foregroundContour([0.4, 0.5, 0.6], 1); // 0: a slope does not become a line`,
      explain: t(
        "실제 코드(extractStudioBg3dLtDepthEdges)는 가로·세로·두 대각선 네 방향을 보고, 먼 하늘 쪽 깊이 압축을 보정하는 비율과 곡률 단서도 더합니다. 핵심인 farther − nearer 한 줄은 같습니다.",
        "The real code (extractStudioBg3dLtDepthEdges) looks along four directions (horizontal, vertical and two diagonals) and also adds a ratio that compensates depth compression in the distance, plus a curvature clue. The key line, farther − nearer, is the same.",
      ),
      source: `${BG3D_DIR}/studio-bg3d-lt-depth-edges.ts`,
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("어두울수록 큰 점: 점의 넓이가 곧 잉크의 양", "Darker means bigger dots: the dot's area is the amount of ink"),
      language: "ts",
      code: `const frac = (value: number): number => value - Math.floor(value);

/** 칸 안에서 점 중심에서 떨어진 정도를 넓이(0~1)로 바꾼 값. 원의 넓이 = π × 반지름². */
function dotRank(x: number, y: number, period: number, angle: number): number {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // 격자를 angle 만큼 돌려 칸 안의 위치 (u, v)를 0~1로 구한다
  const u = frac(((x + 0.5) * cos + (y + 0.5) * sin) / period);
  const v = frac((-(x + 0.5) * sin + (y + 0.5) * cos) / period);
  return Math.min(1, Math.PI * ((u - 0.5) ** 2 + (v - 0.5) ** 2));
}

/** luma: 0(검정)~1(흰색). 어두울수록 coverage 가 커서 점이 커지고, 가장자리는 부드럽게 이어진다. */
export function toneAlpha(luma: number, x: number, y: number, frequency = 60, angleDeg = 45): number {
  const period = Math.min(256, Math.max(2, 600 / frequency)); // 점 간격(px)
  const edge = Math.min(0.2, Math.max(0.03, 1 / period));
  const coverage = 1 - luma;
  const rank = dotRank(x, y, period, (angleDeg * Math.PI) / 180);
  return Math.min(1, Math.max(0, (coverage - rank) / edge + 0.5));
}`,
      codeEn: `const frac = (value: number): number => value - Math.floor(value);

/** How far from the dot centre inside a cell, turned into an area (0 to 1). Circle area = π × radius². */
function dotRank(x: number, y: number, period: number, angle: number): number {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Rotate the grid by angle and take the position (u, v) inside the cell as 0 to 1
  const u = frac(((x + 0.5) * cos + (y + 0.5) * sin) / period);
  const v = frac((-(x + 0.5) * sin + (y + 0.5) * cos) / period);
  return Math.min(1, Math.PI * ((u - 0.5) ** 2 + (v - 0.5) ** 2));
}

/** luma: 0 (black) to 1 (white). Darker means bigger coverage, so bigger dots, with a soft edge. */
export function toneAlpha(luma: number, x: number, y: number, frequency = 60, angleDeg = 45): number {
  const period = Math.min(256, Math.max(2, 600 / frequency)); // dot spacing (px)
  const edge = Math.min(0.2, Math.max(0.03, 1 / period));
  const coverage = 1 - luma;
  const rank = dotRank(x, y, period, (angleDeg * Math.PI) / 180);
  return Math.min(1, Math.max(0, (coverage - rank) / edge + 0.5));
}`,
      explain: t(
        "rank가 π×반지름²이라서 coverage보다 작은 칸은 넓이가 coverage인 원이 됩니다. 밝기 0.5면 칸의 절반이 잉크입니다. 실제 코드는 스크린톤 모드에서 coverage를 0.85제곱해 중간 톤을 살짝 밝히고, 선·교차선·노이즈 무늬도 같은 틀로 만듭니다.",
        "Because rank is π × radius², the cells below coverage form a circle whose area equals coverage; at brightness 0.5, half of the cell is ink. The real code raises coverage to the power 0.85 in screentone mode to lighten midtones slightly, and makes the line, crosshatch and noise patterns in the same framework.",
      ),
      source: `${BG3D_DIR}/studio-bg3d-lt-render.ts`,
      verify: "types",
    },
  ],
  links: [
    {
      title: "Clip Studio Paint · Convert to lines and tones (EX)",
      url: "https://help.clip-studio.com/en-us/manual_en/390_filters/Convert_to_lines_and_tones_(EX_only).htm",
      kind: "docs",
      note: t("LT 변환이라는 개념의 원조 기능 설명", "The original feature behind the idea of LT conversion"),
    },
    {
      title: "three.js documentation · Constants (depth packing)",
      url: "https://threejs.org/docs/pages/global.html",
      kind: "docs",
      note: t("깊이를 RGBA로 담는 RGBADepthPacking", "RGBADepthPacking, which stores depth in RGBA"),
    },
    {
      title: "ITU-R BT.709",
      url: "https://www.itu.int/rec/R-REC-BT.709",
      kind: "spec",
      note: t("밝기 계산에 쓰는 0.2126·0.7152·0.0722 가중치의 표준", "The standard behind the 0.2126, 0.7152, 0.0722 luminance weights"),
    },
    {
      title: "MDN · Web Workers API",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API",
      kind: "guide",
      note: t("무거운 픽셀 계산을 화면 밖으로 옮기는 법", "Moving heavy pixel work off the main thread"),
    },
    {
      title: "MDN · ImageData",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/ImageData",
      kind: "docs",
    },
  ],
  chapterIds: ["web-3d-engine", "worker-architecture"],
  talk: {
    pitch: t(
      "3D 모델을 만화 배경으로 쓰려면 사진 같은 그림을 만화의 선과 점무늬로 바꿔야 합니다. ToonStudio는 3D 화면을 한 장 찍어 색·깊이·법선을 읽고, 선은 네 단서 중 가장 센 값으로, 톤은 어두울수록 큰 점으로 계산해 서로 다른 레이어로 내놓습니다. AI 없이 같은 입력이면 같은 결과가 나오는 계산이라 작가가 믿고 고칠 수 있습니다.",
      "To use a 3D model as a manga background, a photo-like picture must become manga lines and dot patterns. ToonStudio takes one picture of the 3D view, reads colour, depth and normals, computes lines from the strongest of four clues and tone as bigger dots where darker, and hands them out as separate layers. It uses no AI and gives the same result for the same input, so an artist can edit it with confidence.",
    ),
    analogy: t(
      "사진 위에 트레이싱지를 얹어 윤곽만 따고, 어두운 곳에는 점무늬 종이를 오려 붙이는 작업을 컴퓨터가 합니다.",
      "The computer does what an artist does with tracing paper over a photo: trace only the outlines, then cut and stick dotted paper onto the dark parts.",
    ),
    questions: [
      {
        question: t("AI로 선을 따는 건가요?", "Is AI extracting the lines?"),
        answer: t(
          "아니요. Sobel 같은 고전적인 픽셀 계산이고, 같은 입력이면 같은 출력이 나옵니다. 점 무늬의 위상도 타일 경계에서 이어지도록 계산합니다.",
          "No. It is classic pixel math such as Sobel, and the same input always gives the same output. Even the dot pattern's phase is computed to continue across tile borders.",
        ),
      },
      {
        question: t("왜 깊이 윤곽을 따로 두나요?", "Why have a separate depth contour?"),
        answer: t(
          "밝기만 보면 같은 색의 물체가 겹친 곳에서 선이 사라지기 때문입니다. 깊이 계단은 가리는 쪽에만 선을 남겨 두껍거나 이중인 선을 막습니다.",
          "Looking only at brightness loses the line where same-coloured objects overlap. A depth step keeps the line only on the occluding side, which avoids thick or double lines.",
        ),
      },
      {
        question: t("벡터 선으로 나오나요?", "Does it come out as vector lines?"),
        answer: t(
          "아니요. 결과는 픽셀 레이어이고, 벡터 추적은 별도 후처리라고 코드 주석이 밝힙니다. 얇은 형태는 해상도와 부드러움 설정에 민감합니다.",
          "No. The result is pixel layers, and a code comment says vector tracing is a separate post-process. Thin shapes are sensitive to resolution and smoothing.",
        ),
      },
    ],
    pitfall: t(
      "'3D 스크린톤 셰이더'까지 된다고 말하지 마세요. 3D 스크린톤 & 망점 셰이더 패널은 아직 화면 어디에도 연결되지 않았습니다. 이미지 파일용 범용 LT 변환도 3D 뷰 캡처가 연결돼 있지 않아 파일 변환만 됩니다. 속도 측정값과 결과 품질 비교 수치는 이 카드에 없습니다.",
      "Do not claim a '3D screentone shader' exists in the product. The 3D screentone and halftone shader panel is not connected to any screen yet. The generic image-file LT conversion also has no 3D-view capture connection, so only file conversion works. This card has no speed measurements or quality-comparison numbers.",
    ),
  },
  technologies: ["Three.js", "Web Workers", "Sobel", "Clip Studio Paint"],
  facts: [
    { value: "8,388,608 px", label: t("3D LT 한 번에 다루는 최대 화소 수", "Most pixels one 3D LT run handles"), source: `${BG3D_DIR}/studio-bg3d-lt-depth-edges.ts` },
    { value: "4", label: t("한 묶음의 레이어 역할: 컬러·톤·질감선·주선", "Layer roles in one bundle: colour, tone, texture line, main line"), source: `${BG3D_DIR}/studio-bg3d-lt-layer-plan.ts` },
    { value: "5", label: t("내장 LT 프리셋 수", "Built-in LT presets"), source: `${BG3D_DIR}/studio-bg3d-lt-presets.ts` },
    { value: "2~8", label: t("톤 단계 수의 허용 범위", "Allowed range of tone levels"), source: `${BG3D_DIR}/studio-bg3d-lt-render.ts` },
  ],
  reviewedAt: "2026-10-07",
};

/** three-d 카테고리의 렌더링 계열 카드. */
export const THREE_D_RENDER_CARDS: readonly EngineeringAtlasEntry[] = [THREE_R3F_VIEWPORT, WEBGPU_EXPLICIT_ENGINE, TOON_SHADING_OUTLINE];
