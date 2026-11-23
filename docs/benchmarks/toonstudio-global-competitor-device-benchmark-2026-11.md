# 글로벌 경쟁사 및 멀티디바이스 드로잉 UX 벤치마크 보고서 (2026-11)

- **문서 상태**: `current` (2026-11-23 저장소 실측·공개 공식 문서·클린룸 REA 증거 기반 비교 분석)
- **출처 기준일**: `2026-11-23`
- **비교 범위**: 핵심 창작 도구 6종(**Clip Studio Paint · Procreate · Adobe Photoshop · Rebelle 7 · Blender · ibisPaint**) + 웹툰 제작 생태계 보완 2종(**Creco · ACON3D**) + **웨어러블 · 스마트TV · 듀얼스크린 · 왼손 컨트롤러 · 공간 XR 드로잉 UX 사례**
- **정직성 및 검증 원칙**:
  1. 임의 FPS 배수, 미검증 사용자 설문 비율, 변동성이 큰 타사 환율 원화 추정가는 기재하지 않는다. 타사 요금은 **공식 과금 구조**만 적는다.
  2. ToonStudio의 모든 구현 주장은 저장소 실제 코드·테스트·감사 문서를 근거로 연결하며, `current`(현재 구현) · `partial`(전환·검증 중) · `target`(향후 로드맵)을 엄격히 구분한다.
  3. 경쟁 도구의 본원적 강점(`native-strength`)을 축소하지 않고, ToonStudio가 최선이 아닌 시나리오도 그대로 밝힌다.

---

## 1. 한눈에 보는 7대 창작 도구 + 웹툰 생태계 종합 비교 매트릭스

> 공개 웹 비교 페이지(`/about/compare`, [`competitor-comparison-profiles.ts`](../../apps/web/src/domains/marketing/competitor-comparison-profiles.ts))의 7종 대조 체계에 **ibisPaint**와 **Rebelle 7** 심층 항목, 그리고 **멀티디바이스·하드웨어 I/O 축**을 확장 통합한 기준표다.

