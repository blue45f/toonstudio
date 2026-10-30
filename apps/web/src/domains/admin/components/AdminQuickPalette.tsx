import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { Download, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  ADMIN_NAVIGATION_GROUPS,
  ADMIN_ROUTE_BY_ID,
  getAdminShellCopy,
} from "../router/admin-route-manifest";
import {
  adminFetchText,
  downloadAdminFile,
} from "./admin-client";
import { AdminRouteIcon } from "./admin-ui";
import { useAdminToast } from "./use-admin-toast";

import { useI18n, useT } from "@/shared/lib/i18n";
import { usePathname, useRouter } from "@/shared/navigation/navigation";

interface AdminQuickPaletteProps {
  userId: string;
}

export function AdminQuickPalette({ userId }: AdminQuickPaletteProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const lang = useI18n((state) => state.lang);
  const copy = getAdminShellCopy(lang);
  const t = useT();
  const { showToast } = useAdminToast();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (
        event.key.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const close = () => {
    setOpen(false);
  };

  const navigate = (path: string) => {
    setOpen(false);
    router.push(path, { scroll: false });
  };

  const exportCsv = async (
    path: string,
    filename: string,
    success: string,
  ) => {
    try {
      const csv = await adminFetchText(path, userId);
      downloadAdminFile(filename, csv, "text/csv;charset=utf-8");
      showToast(success);
    } catch (error) {
      showToast(
        copy.downloadFailed,
        error instanceof Error ? error.message : copy.downloadFailed,
        "error",
      );
    }
  };

  const itemClass =
    "flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm text-fg-2 outline-none transition-colors data-[selected=true]:bg-accent/10 data-[selected=true]:text-accent";

  const overlay =
    open && typeof document !== "undefined"
      ? createPortal(
          <Dialog.Overlay
            className="fixed inset-0 z-[110] flex items-start justify-center bg-canvas/85 p-4 pt-[10vh] backdrop-blur-sm"
            role="presentation"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) close();
            }}
          >
            <Dialog.Content
              aria-describedby={undefined}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                inputRef.current?.focus();
              }}
              className="w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl shadow-canvas"
            >
              <Dialog.Title className="sr-only">{t("admin.palette.trigger")}</Dialog.Title>
              <Command label={t("admin.palette.placeholder")} className="bg-transparent text-fg">
                <div className="flex items-center gap-2 border-b border-line px-4">
                  <Search className="text-fg-3" size={17} />
                  <Command.Input
                    ref={inputRef}
                    aria-label={t("admin.palette.placeholder")}
                    placeholder={t("admin.palette.placeholder")}
                    className="min-h-14 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
                  />
                  <button
                    type="button"
                    onClick={close}
                    aria-label={copy.closeCommandPalette}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg"
                  >
                    <X size={16} />
                  </button>
                </div>

                <Command.List className="max-h-[65vh] overflow-y-auto p-2">
                  <Command.Empty className="px-4 py-10 text-center text-sm text-fg-3">
                    {t("admin.palette.empty")}
                  </Command.Empty>

                  {ADMIN_NAVIGATION_GROUPS.map((group) => (
                    <Command.Group
                      key={group.id}
                      heading={copy.groups[group.id]}
                      className="mb-2 px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-3"
                    >
                      {group.routeIds.map((routeId) => {
                        const route = ADMIN_ROUTE_BY_ID[routeId];
                        return (
                          <Command.Item
                            key={route.id}
                            value={`${t(route.labelKey)} ${route.keywords.join(" ")}`}
                            onSelect={() => navigate(route.path)}
                            className={itemClass}
                          >
                            <AdminRouteIcon
                              icon={route.icon}
                              className="text-fg-3"
                            />
                            <span>{t(route.labelKey)}</span>
                          </Command.Item>
                        );
                      })}
                    </Command.Group>
                  ))}

                  <Command.Group
                    heading={t("admin.palette.groupQuick")}
                    className="border-t border-line px-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-3"
                  >
                    <Command.Item
                      value={`${t("admin.palette.exportUsers")} csv members`}
                      onSelect={() => {
                        setOpen(false);
                        void exportCsv(
                          "/users/export/csv",
                          "members.csv",
                          copy.exportMembersSuccess,
                        );
                      }}
                      className={itemClass}
                    >
                      <Download size={16} className="text-fg-3" />
                      {t("admin.palette.exportUsers")}
                    </Command.Item>
                    <Command.Item
                      value={`${t("admin.palette.exportRevenue")} csv revenue`}
                      onSelect={() => {
                        setOpen(false);
                        void exportCsv(
                          "/revenue/export/csv",
                          "revenue-ledger.csv",
                          copy.exportRevenueSuccess,
                        );
                      }}
                      className={itemClass}
                    >
                      <Download size={16} className="text-fg-3" />
                      {t("admin.palette.exportRevenue")}
                    </Command.Item>
                  </Command.Group>
                </Command.List>
              </Command>
            </Dialog.Content>
          </Dialog.Overlay>,
          document.body,
        )
      : null;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
      <button
        data-admin-command-trigger="true"
        ref={triggerRef}
        type="button"
        className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
        aria-label={t("admin.palette.trigger")}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Search size={14} />
        <span className="hidden sm:inline">
          {t("admin.palette.trigger")}
        </span>
        <kbd className="hidden rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-fg-3 md:inline">
          ⌘K
        </kbd>
      </button>
      </Dialog.Trigger>
      {overlay}
    </Dialog.Root>
  );
}
