# light_paprika 수치 일치 재검증 — 2026-11-05

상태: **current / 격리 수치 검증 완료, parity 실패 유지**.
기존 후보 조사 보고서·제품 source·asset·가중치·의존성은 수정하지 않았다.
이 검증은 제한된 제품 Paprika/Tag2Pix 가중치를 실행·추출·학습·증류하지 않는다.

## 결론

**CPU ONNX Runtime을 브라우저와 같은 1.30.0으로 맞춰도 기존 `max abs error < 2/255`
기준을 통과하지 못했다.** 기존 CPU 1.20.1과 신규 CPU 1.30.0 출력은 두 입력 모두
바이트 단위로 같다. 따라서 이번 모델·입력·설정에서 단순한 CPU/browser 버전 불일치가
기존 실패를 설명하지 않는다. provider별 커널·수치 연산·최적화 차이는 추가 후보 원인이며,
이번 검사로 특정 연산·버그·최적화가 원인이라고 확정하지 않는다.

shape·finite·결정성은 통과했지만 수치 parity는 실패다. 이 결과를 화질 동등성 통과,
모델 권리 해결, 제품 adapter 통합 또는 상용 대체 완료로 해석하지 않는다.

## 동일하게 고정한 항목

- 모델은 기존 격리 평가의 Apache 저장소 저자 자체 학습 `light_paprika` ONNX 그대로다.
  3,824,883 bytes, SHA-256
  `431f2b1c7a3ab31fbee32fcae193e4e65b2304484e0a646a481d1a61351a17a8`.
- 기존 public-domain USGS Mountain Lake와 평가용 독자 합성 도시 입력을 재사용했다.
  제품 제한 모델의 출력·새 checkpoint·학습 데이터는 추가하지 않았다.
- 입력은 기존 `.npy`와 `.f32`가 바이트 단위로 같은지 먼저 확인했다.
  RGB float32 `[1,3,512,512]`, 기존의 `/127.5 - 1` 전처리 결과를 그대로 읽으며
  이번 단계에서는 정규화·resize·색 채널 변환을 새로 적용하지 않았다.
- USGS 입력 SHA-256:
  `34cc9916a3e4f2ae8150e1adcbdb20c81d961353bd64668bf83baac92ac1de94`.
- 합성 도시 입력 SHA-256:
  `d1a3118c76db8ed71b14ada68f25d48447177436a7cbcd9dc15cb60b1f1a2e85`.
- CPU는 `CPUExecutionProvider`, intra/inter-op 각 1 thread, 기본 `ORT_ENABLE_ALL`.
  브라우저는 ORT Web 1.30.0 WASM, `numThreads=1`, Chromium 154 headless다.
  WebGPU는 사용하지 않았다. CPU/WASM 각각의 기본 최적화 경로까지 같다는 주장은 아니다.

## 실제 결과

기준은 기존과 같은 엄격한 최대 오차 `< 2/255` = `< 0.00784313725490196`다.
TensorFlow 기준 배열은 기존 TF 2.16.2 평가의 출력이며 이번에 TF를 새로 실행하지 않았다.

| 비교 | USGS 사진 max / mean abs error | 합성 도시 max / mean abs error | 판정 |
| --- | --- | --- | --- |
| CPU 1.30.0 ↔ 기존 CPU 1.20.1 | 0 / 0 | 0 / 0 | 두 배열 byte-identical |
| CPU 1.30.0 ↔ 기존 TF 2.16.2 | 0.00156891346 / 0.000256707659 | 0.00216296315 / 0.000378433120 | 기존 기준 통과 |
| 브라우저 Web 1.30.0 ↔ CPU 1.30.0 | 0.04379662871 / 0.007179233008 | 0.06566113047 / 0.008437058872 | **기준 실패** |
| 브라우저 Web 1.30.0 ↔ 기존 CPU 1.20.1 | 위와 동일 | 위와 동일 | **기준 실패** |

브라우저의 사진 오차는 기존 보고서의 실패값을 그대로 재현했다.
이번에는 도시 입력도 브라우저에서 실제 실행했으며, 역시 실패했다.
각 입력의 브라우저 3회 출력 SHA-256은 모두 같고, CPU 4회도 입력별 모두 같다.
출력은 모든 실행에서 float32 `[1,3,512,512]`, finite 원소 786,432개, nonfinite 0개다.
브라우저 page error는 0개였다.

| 입력 | CPU 1.30 출력 SHA-256 | 브라우저 1.30 출력 SHA-256 |
| --- | --- | --- |
| USGS | `568b0be2bc285842df7e5aea5e93440ac2cd7cdeca815e9fa23c7b2ec862d2c3` | `181601280d44b1fbfef11203060d654600c9b45b017457a0e1a76bf369e209ce` |
| 도시 | `3626b0be2c8d83790923a4704b3c004416e702d948a94c283c6339240bb4fa61` | `0e586c045863bfc72c23639a1d945bbe5ee49b1368d18c9d684f0c56601c8ba0` |

