# 기본 2D 캐릭터 선택과 입장 미리보기 정합

## 재현한 문제

2026-11-04 클라우드 독립 화면에서 같은 `avatarIndex=0`의 하늘을 선택하면 카드에는
분홍 머리 캐릭터가, 기본 2D 상태창에는 식자 직군 캐릭터가 표시됐다. 로비 큰 미리보기도
카드와 같은 범용 작화만 사용해 실제 입장 후 월드·상태창의 모습과 달랐다.

선택기와 로비에 현재 stage와 identity를 전달하고 기본 2D일 때 월드·HUD와 같은
`Office2dAvatarPreview`를 사용한다. 사용자 선택 번호와 저장·공유 계약은 유지한다.
아트 스타일 변경이나 추천 표시 때문에 캐릭터를 자동 선택하지 않는다.

입장 경로는 실제 런타임과 같은 stage 해석을 사용한다. legacy·3D 입장과 별도
전역 캐릭터 온보딩은 기존 작화 미리보기를 유지한다. 꾸미기의 3D VRM 선택기는
이번 변경 대상이 아니다.

## 검증 결과

- 수정 전 기존 26개 시험은 통과하고 새 정합 회귀 두 개는 실패했다.
- 수정 후 선택기·로비·HUD 3개 파일의 38개 시험이 통과했다. legacy·3D 명시 stage의
  기존 미리보기와 명시적 클릭만 선택을 바꾸는 동작도 검사했다.
- 실제 Chromium 390·768·1440px의 light·dark·contrast에서 카드와 HUD의 원본 atlas가
  일치했고 Enter 선택이 반영됐다. 가로 넘침과 page error는 없었다.
- 실제 로비 컴포넌트에서도 세 화면 크기의 큰 미리보기와 선택 카드의 atlas가 일치했다.
- 독립 화면: `/tools/browser-harnesses/virtual-studio-character-consistency.html`,
  실제 로비 렌더: 같은 경로의 `?lobby=1`.
- 클라우드 증거: `/tmp/character-picker-office-before.png`,
  `/tmp/character-status-office-before.png`, `/tmp/character-stage-preview-after.log`,
  `/tmp/character-picker-office-after-390-light.png`, `/tmp/character-lobby-office-after-390.png`.

## 남은 범위

기본 2D 월드는 기존 여덟 직군 atlas를 사용하므로 여러 이름·테마 스킨이 같은 직군
모습을 공유한다. 이번 수정은 그 실제 모습을 선택 단계에서도 보여 주며 모든 캐릭터나
13개 테마의 독립 자산을 새로 구현한 것은 아니다. 독립 화면은 실제 인증·입장·이동·회의
연결 성공의 증거를 대신하지 않는다. 전체 타입·하네스·원격 CI는 후속 통합에서 확인한다.
