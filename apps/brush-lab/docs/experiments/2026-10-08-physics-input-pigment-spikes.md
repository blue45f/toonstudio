# brush-lab 스파이크 5건 결과: 물리엔진·입자 물감·입력 단계·3D 붓털·혼색 (2026-10-08)

- 상태: **기록(실험 결과 보존)**. 구현 상태의 권위는 `apps/brush-lab/README.md`와 `src/lanes/registry.ts`다. 이 문서의 모든 판정은
  **채택 결정이 아니라 스파이크 시점의 권고**이며, 아래 5절의 후속 작업이 끝나기 전에는 어떤 항목도 저장소 코드에 반영되지 않았다.
- 작성: 문서화 작업 DOC-1. 원본은 임시 샌드박스(`/tmp/.../scratchpad/brush/spikes/SP-A … SP-E`)에 있었고, 컨테이너가 회수되면 사라지므로
  구조화 보고서 5종과 요약 지표·대표 이미지만 이 디렉터리에 옮겼다.
- 수치 규약: 이 문서의 모든 수치는 [`2026-10-08-spikes/reports/`](2026-10-08-spikes/reports/)의 구조화 보고서 JSON과
  [`2026-10-08-spikes/metrics/`](2026-10-08-spikes/metrics/)의 지표 파일에서 확인한 값만 옮겼다. 보고서에 없는 수치는 쓰지 않았다.
- 보존하지 않은 것: 스파이크 소스·`node_modules`·큰 원시 JSON·SP-C `out/patch-A+B.diff`·SP-A/C/E의 샌드박스 `report.md`(보고서 JSON이 같은 내용의 요약을 담는다).
  SP-B와 SP-D는 보고서 파일(.md)을 쓰지 못해 JSON의 `summary`가 보고서 본문이다.

## 1. 목적과 제약

**목적.** 사용자 요구는 "다양한 라이브러리를 실험적·모험적으로 테스트하되 **상업적으로 이용 가능한 설계**만"이다. 그래서 스파이크 5건은
(1) 후보 라이브러리·알고리즘을 실제로 돌려 정량 비교하고, (2) 상용 배포 가능성(라이선스·고지 의무)을 설치본 파일로 확인하고,
(3) 채택·보류·거부 판정을 근거와 함께 남기는 것을 목표로 했다. 정책은 [license-policy.md](../license-policy.md)의 절차(3절: 샌드박스 스파이크 → 라이선스 원문 확인 → 채택 결정)를 따른다.

**제약.**

- 상용 라이선스만 채택 후보다. 모호하면 `review`로 두고 법무 검토 전 채택하지 않는다(license-policy 1절). mixbox(CC BY-NC)·LYGIA(Prosperity)·GPL/AGPL 계열은 후보에서 제외했다.
- 방법: 저장소 밖 샌드박스에서 `npm install --ignore-scripts`로 설치(설치 스크립트 실행 금지), **Node 22 단일 스레드**로 측정했다. 저장소 소스는 읽기 전용으로만 참조했다.
- **측정하지 못한 것(전 스파이크 공통)**: 브라우저(Chromium·Firefox·Safari)·모바일·GPU/WebGPU 경로의 비용과 결정성, 교차 기계·교차 브라우저 결정성,
  브라우저 Web Worker(Node `worker_threads`만 측정), 실제 펜 입력과 사람의 손맛. 모든 ms·Mpx/s는 Node 22 값이며 브라우저 성능으로 읽으면 안 된다.
  측정 머신은 4코어 공유 머신(load average 5~15)이라 절대값 신뢰도는 낮고 상대 비교용이다.
- 라이선스 확인 방식 표기: **설치본**은 설치된 패키지의 `LICENSE`와 `package.json`을 직접 읽은 것, **원격**은 crates.io API·GitHub raw 등 외부 조회다.
  설치본으로 확인하지 못한 항목은 아래 표에서 따로 표시한다.

## 2. 결정 레지스터

판정 어휘: `adopt-lane`(레인으로 채택 후보), `adopt-input-stage`(입력 단계 채택 후보), `adopt-engine-module`(`engine/**` 모듈 채택 후보),
`experiment-only`(실험 배지 한정), `defer`(보류), `reject`(거부). 라이선스 검토가 필요한 항목은 `review`를 함께 쓴다.
번들 크기는 esbuild minify 후 gzip(바이트)이며 측정 도구는 스파이크 보고서 기준이다. `-`는 외부 번들이 없는 자체 코드다.
**표의 판정은 스파이크 권고이며 현재 저장소에 반영된 상태가 아니다.**

### A. 2D 물리엔진 (SP-A)

| 항목 | 라이선스(SPDX) / 확인 방법 | 번들(gzip) | 핵심 수치 | 판정 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 자체 2차계 펜 스프링(지면 항력) | 자체 코드 | - | 해석 대비 평균 오차 0.56 px, 지연 15.4 ms, 틱 0.28 µs | adopt-input-stage | 외부 의존 0, 끌림은 상대 감쇠가 아니라 지면 항력이어야 한다는 실측 근거 |
| @dimforge/rapier2d-compat 0.21.0 | Apache-2.0 / 설치본 LICENSE·package.json 확인, wasm 내장 crate는 원격(crates.io) | 1,282,042 | N=128 반경비 표준편차 0.018, 틱 575 µs, 프레임 예산 100% 최대 N 448, 초기화 약 150 ms | adopt-lane | 퍼짐 일관성·dt 스파이크 내성 최고, 단 지연 로딩과 THIRD-PARTY 고지 생성 필요 |
| rapier2d-deterministic-compat 0.21.0 | Apache-2.0 / 설치본 | 1,294,207 | 같은 머신에서 일반 빌드와 해시 동일, wasm +31 KB | experiment-only | 교차 기계 결정성 이점은 이 환경에서 측정 불가 |
| 자체 PBD 붓털(오일러 스프링+PBD) | 자체 코드 | - | N=128 틱 168 µs, 프레임 예산 100% 최대 N 832, 반경비 표준편차 0.263 | adopt-engine-module | 가장 빠르나 밀집 N=128 퍼짐이 불균일, N≤32·폴백용 |
| p2-es 1.2.3 | MIT / 설치본 | 27,119 | 해석 오차 0.53 px, 지연 15.0 ms, 연속 50 ms 틱에서 2.95e12 px 폭주 | experiment-only | 전역 id 카운터 때문에 첫 월드 해시가 달라지고(리셋 필요) 폭주 |
| planck 1.5.0 | MIT / 설치본 | 47,934 | N=128 틱 16,461 µs(최악) | defer | 단일 펜은 자체 구현과 같은 수식, engines node>=24 경고 |
| matter-js 0.20.0 | MIT / 설치본 | 27,731 | 해석 오차 1.56 px, 50 ms 틱 폭주 7.7e4 px | reject | 라이선스가 아니라 기술 사유: 물리 단위 스프링·kinematic·로프 없음 |
| box2d3-wasm 5.2.0 | MIT(래퍼) / 설치본. 번들 Box2D(MIT)·enkiTS(zlib 계열)는 원격, box2cpp는 원격 404로 미확인 | 26,491(JS) + wasm 155 KB(compat) | N=128 틱 1,817 µs, Node 기본 초기화 386~750 ms | defer, review | 패키지에 Box2D·enkiTS 저작권 고지 없음 |
| box2d-wasm 7.0.0 | Zlib(래퍼) / 설치본. 번들 Box2D 2.4(MIT)는 원격 | 77,348 | N=128 틱 3,507 µs, 영 길이 거리 조인트가 목표 앞 0.16 px에서 정지 | defer, review | 패키지에 번들 Box2D 2.4 MIT 고지 없음 |

