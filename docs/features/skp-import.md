# SketchUp(.skp) 가져오기

- 상태: **current** — 소스와 테스트로 확인되는 현재 동작이다.
- 확인일: 2026-10-16 (`apps/web/src/domains/creator/bg3d/studio-bg3d-skp-*`). 2026-10-16에 자산 메타데이터 저장 절(AI 표기 결과 안내, 취소 신호와 시간 한도)을 고쳤다. 2026-10-22에 컴포넌트·태그·장면 **이름** 연결(SKP 사이드카)과 이름 검색을 더했다(→ "컴포넌트·태그·장면 이름 연결").
- 변환기: [openskp](https://openskp.com/) 1.3.0 (MIT, 순수 TypeScript). **Trimble과 관련 없는 비공식 오픈소스 파서**이며 SketchUp은 Trimble Inc.의 상표다.
- 범위: 배경 3D 에셋 라이브러리의 "3D 모델 및 연결 파일 가져오기"가 받는 `.skp`. 네이티브 SketchUp SDK·서버 변환·SketchUp 확장은 포함하지 않는다.

## 한눈에 보기

`.skp`를 고르면 브라우저 안에서 자체 포함 GLB로 변환해 기존 GLB 가져오기 경로(검증 Worker, 기기별 예산, 라이브러리 저장)에 합류한다. 파일은 외부로 전송하지 않는다. 변환은 요청마다 새로 만든 전용 Worker에서 실행하고, 끝나거나 취소·시간 초과가 되면 Worker를 종료한다.

지원은 **부분 지원**이다. 모든 `.skp`가 변환되지는 않고, 정적 형상·재질·텍스처만 가져온다(장면 카메라·애니메이션은 가져오지 않는다). 변환이 끝나면 **변환 보고서 v1**(아래 "안정 계약")을 결과 화면에 보여 주고, 가져오기에 성공한 모델의 보고서는 자산 메타데이터(`skpImport`)에 함께 저장한다.

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
                 preflight(크기·매직·버전·모델 데이터) → buildScene → 재질별 병합 → 형상 분석 → toGLB → 보고서
     → (크기 비정상) 단위 질문 → scaleStudioBg3dGlbUniformly   studio-bg3d-skp-glb-scale.ts
     → 기존 parseGlbSourceImport → 검증 Worker·예산 → 라이브러리 → 장면 배치
     → run.complete → 결과 화면(studio-bg3d-skp-import-session) + 자산 메타데이터(skpImport)
```

| 모듈 | 역할 |
| --- | --- |
| `studio-bg3d-skp-contract.ts` | 한도 상수, 단계, 오류 코드·분류, 오류 클래스(최하위, three.js·openskp 무의존) |
| `studio-bg3d-skp-preflight.ts`, `studio-bg3d-skp-zip-index.ts` | 크기·시그니처·헤더·버전·압축 해제 모델 데이터 크기 사전 검사(ZIP 중앙 디렉터리 판독기 포함) |
| `studio-bg3d-skp-conversion-core.ts` | 변환 본체. `OpenSkpModuleLoader`를 주입받아 테스트에서 가짜로 바꾼다 |
| `studio-bg3d-skp-worker-*.ts`, `studio-bg3d-skp.worker.ts` | Worker 메시지 계약, 런타임, 진입점, 클라이언트 |
| `studio-bg3d-skp-unit.ts`, `studio-bg3d-skp-glb-scale.ts` | 단위 평가·후보, GLB 균일 배율 |
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

가져오지 않는 것: 장면(카메라) 상태, 애니메이션, 태그 가시성 설정, 컴포넌트 계층 자체(이름만 보고서에 담는다). 이름은 배치한 모델에 **이름으로만** 연결되며 이 한계는 2026-10-22 연결 이후에도 그대로다(→ "컴포넌트·태그·장면 이름 연결"). SketchUp에서 **숨긴 면**은 변환에서 제외하지만(`respectEdgeVisibility`), **숨긴 컴포넌트·숨긴 태그의 형상은 결과에 포함될 수 있다**(보고서에 `hidden-instances-included`·`hidden-tags-included` 경고). 이름은 읽을 수 있는 범위만 담는다: 장면 이름과 파일에 적힌 표시 단위는 2021 이후 형식에서만 읽을 수 있고(레거시는 둘 다 비어 있다), 태그의 숨김 표시는 OpenSKP가 읽은 값을 그대로 따른다. OpenSKP의 타입 주석(`Layer.hidden`)은 레거시에서만 채워진다고 적었지만 소스(`collectLayers`의 `8E3C`, 레거시 레이어 레코드)는 두 컨테이너에서 모두 읽으므로 이 구현은 컨테이너로 구분하지 않는다. 2021 이후 형식의 숨김 표시는 실제 파일로 검증하지 못했다(작성기가 레거시 형식만 만든다).

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
