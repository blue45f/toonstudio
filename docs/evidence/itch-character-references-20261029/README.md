# Characters 2 참고 이미지 검증 — 2026-10-29

상태: **migration — 로컬 등록·단위·화면 검증 완료, 하네스·새 빌드·원격 반영 대기**.
기준 통합은 `e34b3b2dbf253cd08d8b1762fb934149e91d7ee8`이며 별도 후속 브랜치에서
캐릭터 네 개의 정면·3/4 정지 참고 이미지 8개를 추가한다. 앱 source·API·packages·
package.json·lockfile은 기준 통합과 같음을 Git diff로 확인했다.

## 공식 생성과 원본 보존

[render-proof.json](./render-proof.json)은 실제 Blender helper가 작성한 공식 증거의
바이트를 그대로 보존했다. 원본·실제 렌더 GLB·PNG의 SHA, 승인 PNG, 준비 정책·정규화기·
렌더러 소스 SHA, 카메라와 리그 검사 결과를 담는다. 원본 GLB와 atlas는 포함하지 않는다.

Python 3.12.14/Pillow 13.0.0, Blender 5.2.0 LTS `fbe6228777e7`을 사용했다.
Blender는 `--background --factory-startup --python-exit-code 42`로 실행했다.
초기 `--append-only` 사전 검사·로컬 등록이 각각 exit 0이었다. 이후 Pillow 비의존 경계
수정으로 준비 정책 SHA가 바뀌어 같은 선정 8개 ID만 `--publish`로 공식 재생성했다.
수정 후 사전 검사·렌더·로컬 등록도 각각 exit 0이다. publish는 로컬 이미지 폴더 등록이며
원격 업로드·운영 배포가 아니다.

[등록 대조](./registration-review.json)는 기존 182행의 내용·순서와 이미지 356파일의
바이트를 그대로 확인했다. 완성 186 / 초안 4 / 전체 190행 / 공개 373파일 / 렌더 팩 16개다.
공개 팩 합계 85,018,243바이트이며 신규 본문 8개의 합계는 3,738,740바이트다. 원본 GLB
4개·PNG 2개 SHA가 그대로였고 새 썸네일은 본문 기반 384px LANCZOS 픽셀과 일치했다.
원장 allow 16/hold 49와 native GLB 1,764개 수량을 바꾸지 않았다.

- 매니페스트 SHA: `781b69c90d7e59f62da25d0eb3ceff95e83a7109158167e86c1401f64723fb5f`
- 공식 proof SHA: `dc95037a22454a8aca5d0ba8f32ca0fcbce7e2594ab576b2da2b160b22889a98`
- 최종 준비 정책 SHA: `ae1b21eb5d28a59e7e94f56b922a3f12724be3dc356a0fe2e07a14cf40b2db46`

## 실제 검증

[기계 판독 기록](./validation-review.json)에 명령·파일 목록·종료 코드·소스 SHA를 남겼다.
부분 실행이나 과거 실행을 아래 수량에 중복 합산하지 않는다.

| 검증 | 최종 결과 |
| --- | --- |
| Python creator 72개 + 기존 GLB 8개 | 80개, 5.867초, exit 0 |
| Node 번들 권리 170개 + CI 실행 계약 24개, 단일 worker | 194개, exit 0 |
| 앱 전달·출처·저장·배경·장식·archive·native 회귀 | Vitest 12파일 209개, 단일 worker, exit 0 |
| 변경 검증기 Node 문법·변경 mjs 3파일 ESLint | exit 0 |
| CI workflow actionlint | exit 0 |

Python은 `test_creator_bundle*.py`, `test_studio_asset_glb.py`를 한 프로세스에서
모아 실행했다. 준비 원본 무변경, 손상 PNG 전체 디코딩, proof 변조, 기존 ID 충돌,
실제 no-replace 이동, backup CAS, 동시 writer·교체 gap·설치 후 파일 추가와 인터럽트,
로컬 proof I/O 실패의 자료 보존을 검사했다. 파일시스템 실제 실행은 macOS다.
Linux 커널 분기의 원격 CI는 별도이며 Windows producer CLI는 지원하지 않는다.

최초 전체 Node 소비 검증은 170개 중 166통과·4실패, exit 1이었다. 새 helper의 top-level
Pillow import가 기존 `python3 -S` 배경 검증의 비의존 계약을 깨뜨렸다. Pillow를 실제 PNG
검증 함수에서만 불러오도록 고치고 `-I -S -B` 격리 subprocess 회귀를 추가했다.
기본 Python 3.9.6의 기존 배경 검사도 최종 170개 Node 권리 검사 안에서 통과했다.
글로벌 설치, PATH 변경, 기존 테스트 완화는 하지 않았다.

## 실제 소재 화면

[화면 검증](./runtime-review.json)은 격리된 Playwright Chromium에서 실제 소재 패널과
전달 포트를 사용했다. 전체 186개 fetch·SHA·바이트·1536px 디코딩, 기존 삽입 3회와
신규 8개 각각 desktop/mobile 삽입 16회, 총 19회가 통과했다. 벤치와 신규 대표의 개인
저장 → reload → 실제 SQLite/OPFS 바이트 SHA·전체 출처 재조회 두 사례도 통과했다.
390px 가로 넘침과 pageerror는 0개다. 운영 계정·원격 프로젝트 저장은 검증하지 않았다.

[공식 8장 시각 검수](./visual-review.json)와 [전체 보기](./character-views.jpg),
[desktop](./characters2-desktop.png), [390px canvas](./characters2-mobile.png)를 보존했다.
CH_1의 목·얼굴 색상 차이 후보 두 장은 원본 UV에서도 확인돼 보류했으며 임의 재색칠하지 않았다.

화면 검증은 준비 정책의 import 수정 전 실행이다. 수정 후 실제 재렌더에서 모든 본문 SHA와
매니페스트 소비 필드가 동일했고, 두 등록의 썸네일은 같은 본문 기반 픽셀 대조를 통과했다.
달라진 필드는 새 8개 지문의 준비 정책 SHA뿐이다. 이 전수 동일성을 확인해 화면·시각 증거를
재사용했으며 재렌더 후 브라우저를 다시 실행했다고 보고하지 않는다.

하네스·새 Web 빌드·정상 push는 검사 대기열에서 수행한다. 원격 PR·필수 CI·병합·
운영 배포는 미완료다. 기존 e34 통합의 빌드 증거와 PR Submit 대기도 별도로 보존한다.
