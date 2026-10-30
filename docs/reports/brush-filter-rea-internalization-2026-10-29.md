# 브러시·필터·습식 매체 REA 분석과 내재화 — 2026-10-29

- 문서 상태: 역사 자료(2026-10-29 분석·구현 기록). 현재 동작의 정본은 각 기능 문서([`features/filter-gallery.md`](../features/filter-gallery.md), [`features/mypaint-cc0-brush-library.md`](../features/mypaint-cc0-brush-library.md), [`features/latent-pigment-mixing.md`](../features/latent-pigment-mixing.md), [`features/textured-brush-pressure-tooth-shader.md`](../features/textured-brush-pressure-tooth-shader.md), [`features/wet-paper-bake.md`](../features/wet-paper-bake.md))다.
- 작업 브랜치: `claude/intelligent-hamilton-lii7na`. 증거 원장: [`evidence/rea-brush-filter-internalization-20261029.json`](../evidence/rea-brush-filter-internalization-20261029.json).
- 증거 표기: **[REA]** REA 분석 결과(증거 ID 포함), **[원본]** 허용 라이선스 원본을 직접 읽은 것, **[공개]** 공개 매뉴얼·논문·메뉴 이름, **[저장소]** 이 저장소의 파일, **[미확인]** 보지 못했거나 확인하지 못한 것.
- 지식재산 규칙(ADR-0026): 아래 규칙대로 다뤘다.

| 원본 라이선스 | 다룬 방식 |
| --- | --- |
| CC BY-NC (Mixbox) | 코드·LUT·계수·문자열을 새 코드에 넣지 않았다. |
| GPL (Krita, GIMP, MyPaint 앱, Harmony 등) | 코드를 열지 않고 공개 매뉴얼의 기능 설명과 논문만 썼다. |
| 라이선스 없음 (stony-su/ink) | 구조 관찰만 하고 코드는 쓰지 않았다. |
| MIT·ISC·CC0 | 출처를 고지하고 이식했다. |
| 경쟁 제품 | 코드·자산·프리셋을 복사하지 않았다. |

## 1. 결론

분석 대상이 가진 브러시·필터·기능 가운데 **이 제품에 실제로 비어 있던 것**만 채웠다. 이미 있는 것은 중복 구현하지 않았다. 이미 있던 것의 예는 다음과 같다.

- 약 105종의 필터: 블러 갤러리, 왜곡 10종, CSP 플러그인 9종, Photoshop Web 프리셋.
- libmypaint WASM, Krita 코어 엔진, ABR·SUT 가져오기.
- 독립 구현 잠재 안료 혼합기.

빈자리와 이번에 한 일은 다음과 같다.

| 빈자리(분석 시점) | 이번에 한 일 | 상태 |
| --- | --- | --- |
| MyPaint 브러시를 근사 엔진으로만 그림(실제 libmypaint WASM은 이미 있었음) | mypaint-brushes(CC0) 196종을 실제 libmypaint 1.6.1 WASM으로 변환. 표면 요구 분류와 첫 샘플 프라이밍을 더함. 리뷰 뒤 변환 여백을 곡선 직선 연장·저장된 획 속도·추적 잡음으로 추정하도록 고침 | current |
| 절차 브러시(이웃 점 연결·털·리본 등)가 없음 | 브러시 스튜디오 V6 위상 커널로 16종을 더함. Harmony 개념 10종은 독립 구현, Klecks sketchy·chemy는 MIT 이식, Krita 매뉴얼 개념 4종 | current |
| 잠재 안료 혼합이 CPU 반복 풀이뿐이라 획 단위로만 씀 | 33³ 표 고속 경로(약 75배), WGSL·GLSL 셰이더와 TS 재현, 혼색 브러시 "섞는 방식" 선택 | current. 셰이더는 아직 제품 GPU 렌더러에 연결되지 않음 |
| 필압 곡선·종이 이빨을 셰이더 안에서 평가하지 않음 | 텍스처 브러시 셰이더가 필압 LUT와 이빨 문턱을 직접 평가 | 구현됨, 제품에서는 꺼짐(CPU 기준 렌더러 패리티 조건) |
| §15.3 "Filter Gallery" 행이 비어 있음(absent) | 효과를 최대 8겹 쌓는 비파괴 필터 갤러리와 효과 103종 | partial(겹별 썸네일·사용자 프리셋 없음) |
| 습식 잉크·수채 확산(MoXi·Curtis 계열) 굽기가 없음 | 젖은 종이 정착 솔버(MoXi LBM·Curtis 안료·Chu & Tai 갈필)와 레인 4종. 커밋 획을 Canvas 시분할·SVG PNG로 굽는다. 갈필 강모 지도는 Sumi MIT 이식 | current, 실험 단계. 흐름층 WGSL 커널은 제품 미연결(8절) |

