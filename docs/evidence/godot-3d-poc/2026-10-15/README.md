# Godot 3D PoC 측정 증거 (2026-10-15)

- 문서 상태: `current` — 2026-10-15에 수행한 측정의 원본 기록이다(역사 문서). 해석과 결론은 [평가 보고서](../../../reports/godot-3d-evaluation-2026-10-15.md)와 [ADR-0028](../../../adr/0028-godot-3d-adoption-modes.md)에 있다.
- 생성 도구: [`tools/godot-3d-poc`](../../../../tools/godot-3d-poc/README.md)의 `measure/run.mjs`, `measure/parity.mjs`, `measure/coep-probe.mjs`, `native/run-native.sh`, `native/probe-render.sh`, `native/probe-ext.sh`.
- 표로 보기: `node tools/godot-3d-poc/measure/summarize.mjs docs/evidence/godot-3d-poc/2026-10-15/results-4.4.1-*.json` (여러 파일을 주면 스위트 단위로 합치고 뒤의 파일이 같은 스위트를 덮어쓴다)

## 파일

| 파일 | 내용 | 크기 (B) | 측정 시작 (UTC) | 1분 `loadavg` 범위 |
| --- | --- | ---: | --- | --- |
| `coep-probe-4.4.1.json` | 부모 COEP 아래 iframe 차단 이유(CDP `blockedReason`) | 1,095 | — | — |
| `ext-probe-4.4.1.json` | 같은 픽스처 11개를 Godot 4.4.1 네이티브 `--headless` 와 Xvfb + Mesa 에서 연 결과 | 7,050 | — | — |
| `ext-probe-4.7.json` | 같은 픽스처 11개를 Godot 4.7 네이티브 `--headless` 와 Xvfb + Mesa 에서 연 결과 | 7,222 | — | — |
| `fixtures-manifest.json` | 측정에 쓴 합성 GLB 11개의 크기·sha256·KTX2 헤더 값(Basis 모드 확인) | 2,952 | — | — |
| `native-capture-orion.json` | 같은 프로젝트를 네이티브 엔진(Xvfb + Mesa llvmpipe)으로 캡처한 시간·모델 통계 | 1,415 | — | — |
| `parity-orion-4.4.1.json` | 웹 캡처와 네이티브 캡처 패스 PNG의 픽셀 차이 | 1,905 | — | — |
| `render-probe-4.4.1.json` | `--headless` 와 Xvfb + Mesa 의 렌더 가능 여부 프로브 | 1,343 | — | — |
| `reproducibility-4.4.1.json` | 빈 캐시에서 fetch-engine.sh -> build.sh 재실행의 산출물 sha256 비교 | 2,263 | — | — |
| `results-4.4.1-b1.json` | 스위트 `sizes`·`cold`(변형을 순서대로 실행한 원본)·`warm`·`coi` | 32,769 | 2026-10-15T02:46:29.722Z | 5.98~10.83 |
| `results-4.4.1-b2.json` | 스위트 `compare`·`glb`·`ext`(픽스처 9개, b6로 대체됨)·`twopoint`·`bridge`(대체됨)·`capture`·`bench` | 77,806 | 2026-10-15T03:23:26.483Z | 2.57~4.69 |
| `results-4.4.1-b3.json` | 스위트 `bridge`(교차 realm 수정 뒤)·`glb`(부하가 높을 때의 재실행, 민감도 참고용) | 35,861 | 2026-10-15T04:07:18.557Z | 7.58~19.34 |
| `results-4.4.1-b4.json` | 스위트 `bridge`·`cold`(라운드 로빈)·`warm`·`revisit`(영구 프로필 재방문) 재측정(보고서가 쓰는 값) | 51,382 | 2026-10-15T05:12:37.641Z | 9.66~13.61 |
| `results-4.4.1-b5.json` | 스위트 `memory`(모델 해제 뒤 메모리 반환) | 7,842 | 2026-10-15T04:42:45.923Z | 19.69~19.76 |
| `results-4.4.1-b6.json` | 스위트 `ext` 재실행: 픽스처 11개(KTX2 세 모드 포함), Godot 4.4.1 웹 + Three | 8,884 | 2026-10-15T04:57:41.493Z | 14.6~15.42 |
| `results-4.7-ext.json` | Godot 4.7-stable 웹 템플릿의 `ext` 스위트(픽스처 11개) | 8,972 | 2026-10-15T04:58:10.974Z | 14.63~16.44 |
| `results-4.7-reduced.json` | Godot 4.7-stable 축소 배치: `sizes`·`ext`·`twopoint`·`compare` | 22,967 | 2026-10-15T03:31:07.638Z | 2.64~5 |
| `sample-orion-native-beauty.png` | 샘플: 네이티브 캡처 beauty(툰 + 외곽선, Orion 960x540) | 46,006 | — | — |
| `sample-orion-native-line.png` | 샘플: 네이티브 캡처 line 패스 | 5,821 | — | — |
| `sample-orion-native-tone.png` | 샘플: 네이티브 캡처 tone 패스 | 13,309 | — | — |
| `sample-orion-three-beauty.png` | 샘플: 같은 GLB를 Three 최소 페이지로 그린 툰 + 외곽선 | 28,083 | — | — |
| `template-sizes-4.4.1-4.7.json` | 공식 웹 템플릿 `godot.wasm`·`godot.js`의 raw/gzip/brotli/sha256(4.4.1, 4.5.1, 4.6, 4.7) | 3,671 | — | — |