### B. 입자 유체·물감 (SP-B)

| 항목 | 라이선스(SPDX) / 확인 방법 | 번들(gzip) | 핵심 수치 | 판정 | 근거 |
| --- | --- | --- | --- | --- | --- |
| @box2d/particles 0.11.0 (LiquidFun TS 포팅) | MIT(package.json·LICENSE) + 소스 헤더 Zlib 13개 / 설치본, 원 저장소 google/liquidfun 헤더는 원격 대조 | 74,088(core 포함) | 5k 입자 틱 4.67 ms(water), 해시 5/5 상이, 속도 상한 192 px/s | experiment-only | Math.random 피벗 정렬로 비결정, 균일 불투명 리본뿐, NOTICE에 Zlib 원문 필요 |
| @box2d/core 0.11.0 | MIT / 설치본 | 53,249 | 전이 의존 0, wasm 없음 | experiment-only | particles의 의존 패키지 |
| LiquidFun colorMixing(sRGB 쌍별 교환) | 해당 없음(알고리즘) | - | 노랑+파랑 (0.668,0.748,0.649) 회청색, 저장소 KM은 (0.528,0.697,0.448) 초록 | reject | 감마 공간 성분의 선형 교환이라 물감 혼색이 아님 |
| 자체 MLS-MPM 점탄성 물감 솔버 | 자체 코드(Hu et al. 2018 수식, 코드 복제 없음) | 2,979 | 해시 5+5 동일, 약 220~320 ns/입자/서브스텝, 16.7 ms에 약 3.4k~19k 입자(강성 의존) | adopt-lane | 외부 의존 0, 점탄성·항복 거동 관측, 단 CFL 위반 시 붕괴하므로 clampEvents 감시 필수(실험 레인으로 시작) |
| 농도 t 수송(입자) + 저장소 KM 색 결정 | 자체 코드 | - | 노랑+파랑이 초록(KM 0.528,0.697,0.448) | adopt-engine-module | 입자에는 t만 싣고 색은 기존 engine/pigment가 결정 |
| 입자→이미지 가우시안 스플랫(문턱 알파) | 자체 코드 | - | 평면 리본, 가장자리 매끈 | adopt-lane | 질감은 저장소 종이 단계가 담당 |
| MPM WASM·SIMD·WGSL 이식, 입자→wet 풀 결합 | - | - | 미구현·미측정 | defer | CPU 실험 레인 성과 이후 |

### C. 입력 단계·코너 편차 (SP-C)

| 항목 | 라이선스(SPDX) / 확인 방법 | 번들(gzip) | 핵심 수치 | 판정 | 근거 |
| --- | --- | --- | --- | --- | --- |
| Sumi 1€ + 정점 재방출(수정안 A) + 용량 추정 보정(수정안 B) | 자체 코드 | - | pencil-hb zigzag 128² 2.55→1.26 px, 512² 6.16→0.97 px | adopt-engine-module | #9 코너 편차 FAIL의 원인이 입력 단계 설계 결함(4절) |
| 코너 게이트(메타 단계, 속도 0.2 px/ms 가드) | 자체 코드 | - | 지연형 단계 앞에 붙여 zigzag 편차 128² 1.17~1.56, 512² 0.97~1.37, 비용 +0.3~1.4 µs/표본 | adopt-input-stage | 가드 없이는 저속 손떨림 오탐으로 지터 악화 |
| lazy-brush 2.0.2 | MIT / 설치본 LICENSE·package.json | 956 | 0.5~0.7 µs/표본, 반경 1.8 px에서 지터 기준(0.5 px) 달성 | adopt-input-stage | 코너 게이트와 획 끝 catch-up을 함께 써야 함 |
| 안정화 슬라이더 로그 매핑 B | 자체 코드 | - | 지터 0.738→0.112 px 단조, 지연(512²) 1.7→15.3 ms | adopt-engine-module | 현행 앱 매핑은 s=0에서도 지터 0.335 |
| google/ink-stroke-modeler(저장소 wasm) 입력 단계 | Apache-2.0 / 복사된 LICENSE 두 건의 sha256을 pinned commit의 GitHub raw와 대조(원격) | 48,647(wasm 44,300 + mjs 4,347) | iso 코너 3.55/10.5 px, 지연 15.1 ms | defer, review | Sumi+재방출보다 나은 항이 없고, NOTICE의 wasm sha256 불일치·Emscripten/libc++abi 인벤토리 누락(6절) |
| perfect-freehand 1.2.3(getStrokePoints를 입력 단계로) | MIT / 설치본 | 2,009 | 표본당 약 61 µs(4000표본 말미 약 0.9 ms), O(1) 재귀는 0.12 µs | reject | 표본마다 호출하면 O(n²). 수식만 차용 |
| kalmanjs 1.1.0 | MIT / 설치본 | 1,325 | iso 조건에서 EMA와 수치까지 동일(지연 7.9 ms, 길이 -6.4%) | reject | dt 무시, 이점 없음 |
| 1eurofilter 1.3.0 | package.json BSD-3-Clause, **LICENSE 파일 없음** / 설치본 | 2,137 | 사용 안 함 | review | 법무 확인 전 채택 금지. Sumi 1€는 논문 수식 자체 구현이라 불필요 |
| 자체 등속(CV) 칼만 | 자체 코드 | - | iso 지연 2.4 ms(최저), 코너 오버슈트 1.50/6.76 px | experiment-only | 코너에서 넘침, 코너 게이트와 함께일 때만 |
| 물리 펜(자체 오일러, SP-A 모델) | 자체 코드 | - | 지연 15.8 ms, flick 오버슈트 3.7/14.9 px(ζ=0.55) | experiment-only | 끌림 감각 선택지, ζ≥1은 미측정 |
| Rapier 0.21 물리 펜 입력 단계 | Apache-2.0 / 설치본 | 1,282,042 | 표본당 22 µs(자체 오일러 0.47 µs의 약 47배), 지연 20.1 ms | reject | 점 하나를 끄는 모델에 이점 없음 |
| cornerDeviationPx 지표 정리 | - | - | 31종 중 20종은 입력 통과로도 1.5 px 초과 | defer | 변경은 별도 승인 후(4절) |