브라우저에서 저장한 float32 raw output을 별도 NumPy 코드로 다시 읽고 float64 subtraction/mean을
계산해 같은 실패를 확인했다. 기준 이상 차이가 있는 원소는 사진 337,020개(42.85%),
도시 489,866개(62.29%)다. 이 비율은 normalized tensor 원소의 수치 차이이며 화질 평가 점수가 아니다.

## 시간·메모리

- CPU session load 0.03560 s, warm 3회 중앙값은 사진 1.74373 s / 도시 1.74129 s.
- CPU 평가 process `ru_maxrss`는 1,651,036 KiB. 전체 브라우저 peak와 같은 수치로 사용하지 않는다.
- 브라우저 session load 479.63 ms.
- 사진 3회: 4590.35 / 4325.435 / 4280.20 ms.
- 도시 3회: 4611.53 / 4809.80 / 4296.19 ms.
- 공유 호스트에서 순차 실행한 두 입력 smoke 실측이며 성능 SLA·통합 latency를 보장하지 않는다.

## 설치와 환경 보존

공식 [PyPI ONNX Runtime 1.30.0 metadata](https://pypi.org/pypi/onnxruntime/1.30.0/json)의
cp312/manylinux x86_64 wheel을 다운로드하고 metadata SHA-256과 실제 파일 hash를 비교했다.
기존 `/tmp/toonstudio-light-paprika-evaluation/venv`의 pip를 사용하되
`--no-deps --no-cache-dir --target /tmp/toonstudio-light-paprika-parity-followup/ort130`로만 설치했다.
기존 venv를 upgrade하지 않았다.

ORT 1.30.0은 protobuf >=4.25.8을 요구하므로 기존 venv의 3.20.3을 재사용하지 않고,
공식 [protobuf 4.25.8 metadata](https://pypi.org/pypi/protobuf/4.25.8/json)의 별도 wheel을
같은 target에 설치했다. runtime import path와 protobuf import path 모두 target 경로임을 확인했고,
나머지 필수 dependency의 resolved version도 요구 범위를 만족했다.
기존 venv의 `pip freeze`는 기존 기록과 45개 행 전부 같았다(추가·삭제 0개).
기존 ORT는 1.20.1, protobuf는 3.20.3 그대로다.

## 실행 명령과 실패 구분

CPU 실행:

```sh
PYTHONPATH=/tmp/toonstudio-light-paprika-parity-followup/ort130 /tmp/toonstudio-light-paprika-evaluation/venv/bin/python /tmp/toonstudio-light-paprika-parity-followup/evaluate_cpu130.py
```

브라우저 실행은 별도 터미널의 local-only Python server와 Playwright 실행기로 수행했다:

```sh
python /tmp/toonstudio-light-paprika-parity-followup/serve.py
node /tmp/toonstudio-light-paprika-parity-followup/browser.mjs
/tmp/toonstudio-light-paprika-evaluation/venv/bin/python /tmp/toonstudio-light-paprika-parity-followup/compare_arrays.py
```

server는 `127.0.0.1:8923`에만 bind하고 정해진 model·input·reference·local ORT 파일만 제공했다.
출력 저장 POST도 두 raw output 파일명과 정확한 크기만 허용했다. 종료 후 server를 중지했다.
browser runner는 수치 실패에도 결과 영수증을 먼저 저장하도록 작성했으므로 **실행 exit 0이
parity 통과를 뜻하지 않는다**. receipt의 `passed_strict_less_than`과 별도 comparison이 판정이다.

이번 후속 실행에서 설치·CPU·브라우저·raw output 비교 명령의 실행 실패는 없었다.
ORT import의 telemetry ID 저장 경고는 in-memory fallback을 표시했고 추론은 완료됐다.
기존 pip freeze 조회는 cache 디렉터리 권한 경고를 냈지만 패키지를 설치하거나 바꾸지 않았다.
수치 gate 실패와 도구 실행 실패를 구분하며, gate를 완화하거나 통과로 덮지 않았다.

## 증거와 미완료 항목

새 증거는 `docs/evidence/commercial-model-rights-2026-11-05/light-paprika-parity/`에만 기록했다.
CPU/browser 결과, independent raw-array 비교, wheel 영수증, runtime 파일 hash,
환경 보존 확인, 실제 실행 코드와 evidence hash manifest가 있다.
3 MB대 model과 각 3 MB raw tensor는 기존 scratch와 새 `/tmp` scratch에만 두고 제품에 넣지 않았다.
새 보고서와 증거 텍스트 19개 Secretlint, Python 스크립트 AST parse,
브라우저 실행기 `node --check`, `harness:check`, 변경 범위 diff 검사를 통과했다.

미완료: CPU/WASM의 최적화·연산별 오차 localization, 최적화 변경 비교, WebGPU,
실제 제품 adapter 경유 alpha/odd-size/취소/fallback, 넓은 회귀 corpus와 육안 품질 수락,
후보 학습 자료 provenance 추가 확인. 이번 수치 검증은 기존 화질 채택 보류를 뒤집지 않는다.
제품·기존 보고서·기존 가중치는 보존했고 commit·push·PR·merge·배포는 하지 않았다.
