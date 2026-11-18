import { Link } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { requestAuthModalOpen } from "@/shared/lib/auth-modal-intent";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function ProductionProjectSignIn() {
  const bt = useBilingual("ProductionProjectSignIn");
  return (
    <section data-route-blocked="sign-in" className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-xl font-bold text-fg">{bt("제작 프로젝트에 로그인", "Sign in to your production project")}</h1>
      <p className="mt-2 text-sm text-fg-2">{bt("프로젝트에 참여한 계정으로 로그인하세요.", "Sign in with the account that has access to this project.")}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className={buttonClass({ className: "min-h-11" })}
          onClick={() => requestAuthModalOpen({ mode: "login", reason: "protected-action", source: "production-project" })}>
          {bt("로그인", "Sign in")}
        </button>
        <Link className={buttonClass({ variant: "outline", className: "min-h-11" })} to="/production/projects/sample-project/overview">
          {bt("샘플 프로젝트 보기", "Open the sample project")}
        </Link>
        <Link className={buttonClass({ variant: "ghost", className: "min-h-11" })} to="/production">{bt("제작 관리 홈", "Production home")}</Link>
      </div>
    </section>
  );
}
