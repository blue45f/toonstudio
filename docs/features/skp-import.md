# SketchUp(.skp) 가져오기

- 상태: **current** — 소스와 테스트로 확인되는 현재 동작이다.
- 확인일: 2026-10-29 (`apps/web/src/domains/creator/bg3d/studio-bg3d-skp-*`). 실물 치수 보존과 원본 장면 정보의 Worker·GLB 전달 및 읽기 화면을 검증했다. 2026-10-22의 이름 사이드카와 별개인 데이터 계약이다.
- 변환기: [openskp](https://openskp.com/) 1.3.0 (MIT, 순수 TypeScript). **Trimble과 관련 없는 비공식 오픈소스 파서**이며 SketchUp은 Trimble Inc.의 상표다.
- 범위: 배경 3D 에셋 라이브러리의 "3D 모델 및 연결 파일 가져오기"가 받는 `.skp`. 네이티브 SketchUp SDK·서버 변환·SketchUp 확장은 포함하지 않는다.

## 2026-10-29 실물 치수 보존

새로 가져온 SKP는 변환한 미터 단위를 장면 배치까지 유지한다. 기존 공유 렌더 캐시는 2m 자동 맞춤을 유지하고,
명시된 `authored-metres` 자산의 인스턴스 배율로 이를 상쇄한다. 라이브러리에서 다시 놓을 때의 고스트 크기와
접지 기준점에도 같은 배율을 적용한다. 정책 표시가 없는 기존 SKP 자산·저장 장면과 일반 업로드는 기존 동작을 유지한다.

정책은 보고서·장면 attachment뿐 아니라 새 SKP의 최종 GLB `extras`에도 보존한다. 배치나 편의 메타데이터 저장이
실패해도 자산 바이트에 정책이 남으므로, 재배치에서 잘못된 2m 축소 경로로 바뀌지 않는다.
최종 배율이 문서 범위 0.001~1000 밖이거나 모델 경계를 안전하게 보존할 수 없으면 임의로 크기를 잘라 넣지 않고 거부한다.

실제 SKP 바이트→최종 GLTFExporter→GLB 재로딩→캐시→문서 복원에서 100인치가 2.54m로 유지됨을 검증했다.
2540m 모델의 최초 배치 실패 뒤 라이브러리 잔존 자산을 다시 놓아도 같은 이유로 거부되는 회귀를 포함한다.
관련 15개 테스트 파일 265개가 통과했다. 이는 SKP 계층·카메라·태그의 전체 복원이나 운영 배포를 뜻하지 않는다.

## 2026-10-29 원본 장면 정보 보관·조회

새 SKP 가져오기는 OpenSKP `parseSkp`가 노출한 Page, 태그, 정의, 정의별 인스턴스,
주석·스타일 기록을 `StudioBg3dSkpSceneManifest` v1으로 보관한다. 형상·텍스처를 이 manifest에
복제하지 않으며, 형상의 실제 좌표 변환은 별도 `geometryTransform`에 기록한다.
원본 좌표는 인치·Z-up, 원본 행렬은 정의 로컬 좌표 그대로다. 변환된 형상은 미터·Y-up의
`(x, y, z) → (x, z, -y)`와 사용자가 확정한 추가 단위 배율을 따른다.

Worker 응답의 `sceneSource`는 메인 스레드에서 다시 검증하고 최종 GLB의 장면 `extras`에
`toonstudioSkpSceneSource`로 저장한다. 이후 GLTFLoader·GLTFExporter·렌더 캐시를 거쳐도
유지된다. 기존 변환 보고서 v1과 이름 사이드카의 스키마는 바꾸지 않는다.

- `available`: 검증한 파서 노출 정보를 확보했다. 각 목록의 `total`과 `stored`는 파서가 읽은 수이고,
  파일 전체 수는 `sourceTotal: null`이다. 누락된 원본 정보가 없다는 뜻으로 해석하지 않는다.
- `unavailable`: 형상 변환은 성공했지만 정보 재파싱 크기 제한, 파서 미제공·실패, 형식 검증 또는
  보관 예산 때문에 정보를 보관하지 못했다. 사유를 GLB에 남기고 부분 잘림을 성공으로 표시하지 않는다.
- `legacy`: 표시가 없는 기존 자산이다. 원본 정보를 추측하거나 기존 GLB를 다시 쓰지 않는다.
  명시된 잘못된 payload는 legacy로 낮추지 않고 오류로 거부한다.

기본 보관 한도는 Page 256개, 태그 512개, 정의 2,048개, 인스턴스 8,192개,
주석 2,048개, 스타일 256개, 속성 16,384개다. 문자열 1개는 8KiB,
원본 문자열 합은 128KiB, 직렬화 manifest는 256KiB로 제한한다.
순환 참조·희소 배열·접근자·비유한 값·잘못된 정의 참조와 구조를 검증하며 임의 실행 메서드를 호출하지 않는다.

실제 편집기에서 3D 모델 하나를 선택한 뒤 `시점·스토리보드 → 고급 작업대 → SketchUp`의
`SKP 원본 정보 읽기`로 카메라·태그 목록과 파서 기록 수를 확인하고 검증된 JSON을 내려받는다.
조회는 문서·Undo·선택 상태를 바꾸지 않는다. 모델 로딩·조회 실패는 재시도할 수 있고,
조회 도중 선택이 바뀌면 이전 모델의 결과를 새 선택에 표시하지 않는다.

Page의 `fovBasis`와 저장 상태 플래그는 파서가 노출하지 않으므로 `not-exposed`로 기록한다.
가로·세로 화각 기준이나 화면 비율을 추측해 현재 카메라에 적용하지 않는다.
파서 기본값이 섞인 필드, 태그 원본 ID 미노출, 정의별 기록의 미확장도 진단에 남긴다.
보관된 계층·숨김·태그·Page를 편집 가능한 장면 엔티티로 복원하는 기능은 진행 중이다.

실제 MFC·VFF 바이트의 파싱·변환·GLB 재출력 회귀와 통합 11파일·189개 항목을 검증했다.
브라우저에서는 실제 파일 입력→SKP Worker→GLB 검증 Worker→모델 선택→정보 조회→JSON 다운로드를
통과했고 다운로드 JSON을 실제 파싱 결과와 비교했다. 별도 컨텍스트에서 저장소의
`worker-src 'self' blob:`를 적용한 같은 흐름도 통과했다. 이는 전체 운영 CSP·배포 빌드의 검증이 아니다.
실제 UI CSS의 light·dark·contrast, 390px·1600px에서 접근성 자동 위반과 가로 넘침이 없었다.

## 한눈에 보기

`.skp`를 고르면 브라우저 안에서 자체 포함 GLB로 변환해 기존 GLB 가져오기 경로(검증 Worker, 기기별 예산, 라이브러리 저장)에 합류한다. 파일은 외부로 전송하지 않는다. 변환은 요청마다 새로 만든 전용 Worker에서 실행하고, 끝나거나 취소·시간 초과가 되면 Worker를 종료한다.

지원은 **부분 지원**이다. 모든 `.skp`가 변환되지는 않는다. 정적 형상·재질·텍스처를 렌더링하며, 파서가 읽은 원본 장면 정보는 GLB에 별도로 보관한다. 원본 카메라·태그 상태·계층을 장면에 적용하거나 애니메이션을 재생하는 기능은 연결 중이다. 변환이 끝나면 **변환 보고서 v1**(아래 "안정 계약")을 결과 화면에 보여 주고, 가져오기에 성공한 모델의 보고서는 자산 메타데이터(`skpImport`)에 함께 저장한다.

## 사용자 흐름

1. 자산 라이브러리 패널의 "이용 권리 기록"에서 출처·라이선스를 먼저 기록한다. `.skp`도 다른 형식과 **같은 권리 관문**을 거치며(새 관문 없음) 3D Warehouse 이용 약관 안내가 이 영역에 표시된다.
2. 파일을 고르면 패널 아래 SketchUp 영역에 진행 단계(1/6 파일 확인 … 6/6 GLB 만들기)와 실행 위치(별도 Worker / 화면 스레드)가 표시된다. "가져오기 취소"로 중단할 수 있다.
3. 변환 후 모델의 가장 긴 변이 **0.01m 미만(수 mm)** 이거나 **1,000m 이상(수 km)** 이면 "모델 크기를 확인해 주세요" 질문이 나타난다. 모델을 만든 단위(m·cm·mm·inch)를 고르면 그 단위로 크기를 다시 맞춘다(고르는 시점은 라이브러리에 저장되기 전이다). 크기가 정상이면 묻지 않는다.
4. 가져오기가 끝나면 변환 보고서 카드가 남는다: 적용 단위와 배율, 크기, 삼각형·정점·재질·텍스처 수, 컴포넌트·태그·장면 이름, 경고, 자산 정보 저장 결과. 가져오지 못한 경우에도 변환은 됐다면 사유와 함께 카드가 남고, 빈 장면(`skp-empty-scene`)처럼 보고서를 만들 수 있었던 거절도 `empty-scene` 경고·이름과 함께 카드로 남는다(여러 파일을 함께 가져오다 실패하면 모두 저장되지 않으며 카드가 그 사실을 밝힌다).

화면이 없는 경로(질문에 답할 패널이 마운트되지 않음)에서는 가져오기를 멈춰 세우지 않고 OpenSKP의 인치 해석을 그대로 쓰며, 보고서에 `size-abnormal` 경고를 남긴다.

## 구조

```text
file → planStudioBg3dModelImports (32MiB 초과 → skp-too-large)
     → importStudioBg3dSkpToGlb        studio-bg3d-skp-import.ts      프로필별 크기 상한을 읽기 전에 검사
     → convertStudioBg3dSkp            studio-bg3d-skp-worker-client.ts  사전 검사(Worker 생성 전) → 새 Worker 1회, 취소·시간 제한
         → [Worker] runStudioBg3dSkpConversion  studio-bg3d-skp-worker-runtime.ts
             → convertStudioBg3dSkpBytes        studio-bg3d-skp-conversion-core.ts
                 preflight → buildScene → 재질별 병합 → 형상 분석 → toGLB → 보고서 + 원본 sceneSource
     → (크기 비정상) 단위 질문 → scaleStudioBg3dGlbUniformly   studio-bg3d-skp-glb-scale.ts
     → sceneSource 단위 권위 갱신 → GLB 장면 extras 보관
     → 기존 parseGlbSourceImport → 검증 Worker·예산 → 라이브러리 → 장면 배치 → 원본 정보 조회·JSON
     → run.complete → 결과 화면(studio-bg3d-skp-import-session) + 자산 메타데이터(skpImport)
```

| 모듈 | 역할 |
| --- | --- |
| `studio-bg3d-skp-contract.ts` | 한도 상수, 단계, 오류 코드·분류, 오류 클래스(최하위, three.js·openskp 무의존) |
| `studio-bg3d-skp-preflight.ts`, `studio-bg3d-skp-zip-index.ts` | 크기·시그니처·헤더·버전·압축 해제 모델 데이터 크기 사전 검사(ZIP 중앙 디렉터리 판독기 포함) |
| `studio-bg3d-skp-conversion-core.ts` | 변환 본체. `OpenSkpModuleLoader`를 주입받아 테스트에서 가짜로 바꾼다 |
| `studio-bg3d-skp-worker-*.ts`, `studio-bg3d-skp.worker.ts` | Worker 메시지 계약, 런타임, 진입점, 클라이언트 |
| `studio-bg3d-skp-unit.ts`, `studio-bg3d-skp-glb-scale.ts` | 단위 평가·후보, GLB 균일 배율 |
| `studio-bg3d-skp-scene-manifest.ts`, `studio-bg3d-skp-scene-source.ts` | 파서 노출 원본 정보 추출·검증, 보관 상태와 실제 형상 변환 권위 |
| `studio-bg3d-skp-scene-provenance.ts` | GLB extras 쓰기와 로드된 자산의 원본 정보 읽기 |
| `studio-bg3d-skp-source-read-command.ts`, `StudioBg3dSkpSourceInfoPanel.tsx` | 실제 선택·캐시 읽기, 상태·목록·검증된 JSON 다운로드 |
| `studio-bg3d-skp-mesh-merge.ts`, `studio-bg3d-skp-mesh-analysis.ts`, `studio-bg3d-skp-model-summary.ts` | 재질별 병합, 형상 통계·면 방향, 이름·단위 요약 |
| `studio-bg3d-skp-import-report.ts` | 보고서 v1 zod 스키마·검증·타입(메인 스레드와 저장소가 읽는다) |
| `studio-bg3d-skp-report-builder.ts`, `studio-bg3d-skp-report-constants.ts` | 보고서 생성기와 상수. zod에 의존하지 않아 Worker가 이것만 불러온다 |
| `studio-bg3d-skp-import.ts` | 가져오기 파이프라인과 변환의 접합부(크기 사전 검사, 단위 질문, 보고) |
| `studio-bg3d-skp-import-session.ts`, `StudioBg3dSkpImportPanel.tsx`, `studio-bg3d-skp-import-copy.ts` | 진행·질문·결과 화면과 문구 |
| `studio-bg3d-skp-import-run.ts`, `studio-bg3d-skp-asset-metadata.ts` | 가져오기 한 번의 마무리와 자산 메타데이터 기록. 마무리는 AI 표기가 어떻게 저장됐는지(`StudioBg3dImportAiUseStatus`)를 돌려준다 |
| `studio-bg3d-import-save-interrupt.ts` | 가져오기 직후 메타데이터 저장의 취소 신호·시간 한도(일반 소재의 AI 표기 저장과 같은 규칙) |

### 실행 위치 규칙

- **기본은 Worker.** 요청마다 새 Worker를 만들고 끝나면 종료한다(openskp가 힙을 크게 쓰므로 살려 두지 않는다). Worker가 시작·실행에 실패하면 그 요청은 `skp-converter-unavailable`로 끝나며 **메인 스레드로 몰래 다시 시도하지 않는다.**
- **메인 스레드 폴백은 `Worker` 생성자가 없는 환경에서만** 쓴다. 이때 원본을 2MiB 이하로 제한하고, 보고서의 `conversion.execution = "main-thread"`와 경고 `main-thread-fallback`으로 사실을 남긴다.
- 취소와 시간 초과는 `buildScene()`이 동기 함수라 메시지로 알릴 수 없으므로 **Worker를 종료**해 강제한다.

## 지원 범위와 한계

| 항목 | 값 | 근거 |
| --- | --- | --- |
| 지원 버전 | SketchUp 2013 이후(파일 버전 13+). 2021 이후(VFF)와 2013–2020(레거시) 컨테이너 | `STUDIO_BG3D_SKP_MIN_SUPPORTED_MAJOR_VERSION` |
| 원본 크기 | 데스크톱 32MiB, 모바일 16MiB, Worker 없는 폴백 2MiB | `studio-bg3d-skp-contract.ts` |
| 압축 해제 모델 데이터 | 2021 이후 형식은 ZIP 중앙 디렉터리가 선언한 `model.dat` 크기, 레거시는 파일 전체를 **같은 상한**과 견준다. 선언 크기를 확실히 읽지 못하면(ZIP64 등) 거절하지 않고 파서에 맡긴다. `model.dat` 밖 항목(텍스처 등)의 선언 크기는 보지 않으며 OpenSKP 자체 상한(항목당 16GiB, 압축비 1,000배)만 적용된다 | `studio-bg3d-skp-zip-index.ts`, `assertStudioBg3dSkpModelDataSize` |
| 변환 시간 | 90초 초과 시 Worker 종료(`skp-timeout`) | `STUDIO_BG3D_SKP_CONVERSION_TIMEOUT_MS` |
| 이름·단위 2차 파싱 | 원본 24MiB 초과 시 건너뜀(보고서에 `metadata-unavailable`) | `STUDIO_BG3D_SKP_METADATA_PASS_MAX_BYTES` |
| 텍스처 | GLB 포함은 64개·24MiB까지. 넘으면 평균 색으로 가져오고 `textures-omitted` | `STUDIO_BG3D_SKP_TEXTURE_EMBED_*` |
| 면 방향 점검 | 삼각형 150,000개 이하일 때만. 넘으면 `orientation-check-skipped` | `STUDIO_BG3D_SKP_ORIENTATION_CHECK_MAX_TRIANGLES` |
| 폴리곤 경고 | 삼각형 250,000개 이상 `high-polygon-count` | `STUDIO_BG3D_SKP_HIGH_TRIANGLE_COUNT` |
| 드로 콜 | 인스턴스마다 구워진 프리미티브를 **재질별로 병합**해 줄인다(모바일 256·데스크톱 1,024 예산 대응) | `studio-bg3d-skp-mesh-merge.ts` |

실제 장면에 아직 적용하지 않는 것: 원본 카메라·애니메이션·태그 가시성·편집 가능한 컴포넌트 계층. 이름 보고서·사이드카와 별개로 원본 manifest를 보관하지만, 현재 렌더링은 재질별 world-baked merge를 단일 모델로 배치한다. SketchUp에서 **숨긴 면**은 변환에서 제외하지만(`respectEdgeVisibility`), **숨긴 컴포넌트·숨긴 태그의 형상은 결과에 포함될 수 있다**(보고서에 `hidden-instances-included`·`hidden-tags-included` 경고). 이름은 읽을 수 있는 범위만 담는다: 장면 이름과 파일에 적힌 표시 단위는 2021 이후 형식에서만 읽을 수 있고(레거시는 둘 다 비어 있다), 태그의 숨김 표시는 OpenSKP가 읽은 값을 그대로 따른다. OpenSKP의 타입 주석(`Layer.hidden`)은 레거시에서만 채워진다고 적었지만 소스(`collectLayers`의 `8E3C`, 레거시 레이어 레코드)는 두 컨테이너에서 모두 읽으므로 이 구현은 컨테이너로 구분하지 않는다. 실제 네이티브 작성기로 만든 폭넓은 VFF 원본 corpus의 숨김·태그 의미 검증은 남아 있다.

## 단위·좌표·크기 정규화

OpenSKP 1.3.0 README와 소스에서 확인한 사실에 맞춘다.

- SketchUp은 모델을 항상 **인치, Z-up**으로 저장한다. 화면에 보이는 표시 단위(mm 등)는 저장 값에 영향을 주지 않는다.
- `buildScene()`/`toGLB()`는 **0.0254를 곱한 미터, Y-up**(`(x, y, z) → (x, z, -y)`)으로 이미 바꿔 준다. 이 구현은 인치→미터 변환을 다시 하지 않는다. 그 사실은 보고서의 `coordinates`에 모든 보고서 공통 값으로 남긴다.
- 사용자가 고르는 단위는 "원본 숫자 1이 실제로 무엇을 뜻했는가"이며, OpenSKP가 이미 곱한 0.0254를 1배로 둔 **상대 배율**(`unitMeters / 0.0254`, 인치는 정확히 1)만 적용한다. 선택은 언제나 `size.openSkpMeters`(보정 전 크기)에서 다시 계산한다.
- 배율은 GLB의 JSON 청크에서 장면 루트 노드들을 `SKP_unit_scale` 노드 하나로 감싸는 방식으로 적용한다. 정점 버퍼·접근자·텍스처는 한 바이트도 바뀌지 않는다.
- `studio-bg3d-model-scale-contract.ts`의 "로더가 환경이 아닌 모델의 가장 긴 변을 2로 맞춘다" 규칙과 충돌하지 않는다. 로더 정규화는 크기와 무관하게 적용되므로, 이 보정은 **보관되는 GLB의 실제 크기**(보고서·DCC 내보내기·실제 크기 배치가 읽는 값)를 바로잡는 역할이다.
- 크기 평가(`assessStudioBg3dSkpSize`)는 항상 m·cm·mm·inch 네 후보를 계산한다. 0.05–500m에 드는 후보만 "그럴듯함"이며, 파일이 선언한 단위(2021 이후만)가 그럴듯하면 그 단위를 우선 추천한다.

## 오류 분류와 사용자 안내

가져오기 오류 코드(`StudioBg3dModelImportErrorCode`)는 변환 단계의 코드와 같은 문자열이다. 메시지는 `studio-bg3d-model-import-shared.ts`에 있고, 모든 실패 메시지가 "SketchUp에서 GLB 또는 DAE로 내보내 가져오기"(또는 그에 준하는 조치)를 안내한다. 성공한 척하거나 조용히 건너뛰는 경로는 없다.

| 코드 | 의미 | 사용자 조치 |
| --- | --- | --- |
| `skp-too-large` | 원본 또는 압축을 푼 모델 데이터가 상한 초과(계획 단계 32MiB, 프로필별, Worker 없음 2MiB), 메모리 부족 | 쓰지 않는 컴포넌트·텍스처를 정리하거나 GLB·DAE로 내보내기 |
| `skp-timeout` | 90초 초과로 Worker 종료 | 컴포넌트·폴리곤을 줄이거나 GLB·DAE로 내보내기 |
| `skp-unsupported-version` | SketchUp 2013 이전 파일 | 최신 SketchUp에서 다시 저장하거나 내보내기 |
| `skp-empty-scene` | 보이는 형상 없음(모두 숨김 등) | 숨김·배치 확인 후 필요하면 내보내기 |
| `skp-cancelled` | 사용자가 단위 질문에서 취소 | 장면·라이브러리 변경 없음 |
| `skp-parse-failed` | 손상·비SketchUp·구형 등 구조 해석 실패 | GLB·DAE로 내보내기 |
| `skp-converter-unavailable` | 변환기 로드 또는 Worker 실행 실패 | 잠시 후 재시도하거나 내보내기 |

전체 가져오기를 사용자가 취소하면 다른 형식과 같은 `aborted`로 끝난다. 코드 안의 세부 원인(`reason`)은 진단·테스트용이며 사용자 문구가 아니다.

## 변환 보고서 v1 — 안정 계약

스키마 정본은 `studio-bg3d-skp-import-report.ts`의 `studioBg3dSkpImportReportSchema`(zod)다. 보고서를 만드는 쪽(`studio-bg3d-skp-report-builder.ts`)은 zod 없이 이 타입만 `import type`으로 쓰고, 변환 Worker의 모듈 그래프에는 zod가 들어가지 않는다(`studio-bg3d-skp-worker-boundary.test.ts`가 고정). `kind = "toonstudio-bg3d-skp-import-report"`, `version = 1`. 컴포넌트·태그·장면 이름 연결(SKP 사이드카)과 이름 검색은 저장된 `skpImport`의 이름만 읽는다([3D 장면의 컴포넌트·태그·장면 정보](bg3d-components-tags-scenes.md)).

| 필드 | 내용 |
| --- | --- |
| `source` | `byteSize`, `container`(`vff`·`legacy`·`unknown`), `sketchupVersion`, `sketchupMajor`, `sketchupLabel`(예: "SketchUp 2021"), `declaredUnits`(2021 이후만, 없으면 `null`) |
| `conversion` | `converter`(`openskp`), `execution`(`worker`·`main-thread`), `elapsedMs`, `textures`(`embedded`·`omitted`·`none`), `metadataPass`(`done`·`skipped-large`·`failed`), `hiddenFacesExcluded`, `primitivesBeforeMerge`, `primitivesAfterMerge` |
| `coordinates` | 항상 같은 값: 원본 inch·Z-up, 출력 meter·Y-up, `metersPerSourceUnit = 0.0254` |
| `units` | `appliedUnit`(m·cm·mm·inch), `scaleFactor`(인치 기준 상대 배율), `userSelected` |
| `size` | `openSkpMeters`(보정 전), `meters`(보정 후), `maxExtentMeters`, `level`(`ok`·`too-small`·`too-large`), `recommendedUnit`. 형상이 없으면 `null` |
| `counts` | `sourceFaces`(2차 파싱을 못 했으면 `null`), `vertices`, `triangles`, `materials`, `textures`, `texturesReferenced`, `instances` |
| `names` | `components`·`tags`·`scenes` 각각 `{ available, items, total, truncated }`. `available = false`는 "읽지 못함"이며 빈 목록과 구분한다 |
| `warnings` | `{ code, severity(info·warning), count, detail }` 최대 24개 |

경고 코드: `empty-scene`, `size-abnormal`, `unit-override-applied`, `high-polygon-count`, `flipped-faces`, `orientation-check-skipped`, `texture-missing`, `texture-unsupported-format`, `textures-omitted`, `hidden-instances-included`, `hidden-tags-included`, `metadata-unavailable`, `main-thread-fallback`.

규칙:

- **v1 필드의 의미는 바꾸지 않는다.** 필드를 더하거나 의미를 바꾸면 `version`을 올리고 이전 버전 읽기(migrate)를 함께 둔다. 경고 코드를 더하는 것은 호환이지만 기존 코드의 의미는 유지한다.
- 이름(컴포넌트·태그·장면)은 파일 안의 **신뢰할 수 없는 텍스트**다. 제어 문자는 제거했고 80 코드 포인트·목록당 64개로 제한했을 뿐 마크업을 이스케이프하지 않았으므로 소비자는 텍스트로만 렌더해야 한다.
- 이름 중복은 제거하고 첫 등장 순서를 유지한다. 컴포넌트 이름은 배치된 인스턴스의 정의 이름이며, 배치되지 않은 정의는 담지 않는다.
- "뒤집힌 면"(`flipped-faces`)은 용접한 정점(0.1mm 격자)에서 정확히 두 삼각형이 공유하는 경계 가운데 두 삼각형이 같은 방향으로 지나가는 경계의 수다. OpenSKP의 정점 법선은 면 방향에서 만들어져 법선 기반 검사는 항상 0이라 쓰지 않았다.
- 검증은 `parseStudioBg3dSkpImportReport`로 한다(Worker 응답과 저장소 값 모두). 올바르지 않은 값은 부분 복구 없이 `null`이다.

### 자산 메타데이터 저장

`studio-bg3d-asset-metadata.ts`의 기록(V2 이상, 2026-10-16 현재 V3)에 선택 필드 `skpImport`(보고서 v1)를 둔다. `STUDIO_BG3D_ASSET_FORMATS`에 `skp`를 추가했다. 버전 3은 권리 영수증에 AI 사용 표기 두 칸을 더한 변경이며 [권리 중심 3D 소재 브라우저](bg3d-asset-rights-browser.md)가 다룬다.

- 형식이 `skp`인 V2 이상 기록에만 보존한다. V1 기록과 다른 형식에 붙은 값은 버린다. V2 기록은 읽을 때 V3으로 올려 읽으며 `skpImport`는 그대로 유지된다.
- 스키마 검증, 이름·경고 상세·버전 문자열의 텍스트 안전 검사(마크업·URL·비밀 값 금지), 24KiB 크기 한도를 통과하지 못한 보고서는 **기록 전체를 무효로 만들지 않고 보고서만 버린다.** 걸러진 이름은 목록에서 빠지고 `truncated`가 `true`가 된다. 같은 기록을 다시 정규화해도 결과가 같다(V12 저장소가 왕복 동일성을 검사한다).
- 가져오기 직후 기록하는 보고서는 이름을 목록당 16개로 줄인다(`total`은 유지). 원본 경로와 파일 이름은 저장하지 않는다.
- 같은 콘텐츠 해시의 기록이 이미 있으면 사용자 편집(즐겨찾기·태그·컬렉션)을 덮어쓰지 않도록 그대로 둔다. 저장하지 못해도 가져오기는 성공이며, 결과 카드가 그 사실을 알린다.
- 가져오기 권리 폼의 AI 사용 표기(선택)를 고른 경우 같은 기록의 권리 영수증(`rights.aiGenerated`, `rights.aiTraining`)에 함께 담긴다. 고르지 않으면(모두 "모름") 필드가 없고 미확인으로 읽힌다. 이 저장 결과(저장·기존 기록 유지·실패)는 가져오기 마무리가 돌려주어, 다른 형식의 결과와 합쳐 편집기 상태 줄(`role="status"`)로 사용자에게 알린다. 폼의 AI 답은 파일을 고르는 순간 비워지고 가져온 뒤에는 고칠 수 없다([권리 중심 3D 소재 브라우저](bg3d-asset-rights-browser.md)).
- **저장 시점과 한도:** 기록은 모델이 장면에 배치된 뒤 가져오기 마무리에서 저장한다. 가져오기 취소 신호를 받고, 저장소가 응답하지 않아도 15초 한도(`studio-bg3d-import-save-interrupt.ts`)에서 기다림을 멈춰 저장 실패로 알린다(저장소 쪽 작업이 이미 쓰는 중일 수 있어 "쓰지 않았다"는 보장은 아니다). 저장이 느려도 장면 배치는 멈추지 않지만, 마무리가 끝나야 썸네일 촬영이 시작되므로 그만큼(최대 15초) 늦어질 수 있다.
- **롤백 주의:** `skpImport`가 든 기록은 이 필드를 모르는 이전 코드에서 V12 매니페스트 왕복 검사에 걸려 `invalid-stored-metadata`가 될 수 있다. 또 V3 기록(AI 사용 표기 도입 이후에 쓴 기록)은 V2까지만 아는 이전 코드가 읽지 못한다. 메타데이터 저장소는 앞으로만 나아가는 변경으로 다룬다. 이미 열려 있던 옛 빌드 탭이 새 빌드가 쓴 기록을 읽는 경우의 위험(추정)은 [권리 중심 3D 소재 브라우저](bg3d-asset-rights-browser.md)의 "롤백 주의"에 적었다.

### 컴포넌트·태그·장면 이름 연결

2026-10-22 현재 위 이름 기록은 읽는 곳이 세 군데다. 상세 동작과 한도는 [3D 장면의 컴포넌트·태그·장면 정보](bg3d-components-tags-scenes.md)에 있다.

| 읽는 곳 | 하는 일 | 근거 |
| --- | --- | --- |
| 3D 장면 아웃라이너 "원본 SKP 이름" | 고른 오브젝트 중 .skp에서 온 모델의 컴포넌트·태그(레이어)·장면 이름을 **글자로** 보인다. 태그 규칙을 통과하는 이름만 "태그로 붙일 이름"으로 제안하고, 사용자가 눌러야 태그가 붙는다. 장면 이름은 메모 후보로만 보이며 "메모에 붙이기"로 초안에 더해도 "장면 정보 저장"을 눌러야 문서에 들어간다 | `studio-bg3d-skp-sidecar.ts`, `StudioBg3dOutlinerSkpSourceSection.tsx` |
| .skp를 가져와 배치하는 순간 | 배치된 노드에 컴포넌트 참조(`skp-<정규화 GLB 해시 앞 16자리>`, 이름은 모델 표시 이름)를 붙여 같은 .skp의 여러 인스턴스를 컴포넌트 묶음으로 보이게 한다 | `linkStudioBg3dSkpPlacement`, `studio-bg3d-editor-model-import-actions.ts` |
| 3D 모델 라이브러리 검색 | 저장된 이름(최대 48개)을 소재 이름과 함께 검색하고, 이름으로만 걸린 카드에는 "원본 이름 일치: …"를 보인다 | `studio-bg3d-asset-rights-view.ts`(`sourceNames`), `StudioBg3dAssetNameMatchHint.tsx` |

**되살리지 않는 것(가져오기 안내, 변환 보고서 자세히 보기, 아웃라이너에 같은 말로 적었다):** SketchUp의 컴포넌트 계층, 태그(레이어) 표시 상태, 장면(카메라). 이름만 이어 주므로 장면 이름도 카메라 위치나 표시 상태로 쓰이지 않는다.

**한계:** 이름은 보고서가 목록당 16개까지만 저장한다. 이름 기록은 .skp를 가져온 기기의 메타데이터 저장소에만 있어 다른 기기에서는 "이름 기록이 없어요"로 보인다. 컴포넌트 참조 자동 연결은 가져와 배치하는 순간에만 하고, 라이브러리에서 나중에 놓은 소재는 자동으로 묶이지 않는다. 이름은 파일 안의 믿을 수 없는 글자라 화면에는 글자로만 그리고, 문서에 옮길 때는 태그·메모 규칙(주소·자격 증명 모양·제어 문자 거절)을 다시 통과해야 한다.

### SketchUp 마스터 스튜디오 워크벤치 및 전체 장면 복원기 (2026-10-26)

> 2026-10-29 재검증: 아래 모듈 목록은 커널·예제의 존재를 설명하며 실제 SKP 가져오기에서 전체 장면이
> 복원된다는 뜻이 아니다. 실제 import는 재질별 world-baked 형상을 단일 GLB 모델로 반입한다.
> `full-scene-restorer`의 Page·태그·계층·주석 입력은 현재 작업대의 고정 예제에서만 호출되고,
> CAD 내보내기도 고정 상자 예제의 계산이다. 실제 장면에 연결한 건축·선택 배열은
> [배경 건축 도구](sketchup-background-modeling.md), 남은 전체 요구는
> [기능·검증 원장](sketchup-feature-coverage.md)을 따른다.

기본 에셋 라이브러리 가져오기(`skpImport` 보고서 v1)의 안정 계약을 변경하지 않고, 3D 전문가 워크벤치 허브(`StudioBg3dAdvancedWorkbenchHub.tsx`의 `sketchup-studio` 탭)와 전용 모듈을 통해 SketchUp의 고급 모델링·복원·내보내기 기능을 별도 제공한다(상세 REA 역공학 근거: [`docs/studio-rea-competitor-benchmark-2026-10-26.md`](../studio-rea-competitor-benchmark-2026-10-26.md)).

| 모듈 | 주요 제공 기능 |
| --- | --- |
| `studio-bg3d-skp-full-scene-restorer.ts` | `SkpModel.pages`(`eye`/`target`/`up`/`fov`/`parallel`/`orthoHeight`/`hiddenLayers`) → `StudioBg3dShot` 카메라 샷 복원, `SkpModel.layers`(RGB 색상·`hidden` 가시성) 복원, `buildInstancedScene` 16원소 행렬 TRS 분해 및 Dynamic Components(`dynamic_attributes`)·`IFC2x3` 속성 사전·내장 썸네일(`extractThumbnail`) 추출 |
| `studio-bg3d-sketchup-direct-modeling.ts` | Push/Pull 면 돌출 및 반대편 공면 벽체 창문·문 개구부 자동 관통(Coplanar Hole Cutting), 마이터 제한 다각형 오프셋(`Offset`), 3D 경로 스윕(`Follow Me`), VCB `*N`/`Nx`/`/N` 선형·원형 배열 복제, N각형/Bulge($\tan(\theta/4)$) 원호 생성 |
| `studio-bg3d-sketchup-guides-sections-dimensions.ts` | 줄자(`ConstructionLine` `±1e30` 무한 센티넬 클리핑 및 유한 가이드, `ConstructionPoint`), 각도기(`rise:run` 물매·각도 파서), 3D 치수선(`Dimension` 보조선·`<>` 동적 치수 치환), 3D 지시선 텍스트(`TextEntity`), 단면 평면(`SectionPlane` 메쉬 삼각형 절단선 및 단면 채움 Poché 면적) |
| `studio-bg3d-sketchup-styles-uv-engine.ts` | `.skp` `D307` 엣지 플래그(`0x01` hidden, `0x08` soft, `0x10` smooth) 디코딩, 6대 면 스타일(`wireframe`, `hidden-line`, `shaded`, `shaded-with-textures`, `monochrome`, `xray`) 및 엣지 모디파이어, 4-Pin 사영 호모그래피(`uvTransform` 3×3 행렬·`uvProjected`·`faceUvBasis`) UV 매핑 |
| `studio-bg3d-sketchup-shadow-and-exporter.ts` | 위도·경도·Solar North·날짜·시각·Light/Dark 슬라이더 기반 태양 고도·방위각 계산기(`ShadowInfo`) 및 OpenSKP `SkpBuilder.toBytes()` 네이티브 `.skp` v17 빌더 + `.dxf`·`.ifc`·`.obj`/`.mtl`·`.stl`·`.ply`·`instanced-glb` 다중 CAD 익스포터 |
| `StudioBg3dSketchUpWorkbenchPanel.tsx` | 3D 전문가 워크벤치 허브(`StudioBg3dAdvancedWorkbenchHub.tsx`) 내 SketchUp 마스터 스튜디오 통합 UI 패널 |

## 권리·출처·법적 고지

- `.skp`는 다른 3D 형식과 같은 **이용 권리 관문**을 쓴다. 권리 기록은 라이브러리 레코드의 `rights`로 저장되고, 이후 `createStudioGeneric3dRightsFromAttachment`가 같은 방식으로 생성형 3D 증거를 만든다. 새 관문은 없다. 권리가 `확인 전`이면 상업 이용이 보류된다.
- 3D Warehouse에서 받은 모델은 Trimble의 3D Warehouse 이용 약관과 게시자의 조건을 따른다. 앱은 약관을 대신 판단하지 않고 안내와 기록 수단만 제공한다.
- OpenSKP의 README는 이 프로젝트가 독점 바이너리 형식을 역공학해 만들어졌고 Trimble Inc.·SketchUp과 제휴하거나 보증받지 않았다고 밝힌다(원문: "This project was built by reverse engineering a proprietary binary format. It is not affiliated with or endorsed by Trimble Inc. or SketchUp.", `node_modules/openskp/README.md` 1.3.0). [2026-07-19 벤치마크](../studio-3d-webtoon-tool-benchmark-2026-07-19.md)는 "공식 브라우저용 JS/WASM 파서가 확인되지 않았으므로 무허가 역공학 파서를 넣지 않는다"("1. 최종 결론")고 적고 비공식 browser parser를 "채택하지 않음"("8.1 가능한 네 가지 경로")으로 분류했다. 현재 구현은 그 기준과 달리 MIT 라이선스 파서를 **브라우저 안에서만** 실행한다(서버 업로드 없음). 이 방침의 법무 검토는 이 문서가 확정하지 않으며 후속 확인 항목이다.
- OpenSKP는 `package.json`의 운영 의존성(1.3.0 고정)이고 MIT 표기는 기술 지도 라이선스 목록(`engineering-license-inventory.ts`)에 등록돼 있다. 배포 고지 생성기(`scripts/generate-third-party-notices.mjs`)의 출력에 openskp가 포함되는 것을 2026-10-15에 임시 경로로 생성해 확인했다. 정적 파일 `THIRD_PARTY_NOTICES.md`는 2026-07-28 묶음 한정 목록이라 openskp 항목이 없다.

## 테스트와 검증

`apps/web/src/domains/creator/bg3d/`의 `studio-bg3d-skp-*.test.ts(x)`, `StudioBg3dSkpImportPanel.test.tsx`, `StudioBg3dAssetLibraryPanel.skp.test.tsx`, `studio-bg3d-editor-model-import-actions.skp.test.ts`가 다룬다. 바이너리 `.skp` 픽스처는 커밋하지 않으며, 입력은 코드에서 만든다(`studio-bg3d-skp.test-fixture.ts`와 openskp 작성기).

- 변환 본체: 성공, 파싱 실패, 빈 장면, GLB가 아닌 출력, 시간 초과, 취소, 대용량을 `OpenSkpModuleLoader` 가짜로 확인한다.
- Worker 클라이언트: 가짜 Worker로 종료·취소·시간 제한·폴백 정직성을 확인하고, Worker를 만들기 전 사전 검사(시그니처·버전·크기·압축 해제 모델 데이터)가 Worker 생성 없이 실패하는지 확인한다.
- Worker 진입점과 로더: 가짜 `self` 위에서 실제 진입점의 요청 검증·진행 보고·GLB 전송·오류 매핑·단일 요청 규칙을 확인하고(`studio-bg3d-skp-worker-entry.test.ts`), openskp 로드 실패·API 불일치·실패 후 재시도를 확인한다(`studio-bg3d-skp-worker-runtime.test.ts`).
- 실제 openskp 왕복: 작성기가 만든 실제 `.skp` 바이트로 단위·이름·면 방향·텍스처·숨김 처리를 확인한다.
- 화면: 안내·진행·단위 질문(키보드·초점·Escape)·결과 카드, 자산 라이브러리 패널에서의 권리 관문 공유와 안내 마운트.
- 계약: 보고서 스키마, 메타데이터 왕복(IndexedDB, V12 매니페스트), 형식 매트릭스(`studio-dcc-format-matrix.test.ts`), 매뉴얼 상수 일치.
- 이름 연결(2026-10-22): `studio-bg3d-skp-sidecar.test.ts`(이름 읽기·컴포넌트 참조·태그 제안·메모 후보), `studio-bg3d-asset-source-names.test.ts`(검색용 이름 모으기), `StudioBg3dAssetLibraryPanel.names.test.tsx`(이름 검색과 일치 안내), `StudioBg3dSkpImportPanel.sidecar.test.tsx`(되살리지 않는다는 안내), `StudioBg3dSceneOutliner.organization.test.tsx`(원본 SKP 이름 보기).

```sh
pnpm exec vitest run apps/web/src/domains/creator/bg3d/studio-bg3d-skp apps/web/src/domains/creator/bg3d/StudioBg3dSkpImportPanel.test.tsx
```

## 알려진 한계와 후속 작업

- 실제 사용자 `.skp` 코퍼스(대형·구형·3D Warehouse 모델) 검증은 없다. 현재 검증은 openskp 작성기와 합성 바이트까지이며 시중의 모든 변형을 대표하지 않는다.
- 변환 후 단위 재적용은 **저장 전 질문**으로만 제공한다. 이미 저장된 모델의 단위를 바꾸려면 다시 가져와야 한다.
- 실제 브라우저(Worker·메모리 한도)에서의 대형 파일 성능은 측정하지 않았다. 한도 값은 2026-10-15 Node 24(4 vCPU)에서 openskp 작성기로 만든 레거시 파일(사각형 면만)을 `buildScene()`+`toGLB()`한 측정을 바탕으로 한 추정이다: 5천 면 1.6MiB 0.6초(프로세스 최대 RSS 증가 약 65MiB), 2만 면 6.9MiB 1.3초(약 260MiB), 10만 면 35MiB 14초(최대 RSS 1.1GiB, 작성기가 쥔 메모리 포함). `parseSkp()`(이름·단위 읽기)는 10만 면에서 17.5초라 24MiB 초과 파일은 건너뛴다. 파일 1MiB당 힙이 대략 20–40MiB 늘어나는 셈이지만, OpenSKP README는 실제 모델에서 이보다 훨씬 크게(113MB 파일에 Node 힙 8–16GB) 늘 수 있다고 밝힌다. 그래서 32MiB(데스크톱)·16MiB(모바일)는 안전 보장이 아니며, 메모리가 부족한 기기에서는 변환이 실패하거나 Worker가 중단될 수 있다(각각 `skp-too-large`, `skp-converter-unavailable`로 알린다).
- 컴포넌트·태그·장면 **이름**을 배치한 모델에 잇는 연동(SKP 사이드카)과 이름 기반 소재 검색은 2026-10-22에 더했다(→ "컴포넌트·태그·장면 이름 연결"). 컴포넌트 계층, 태그(레이어) 표시 상태, 장면(카메라)을 장면 그래프로 **되살리는 일은 하지 않았다(이 변경의 범위 밖).** 보고서 v1은 이름만 담고 있어 되살리려면 계약부터 넓혀야 한다(필드를 더하면 `version`을 올리고 이전 버전 읽기를 둔다).
- SKP Worker는 `scripts/check-studio-bundle.mjs`의 격리 Worker 예산(OBJ·PSD·물리 등)에 아직 등록되지 않았다. 전체 빌드를 돌리지 못해 실제 산출물 크기는 확인하지 못했다. Worker 진입점만 따로 번들한 추정(Vite 8, 2026-10-15)은 진입 청크 약 25KB(gzip 9.6KB)와 지연 로드되는 openskp 청크 약 240KB(gzip 68KB)다.
- 이 표면의 문구는 같은 디렉터리의 다른 3D 패널처럼 한국어 리터럴이며 i18n 키로 옮기지 않았다(2026-10-22에 더한 이름 연결 문구는 키 기반 `studio.bg3dScene.*`이고, 범위 안내 한 문장 `studio.bg3dScene.skp.importScope`가 이 패널의 안내와 보고서에 들어간다). 2026-10-16에 더한 AI 표기 저장 결과 안내 문구도 같은 방식(해요체, 실패에는 다음 행동)이며 번역 키 전환은 후속이다.

## 관련 문서

- [3D 장면의 컴포넌트·태그·장면 정보](bg3d-components-tags-scenes.md) — 이름 기록을 읽어 장면에 잇는 사이드카, 라이브러리 이름 검색, 되살리지 않는 범위
- [3D 배경 커스텀 모델 업로드 통합 설계](../studio-bg3d-custom-model-upload.md) — 다른 형식과 공통 가져오기 경계
- [3D 웹툰 도구 벤치마크 2026-07-19](../studio-3d-webtoon-tool-benchmark-2026-07-19.md) — 역사 자료. SKP 정책 결정의 당시 맥락
- [3D 활용 가이드](../../STUDIO_3D_DCC_MANUAL.md) — 사용자 매뉴얼(생성 문서)
- [Hybrid 3D DCC 엔진 아키텍처 2026-08-03](../studio-hybrid-dcc-engine-architecture-2026-08-02.md) — 역사 자료. 포맷 표의 SketchUp `C`(공식 SDK/extension bridge) 행은 이 구현 이전의 목표이며, 브라우저 직접 변환(`B`, 부분 지원)의 현재 사실은 이 문서와 등급표(`studio-dcc-format-matrix.ts`)를 따른다.
