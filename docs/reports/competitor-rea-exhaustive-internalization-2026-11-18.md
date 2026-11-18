# REA MCP 경쟁 제품 전수 정밀 분석 및 39대 기능 클린룸 내재화·고도화 보고서 (2026-11-18)

- **문서 상태:** `current` (구현 및 라이브 인스펙터·패널 배선 완료 기준) / 외부 물리 평가 항목은 `legacy exception`(외부 검증 대상)으로 명시 구분
- **작성일:** `2026-11-18`
- **역공학 도구 및 엔진:** `morluto/rea` (`reverse-engineer-anything` MCP), 네이티브 정적 분석 엔진 `provider_id: "ghidra"` (`Ghidra 12.1.4`, `REA_ANALYSIS_PROVIDER=ghidra`, 상용 Hopper 미사용)
- **증거 원장(저장소 정본):** [`docs/evidence/rea-competitor-exhaustive-20261118.json`](../evidence/rea-competitor-exhaustive-20261118.json) (`44`개 REA 증거 레코드, 세션 번들 `SHA-256: 597ff40e9691dcf5e11cd0ba00965c8190c09827c1b937244b9700221b1e167e`)

---

## 1. 정적 역공학 분석 대상 아티팩트 (13종)

모든 분석은 오프라인 출하 아티팩트 정적 검사로만 수행했으며, 제3자 소스 코드·셰이더·브러시 이미지·독점 바이너리를 일절 복제하지 않고 **관측된 데이터 스키마·수식·행동 계약**만 클린룸 TypeScript로 재구현했다.

| 대상 제품 / 아티팩트 | 형식 · 아키텍처 | 주요 REA `evidence_id` 및 `SHA-256` |
| --- | --- | --- |
| **CLIP STUDIO PAINT 5.1.5** (`CLIP STUDIO PAINT.app` + `EditImageTool.todb` + `UXEditImageTool.todb` + `BrushPreset.bfps` + `MixPaletteTool.todb` + `DefaultToolModifyKey.tomd` + `presetMac_1.spws`) | Mach-O (`arm64` / universal) · SQLite 3.53.4 | 앱 번들 `ev_6907c85c...`, `EditImageTool.todb` (`507`열 · `255`노드) `ev_ddb41ced...` / `ev_b6c149c2...`, 심플 모드 `UXEditImageTool.todb` (`135`노드) `ev_cfaed54c...`, 브러시 프리셋 `ev_90b6e469...`, 혼색 팔레트 `ev_5ce895d0...`, 수식키 `ev_84e24ea6...`, 워크스페이스 `ev_85385536...` |
| **CSP 네이티브 플러그인 3종 (Ghidra 12.1.4 디컴파일)** (`Dust`, `LineWidth`, `FlowBasedAbstraction`) | Mach-O `arm64` thin slice | `Dust-arm64` (`SHA-256: 9c7835a9...`, `ev_15e228e2...`, `ev_4f970b12...`), `LineWidth-arm64` (`SHA-256: f5e31be8...`, `ev_af42bc79...`), `FlowBasedAbstraction-arm64` (`SHA-256: f77f35f6...`, `ev_53dfebbe...`) |
| **CLIP STUDIO 런처** (`CLIP STUDIO.app`) | Mach-O 번들 | `ev_7ada796c...` |
| **Storyteller Craft Suite 7종** (`PhotoCraft 0.16.0`, `VectorCraft 0.17.0`, `EffectCraft 0.17.0`, `DesignCraft 0.13.0`, `FigCraft 0.11.2`, `CADCraft 0.13.0`, `LightCraft 0.14.0`) | macOS 번들 / 웹·WASM 자산 | `PhotoCraft` (`SHA-256: 6c2e17b4...`, `ev_0c6a677d...`), `VectorCraft` `ev_9e97a121...`, `EffectCraft` `ev_c10045d5...`, `DesignCraft` `ev_4571415a...` 외 |
| **NAVER WEBTOON / Studio HORANG SHAPER 1.05** (`ShaperLauncher.app`, `Assembly-CSharp.dll`) | PE CIL (`rea-dotnet-static`) | `Assembly-CSharp.dll` (`SHA-256: cfb9e2ad...`, `ev_05522015...`) |
| **Blender 5.2.0 / Goodnotes 7.1.28 / Muse 9.0** | macOS 앱 번들 | `Goodnotes.app` (`SHA-256: 272e6201...`, `ev_222d6b58...`) 외 |

