# 선택형 로컬 Blender 장면 가져오기 — 2026-10-30

상태: **migration — main 병합·계약 회귀 완료, 수정 뒤 실제 UI 3종 검증 대기**.
기반은 `b54f66b58ea7f1aa99e36bfb5696a176489e01ef`의 작업 기록 복구와
`5cce6b15cc417033900e38992498d6a778dee4b4` main의 정상 병합이다.
이 문서는 운영 제공 또는 배포 완료 기록이 아니다.

웹 편집의 기본 경로는 Blender 설치나 원격 서버 없이 계속 동작한다.
이 추가 경로는 사용자가 이미 가진 `.blend`를 변환하려고 선택했을 때만 이 컴퓨터의
ToonBridge와 Blender를 사용한다. 원격 데스크톱·iframe·`/studio/blender` 링크를 추가하지 않는다.
`.blend` 자체의 브라우저 디코딩 구현으로 설명하지 않으며, 현재 native 가져오기가 지원하는
GLB·glTF·VRM·OBJ와 구분한다.

## 사용자 동작과 결과

BG3D 에셋의 로컬 Blender 패널에서 연결을 확인하고 Pack Resources로 저장한 `.blend`를 고른다.
GLB 변환, 저장된 카메라·현재 프레임 PNG, Freestyle 선화 PNG 중 사용자가 누른 작업 하나만 생성한다.
외부 연결 텍스처나 `.blend` 외의 파일은 자동 전송하지 않는다.

- GLB는 결과를 검증한 뒤 기존 `importModelFiles(files, rights, signal)`에 직접 전달한다.
  기존 폼의 이용 권리와 이번 파일의 AI 생성·학습 이용 답을 함께 보낸다. 모델 변환·기기 예산·
  구조·정규 GLB 검사·라이브러리 기록·장면 배치는 기존 권위가 담당한다.
  모델 검증이 수락한 경우에만 성공을 안내한다. AI 답은 정규 가져오기에 파일을 넘긴 뒤 같은
  소유 범위·권리·권한이면 수락·거부·취소와 관계없이 소비해 다음 파일에 따라가지 않게 한다.
  정규 가져오기 전의 변환 실패는 답을 유지하고, 다른 범위나 새로 고른 답은 초기화하지 않는다.
- PNG 두 종류는 검증한 파일을 저장한다. BG3D 모델이나 캔버스 이미지 삽입으로 전달하지 않는다.
- 연결은 `localhost`, `127.0.0.1`, `[::1]`의 HTTP/HTTPS만 이 경로에서 허용한다.
  기존 범용 ToonBridge 설정의 다른 HTTPS 주소로 원본을 보내지 않는다.
- 실패·취소·처리 여부가 불명확한 작업은 자동으로 다시 생성하거나 시작하지 않는다.
  AI 요청이나 운영자 유료 추론으로 전환하는 동작도 없다.

## 소유권과 중단

`StudioCuttoonEditorPanels`는 기존 문서 편집의 mutation ticket을 로컬 도구 결과에도 제공한다.
actor와 인증 세대, canonical project/document/runtime instance, 페이지·배경 대상, 편집 권한·문서 세대,
연결 client, 권리 답, disabled 상태를 실행에 결합한다. 하나라도 교체되면 원래 요청을 취소하고
늦은 진행·GLB 전달·PNG 저장을 차단한다. A→B→A 이동도 이전 요청을 되살리지 않는다.
정규 모델 가져오기를 시작한 뒤에는 같은 취소 신호를 전달한다. 가져오기 자신이 올린 busy는
취소 원인이 아니며 다른 가져오기가 시작되면 진행 중 변환을 중단한다.
AI 답 소비 여부는 완료 정리 전에 같은 소유 범위인지 고정하고, active·busy 정리 뒤 한 번만 초기화한다.
자기 폼 초기화로 아직 진행 중인 신호를 다시 취소하거나 정상 완료 콜백을 두 번 부르지 않는다.

실행기 작업에는 현재 canonical `projectId`를 기록한다. 프로젝트가 없는 초안·레거시 경로는
명시적인 `null` 범위다. 탭의 과거 프로젝트 문맥을 임의로 가져오지 않는다.
작업 생성 응답은 실행기가 새로 발급한 ID를 검증 후 고정하고, 이후 업로드·시작·조회·취소는
같은 작업과 프로젝트의 응답만 수락한다. 원격 생성 응답을 잃었으면 존재 여부와 중단 여부를
모른다고 안내한다. 이미 확인한 작업의 중단 응답도 확인하지 못했으면 취소 완료로 표시하지 않는다.
확인되지 않은 다른 ID를 대신 취소하지 않는다.

