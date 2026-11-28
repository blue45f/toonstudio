import { BookOpen, PlayCircle } from "lucide-react";
import { useRef, useState, type ReactElement, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { SpacePopover } from "./SpacePopover";
import type { SpaceWorkProject } from "./use-space-work-project";

export interface SpaceWorkTriggerProps {
  readonly className: string;
  readonly onClick: () => void;
  readonly "aria-haspopup"?: "dialog";
  readonly "aria-expanded"?: boolean;
  readonly "data-space-exact-resume"?: "true";
  readonly children: ReactNode;
}

/**
 * 도크의 주 버튼 '작업 시작'.
 * 팀은 현재 원고를 바로 열고, 개인은 작업 선택 창에서 최근 원고의 복원 지점을 확인한다.
 * 버튼 요소는 Page가 render prop으로 그려 주 동작 계약 속성을 유지한다.
 */
export function SpaceWorkLauncher({ project, personal, open, sheet, onOpenChange, trigger, children }: {
  readonly project: SpaceWorkProject;
  readonly personal: boolean;
  readonly open: boolean;
  readonly sheet: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly trigger: (props: SpaceWorkTriggerProps) => ReactElement;
  /** 팝오버 안의 작업 선택지. */
  readonly children: ReactNode;
}) {
  const bt = useBilingual("SpaceWorkLauncher");
  const navigate = useNavigate();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [resumeStale, setResumeStale] = useState(false);
  const { resumeHref, verifyResume } = project;
  const openResume = () => {
    if (!resumeHref) return;
    if (verifyResume(resumeHref)) {
      setResumeStale(false);
      navigate(resumeHref);
    } else {
      setResumeStale(true);
    }
  };
  const props: SpaceWorkTriggerProps = resumeHref && !personal ? {
    className: "space-dock__primary",
    "data-space-exact-resume": "true",
    onClick: openResume,
    children: <><PlayCircle size={18} aria-hidden /><span>{bt("원고 이어하기", "Resume manuscript")}</span></>,
  } : {
    className: "space-dock__primary",
    "aria-haspopup": "dialog",
    "aria-expanded": open,
    onClick: () => { setResumeStale(false); onOpenChange(!open); },
    children: <><BookOpen size={18} aria-hidden /><span>{bt("작업 시작", "Start work")}</span></>,
  };
  const staleMessage = bt("이어할 원고가 바뀌었어요. 최신 작업을 확인해 주세요.", "The saved manuscript changed. Check the latest work before continuing.");
  return <div ref={anchorRef} className="workspace-live-actions space-dock__work space-dock__anchor">
    {trigger(props)}
    <SpacePopover open={open} sheet={sheet} anchorRef={anchorRef} onClose={() => { setResumeStale(false); onOpenChange(false); }}
      title={bt("무엇부터 할까요?", "What will you work on?")} className="space-popover--work">
      {personal && resumeHref ? <button type="button" className="space-work-recent" onClick={openResume}>
        <PlayCircle size={22} aria-hidden />
        <span>
          <small>{bt("최근 원고 이어하기", "Resume recent manuscript")}</small>
          <strong>{project.title}</strong>
          {project.resumeSummary ? <span>{project.resumeSummary}</span> : null}
        </span>
      </button> : null}
      {resumeStale ? <p role="status">{staleMessage}</p> : null}
      {children}
    </SpacePopover>
    {!open && resumeStale ? <p className="space-dock__resume-note" role="status">{staleMessage}</p> : null}
  </div>;
}