---

## 2. 인식론적 분리 (Observed Facts · Inferences · Unknowns)

### 2.1 관측된 사실 (Observed Facts)
1. **CSP 브러시·보조도구 파라미터 구조 (`EditImageTool.todb`):** `NodeInitVariant` 테이블이 `507`개 컬럼과 `255`개 보조도구 노드로 구성되며, 시작/끝 호길이·백분율·속도 테이퍼(`BrushInOut*`), 꺾임 모서리 첨예화(`CorrectSharpCorner`), 체류 분사(`AirBrushTimer`), 평행·방사 자 스냅(`StrokeRuledLine`), 리본·연속 스탬프 패턴(`BrushPattern*`), 지우개 참조·벡터 교차점 소거(`EraseTargetLayer` / `EraseVectorCross`), 색상 지터·스트로크 그라데이션(`ChangeStrokeColor*`) 파라미터를 독립 직교 축으로 저장한다.
2. **CSP 먼지 제거 알고리즘 (`PIDust::FillSmallArea`, Ghidra 디컴파일):** 연결 성분의 총 픽셀 면적이 아니라 **바운딩 박스의 가로와 세로가 모두 임계치 이하(`bboxWidth <= dustSize && bboxHeight <= dustSize`)** 인 성분만 먼지로 판정하며, 블록 외곽 `dustSize + 1` 패딩 경계에 닿은 성분은 잘린 선화로 간주해 보호한다. 모드 2(`SearchAroundDustColor`)는 1픽셀 외곽 둘레 픽셀의 최빈 색상을 히스토그램으로 구해 메운다.
3. **CSP 선폭 수정 알고리즘 (`PILineWidth`, Ghidra 디컴파일):** `FatRaster`는 거리 반경 내 가장 가까운 불투명 픽셀의 원본 RGB(`SearchNearestColorPixel`)를 전파해 색 번짐 없이 선을 굵게 만들고, `ThinRemainCoreLine` + `JudgeCorePixel`은 `1픽셀 남기기` 활성화 시 8-이웃 연결수를 검사해 단절 없는 중심 골격선을 남긴다.
4. **수식키 및 노출표 구조:** `DefaultToolModifyKey.tomd` SQLite DB가 도구 문맥별 `Shift` / `Alt` / `Cmd` / `Space` 임시 도구 전환(`스포이드`, `손바닥`, `브러시 크기 드래그`)을 테이블로 매핑하며, 애니메이션 셀 노출표는 CELSYS 공개 `XDTS` JSON 헤더(`exchangeDigitalTimeSheet Save Data`) 규격을 따른다.

### 2.2 공학적 추론 및 클린룸 재설계 (Inferences)
1. **등고선 채우기(`Contour Fill`) 및 자유형 그라데이션:** 다중 색상 경계선 사이의 매끄러운 그라데이션 채색은 정확 $O(W \times H)$ 2차원 유클리드 거리 변환(`Felzenszwalb & Huttenlocher`) 비율 $d_A / (d_A + d_B)$ 및 조화 라플라스/역거리 가중 보간으로 브라우저 Worker/Canvas에서 결정적으로 재현할 수 있다.
2. **색감 전이(`Color Transfer`) 경량화:** 클라우드 신경망 없이도 `sRGB -> Oklab` 평균·표준편차 정합과 `17×17×17` 삼선형 3D LUT 보간으로 참조 무드 색감 전이와 5-스톱 그라데이션 맵 추출을 즉시 수행할 수 있다.
3. **통계적 스크래핑 억제 보조 필터:** 대역제한 블루노이즈(토러스 DoG)와 `3×3 Sobel` 에지 마스킹을 결합하면 흰색 말풍선 내부·원고 여백(`luma >= 245`)을 오염시키지 않으면서 결정적 시드 기반 미세 섭동을 생성할 수 있다(절대적 AI 학습 차단이 아닌 보조 억제 수단임을 UI에 명시 고지).

