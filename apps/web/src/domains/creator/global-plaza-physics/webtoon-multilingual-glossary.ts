/**
 * 6개국어(ko · en · vi · th · id · ja) 웹툰 제작 실무 용어집 및 양방향 자동 번역 브리지.
 */

export type PlazaLanguageCode = "ko" | "en" | "vi" | "th" | "id" | "ja";

export interface PlazaLanguageMetadata {
  readonly code: PlazaLanguageCode;
  readonly badge: string;
  readonly nativeLabel: string;
  readonly labelKo: string;
  readonly regionKo: string;
}

export const PLAZA_LANGUAGE_CODES: readonly PlazaLanguageCode[] = [
  "ko",
  "en",
  "vi",
  "th",
  "id",
  "ja",
];

export const PLAZA_LANGUAGE_METADATA: Readonly<Record<PlazaLanguageCode, PlazaLanguageMetadata>> = {
  ko: { code: "ko", badge: "KO", nativeLabel: "한국어", labelKo: "한국어", regionKo: "서울 (KST)" },
  en: { code: "en", badge: "EN", nativeLabel: "English", labelKo: "영어", regionKo: "글로벌 · 미국/필리핀" },
  vi: { code: "vi", badge: "VI", nativeLabel: "Tiếng Việt", labelKo: "베트남어", regionKo: "하노이 · 호치민" },
  th: { code: "th", badge: "TH", nativeLabel: "ภาษาไทย", labelKo: "태국어", regionKo: "방콕" },
  id: { code: "id", badge: "ID", nativeLabel: "Bahasa Indonesia", labelKo: "인도네시아어", regionKo: "자카르타" },
  ja: { code: "ja", badge: "JA", nativeLabel: "日本語", labelKo: "일본어", regionKo: "도쿄" },
};

export interface WebtoonGlossaryEntry {
  readonly id: string;
  readonly category: "deadline" | "art-stage" | "review" | "contract" | "ops";
  readonly terms: Readonly<Record<PlazaLanguageCode, string>>;
  readonly aliases?: Readonly<Partial<Record<PlazaLanguageCode, readonly string[]>>>;
}

export interface WebtoonTranslationResult {
  readonly sourceLang: PlazaLanguageCode;
  readonly targetLang: PlazaLanguageCode;
  readonly originalText: string;
  readonly translatedText: string;
  readonly matchedGlossaryIds: readonly string[];
  readonly method: "same-language" | "exact-phrase" | "glossary-composed" | "fallback-tagged";
  readonly confidence: number;
}

