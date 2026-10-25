/**
 * StudioBlankComicProDrawingSubPanel.tsx
 *
 * 전문 드로잉/편집 프로그램 및 만화 레이아웃 빌더 4대 플랫폼 통합 서브 패널:
 * - BlankComic (30종 템플릿 · 12종 패널 도형 · 6종 말풍선 · 인쇄 재단/여백 가이드 · .blank 코덱)
 * - 클립스튜디오 페인트 v5.1.5 (15대 네이티브 포맷 · 스마트폰 표시 영역 프리뷰 · 세로 웹툰 자동 분할 · 망점 스크린톤)
 * - 메디방 페인트 & 팔레타 (클라우드 공동 작업 페이지 잠금 · 멀티터치 제스처 바인딩)
 * - 캔바 만화 메이커 (4컷 만화·인스타툰 스트립 & 한글 타이포그래피 페어링)
 */
import { useMemo, useState, type ReactElement } from "react";

import { studioSegmentChipClass } from "../studio-panel-ui";

import {
  BLANKCOMIC_12_PANEL_SHAPES,
  BLANKCOMIC_30_PANEL_TEMPLATES,
  BLANKCOMIC_6_BUBBLE_TYPES,
  BLANKCOMIC_PAGE_PRESETS,
  buildBlankComicPanelShapeSvgPath,
  calculateBlankComicPrintGuides,
  calculateCspWebtoonSmartphoneViewportAndSlices,
  CANVA_COMIC_STRIP_TEMPLATES,
  convertLayerToHalftoneScreentone,
  CSP_V5_NATIVE_DOCUMENT_FORMATS,
  evaluateMediBangCloudTeamPageLock,
  MEDIBANG_PALETTA_GESTURE_SHORTCUTS,
  serializeBlankComicProject,
  type BlankComicBubbleTypeId,
  type BlankComicPagePresetId,
  type BlankComicPanelShapeId,
  type CspScreentoneDotShape,
} from "./blankcomic-canva-medibang-suite";

type ProSuiteMode = "blankcomic" | "csp-v5" | "medibang-paletta" | "canva-strip";