## 스위트별 원본 (보고서가 어느 파일의 어느 스위트를 썼는가)

| 보고서 절 | 스위트 | 원본 | 비고 |
| --- | --- | --- | --- |
| §7.1 크기 | `sizes` | `results-4.4.1-b1.json` | 결정적 값. 4.7은 `results-4.7-reduced.json`, 버전별은 `template-sizes-4.4.1-4.7.json` |
| §7.2 콜드 기동 | `cold` | `results-4.4.1-b4.json` | b4는 라운드 로빈. b1은 변형을 순서대로 실행한 원본이라 부하 변화가 변형 간 비교에 섞여 대체했다 |
| §7.2 워밍 시작(같은 브라우저 안 재탐색) | `warm` | `results-4.4.1-b4.json` | 서버가 압축 없이 43.7 MB를 보내 HTTP 캐시가 받지 않았다(응답마다 `transferSize`가 전체 크기) |
| §7.2 재방문(영구 프로필, brotli 전송) | `revisit` | `results-4.4.1-b4.json` | 방문마다 새 브라우저 프로세스, 캐시에서 받으면 `transferSize` 0 |
| §7.3 교차 출처 격리 | `coi` | `results-4.4.1-b1.json` | 부팅 성공·실패·차단은 결정적 결과. 차단 이유는 `coep-probe-4.4.1.json` |
| §7.4 GLB 로드 | `glb` | `results-4.4.1-b2.json` | 낮은 부하에서 측정. b3는 부하가 높을 때의 재실행으로 민감도(배수)만 인용 |
| §7.4 확장 호환 | `ext` | `results-4.4.1-b6.json`, `results-4.7-ext.json`, `ext-probe-4.4.1.json`, `ext-probe-4.7.json` | b6·4.7-ext는 웹, ext-probe는 네이티브 두 경로. b2·`results-4.7-reduced.json`의 ext(픽스처 9개)는 b6·4.7-ext로 대체됨(공통 9개의 결과는 같다). 성공·실패는 결정적 결과. 픽스처는 `fixtures-manifest.json` |
| §7.5 브리지 | `bridge` | `results-4.4.1-b4.json` | b2의 `bridge`는 iframe 이진 입력이 0 B로 측정 실패라 대체됨(아래 주의 참고) |
| §7.6 패스 캡처 | `capture` | `results-4.4.1-b2.json` |  |
| §7.7 2점 투시 | `twopoint` | `results-4.4.1-b2.json` | 4.7은 `results-4.7-reduced.json`. 결정적 수학 |
| §7.8 인스턴싱 벤치 | `bench` | `results-4.4.1-b2.json` |  |
| §7.9 같은 GLB 상대 비교 | `compare` | `results-4.4.1-b2.json` | 4.7은 `results-4.7-reduced.json` |
| §7.10 렌더 프로브·네이티브·패리티 | — | `render-probe-4.4.1.json`, `native-capture-orion.json`, `parity-orion-4.4.1.json` |  |
| §7.11 메모리 반환 | `memory` | `results-4.4.1-b5.json` |  |
| 재현성(L11) | — | `reproducibility-4.4.1.json` |  |

