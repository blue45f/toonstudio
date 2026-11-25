import type { ColorPairAuditInput, DualViewerPanelInput, EmotionArcPreset } from "./colorblind-harmony-engine";

export const WEBTOON_CVD_AUDIT_PAIRS: readonly ColorPairAuditInput[] = [
  { id: "hero-vs-rival-rg", labelKo: "주인공 붉은 망토 vs 라이벌 녹색 기운 (적록 충돌)", labelEn: "Hero Crimson Cloak vs Rival Green Aura", roleAKo: "주인공 망토", roleAEn: "Hero Cloak", roleBKo: "라이벌 오라", roleBEn: "Rival Aura", colorA: { r: 0.78, g: 0.25, b: 0.22 }, colorB: { r: 0.29, g: 0.52, b: 0.24 } },
  { id: "sfx-hit-vs-shield", labelKo: "타격 효과음(주홍) vs 방어막(올리브) (적록·휘도 충돌)", labelEn: "Impact SFX (Vermilion) vs Shield (Olive)", roleAKo: "타격 효과음", roleAEn: "Impact SFX", roleBKo: "방어막 광택", roleBEn: "Shield Glow", colorA: { r: 0.82, g: 0.36, b: 0.18 }, colorB: { r: 0.56, g: 0.53, b: 0.19 } },
  { id: "neon-blue-vs-teal-tritan", labelKo: "심야 청색 마법진 vs 청록 효과음 (청황 혼동)", labelEn: "Midnight Blue Sigil vs Teal SFX", roleAKo: "청색 마법진", roleAEn: "Blue Sigil", roleBKo: "청록 효과음", roleBEn: "Teal SFX", colorA: { r: 0.18, g: 0.44, b: 0.82 }, colorB: { r: 0.16, g: 0.53, b: 0.58 } },
  { id: "safe-navy-vs-amber", labelKo: "심해 감청 제복 vs 황금 각성 효과음 (전유형 안전)", labelEn: "Deep Navy Uniform vs Warm Amber SFX", roleAKo: "심해 감청", roleAEn: "Deep Navy", roleBKo: "황금 효과음", roleBEn: "Warm Amber", colorA: { r: 0.1, g: 0.2, b: 0.44 }, colorB: { r: 0.96, g: 0.77, b: 0.2 } },
];

export const EPISODE_EMOTION_ARC_PRESETS: readonly EmotionArcPreset[] = [
  { id: "noir-thriller", labelKo: "느와르 · 스릴러 추격", labelEn: "Noir Thriller Chase", summaryKo: "냉철한 청회색 기조에서 3막 진홍 보색 충돌로 긴장 극대화", summaryEn: "Cool slate intro spiking into crimson climax", baseHueDeg: 235, harmonyRule: "complementary", baseLightness: 0.56, baseChroma: 0.14, tensionCurve: [0.24, 0.58, 0.96, 0.32] },
  { id: "campus-romance", labelKo: "청춘 로맨스 · 고백 회차", labelEn: "Campus Romance Confession", summaryKo: "따뜻한 산호 기조가 3막 분할보색 노을 대비로 고조", summaryEn: "Warm coral intro blooming into sunset climax", baseHueDeg: 28, harmonyRule: "split-complementary", baseLightness: 0.66, baseChroma: 0.13, tensionCurve: [0.2, 0.52, 0.88, 0.26] },
  { id: "action-awakening", labelKo: "판타지 액션 · 각성전", labelEn: "Fantasy Action Awakening", summaryKo: "삼원색 120° 축으로 주인공·적·스킬 이펙트를 4막 내내 분리", summaryEn: "120° triadic separation across hero, foe, and FX", baseHueDeg: 255, harmonyRule: "triadic", baseLightness: 0.6, baseChroma: 0.16, tensionCurve: [0.24, 0.62, 0.98, 0.3] },
  { id: "healing-slice", labelKo: "일상 힐링 · 오후 산책", labelEn: "Healing Slice-of-Life", summaryKo: "유사색 30° 스펙트럼의 저채도 안온함과 3막 감동 포인트", summaryEn: "Gentle analogous 30° flow with warm Act 3 highlight", baseHueDeg: 145, harmonyRule: "analogous", baseLightness: 0.67, baseChroma: 0.11, tensionCurve: [0.18, 0.4, 0.72, 0.2] },
];

export const DUAL_VIEWER_PANEL_PRESETS: readonly DualViewerPanelInput[] = [
  { id: "night-noir-vanish", labelKo: "야간 골목 암부 컷 + 흑색 테두리 (다크모드 소실)", labelEn: "Night Alley Dark Cut + Black Border (Dark Vanish)", panelFill: { r: 0.08, g: 0.1, b: 0.14 }, borderColor: { r: 0.06, g: 0.07, b: 0.09 }, borderWidthPx: 2, gutterEdgeColor: { r: 0.06, g: 0.07, b: 0.09 }, outerHaloWidthPx: 0, hasTransparentOutside: true },
  { id: "white-matte-halo", labelKo: "흰 매트 미제거 암부 컷 (다크모드 흰 여백 할로)", labelEn: "Unmatted White Fringe Cut (Dark Halo Bleed)", panelFill: { r: 0.15, g: 0.18, b: 0.26 }, borderColor: { r: 0.34, g: 0.38, b: 0.46 }, borderWidthPx: 2, gutterEdgeColor: { r: 0.98, g: 0.98, b: 0.99 }, outerHaloWidthPx: 3, hasTransparentOutside: false },
  { id: "pastel-day-vanish", labelKo: "밝은 하늘 회상 컷 + 연회색 테두리 (라이트모드 소실)", labelEn: "Bright Sky Flashback + Pale Border (Light Vanish)", panelFill: { r: 0.96, g: 0.97, b: 0.99 }, borderColor: { r: 0.92, g: 0.93, b: 0.95 }, borderWidthPx: 1.5, gutterEdgeColor: { r: 0.98, g: 0.98, b: 0.99 }, outerHaloWidthPx: 0, hasTransparentOutside: true },
  { id: "dual-safe-editorial", labelKo: "양면 안전 중명도 슬레이트 경계 (다크·라이트 통과)", labelEn: "Dual-Safe Mid-Slate Frame (Dark & Light Pass)", panelFill: { r: 0.24, g: 0.31, b: 0.44 }, borderColor: { r: 0.48, g: 0.53, b: 0.62 }, borderWidthPx: 2.5, gutterEdgeColor: { r: 0.48, g: 0.53, b: 0.62 }, outerHaloWidthPx: 0, hasTransparentOutside: true },
];