### 2.3 미확인 및 범위 밖 경계 (Unknowns & Legacy Exceptions)
1. **비공개 클라우드 가중치 및 `.clip` 내부 암호화 페이지 스트림 (`unknown`):** 원격 인증 뒤에만 제공되는 서버 모델 가중치와 비공개 `.clip` 독점 컨테이너 스트림은 정적 클린룸 분석 대상에서 제외하고 표준 PSD / ORA / CBZ / EPUB 3.0 / PDF 1.7 / XDTS 상호운용 경로를 정본으로 유지한다.
2. **실물 태블릿 블라인드 필감 평가 (`legacy exception` — 외부 검증 영역):** `docs/benchmarks/studio-competitor-replacement-program.json`의 `PR-057` 물리 스타일러스 평가자 세션은 브라우저 코드 구현으로 대체할 수 없는 외부 오프라인 검증 항목으로 분리 유지한다.

---

## 3. 전수 내재화 및 고도화 완료 목록 (7대 웨이브 · 39대 핵심 역량 + 실런타임 픽셀·워커·핫패스 직결 완료)

모든 신규 파일은 아키텍처 래칫(`creatorRootFiles: 2499/2499`, 개별 신규 파일 `<= 800`줄)을 준수해 `apps/web/src/domains/creator/` 하위 도메인 디렉터리에 배치되었으며, 엔트리 라우트(`apps/web/src/app/main.tsx`) 정적·동적(`lazy`/`import()`) 도달 그래프 기준 미연결 고아 모듈 수 `0`개를 검증했다.

### Wave 1 — 브러시 · 지우개 · 혼색 · 고아 패널 복원
- 시작/끝 테이퍼(길이·백분율·속도 연동): `brush/studio-brush-inout-taper.ts`
- 급격한 방향 전환 모서리 첨예화: `brush/studio-stroke-corner-sharpen.ts`
- 정지 체류 에어브러시 누적 분사: `brush/studio-brush-dwell-emitter.ts`
- Shift 직선 연결 및 평행·방사 자 구속: `brush/studio-stroke-ruled-line.ts`
- 다중 스탬프 순환(랜덤·순차·압력·방향) 및 아크길이 패턴 리본: `brush/studio-pattern-brush.ts`
- 스트로크별·스탬프별 HSV/Oklch 색 지터 및 전경↔배경 혼합: `brush/studio-brush-stroke-color-dynamics.ts`
- 지우개 벡터 교차점 구간 절단(`eraseVectorStrokeUpToIntersection`)·전 레이어/참조 지우개 플랜: `brush/studio-eraser-advanced-plan.ts`, `brush/StudioEraserAdvancedSection.tsx`, `StudioEraserQuickPicker.tsx`
- 브러시 플래너 핫패스(`planStudioDynamicBrush`) 6단계 실시간 연동: `brush/studio-brush-dynamics-plan.ts` (`sharpenStrokeCornerSamples` -> `transformStrokeWithRuledLine` -> `applyStudioBrushInOutTaperToDabs` -> `advanceStudioBrushDwellEmitter` -> `planStudioPatternStamps`/`RibbonQuads` -> `evaluateStudioStrokeAndSubColorRgb`)
- 하단·참조 레이어 샘플링 스머지·블렌더: `brush/studio-blend-refer-layer.ts`, `StudioSmudgePanel.tsx`
- 브러시 인스펙터 통합 제어 및 기존 미배선 패널 복원: `brush/StudioBrushAdvancedCspSection.tsx` (`StudioBrushDynamicsControls.tsx`), `ScreentoneLayerPanel` (`StudioTonePanel.tsx`), `StudioLayerEffectsStackPanel` (`StudioInspectorAsideShell.tsx`)