## 2. 분석 방법과 한계

- 도구: REA(`rea-agents` 6.8.0, MIT).
  - JS·TS 소스 대상은 `analyze-javascript-application`으로 분석했다.
  - 웹 앱은 `capture-browser-scenario`(Playwright Chromium 153), `export-web-scripts`, `analyze-web-bundle`로 분석했다.
- 네이티브(바이너리) 대상은 이번 범위에 없어 Ghidra를 실행하지 않았다(정책상 네이티브 분석 엔진은 Ghidra만 쓴다). C 소스 공개 대상(libmypaint)은 소스를 직접 읽었다.
- 실행하지 못한 것:
  - Mixbox 원본 C++과 저장소 구현의 차분 실행. 외부 빌드·실행이 자동 승인 정책에서 거부됐다.
  - 대신 저장소에 이미 고정된 WASM과 자체 시험으로 검증했다.
- Photopea:
  - 브라우저 시나리오 캡처가 `incomplete`로 끝났다(증거 `ev_2ae262de…`).
  - 첫 화면 로더 스크립트 1개만 분석됐고 편집기 번들은 캡처되지 않았다(`ev_db81a764…`).
  - 그래서 Photopea 고유 구현은 [미확인]이다. 필터 이름과 동작은 Photoshop 공개 메뉴와 같아 Photoshop 대응표로 다뤘다.
- "Miralab Wet Ink"라는 이름의 공개 저장소·사이트는 찾지 못했다 [미확인].
  - 같은 부류(논문 기반 젖은 먹·수채 확산의 웹 데모)의 공개 저장소 4개를 대신 분석했다(3절).

## 3. 대상별 관찰과 판단

| 대상 | 라이선스 | REA 증거 | 관찰 요점 | 판단 |
| --- | --- | --- | --- | --- |
| `mixbox` npm 2.0.0 | CC BY-NC 4.0 | `ev_7df8efb8…` (JS 2개, AST 12,195) | 잠재 표현 7수(안료 농도 4 + RGB 잔차), 3차 20항 다항식, 64³ LUT(512×512 RGBA8 PNG 8×8 타일), GLSL `mat3` 잠재. WGSL·WASM 경로는 상류에 없음 | 코드·LUT·계수 미사용. 기존 독립 구현 `toonstudio-latent-pigment-v1` 위에 표·셰이더 경로만 새로 만듦 |
| `volcomix/ink-drop` | MIT | `ev_4fc4f4c4…` (JS 25개, 발견 125) | WebGL2 안정 유체(이류·발산·자코비 압력·기울기 감산·소용돌이 구속·스플랫·염료) + 입자 | 개념(Stam 1999 안정 유체)만 참고. 습식 굽기 설계 입력 |
| `stony-su/ink` | 없음 | `ev_388a4034…` (JS 1개, 발견 31) | 단일 `app.js` 잉크 번짐 데모 | 라이선스 부재로 코드 미사용, 구조 관찰만 |
| `Aureliaar/sumi` | MIT | `ev_7f67be77…` (JS 6개, 발견 9) | 붓 쓸기(sweep)·제스처 맞춤 기반 수묵 획, `public/sumi.js` 강모·다발 지도와 `FS_DAB` 갈필 문턱 | 강모·다발 지도와 갈필 문턱을 출처 고지와 함께 이식(`studio-wet-paper-bristle.ts`, 8절) |
| `AndrewVoirol/watercolor-workbook` (`watercolor-zen-webgpu`) | MIT(package.json) | `ev_28cd7153…` (JS 64개, 발견 365) | WebGPU WGSL 계산 파이프라인: 털 물리, 이류, 모세관 확산, 붓 주입, KM 렌더, 투영, 증발·고착(가장자리 짙어짐), 화선지 생성 | 셰이더 단계 분할을 습식 굽기·GPU 경로 설계에 참고 |
| `bitbof/klecks` | MIT | `ev_10b7dd72…` (JS 369개, AST 260,347, 발견 3,707) | 브러시(sketchy·chemy·pen·blend·pixel 등), 필터, 레이어 기능 | sketchy·chemy를 출처 고지와 함께 이식(`brush-studio-v6-procedural-klecks-kernels.ts`) |
| `mypaint/libmypaint` 1.6.1 | ISC | 소스 직접 열람 | 매핑(구간 선형 가산, 끝 구간 직선 연장), 속도 지수 평균·추적 잡음 건너뛰기, Knuth ranf, `stroke_to`·덥 계산, 스머지 버킷, 분광 WGM, 1.6.1 `mypaint_brush_stroke_to` 는 레거시 경로(paint_mode·posterize 없음) | 저장소에 고정된 WASM을 그대로 실행. 레거시 경로 한계를 문서화 |
| `mypaint/mypaint-brushes` | CC0 | 소스 직접 열람 | `.myb` v3 196종 | 196종 전부 변환. 지우개 8·스머지 전용 30·포스터화 1은 표면 요구로 차단 |
| Photopea | 독점 | `ev_2ae262de…`, `ev_db81a764…`, `ev_1f39b01c…` | 2절 참고 | 고유 구현 [미확인] |

