# wasm-vips 최종 축소 레인의 자체 구현 대체 — 2026-11-05

상태: **current / 제품 레인 대체·외부 의존성 제거·번들 검증 완료**.
상위 통합 작업에서 외부 패키지와 lockfile을 제거하고 frozen install·최종 번들·CSP·구조 검사를
통과했다. 전체 tsc의 메모리 한계와 main 충돌 검토는 `commercial-license-audit-2026-11-05.md`를
따른다. Mixbox는 변경하지 않았다.

## 교체 범위와 출처

교체 전 실제 제품의 외부 import는 `export/studio-vips-export.ts` 하나였고 호출자는
`studio-export-presets.ts`의 대형 페이지 규격 축소다. 사용 기능은 RGBA8 입력의 정확한 크기
downscale, 메모리 복사·해제, 결정적 원본 기반 피라미드다. 전체 libvips 기능을 복제한 것이 아니다.
별도 benchmark 두 곳이 사용하던 Gaussian은 `tests/benchmarks/harness/native-gaussian.ts`의
자체 구현으로 이전됐다. 그 파일과 benchmark 변경은 별도 작업자가 검증했다.

`studio-native-lanczos.ts`는 3-lobe windowed sinc와 centre convention을 수식으로 직접 구현했다.
원본 라이브러리 소스·바이너리를 복사하거나 포팅하지 않았다. 공개
[libvips resize API 문서](https://www.libvips.org/API/current/method.Image.resize.html)의 사용 동작
(정수 box preshrink, Lanczos3, 축별 scale, 픽셀 중심 좌표)만 참고했다.
REA MCP는 사용하지 않았다. 새 코드는 ToonStudio 내부 구현이며 descriptor는 `internal`이다.

큰 축소는 원본 축을 정확히 나누는 정수 box prefilter 후 sinc를 적용한다. 마지막 sinc 단계에
적어도 2배 표본 여유를 남긴다. sinc는 축소율에 맞게 low-pass support를 넓히고 이미지 밖 표본은
제외·정규화한다. 투명 픽셀의 숨은 RGB가 번지지 않도록 alpha를 premultiply한 후 필터링한다.
중간 float 이미지는 전체를 할당하지 않는다. 수평 행 cache는 **32MiB 상한**으로 유지하고
세로 tap을 하나씩 읽어 Float64 출력 한 행에 누적한다. cache에 담기지 않는 행은 즉시 소비한다.
source 높이가 소수이고 출력이 한 행인 비등방 요청도 전체 수평 이미지를 붙잡지 않는다.

## 보존한 계약

- 공개 `StudioVips*` 타입·함수·오류 클래스와 `wasm-vips-pipeline` ID, `vips` route는 기존 호출과
  저장된 설정의 호환성을 위해 남겼다. 이름이 외부 패키지 실행을 의미하지 않는다.
- export revision은 2, lazy runtime은 `studio-native-resize-runtime.ts`, descriptor runtime은 JS다.
- 동일 크기 요청은 독립 buffer 복사, 확대·잘못된 입력은 오류, 홀수 목표 크기는 정확히 유지한다.
- 피라미드는 원본에서 각 레벨을 직접 계산한다. floor-halving·최소 1·1×1 종료를 보존한다.
- 작은 문서의 Canvas2D 경로는 그대로다. 선택한 대형 레인의 load/read/resample/materialize 실패는
  다운로드 전에 중단하며 다른 엔진으로 조용히 재실행하지 않는다.
- facade의 newFromMemory/resize/writeToMemory/delete/concurrency(1)는 기존 내보내기 사용 면만
  보존한다. 일반 libvips API 또는 codec/colour-management 호환을 주장하지 않는다.

## 검증과 측정

기존 품질 하한 **PSNR ≥26.5 dB, SSIM ≥0.985**를 그대로 유지했다.
순수 단일 sinc의 초기 후보는 PSNR25.8788로 실패했고 production 경로에 채택하지 않았다.
일반 box prefilter를 추가한 후보가 모든 기존 품질 하한을 통과한 후 기본 runtime을 교체했다.

| 검증 | 결과 |
| --- | --- |
| 기존 export + 실제 preset route + registry effect compiler/governance 4개 suite | 107개 통과 |
| 새 자체 kernel/facade analytic tests | 10개 통과: 상수색/알파, 투명 RGB 배제, impulse 대칭, 입력 독립성, 오류·release, 비등방 cache 예산 |
| 소수 높이1021×4093→1020×1 | cache≤32MiB, Float64 출력 행32640bytes, 현재 수평 행16320bytes. cache 비활성화 결과와 byte 동일 |
| focused TypeScript | `--ignoreConfig --noEmit --strict --skipLibCheck --target es2020 --lib esnext,dom --module esnext --moduleResolution bundler`로 새 구현 두 파일과 export wrapper 통과 |
| 변경 구현·테스트·descriptor ESLint | 통과 |
| 2048→512 Quality Lab | PSNR27.26 dB / SSIM0.9887 |
| 실제 대형 route 2048×16384→690×5520 | PSNR28.75 dB / SSIM0.9908, direct wrapper와 export 준비 결과 byte 동일 |
| 작은4096² Canvas2D 경로 | byte 보존 |

재현 명령:

```sh
node node_modules/vitest/vitest.mjs run \
  apps/web/src/domains/creator/export/studio-native-lanczos.test.ts \
  apps/web/src/domains/creator/export/studio-vips-export.test.ts \
  apps/web/src/domains/creator/export/studio-export-presets.vips-route.test.ts \
  packages/studio-engine-registry/src/__tests__/effect-compiler.test.ts \
  packages/studio-engine-registry/src/__tests__/manifest-governance.test.ts
```

측정 산출물은 `tests/benchmarks/results/quality-lab-native.json`,
`filter-candidates-native.json`, `native-export-cutover.json`이다. 기존 wasm-vips 측정 파일을
새 수치로 덮어쓰지 않았다. native benchmark 명령은 각 JSON의 harness와 함께 기록한다.

## 남은 제한

Native JS의20회 resize p50은89.871ms/p95는117.091ms다. 과거 wasm-vips16.4ms와 같은 성능이라고
주장하지 않는다. 동시 측정이 아닌 과거 수치이므로 정확한 배율 비교도 보장하지 않는다.
표준 Gaussian benchmark는 sigma4·2048²에서 p501085.337ms로 성능 차이가 크며, 제품 preview
레인으로 등록하지 않았다. 전체 최대268,435,456pixel의 실제 실행·모든 browser/device의 latency
측정까지 완료한 것은 아니다. 이 변경은 품질 하한과 현재 사용 기능을 검증한 독립 구현이며,
전체 이미지 라이브러리의 byte-identical 출력·전체 API 동등성을 뜻하지 않는다.

큰 축소의 integer prefilter는 RGBA8 buffer를 추가 할당한다. 전체 float 이미지보다 작지만 source와
output 및 row cache가 함께 존재한다. 32MiB는 **수평 cache의 상한**이며 전체 process/배열 메모리의
상한은 아니다. Float64 출력 한 행(목표 폭×32bytes), 현재 Float32 행(목표 폭×16bytes), 축별
coefficient 배열·prefilter RGBA8 buffer가 추가된다. 16GiB cgroup에서 전체 tsc와 Vite를 동시에 실행하지 않았다.
최종 외부 의존성 제거·bundle 잔재·전체 타입 검사·브라우저 스모크는 상위 통합 작업 결과를 따른다.
커밋·PR·push·merge·배포는 수행하지 않았다.
