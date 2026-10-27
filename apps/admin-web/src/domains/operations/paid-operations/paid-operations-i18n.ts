/**
 * paid-operations-i18n.ts — 유료 운영 마스터 스위치 토글 문구 사전.
 */
export const paidOperationsI18n = {
  ko: {
    "admin.paidOperations.title": "유료 운영",
    "admin.paidOperations.desc":
      "어드민에서 이 스위치를 켠 경우에만 유료 서비스가 실행됩니다. 끈 상태에서는 유료 호출이 거부되고 무료 기능은 그대로 동작합니다.",
    "admin.paidOperations.enabled": "유료 운영 중",
    "admin.paidOperations.disabled": "유료 운영 중단",
    "admin.paidOperations.toggleOn": "유료 운영 켜기",
    "admin.paidOperations.toggleOff": "유료 운영 끄기",
    "admin.paidOperations.saving": "저장하는 중…",
    "admin.paidOperations.loadFailed": "유료 운영 상태를 불러오지 못했습니다. 잠시 후 다시 시도하세요.",
    "admin.paidOperations.saveFailed": "유료 운영 상태 저장에 실패했습니다. 잠시 후 다시 시도하세요.",
    "admin.paidOperations.retry": "다시 불러오기",
    "admin.paidOperations.freeNote": "무료 기능은 이 스위치와 무관하게 동작합니다.",
  },
  en: {
    "admin.paidOperations.title": "Paid operations",
    "admin.paidOperations.desc":
      "Paid services run only while this switch is on. While it is off, paid calls are rejected and free features keep working.",
    "admin.paidOperations.enabled": "Paid operations on",
    "admin.paidOperations.disabled": "Paid operations off",
    "admin.paidOperations.toggleOn": "Turn paid operations on",
    "admin.paidOperations.toggleOff": "Turn paid operations off",
    "admin.paidOperations.saving": "Saving…",
    "admin.paidOperations.loadFailed": "Could not load the paid operations status.",
    "admin.paidOperations.saveFailed": "Could not save the paid operations status.",
    "admin.paidOperations.retry": "Reload",
    "admin.paidOperations.freeNote": "Free features work regardless of this switch.",
  },
} as const;