### D. 3D 붓털 (SP-D)

| 항목 | 라이선스(SPDX) / 확인 방법 | 번들(gzip) | 핵심 수치 | 판정 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 2D 상면 모델 + 압력→반경 곡선 | 자체 코드 | - | 단조 구간 거듭제곱 r=10.17 p^0.188, RMSE 0.108 u(약 0.43 px) | adopt-engine-module | 3D 결과를 재현하면서 wasm 1.6 MB·초기화 170 ms를 쓰지 않음 |
| @dimforge/rapier3d-compat 0.21.0 | Apache-2.0 / 설치본, wasm 내장 crate는 원격(crates.io) | 1,644,031 | 400 바디 틱 1.83 ms, 초기화 약 172 ms | experiment-only | 550 px/s에서 접촉 끊김, 압력 0.9 이상 좌굴, 격자 단조 46/90 |
| rapier3d-deterministic-compat 0.21.0 | Apache-2.0 / 설치본 | 1,650,831 | 일반 빌드와 해시 동일(44ac97cbe8f37f8f) | experiment-only | 교차 기계 이점 측정 불가 |
| 오프라인 3D 베이크 → 2D 룩업 하이브리드 | 자체 코드 | - | 곡선 피팅·2D 상면 렌더만 검증 | experiment-only | 베이크 도구 품질 미검증 |
| jolt-physics 1.1.0 | MIT / 설치본 LICENSE·JS 헤더. wasm 안 libc++abi 경로는 wasm 문자열 확인 | 948,292(wasm-compat) | 400 바디 틱 3.20 ms, dt 1/30 관통 11틱 | defer, review | wasm에 Apache-2.0 WITH LLVM-exception 코드가 링크됐으나 THIRD-PARTY 고지 없음 |
| cannon-es 0.20.0 | MIT / 설치본 | 36,084 | 400 바디 틱 23.48 ms, dt 1/30 폭주(5.5e8 u) | reject | 라이선스가 아니라 성능·안정성 사유 |
| @babylonjs/havok(**미설치**) | npm 메타 표기 MIT(원격), **설치본 미확인**, GitHub LICENSE 원문 404 | - | 측정 안 함 | defer, review | 바이너리 엔진 약관이 래퍼 MIT와 같은지 확인 못 함, 정책상 이름으로 금지 |

### E. 혼색 (SP-E)

| 항목 | 라이선스(SPDX) / 확인 방법 | 번들(gzip) | 핵심 수치 | 판정 | 근거 |
| --- | --- | --- | --- | --- | --- |
| 자체 KM 밴드 근사(8밴드 기본, 6밴드 저사양) | 자체 코드, 기저 표는 spectral.js(MIT) 파생이라 MIT 고지 필요 | 1,728(두 표 포함) | spectral.js 대비 평균 ΔE00 0.45(8밴드, p95 2.01), 6밴드 0.92, 약 3 Mpx/s | adopt-engine-module | 파랑+노랑=초록 재현, 외부 의존 0, 결정적 |
| 3채널 KM 조정형(mixKm3Tuned) | 자체 코드 | 286 | 평균 ΔE00 2.45(p95 10.16, max 33.97), 18.9 Mpx/s | adopt-engine-module | 속도 우선 계층, 기존 kmMixRgb(평균 11.46) 교체 검토 |
| spectral.js 3.0.0 | MIT / 설치본 LICENSE·package.json | 6,209 | 0.12~0.25 Mpx/s | adopt-lane(오프라인·골든 전용), review 메모 | 스펙트럼 데이터가 Burns LHTSS 변형 유래라는 README 서술 때문에 데이터 출처 법무 확인 메모 1건 |
| culori 4.0.2 OKLab 혼합 | MIT / 설치본 LICENSE·package.json | 6,618(fn+oklab+lrgb) | 자체 OKLab과 전 쌍 ΔE 0 | reject | 라이선스 문제 아님, 자체 수 줄과 같고 초록이 안 됨 |
| 선형 광 혼합·sRGB 감마 혼합 | 해당 없음 | - | 선형 39.9, 감마 LUT 25.9 Mpx/s | experiment-only | 물감 혼색이 안 되는 기준선 |
| 합성 4안료 2상수 KM·RGB 역변환 | 자체 코드 | - | 임의 sRGB 근사 평균 ΔE00 8.18 | defer | 파장 격자·곡선이 가정이라 판정 불가 |
| Mixbox·LYGIA 계열 | CC BY-NC / Prosperity | - | spectral.js 소스에 Mixbox 식별자 grep 0건 | reject | 저장소 정책상 금지 |

## 3. 스파이크별 결과

### A. SP-A 2D 물리엔진 8종

**질문.** 2D 물리엔진을 (1) 관성감 있는 물리 펜과 (2) 붓털 다발(N=8/32/128)에 쓸 때 어떤 것이 정확·빠르고 상용으로 쓸 수 있는가.

