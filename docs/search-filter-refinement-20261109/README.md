# 검색창·필터 접기 시안 보완 · 2026-11-09

상태: current. 기준 main은 `a9bb189431187e427f0ed117d039b41d22fe6f4e`이다.

## 구현

- 사용자 제공 `search-responsive-concept.png`의 실제 픽셀을 대조했다. 검색창을 필터·결과보다 앞선 전체 너비 행으로 옮겼다. 입력 DOM은 하나이며 검색 URL·debounce 계약은 유지한다.
- 검색 화면만 `fullWidthQuery`를 사용한다. 다른 SearchExplorer 소비자는 기존 입력 위치와 펼쳐진 필터를 유지한다.
- 유형·장르는 기본 펼침, 태그·공개 연도·연재 상태·플랫폼·최소 평점·이용가·옵션은 기본 접힘이다. native details/summary로 키보드 조작과 펼침 상태를 제공한다. 접어도 선택 조건은 유지한다.
- 모바일 시트의 초점 순환에는 summary를 포함하고 접힌 영역의 컨트롤은 제외한다. Escape·닫기 후 트리거 초점 복귀를 유지한다.
- 원본 시안의 예시 표지를 실제 작품 이미지로 대체하거나 모든 화면의 픽셀 일치를 주장하는 변경이 아니다.

## 검증

- `pnpm harness:verify` 통과: 변경 lint·Secretlint·아키텍처·웹 26,380개 소스 타입검사 진단 0개·API 및 도구 타입검사. `git diff --check` 통과.

- 관련 Vitest 5파일 19개 통과: 전용 배치·기본 접힘·조건 보존, 검색 URL·fragment·Back·입력 생명주기·모바일 시트.
- 실제 Chrome에서 320·390·834·1440px와 스타라이트·밝음·고대비 12조합 통과. 전체 너비 검색창, 가로 넘침 0, 신규 유형 링크 44px 이상, 페이지 오류 0을 확인했다.
- 필터 반복 클릭·Enter, 플랫폼 선택 후 접기/펼치기와 URL·선택 상태 보존, 모바일 Escape·초점 복귀, 페이지 유형 이동 후 Back 검색어 복원을 확인했다.
- 스크린샷과 `results.json`, 재현용 `qa.cjs`를 함께 보관한다. 실제 운영 API가 아닌 합성 응답을 사용하고 로컬 origin 외 요청은 차단한다.
- 전체 회귀·운영 실데이터·프로덕션 빌드·운영 배포는 범위 밖이다. Gemini 조작과 배포는 수행하지 않았다.

## 재현

```sh
pnpm exec vite --config apps/web/vite.config.ts --host 127.0.0.1 --port 5298 --strictPort
node docs/search-filter-refinement-20261109/qa.cjs
```
