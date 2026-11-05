# 자체 이미지 필터 벤치마크 전환 — 2026-11-05

상태: **current**. 기존 wasm-vips의 실제 사용 기능인 Lanczos3 RGBA 리사이즈와
개발 벤치마크의 Gaussian blur 측정을 독립 구현으로 전환했다.
이는 libvips 전체 연산의 재구현이 아니다. 통합 작업에서 wasm-vips 의존성과 lockfile 항목을 제거한 상태로 최종 커널을 재측정했다.

## 계약과 구현

- `filter-candidates.ts`의 2048²→512² 리사이즈 및 sigma 4 Gaussian,
  `quality-lab.ts`의 같은 리사이즈와 512² sigma 4 Gaussian 호출을 대체했다.
- 리사이즈는 `studio-native-lanczos.ts`의 `resizeStudioRgbaLanczos3`를 사용한다.
  대형 export cutover는 기존 공개 wrapper와 `prepareVipsRoutedPresetPages`를 거친다.
- `native-gaussian.ts`는 표준 `exp(-x²/(2σ²))`의 반경 4σ 커널을 정규화하고
  clamp 경계에서 두 축 분리 합성한다. premultiplied alpha를 사용해 보이지 않는 색이
  인접 색으로 번지는 것을 막는다. sigma 0은 복사본, 지원 sigma 범위는 0..64이다.
  사용된 외부 코드·커널 테이블·모델 가중치는 없다.
- LGPL의 이용·고지 의무를 비상업 이용 금지와 혼동하지 않는다. 이 변경은 상용 배포 의무의
  부담을 줄이기 위한 자체 구현이며 원본 저작권을 부정하거나 원본 전체를 대체했다고 주장하지 않는다.

## 실제 측정

동일 analytic detail card와 기존 box-average / float Gaussian reference, PSNR·SSIM 방법을 유지했다.
호스트는 각 결과 JSON에 기록되어 있고 단일 공유 호스트의 wall time이므로 제품 SLA가 아니다.
수평 행 cache를 최대 32 MiB로 제한한 최종 커널로 3개 벤치마크를 순차 재실행했다.
큰 축소율에서 전체 필요 행을 함께 보존하지 않고 출력 행 하나에 vertical tap을 순서대로 누적한다.
Gaussian p95는 약 5.3초로 변동이 컸으며, 이 기록만으로 성능 한도를 보장하지 않는다.

| 측정 | 자체 구현 결과 | 비교와 한계 |
| --- | --- | --- |
| Quality Lab 2048→512 Lanczos3 | PSNR 27.26 dB, SSIM 0.9887, 87.26 ms | 과거 wasm-vips 측정과 같은 품질 지표. 과거 약 16 ms와 비교하면 느리며 동일 호스트 비교를 보장하지 않음 |
| Quality Lab 512² Gaussian σ4 | PSNR 58.52 dB, SSIM 0.9987, 79.75 ms | 정규화된 표준 float reference 기준. 원본 libvips의 근사 Gaussian과 픽셀 동일성을 주장하지 않음 |
| 20회 2048→512 리사이즈 | p50 69.344 ms, p95 135.979 ms | 3회 warmup 포함, 별도 timing benchmark |
| 20회 2048² Gaussian σ4 | p50 1106.588 ms, p95 5285.787 ms | 이 Gaussian은 개발 벤치마크용이며 제품 필터 provider로 연결하지 않음 |
| 실제 export prep 2048×16384→690×5520 | PSNR 28.75 dB, SSIM 0.9908, 1173.33 ms | CanvasKit linear proxy 22.18 dB / 0.9639 / 358.08 ms. 새 경로가 더 느린 tradeoff를 기록 |
| wrapper와 export prep 정합 | `cutoverMatchesDirectLane: true` | 결과 bytes SHA-256 일치 |
| 4096² pristine canvas | 원본 참조·bytes 보존 | SHA-256 `da0cdcff5a9cb264c2896ae1a9c79b2845efbf6a1cc05efb35e58209dd2a748a` 유지 |

새 결과는 다음 파일에 기록하고 과거 wasm-vips 결과 파일은 변경하지 않았다:

- `tests/benchmarks/results/quality-lab-native.json`
- `tests/benchmarks/results/filter-candidates-native.json`
- `tests/benchmarks/results/native-export-cutover.json`

시각 증거는 `docs/evidence/native-filters-2026-11-05/`의 자체 출력·reference PNG와 `sha256.json`이다.
원본 생성 위치 `tests/benchmarks/artifacts/quality-lab-native/`는 ignore 대상이므로
필요한 4개 PNG를 문서 증거 디렉터리에 별도 보존했다.
기존 report의 `wasm-vips` 이름을 새 구현 측정값의 이름으로 바꾸지 않았다.
`vips`라는 wrapper·route key는 기존 API와 저장 계약 호환 때문에 남아 있으며 원본 라이브러리 로딩을 의미하지 않는다.

## 실행 명령과 검증

저장소 루트에서 실행했다. 각 벤치마크는 순차 실행했으며 full tsc/build는 실행하지 않았다.

```sh
node node_modules/vitest/vitest.mjs run tests/benchmarks/harness/native-gaussian.test.ts
NODE_OPTIONS=--max-old-space-size=1024 node node_modules/tsx/dist/cli.mjs --tsconfig tests/benchmarks/harness/tsconfig.json tests/benchmarks/harness/quality-lab.ts
NODE_OPTIONS=--max-old-space-size=1024 node node_modules/tsx/dist/cli.mjs --tsconfig tests/benchmarks/harness/tsconfig.json tests/benchmarks/harness/filter-candidates.ts
NODE_OPTIONS=--max-old-space-size=1024 node node_modules/tsx/dist/cli.mjs --tsconfig tests/benchmarks/harness/tsconfig.json tests/benchmarks/harness/vips-export-cutover.ts
```

- 위 3개 실측 명령 모두 통과했다.
- Gaussian 테스트 6개 통과: 상수 색·경계 정규화, sigma 0/극소값, impulse 대칭·에너지,
  투명 경계 색 분리, 독립 2차원 convolution reference와 오차 1 이내, 잘못된 입력 거부.
- 관련 5개 TS 파일 ESLint, 변경 파일 Secretlint, `git diff --check`, `harness:check` 통과.
- 독립 Gaussian 소스와 테스트는 `tsc --ignoreConfig --noEmit --skipLibCheck --strict
  --target ES2022 --module ESNext --moduleResolution Bundler`로 지정 파일 타입 검사도 통과했다.
- 최종 커널·Gaussian·벤치마크 소스와 새 결과 JSON의 SHA-256은
  `docs/evidence/native-filters-2026-11-05/final-source-and-results-sha256.json`에 고정했다.
- root tsconfig의 Skia `.d.ts` alias를 runtime으로 해석한 초기 실행은 실패했다.
  전용 benchmark tsconfig를 사용해 해결했다. 이 tsconfig에는 export prep의 앱 import를 위해
  `@/* → ../../../apps/web/src/*` 경로만 추가했고 Skia runtime은 실제 workspace package를 사용한다.
- 벤치마크 경로에는 `import("wasm-vips")` 또는 `from "wasm-vips"`가 남아 있지 않다.
  제품 import·manifest·배포 산출물의 잔재 제거는 통합 검증 범위다.

커밋·push·PR·배포는 하지 않았다. Mixbox 관련 파일·어댑터·의존성·테스트는 변경하지 않았다.
