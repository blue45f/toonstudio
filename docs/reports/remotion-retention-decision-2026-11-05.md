# Remotion 유지 결정과 무료 상용 사용 조건 — 2026-11-05

상태: **current**. 사용자가 설명한 개인·1인 사용 전제에서는 Remotion을 유지한다.
비상업 가중치인 Tag2Pix와 같은 종류의 금지 항목으로 분류하지 않는다. 별도 법인의 전체 인원을
독립 확인했다는 주장은 하지 않는다.

## 실제 버전과 근거

| 경로 | 실제 버전 | 확인한 권리 근거 |
| --- | --- | --- |
| 웹 runtime의 remotion / @remotion/player | 4.0.536 | 설치 LICENSE.md와 기존 고정 SHA 검증 |
| 별도 tools/media/brand-film의 remotion / @remotion/cli | 4.0.514 | 해당 tag의 공식 LICENSE.md |
| 다운로드하는 promo render kit | 4.0.487 | `promo-remotion.ts`의 실제 상수와 해당 tag LICENSE.md |

이전 보고서에서 생성 promo ZIP도 4.0.536이라고 기록한 부분은 **4.0.487로 정정**한다.
세 버전 모두 개인 및 직원 3명 이하 영리 조직 등의 무료 자격과, 해당 자격자의 영상·이미지 제작을
위한 상용 이용을 명시한다. 해당 자격 밖의 조직에는 Company License가 필요하다.
license 원문은 `docs/evidence/remotion-retention-2026-11-05/`에 보존한다.

- [공식 무료 자격 FAQ](https://www.remotion.dev/docs/license/faq)는 개인의 상용 이용, 총인원 3명 이하
  1인 법인 및 무료 자격자의 자동화·SaaS 사용도 가능하다고 설명한다. 단지 개발자 1명만 Remotion을
  쓴다는 사실과 회사 전체 인원이 1명이라는 사실은 다르다.
- [공식 가격 안내](https://www.remotion.dev/docs/license/pricing)의 인원 설명과 정확한 설치 버전의
  LICENSE를 함께 본다. 현재 [docs/terms](https://www.remotion.dev/docs/terms)는 **출시 예정 5.0 약관**으로
  표시되므로 4.x에 자동 적용했다고 판단하지 않는다.
- [4.0 약관](https://www.remotion.pro/terms-4-0)은 상충하는 일반 조항보다 소프트웨어 license 조건이
  우선한다고 명시한다. 영상·이미지 제작용 상용 허가를 일반 문구만으로 비상업 제한으로 바꾸지 않는다.

## 현재 사용과 배포 경계

웹 Player는 ToonStudio의 자체 product-tour composition을 재생하고 브랜드 도구는 자체 영상을 렌더한다.
이를 Remotion 자체를 복제해 재판매하는 제품이라고 분류할 근거는 확인하지 못했다.
promo ZIP은 자체 composition·사용자 미디어·Remotion 의존성 선언을 내보내며, Remotion의 수정 복제본을
자체 라이선스로 재판매하지 않는다. ZIP README는 공식 조건 검토 링크와 사용자 미디어 권리 책임을
이미 제공한다. ZIP을 받은 별도 조직이 실행할 때의 자격은 그 조직의 사실관계에 따른다.
미래 인원·용도·주요 버전 변경은 해당 조건을 다시 확인할 계기이며 지금의 일괄 제거 사유가 아니다.

## 불필요한 수학 대체를 되돌린 이유와 보존

앞선 자체 보간·spring 구현은 33개 테스트와 제한된 실제 프레임 결과를 보존했지만 성능 개선을
실측하지 않았다. 원본보다 좁은 spring 계약을 별도로 유지하는 부담이 있고, 무료 자격자의 상용
이용에는 제거 필요가 없다. 따라서 대체를 계속 확대하지 않고 소유한 범위만 되돌렸다.

- 기존 6개 파일은 HEAD `8d315c85d6fde4a3a30255612c756d3e299a95b0`의 바이트와 SHA-256이 일치한다.
- 자체 math·test·baseline 3개 파일을 활성 source에서 제거했다. 관련 animation import는 남지 않았다.
- 원본 대체 구현·patch·SHA 및 복구 검증은 `/tmp/toonstudio-remotion-math-preserve-20261105/`에 보존했다.
  이전 `/tmp/toonstudio-commercial-final-new-files.tar.gz`도 변경하지 않았다.
- 과거 `remotion-independent-animation-2026-11-05.md`는 삭제하지 않고 SUPERSEDED/history로 남겼다.
- 복구 후 surviving composition/page 26개 테스트와 shared/tool focused strict TypeScript가 통과했다.

모델 제한·wasm-vips 대체·Mixbox 제외 사항은 이 결정과 별개로 보존한다. Remotion 유지가 제품 전체의
상용 출시 승인 또는 모델 권리 해결을 뜻하지 않는다. 구매·회원가입·외부 연락·배포는 수행하지 않았다.
