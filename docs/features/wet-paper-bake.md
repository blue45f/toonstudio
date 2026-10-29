# 젖은 종이 정착 굽기 (수채·수묵 확산 레인)

작성 기준일: 2026-10-29 · 대상: 브러시 패널 수채·수묵 탭의 **젖은 종이 확산** 레인 4종

이 문서는 커밋된 수채·수묵 획을 종이 위 물·안료 시뮬레이션으로 다시 굽는 기능의 **현재 구현(current)**, 실행 경로, 모델, 상한, 한계를 적는다. 분석·내재화 경위는 [`reports/brush-filter-rea-internalization-2026-10-29.md`](../reports/brush-filter-rea-internalization-2026-10-29.md) 8절에 있다.

## 1. 상태 요약

| 영역 | 상태 | 근거 |
| --- | --- | --- |
| 레인 4종 등록(레인 종류 `wet-paper`, 수채·수묵 탭, 아이콘, 변형군) | current, 실험 단계(`experimental`) | `brush/studio-brush-engine-lane-catalog.ts`, `brush/studio-brush-catalog-lifecycle.ts`, `brush/studio-brush-variant-group-manifest.ts` |
| 솔버(종이·물·안료·갈필)와 Beer–Lambert 합성 | current | `brush/wet-paper/studio-wet-paper-{paper,water,pigment,bristle,deposit,lbm,kernel,solver,composite,state,math}.ts` |
| Canvas 커밋 획 굽기(시분할 호스트) | current | `brush/wet-paper/studio-wet-paper-host.ts`, `brush/wet-paper/studio-watercolor-settled-surface.ts`, `brush/StudioDrawNode.tsx` |
| SVG 내보내기(동기 굽기, 무손실 PNG) | current | `export/studio-svg-export-watercolor.ts` |
| 흐름층 WGSL 컴퓨트 커널 | 구현됨, 제품 미연결(시험만 가져옴) | `brush/wet-paper/studio-wet-paper-lbm-wgsl.ts` |
| 라이브 초안·썸네일 굽기, GPU 실행 경로 | 미구현 | 6절 |

경로는 모두 `apps/web/src/domains/creator/` 아래다.

## 2. 레인

| 레인 id | 표시 이름 | 프로그램 | 종이와 결과 |
| --- | --- | --- | --- |
| `ink-wash--moxi-bake` | 수묵 · 먹 번짐 확산 | `moxi-sumi-dispersion` | 흡수성 섬유지. 붓 자리의 물이 마른 종이로 번지며 섬유를 따라 빨리, 가로질러 느리게 퍼진다. 탄소 입자는 붓 자리 가까이 남고 아교 염료가 옅은 후광과 후광 끝의 진한 선을 만든다. |
| `watercolor--curtis-bake` | 수채 · 백런·가장자리 짙어짐 | `curtis-watercolor-backrun` | 사이징된 수채지. 가장자리 증발이 안료를 테두리로 모으고, 획 끝 물웅덩이가 마르기 시작한 획으로 번져 꽃양배추 모양 백런을 만든다. |
| `watercolor--granulating-bake` | 수채 · 입자 침전 | `curtis-granulating-wash` | 거친 황목. 무거운 입자 안료가 종이 골에 가라앉고 고운 염료는 고르게 물든다. |
| `ink-wash--dry-brush` | 수묵 · 갈필 | `chu-tai-dry-brush` | 물이 적은 붓. 획이 진행할수록 붓이 말라 강모 줄무늬 사이가 비고(비백) 종이 골을 건너뛴다. 번짐은 작다. |

- 레인 id 접두는 기존 수묵 정착 레인과 같은 기반(`ink-wash`)을 따라 `ink-wash--`를 쓴다.
- 레인은 수채 재질 행에 `wetPaperBakeProgramId`를 고정한다. 웻 텍스처 권위는 브러시당 하나다. 우선순위는 블룸 핀 → 리빙잉크 정착 굽기 → 젖은 종이 굽기이고, 커스텀 프로그램 세트 오버라이드가 레인 고정보다 앞선다.
- 노출 상한: 정리(컬) 기준선 234종에 정리 이후 새 엔진 레인 목록(`STUDIO_LISTED_PAINT_POST_CULL_ENGINE_LANE_IDS`, 이 4종)을 더해 비교한다. 네 레인은 실행 서명·플래너 지문이 모두 다르다.