장면 모델 가져오기는 취소 뒤 비동기 준비가 완료되어도 장면을 변경하지 않는다.
이미 완료된 라이브러리 저장은 취소를 이유로 임의 삭제하지 않는다. 캐시는 자신이 준비한
미반영 항목만 기존 소유권 검사에 따라 정리한다.

## 결과 검증과 후보 의존성

### 작성 중 — 서비스 revision 확인 후속 보강

기존 protocol v2와 Blender 설치 여부만으로는 현재 프레임 보존 어댑터를 확인할 수 없다.
후속 소스는 **ToonBridge 서비스 revision `0.2.0`만 정확히 지원**한다.
이는 Blender 바이너리의 `5.2.0` 같은 버전과 별개다. protocol 번호와 일반 v2의 status·job schema는 유지한다.
패널은 연결 상태의 revision이 미지원·미확인으로 바뀌면 같은 client라도 진행 중 작업을 취소한다.
helper는 명시적으로 누른 실행마다 `client.status(signal)`을 새로 한 번 확인하며,
응답 뒤 취소·소유 범위를 다시 확인한 후에만 원본 바이트를 읽거나 작업을 생성한다.
구 버전·미확인·malformed·prerelease와 상태 확인 실패는 업데이트·재연결 안내로 중단하고 자동 재시도하지 않는다.

이 서비스 번호 상승은 root 소유 CLI 보존 7파일의 완료 커밋과 함께 반영하는 계약이다.
현재 작성 중인 BG3D 브랜치에는 CLI 보존 스크립트가 아직 병합되지 않았다.
번호만 오른 daemon을 완료된 어댑터로 간주해 실행하거나 릴리스하지 않는다.
후속 회귀는 작성 상태이며, 기존 136개 통과 기록을 후속 소스 검증으로 재사용하지 않는다.

### 기존 후보의 파일 정합성 검사

입력 SHA-256, 요청 명세·프로젝트·원격 ID, 출력 MIME·크기·SHA-256,
도구·작업·라이선스·원본과 입력/출력 digest를 포함한 실행 영수증을 대조한다.
GLB는 버전·전체 길이·JSON/BIN 청크·asset 버전을 확인하고 이후 정규 모델 검증으로 보낸다.
PNG는 signature·IHDR·크기·청크 순서·CRC·IDAT/IEND를 확인한다.
이 구조 검사는 PNG 전체 디코딩이나 실제 렌더 결과의 시각 품질 검증과 구분한다.

이 후보는 독립 보존 중인 ToonBridge CLI 변경의 완료 커밋을 함께 병합해야 한다.
대상은 `blender-export-glb.py`, `blender-line-art.py`, 새 `blender-render-scene.py`,
`command-plans.mjs`와 관련 Node·실제 Blender fixture 및 README다.
저장된 현재 프레임·카메라 보존, autoexec 차단, 형상 키 보존, compositor의 추가 파일 출력 차단은
그 CLI 계약에 의존한다. CLI 최종 실제 fixture가 끝나기 전에는 이 기능의 실물 검증을 완료했다고
주장하지 않는다. 원본 `.blend` 불변도 최종 실제 fixture에서 다시 확인해야 한다.

## 검증 경계

로컬에서 작은 Vitest 스위트는 worker 한 개로 실행한다. helper의 실제 v2 ID 재발급·영수증·
출력 구조·취소·자동 재실행 금지, 패널의 소유 범위 교체·권한·지연 결과·직접 모델 검증 대기,
기존 권리·AI 폼과 정규 가져오기 접점을 확인한다. 정확한 수량·명령·결과와 파일 SHA는
저장소 공통 Git 디렉터리의 `cleanup-evidence-20261030/bg3d-local-blend`에 보존한다.

공용 실행 순서에 따라 전체 TypeScript, `pnpm harness:verify`, 제품 빌드, 실제 브라우저,
실제 Blender→검증 GLB→BG3D 장면 소비와 PNG 전체 디코딩·저장 검증은 아직 실행하지 않았다.
집중 단위 테스트는 이 검증을 대신하지 않는다.

## 2026-10-31 현재 검증과 남은 실제 작업