**방법.** Rapier(일반/deterministic), planck, matter-js, p2-es, box2d3-wasm, box2d-wasm과 자체 오일러+PBD를 공통 어댑터 `PhysicsWorld2D` 뒤에 두고,
저장소 nib-flex 직접 호출을 함께 측정했다. 펜 시나리오 6 fixture(추적 지연·오버슈트·코너·지터·해석 오차), 붓털 N 스윕, dt 스파이크, 결정성 해시(메인·`worker_threads`·자식 프로세스), 번들·초기화 시간.

**핵심 수치.**

1. 스프링 감쇠를 포인터와 펜의 상대 속도에만 걸면 추적 지연이 0.7~1.1 ms로 사라진다. 지면 항력 λ=2ζωn(약 83/s)으로 바꾸자 해석 기준해(15.1 ms)에 맞는 11.5~15.4 ms가 나왔다.
2. 영 길이 스프링은 Box2D 계열 거리 조인트로 만들 수 없다(box2d-wasm은 목표 앞 0.16 px에서 정지, planck은 최소 길이 0.005 m). 어댑터가 힘으로 대체하면 자체 구현과 같은 수치(0.56 px, 15.4 ms)가 나온다.
3. 붓털 N=128 반경비 표준편차: Rapier 0.018, box2d3 0.019, matter 0.032, planck 0.045, box2d-wasm 0.049, p2 0.062, 자체 PBD 0.263.
4. 100 ms dt 스파이크(N=32) 최대 늘어남: Rapier 1.2×R, planck·box2d-wasm 5.0, 자체 5.3, box2d3 7.9, p2 15.7, matter 18.4. 50 ms×10 연속 틱 폭주는 matter 7.7e4 px, p2 2.95e12 px(폭주 후 복귀).
5. N=128 틱 비용(µs): native 168, p2 401, matter 411, rapier 575, box2d3 1,817, box2d-wasm 3,507, planck 16,461.
6. 결정성: 8종 모두 메인·`worker_threads`·자식 프로세스 해시 동일. p2-es만 기본 상태에서 첫 월드 해시가 달랐고 `Body._idCounter`·`Shape.idCounter` 리셋 후 일치.

**대표 이미지.** CPU 참조 래스터러 비교 시트(N=32, zigzag·spiral·fast-flick × 10열).

![SP-A 붓털 N=32 비교 시트](2026-10-08-spikes/sp-a-sheet-n32.png)

직접 열어 확인한 내용: 물리 열은 붓털 한 올의 세로 줄무늬와 꺾이는 지점의 진한 뭉침이 보이고, RIGID(물리 없음) 열은 옅은 회색 띠, 맨 오른쪽 REPO-SCALAR는
털 질감 없는 균일한 외곽선이다. 물리 엔진 8종 사이의 차이는 이 해상도에서 육안으로 거의 구분되지 않는다(보고서의 휘도 차 수치와 일치).

**한계.** Node 22 단일 스레드 값만이다. Rapier 일반 대 deterministic의 교차 기계·교차 브라우저 결정성은 측정하지 못했다(같은 머신에서 해시 동일).
정지 이미지라 시간축 손맛은 평가하지 못했다. 샌드박스 자체 구현은 f64이며 `engine/**` 이전 시 `Math.fround` 미러로 재측정해야 한다. 프레임당 허용 N은 ±20%, 펜 틱 비용은 ±50% 흔들린다.

**제안(미반영).** 순수 TS는 `src/engine/physics/world2d/`, 외부 패키지 어댑터는 `src/lanes/physics/`, 시나리오·지표는 `src/bench/physics/`에 두고
`boundary.test.ts`에 외부 물리 패키지 허용 범위 규칙을 추가한다. 의존성 추가는 통합 담당이 한다.

### B. SP-B 입자 유체·물감

**질문.** LiquidFun(`@box2d/particles`)과 자체 MLS-MPM이 번짐·젖은 물감·혼색에 쓸 만한가. 저장소 wet(LBM D2Q9)과 어떻게 다른가.

**방법.** LiquidFun TS 포팅과 자체 2D MLS-MPM(`mpm.ts` 562줄, Maxwell 이완+항복)을 같은 장면에서 틱 비용, 결정성(해시 5회), 폭주, 단일 획·두 색 혼합·번짐 시나리오로 측정하고 저장소 CPU 참조 래스터러 결과와 PNG로 대조했다.

**핵심 수치.**

1. LiquidFun 틱(p50, 1k/5k/20k 입자): water 0.83/4.67/18.2 ms, colorMixing 0.88/5.27/23.2 ms. 16.7 ms에 water 약 15k 입자(p95 기준 약 10k).
2. MLS-MPM 프레임(128², K=6e4, 8서브) 1.83/9.58/38.2 ms, 16.7 ms에 약 8.7k 입자. 비용은 입자 수×서브스텝 수가 지배하고 격자 크기와 거의 무관하다.
3. 결정성: LiquidFun 그대로는 같은 프로세스 5개·별도 프로세스 5개 모두 해시가 다르다(위치 차 최대 0.30 px). `Math.random`을 시드 Pcg32로 바꾸면 5/5 동일(257550f5a0cb7e68). MLS-MPM은 패치 없이 5+5 동일(1995fc1eca6f939e).
4. 폭주: 두 솔버 모두 NaN 0. MPM은 4서브(CFL≈1.04)에서 붕괴(안전 클램프 1,310,038회)하며 NaN이 아니라 클램프에 가려진다. 서브스텝 고정과 `clampEvents` 감시가 필수.
5. 번들: LiquidFun core+particles 74,088 B gzip 대 MLS-MPM 2,979 B gzip.
6. 번짐: 획 반폭(중심선 거리 p95) LiquidFun 7.3→9.0 px, MPM 7.8→16.5 px(2 s). 두 솔버 모두 둥근 균일 확장이라 수채의 가지치기·가장자리 진해짐은 나오지 않는다.

**대표 이미지.** 노랑 line + 울트라마린 curve 혼색, 행 = 혼색 방식, 열 = 시간(보고서의 t=0/0.5/1/2 s).

![SP-B LiquidFun 혼색 비교](2026-10-08-spikes/sp-b-vb-mix-rows.png)

직접 열어 확인한 내용: 1행(LiquidFun colorMixing)은 겹친 구간이 회청색, 2행(혼합 끔)은 두 색 입자가 서로 끼어든 점박이, 3행(농도 t만 수송하고 저장소 KM으로 색 결정)은 초록이다.
보고서의 견본표 수치(LiquidFun 회녹회색 대 KM 초록)와 이미지가 맞는다.