| 비교 항목 | **ToonStudio** (`2026-11-23`) | **Clip Studio Paint** | **Procreate** | **Adobe Photoshop** | **Rebelle 7** | **Blender** | **ibisPaint (X / Pro)** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **핵심 포지션** | 브라우저 네이티브 웹툰 제작 OS | 만화·웹툰 프로 드로잉 표준 | iPad 터치·제스처 일러스트 표준 | 래스터 합성·색보정·출판 표준 | 물리 수채·유화·안료 시뮬레이션 특화 | 오픈소스 풀 3D DCC · 렌더러 | 모바일·초경량 웹툰/일러스트 대중 앱 |
| **실행 플랫폼** | 데스크톱·태블릿·모바일 웹 (**설치 0초**) | Windows · macOS · iPad · Android | iPadOS 전용 | Windows · macOS · iPad · Web(일부) | Windows · macOS | Windows · macOS · Linux | iOS · Android · Windows |
| **공식 과금 구조** | 베타 전 기능 **₩0** (결제 비활성 · 정식 플랜 추후 고지) | 월·연 구독 또는 PC 일시불 영구 라이선스(PRO/EX) | iPad 앱 1회 구매 (구독 없음) | Creative Cloud 월·연 정기 구독 | 데스크톱 영구 라이선스(Standard/Pro · 메이저 업그레이드 별도) | 오픈소스 무료(GPL-2.0+ · 상용 출력 무료) | 기본 무료(광고) + Prime 멤버십 구독 / 유료 Pro |
| **분광 감산 안료 혼색** | `current` 클린룸 7밴드 KM WebGPU + CPU 폴백 (`mixbox` 0건) | `native-strength` 지각적 색혼합(v2.0+) | `limited` sRGB/P3 일반 블렌딩 | `limited` 믹서 브러시(RGB, 분광은 플러그인) | `native-strength` Pigments + 3D 유체·종이 물리 최상위 | `none` 3D 텍스처 페인트 중심 | `limited` 표준 RGB 블렌딩 중심 |
| **GPU 엔진 · 필기 성숙도** | `partial` WebGPU 타일/예측 모듈 완료 · Canvas2D 커밋 권위 유지 | `native-strength` 10년+ 네이티브 C++ 필압·드라이버 안정 | `native-strength` Metal Valkyrie 120Hz Apple Pencil 최적화 | `native-strength` 16/32-bit GPU 합성 · 초대용량 PSB | `native-strength` NanoPixel 유체 GPU 연산(고사양 요구) | `limited` Vulkan/Metal/CUDA 3D 뷰포트 특화 | `native-strength` 모바일 저사양 OpenGL/Metal 경량 최적화 |
| **3D 배경 · VRM · 로컬 임포트** | `current` GLB/VRM 최대 **1 GiB** · `.skp` **256 MiB** 로컬 임포트 + 3D→2D 조명 동기화 | `native-strength` 3D 데생 인형 · EX LT 변환 | `limited` 기본 3D 오브젝트 페인팅 | `limited` 3D 기능 축소(Substance 계열 분리) | `none` 2D 회화 전용 | `native-strength` 풀 모델링·스컬프팅·리깅·Cycles/EEVEE | `limited` 제한적 3D 참조 모델 |
| **웹툰 식자 · 세로쓰기 · 슬라이스** | `current` 타원 현 **Knuth-Plass 2D DP** · 세로쓰기/PAVA 루비 · **4대 플랫폼 안전 슬라이스** | `native-strength` 만화 식자·세로쓰기·루비·분할 내보내기 표준 | `none` 기본 텍스트 박스(분할 내보내기 없음) | `limited` CJK 타이포 강력(말풍선 타원·안전 슬라이스 수작업) | `none` 식자 미제공 | `none` 웹툰 식자 영역 외 | `limited` 말풍선·프레임 분할 지원(출판급 DP/안전 슬라이스 미제공) |
| **Rights BOM 저작권 출고 차단** | `current` 6대 자산 **Fail-Closed** 자동 차단 + 출처 고지 ZIP | `none` 수동 확인 | `none` 수동 확인 | `limited` C2PA 메타 서명(웹툰 3D/폰트 BOM 차단 별도) | `none` 수동 확인 | `none` 외부 관리 | `none` 수동 확인 |
| **협업 · 분업 OS · 오프라인 내구성** | `current` 레이어 RBAC·컷 리스·5주 일정·정산 + **OPFS SQLite** + Yjs CRDT | `limited` EX 팀워크 페이지 체크아웃(공정 일정·정산 없음) | `none` 개인 작업 전용 | `limited` 클라우드 링크 코멘트(웹툰 분업 없음) | `none` 개인 작업 전용 | `limited` USD/파일 링크(외부 PM 도구 필요) | `limited` 클라우드 동기화(팀 분업 OS 없음) |
| **하드웨어 I/O (왼손 리모컨 등)** | `current` **Chrome WebHID 직결**(TourBox·Wacom EKR·Xencelabs) + Stream Deck 로컬 브리지 | `native-strength` OS 네이티브 드라이버·Tabmate 전용 지원 | `limited` Apple Pencil 제스처·일부 키보드 단축키 | `native-strength` OS 드라이버·매크로 플러그인 성숙 | `native-strength` 타블렛 기울기·회전·펜 압력 정밀 대응 | `native-strength` 3D 마우스(SpaceMouse)·단축키 전방위 | `limited` 터치 제스처·기본 스타일러스 중심 |
| **ToonStudio 파일 호환** | 정본 OPFS SQLite + PSD/GLB/VRM/SKP/Remotion ZIP | PSD·ABR 가져오기 · PNG/PSD 왕복 | PSD/PNG 출력 후 식자·납품 연계 | `ag-psd` PSD 왕복 후보정 | 고해상도 PNG/PSD 출력 후 컷/표지 합성 | 최대 1 GiB GLB/FBX/OBJ 로컬 임포트 | PNG/PSD 내보내기 후 분업·식자·슬라이스 연계 |

> **생태계 보완 도구 2종 대조**: 웹툰 제작 협업 전문 SaaS인 **Creco**는 에이전시 현업에서 검증된 회차 일정·피드백 운영이 강점(`native-strength`)이지만 드로잉 캔버스·레이어 단위 Rights BOM 자동 추출은 제공하지 않는다. 한국형 3D 배경 마켓인 **ACON3D**는 로판·현대·사극 장르의 방대한 `.skp` 카탈로그가 강점이며, ToonStudio는 작가가 구매한 `.skp`(최대 256 MiB)을 OpenSKP 워커로 브라우저에 직접 불러오고 Rights BOM 영수증으로 자동 관리하는 **공존 경로**를 취한다.

