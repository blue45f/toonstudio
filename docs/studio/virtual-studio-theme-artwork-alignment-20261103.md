# 가상 스튜디오 카드·월드 배경 일치 — 2026-11-03

상태: current. 실제 본사 엔진 검수에서 찾은 선택 카드·월드 배경 불일치 여섯 건을 다룬다. 테마별 독립 공간·NPC 개편과는 별도다.

## 변경

카드와 기본 2D 렌더러가 `studio-virtual-space-theme-artwork.ts`의 같은 원장을 사용한다. 월드가 이미 사용하던 원화를 유지하고 카드가 이를 정확히 예고하게 한다. 전용 사무실 세 종류는 기존 환경 manifest의 previewUrl을 유지한다. 자산을 새로 구매·생성하지 않는다.

| 테마 | 이전 카드 | 현재 카드와 월드의 공통 원본 |
| --- | --- | --- |
| modern-office | seoul-editorial-hq | global-ip-pitch-boardroom |
| webtoon-atelier | studio-theme-floor-panorama | seoul-editorial-hq |
| celestial-observatory | magic-academy-astral-library | scifi-orbital-command |
| garden-terrace | hanok-botanical-atelier | murim-bamboo-pavilion |
| library | abyssal-bioluminescent-worldlab | magic-academy-astral-library |
| sunset-harbor | dolby-sound-dubbing-studio | rooftop-sunset-screening-stage |

## 검증과 한계

수정 전 테마 선택기 회귀 검사에서 위 여섯 건이 모두 실패했고, 수정 후 기존 네 건을 포함한 열 건이 통과했다. 선택 이벤트·선택 상태·추천 캐릭터·팔레트 계약을 유지한다.

이 수정은 카드 이미지의 원본 일치 범위다. 바닥의 24% 알파 합성·개별 방 원화·가구·소품·NPC 직군·충돌·착석과 회의 동작은 변경하지 않는다. 모든 테마가 독립적으로 고도화됐다는 의미가 아니다. 실제 화면 및 전체 검사 결과는 PR 검증 기록에 남긴다.

Chromium의 실제 선택기 독립 검증 화면에서 13종 이미지를 디코딩하고 각각 선택했다. 위 여섯 카드의 src가 월드 원본과 일치하며, 390·768·1440px에서 가로 넘침과 pageerror는 없었다. 화면은 `/tmp/theme-art-390.png`, `/tmp/theme-art-768.png`, `/tmp/theme-art-1440.png`다. 독립 선택기 검증을 모든 전용 월드의 이동·충돌 검증으로 해석하지 않는다.
