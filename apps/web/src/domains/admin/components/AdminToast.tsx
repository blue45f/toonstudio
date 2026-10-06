import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";
import { useState, useCallback } from "react";

import { ToastContext, type ToastMessage, type ToastType } from "./use-admin-toast";
import { useT } from "@/shared/lib/i18n";

export function AdminToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const t = useT();

  const showToast = useCallback((title: string, message?: string, type: ToastType = "success") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, title, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-start gap-3 transition-all duration-300 animate-fade-up ${
              toast.type === "success"
                ? "bg-card/90 border-good/30 text-good"
                : toast.type === "error"
                ? "bg-card/90 border-bad/30 text-bad"
                : toast.type === "warning"
                ? "bg-card/90 border-warn/30 text-warn"
                : "bg-card/90 border-accent/30 text-accent"
            }`}
          >
            <div className="mt-0.5">
              {toast.type === "success" && <CheckCircle2 className="w-5 h-5 text-good" />}
              {toast.type === "error" && <AlertCircle className="w-5 h-5 text-bad" />}
              {toast.type === "warning" && <AlertTriangle className="w-5 h-5 text-warn" />}
              {toast.type === "info" && <Info className="w-5 h-5 text-accent" />}
            </div>
            <div className="flex-1 space-y-0.5">
              <h4 className="text-sm font-semibold text-fg">{toast.title}</h4>
              {toast.message && <p className="text-xs text-fg-2">{toast.message}</p>}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              aria-label={t("common.close")}
              className="text-fg-3 hover:text-fg p-1 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