---

## 2. 핵심 경쟁사 6종 심층 해부: 강점 인정 vs 구조적 차별화

### 2.1 Clip Studio Paint (PRO / EX)
- **인정해야 할 강점 (`native-strength`)**:
  - 10년 넘게 누적된 네이티브 C++ 필압 엔진과 Wacom·Huion·XP-Pen OS 드라이버 성숙도.
  - 수만 종 이상의 `.sut` 브러시·화상소재·3D 포즈를 거래하는 **CLIP STUDIO ASSETS** 생태계(`docs/architecture/rea-competitor-services-catalog.md` CDP 관측: `clipstudio.net` 5,017 DOM, `assets.clip-studio.com` 5,181 DOM).
  - EX 버전의 3D→선화 LT 변환, 세로쓰기·스토리 에디터 일괄 식자, 웹툰 세로 분할 미리보기.
- **구조적 제약**:
  - 기기별 설치와 라이선스 인증 전환 마찰, 팀 단위 분업 공정(역할별 레이어 RBAC·컷 분할 자동 병합·5주 일정·로열티 정산)과 출고 직전 6대 자산 저작권 차단(Rights BOM)의 부재.
- **ToonStudio의 포지션 & 공존**:
  - 설치·인증 없이 3초 안에 브라우저로 진입하고, CSP 브러시 `.sut` SQLite 구조 파싱 워커([`studio-csp-sut-sqlite-reader.worker.ts`](../../apps/web/src/domains/creator/studio-csp-sut-sqlite-reader.worker.ts))와 PSD/ABR 호환으로 기존 자산을 이어받는다. 타원 말풍선 2D DP 식자, Rights BOM, 캔버스 직결 분업 OS, Remotion 숏폼 프로모가 핵심 차별점이다.

### 2.2 Procreate
- **인정해야 할 강점 (`native-strength`)**:
  - iPadOS 단일 하드웨어에 끝까지 맞춘 Metal Valkyrie 120Hz 초저지연 필기감과 Apple Pencil 기울기 반응.
  - 군더더기 없는 최소 크롬, 2/3손가락 탭 Undo/Redo, QuickShape, ColorDrop, 구독 없는 1회 구매 모델.
- **구조적 제약**:
  - **iPadOS 전용**이라 PC/Android 팀원과 실시간 협업이나 대형 3D 배경 작업, 벡터 선화 편집, 4대 플랫폼 안전 슬라이스 납품으로 바로 이어지기 어렵다.
- **ToonStudio의 포지션 & 공존**:
  - Procreate에서 검증된 터치 인체공학(2/3/4손가락 캔버스 탭 + 8ms 햅틱, QuickShape [`quick-shape.ts`](../../apps/web/src/domains/creator/drawing/quick-shape.ts), 가장자리 빠른 슬라이더·길게 눌러 스포이트 [`StudioEdgeQuickSlidersAndHoldEyedropper.tsx`](../../apps/web/src/domains/creator/drawing/StudioEdgeQuickSlidersAndHoldEyedropper.tsx))을 OS 경계 없는 웹에 내재화했다. iPad에서 그린 스케치를 PSD/PNG로 넘겨 웹툰 식자·3D 배경·납품만 ToonStudio에서 끝내는 하이브리드도 매끄럽다.

### 2.3 Adobe Photoshop
- **인정해야 할 강점 (`native-strength`)**:
  - 16/32-bit 색심도, CMYK 인쇄 프로파일, Camera Raw, 스마트 오브젝트, 초대용량 PSB 합성 등 출판·에이전시 후반 작업의 사실상 표준.
- **구조적 제약**:
  - 웹툰 전용 컷 분할, 말풍선 자동 조판, 3D 캐릭터/배경 스테이지, 4대 플랫폼 말풍선 보호 슬라이스, 분업 OS가 기본 내장되어 있지 않으며 상시 구독 비용이 발생한다.
- **ToonStudio의 포지션 & 공존**:
  - 표지 CMYK 단행본 인쇄 마스터링이나 고심도 포토 배싱은 Photoshop의 영역으로 존중하되, `ag-psd` 기반 PSD 입출력으로 왕복 연결하고 일상 연재 회차의 80% 이상을 브라우저 단일 흐름으로 압축한다.