**한계.** 브라우저·GPU 경로 미실행. 입자 결과는 평면 균일 리본이라 최종 이미지로는 저장소 래스터러보다 품질이 낮고 종이 결·가장자리 농담은 없다. 저장소 LBM과의 정량 대조는 하지 않았고(콜드 1회 시간과 PNG 인상만 비교), 입자→wet 풀 결합은 만들지 않았다.
`@box2d/particles@0.11.0`은 `package.json`의 `main`(./dist/index.js)이 tarball에 없어 deep import로 우회했다(0.10.0은 정상, 재측정은 하지 않음). LiquidFun 알고리즘 특허 유무는 확인하지 못했다.

### C. SP-C 입력 단계·코너 편차

**질문.** 증빙 리포트 37개의 `handfeel.cornerDeviationPx` FAIL(2.5 px > 1.5 px)은 엔진 렌더 버그인가, 입력 보정인가, 지표 문제인가. 입력 단계 후보 중 어느 것이 좋은가.

**방법.** 1부는 cpu-reference pencil-hb zigzag 128²에서 재현하고 한 요인씩 바꿔 분해한 뒤, 저장소 사본에 수정안을 적용해 효과·부작용을 측정했다.
2부는 `InputStage` 인터페이스 위에 raw, Sumi 1€(현행·앱 슬라이더·정점 재방출), 제품 ema/spring, ink-stroke-modeler(저장소 wasm), lazy-brush, perfect-freehand, kalmanjs, 자체 CV 칼만, 물리 펜(자체 오일러·Rapier), 코너 게이트 메타 단계 등 27종을 fixture 9종×{128², 512²}로 측정했다.

**핵심 수치.**

1. 재현: pencil-hb cornerDeviationPx 2.546 px, 카탈로그 31종 중 27종이 1.5 px 초과(4절에서 분해).
2. 입력 단계 27종(iso 지터 ≤0.5 px 조건) 코너 편차 128²/512²: Sumi+재방출 1.22/0.92(PASS), ema·perfect-freehand·kalmanjs 3.29/9.8(FAIL, 서로 수치 동일), ink-stroke-modeler 3.55/10.5, lazy-brush(반경 1.8 px) 2.89/2.84. 코너 게이트를 앞에 붙인 조합은 전부 1.17~1.56/0.97~1.37.
3. 지연(iso, curve fixture): CV 칼만 2.4 ms 최저, ema 7.9, ink-stroke-modeler 15.1, 물리 펜 15.8/20.1.
4. 비용: perfect-freehand 라이브러리 표본당 약 61 µs(4000표본 말미 약 0.9 ms) 대 O(1) 재귀 0.12 µs. Rapier 물리 펜은 22 µs 대 자체 오일러 0.47 µs.
5. 결정성: 27개 단계 모두 새 인스턴스 2회·reset 재사용 해시 일치, 3회 실행에 걸쳐 405/405 일치. Sumi 복제는 저장소 InputPipeline과 9 fixture 전 표본 최대 절대 차이 0 px.
6. 슬라이더: 측정한 모든 가변 단계에서 지터가 s=0..100(21점)에서 단조 감소. 현행 앱 매핑은 s=0에서도 지터 0.335 px라 "끔"이 아니다.

**대표 이미지.** zigzag 정점 확대(512² 캔버스, 64 px 크롭 ×4, 붉은 선 = 의도 경로).

![SP-C 지그재그 정점 확대 시트](2026-10-08-spikes/sp-c-sheet-zoom512.png)

직접 열어 확인한 내용(왼쪽 위부터 RAW, SUMI, SUMI-BF, PRODUCT-EMA / ISM, ISM+CG, LAZY, LAZY+CG / PF, PF+CG, KALMAN-CV, PHYS-NATIVE+CG): RAW는 정점이 붉은 의도선과 일치,
SUMI는 정점이 평평하게 잘리고 한참 밀리며, SUMI-BF(정점 재방출)는 정점까지 복원된다. PRODUCT-EMA·ISM·PF·LAZY는 둥글게 깎이고, 코너 게이트(CG)를 붙인 열은 정점이 복원되며,
KALMAN-CV는 정점 위로 큰 돔이 생긴다. 보고서의 서술과 일치한다. 용량 때문에 원본(3.4 MB)을 64색 팔레트 PNG로 변환했다(16 KB, 내용 동일).

**한계.** 합성 가우시안 손떨림(시드 고정)이며 실제 펜·터치·마우스 입력은 측정하지 못했다. 수정안을 적용한 저장소 상태의 전체 테스트·typecheck·eslint는 실행하지 않았다(사본에서 engine+bench+lanes 684건만 실행).
GPU 레인·libmypaint·hokusai 레인 패리티에 주는 영향은 측정하지 못했다. 지연은 속도 의존이라 같은 설정이 128²에서 약 9 ms, 512²에서 약 4 ms다.

### D. SP-D 3D 붓털

**질문.** 압력→붓털 퍼짐을 3D 물리(캡슐 체인 K=24×S=4, 구형 조인트+각 스프링, kinematic 핸들 높이=압력, 종이 평면)로 만들면 2D 곡선 모델보다 나은가. 구성하기 쉬운가.

**방법.** Rapier3D 일반/deterministic, Jolt(wasm-compat), cannon-es로 정적 발자국 스윕(압력 0.05~1.0, 3구성), 파라미터 격자 탐색, 2D 곡선 피팅, 짧은 획 렌더(curve·slow-pressure-ramp·fast-flick), 속도 의존 끌림, 비용·확장성, dt 안정성, 결정성, 번들을 측정했다.

**핵심 수치.**

