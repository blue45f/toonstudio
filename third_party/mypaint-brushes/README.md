# mypaint-brushes — CC0 브러시 설정 데이터 (verbatim 데이터 이식)

- 원본: https://github.com/mypaint/mypaint-brushes @ `08da4a48a4b63f2e0f3303942d7c21da8479ea9f`
- 권리: `Licenses.dep5` 의 `Files: brushes/*` 와 작성자별 항목(`brushes/ramon`, `brushes/tanda`, `brushes/deevad/*`,
  `brushes/kaerhon_v1/*`, `brushes/Dieterle/*`)이 모두 **CC0-1.0** 이다. 이 디렉터리의 `COPYING` 은 원본 저장소의
  CC0 1.0 법률 문서 사본(verbatim)이다.
- 저장소의 MyPaint 앱 코드(GPL-2+)는 쓰지 않았다. 브러시 `.myb`(v3 JSON) 설정 값만 옮겼다.

## 무엇을 옮겼는가

`scripts/generate-studio-mypaint-cc0-library.mjs` 가 `brushes/order.conf` 순서의 196종 `.myb` 설정과 입력 곡선을
숫자 원문 그대로 `apps/web/src/domains/creator/brush/mypaint-library/*.generated.ts` 로 옮긴다. 원본 파일마다
SHA-256 을 함께 기록한다. 미리보기 PNG 는 옮기지 않았다.

## 작성자(원본 표기)

Martin Renold and the MyPaint Development Team(classic·experimental), Ramón Miranda, Marcelo "Tanda" Cerviño,
David Revoy(deevad), Guillaume Loussarévian(kaerhon_v1), Brien Dieterle. CC0 는 표기를 요구하지 않지만 출처를 남긴다.

자세한 동작·검증·한계: [`docs/features/mypaint-cc0-brush-library.md`](../../docs/features/mypaint-cc0-brush-library.md)
