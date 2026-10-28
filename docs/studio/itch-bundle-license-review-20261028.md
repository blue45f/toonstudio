# itch.io 구매 번들 서비스 활용 권리 확인 — 2026-10-28

상태: **current** — 팩별 권리 원장과 공개 라이선스 증빙의 판정이다. 원본 수신·변환, 화면 연결, 정적 산출물 배포와 운영 스모크는 별도 검증이며 이 문서의 allow만으로 완료되지 않는다.

## 승인과 확인 범위

저장소 소유자가 2026-10-28 대화에서 구매한 번들의 다운로드 상태를 확인하고, 활용 방법을 계획·설계해 서비스에 최대한 적용하도록 요청했다. 이 요청에 따라 공식 판매 페이지에서 CC0가 확인되고 기존 증빙 게이트를 충족한 10개 팩의 서비스 활용을 원장에서 연다. 게이트의 요구 증빙 표나 분류 기준은 바꾸지 않는다.

공개 라이선스는 로그인 쿠키 없이 판매자의 팩 페이지를 직접 조회했다. [공개 증빙 목록](../evidence/itch-licenses-20261028/index.json)에 원장 팩 ID, URL, 조회일, 보관 경로, 바이트 수와 SHA-256을 기록했다. HTML 파일은 실제 응답에서 제목과 라이선스 표 행 또는 CC0 본문 부분만 그대로 발췌한 것이다. 외부 원문의 증빙이라 HTML 안 영어 문구는 번역하지 않고 보존한다. 전체 페이지의 요청별 익명 CSRF 값과 판매 설명·댓글은 보관하지 않으며, SHA-256은 보관된 발췌 파일을 대상으로 한다.

구매 사실은 로그인된 소유자의 구매 목록과 Creator Bundle: Volume 1 구매 확인 화면에서 별도로 대조했다. 비공개 확인 기록은 로컬 전용 `local-private:itch-purchase-library-observation-20261028`로 참조한다. 구매 링크·다운로드 권한 토큰·계정 이메일·결제 정보는 저장소에 넣지 않는다. 코드의 ref 검증은 보관 위치의 형식만 검사하므로 구매 기록의 실물 확인을 대신하지 않는다.

## 원장 판정

[팩별 권리 원장](../../config/creator-bundle-pack-rights.json)의 `defaultServe`는 계속 `hold`다. 이번에 연 팩은 다음 10개이며, `grant`는 `public-domain / CC0-1.0 / commercialUse: true / attributionRequired: false`다.