## 3. 실행 경로

- **입력**: 제품 수채 플래너가 만든 dab 계획(같은 레인의 베이스 워시와 같다)과 획 고정 시드(요소 id에서 계산).
- **Canvas(커밋 획)**
  - 렌더 본문이 `requestStudioWetPaperBake`를 부른다. 결과가 없으면 이번 프레임은 베이스 워시를 그린다.
  - 호스트는 setTimeout 0 조각마다 8 ms 예산 안에서 솔버 스텝을 하나씩, 합성은 약 16k 픽셀씩 전진한다. 끝나면 `onReady`가 한 번 불리고 다음 렌더에서 굽힌 래스터를 `drawImage`로 그린다.
  - 솔버·합성 코드와 프로그램 표(물·안료·종이 계수)는 `studio-wet-paper-runtime.ts` 동적 import 뒤에 있어 Studio 진입 청크에 실리지 않는다. 진입 그래프에는 호스트, 프로그램 id·요청 키(`studio-wet-paper-program-ids.ts`), 정착 표면 해석만 실린다.
  - 캐시는 두 층이다. 굽기 결과(색과 무관한 광학 밀도)는 dab 서명으로 최대 48개·총 400만 셀까지, 합성 래스터는 색별로 항목당 2개·총 600만 픽셀까지 LRU로 보관한다. 색만 바뀐 획은 다시 풀지 않고 합성만 한다.
  - 합성하는 사이 결과가 LRU에서 밀려나면 래스터를 보관하지 않고 다시 요청하게 한다.
- **SVG 내보내기**
  - 같은 프로그램 해석과 같은 create → advance(1)·N → finish 순서를 동기로 돌린다. 호스트 캐시에 결과가 있으면 다시 쓴다.
  - 래스터는 무손실 PNG `<image>`로 싣는다(`data-brush-engine="wet-paper-bake-v1"`). PNG는 순수 JS `fflate` zlib(레벨 6, 필터 0)으로 만들어 플랫폼과 관계없이 바이트가 같다.
  - 다른 레인의 내보내기 출력은 바이트 그대로다.
- **저장 형식**: 새 문서 필드가 없다. 획에는 기존처럼 브러시 id만 저장되고, 굽기 결과는 렌더할 때 다시 만든다.

## 4. 모델

물리 모델은 아래 논문을 바탕으로 이 저장소에서 독립적으로 구현했다.

- **종이**: 문서 좌표에 고정된 시드 종이. 제품 종이 높이 샘플러에 4층 섬유 능선 노이즈를 더한다. 링크별 차단 계수 κ(섬유 나란/가로 이방성), 모세관 용량, 흡수율을 둔다.
- **물**: MoXi(Chu & Tai, SIGGRAPH 2005) D2Q9 격자 볼츠만. BGK τ=1, 링크별 κ의 다공성 부분 bounce-back, 젖음 전선 고정, 모세관 흡입·종이 기울기·가장자리 바깥 흐름 가속. Curtis et al.(SIGGRAPH 1997) 표면·흐름·모세관 3층 교환(흡수 분배, 문턱 모세관 확산, 전선 가중 증발, 건조 가속).
- **안료**: 굵은 입자와 고운 염료 두 종의 링크 단위 보존 수송(확산·상류 이류·가장자리 이동·골 미끄러짐·모세관 운반). 마를수록 빨라지는 흡착, 탈착, 착색, 지연 경화를 둔다. 가장자리 이동은 3×3 젖음 비율의 기울기만 따라 워시 안쪽에 dab 간격 줄무늬가 생기지 않는다.
- **갈필**: Chu & Tai(IEEE CG&A 2004)의 마른 붓 개념. 강모·다발 지도와 문턱 수식은 Sumi(MIT)에서 이식했다(5절).
- **합성**: Beer–Lambert(K = −ln C / D_ref, 직선 알파 변환). 덮임 0.5 등고선으로 안티앨리어스하고 문서 약 1.25 px 래스터로 굽는다.