export const WEBTOON_STUDIO_GLOSSARY: readonly WebtoonGlossaryEntry[] = [
  {
    id: "lineart-20-deadline",
    category: "deadline",
    terms: {
      ko: "선화 20컷 마감",
      en: "20 lineart cuts deadline",
      vi: "Hạn chót 20 khung đi nét",
      th: "กำหนดส่งตัดเส้น 20 ช่อง",
      id: "Tenggat 20 panel lineart",
      ja: "線画20カット締切",
    },
    aliases: {
      ko: ["선화 20컷", "선화 20 컷 마감"],
      en: ["lineart 20 cuts deadline", "20 cuts lineart due"],
    },
  },
  {
    id: "lineart-revision",
    category: "review",
    terms: {
      ko: "라인아트 수정",
      en: "Lineart revision",
      vi: "Chỉnh sửa đi nét",
      th: "แก้ไขงานตัดเส้น",
      id: "Revisi lineart",
      ja: "線画修正",
    },
    aliases: { ko: ["선화 수정"], en: ["line art fix", "lineart fix"] },
  },
  {
    id: "color-tone-unify",
    category: "art-stage",
    terms: {
      ko: "채색 톤 통일",
      en: "Unify color tone",
      vi: "Đồng bộ tông màu tô",
      th: "ปรับโทนสีให้สม่ำเสมอ",
      id: "Samakan tone pewarnaan",
      ja: "着彩トーン統一",
    },
    aliases: { ko: ["색감 통일", "채색 톤 맞추기"], en: ["color tone unification", "match color tone"] },
  },
  {
    id: "rate-negotiation",
    category: "contract",
    terms: {
      ko: "단가 협의",
      en: "Rate negotiation",
      vi: "Thỏa thuận đơn giá",
      th: "เจรจาค่าจ้างต่อช่อง",
      id: "Negosiasi tarif per panel",
      ja: "単価協議",
    },
    aliases: { ko: ["컷당 단가 협의", "단가 조율"], en: ["price negotiation", "per-cut rate"] },
  },
  {
    id: "escrow-milestone",
    category: "contract",
    terms: {
      ko: "단계별 에스크로 정산",
      en: "Milestone escrow settlement",
      vi: "Thanh toán ký quỹ theo mốc",
      th: "ชำระเงินผ่านเอสโครว์ตามขั้นตอน",
      id: "Pembayaran escrow bertahap",
      ja: "段階別エスクロー精算",
    },
  },
  {
    id: "zero-leak-slice",
    category: "ops",
    terms: {
      ko: "부분 컷 워터마크 열람",
      en: "Scoped cut watermark view",
      vi: "Xem khung cắt có hình mờ",
      th: "ดูเฉพาะช่องที่ได้รับสิทธิ์พร้อมลายน้ำ",
      id: "Akses panel terbatas berwatermark",
      ja: "部分カット透かし閲覧",
    },
  },
  {
    id: "bg3d-lighting",
    category: "art-stage",
    terms: {
      ko: "3D 배경 조명 보정",
      en: "3D background lighting polish",
      vi: "Chỉnh ánh sáng nền 3D",
      th: "ปรับแสงฉากหลัง 3D",
      id: "Penyesuaian pencahayaan latar 3D",
      ja: "3D背景ライティング補正",
    },
  },
  {
    id: "typesetting-sfx",
    category: "art-stage",
    terms: {
      ko: "식자 및 효과음 현지화",
      en: "Lettering and SFX localization",
      vi: "Dàn chữ và bản địa hóa SFX",
      th: "จัดวางตัวอักษรและปรับเสียงเอฟเฟกต์",
      id: "Typesetting dan lokalisasi SFX",
      ja: "写植・擬音ローカライズ",
    },
  },
  {
    id: "ad-review-approved",
    category: "review",
    terms: {
      ko: "AD 검수 승인",
      en: "AD review approved",
      vi: "AD đã duyệt kiểm tra",
      th: "AD อนุมัติการตรวจงานแล้ว",
      id: "Review AD disetujui",
      ja: "AD検収承認",
    },
  },
  {
    id: "retake-request",
    category: "review",
    terms: {
      ko: "리테이크 요청",
      en: "Retake requested",
      vi: "Yêu cầu chỉnh sửa lại",
      th: "ขอแก้ไขงานเพิ่มเติม",
      id: "Permintaan retake",
      ja: "リテイク依頼",
    },
  },
  {
    id: "by-tonight-kst",
    category: "deadline",
    terms: {
      ko: "오늘 밤 KST까지 전달 가능",
      en: "Can deliver by tonight KST",
      vi: "Có thể giao trước tối nay giờ KST",
      th: "สามารถส่งงานได้ภายในคืนนี้ตามเวลา KST",
      id: "Bisa dikirim sebelum malam ini KST",
      ja: "今夜KSTまでに納品可能",
    },
  },
  {
    id: "base-color-flat",
    category: "art-stage",
    terms: {
      ko: "밑색 플랫 완료",
      en: "Base flat color completed",
      vi: "Hoàn thành tô màu nền",
      th: "ลงสีพื้นเสร็จเรียบร้อย",
      id: "Pewarnaan dasar selesai",
      ja: "下塗り完了",
    },
  },
  {
    id: "shading-highlight",
    category: "art-stage",
    terms: {
      ko: "명암 및 하이라이트 보정",
      en: "Shading and highlight pass",
      vi: "Hoàn thiện bóng đổ và ánh sáng",
      th: "เก็บงานแสงเงาและไฮไลต์",
      id: "Penyelesaian bayangan dan highlight",
      ja: "陰影・ハイライト仕上げ",
    },
  },
  {
    id: "storyboard-check",
    category: "review",
    terms: {
      ko: "콘티 연출 확인",
      en: "Storyboard pacing check",
      vi: "Kiểm tra bố cục phân cảnh",
      th: "ตรวจสอบการวางสตอรี่บอร์ด",
      id: "Cek alur storyboard",
      ja: "コンテ演出確認",
    },
  },
  {
    id: "voice-room-join",
    category: "ops",
    terms: {
      ko: "미팅룸 음성 입장",
      en: "Joining meeting room voice",
      vi: "Vào kênh thoại phòng họp",
      th: "เข้าร่วมห้องประชุมเสียง",
      id: "Masuk ruang suara rapat",
      ja: "会議室ボイス参加",
    },
  },
  {
    id: "layer-folder-clean",
    category: "ops",
    terms: {
      ko: "레이어 폴더 정리 요청",
      en: "Please organize layer folders",
      vi: "Vui lòng sắp xếp thư mục layer",
      th: "กรุณาจัดระเบียบโฟลเดอร์เลเยอร์",
      id: "Mohon rapikan folder layer",
      ja: "レイヤーフォルダ整理依頼",
    },
  },
  {
    id: "cut-slice-handoff",
    category: "contract",
    terms: {
      ko: "컷 슬라이스 계약 인계",
      en: "Cut-Slice contract handoff",
      vi: "Bàn giao hợp đồng Cut-Slice",
      th: "ส่งมอบสัญญา Cut-Slice",
      id: "Serah terima kontrak Cut-Slice",
      ja: "Cut-Slice契約引き継ぎ",
    },
  },
  {
    id: "confirmed-start-now",
    category: "ops",
    terms: {
      ko: "확인했습니다 바로 착수합니다",
      en: "Confirmed, starting right now",
      vi: "Đã xác nhận, bắt đầu làm ngay",
      th: "รับทราบครับ เริ่มดำเนินการทันที",
      id: "Dikonfirmasi, langsung mulai sekarang",
      ja: "確認しました、すぐ着手します",
    },
  },
];

