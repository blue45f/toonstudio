/**
 * Adobe Photoshop Web (v2026.21.0.0) 프로시저럴 웹 필터 프리셋 카탈로그 (Part B: 카테고리 11~24)
 *
 * `WebFilterPresets.chunk.C-Wm1ZUu.js`(`ev_973faac206a14eecb13f02df2d8d99e11806c47c95fabcdf52c9d57736b02b0a`)에서
 * 추출한 `motionBlur` ~ `twirl` 및 고급 프로시저럴 6종 프리셋 정의.
 */

import type { PhotoshopWebFilterPreset } from "./studio-photoshop-web-filter-presets";

export const PHOTOSHOP_WEB_FILTER_PRESETS_PART_B: readonly PhotoshopWebFilterPreset[] = [
  // 11. motionBlur
  {
    name: "slidingDoor",
    uiName: "슬라이딩 도어 (Sliding Door)",
    category: "motionBlur",
    previewPath: "effects/presets/motion-blur/sliding-door_v1.jpg",
    isSuperPreset: true,
    parameters: [
      { name: "strength", value: [1] },
      { name: "angle", value: [0] },
      { name: "bidirectional", value: [0] },
      { name: "borderSize", value: [0] },
      { name: "wrap", value: [2] },
    ],
  },
  {
    name: "shootingStar",
    uiName: "슈팅 스타 (Shooting Star)",
    category: "motionBlur",
    previewPath: "effects/presets/motion-blur/shooting-star_v1.jpg",
    isSuperPreset: true,
    parameters: [
      { name: "strength", value: [0.5] },
      { name: "angle", value: [45] },
      { name: "bidirectional", value: [0] },
      { name: "borderSize", value: [1] },
      { name: "wrap", value: [2] },
    ],
  },
  // 12. bokehBlur
  {
    name: "softBokeh",
    uiName: "소프트 보케 (Soft Bokeh)",
    category: "bokehBlur",
    previewPath: "effects/presets/bokeh-blur/soft-bokeh_v1.png",
    isSuperPreset: true,
    parameters: [
      { name: "strength", value: [0.25] },
      { name: "density", value: [0.5] },
    ],
  },
  {
    name: "strongBokeh",
    uiName: "스트롱 보케 (Strong Bokeh)",
    category: "bokehBlur",
    previewPath: "effects/presets/bokeh-blur/strong-bokeh_v1.png",
    isSuperPreset: true,
    parameters: [
      { name: "strength", value: [0.6] },
      { name: "density", value: [1] },
    ],
  },
  // 13. radialBlur
  {
    name: "ripple",
    uiName: "리플 (Ripple)",
    category: "radialBlur",
    previewPath: "effects/presets/radial-blur/ripple_v1.png",
    isSuperPreset: true,
    parameters: [
      { name: "strength", value: [0.35] },
      { name: "blurBorder", value: [0] },
      { name: "insideOut", value: [0] },
      { name: "wrap", value: [2] },
    ],
  },
  {
    name: "spinCycle",
    uiName: "스핀 사이클 (Spin Cycle)",
    category: "radialBlur",
    previewPath: "effects/presets/radial-blur/spin-cycle_v1.png",
    isSuperPreset: true,
    parameters: [
      { name: "strength", value: [1] },
      { name: "blurBorder", value: [1] },
      { name: "insideOut", value: [0] },
      { name: "wrap", value: [3] },
    ],
  },
  // 14. lensDistortion
  {
    name: "lowRay",
    uiName: "로우 레이 (Low Ray)",
    category: "lensDistortion",
    previewPath: "effects/presets/lens-distortion/low-ray_v1.png",
    isSuperPreset: true,
    parameters: [
      { name: "strength", value: [0.8] },
      { name: "chromatic", value: [0] },
      { name: "wrap", value: [2] },
    ],
  },
  {
    name: "glowRay",
    uiName: "글로우 레이 (Glow Ray)",
    category: "lensDistortion",
    previewPath: "effects/presets/lens-distortion/glow-ray_v1.png",
    isSuperPreset: true,
    parameters: [
      { name: "strength", value: [0.7] },
      { name: "chromatic", value: [0.9] },
      { name: "wrap", value: [3] },
    ],
  },
  // 15. bloom
  {
    name: "goldenHour",
    uiName: "골든 아워 (Golden Hour)",
    category: "bloom",
    previewPath: "effects/presets/bloom/golden-hour_v1.jpg",
    isSuperPreset: true,
    parameters: [
      { name: "intensity", value: [0.5] },
      { name: "threshold", value: [0.4] },
      { name: "softness", value: [0.6] },
      { name: "radius", value: [1] },
      { name: "color", value: [1, 0.569, 0] },
    ],
  },
  {
    name: "ultraViolet",
    uiName: "울트라 바이올렛 (Ultra Violet)",
    category: "bloom",
    previewPath: "effects/presets/bloom/ultra-violet_v1.jpg",
    isSuperPreset: true,
    parameters: [
      { name: "intensity", value: [1] },
      { name: "threshold", value: [0.3] },
      { name: "softness", value: [1] },
      { name: "radius", value: [1] },
      { name: "color", value: [0, 0.149, 1] },
    ],
  },
  // 16. grain
  {
    name: "softGrain",
    uiName: "소프트 그레인 (Soft Grain)",
    category: "grain",
    previewPath: "effects/presets/grain/soft-grain_v1.png",
    isSuperPreset: true,
    parameters: [
      { name: "scale", value: [0.6] },
      { name: "intensity", value: [0.3] },
      { name: "chroma", value: [0] },
    ],
  },
  {
    name: "colorGrain",
    uiName: "컬러 그레인 (Color Grain)",
    category: "grain",
    previewPath: "effects/presets/grain/color-grain_v1.png",
    isSuperPreset: true,
    parameters: [
      { name: "scale", value: [0.5] },
      { name: "intensity", value: [1] },
      { name: "chroma", value: [1] },
    ],
  },
  // 17. noise
  {
    name: "volume1",
    uiName: "볼륨 1 (Volume 1)",
    category: "noise",
    previewPath: "effects/presets/noise/volume-1_v1.png",
    isSuperPreset: true,
    parameters: [
      { name: "offset", value: [0.1] },
      { name: "intensity", value: [0.5] },
      { name: "monochrome", value: [1] },
    ],
  },
  {
    name: "volume3",
    uiName: "볼륨 3 (Volume 3)",
    category: "noise",
    previewPath: "effects/presets/noise/volume-3_v1.png",
    isSuperPreset: true,
    parameters: [
      { name: "offset", value: [0.5] },
      { name: "intensity", value: [0.85] },
      { name: "monochrome", value: [0] },
    ],
  },
  // 18. lightLeak (advanced procedural)
  {
    name: "filmBurn",
    uiName: "필름 번 (Film Burn)",
    category: "lightLeak",
    previewPath: "effects/presets/light-leak/film-burn_v1.png",
    parameters: [
      { name: "strength", value: [1] },
      { name: "position", value: [1, 0.485] },
      { name: "angle", value: [272] },
      { name: "hardness", value: [0.2] },
      { name: "width", value: [1] },
      { name: "height", value: [0.06] },
      { name: "color", value: [0.988, 0.776, 0] },
      { name: "chroma", value: [0.15] },
    ],
  },
  {
    name: "prismLeak",
    uiName: "프리즘 리크 (Prism Leak)",
    category: "lightLeak",
    previewPath: "effects/presets/light-leak/prism-leak_v1.png",
    parameters: [
      { name: "strength", value: [0.52] },
      { name: "position", value: [0.538, 0.461] },
      { name: "angle", value: [34] },
      { name: "hardness", value: [0] },
      { name: "width", value: [0.7] },
      { name: "height", value: [0.2] },
      { name: "color", value: [1, 0.549, 0] },
      { name: "chroma", value: [1] },
    ],
  },
  // 19. sparkles (advanced procedural)
  {
    name: "twinkleScatter1",
    uiName: "트윙클 스캐터 1 (Twinkle Scatter 1)",
    category: "sparkles",
    previewPath: "effects/presets/sparkles/twinkle-scatter-1_v1.png",
    parameters: [
      { name: "beamHeight", value: [0.36] },
      { name: "bloomSize", value: [0.8] },
      { name: "beamWidth", value: [0.75] },
      { name: "beamCount", value: [2] },
      { name: "rayJitter", value: [1] },
      { name: "chroma", value: [0.2] },
      { name: "angle", value: [314] },
      { name: "sparkCount", value: [10] },
      { name: "sparkSpread", value: [1] },
      { name: "position", value: [0.56, 0.533] },
    ],
  },
  {
    name: "starFlare1",
    uiName: "스타 플레어 1 (Star Flare 1)",
    category: "sparkles",
    previewPath: "effects/presets/sparkles/star-flare-1_v1.png",
    parameters: [
      { name: "beamHeight", value: [0.5] },
      { name: "bloomSize", value: [0.77] },
      { name: "beamWidth", value: [0.2] },
      { name: "beamCount", value: [6] },
      { name: "rayJitter", value: [1] },
      { name: "chroma", value: [1] },
      { name: "angle", value: [90] },
      { name: "sparkCount", value: [10] },
      { name: "sparkSpread", value: [0.77] },
      { name: "position", value: [0.5, 0.5] },
    ],
  },
  // 20. tileGrid (advanced procedural)
  {
    name: "uniformGrid",
    uiName: "유니폼 그리드 (Uniform Grid)",
    category: "tileGrid",
    previewPath: "effects/presets/tile-grid/uniform-grid_v1.png",
    parameters: [
      { name: "scale", value: [0.8] },
      { name: "contentScale", value: [0.12] },
      { name: "angle", value: [0] },
      { name: "contentAngle", value: [0] },
      { name: "smooth", value: [0] },
      { name: "scaleRand", value: [0] },
      { name: "posRand", value: [0] },
      { name: "wrap", value: [1] },
      { name: "centerPosition", value: [0.5, 0.5, 0.1, 0.1] },
    ],
  },
  // 21. linearRepeater (advanced procedural)
  {
    name: "stepRepeat",
    uiName: "스텝 리피트 (Step Repeat)",
    category: "linearRepeater",
    previewPath: "effects/presets/linear-repeater/step-repeat_v1.png",
    parameters: [
      { name: "elements", value: [9] },
      { name: "isCurve", value: [0] },
      { name: "startScale", value: [0.5] },
      { name: "endScale", value: [2] },
      { name: "endOpacity", value: [0] },
      { name: "recolor", value: [0] },
      { name: "endColor", value: [1, 1, 1] },
    ],
  },
  {
    name: "arcRepeat",
    uiName: "아크 리피트 (Arc Repeat)",
    category: "linearRepeater",
    previewPath: "effects/presets/linear-repeater/arc-repeat_v1.png",
    parameters: [
      { name: "elements", value: [40] },
      { name: "isCurve", value: [1] },
      { name: "startScale", value: [0.3] },
      { name: "endScale", value: [1.7] },
      { name: "endAngle", value: [-180] },
      { name: "endOpacity", value: [0.5] },
      { name: "recolor", value: [1] },
      { name: "endColor", value: [1, 1, 1] },
    ],
  },
  // 22. radialWaves (advanced procedural)
  {
    name: "grooveRipple",
    uiName: "그루브 리플 (Groove Ripple)",
    category: "radialWaves",
    previewPath: "effects/presets/radial-waves/groove-ripple_v1.png",
    parameters: [
      { name: "scale", value: [0.15] },
      { name: "strength", value: [0.7] },
      { name: "blurBorder", value: [0.8] },
      { name: "position", value: [0.5, 0.5, 0.228] },
    ],
  },
  // 23. prism (advanced procedural)
  {
    name: "kaleidoPrism",
    uiName: "칼레이도 프리즘 (Kaleido Prism)",
    category: "prism",
    previewPath: "effects/presets/prism/kaleido-prism_v1.png",
    parameters: [
      { name: "mosaicType", value: [0] },
      { name: "size", value: [1] },
      { name: "strength", value: [0.3] },
      { name: "angle", value: [45] },
      { name: "frame", value: [0] },
      { name: "chroma", value: [0] },
      { name: "wrap", value: [2] },
    ],
  },
  {
    name: "frostedGlass",
    uiName: "프로스티드 글라스 (Frosted Glass)",
    category: "prism",
    previewPath: "effects/presets/prism/frosted-glass_v1.png",
    parameters: [
      { name: "mosaicType", value: [5] },
      { name: "size", value: [0.5] },
      { name: "strength", value: [1] },
      { name: "angle", value: [90] },
      { name: "jitter", value: [1] },
      { name: "chroma", value: [0] },
      { name: "wrap", value: [2] },
    ],
  },
  // 24. twirl
  {
    name: "sway",
    uiName: "스웨이 (Sway)",
    category: "twirl",
    previewPath: "effects/presets/twirl/sway_v1.png",
    isSuperPreset: true,
    parameters: [{ name: "strength", value: [0.1] }],
  },
  {
    name: "swirl",
    uiName: "스월 (Swirl)",
    category: "twirl",
    previewPath: "effects/presets/twirl/swirl_v1.png",
    isSuperPreset: true,
    parameters: [{ name: "strength", value: [-0.2] }],
  },
  {
    name: "spin",
    uiName: "스핀 (Spin)",
    category: "twirl",
    previewPath: "effects/presets/twirl/spin_v1.png",
    isSuperPreset: true,
    parameters: [{ name: "strength", value: [0.3] }],
  },
];