export function StudioBlankComicProDrawingSubPanel(): ReactElement {
  const [mode, setMode] = useState<ProSuiteMode>("blankcomic");

  // 1. BlankComic state
  const [pagePresetId, setPagePresetId] = useState<BlankComicPagePresetId>("a4");
  const [shapeId, setShapeId] = useState<BlankComicPanelShapeId>("slanted-left");
  const [bubbleTypeId, setBubbleTypeId] = useState<BlankComicBubbleTypeId>("speech");
  const [templateNumber, setTemplateNumber] = useState<number>(4);

  // 2. Clip Studio Paint v5.1.5 state
  const [webtoonHeightPx, setWebtoonHeightPx] = useState<number>(6400);
  const [screentoneLpi, setScreentoneLpi] = useState<number>(60);
  const [screentoneDotShape, setScreentoneDotShape] =
    useState<CspScreentoneDotShape>("circle");

  // 3. MediBang state
  const [lockedByPartner, setLockedByPartner] = useState<boolean>(false);

  // 4. Canva state
  const [canvaTemplateId, setCanvaTemplateId] = useState<string>(
    CANVA_COMIC_STRIP_TEMPLATES[0]!.id,
  );

  const printGuides = useMemo(
    () => calculateBlankComicPrintGuides(pagePresetId),
    [pagePresetId],
  );

  const activeTemplate = useMemo(
    () =>
      BLANKCOMIC_30_PANEL_TEMPLATES.find((t) => t.templateNumber === templateNumber) ??
      BLANKCOMIC_30_PANEL_TEMPLATES[0]!,
    [templateNumber],
  );

  const shapeSvgPath = useMemo(
    () => buildBlankComicPanelShapeSvgPath(shapeId, { x: 10, y: 10, w: 140, h: 90 }),
    [shapeId],
  );

  const blankProjectJson = useMemo(
    () =>
      serializeBlankComicProject({
        format: "blankcomic-project",
        extension: ".blank",
        version: "1.0.0",
        pagePresetId,
        templateId: activeTemplate.id,
        panels: [{ id: "p-1", shape: shapeId, rect: { x: 10, y: 10, w: 140, h: 90 } }],
        bubbles: [{ id: "b-1", type: bubbleTypeId, text: "BlankComic .blank 호환 대사" }],
      }),
    [pagePresetId, activeTemplate.id, shapeId, bubbleTypeId],
  );

  const cspSlicePlan = useMemo(
    () =>
      calculateCspWebtoonSmartphoneViewportAndSlices({
        canvasWidthPx: 800,
        canvasHeightPx: webtoonHeightPx,
        smartphoneAspectRatio: "9:19.5",
        sliceMaxHeightPx: 1280,
      }),
    [webtoonHeightPx],
  );

  const screentoneSpec = useMemo(
    () =>
      convertLayerToHalftoneScreentone({
        lpi: screentoneLpi,
        densityPercent: 35,
        angleDeg: 45,
        dotShape: screentoneDotShape,
      }),
    [screentoneLpi, screentoneDotShape],
  );

  const medibangLockState = useMemo(
    () =>
      evaluateMediBangCloudTeamPageLock({
        pageNumber: 3,
        currentUserId: "artist-main",
        lockedByUserId: lockedByPartner ? "assistant-ink" : null,
        localRevision: 5,
        cloudRevision: 5,
      }),
    [lockedByPartner],
  );

  const activeCanvaTemplate = useMemo(
    () =>
      CANVA_COMIC_STRIP_TEMPLATES.find((t) => t.id === canvaTemplateId) ??
      CANVA_COMIC_STRIP_TEMPLATES[0]!,
    [canvaTemplateId],
  );

  return (
    <div
      data-testid="blankcomic-pro-drawing-subpanel"
      className="mt-4 rounded-lg border border-line bg-card p-3 text-xs text-fg"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1 border-b border-line pb-2">
        <span className="font-bold text-fg">
          전문 만화·드로잉 플랫폼 호환 엔진 (BlankComic · 클립스튜디오 v5.1.5 · 메디방 · 캔바)
        </span>
        <span className="font-mono text-[0.6rem] text-accent">REA Verified</span>
      </div>

      <div className="mb-2.5 flex flex-wrap gap-1">
        {(
          [
            { id: "blankcomic", label: "BlankComic (30템플릿·12도형·인쇄가이드)" },
            { id: "csp-v5", label: "클립스튜디오 v5.1.5 (.clip/스마트폰뷰/망점톤)" },
            { id: "medibang-paletta", label: "메디방 & 팔레타 (클라우드 협업/제스처)" },
            { id: "canva-strip", label: "캔바 만화 메이커 (4컷 템플릿/폰트)" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`pro-drawing-tab-${item.id}`}
            className={studioSegmentChipClass(mode === item.id)}
            onClick={() => setMode(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {mode === "blankcomic" ? (
        <div data-testid="blankcomic-section" className="space-y-2 text-[0.66rem]">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-0.5">
              <span className="font-semibold text-fg-2">페이지·인쇄 규격 (6종)</span>
              <select
                aria-label="BlankComic 페이지 규격"
                value={pagePresetId}
                onChange={(e) => setPagePresetId(e.target.value as BlankComicPagePresetId)}
                className="rounded border border-line bg-raised px-1.5 py-1 text-fg"
              >
                {BLANKCOMIC_PAGE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({p.widthPx}×{p.heightPx}px)
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="font-semibold text-fg-2">12종 패널 도형</span>
              <select
                aria-label="BlankComic 패널 도형"
                value={shapeId}
                onChange={(e) => setShapeId(e.target.value as BlankComicPanelShapeId)}
                className="rounded border border-line bg-raised px-1.5 py-1 text-fg"
              >
                {BLANKCOMIC_12_PANEL_SHAPES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.category})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="font-semibold text-fg-2">30종 템플릿 & 6종 말풍선</span>
              <div className="flex gap-1">
                <select
                  aria-label="BlankComic 템플릿 번호"
                  value={templateNumber}
                  onChange={(e) => setTemplateNumber(Number(e.target.value))}
                  className="w-1/2 rounded border border-line bg-raised px-1 py-1 text-fg"
                >
                  {BLANKCOMIC_30_PANEL_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.templateNumber}>
                      #{t.templateNumber} ({t.panelCount}컷)
                    </option>
                  ))}
                </select>
                <select
                  aria-label="BlankComic 말풍선 종류"
                  value={bubbleTypeId}
                  onChange={(e) => setBubbleTypeId(e.target.value as BlankComicBubbleTypeId)}
                  className="w-1/2 rounded border border-line bg-raised px-1 py-1 text-fg"
                >
                  {BLANKCOMIC_6_BUBBLE_TYPES.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-raised/40 p-2">
            <div>
              <div className="font-bold text-fg">
                재단선(Trim): {printGuides.trimLineRect.w}×{printGuides.trimLineRect.h}px · 안전 영역(Safe):{" "}
                {printGuides.safeAreaRect.w}×{printGuides.safeAreaRect.h}px
              </div>
              <div className="font-mono text-[0.58rem] text-fg-3">
                내보내기 지원: PNG · JPG · PDF · SVG · .blank ({blankProjectJson.length} bytes)
              </div>
            </div>
            <svg
              width={160}
              height={110}
              viewBox="0 0 160 110"
              aria-label="BlankComic 도형 프리뷰"
              className="rounded border border-line bg-canvas"
            >
              <path
                d={shapeSvgPath}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              />
            </svg>
          </div>
        </div>
      ) : null}

      {mode === "csp-v5" ? (
        <div data-testid="csp-v5-section" className="space-y-2 text-[0.66rem]">
          <div className="flex flex-wrap gap-1">
            {CSP_V5_NATIVE_DOCUMENT_FORMATS.map((fmt) => (
              <span
                key={fmt.extension}
                title={`${fmt.roleName}: ${fmt.description}`}
                className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[0.6rem] text-fg-2"
              >
                {fmt.extension}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded border border-line bg-raised/40 p-2">
              <div className="font-bold text-fg">
                스마트폰 표시 영역({cspSlicePlan.smartphoneAspectRatio}) & 세로 웹툰 분할 내보내기
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span>캔버스 세로(px):</span>
                <input
                  type="number"
                  aria-label="웹툰 캔버스 세로 길이"
                  min={1280}
                  max={25600}
                  step={640}
                  value={webtoonHeightPx}
                  onChange={(e) => setWebtoonHeightPx(Number(e.target.value) || 6400)}
                  className="w-20 rounded border border-line bg-card px-1.5 py-0.5 font-mono text-fg"
                />
                <span className="font-mono text-accent">
                  스마트폰 {cspSlicePlan.smartphoneScreenCount}화면 · {cspSlicePlan.slices.length}조각 슬라이스
                </span>
              </div>
            </div>
            <div className="rounded border border-line bg-raised/40 p-2">
              <div className="font-bold text-fg">레이어 망점 스크린톤(Halftone) 변환기</div>
              <div className="mt-1 flex items-center gap-2">
                <select
                  aria-label="스크린톤 선 수 LPI"
                  value={screentoneLpi}
                  onChange={(e) => setScreentoneLpi(Number(e.target.value))}
                  className="rounded border border-line bg-card px-1.5 py-0.5 text-fg"
                >
                  <option value={45}>45 LPI (굵은 망점)</option>
                  <option value={60}>60 LPI (표준 출판)</option>
                  <option value={75}>75 LPI (고밀도)</option>
                </select>
                <select
                  aria-label="스크린톤 도트 형상"
                  value={screentoneDotShape}
                  onChange={(e) => setScreentoneDotShape(e.target.value as CspScreentoneDotShape)}
                  className="rounded border border-line bg-card px-1.5 py-0.5 text-fg"
                >
                  <option value="circle">원형 망점 (Circle)</option>
                  <option value="line">선형 톤 (Line)</option>
                  <option value="cross">십자 톤 (Cross)</option>
                  <option value="noise">사목 노이즈 (Noise)</option>
                </select>
                <span className="font-mono text-accent">
                  피치 {screentoneSpec.dotPitchPxAt300Dpi}px · 반경 {screentoneSpec.dotRadiusPxAt300Dpi}px
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {mode === "medibang-paletta" ? (
        <div data-testid="medibang-paletta-section" className="space-y-2 text-[0.66rem]">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-raised/40 p-2">
            <div>
              <div className="font-bold text-fg">메디방 클라우드 팀 프로젝트 페이지 잠금 상태</div>
              <div className="text-fg-2">{medibangLockState.statusMessage}</div>
            </div>
            <button
              type="button"
              onClick={() => setLockedByPartner((prev) => !prev)}
              className={studioSegmentChipClass(lockedByPartner)}
            >
              {lockedByPartner ? "팀원 잠금 시뮬레이션 해제" : "팀원 잠금 시뮬레이션"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {MEDIBANG_PALETTA_GESTURE_SHORTCUTS.map((g) => (
              <div key={g.id} className="rounded border border-line bg-raised/30 p-1.5">
                <div className="font-bold text-accent">{g.gesture}</div>
                <div className="text-fg-2">{g.actionLabel}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {mode === "canva-strip" ? (
        <div data-testid="canva-strip-section" className="space-y-2 text-[0.66rem]">
          <div className="flex flex-wrap gap-1">
            {CANVA_COMIC_STRIP_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setCanvaTemplateId(tpl.id)}
                className={studioSegmentChipClass(canvaTemplateId === tpl.id)}
              >
                {tpl.title} ({tpl.canvasSizePx[0]}×{tpl.canvasSizePx[1]})
              </button>
            ))}
          </div>
          <div className="rounded border border-line bg-raised/40 p-2">
            <div className="font-bold text-fg">
              타이포그래피 페어링: 제목 [{activeCanvaTemplate.recommendedTitleFont}] + 대사 [
              {activeCanvaTemplate.recommendedDialogueFont}]
            </div>
            <div className="text-fg-3">
              추천 그래픽 요소: {activeCanvaTemplate.stickerPackTheme}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