export const QUICK_STUDIO_PHRASE_KEYS: readonly string[] = [
  "선화 20컷 마감",
  "라인아트 수정",
  "채색 톤 통일",
  "단가 협의",
  "단계별 에스크로 정산",
  "오늘 밤 KST까지 전달 가능",
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function normalizeLookup(text: string): string {
  return text.trim().replace(/\s+/gu, " ").toLowerCase();
}

export function translateWebtoonMessage(
  text: string,
  sourceLang: PlazaLanguageCode,
  targetLang: PlazaLanguageCode,
): WebtoonTranslationResult {
  const trimmed = text.trim();
  if (!trimmed || sourceLang === targetLang) {
    return {
      sourceLang,
      targetLang,
      originalText: trimmed,
      translatedText: trimmed,
      matchedGlossaryIds: [],
      method: "same-language",
      confidence: 1,
    };
  }

  const normalized = normalizeLookup(trimmed);

  for (const entry of WEBTOON_STUDIO_GLOSSARY) {
    const candidates = [entry.terms[sourceLang], ...(entry.aliases?.[sourceLang] ?? [])];
    for (const candidate of candidates) {
      if (normalizeLookup(candidate) === normalized) {
        return {
          sourceLang,
          targetLang,
          originalText: trimmed,
          translatedText: entry.terms[targetLang],
          matchedGlossaryIds: [entry.id],
          method: "exact-phrase",
          confidence: 0.99,
        };
      }
    }
  }

  const sortableCandidates: Array<{
    readonly entryId: string;
    readonly sourceTerm: string;
    readonly targetTerm: string;
  }> = [];

  for (const entry of WEBTOON_STUDIO_GLOSSARY) {
    const sourceForms = [entry.terms[sourceLang], ...(entry.aliases?.[sourceLang] ?? [])];
    for (const sourceForm of sourceForms) {
      sortableCandidates.push({
        entryId: entry.id,
        sourceTerm: sourceForm,
        targetTerm: entry.terms[targetLang],
      });
    }
  }
  sortableCandidates.sort((a, b) => b.sourceTerm.length - a.sourceTerm.length);

  let working = trimmed;
  const matchedIds = new Set<string>();

  for (const item of sortableCandidates) {
    const pattern = new RegExp(escapeRegExp(item.sourceTerm), "giu");
    if (pattern.test(working)) {
      working = working.replace(pattern, item.targetTerm);
      matchedIds.add(item.entryId);
    }
  }

  if (matchedIds.size > 0) {
    return {
      sourceLang,
      targetLang,
      originalText: trimmed,
      translatedText: working,
      matchedGlossaryIds: [...matchedIds],
      method: "glossary-composed",
      confidence: 0.91,
    };
  }

  const targetBadge = PLAZA_LANGUAGE_METADATA[targetLang].badge;
  return {
    sourceLang,
    targetLang,
    originalText: trimmed,
    translatedText: `[${targetBadge} 자동번역 브리지] ${trimmed}`,
    matchedGlossaryIds: [],
    method: "fallback-tagged",
    confidence: 0.72,
  };
}