1. 휴지 굽힘 14도·벌어짐 8도·6 Hz 구성(A-curved)에서 Rapier 힘 가중 RMS 반경이 압력 0.05→0.7에서 5.69→9.46 u로 단조 증가하고, 0.9 이상은 가닥 좌굴로 7.10으로 꺾인다. 곧은 가닥(B)은 2.4~2.9 u로 압력에 거의 무반응.
2. 격자: Rapier 정적 90조합 중 단조 46개(퇴화 5 포함). 굽힘 격자에서 반경-압력 Spearman≥0.9는 Rapier 9/32, Jolt 3/32. A·C 구성은 격자에서 골라낸 것이라 선택 편향이 있다(실질 단조 41/90).
3. 단조 구간(p≤0.7)의 2D 거듭제곱 곡선 r=10.17 p^0.188이 RMSE 0.108 u(약 0.43 px)로 3D를 재현한다. 전체 구간은 어떤 곡선도 0.89~1.04 u 어긋난다.
4. 느린 획(100~200 px/s)에서만 끌림이 보이고(Rapier 202 px/s 중앙값 -6.4 px), 553 px/s에서는 접촉 틱이 79%로 줄고 부호가 뒤집힌다. Jolt는 빠른 획에서 이탈(maxRel 47 u).
5. 틱 비용(48/200/400 바디): Rapier 0.22/0.91/1.83 ms, Jolt 0.45/2.04/3.20, cannon 1.88/9.01/23.48. dt 1/30: Rapier 양호, Jolt 관통 11틱, cannon 폭주.
6. 번들(gzip): Rapier3D 1,644,031, Jolt wasm-compat 948,292(분리형 JS 133,721 + wasm 747,582), cannon 36,084. 초기화 Rapier 약 172 ms, Jolt 100~150 ms.

**대표 이미지.** 열 = Rapier3D 접촉 dab / Jolt 접촉 dab / 2D 상면(곡선 피팅 반경), 행 = curve / slow-pressure-ramp / fast-flick.

![SP-D 3D 대 2D 획 비교 시트](2026-10-08-spikes/sp-d-strokes-sheet.png)

직접 열어 확인한 내용: 3D 열은 시작점의 털끝 고리와 짧게 끊긴 선·덩어리뿐이고 curve의 오른쪽 S 꼬리는 거의 없다. fast-flick은 3D가 작은 덩어리와 희미한 꼬리(Jolt는 점 몇 개)인 반면 2D 열은 24가닥 평행선이 곡선을 따라 매끄럽게 퍼진다.
slow-pressure-ramp에서 3D는 가닥이 엇갈리고 중간에 짙은 덩어리가 생기며 2D는 고른 방추형이다.

**한계.** dab 반지름 1.7 px, flow=0.22·min(1,f/p90)은 제품 값이 아닌 시험 설정이다. Jolt 접촉력은 뿌리 람다 대용이라 Rapier와 같은 정확도의 비교가 아니다. 약 550 px/s에서 접촉을 유지하는 구성은 찾지 못했다(더 넓은 탐색 미실시).
소프트바디·Rapier 다중체 조인트, 오프라인 베이크 하이브리드의 실제 품질은 시도하지 못했다. 교차 기계 결정성은 측정하지 못했다.

### E. SP-E 혼색

**질문.** 물감 혼색(파랑+노랑=초록, 흰색 틴트의 채도 보존)을 실시간 루프에서 쓸 수 있는 방식은 무엇이며, 기존 저장소 `kmMixRgb`와 spectral.js·culori는 어떤가.

**방법.** 8쌍 × 9모델 × 11단계 스와치 그리드, spectral.js 3.0.0 출력과의 CIEDE2000(ΔE00) 정확도(훈련 seed 20261008, 검증 seed 777 무작위 1500쌍), KM 밴드 수 스윕, 3채널 KM 변형 24조합, 1M 픽셀 처리량(5회), 결정성 해시, 번들 크기를 측정했다.
**정확도 기준은 spectral.js 출력이며 실제 안료 측정이 아니다.**

**핵심 수치.**

1. 검증 1500쌍 평균 ΔE00(대 spectral.js): 8밴드 0.45(p95 2.01, max 7.89), 6밴드 0.92, 10밴드 0.23, 16밴드 0.05. 대조군 sRGB 감마 5.37, OKLab 6.77, 선형 8.76, **저장소 kmMixRgb 11.46**.
2. 파랑+노랑 t=0.5: spectral.js #3d933e, 8밴드 #42933e, 6밴드 #50912f, KM3조정 #719201, 저장소 KM #013001, OKLab #76827b, 선형 #b99b60, 감마 #7e7942.
3. 3채널 KM 변형 최선(반사율 하한 0.01+휘도 가중): 훈련 2.40, 검증 평균 2.45(p95 10.16, max 33.97).
4. 처리량(best Mpx/s, 1M 픽셀): 램프 LUT 조회 97.7, 선형 39.9, 감마 LUT 25.9, KM3조정 18.9, 6밴드 3.79, 8밴드 2.96, 저장소 kmMixRgb 1.52, OKLab 1.44, spectral.js 0.12(픽셀마다 생성)/0.25(Color 캐시).
5. 결정성: 8개 모델 모두 5000쌍 Float32 FNV 해시가 같은 프로세스 반복·순서 역전·별도 프로세스 2회에서 동일.
6. 번들: spectral.js 6,209 B gzip, culori 전체 16,046 B(fn+oklab+lrgb만 6,618 B), 엔진 후보 1,728 B(mixKm3Tuned만 286 B). premultiplied 값을 straight로 오용하면 ΔE00 15.55 어긋난다.

**대표 이미지.** 8쌍 블록(위부터 파랑+노랑, 빨강+초록, 마젠타+시안, 흰+파랑, 흰+빨강, 흰+노랑, 어두운 청록+흰, 검정+흰) × 9행(모델) × 11열(t=0→1).
행 순서는 스파이크 소스의 `MODELS` 배열 기준: 1 sRGB 감마, 2 선형, 3 OKLab(자체), 4 OKLab(culori), 5 저장소 kmMixRgb, 6 KM3조정, 7 6밴드, 8 8밴드, 9 spectral.js.

![SP-E 혼색 그리드 전체](2026-10-08-spikes/sp-e-grid-all.png)

직접 열어 확인한 내용: 파랑+노랑 블록의 1~4행은 회청색에서 회갈색·올리브로 가며 초록이 없다. 5행(저장소 KM)은 t=0.1~0.8이 거의 검은 초록이다가 끝에서 진초록이다.
7~9행은 청록을 거쳐 초록·연두로 이어지고 8행과 9행이 거의 구분되지 않는다. 마젠타+시안 블록의 5행은 거의 전 구간이 순수 파랑 한 색으로 평탄하다. 흰색 틴트 블록의 5행은 흰색에서 시작해도 밝아지지 않는다.
이미지의 행 라벨은 점 개수뿐이라 모델 대응은 위 소스 순서에 의존한다(이미지 자체로는 확인할 수 없다).