## 4. 프로그램 × 브러시·필터·기능 적용 범위

[저장소] 근거가 있는 것만 "있음"으로 적는다. "이번"은 이 브랜치에서 더한 것이다.

| 프로그램 | 브러시 | 필터 | 기능 |
| --- | --- | --- | --- |
| Photoshop / Photopea | ABR 가져오기(기존 `brush/studio-abr-import*`) | 블러 갤러리·왜곡·노이즈 등 기존 약 105종 + Photoshop Web 프리셋 카탈로그(기존). **이번:** 필터 갤러리의 예술 효과·붓 터치·스케치·텍스처 계열(드라이 브러시, 수묵화, 그래픽 펜, 균열, 텍스처화 등)과 확산·돌출·타일·윤곽선 추적·바람, 유리·바다 물결·기울이기, 단면화·조각·메조틴트, 섬유·차이 구름, 조명 효과, 변위 | 액션 디스크립터·빠른 작업·리퀴파이 조화(기존). **이번:** 효과 스택(필터 갤러리) |
| Clip Studio Paint | SUT(SQLite) 브러시 읽기(기존 `studio-csp-sut-sqlite-reader*`) | 플러그인 호환 9종(기존 `drawing/studio-csp-remaining-plugin-filters.ts`) | 기존 다수(이번 범위 밖) |
| Krita | 코어 엔진·CC0 팁 가져오기(기존). **이번:** 해칭·격자 셀·곡선·스프레이 개념 4종 | 기존: 색→알파·하프톤·픽셀화. **이번:** 채널 최대/최소, 기울기·오프셋·거듭제곱, 닷지/번, 팔레트화(색 줄이기), 빗방울, 작은 타일, 둥근 모서리, 퐁 범프맵(범프 맵) | 만화경 대칭(기존 `studio-kaleidoscope.ts`) |
| GIMP | — | 기존: 왜곡·극좌표 등. **이번:** 카툰, 큐비즘, SLIC, 던지기·고르기·흘러내림, HSV 노이즈, 대칭 최근접 이웃, 평균 곡률 흐림, 명도 반전, 레티넥스, 판화, 만화경, 환영, 작은 행성, 종이 타일, 이음매 없는 타일, 거리 맵, 라플라스, 이미지 기울기, 플라스마, 미로, 사인, 체커보드, 격자, 나선, 초신성, 반짝임, 긴 그림자, 커피 얼룩, 안개, 직소, 비디오 열화 | — |
| Paint.NET | — | **이번:** 잉크 스케치, 움푹 패임, 타일 반사, 극 반전, 만델브로·줄리아, 보로노이, 조각, 디더링, 양자화 | — |
| MyPaint | 기존 libmypaint WASM 엔진. **이번:** CC0 196종 실제 엔진 변환 | — | — |
| Klecks | 기존 브러시 팁 커널. **이번:** sketchy·chemy 이식 | — | — |
| Harmony(mrdoob) | **이번:** sketchy·shaded·web·fur·longfur·squares·circles·grid·chrome·ribbon 개념 독립 구현 | — | — |
| Mixbox | 기존 독립 구현 잠재 안료 혼합기. **이번:** 표 고속 경로·셰이더·혼색 방식 선택 | — | — |
| 습식 잉크·수채 데모(ink-drop·Sumi·watercolor-workbook)와 MoXi·Curtis 논문 | **이번:** 젖은 종이 확산 레인 4종(먹 번짐·백런·입자 침전·갈필) | — | **이번:** 커밋 획 정착 굽기(Canvas 시분할 호스트, SVG 무손실 PNG) |
| Procreate, ibisPaint, MediBang | [미확인] — 이번에 REA 대상으로 확보하지 못했다(모바일 앱·설치본 없음). 공개 메뉴 이름만 일부 효과의 기능 대응(`references`)에 적었다 | | |