## 측정 조건 (모든 파일에 공통, 파일 안 `environment`에도 기록됨)

- 헤드리스 Chromium 141.0.7390.37(Playwright 1.62.1), `--use-angle=swiftshader`(소프트웨어 WebGL2, ANGLE/Vulkan SwiftShader). **GPU 없음.** `navigator.gpu`는 `undefined`.
- 4 vCPU Xeon, 16 GB, 다른 작업과 공유된 컨테이너. 스위트별 시작·종료 `loadavg`가 각 스위트의 `_meta`에 있다. 파일별 1분 `loadavg` 범위는 위 표에 있다.
- Godot 4.4.1-stable 공식 `web_nothreads_release`(단일 스레드)와 `web_release`(스레드) 템플릿. 4.7은 같은 프로젝트를 4.7-stable 템플릿으로 다시 빌드했다.
- 반복 기본 5회(`coi`, `bench`, `memory`는 3회, `ext`는 결정적 결과라 픽스처당 1회), 반복마다 새 브라우저(`warm` 제외; `revisit`는 반복마다 방문 3회를 각각 새 브라우저 프로세스에서). 요약은 `{n, median, mad, min, max}`(MAD = 중앙값 절대편차).
- 로컬 정적 서버(127.0.0.1)이고 네트워크 지연이 없다. 뷰포트 960x540, DPR 1.
- **소프트웨어 렌더링의 프레임 시간은 실기기 성능이 아니다.** 같은 조건에서 Three와 나란히 돌린 상대값, 크기, 메모리, 시작 시간, CPU 비용만 해석에 쓴다.

## 읽을 때 주의할 점