### 2.4 Rebelle 7
- **인정해야 할 강점 (`native-strength`)**:
  - 실시간 중력 물 번짐(tilt 기반 유체 흐름), 종이 섬유질 흡수·건조, 임파스토 두께 광학 음영, 금박(Metallic Foil)과 Pigments 감산 혼색에서 업계 최상위 회화 질감을 낸다.
- **구조적 제약**:
  - 데스크톱 전용에 높은 GPU 사양을 요구하며, 웹툰 제작에 필수인 컷 프레임·말풍선 식자·3D 배경·협업·플랫폼 슬라이스가 없어 단행본 표지·일러스트 외의 주간 연재 공정과는 분리된다.
- **ToonStudio의 포지션 & 공존**:
  - 비상업 `mixbox`를 쓰지 않고 1차 원리로 구현한 **클린룸 7밴드 분광 KM WebGPU 엔진**([`studio-webgpu-km7-spectral-core.ts`](../../apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts)), 젖은 종이 확산 굽기 4레인([`wet-paper-bake.md`](../features/wet-paper-bake.md)), 중력/바람 습식 제어기([`studio-wet-gravity-blow-controller.ts`](../../apps/web/src/domains/creator/render/studio-wet-gravity-blow-controller.ts))를 웹툰 원고 캔버스에 직접 결합했다. 다만 **초고밀도 실시간 유체 물리 단독 회화 품질 자체는 Rebelle 7의 우위를 솔직히 인정**하며, 표지 특화 아트워크는 PNG/PSD 합성을 권장한다.

### 2.5 Blender
- **인정해야 할 강점 (`native-strength`)**:
  - 오픈소스 무료(GPL-2.0+)이면서도 풀 폴리곤 모델링, 스컬프팅, 리깅, 지오메트리 노드, Grease Pencil, Cycles/EEVEE 렌더링까지 제공하는 독보적 3D DCC.
- **구조적 제약**:
  - 학습 곡선이 가파르고 2D 웹툰 컷 편집·말풍선 식자·연재 납품과는 완전히 다른 작업 환경이라, 매 컷마다 "Blender 열기 → 카메라 조정 → 렌더 → PNG 저장 → 2D 앱 불러오기" 왕복 병목이 크다.
- **ToonStudio의 포지션 & 공존**:
  - 원본 모델링과 리깅은 Blender에 맡기고, 결과물(GLB/FBX/OBJ)을 ToonStudio Wasm64 로컬 거버너(**최대 1 GiB**)로 한 번만 불러와 컷 카메라·3D→2D 조명 동기화([`studio-bg3d-2d-character-light-sync.ts`](../../apps/web/src/domains/creator/bg3d/studio-bg3d-2d-character-light-sync.ts))·VRM 듀오 시선 교차 프리셋으로 매 컷 왕복을 없앤다.

### 2.6 ibisPaint (X / Pro)
- **인정해야 할 강점 (`native-strength`)**:
  - 저사양 스마트폰·태블릿에서도 가볍게 돌아가는 모바일 최적화 엔진, 2만 종 이상의 방대한 커뮤니티 브러시(QR 공유), 손가락 드로잉을 보정하는 강력한 손떨림 보정과 원클릭 타임랩스 녹화, 진입 장벽이 낮은 무료(+광고)/구독 구조로 입문자·학생 창작자층이 매우 두텁다([브러시 REA 보고서](../benchmarks/universal-brush-drawing-rea-internalization-2026-10-26.md), `ibispaint.com` AST 9,176노드 관측).
- **구조적 제약**:
  - 스마트폰·태블릿 개인 드로잉 중심이라 대용량 3D 배경(`.skp`/1 GiB GLB), 분광 안료 WebGPU 파이프라인, 한국어 타원 DP 식자, 상업 Rights BOM 검증, 다인 어시스턴트 분업 OS, 프레임 정확 Remotion 홍보 영상 파이프라인까지 확장하기 어렵다.
- **ToonStudio의 포지션 & 공존**:
  - 모바일 웹에서도 `>=44px` 터치 타깃·2/3/4손가락 제스처·간결한 집중(Zen) 밀도 모드로 가볍게 시작하되, 작품이 주간 연재와 팀 분업으로 커졌을 때 **앱을 갈아타지 않고 그대로 데스크톱 3D·분업 OS·납품까지 확장되는 연속성**이 핵심 차별점이다.

---

## 3. 웨어러블 · 스마트TV · 듀얼스크린 · 공간 XR 드로잉 UX 사례 분석

