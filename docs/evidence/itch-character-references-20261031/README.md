# Characters 2 참고 이미지 재생성 — 2026-10-31

상태: **migration — 통합 정규화기로 실제 재생성·출력 검증·로컬 후보 반영 완료**.
기준 작업트리는 `codex/character-references-main-20261030`이며, 실행 중 HEAD는
`a0b877c2d22a4f357400e5d69796e797ba96df2f`, 진행 중인 main 병합 입력은
`5cce6b15cc417033900e38992498d6a778dee4b4`였다. 최종 브랜치의 추가 검사·커밋·원격
반영은 이 렌더 증거와 별도 단계다. 운영 배포·R2 업로드는 수행하지 않았다.

## 실제 실행과 입력 보존

공식 `scripts/render-creator-bundle-assets.py`를 같은 8개 선정 입력으로 `--dry-run`한 뒤,
`--publish --append-only`로 정확히 한 번 렌더했다. 대상은 main 기준 182행을 복원한 비공개
작업 팩이었다. `--reuse-renders`는 사용하지 않았다. 공식 생성기에 포함된 원장 읽기와
권리·파일 검증도 그대로 실행했다.

기존 소유 실행기 하나가 작업 880초와 정리 20초의 한도를 관리했다. 실제 전체 시간은
22.732초였으며 사전 검사·렌더·후검증의 자식 종료 코드는 각각 0이었다. 실행기 최종 종료
코드도 0이고 강제 정리·신호·관측 오류는 없었다. 관찰한 10개 PID와 소유 PG의 종료 후
일치 행은 0개였다. 관찰하지 않은 분리 후손 전체까지 없었다고 주장하지 않는다.

각 단계 전후 소스·준비 metadata 16개, 원본 GLB 4개와 승인 PNG 2개의 핀 및
HEAD/MERGE_HEAD를 대조했다. 원본을 다시 저장하거나 재색칠·UV 변경하지 않았다.

| 실행 소스 | SHA-256 |
| --- | --- |
| 정규화기 | `24ff20a62a67a9e0b4799c94bf1e5189c069b2892499e1ccfaad03b14f49768c` |
| 준비 정책 | `ae1b21eb5d28a59e7e94f56b922a3f12724be3dc356a0fe2e07a14cf40b2db46` |
| Blender helper | `6abff996a25f10deb6bd2d13f45169607404e2e08ed74cff0dcd9f721c2d0326` |
| 공식 생성기 | `637f91aee958225993e4fc4b7b9e3ccb06a624117a90c93fdbe0e7407093a90a` |

## 결과와 증거 경계

- 기존 182행의 내용·순서와 이미지 356파일의 크기·SHA를 모두 보존했다.
- 새 8개 ID와 본문·썸네일 16파일만 더해 전체 190행·373파일임을 확인했다.
- 본문 1536×1536, 썸네일 384×384를 각각 Pillow 13.0.0에서 verify·재열기·전체 load했다.
- 본문 RGBA의 공식 LANCZOS 축소와 썸네일 전체 RGBA가 오차 없이 같았다.
- 이전 8종의 본문·썸네일과 새 결과의 SHA·전체 RGBA·소비 필드가 모두 같았다.

이 동일성은 해당 이미지에 대한 기존 시각 증거 재사용의 근거다. 최신 앱 전체 UI,
원격 인증 저장·협업·브라우저 성능이나 운영 배포를 새로 검증한 결과가 아니다.

[실제 helper proof](render-proof.json)는 최상위 v1, entry의 입력 지문은 v2다.
공식 생성기가 작성한 바이트를 편집 없이 복사했으며 SHA-256은
`33fcddca7813f9f7163551ffd72f1de4442c0898e0b5ad8cffd39592ca06e55f`다.
원본 렌더 PNG는 생성기 내부에서 검증한 뒤 임시 폴더와 함께 정리된다. 후검증은 남은
무손실 WebP를 검사했으며 PNG를 재생성하거나 독립 재해시했다고 보고하지 않는다.

2026-10-29의 proof와 화면 증거는 역사 기록으로 그대로 보존했다. 새 proof의 지문을
과거 proof에 덮어쓰거나 지문 문자열만 고쳐 검사를 통과시키지 않았다.

검증된 비공개 결과는 공식 `publish_pack`의 기존 snapshot 비교로 소유 후보 팩에 반영했다.
이전 snapshot `df45d768685c2ef1c1700a26e232cc62f0b7efd10eb516bea8bfeadb6b938d46`과
일치할 때만 교체했으며, 최종 후보와 비공개 검증 팩의 snapshot은 모두
`6d3993ae435b3a1d56d69443cf1e18be713afc3faf402e03f674551f434692c8`이다.
다른 writer의 변경이나 교체 충돌이 있으면 원본과 복구 자료를 보존하고 중단하는 기존
함수를 사용했다. 개별 매니페스트 지문을 수동 편집하지 않았다.

실제 명령 배열·소유 실행기 영수증·후검증 원본은 저장소 로컬
`.git/cleanup-evidence-20261030/character-refs-main5cce/`의 `producer-command.json`,
`root-producer-launch-preflight-20261031-r1.json`, `root-producer-final-return-20261031-r1.json`,
`root-produced-eight-validation-20261031-r1.json`, `root-public-candidate-cas-20261031-r1.json`에
연결했다. 완료한 append-only 출력 폴더에 같은 명령을 재실행하면 ID 충돌로 거부된다.