앞의 독립 후보·CLI 미병합·전체 검사 미실행 문구는 각 기준 SHA에서 작성한 이력으로 보존한다. 현재 영수증 계약 수정은 [PR #2620](https://github.com/blue45f/toonstudio/pull/2620)의 source `fe0102d0a9a54b5092e5a43cfbb1a9a30e5d1a7a`에서 정상 게시되어 main `bb7ff5075aaad4de74ccdb172a2abb877d0be38b`에 병합됐다. 이 병합을 운영 배포나 실제 UI 작업 완료로 해석하지 않는다.

수정 전 실제 UI r7은 **session 56592·종료 1**이었다. 문서 권한이 전달된 화면에서 실행기 필드 활성화·연결과 첫 GLB 작업의 생성 201·시작 200·Blender 완료 응답까지 확인했다. 완료 영수증의 `toolVersion`은 전체 버전 출력 500자였고, 웹 계약의 최대 160자 검증에서 거부됐다. 뒤이은 completed 취소 응답도 같은 검증을 통과하지 못해 결과 GET은 0회, 검증 완료 job은 0개였다. 당초 cleanup의 HTTP timeout 실패 기록은 보존하며, 후속 소유 서비스 3개의 정상 종료 **session 21880·종료 0**과 구분한다.

수정은 새 영수증과 기존 완료 작업의 공개 응답에서 버전 첫 줄만 trim해 최대 160자로 기록한다. probe 상세 500자와 기존 raw manifest는 보존하고, 클라이언트 schema·권한·입출력 digest·소유 범위 검증은 유지했다. source `fe0102d0a9a54b5092e5a43cfbb1a9a30e5d1a7a`의 게시 검사 **session 63323·종료 0**에서 Node 5개·웹 103개 시험, base `2d54336c67e5c902e044ea4aec5201bccb9db5f6`의 범위 하네스와 정상 push를 통과했다. 실제 r7 manifest의 별도 client Zod 확인 **session 41380·종료 0**은 최초 거부 항목이 `receipt.toolVersion:too_big` 하나임을 확인했고, 공개 버전이 500자에서 첫 줄 17자로 정규화된 뒤 수락되며 원본 manifest와 결과 파일이 유지됨을 확인했다. 이 검사는 새 Blender 작업이나 UI 재실행이 아니다.

main `bb7ff5075aaad4de74ccdb172a2abb877d0be38b`의 production bundle은 **session 62947·종료 0**으로 빌드·정적 bundle 구조 검사·postbuild CSP 검사를 통과했다. 완료 영수증 `cpu-r1-mainbb7-build-r3/completion.json`의 SHA-256은 `84ac4e137a6ff9fd55ca0a980c43ec41850cab46feceb27bb6d36bc1783430b2`이다. 동일 제품 소스의 후속 QA는 이 산출물을 재사용하며, 정적 검사 통과를 실제 Blender UI 작업 통과로 해석하지 않는다.

수정 뒤 실제 UI r8은 **session 18438·종료 1**, `actual-login` 단계의 `REQUEST_ORIGIN_GUARD_REJECTED`로 중단됐다. QA 요청 guard가 공개 CSS의 `fonts.gstatic.com/l/font` GET 12회를 거부해 native 작업 생성 시도와 검증 완료 job은 모두 0이었다. supervisor의 cleanup 확인은 true였고, 후속 소유 서비스 종료 **session 89471·종료 0**, 다른 세션 프로세스에 보낸 신호 0을 확인했다. 이 실패는 제품의 GLB 변환·가져오기 실행 결과를 새로 제공하지 않는다.

이후 QA driver만 이미 허용한 공개 CSS가 선언한 font URL의 GET을 정확히 허용하도록 보정했다. 구문 확인과 오프라인 VM 24개 검사는 통과했으며 제품 소스는 바꾸지 않았다. 실제 UI r9는 로그인을 통과한 뒤 `actual-canonical-documents` 단계에서 `wss://www.toonstudio.cloud/socket.io/` GET 1회를 요청 guard가 거부해 **session 99556·종료 1·15.24초**로 중단됐다. native 작업 생성 시도와 검증 완료 job은 모두 0이며 supervisor cleanup 확인은 true였다. 후속 소유 서비스 종료 **session 71439·종료 0**, 알려진 소유 PG 잔류 0과 다른 세션 프로세스에 보낸 신호 0을 확인했다. 실제 반환 기록 `root-r9-actual-return.json`의 SHA-256은 `fb5a4dd9b8df5dc73946268075cbbe96f8b86d83186e58f14503f426a9a5a70a`이다. 읽기 전용 확인에서 번들의 `VITE_STUDIO_LIVE_ORIGIN`이 운영 URL로 고정돼 있음을 확인했으며, 후속 로컬 검증용 빌드의 연결 설정 보정은 아직 실행하지 않았다. GLB의 정규 가져오기·장면 반영, render-scene·line-art 두 PNG 작업과 전체 디코딩·저장·재열기, 문서 A/B 보존 등 실제 3종 작업 범위는 미검증으로 남아 있다. 과거 r7·r8·r9 실패나 단위 검사를 새 실제 UI 통과로 합산하지 않는다.