데스크톱과 태블릿 바깥의 폼팩터를 무작정 "작은 캔버스"나 "큰 캔버스"로 복제하면 십중팔구 실패한다. 글로벌 하드웨어·UX 사례를 역할 관점으로 분해해 ToonStudio의 적용 판단(`current` vs `target`)을 정리했다.

| 폼팩터 / 디바이스군 | 글로벌 UX 사례 및 핵심 교훈 (공개 제품·개발자 가이드 기준) | 드로잉·웹툰 워크플로에서 진짜 유효한 역할 | ToonStudio 적용 상태 & 전략 |
| --- | --- | --- | --- |
| **스마트워치 크라운 (Apple Watch · Wear OS)** | 40~49mm 화면에서 손가락으로 선화를 그리는 것은 물리적으로 비효율적. 반면 **디지털 크라운 / 회전 베젤**의 정밀한 촉각 디텐트(detent)와 손목 탭 제스처는 시선을 캔버스에서 떼지 않는 **보조 다이얼 리모컨**으로 가치가 높다. | • 크라운 회전 → 브러시 크기 / 불투명도 / 캔버스 회전<br>• 단일·더블 탭 → Undo / 스포이트 / 타이머<br>• 포모도로 마감 페이스 햅틱 알림 | `target` — 워치 자체 에디터 대신 로컬 브리지([`studio-hardware-bridge.ts`](../../apps/web/src/domains/creator/studio-hardware-bridge.ts)) 프로토콜에 연결되는 컴패니언 다이얼 모드 설계 (`device-watch.webp` 에셋 확보) |
| **스마트TV 10ft · 듀얼스크린 (Apple TV · Tizen · webOS · Sidecar)** | 3m(10ft) 거리에서는 정밀 포인팅이 불가능하고 리모컨 D-Pad 포커스 이동과 큼직한 타이포가 필수다. 반면 iPad Sidecar / Astropad / 듀얼 모니터 사례는 **입력면(태블릿)과 출력면(대형 화면)의 분리**가 생산성을 크게 끌어올림을 보여 준다. | • 10ft 원거리 원고 시사회·편집자/팀 컷 검수 뷰어<br>• 태블릿(캔버스 집중) + TV/보조 모니터(실시간 풀스크린 컷·레퍼런스 미러링) | `partial` → `target` — `Window Management` API 감지는 `current`([`nextgen-web-capabilities.ts`](../../apps/web/src/shared/lib/nextgen-web-capabilities.ts)), Document PiP 보조창은 `current`([`chrome-nextgen-media-tools.ts`](../../apps/web/src/domains/creator/nextgen-web-platform/chrome-nextgen-media-tools.ts)), 10ft D-Pad·TV 미러링 셸은 `target` |
| **왼손 단축키 컨트롤러 (TourBox · Wacom EKR · Xencelabs · Stream Deck)** | 현업 웹툰 작가들이 키보드 대신 왼손 다이얼·휠을 쓰는 이유는 **"시선 고정(Eyes-Free)"** 때문이다. 다이얼을 돌리며 브러시 크기를 실시간으로 바꾸면 툴바를 쳐다보는 왕복이 사라진다. | • 다이얼/링 → 브러시 크기·캔버스 회전<br>• 6~15키 → Undo/Redo·펜/지우개·스포이트·레이어·검수 | `current` — Chrome **WebHID 바이너리 직결** 3종([`studio-webhid-left-hand-device.ts`](../../apps/web/src/domains/creator/drawing/studio-webhid-left-hand-device.ts)) + Stream Deck 15키/TourBox JSON 프로필 내보내기([`studio-hardware-profiles.ts`](../../apps/web/src/domains/creator/studio-hardware-profiles.ts)) 구현 완료 |
| **폴더블 듀얼 스크린 (Galaxy Z Fold · Surface Duo 계열)** | 접히는 힌지(fold) 위에 캔버스 중심이나 슬라이더가 걸리면 필압 선이 끊긴다. 물리적 분할선에 맞춰 **작업면과 팔레트면을 분리**할 때 비로소 미니 작업실이 된다. | • 펼침 모드: 좌측 캔버스 / 우측 레이어·레퍼런스<br>• 플렉스(반접힘) 모드: 상단 프리뷰 / 하단 도구 덱 | `target` — `Window.viewport.segments` 및 CSS `horizontal-viewport-segments` 점진 적용 로드맵 |
| **공간 컴퓨팅 · WebXR (Meta Quest · Apple Vision Pro · ShapesXR · Quill)** | ShapesXR의 브라우저 공간 스토리보드와 Quill의 장면별 몰입 관람은 강렬하지만, 2D 원고 납품과 단절된 헤드셋 전용 앱은 현업 채택률이 낮다([XR 리서치 보고서](../studio-xr-research-and-spatial-storyboard-2026-09-06.md)). Adobe Aero(2025-12 서비스 종료)와 8th Wall(2026-02 플랫폼 종료) 사례는 **폐쇄형 XR SaaS 종속 위험**을 경고한다. | • PC에서 기존 3D 샷·콘티를 계획 → WebXR로 실척 공간/AR 미니어처 검토 → 일반 웹툰 2D 출력으로 환원 | `current` (런타임) / `target` (실기기 양안 QA) — WebXR 세션 컨트롤러([`studio-webxr-session.ts`](../../apps/web/src/domains/creator/studio-webxr-session.ts)) + 90° 곡면 공간 리더([`spatial-reader-runtime.ts`](../../apps/web/src/domains/creator/spatial-reader/spatial-reader-runtime.ts)) + 96컷 공간 콘티 계획 구현 |

