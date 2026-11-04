# 원고 문서 게시와 캡처 경계 회귀 검증

기준은 `fa68e24ef8b100f8971fbd402714e5d7c3287d4e`다. 이 변경은 문서 이력 검증이 게시 완료된 표면을 비교하도록 교정한다. 제품의 라이브 잉크·GPU 래스터·장치 정책·CI 워크플로를 변경하지 않는다. 라이브 프리뷰와 GPU 문서 사이의 가장자리 차이는 별도 미해결 항목이다.

원래 검증기는 Undo 버튼이 활성화된 뒤 80ms 간격 화면이 안정되면 이를 committed 이미지로 사용했다. 기본 획은 완료 후 2초 유휴 시점에 문서 이력으로 반영되며, Undo는 pending live 획만으로도 활성화된다. 문서가 반영된 뒤에도 GPU가 준비 중이면 Konva 표면이 먼저 표시될 수 있다. 따라서 픽셀이 안정됐다는 사실만으로 최종 문서 표면의 게시가 완료됐다고 판단할 수 없다.

동일 원본 검사·채널 허용치·변경 픽셀 예산을 유지한 클라우드 개발 서버에서 CanvasKit 시작 지연을 재현했다.

| 조건 | committed → Redo | Undo → blank | Redo → reload | PNG 전후 |
|---|---:|---:|---:|---:|
| 원본 샘플러, GPU 자산을 초기 캡처 뒤 해제 | 1,547 / max72 실패 | 0 | 0 | 0 |
| 원본 샘플러, 같은 원점 WASM 응답 4초 지연 | 1,523 / max69 실패 | 0 | 0 | 0 |
| 수정 샘플러, 같은 4초 지연 | 0 | 0 | 0 | 0 |

지연은 테스트 문서의 같은 원점 WASM 응답에만 적용했다. 장치·네트워크 권한을 우회하지 않았다. 원본 실패 시 committed 캡처의 owner는 compatibility였고 Skia는 hidden/starting이었다. 수정 후에도 게시 대기 전 프리뷰와 문서의 814픽셀/max68 차이는 `presentation.initialPreviewToCommitted` 및 별도 PNG에 남는다. 과거 1,527픽셀 실행의 원본 초기 plane bitmap은 없으므로 그 실행의 완전한 동일 원인까지 확정하지 않는다. 같은 검증 실패 경로를 새로 재현한 근거다.

수정은 다음 경계에 한정된다.

- 잉크가 있는 committed·Redo·reload 캡처는 active/visible/presented이며 실제 항목을 가진 Skia 표면을 기다린다. 명시적 unavailable 상태의 compatibility/Konva fallback도 허용한다. 빈 baseline·Undo는 이 대기를 요구하지 않는다.
- 캡처 전후 표면 identity·request·공개 history 상태·기하를 확인한다. 표면이 바뀐 샷과 이후 유효성을 잃은 이전 샷을 사용하지 않는다.
- 화면 안의 정수 CSS 영역을 찍고 원래 정수 device-pixel ROI를 `getImageData`/`putImageData`로 추출한다. 재표본화하지 않는다. DPR 1의 130,832픽셀과 DPR 2의 1182×441픽셀 선택을 보존한다. 잘린 ROI를 줄여 통과시키지 않는다.
- 기존 `comparePngPixels` 본문은 그대로 옮겼다. 채널 허용치 2, 변경 픽셀 예산, export exact 0 정책은 변경하지 않았다. 게시 대기는 기존 UI 단계 예산인 8초이며 전체 함수 실행 상한과는 구분한다. 기존 80ms·최대 6샷 안정화 규칙도 유지한다.

