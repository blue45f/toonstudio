# 자체 resize / 이전 wasm-vips 동일 환경 비교 — 2026-11-05

현재 자체 내보내기 구현은 이 실측에서 이전 `wasm-vips@0.0.19` 경로보다 중앙값 기준 **3.02–5.53배 느렸다**.
불투명 사진·그라데이션은 수치 차이가 작았지만 픽셀 일치는 아니며, 고주파 체크무늬에는 최대 14/255 차이가 있다.
투명 경계의 알파는 일치했고 자체 구현은 이전 경로에서 보였던 숨은 녹색의 합성 번짐을 제거했다.
따라서 기능 계약 검증은 통과했으나 **속도 동등성이나 모든 이미지의 시각적 품질 승인을 입증하지 않는다**.
제품 source/runtime, manifest/lock, 기존 측정·역사 보고서는 변경하지 않았다.

## 대상과 측정 조건

- 후보 HEAD: `7a118fc4ea1c1dadd96090351a35580b0e93d3d1`, `/workspace/scratch/toonstudio-commercial-main-validation`.
- 이전 호출 경로 기준 HEAD: `8d315c85d6fde4a3a30255612c756d3e299a95b0`.
- 자체 구현: 후보의 `studio-native-lanczos.ts` + `studio-native-resize-runtime.ts`.
  큰 축소는 정수 box prefilter 후 sinc3를 적용하며, prefilter 배수는 원본 축의 나눗셈 가능 여부에 영향을 받는다.
- 이전 구현: 기존 개발 설치본 `wasm-vips@0.0.19`, libvips `8.18.7`, `lib/vips-node.mjs`.
  `dynamicLibraries: []`, `concurrency(1)`로 초기화했다. 설치·업그레이드·제품 의존성 복원은 하지 않았다.
- 두 provider를 **동일한 현재 `downscaleForExport` facade에 runtime으로 주입**했다.
  이전의 실제 `newFromMemory(RGBA8,4,"uchar") → resize(hscale,{vscale}) → writeToMemory() → 방어적 사본 → delete()` 경로를 보존한다.
  별도 alpha premultiply 옵션이나 cache 설정을 이전 런타임에 추가하지 않았다.
- 단일 Node `v24.19.0`, Linux/x64, `AMD EPYC 9V74 80-Core Processor` 컨테이너.
  `performance.now()`로 같은 프로세스에서 provider 실행 순서를 교대했다.
  입력마다 provider당 warm-up 3회 후 5회 측정했다. facade의 검증·할당·복사·삭제 비용을 포함하고 초기화·입력 생성·해시·품질 계산은 제외했다.
- 실행 전 부모의 전체 타입 검사가 완료됐고, 비교 중 Vite와 모델 추론을 실행하지 않았다.
  다만 컨테이너의 OS scheduling·공유 CPU를 통제한 실험은 아니다.

## 실제 측정

중앙값이며 단위는 ms다. 괄호는 5회 측정의 최소–최대 범위다.

| 입력 / 원본→출력 | 자체 구현 | 이전 wasm-vips | 자체/이전 |
| --- | ---: | ---: | ---: |
| 독자 그라데이션 2048²→512² | 73.45 (64.32–85.86) | 24.35 (22.51–29.60) | 3.02× |
| 독자 13px 체크무늬 2048²→512² | 69.62 (64.24–76.74) | 21.50 (21.31–21.96) | 3.24× |
| 독자 투명 경계 2048²→512² | 66.33 (60.71–66.95) | 21.52 (21.38–23.34) | 3.08× |
| USGS 사진 2048²→512² | 82.46 (76.74–86.03) | 21.29 (21.07–21.60) | 3.87× |
| 독자 그라데이션 2053×1021→513×255 | 60.90 (60.69–62.96) | 11.01 (10.54–13.22) | 5.53× |

2048→512는 자체 prefilter 배수 2가 적용된다. 두 원본 축이 소수인 마지막 입력에는 배수 1이 적용되며,
입력 픽셀 수가 작아도 상대 속도 손해가 커졌다. 이 5개 입력만으로 모든 배율·크기의 최악 성능을 추정할 수 없다.
다른 환경에서 얻은 역사적 16.4ms / 69ms 수치를 이 표와 섞지 않았다.

프로세스 전체 관측 peak RSS는 **412,304 KiB = 402.64 MiB**였다.
V8 heap 한도는 256 MiB이며 이는 WASM을 포함한 전체 프로세스의 강제 RSS 한도가 아니다.
이전 WASM은 256 MiB shared memory로 시작하며 가상 최대치는 2 GiB다. 각 실행의 메모리 스냅샷은 JSON에 남겼다.
여기서 브라우저 기기의 메모리·큰 캔버스·out-of-core 예산이 검증된 것은 아니다.

## 출력 비교와 알파

두 출력 간 차이를 계산했다. 아래 불투명 입력의 MAE/PSNR은 **RGB 3채널**, 단위 범위 0–255다.
SSIM은 Rec.709 luminance, 비중첩 8×8 창(끝부분은 잘린 창), 모집단 분산,
`C1=(0.01×255)²`, `C2=(0.03×255)²`의 평균이다.
이 값은 이전 결과와의 일치도이며 별도의 고해상도 정답 대비 시각적 품질 점수는 아니다.

| 불투명 입력 | RGB 최대 절대 차이 | RGB MAE | PSNR dB | luminance SSIM |
| --- | ---: | ---: | ---: | ---: |
| 그라데이션 2048² | 1 | 0.07277 | 59.511 | 0.999887 |
| 13px 체크무늬 2048² | 14 | 1.03894 | 39.083 | 0.999588 |
| USGS 사진 2048² | 4 | 0.32485 | 52.990 | 0.999402 |
| 그라데이션 2053×1021 | 1 | 0.09132 | 58.525 | 0.999690 |