---

## 4. 창작자 시나리오별 의사결정 매트릭스

모든 창작자에게 하나의 도구만 강요하는 것은 비현실적이다. 작업 조건별 가장 합리적인 선택과 공존 방식을 정리했다.

| # | 창작자 상황 / 시나리오 | 최적 권장 조합 | 선택 이유 및 공존 워크플로 |
| --- | --- | --- | --- |
| **1** | **1인 주간 웹툰 연재 시작** (설치·구독비 부담 최소화, 콘티~납품 원스톱) | **ToonStudio 단독** (`current`) | 베타 ₩0 · 3초 브라우저 진입 · 2D/3D/타원 식자/4대 플랫폼 안전 슬라이스/Rights BOM까지 앱 전환 없이 완결 |
| **2** | **2~6인 소규모 어시스턴트 분업 팀** (선화·밑색·배경·식자 병렬 마감) | **ToonStudio 분업 OS + 필요 시 CSP/PSD 왕복** | 레이어 RBAC·컷 분할 리스·자동 병합·5주 스케줄러·AD 레드라인·로열티 정산이 캔버스에 직결. 어시스턴트가 CSP에 익숙하면 PSD로만 왕복 |
| **3** | **기존 ACON3D `.skp` / Blender 배경 다수 보유 작가** | **Blender / ACON3D + ToonStudio** | 원본 모델링·구매는 기존 생태계 유지 → `.skp`(256 MiB) / GLB(1 GiB)를 브라우저 로컬 임포트해 컷 카메라·조명 동기화·2D 합성 시간 단축 |
| **4** | **iPad 휴대 스케치·이동 중 러프 드로잉 중심** | **Procreate 또는 ibisPaint + ToonStudio** | Apple Pencil 120Hz 초저지연 스케치는 Procreate(또는 초경량 모바일은 ibisPaint) 강점 활용 → PSD/PNG를 ToonStudio에 올려 식자·3D·납품 마무리 |
| **5** | **실사 수채화·유화 임파스토 단행본 표지 / 화보집** | **Rebelle 7 + Photoshop (+ ToonStudio 표지 통합)** | 중력 물 번짐·종이 섬유질·임파스토 물리는 Rebelle 7이 업계 최상위, CMYK 인쇄 마스터링은 Photoshop이 정석 |
| **6** | **웹툰 신작 런칭 10~60초 숏폼(틱톡·쇼츠·릴스) 자체 제작** | **ToonStudio `/create/promo` + 로컬 Remotion Render Kit** | Studio 원고 컷을 바로 불러와 16종 모션·자막·WebAudio SFX·BGM 덕킹 연출 후 브라우저 즉시 녹화 또는 프레임 정확 H.264 MP4 출력 |
| **7** | **대형 제작사(수십 명 규모) 기존 ERP·PD 운영 체계 유지** | **Creco + CSP EX (+ ToonStudio 시범 회차 병행)** | 이미 현업에 정착된 에이전시 운영 툴을 한 번에 갈아엎을 필요 없음. 신규 프로젝트나 외주 검수·Rights BOM 자동화 구간부터 부분 검증 권장 |
| **8** | **왼손 컨트롤러(TourBox · Wacom EKR · Xencelabs) + Chrome 데스크톱** | **ToonStudio Chrome WebHID 직결** | 제조사 데스크톱 매퍼 없이 브라우저에서 USB/BT HID 바이너리 리포트를 직접 수신해 한글 IME 단축키 충돌 제거 |

