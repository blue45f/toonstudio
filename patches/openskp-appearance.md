# OpenSKP 1.3.0 앞뒷면·텍스처 식별 보정

- 날짜: 2026-10-30
- 상태: 저장소 patch·workspace·pnpm lockfile 등록, 정상 설치본 적용과 집중 회귀 완료. 실제 브라우저·필수 하네스 검증은 대기 중이다.
- 대상: MIT 라이선스의 `openskp@1.3.0`.
- upstream: <https://github.com/iamahsanmehmood/openskp>
- 적용 파일: `dist/index.js`와 `dist/index.mjs`만. 라이선스·공개 API·exports·타입은 변경하지 않는다.

## 원인과 범위

기존 `buildLocalFaceGroups`는 앞뒤 RGB가 같으면 front만 double-sided로 내보낸다.
그 결과 같은 RGB라도 서로 다른 back UV·이미지·유효 alpha가 front 표현으로 바뀔 수 있다.
또 baked/instanced 이미지 dedup은 전체 길이와 첫 16바이트만 비교하여 내용이 다른 PNG/JPEG를 합칠 수 있다.

이 patch는 다음 두 경계만 보정한다.

1. resolve된 앞뒤 RGB와 유효 alpha가 같고 실제 출력 텍스처·tile 크기·UV 행렬·projected 플래그의
   보수적 동치가 확인될 때만 한 벌로 합친다. 양쪽 모두 출력 텍스처가 없으면 UV 차이는 무관하다.
   동치를 확인하지 못하면 기존 front와 역방향 back emit 경로를 각각 사용한다. 원본 색은 바꾸지 않는다.
2. 기존 길이·header key는 bucket 색인으로 유지하되, bucket 안에서 전체 바이트가 같은 이미지만 공유한다.
   충돌 이미지는 별도 index로 출력한다. baked와 instanced에 같은 검사를 적용한다.

유효 alpha 계산은 기존 `(color.a / 255 또는 1) * (material.transparency 또는 1)`과 같다.
기존 `getMaterialIndex`는 이미 이 값을 key와 PBR 출력에 사용하므로 변경하지 않는다.
일반 projective Q, projected-plane 복원, TIFF 변환, 전체 SketchUp 재질 동등성을 추가하지 않는다.

## 출처와 고정값

설치 패키지 원본과 private 기준본의 바이트가 같은지 확인한 뒤 후보를 작성했다.
ESM은 CJS를 대체해 생성하지 않고 원본 `dist/index.mjs`에 동일한 두 보정을 적용했다.
두 private patch는 파일 라벨·hunk 좌표를 제외한 본문이 동일함을 `diff`로 확인했다.

| 대상 | SHA256 |
| --- | --- |
| 원본 CJS | `3b4a418e320920083aefa7551a924954b336e5addd0182971c7c66aeab575c2d` |
| 원본 ESM | `0adae97aaaf87cacb66928d5e56d0df0d983e462fb3ccc7a32badbeaefcea37b` |
| 원본 타입 | `f003f6e3e6594b8257cf02352d2f5ec6a88fbe6ec9e4bb876ddc28b8c8d31fe4` |
| CJS 후보 | `8d4f0deadced79ece4b93270f8f8eaca4e9d36ea62e7bbd22a97b160d80371c2` |
| ESM 후보 | `af471280accac0951c3bb91b7e0cd30731fc6470361fda82bd602f28b79fc891` |

## 검증 근거와 남은 확인

2026-10-30 private 비교 실행에서 확인한 CPU 회귀 결과는 다음과 같다.
자체 생성한 유효 SKP/PNG와 공개 writer/parser/baked/instanced API를 사용했다.

| 형식 | baseline | candidate |
| --- | --- | --- |
| ESM | 8 failed, 2 passed | 10 passed |
| CJS | 8 failed, 2 passed | 10 passed |

이 결과는 private 후보의 CPU 변환 근거다. 실제 Worker 경유, 최종 GLB/loader 왕복,
native SketchUp, GPU 픽셀·성능 검증은 아니다. Q/projected/TIFF 지원 성공으로 합산하지 않는다.
2026-10-30 `pnpm install --lockfile-only --offline`은 3.600초에 정상 종료했다.
pnpm이 생성한 변경은 patch hash·importer version·snapshot key 세 곳이며 패키지 버전은 유지됐다.
생성된 lockfile SHA256은 `d021a1fd83a9a9298e49b17c859341ce3e755c39d936074e865f030be65e3e71`이다.
이 명령은 실제 설치본을 갱신하지 않았고 prepare 실행 로그도 없으므로 설치·prepare 성공으로 합산하지 않는다.
2026-10-30 후속 브랜치의 `pnpm install --frozen-lockfile --offline`은 정상 종료했다.
설치된 lockfile은 위 SHA256과 일치하며 실제 CJS·ESM·타입 파일도 표의 고정값과 일치한다.
정상 prepare 실행 로그와 기본 Git hooks 설정을 확인했고 패키지 metadata·MIT 라이선스·exports는 보존했다.
설치 전후 보호한 소스·lockfile·두 관련 작업트리의 입력은 동일했다.
정상 root Vitest 설정에서 관련 15파일·224개 회귀가 모두 통과했다. 실패·미실행·todo는 없었다.
이 중 정식 appearance 파일의 10개 case는 실제 설치 ESM의 baked/instanced 경로를 검사했다.
양쪽 공개 ESM/CJS entry의 실제 resolve 경로·SHA256·exports·함수 존재도 별도로 확인했다.
CJS의 이 공개 진입점 확인을 CJS appearance 10개 의미 회귀로 합산하지 않는다.
언어 자산 동기화와 builtins 검증도 통과했으며, 예상한 73개 평면 파일의 안내 값 한 곳 외에는
보호 소스가 바뀌지 않았다. 기존 제품 pipeline 회귀의 성공은 새 appearance fixture의 실제
브라우저 Worker·최종 GLB·native 이미지 decode 또는 GPU 픽셀 성공을 대신하지 않는다.
현재 브랜치의 필수 하네스·전체 타입·보안/라이선스 감사와 브라우저 검증은 아직 하지 않았다.

## 제거 조건

upstream 정식 릴리스가 앞뒷면 동치 판정과 전체 바이트 dedup을 ESM/CJS 모두 수정하면 제거를 검토한다.
그 릴리스에서 실제 앞뒤 UV·이미지·alpha 분리와 동일 appearance 공유 회귀를 다시 확인해야 한다.
검증 후 workspace의 `patchedDependencies` 항목과 이 patch를 함께 제거하고 pnpm으로 lockfile을 재생성한다.
버전만 변경하거나 patch 적용 실패를 무시하여 기존 품질 보정을 조용히 없애지 않는다.