## 5. 이번에 바뀐 파일(요약)

| 영역 | 파일 |
| --- | --- |
| MyPaint CC0 | `scripts/generate-studio-mypaint-cc0-library.mjs`, `apps/web/src/domains/creator/brush/mypaint-library/*`, `packages/studio-brush-platform/src/libmypaint.ts`(`primeAtFirstSample`), `third_party/mypaint-brushes/` |
| 절차 브러시 | `apps/web/src/domains/creator/brush-lab/brush-studio-v6-procedural-*.ts`, `brush-studio-v6-recipe-catalog-procedural.ts`, `third_party/klecks/README.md` |
| 잠재 안료 GPU·표 | `apps/web/src/domains/creator/brush-lab/pigment/latent-pigment-{table,shaders,shader-mirror}.ts`, `brush/studio-wet-mix*.ts`, `render/studio-engine-webgpu-textured-brush-shader.ts`, `render/studio-webgpu-pressure-tooth*.ts` |
| 필터 갤러리 | `apps/web/src/domains/creator/filter/gallery/*`, `render/studio-konva-filter{s,-fields}.ts`, `studio-image-filter-worker-client.ts`, `filter/studio-filter-menu.ts`, `studio-main-menu-items-filter.ts`, `studio-command-catalog.ts`, `apps/web/public/i18n/studio/**`(75개 언어 × 2) |
| 젖은 종이 굽기 | `apps/web/src/domains/creator/brush/wet-paper/*`, `export/studio-svg-export-watercolor.ts`, `brush/StudioDrawNode.tsx`, 브러시 레인 카탈로그·런타임 계약·아이콘·생명주기·변형군·노출 상한, `third_party/sumi/` |
| 고지 | `THIRD_PARTY_NOTICES.md`, `scripts/generate-third-party-notices.mjs` |

## 6. 하지 않은 것과 확인하지 못한 것

- 실기기 GPU 픽셀 검증을 하지 않았다(잠재 안료 셰이더, 셰이더 필압·이빨). WGSL은 naga 30.0.1로, GLSL은 기계 변환본으로 문법·타입만 검증했다.
- 필터 갤러리 대화상자는 jsdom 시험만 했다. 실브라우저 시각 확인을 하지 않았다.
- 젖은 종이 굽기는 실브라우저 시각 확인을 하지 않았다. 흐름층 WGSL 커널은 CPU 미러 대조만 했고 실기기 GPU에서 실행하지 않았다.
- Sumi 업스트림 `LICENSE`의 저작권 줄이 템플릿 자리 표시자(`YOUR NAME`)다. 사본은 그대로 두었고, 저작권자 표기가 정해지면 바꾼다.
- 필터 갤러리 효과의 원작 대비 픽셀 일치는 목표가 아니다. 원작 코드를 쓰지 않고 공개 설명으로 새로 구현했으므로 모양이 다를 수 있다.
- 라이선스 확인 필요:
  - Klecks sketchy의 연결 규칙(거리 임계 4000/2000, 양 끝 30% 줄임)은 널리 알려진 Harmony sketchy 설명과 같다.
  - Klecks 파일에는 Harmony 출처 표기가 없다.
  - 배포 전에 Klecks의 MIT가 그 파일을 실제로 덮는지 법무 확인이 필요하다.
- Photopea 편집기 번들, "Miralab Wet Ink" 원본, Procreate·ibisPaint·MediBang 동작은 [미확인]이다.