투명 경계는 불투명 빨강 `[255,0,0,255]`과 완전 투명 녹색 `[0,255,0,0]`을 나란히 배치했다.
이전 facade에는 명시적 premultiply 단계가 없고, 실측에서 RGB와 alpha를 각각 보간한 동작이 나타났다.
경계 x=255의 자체/이전 RGBA는 `[255,0,0,241]` / `[241,14,0,241]`,
x=256은 `[255,0,0,14]` / `[14,241,0,14]`였다. **알파는 모든 픽셀에서 정확히 일치**했다.

완전 투명 픽셀의 숨은 RGB가 서로 달라 raw RGB 최대 차이는 255지만, 이것을 곧바로 가시적 오차로 해석하면 안 된다.
검정·흰색 배경에 float RGB로 합성한 차이의 최대값은 모두 13.2314/255,
전체 RGB MAE는 0.03705였다. 경계 중앙의 16열만 보면 MAE 1.18562, PSNR 36.466dB,
SSIM은 검정 배경 0.881944 / 흰색 배경 0.945013이다.
기존 결과의 검정 배경 green 성분 최대값은 13.2314, 자체 결과는 0이었다.
이는 알파 처리의 의도적인 동작 차이이며 이전의 halo를 그대로 복제했다는 주장을 하지 않는다.

각 provider의 모든 5회 출력 SHA-256이 동일했다. 5개 입력 모두 정확한 요청 크기·RGBA8 바이트 수,
입력 비변경, 입력과 출력 버퍼 분리, 유한한 byte 출력이 확인됐다. 불투명 입력의 alpha는 양쪽 모두 255였다.
기존 품질 임계치를 변경하거나 이번 비교에 맞춘 새 통과 임계치를 만들지 않았다.

## 출처·재현·남은 범위

합성 입력은 첨부 스크립트의 독자 생성식이다. 사진은 이전 평가가 보존한
[USGS Mountain Lake](https://www.usgs.gov/media/images/mountain-lake) 원본과
[USGS Multimedia Gallery 권리 고지](https://www.usgs.gov/products/multimedia-gallery)를 재사용했다.
1338×772 JPEG를 Pillow `ImageOps.fit(...,2048×2048,LANCZOS,centering=(0.5,0.5))`로 중앙 crop/resize한 동일 RGBA를 양쪽에 입력했다.
원본·입력·출력 해시와 권리 고지 사본이 증거 폴더에 있다. 학습 가중치는 사용하지 않았다.

이전 패키지의 MIT wrapper LICENSE와 포함 라이브러리별 third-party notices를 원문 그대로 보존했다.
고지에는 libvips·glib 등의 LGPLv3 사용 조건이 표시되어 있으며, 이를 비상업 전용 제한으로 분류하지 않는다.
이 비교가 제품 배포의 LGPL 의무 충족을 따로 입증하는 것은 아니다.

[comparison.json](../evidence/commercial-model-rights-2026-11-05/native-resize-comparison/comparison.json)에 전체 반복 시간,
각 채널 max/MAE, RGBA 및 두 배경의 RGB PSNR/SSIM, 알파·경계 샘플, 메모리와 정확한 소스 해시를 기록했다.
[commands-and-outcomes.json](../evidence/commercial-model-rights-2026-11-05/native-resize-comparison/commands-and-outcomes.json)은 실제 명령과 exit 0 결과를 보존한다.
새 비교에서 실패한 실행은 없었다. 그림 `*-composite-comparison.png`의 왼쪽/오른쪽은 자체/이전,
위/아래는 검정/흰색 배경이며, 비교 스크립트·출력 PNG·패키지 고지·SHA256SUMS를 함께 보존했다.

실제 명령은 준비 helper → 비교 → rendering 순서였고, 재현 시 helper의 `--prepare` / `--render` 모드를 명시할 수 있다.
경로가 다른 환경에서는 스크립트 상단의 네 경로만 조정한다. 제품 의존성에 이전 패키지를 추가하지 않는다.

```sh
cd /workspace/toonstudio
/tmp/toonstudio-light-paprika-evaluation/venv/bin/python /tmp/toonstudio-native-resize-same-environment/prepare-and-render.py --prepare
cd /workspace/scratch/toonstudio-commercial-main-validation
timeout 120s node --expose-gc --max-old-space-size=256 --import tsx /tmp/toonstudio-native-resize-same-environment/compare.mts
cd /workspace/toonstudio
/tmp/toonstudio-light-paprika-evaluation/venv/bin/python /tmp/toonstudio-native-resize-same-environment/prepare-and-render.py --render
```

브라우저·실제 사용자 기기, 큰 캔버스와 다른 배율, 전체 제품 실행, 전문가 시각 품질 승인은 실행하지 않았다.
확인된 성능 퇴행과 고주파·알파 동작 차이는 후속 제품 판단에 남는다. 이 보고서는 제거 완료·서비스 준비 완료·품질 동등성 선언이 아니다.

증거 포장 후속 확인: 실행 원본은 `/tmp/toonstudio-native-resize-same-environment/compare.mts`에
보존했다. 저장소의 동일 바이트 사본은 `compare.mts.txt`로 보관하며 재현할 때 `.mts`로 복사한다.
처음 `.mts`로 저장한 사본이 전체 TypeScript root에 추가된 것은 후속 inventory 검사에서 발견했다.
`tsconfig`나 검사 옵션을 완화하지 않고 증거 파일명을 바로잡았으며, 수정 전후 원본 코드 SHA-256은 같다.