### Wave 2 — 벡터 수술 · 빈틈 채우기 · 축소 선택 · 등고선 그라데이션 · 도형 자 · 베지어 펜
- `DrawEl` 벡터선 집기·연결·재묘사·선폭 수정(1px 보존)·분할·모서리 전환: `vector/studio-drawel-vector-correction.ts`, `studio-node-edit.ts`
- 벡터 끝점 자석 스냅(균일 공간 해시 + Hermite 감쇠): `vector/studio-vector-magnet-snap.ts`, `StudioLineCorrectionControls.tsx`
- 미채색 미세 틈 올가미 채우기(선화 안티에일리어싱 헤일로 침투): `fill/studio-fill-leftover.ts`, `studio-advanced-fill-worker-postprocess.ts`
- 참조 선화 정지 채우기 확장·축소 및 다중 참조 배제 마스크: `fill/studio-advanced-fill-expansion.ts`, `studio-advanced-fill-settings.ts`
- 축소 선택(바깥 올가미 내향 범람) 및 참조 선 틈 닫기 자동 선택: `selection/studio-shrink-selection.ts`, `studio-magic-wand.ts`, `StudioMagicWandPanel.tsx`
- 디더링 래스터·지우개·만화 망점 그라데이션 및 자유형/등고선 채우기(`EDT`): `gradient/studio-raster-gradient.ts`, `gradient/studio-freeform-contour-fill.ts`, `gradient/StudioRasterFreeformGradientSection.tsx` (`StudioGradientEnginePanel.tsx`)
- 타원·다각형·구불선 도형 자 및 다중 평행·격자 자: `ruler/studio-figure-ellipse-ruler.ts`, `StudioAdvancedRulerPanel.tsx`
- 3차 베지어·꺾은선·연속 곡선 상태 머신 펜: `drawing/studio-bezier-pen.ts`, `studio-node-edit.ts`

### Wave 3 — 집중선·섬광 · 폴리곤 칸 · 말풍선 펜 · 텍스트 박스 · 톤 위상 · 1비트 인쇄 · EPUB 3.0
- 고밀도 집중선·유선 군집·난수 틈·리본 곡선 플래너 v2: `render/studio-effect-line-planner-v2.ts` (`StudioInspectorFocusSpeedFrameControls.tsx`)
- 2단 성운 섬광(`성게` / `집중 성게` / `이중 성게`): `render/studio-flash-geometry.ts` (`StudioInspectorFocusSpeedFrameControls.tsx`)
- 다각형 칸 생성·거터 폭 변경·인접 칸 결합: `comic/studio-frame-polygon-author.ts` (`StudioInspectorFocusSpeedFrameControls.tsx`)
- 자유 말풍선 펜·다중 꼬리·말풍선 불리언 합집합: `lettering/studio-balloon-pen-and-tails.ts` (`lettering/StudioBubbleShapePanel.tsx`)
- 텍스트 배경 박스·테두리·원형 경로 글자 배치: `lettering/studio-text-box-style.ts` (`StudioInspectorTypographySection.tsx`)
- 회차 전체 스토리 에디터 런처 배선: `lettering/StudioStoryEditorLauncherBar.tsx` (`StudioDialogueBatchPanel.tsx`)
- 스크린톤 무늬 위상 이동 및 모아레 QA 오버레이: `comic/studio-tone-workflow.ts` (`StudioTonePanel.tsx`)
- 1비트 모노크롬 망점 인쇄·중철 밀림 보정(`Creep`)·우철(`RTL`) 조판·고정 레이아웃 EPUB 3.0 내보내기: `export/studio-print-monochrome.ts`, `export/studio-imposition-creep.ts`, `export/studio-epub-fixed-layout.ts`, `export/StudioEpubAndPrintAdvancedSection.tsx`, `export/StudioExportEpubAndShieldHost.tsx` (`export/StudioExportMenuPanel.tsx`)

