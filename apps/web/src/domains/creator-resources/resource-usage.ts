/**
 * resource-usage.ts
 *
 * 자료의 이용조건 라벨·설명 — 카드와 큐레이션 타일이 공유하는 법적 고지 문구라
 * 컴포넌트 파일 밖에 둔다(react-refresh 규칙과도 맞는다). 라이선스 값에서만
 * 결정되며, 문구를 지우거나 완화하지 않는다.
 */
import type { CreatorResource } from "@/shared/lib/creator-resources";

export function resourceUsageLabel(item: CreatorResource): string {
  if (item.license === "CC0") return "공개 이용 확인";
  if (item.license === "CC-BY-4.0") return "출처표시 이용";
  if (item.license === "reference-only") return "레퍼런스 전용";
  if (item.license === "book-promotion") return "도서 소개 목적";
  return "정보·원문 링크";
}

export function resourceUsageDescription(item: CreatorResource): string {
  if (item.license === "CC0") return "공식 제공처의 공개 이용 표시를 확인했습니다. 초상·상표 등 기타 권리는 별도 확인하세요.";
  if (item.license === "CC-BY-4.0") return "출처표시가 필요한 공개 데이터입니다. 결과와 함께 제공기관·라이선스·조회 시점을 보존하세요.";
  if (item.license === "reference-only") return "안전한 미리보기와 메타데이터만 저장합니다. 작품별 권리·표장·초상·제3자 조건을 확인하기 전 Studio 직접 가져오기는 허용하지 않습니다.";
  if (item.license === "book-promotion") return "도서 소개·홍보 목적의 서지정보입니다. 원본 데이터 재판매나 임의 변경은 허용 범위를 다시 확인하세요.";
  return "검색 메타데이터입니다. 이미지·본문 재배포 또는 각색 허락을 의미하지 않습니다.";
}