Chromium 154.0.8037.57의 `captureBeyondViewport=true`에는 임시 1×1 emulation workaround가 있다. 전체 높이 Stage 캡처가 이를 유발해 반응형 재배치와 표면 재구성을 섞을 수 있었다. 새 캡처는 물리 viewport 안의 동일 artwork ROI를 사용한다. [해당 버전 Chromium 소스](https://chromium.googlesource.com/chromium/src/+/refs/tags/154.0.8037.57/content/browser/devtools/protocol/page_handler.cc)

래스터 자체도 별도로 분리했다. 실제 동일 획의 Native reauthor points·pressures·style과 GPU contract가 같았다. GPU Float32 dab 배열을 Canvas2D로 다시 그리면 Native 원본과 exact 0이었다. 같은 배열의 CanvasKit 원본은 765~788픽셀 차이와 alpha coverage 약 3~4% 증가를 보였다. true 조건의 최초 화면은 Konva 원본의 표시 sampling 차이도 추가로 포함했다. GPU 원본과 canonical DOM, readback·CSS 높이 snap 전후는 동일했다. `drawCircle` 대조는 개선되지 않아 제품 변경으로 채택하지 않았다.

재현 명령은 다음과 같다.

```sh
pnpm exec vitest run scripts/lib/studio-lifecycle-capture-policy.test.mts scripts/studio-lifecycle-verifier-policy.test.ts
pnpm exec tsx scripts/verify-studio-lifecycle-capture.mts
TOONSPECTRUM_CHROMIUM_PATH=/usr/bin/chromium TOONSPECTRUM_VERIFY_ORIGIN=http://127.0.0.1:5173 pnpm exec tsx scripts/verify-studio-lifecycle.mts
```

Chromium 경로 환경변수는 관리형 클라우드에 이미 제공된 실행 파일 선택이며, 설치·권한·브라우저 플래그를 변경하지 않는다. 일반 Playwright 설치에서는 생략할 수 있다.

두 번째 명령은 실제 Chromium에서 합성 Canvas2D 표면의 **DOM 게시 계약**을 검사하는 fixture다. 실제 CanvasKit/GPU 렌더링 품질이나 운영 API 검증으로 계산하지 않는다. 게시 전 조기 완료 거부, 게시 후 다른 이미지 채택, DPR 1/2의 독립 viewport ROI와 일치, GPU 없는 명시적 fallback을 검사한다.

클라우드에서 순수 정책·기존 픽셀 정책 45개 시험과 DOM 계약 fixture가 통과했다. 실제 편집기의 4초 지연 실행은 OPFS/SQLite 저장·복구와 1440×2160 PNG의 3,110,400픽셀 전후 비교를 포함해 통과했다. 외부 개발 서버 사용 결과이며 운영 API·DB 저장·모든 브러시·브라우저·실통화 전체 검증은 아니다.

검증 아티팩트는 클라우드 `/tmp/studio-ink-evidence/`, `/tmp/studio-cold-publication/`, `/tmp/studio-cold-fixed4-before/`, `/tmp/studio-cold-fixed4-after/`, `/tmp/studio-capture-contract-regression/`에 보존했다. 원본 실패 및 초기 프리뷰 차이를 해결 완료로 분류하지 않았다. 추가적인 운영 배포·병합과 장치/UDP 제한 변경은 수행하지 않는다.

전체 검사 환경의 cgroup 메모리 상한은 16GiB다. 기본 16GiB Node 힙 설정의 첫 전체 타입 검사는 상한에 도달해 종료 코드 137로 중단됐다. 변경 파일 전용 타입 검사에서 상태 저장 변수의 타입을 교정한 뒤 통과했다. 전체 검사는 작업 전용 Node 실행 경로에 14GiB 힙 상한만 적용하여 같은 명령으로 재검증했고, 웹·API 전체 타입 검사와 범위 기반 하네스가 통과했다. 저장소·CI의 검사 명령, 타입 검사 범위, 브라우저/네트워크 권한은 변경하지 않는다.

관측용 Vite 변환을 제거한 일반 개발 서버에서도 저장소의 검증 명령을 직접 실행해 통과했다. 문서 비교 130,832픽셀의 Undo·Redo·reload와 PNG 3,110,400픽셀의 전후 비교가 모두0이며, 게시 대기 전 진단814픽셀/max68은 그대로 기록됐다. 최종 DOM 계약 회귀도 상태 저장 타입 교정 이후 DPR1/2·fallback 모두 통과했다.