### Wave 4 — 레이어 표현색 · 템플릿 · 원근·메쉬 변형 · 먼지·선화 정리 · 색감 전이 · 웹툰 세로 간격 편집
- 레이어 표현색(`컬러` / `그레이` / `모노크롬` 알파·흑백 문턱값): `layer/studio-layer-expression-color.ts` (`layer/StudioLayerNavigatorItemRow.tsx`)
- 경량 레이어 구조 템플릿 등록·인스턴스화 및 벡터 SVG 직렬화: `layer/studio-layer-template.ts` (`layer/StudioLayerCompsPanel.tsx`)
- 사다리꼴·등변사다리꼴·자유 원근 호모그래피 및 `N×M` 쌍삼차 메쉬 변형: `transform/studio-corner-pin-transform.ts`, `transform/studio-raster-mesh-transform.ts`, `transform/StudioAdvancedRasterTransformSection.tsx` (`StudioInspectorImageToolsSection.tsx`)
- 먼지 제거(`PIDust` 4모드)·휘도→투명도·선 색 변경·선폭 수정(`1px` 골격 보존)·입체 팽창·Oklab 3D LUT 색감 전이: `filter/studio-dust-removal.ts`, `filter/studio-line-art-cleanup.ts`, `filter/studio-inflate-filter.ts`, `color/studio-lab-color-transfer-lut.ts`, `filter/StudioLineCleanupAndDustSection.tsx` (`StudioImageAdjustmentsPanel.tsx`)
- 웹툰 세로 스크롤 여백 삽입·삭제(`Shift Drawing Area`): `page/studio-shift-drawing.ts`, `page/StudioShiftDrawingSection.tsx` (`StudioInspectorCanvasControls.tsx`)

### Wave 5 — XDTS · 라이트 테이블 · 함수 곡선 · 2D 카메라 · 애니메이션 WebP · 수식키 · 3D 손 포즈 · 스크래핑 억제
- CELSYS 호환 `XDTS` 디지털 타임시트 입출력 및 트랙 셀 일괄 지정·정규화: `animation/studio-xdts-timesheet.ts`
- 애니메이션 라이트 테이블(셀별 참조 변환·틴트·어니언스킨 일괄 등록): `animation/studio-light-table.ts`
- 키프레임 3차 에르미트 함수 곡선(`Function Curve`) 및 2D 카메라 폴더 궤적(`Locus`): `animation/studio-function-curve.ts`, `animation/studio-anim-camera-2d.ts`
- 무외부의존 순수 RIFF `ANIM`/`ANMF` 애니메이션 WebP 먹서 및 동영상→셀 임포트 플래너: `animation/studio-webp-anim-muxer.ts`, `animation/studio-movie-import.ts`, `animation/StudioAnimProToolsDrawer.tsx` (`StudioAnimTimelinePanel.tsx`, `StudioFrameAnimationPanel.tsx`)
- 보조키(`Shift`/`Alt`/`Cmd`/`Space`) 임시 도구 오버라이드 상태 머신 및 단축키 허브 연결: `workspace-layout/studio-modifier-key-map.ts`, `workspace-layout/useStudioModifierKeyController.ts`, `workspace-layout/StudioModifierKeySettingsSection.tsx`, `workspace-layout/ShortcutCustomizer.tsx` (`StudioHelpHubDialog.tsx`)
- 3D 마네킹 손가락 관절 프리셋·개별 컬 슬라이더 실시간 본(Bone) 직결: `scene-3d/StudioMannequinPoserPoseSection.tsx`, `scene-3d/StudioMannequinPoserPanel.tsx`, `scene-3d/StudioMannequinPoserHandPose.test.tsx`
- 에지 마스킹 블루노이즈 스크래핑 억제 보조 필터(`canvasToBlob` 전역 이미지·PDF·EPUB 비파괴 적용 및 한계 고지): `export/studio-export-perturbation-shield.ts`, `export/studio-export.ts`, `export/StudioExportEpubAndShieldHost.tsx`

---

## 4. 재현 가능한 검증 명령

저장소 루트에서 아래 명령을 순서대로 실행해 구조·타입·린트·단위 테스트·경쟁사 역량 계약을 검증한다(부작용 없음, 읽기 전용 검증):

```bash
pnpm run validate:architecture
pnpm run verify:studio-competitor-capabilities
pnpm run verify:studio-competitor-replacement:program
pnpm run typecheck:web
pnpm run harness:verify
```
