# 컷츠 Godot 플레이어

`/cuts` 피드의 대체 진입(`?engine=godot&clip=<id>`)으로 뜨는 재생 전용
Godot 4.4.1 플레이어다. 기존 웹 플레이어(`CutsPlayer`)는 그대로 두고,
이 빌드는 나란히 두는 대체 재생 경로다.

## 구조

- Godot 프로젝트: repo 밖 `~/workspace/godot-motion-full/project`
  (미니게임 본 적용과 같은 관행 — 빌드 스크립트가 서빙 사본만 repo에 넣는다)
- 서빙 사본: `apps/web/public/cuts-godot/` (이 디렉터리의 산출물을 커밋한다)
- 셸 임베드: `apps/web/src/domains/cuts/CutsGodotEmbed.tsx`
- 진입 분기: `CutsFeedPage`의 `?engine=godot` (PlayPage 선례)

## 시간축 — 오디오 클록 구동

프레임 델타 적분(AnimationPlayer 단독 구동)은 프레임 기아에서 오디오와
초 단위로 갈라지는 것이 파일럿·본 적용 실측으로 확정됐다(기준선 드리프트
최대 19.7초). 이 플레이어는 계속 재생되는 무음 클록 스트림의 재생 위치를
정본으로 삼아 매 프레임 시각 상태를 강제한다 — 기아에서도 오차는 1프레임
양자로 상한이 정해지고, 기아 종료 즉시 정합한다. 마스터 위치가 뒤로 튀는
경우(웹 위치 워크릿 리셋)는 단조성 가드가 재앵커로 흡수한다.
실측 기록: `~/workspace/godot-motion-full/notes/02-measure-report.md`.

## 브리지 계약

- Godot → 셸: `window.parent.__tsMotionEvent(json)` —
  `ready-waiting-clip` / `ready {shots, totalMs}` / `shotChanged {index}` /
  `ended` / `error {message}`
- 셸 → Godot: iframe 창의 `__tsMotionSetClip(json)` —
  `{title, shots: [{imageUrl, caption, startMs, durationMs, kenBurns{from,to}}]}`
- 내레이션(TTS)은 셸 소유: 셸이 `shotChanged`를 받아 Web Speech로 읽는다.
  자막 표지·재생 컨트롤은 Godot 안에도 있다.

## 이미지

샷 이미지는 순서대로 스트리밍한다. 첫 샷이 준비되면 재생을 시작하고,
아직 도착하지 않은 샷에 닿으면 직전 프레임을 유지한다. `http(s)` URL은
HTTPRequest로 받아 매직 바이트로 포맷을 판정하고(PNG/JPEG/WebP/SVG),
`data:image/svg+xml`(프로시저럴 아트 대체)은 URI 디코드 후
`Image.load_svg_from_buffer`로 래스터화한다. 실패하면 번들 플레이스홀더.

## 다시 빌드하기

```bash
bash tools/cuts-godot/build.sh
```

익스포트는 반드시 포그라운드로 실행한다(백그라운드 실행 시 pck가
잘리는 전례). 산출물(index.*)을 소스 변경과 같은 커밋에 넣는다.
