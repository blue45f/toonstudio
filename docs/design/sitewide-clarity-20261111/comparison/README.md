# 원본 참고보드 · Codex 제안 · 실제 구현 대조

상태: **reference / target / versioned actual 비교**. 기록 기준은2026-11-12 KST다. [3열 대조 열기](./index.html)와 [해시·캡처 조건](./manifest.json)을 함께 읽는다. 이 폴더는 검토용 뷰어이며 새 제품 시안이나 운영 배포가 아니다.

## 최신4화면 비교 연결 — 2026-11-12 KST

상태: **current — 버전별 로컬 실제 증거**. [최신 비교8장 열기](./index.html#latest-comparisons)와 [정적 연결 검증](./latest-verification.json)을 함께 본다. 기존29asset·8baseline 시나리오·18계열·원본5SVG·기존 로컬14PNG를 보존하고 기존 비교판8PNG만 `assets/latest-*`에 바이트 복사했다. 새 시안/재촬영/이미지 보정/브라우저/제품 소스/dist/Git/원격 변경은 없다.

| 화면 | 실제 소스 / 빌드 | 같은 상태와 한계 |
| --- | --- | --- |
| Story | `d400de4bdf3e / b5c24948e4d0` | title/protagonist2필드의 미저장 guest 초안. 모바일 첫 입력 보호를 위해 조작은 시안fixed 대신 단계 끝 문서 흐름. 새 잔여9/9와 이전19성공 재사용을 구분. |
| Showcase | `d400de4bdf3e / b5c24948e4d0` | 로컬 브랜드 표지의 가상4작품. 실제 사용자 작품/전체 검색 아님. 원본 결과의 fidelity pending은 보존하고 [별도390/1440 4쌍 수동검토·390모션 기록](./evidence/showcase-d400-review-summary.json)으로 완료 범위를 구분. |
| Publish | `107c11ff4351 / 399bf5bf0013` | 같은 제목·대표 주소·등록채널1개. 가상 계정/프로젝트 fixture, 모든 API쓰기 차단. JSON 준비와 실제 게시 완료를 구분. |
| Promo | `107c11ff4351 / 399bf5bf0013` | 실제 정본204편/쇼츠49편 기본 목록. 해당 run은 영상 src0·MP4요청0이며 이전 재생/필터/Back 검증은 재사용. |

각 화면의390×844/1440×1000 정적제안·실제 비교판이며 상세 fixture/의도한 차이/미검증·SHA256은 manifest의 `latestComparisons`와 `assets.latest-*`에 있다. 원본 SVG 복합보드와 같은 상태의 제품 픽셀 비교라고 해석하지 않는다. 이후 커밋·계정 동기화·실기기/OS IME·전 페이지 사용성·운영 배포를 보증하지 않는다. 이번 HTML 추가 부분은 정적 파싱·로컬 파일/해시만 확인했으며 기존 뷰어8/8 브라우저 결과와 구분한다.

[root가 이미 공유한16이미지 LibraryPage](https://chatgpt.com/space/page_6f98e6e9522081918d42d55476507ed2)를 연결했다. 기존6장 링크도 보존했고 이 작업에서 외부 업로드/수정은 하지 않았다.

## 자료를 읽는 기준

왼쪽은 **사용자가 Gemini 원본으로 지정한5개 SVG**다. 파일이 존재하고 XML/SVG 루트와1440×860 viewBox가 정상이며, 바이트·SHA-256이 origin/main `933caa71cf57f79d783a7703ccfc60bb93a98e00`의Git blob와 일치한다. README에는 Gemini 생성도구·run ID·독립 로그가 없어 생성도구는 확인하지 못했다. 편입 커밋 `f1d3f2b282a4cedf3a18b7eaaeffd5092c388579`의author/committer는OpenAI Codex이며 Git 편입 주체와 생성도구는 별개다.

가운데는 Codex의 기존 Clarity 계약 또는 **새 정보 밀도 제안6PNG**다. 정적 예시이며 API·실제 사용자 데이터·저장·게시 성공 화면이 아니다. PC 게시/쇼케이스2장은v2, 나머지4장은v1 바이트를 유지했다. 원본 보드에 해당 페이지가 직접 그려져 있지 않으면 ‘유사 concept’로 명시했다.

기존3열 오른쪽은 **명시한 역사 버전·상태의 실제 화면**이다. `4911a5b0f3ddf179f0827d6c62ae3a8e51eab401 / 2931f94c0bb7` 드로잉20/20·소재9/9 지정 흐름, Story/Showcase 후속 적용 전 baseline, 역사 개발 서버 홈을 보존한다. 최신 Story/Showcase `d400de4bdf3efea5ef6650d18136e10c37371a68 / b5c24948e4d0`와 Publish/Promo `107c11ff43516a2e90fb9b40ccb42b7771a2b61d / 399bf5bf0013` 비교는 상단 별도 섹션에서 상태·fixture·의도한 차이·미검증 범위를 확인한다. 서로 다른 버전을 같은 최신 실행으로 합산하지 않는다.

사용자가 전달한 Mac dot의5SVG 렌더·검토 의견은 전달받은 근거로 재사용했다. Mac 검토를 원격 actual 검토 완료로 바꾸지 않는다. 원본에서 보라·청록, 라운드, 실제 선택, 이어하기와 다음 작업 연결은 유지하고, 경쟁하는 시작 카드·무지개 테두리 반복·기술 용어·과장된 저장/권리 완료·작화 중 상시 출고 패널·작은 모바일 도구는 그대로 복원하지 않았다.

## 재사용과 파일 배치

- 원본5SVG: [기존 boards 폴더](../../starlight-atelier-v2-mockups-2026-11-11/boards/board-a-b-home-and-studio-lobby.svg)를 상대 경로로 재사용하며 재복사하지 않는다.
- 새 Codex6PNG: [기존 density-proposals](../density-proposals/README.md)를 상대 경로로 재사용한다. 이폴더 변경의 최종 반영에는 root 소유 density-proposals도 함께 포함되어야 한다.
- 기존 추적 actual 홈4PNG: [review-renders](../review-renders/README.md)를 상대 경로로 재사용한다.
- 기존4911 actual14PNG는 `comparison/assets/`에 단일 복사했다. 원본 바이트·해시와 캡처 조건을manifest에 기록했다. 다른 폴더에 중복 복사하지 않았다.
- Clarity 공통 갤러리 PNG와 미추적e780 카탈로그 PNG는 새로 재복사하지 않고 [계열 계약](../index.html#contracts)·[기존 검증 기록](../validation-and-release.md)으로 연결했다.

모든 클릭 경로는 clone 안에서 열리는 상대 경로다. manifest의 `sourcePath`는 로컬 실행 재현 참고로만 남겼고 링크로 사용하지 않는다. private Library 파일ID·워크스페이스 계정ID를 새로 포함하지 않았다. root가 사용자에게 공유한 [기존 제안6장 LibraryPage](https://chatgpt.com/space/page_1e4bdd165d908191b152ae11b81a568c)는 참고 링크이며 새 업로드는 하지 않았다.

## 검증과 부족점

기존18계열·441주소 분류를 그대로 재사용해8개 상세 시나리오(7계열)를 연결했다.441은 합성 동적 경로·별칭을 포함한 원장이고 독립 시안·실사용 성공 수가 아니다. 나머지 계열은 계약·개별 actual 부족을 표시한다.

원본1440×860 복합보드와390/320 실제 화면은 같은 상태·비율이 아니다. 픽셀 충실도 동등성을 선언하지 않는다. SVG·정적 PNG·주소·자동 계약 검사만으로 동작·초점·모션 감소·성능 통과를 주장하지 않는다. 편집·읽기의 작업 목적 차이는 의도된 예외로 관리한다.

기존 전달본 준비는 기존 파일만 사용해 비용0이었다. 해당 준비 당시 제품 소스·다른 문서·원본·프로필 수정이나 도구 설치는 없었다. 원본 SVG 직접 표시,1440/390 정적 뷰어 렌더·키보드·검색 검증은 localhost에서만 수행하고 외부 호출을 차단한다. 실행 결과와 캡처는 로컬 QA 기록으로 분리한다. 이 뷰어 검증을 최신 제품 단계·클라우드 저장·외부 게시·권한·운영 배포 검증으로 확대하지 않는다.

### 정적 뷰어 실행 결과

localhost의 허용 파일만 읽는HTTP서버와1개Chromium에서8/8을 확인했다.1440px3열·390px1열/가로 넘침0,Tab/Shift+Tab·focus윤곽,검색·없는 결과·키보드 초기화·18계열필터·Space펼침,5SVG의HTTP200/직접 표시를 검증했다.5SVG와전달본QA캡처도직접열어확인했다.원본SVG의QA캡처는로컬.qa에만남기고원본PNG자산으로추가하지않았다.페이지오류·자산HTTP오류·외부요청은0이며브라우저와서버를종료했다.

초기이미지대기5초실패는닫힌details의lazyPNG까지포함한검사선택자문제였다.초기보고서·캡처를보존한뒤표시중이미지만검사하도록교정했으며제품실패또는시안완료로바꾸지않았다.실행조건·검사항목과한계는manifest의viewerValidation에있다.
