# 랭킹 오류 안내 밀도 보완 · 2026-11-09

상태: 독립 로컬 작업트리의 미통합 변경. 기준 57fbdb7f. 원본 main, 원격, 배포는 변경하지 않았다.

사용자 Downloads의 ranking-responsive-concept.png 실제 픽셀과 변경 전 로컬 화면을 비교했다. 시안의 간결한 오류 안내에 맞춰 랭킹 페이지 내부 오류 블록만 grid로 정리했다. 기존 문구, alert 역할, 재시도 이벤트, 44px 버튼을 유지한다. 모바일은 설명 아래 버튼, 640px 이상은 오른쪽 버튼이다. 공용 ErrorState 소스나 다른 페이지는 바꾸지 않았다.

검증: 관련 Vitest 3파일 13개, pnpm harness:verify, git diff --check 통과. Chrome 320·390·834·1440px × starlight·light·contrast 12조건에서 실제 grid 적용, 오류 패널 높이 170px 미만, 가로 넘침 0, 재시도 버튼 44px 이상을 확인했다. 320px 텍스트 200%, Enter 재시도, 설명 반복 열기/닫기, 필터 열기/닫기, 탐색 이동 후 Back도 확인했다. 최종 모바일 light·데스크톱 starlight 픽셀을 직접 확인했다.

첫 QA는 Vite가 변경 전 CSS를 반환해 폐기했다. 소유한 독립 서버를 재시작한 뒤 grid 적용 assertion을 추가하고 다시 통과했다. 최종 결과는 results.json이다. before.png는 이전 레이아웃이다.

실제 API 대신 합성 503을 사용하고 모든 외부 origin을 차단했다. 운영 데이터·성공 순위·전체 앱 회귀·프로덕션 빌드·원격 CI는 검증하지 않았다. 시안 전체 일치를 뜻하지 않는다.

재현: 저장소 루트에서 Vite를 127.0.0.1:5314에 시작한 뒤 node docs/ranking-error-density-20261109/qa.cjs. 다른 포트는 QA_BASE로 지정한다.
