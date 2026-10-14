// 작품 상세 등 다른 도메인이 서포터 얼리 액세스 안내를 붙일 때 거치는 공개 경계.
// [wave7-stage1 draft] paywall 네임스페이스 ko/en 사전은 앱 셸 번들에서 분리됐다.
// 이 공개 경계를 거치는 소비처(TitleDetailPage 등)가 사전 등록을 보장받도록
// 여기서 동기 등록 모듈을 함께 평가한다.
import "../monetization-i18n";

export { TitleEarlyAccessNotice } from "../paywall/components/TitleEarlyAccessNotice";