## 5. 상한·결정성·출처

- **상한**: 셀 65,536개, 한 변 512셀, 추정 활성 셀 16,384개, 스텝 96 이하, 래스터 약 100만 픽셀. 긴 획은 셀을 굵게 잡아 격자에 맞추고, 래스터는 배율을 낮춰 상한 안에 맞춘다. dab이 없거나 런타임 청크를 불러오지 못하면 굽지 않고 베이스 워시를 그린다.
- **메모리·시간**: 상태는 `Float32Array`다. 스텝 안에서 할당하지 않고, 4×4 타일 단위로 정확히 건너뛰며, 바깥 벽 타일로 경계 검사를 없앴다. 최대 격자 실행 시간은 성능 예산 시험(`studio-wet-paper-runtime-budget.test.ts`)이 지킨다.
- **결정성**: `Math.random`·`Date.now`를 쓰지 않고, 결과 경로에서 `Math.exp`·`Math.log`·`Math.sin` 대신 결정적 근사를 쓴다. 한 번에 굽든 조각으로 나눠 굽든 바이트가 같다.
- **이식(MIT)**: `brush/wet-paper/studio-wet-paper-bristle.ts`는 [Sumi](https://github.com/Aureliaar/sumi) 커밋 `89b8c443`의 `public/sumi.js` `buildBristleTexture`·`equalize`·`pnoise`와 `FS_DAB` 셰이더의 갈필 문턱 수식을 옮겼다. 지도 크기(128×512, 강모 64가닥, 다발 6개), 결정적 다항식, `Float32Array`와 쌍선형 샘플러로 바꿨다. 라이선스 사본과 이식 범위는 [`../../third_party/sumi/README.md`](../../third_party/sumi/README.md), 고지는 [`../../THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md)에 있다.
- **개념만 참고**: Sumi의 dab 현(chord) 정규화·물 MAX 블렌딩·섬유 결 노이즈·Beer–Lambert 합성이라는 선택, `volcomix/ink-drop`(MIT)의 안정 유체 단계 구성, `AndrewVoirol/watercolor-workbook`(MIT)의 WGSL 단계 분할. 코드는 쓰지 않았다.

## 6. 한계와 미구현

- 굽기는 커밋된 획에만 적용된다. 그리는 중의 라이브 초안과 썸네일은 언제나 베이스 워시다.
- 굽기가 끝나기 전 프레임은 베이스 워시를 그리므로, 획을 놓은 뒤 결과가 잠깐 늦게 바뀐다.
- 흐름층 WGSL 커널은 CPU 미러와 12스텝 동안 분포·밀도·속도가 상대 오차 1e-5 안에서 같은지만 시험했다. 제품 렌더러에 연결하지 않았고 실기기 GPU에서 실행하지 않았다.
- 실브라우저 시각 확인은 하지 않았다. 시험은 jsdom과 순수 계산으로 했다.
- Sumi 업스트림 `LICENSE`의 저작권 줄은 템플릿 자리 표시자(`YOUR NAME`)다. 허가 문구를 바꾸지 않으려고 사본을 그대로 두었다. 저작권자 표기가 정해지면 사본을 바꾼다.

## 7. 시험과 다시 재는 법

```bash
pnpm exec vitest run apps/web/src/domains/creator/brush/wet-paper apps/web/src/domains/creator/brush/studio-brush-listed-uniqueness.test.ts apps/web/src/domains/creator/brush/studio-brush-variant-group-manifest.test.ts
```

```bash
pnpm exec vitest run --config vitest.perf.config.ts apps/web/src/domains/creator/brush/wet-paper/studio-wet-paper-runtime-budget.test.ts
```

시험이 고정하는 것: 결정성(반복·시분할 바이트 일치), 물·안료 장부 보존, 가장자리 짙어짐, 재적심 백런, 갈필 줄무늬 틈, MoXi 번짐, 격자 상한, 레인 등록·탭 노출·실험 단계, 커밋 렌더만 굽기 요청, SVG PNG 결정성, Studio 진입 그래프에서 솔버 제외, WGSL 커널과 CPU 미러 일치.
