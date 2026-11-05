# Mixbox — 과거 의존성과 권리 기록

- 상태: **legacy exception — 외부 패키지 제거, 과거 연구·권리 기록 보존**
- 갱신일: **2026-11-05**

- Upstream: https://github.com/scrtwpns/mixbox
- Package/version: `mixbox@2.0.0`
- License: **CC BY-NC 4.0** (non-commercial use only)
- Commercial license contact: mixbox@scrtwpns.com

`mixbox` npm 패키지와 제품 실행 경로의 import를 제거한다. 이 디렉터리는 원본 구현이나 LUT를
배포하는 곳이 아니며, 과거 도입 경위와 아직 확인되지 않은 권리를 기록하기 위해 보존한다.
운영 의존성 감사는 패키지 이름 `mixbox`의 재유입을 거부한다. 실제 빌드 산출물과 운영에 이미
배포된 산출물의 확인은 별개이며, 소스 변경만으로 운영 배포가 갱신됐다고 보지 않는다.

종전의 `permissive-only` 검사는 프로그램 실행 권리 검사였다. 그 검사가 패키지를 Vite 번들에서
제외한다는 뜻은 아니었다. `noncommercial-full` 프로필 선택 또한 상업 이용 허가가 아니었다.

브러시의 자체 혼색은 기존 ToonStudio 잠재 안료 엔진과 분광 혼색 경로가 담당한다.
외부 Mixbox의 코드·계수·LUT·안료 상수는 자체 구현에 복사하지 않는다. 저장된 브러시의
호환 처리와 자체 구현의 기능·출력 차이는 [`잠재 안료 혼합기`](../../docs/features/latent-pigment-mixing.md)를
참조한다. 자체 구현이라는 출처 분류가 특허 실시 허락이나 상업 이용 허가를 뜻하지는 않는다.

Mixbox 패키지 자체의 상업 이용은 여전히 별도 허가가 필요하다. 소유자의 독립 구현 분석 허락
진술과 패키지 상업 라이선스는 구분한다. [`LICENSE-GRANT.md`](LICENSE-GRANT.md)의 서면 합의
식별자와 범위는 미기재이며, 이 문서나 패키지 제거 작업이 새로운 권리를 만들지 않는다.