## 7. 다시 재는 법

```bash
pnpm exec vitest run apps/web/src/domains/creator/filter/gallery apps/web/src/domains/creator/brush/mypaint-library
```

```bash
pnpm exec vitest run apps/web/src/domains/creator/brush-lab/brush-studio-v6-procedural-family-engine.test.ts apps/web/src/domains/creator/brush-lab/pigment
```

```bash
node scripts/generate-studio-mypaint-cc0-library.mjs --check
```

```bash
pnpm exec vitest run apps/web/src/domains/creator/brush/wet-paper
```

## 8. 습식 잉크·수채 굽기(WP3)

현재 동작의 정본은 [`features/wet-paper-bake.md`](../features/wet-paper-bake.md)다. 이 절은 분석에서 구현으로 넘어간 경위만 적는다.

- **빈자리**: 제품의 수채·수묵 획은 dab 계획을 바로 그리는 베이스 워시와 리빙잉크 정착 굽기뿐이었다. 종이 위에서 물이 흐르고 안료가 가라앉는 시뮬레이션(먹 번짐, 백런, 입자 침전, 갈필)은 없었다.
- **분석에서 가져온 것**
  - `volcomix/ink-drop`(MIT, `ev_4fc4f4c4…`): 안정 유체 단계 구성. 개념만 썼다.
  - `AndrewVoirol/watercolor-workbook`(MIT, `ev_28cd7153…`): 털 물리·이류·모세관 확산·증발·고착으로 나눈 WGSL 단계. 단계 분할을 설계에 참고했다.
  - `Aureliaar/sumi`(MIT, `ev_7f67be77…`): 강모·다발 지도와 `FS_DAB` 갈필 문턱 수식은 코드로 이식했다. dab 현 정규화·물 MAX 블렌딩·섬유 결 노이즈는 개념만 썼다. 이식 기준 커밋은 `89b8c443`이다.
  - `stony-su/ink`(라이선스 없음, `ev_388a4034…`): 구조 관찰만 했다.
  - 물리 모델은 MoXi(Chu & Tai 2005), Curtis et al.(1997), Chu & Tai(2004) 논문으로 새로 구현했다.
- **한 일**
  - 결정적 솔버: 종이·물(D2Q9 LBM + 3층 교환)·안료(두 종 보존 수송)·갈필·Beer–Lambert 합성. 상한(셀 65,536·스텝 96·래스터 약 100만 픽셀)과 결정성(반복·시분할 바이트 일치)을 시험으로 고정했다.
  - 레인 4종(`ink-wash--moxi-bake`, `watercolor--curtis-bake`, `watercolor--granulating-bake`, `ink-wash--dry-brush`), 실험 단계로 노출.
  - Canvas 커밋 획은 8 ms 조각 시분할 호스트로 굽고, SVG 내보내기는 같은 순서를 동기로 돌려 무손실 PNG로 싣는다.
  - 흐름층 한 스텝의 WGSL 컴퓨트 커널과 CPU 미러 대조 시험(제품 미연결).
- **결정과 근거**
  - 레인 id 접두를 `sumi--`가 아니라 `ink-wash--`로 했다. 기존 수묵 정착 레인과 기반(`ink-wash`)이 같기 때문이다.
  - 노출 상한 시험은 정리 기준선 234종에 정리 이후 새 엔진 레인 4종을 더해 비교한다. 네 레인의 실행 서명·플래너 지문이 모두 달라 중복 노출이 아니다.
  - SVG의 PNG는 순수 JS `fflate`(이미 운영 의존성)로 만들어 플랫폼과 관계없이 바이트가 같게 했다.
- **진입 그래프**: 솔버·합성은 처음부터 동적 import 뒤에 있었다. 그런데 병합 직후 호스트가 프로그램 표(`studio-wet-paper-programs.ts`·`studio-wet-paper-math.ts`, 약 21 KiB)를 정적으로 끌어와, Studio 진입 그래프가 허용치(19.34 MiB)에 1 KiB 안쪽까지 붙었다. 프로그램 id·요청 키만 `studio-wet-paper-program-ids.ts`로 떼고 표는 런타임 청크로 옮겨 진입 그래프를 19,803.3 KiB에서 19,785.0 KiB로 줄였다.