---

## 5. ToonStudio의 구조적 강점 vs 솔직한 보완 과제 (`current` vs `target`)

| 구분 | 항목 | 2026-11-23 실측 근거 (`current`) | 남은 보완 과제 (`target`) |
| --- | --- | --- | --- |
| **강점 ①** | **단일 브라우저 종단간 통합** | 2D 분광·3D(1 GiB)·타원 DP 식자·Rights BOM·분업 OS·Remotion 쇼츠·OPFS SQLite를 URL 하나로 통합 | 대용량 웹툰(100컷+) 장시간 연속 편집의 실기기 장기 soak 검증 지속 확대 |
| **강점 ②** | **₩0 로컬-퍼스트 단위경제 & 상용 라이선스 안전** | 월 ₩0 베타 하이브리드 인프라, `audit:licenses` 590개 통과, `mixbox` 0건, 클린룸 7밴드 KM, Rapier Apache-2.0 | 팀 4인+ 전환 시 Remotion 라이선스 대응, `opencascade.js` LGPL 최종 법무 확인, `p5` peer 격리 |
| **강점 ③** | **표준 웹 하드웨어·차세대 플랫폼 선제 대응** | Chrome WebHID 3종 직결, 27종 차세대 API 감지기, Speculation Rules + `document.prerendering` 잠금 가드 | Safari·Firefox 미지원 API의 UX 격차 관리, 스마트워치·스마트TV·폴더블·WebMIDI·풋페달 실제 표면 구현 |
| **보완 ①** | **WebGPU 브러시 기본 커밋 승격** | WGSL 타일·KM7·예측·HDR 모듈은 구현 완료(`provider`), 종단 커밋 권위는 `canvas2d-draw-node` 유지 | `webgpu-brush-runtime`의 `raster-brush-commit` `primary` 승격 및 다양한 GPU 드라이버 디바이스 로스트 복구 검증 |
| **보완 ②** | **UI/UX v2 완전 수렴 & 거대 호스트 분해** | `StudioCuttoonEditorHost.tsx` `29,365 → 24,744줄` 감축, 금지 도메인 도달 `55 → 1건`, `creator` 75파일 엄격 린트 0경고 | 잔여 금지 도메인 `scene-3d` 1건(`0/41`) 완결, 전 화면 `82%+` 캔버스 · 단일 44px 바 · 7대 메뉴 완전 수렴 |
| **보완 ③** | **현업 창작자 실증 데이터 확보** | 공개 베타(`toonstudio.cloud`) 가동 및 자동화 QA·계약 테스트 체계 완비 | 무료 베타 창작자 **30명** · 직무별 심층 인터뷰 **10명+** · **3~6개월** 유료 전환 의사(WTP) 실증 데이터 축적 |

---

## 6. 출처 및 연관 문서

- 공개 비교 페이지 정본 데이터: [`competitor-comparison-profiles.ts`](../../apps/web/src/domains/marketing/competitor-comparison-profiles.ts) · [`competitor-comparison-axes-core.ts`](../../apps/web/src/domains/marketing/competitor-comparison-axes-core.ts) · [`competitor-comparison-axes-workflow.ts`](../../apps/web/src/domains/marketing/competitor-comparison-axes-workflow.ts)
- 브러시·드로잉 생태계 REA 역공학 원장: [글로벌 오픈소스·웹·상용 브러시 REA 보고서](./universal-brush-drawing-rea-internalization-2026-10-26.md)
- XR·공간 컴퓨팅 리서치: [ToonStudio XR 리서치와 공간 콘티 1차 구현](../studio-xr-research-and-spatial-storyboard-2026-09-06.md)
- 기술 심층 백서: [ToonStudio 차세대 웹 엔지니어링 기술 백서](../tech/toonstudio-nextgen-engineering-whitepaper.md)
- IR·홍보 차별화 브리프: [ToonStudio IR · 홍보 · 제휴 차별화 브리프 (2026-11)](../ir/toonstudio-ir-promo-differentiation-brief-2026-11.md)