| 팩 | 원장 분류 | 새로 보관한 공개 근거 | 판정에 사용한 증빙 |
| --- | --- | --- | --- |
| Cartoon City Massive Pack | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/cartoon-city-massive-pack1), [HTML](../evidence/itch-licenses-20261028/cartoon-city.html) | 팩 페이지 CC0 표기 + 구매 확인 |
| Nature Megapack - Extended | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/nature-megapack-low-poly-refreshed-unity-urp), [HTML](../evidence/itch-licenses-20261028/nature-extended.html) | 팩 페이지 CC0 표기 + 구매 확인 |
| Farm Land | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/farmland), [HTML](../evidence/itch-licenses-20261028/farmland.html) | 팩 본문 CC0 표기 + 구매 확인 |
| Pirate Island | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/pirate-island), [HTML](../evidence/itch-licenses-20261028/pirate-island.html) | 팩 페이지 CC0 표기 + 구매 확인 |
| Aztec Jungle | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/aztec-jungle-megapack-low-poly-refreshed-unity-urp), [HTML](../evidence/itch-licenses-20261028/aztec-jungle.html) | 팩 페이지 CC0 표기 + 구매 확인 |
| Food Pack | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/food-pack), [HTML](../evidence/itch-licenses-20261028/food-pack.html) | 팩 페이지 CC0 표기 + 구매 확인 |
| Characters 1 | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/cartoon-city-massive-pack-characters), [HTML](../evidence/itch-licenses-20261028/characters-1.html) | 팩 페이지 CC0 표기 + 구매 확인 |
| Characters 2 | `unstated-rg-poly` | [공식 페이지](https://rg-poly.itch.io/characters-2), [HTML](../evidence/itch-licenses-20261028/characters-2.html) | 팩 페이지 CC0 표기 + 구매 확인 |
| Cute Park Pack | `cc0-text-copied` | [공식 페이지](https://rg-poly.itch.io/cute-park-pack), [HTML](../evidence/itch-licenses-20261028/cute-park.html) | 로컬 문서의 팩 제목 불일치를 공식 팩 페이지 CC0 표기로 대조 |
| Cute Dungeon Megapack | `cc0-explicit` | [공식 페이지](https://rg-poly.itch.io/cute-dungeon-megapack), [HTML](../evidence/itch-licenses-20261028/cute-dungeon.html) | 기존 팩 내부 CC0 문서 해시 재검증 + 공식 팩 페이지 대조 |

CC0는 상업 목적의 복제·수정·배포를 허용한다. [Creative Commons 공식 설명](https://creativecommons.org/publicdomain/zero/1.0/)을 기준으로 위 팩의 렌더 이미지, 투명 소품, 가상 스튜디오 시각 자산에 같은 권리 판정을 적용한다. 기존 서비스의 원본 파일 다운로드 제한과 팩별 해시·경로 검증은 유지한다.

Cute Park와 Cute Dungeon은 원장에서 `pending`에서 `pack`으로 옮겼다. 로컬 라이선스 파일의 해시와 원본·텍스처 파일 존재를 확인한 뒤 수신 팩으로 편입하기 위한 판정이다. 변환된 모델의 무결성·텍스처·실제 화면 사용 여부는 생성기와 소비자 검증 결과로 별도 판정한다.

이 판정 이후 원장 집계는 **allow 10 / hold 51**, 묶음은 **pack 44 / crowd 5 / pending 12**다. 2026-10-22 문서와 시드에 적힌 `61개 전부 hold`는 당시 상태이며, 현재 판정은 이 원장과 증빙을 따른다.

## hold를 유지하는 범위

Restaurant Megapack은 공식 팩 페이지의 CC0 메타데이터와 로컬 독자 라이선스 문구가 다르다. Medieval Village / Megapack과 Small Props Pack은 로컬 문서에 CC0와 독립 다운로드·재배포 금지가 함께 있다. 이 3개 팩의 `reviewRecommendedHold`와 제작사 서면 확인 요구를 유지한다. 공개 페이지의 메타데이터만으로 상충하는 로컬 문서를 지우거나 분류를 낮추지 않는다.

EmaceArt 팩의 개인·상업 프로젝트 사용 허용과 독립 파일 재배포 제한도 그대로 기록한다. [Harboria 공식 문구](https://emaceart.itch.io/harboria)는 자기 프로젝트에서의 사용을 허용하지만, 이 서비스의 다중 사용자 소재 제공·웹 호스팅을 별도로 다루지 않는다. 현행 원장이 요구하는 `web-service-hosting` 범위의 제작사 서면 확인을 새로 얻었다고 간주하지 않는다. 따라서 이번에 해당 팩의 hold를 해제하지 않는다.

제작사에 연락하거나 원본 파일을 외부로 업로드하는 행위는 이번 공개 페이지 조회에 포함하지 않았다. 아직 증빙이 없는 다른 팩도 기존 hold를 유지한다.

## 검증과 재현

실행 위치는 저장소 루트다. 다음 검증은 읽기 전용이며, 로컬 라이브러리가 같은 경로에 있어야 라이선스 실물까지 대조한다.

```bash
node scripts/verify-creator-bundle-pack-rights.mjs \
  --library-root /Users/hjunkim/3d-asset-library
```

공개 HTML 증빙은 `index.json`의 각 `path` 파일을 읽어 바이트 수·SHA-256이 기록과 같은지 확인할 수 있다. 현재 판매 페이지는 갱신될 수 있으므로 새 조회를 기존 파일 위에 덮어쓰지 말고, 조회일을 구분한 증빙으로 추가한다.

원장 allow는 배포·장면 삽입 성공의 증거가 아니다. 생성기 정의, `theme-packs.json`, 렌더 매니페스트 권리 스탬프, 배포 플래너, 웹 로더를 같은 판정으로 맞춘 뒤 관련 테스트와 실제 화면을 검증해야 한다. 운영 배포는 저장소 배포 정책의 별도 게이트를 따른다.

2026-10-28 검증 결과: 위 원장 검증 명령은 종료 코드 0으로 끝났고, 로컬 라이선스 문서 96건의 해시가 모두 일치했다. 공개 HTML 발췌 10개도 기록한 바이트 수·SHA-256과 일치했다. 변경한 원장·공개 증빙·이 문서의 Secretlint와 `pnpm harness:check`를 통과했다. 이 결과는 원장·증빙의 검증 범위다.