**한계.** 브라우저(V8)·WGSL·WASM-SIMD 성능과 실제 안료 측정 대비 정확도는 측정하지 못했다. 속도는 load average 9~11 환경 best-of-5이며 재측정마다 ±30% 변동했다.
4안료 2상수 KM은 파장 격자(380 nm+10 nm×i)와 안료 곡선이 가정·합성이라 정확도 판정이 불가능하다. 밴드 위치 최적화를 하지 않아 6밴드가 7밴드보다 좋은 것은 등간격 선택의 우연일 수 있다.
spectral.js 기저 스펙트럼의 데이터 출처(Burns LHTSS 변형) 권리는 법무 확인 대상이다. 엔진 간 비트 일치(Chrome·Firefox·Safari)는 미검증이다. 개별 grid PNG 중 white-red·white-yellow·black-tint는 보고서 작성자가 따로 열지 않았다(이 문서는 전체 그리드를 직접 열어 확인).

## 4. 입력 단계 #9 지그재그 코너 편차 FAIL: 원인 분해와 수정안 A+B

**배경.** 증빙 리포트 37개의 `handfeel.cornerDeviationPx`가 FAIL(2.5 px > 기준 1.5 px)이었다(상태·번호는 SP-C 보고서의 #9). 같은 절차(선폭 곡선 32 정류장 → 평균/2 → `cornerAccuracyFromImage`, 시드 1)로 재현했다.

**원인 분해(pencil-hb zigzag 128², 한 요인씩 변경).**

| 요인 | 값(px) | 의미 |
| --- | --- | --- |
| 기본 입력 경로 전체 | 2.546 | 재현값(문서의 2.5 px와 일치) |
| 입력을 통과시킨 경우(raw) | 1.251 | 입력 통과 바닥 |
| 입력 보정 기여 | 1.295 | 2.546 − 1.251 |
| corner-preserve를 끈 경우 | 4.651 | corner-preserve가 이미 약 3.4 px를 복구 |
| dab 간격·종이·테이퍼·표본화 | 0.066·0.078·0.004·0.014 | 렌더 합 약 0.16 px |

결론: **엔진 렌더 버그가 아니라 입력 보정이 원인**이다. 1€ 필터가 정점을 지연 위치로 내보내고 corner-preserve는 정점 다음 표본만 raw로 고정할 뿐 정점 자체를 복원하지 않는다.
경로 수준 편차(128²/256²/512² = 1.48/2.96/5.87 px)는 fixture 속도(0.356/0.71/1.42 px/ms)에 정확히 비례해 정점 유효 지연이 약 4.1 ms로 일정하다.
fixture는 512² 기준 설계이고 128²는 속도가 1/4이라 현행 결함을 과소평가한다(512² 기본 입력 6.16 px).
엔진·입력 없이 지표만 적용한 해석적 폴리라인의 바닥은 0.2~0.64 px(선폭 8 px 128²만 1.19)라, pencil-hb 2.5 px의 원인은 지표 식이 아니다.

**설정만으로는 해결되지 않는다.** 정점 재방출 없이 minCutoff 30 Hz·β 0.12까지 올려도 512² 2.52 px이고 tremor 지터는 0.738 px로 기준 0.5 px를 넘는다. 편차 ≤1.5와 지터 ≤0.5를 동시에 만족하는 설정이 없다.

**수정안(요약만 기록, diff는 첨부하지 않음).**

- **수정안 A — 정점 재방출**: `engine/input/corner-preserve.ts`에 `vertexEmitTimeMs`·`VERTEX_BACKFILL_MIN_PX`(0.25)·`VERTEX_BACKFILL_MIN_SPEED_PX_PER_MS`(0.2)를 추가하고,
  `input-pipeline.ts`의 `model()` 모서리 분기에서 `backfillVertex()`를 불러 직전 raw 정점을 모서리 직후 표본보다 먼저 commit한다. 속도 0.2 px/ms·밀림 0.25 px 가드로 저속 손떨림 오탐을 막는다. `input-pipeline.test.ts`에 3건을 추가한다.
- **수정안 B — 용량 추정 보정(A의 전제)**: `stroke-pipeline.ts`의 `emitSamples`에서 `prevX/prevY`를 직전 배치 마지막 위치로 시작해 배치 간 연결 구간을 경로 길이에 포함한다.
  별건 결함이다: fast-flick 512²에서 4/31 프리셋(pencil-hb·pencil-mechanical·ink-g-pen·ink-maru-pen)이 `StrokeBudgetExceededError`로 실패하고(1024² 6/31, 128²·256² 0/31), 마우스형 1.5 px/ms@60 Hz 이상 입력도 9/9 실패한다. 수정안 B로 0/31·0/9가 된다.

**기대 수치(저장소 사본에서 실측, 시드 1).**

| 항목 | 수정 전 | 수정 후 |
| --- | --- | --- |
| pencil-hb zigzag 128² | 2.55 px (FAIL) | 1.26 px (PASS) |
| pencil-hb zigzag 512² | 6.16 px | 0.97 px |
| ballpoint | 2.06 px | 0.44 px |
| ink-maru-pen | 1.82 px | 0.61 px |
| 경질 9종 입력 초과분 | 1.0~1.9 px | ≤ 0.17 px |
| 오버슈트 | 0 | 0 유지 |
| 모서리 없는 fixture 해시 | - | 전부 동일(zigzag만 표본 +5) |
| 저속 손떨림 168획(σ 0.1~1.2 px × 24시드) 오탐 | 가드 전 3~4회/획 | 가드 후 추가 표본 0 |
| 31개 프리셋 중 FAIL(>1.5 px) | 27 | 19 |

**남는 문제와 위험.**

- 수정 후에도 31개 중 19개는 FAIL이다. 광폭·연질·습식·텍스처 프리셋은 입력을 통과시켜도 4~17 px라 지표가 입력을 게이트하지 못한다. 지표 완화로 덮지 않고 적용 가능성 게이트나 "입력 통과 대비 초과분" 판정을 별도 승인 후 정리한다(초과분 기준이면 base 7/31 FAIL·수정안 0/31 FAIL, 최대 0.53 px).
- 속도 가드 때문에 128² corner-square(0.16 px/ms)는 개선되지 않는다. watercolor-wet zigzag 512²는 오버슈트가 0→1.97 px로 임계(1.0)를 넘는다(이 프리셋은 편차가 8.8 px라 어차피 지표 부적합 영역).
- 수정안 A는 정점 직전 raw 점을 출력에 추가하므로 픽셀 해시 스냅샷 10건(surface 2, wet-presets 5, wet-presets-large 2, cpu-reference-lane 1)이 의도적으로 바뀐다. 습식 GPU 미러 명세 §9.3의 합성 지그재그 CPU 기준 해시와 증빙 리포트 37개도 재생성 대상이다.
- 수정안 A만 적용하면 `StrokeBudgetExceededError`가 늘어난다(사본의 모의 GPU 레인 테스트 15건 실패). **B와 반드시 함께 적용**해야 한다.
- **미검증**: 수정안을 저장소에 적용한 상태의 전체 테스트·typecheck·eslint·`harness:verify`, 브라우저·GPU 레인 패리티 영향. 이 수치는 저장소 사본에서 얻은 것이고 저장소는 수정되지 않았다.
- 패치 diff(`out/patch-A+B.diff`)는 문서에 싣지 않았고 샌드박스에만 있다. BL-1c 착수 전에 샌드박스가 회수되면 SP-C 재작업이 필요하므로 착수 담당이 먼저 확보해야 한다(5절 표 참고).

## 5. 후속 작업과 상태

아래는 모두 **계획**이다. 구현·반영된 것으로 읽으면 안 된다.

| 작업 | 상태 | 내용 | 비고 |
| --- | --- | --- | --- |
| BL-1b | 진행 중 | 획 색 계약(전 레인), 배치 용량 추정 수정, 그리기 화면 색 연결 | 수정안 B와 같은 영역(`stroke-pipeline.ts`)을 다룬다. SP-C 수정안 B와의 중복·충돌은 BL-1c에서 확인 |
| BL-1c | 예정 | 입력 보정 패치(수정안 A+B 적용, 해시 스냅샷 10건 재생성, §9.3 기준 해시·증빙 리포트 재생성, 128²·512² 병기) | 저장소에 적용한 상태의 `harness:verify`·`typecheck:brush-lab`·`test:brush-lab` 필요. 브라우저 재검증 필요 |
| BL-3 물리 펜 입력 단계 | 예정 | 자체 오일러 펜 스프링(지면 항력)을 `engine/physics`에 `Math.fround` 미러로 이식, 코너 게이트·획 끝 catch-up과 함께 | ζ≥1 설정은 미측정 |
| BL-3 Rapier2D 붓털 레인 | 예정 | `src/lanes/physics/`에 동적 import 레인, 실험 배지, THIRD-PARTY 고지(cargo-about 등) | 브라우저 측정 선행 필요, `boundary.test.ts` 규칙 추가는 통합 담당 |
| BL-3 MLS-MPM 레인 | 예정 | `engine/fluid/mpm-2d.ts`·`particle-splat.ts`, 실험 레인, 서브스텝 고정·`clampEvents` 가드(`LaneUnavailableError`) | 브라우저 미검증, wet 풀 결합은 별도 |
| BL-3 KM 혼색 | 예정 | `engine/pigment/km-mix.ts`(8밴드 기본, 6밴드 저사양)와 골든 테스트, spectral.js MIT 고지 | spectral.js는 의존성 추가가 필요하면 통합 담당 요청 |
| 라이선스 정리 | 예정 | box2d 계열·Jolt·Havok 법무 검토, 1eurofilter LICENSE 확인, ink-stroke-modeler NOTICE 정정(6절), Zlib·Rapier crate THIRD-PARTY 고지 | `review` 해소 전 채택 금지 |

## 6. 라이선스 `review` 항목 요약

| 항목 | 사유 |
| --- | --- |
| box2d3-wasm 5.2.0 | 패키지 LICENSE에 번들된 Box2D(Erin Catto)·enkiTS(Doug Binks) 고지 없음, box2cpp 라이선스 원격 404로 미확인 |
| box2d-wasm 7.0.0 | 패키지에 번들된 Box2D 2.4 MIT 고지 없음 |
| jolt-physics 1.1.0 | wasm에 libc++abi(Apache-2.0 WITH LLVM-exception) 코드 흔적, THIRD-PARTY 고지 없음(보수적 판정) |
| @babylonjs/havok | 미설치. 바이너리 약관이 래퍼 MIT와 같은지 확인 못 함. 정책상 이름으로 금지 |
| 1eurofilter 1.3.0 | npm 패키지에 LICENSE 파일 없음(package.json만 BSD-3-Clause) |
| ink-stroke-modeler(저장소 wasm) | SP-C 보고서 기준 NOTICE의 wasm sha256 불일치와 Emscripten/libc++abi 인벤토리 누락. DOC-1이 이 중 sha256 불일치를 직접 확인했다(`NOTICE`는 `0b65a64a…`, 실제 바이너리·`THIRD_PARTY_INVENTORY.json`·`INTEGRITY.sha256`은 `9f1478b1…`). 정정은 `packages/**` 담당 몫이며 이 문서 작업에서는 파일을 고치지 않았다 |
| spectral.js 3.0.0(데이터 출처) | MIT는 확인했으나 스펙트럼 기저 데이터의 출처(Burns LHTSS 변형) 권리는 법무 확인 메모 |
| Rapier wasm 내장 crate | crate 라이선스는 설치본이 아니라 crates.io API로 확인했고, 저작권 고지가 패키지에 없어 배포 시 THIRD-PARTY 고지 생성 필요 |

## 7. 원본 자료

- 구조화 보고서: [`2026-10-08-spikes/reports/SP-A.json`](2026-10-08-spikes/reports/SP-A.json) … [`SP-E.json`](2026-10-08-spikes/reports/SP-E.json)
- 요약 지표(스파이크별 소형 JSON): [`2026-10-08-spikes/metrics/`](2026-10-08-spikes/metrics/) — 대형 원시 JSON(SP-A `pen-traj.json` 1.2 MB, SP-D `static-sweep.json` 3.3 MB, SP-C `metrics.json` 296 KB 등)은 올리지 않았다.
- 레퍼런스 원장: [labs-brush-engine-references-2026-10-01.md](../../../../docs/engines/labs-brush-engine-references-2026-10-01.md) 7절(2026-10-08 스파이크 평가 라이브러리)