1. `results-4.4.1-b1.json`의 `environment.buildFiles["web-threads/index.pck"]`(`8e186a9e…`, 54,176 B)와 `suites.sizes.godot["web-threads"]`의 pck·html 행은 측정 시작 시점의 이전 빌드 값이다. 측정이 시작된 직후 `web-threads` 폴더를 현재 소스로 다시 빌드한 결과(pck `b006ee5b…` 55,632 B, html 7,973 B)로 교체했다. wasm과 js는 교체 전후 같다(sha256 일치). 단일 스레드 `web` 폴더는 교체하지 않았다. b2 이후 파일은 현재 빌드를 기록한다.
2. 결과 JSON의 `outcome: "timeout"`은 "시작 이벤트(`first-frame`)를 받지 못함"의 일반 라벨이다. `coi` 스위트의 "부모 COEP credentialless + 단일 스레드 스테이지(COEP 헤더 없음)" 시나리오는 243~443 ms 만에 실패한 iframe 차단이며, 이유는 `coep-probe-4.4.1.json`의 `blockedReason: coep-frame-resource-needs-coep-header`다.
3. `coi` 스위트 콘솔 오류의 `404 (Not Found)`는 호스트 페이지의 favicon 요청이다.
4. `cold` 스위트의 `jsHeapUsedMiB`는 `measureUserAgentSpecificMemory`를 호출하는 격리 변형(`ni`, `nr`)에서 더 작게 나온다. 호출 중 GC가 일어나서라고 짐작하지만 확인하지 않았다. 변형 사이 힙 비교에 쓰지 않는다.
5. **b2의 `bridge` 스위트는 대체되었다.** iframe 모드의 이진 입력이 부모 창의 `ArrayBuffer`를 그대로 넘겨 Godot가 0 B를 받았고(`bytes: 0`, `allShaMatch: false`), 원인은 엔진 JS의 `obj instanceof ArrayBuffer || ArrayBuffer.isView(obj)` 검사가 교차 realm `ArrayBuffer`를 거부하는 것이다(보고서 §6.2의 6번). 하네스를 고쳐(호스트가 `Uint8Array` 뷰를 두고 `arraybuffer` 대조군을 함께 측정) b3 이후로 대체했다. b2 원본은 감사 추적을 위해 그대로 두었다. `summarize.mjs`에 여러 파일을 주면 뒤의 파일이 같은 스위트를 덮어쓴다.
6. **b1의 `cold`·`warm`은 변형을 순서대로(n -> ni -> nr -> t -> ti -> tr) 5회씩 실행했다.** 측정 중 머신 부하가 바뀌어 변형 간 차이가 부하 변화와 섞일 수 있어, 반복마다 시작 변형을 돌려 가며 실행하는 라운드 로빈으로 하네스를 고쳐 b4로 다시 측정했다. 보고서는 b4를 쓴다.
7. **b3의 `glb`는 부하가 높을 때(loadavg 14~19)의 재실행이다.** b2(4.3 안팎)와 비교하면 모든 방법이 2.5~3.3배 느려져 시간 값이 머신 부하에 거의 비례함을 보여 주는 민감도 자료다. 서로 다른 부하의 값을 비교하지 않는다.
8. `warm` 스위트는 서버가 `index.wasm`을 압축하지 않고 43,699,190 B 그대로 보내서 브라우저 HTTP 캐시가 받지 않았다. 반복 실행마다 리소스 타이밍의 `transferSize`가 전체 크기로 같았다(`wasmTransfer`). 그래서 이 스위트의 빨라진 값은 HTTP 캐시 효과가 아니라 같은 브라우저 안 재탐색의 효과다(원인은 가르지 않았다). 캐시에서 받는 재방문은 `revisit` 스위트가 잰다.
9. `revisit` 스위트의 서버는 `index.wasm`·`index.js`를 brotli 9로 미리 압축해(`packedBytes`) `content-encoding: br`로 보낸다. 압축 시간은 측정에 들어가지 않는다. 방문 2·3의 `transferSize` 0은 디스크 HTTP 캐시에서 받았다는 뜻이다. 압축 해제와 wasm 컴파일 시간은 방문 2·3에도 포함된다.
10. `capture` 스위트의 `rttMs`·`totalGodotMs`·`perPassMs` 요약은 첫 실행(셰이더 컴파일 포함)을 제외한 값이고 첫 실행은 `firstRttMs`·`firstTotalGodotMs`에 따로 있다. `bridge`의 `pingRttMs`는 앞 5회를 제외한다.
11. **b2·`results-4.7-reduced.json`의 `ext`는 픽스처 9개, b6·`results-4.7-ext.json`은 11개다.** KTX2의 Basis 모드를 세 가지(UASTC + zstd, UASTC 무압축, ETC1S)로 넓히려고 `ext-basisu-uastc-raw.glb`, `ext-basisu-etc1s.glb`를 더해 다시 실행했다. 공통 9개의 성공·실패와 렌더 고유색은 같다. 기존 9개 파일은 다시 만들어도 바이트가 같다(sha256 비교). 보고서는 b6와 4.7-ext를 쓴다.
12. 네이티브 프로브 JSON의 `engineMessages`는 엔진의 ERROR/WARNING 줄 중 glTF·KTX·이미지와 관련된 서로 다른 줄만 담고 `engineMessageLines`는 전체 개수다. `--headless` 경로는 이 줄을 표준 오류로, X11(Xvfb) 경로는 표준 출력으로 내서 프로브는 둘 다 읽는다.
13. `compare` 스위트의 Three 쪽은 최소 페이지(조명 1개, 후처리 없음)다. 앱 전체와의 비교가 아니다.
14. 4.5.1·4.6 템플릿 크기는 `templates/web_*.zip` 두 멤버만 HTTP Range로 읽어 zip CRC32로 검증한 값이다(`tools/godot-3d-poc/scripts/remote-template-members.py`). 4.4.1과 4.7은 전체 아카이브를 SHA512로 검증했다.
15. RSS 합은 브라우저·GPU(SwiftShader)·렌더러 프로세스의 RSS를 더한 값이라 공유 페이지가 중복될 수 있다. 같은 방식의 값끼리만 비교한다.
16. 결과 JSON에는 비밀값·토큰·사용자 식별 정보와 로컬 절대 경로가 없다(`/tmp`·`/home`·`/root` 문자열 검색 0건).

## 재현

`tools/godot-3d-poc/README.md`의 "재현 순서"를 따른다. 같은 머신이라도 다른 작업의 부하에 따라 시간 값은 달라진다. 크기와 sha256은 결정적이어야 한다
(`index.wasm` = `e4a43dbae28662b2a68f6136857a94db6695430901515800b9883f6327cb7116`, `index.pck` = `b006ee5b817b74edd644d755fc7c2a22264cbe96819cd832a8cb74e813968afa`, `web` 변형).
