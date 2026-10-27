import { ChevronRight, PlusCircle } from "lucide-react";
import "./_group.css";

export function Current() {
  return (
    <main className="organisation-first-experience-scope flex min-h-screen items-center justify-center bg-[#f7f7f8] px-4">
      <button
        type="button"
        aria-label="Create your first experience. Set up a clear, useful way for participants to contribute. Create experience."
        className="flex min-h-[78px] w-full max-w-[360px] items-center gap-[10px] rounded-2xl border border-[#eaeaea] bg-white px-[10px] py-[11px] text-left"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[rgba(242,7,137,0.09)]">
          <PlusCircle size={19} strokeWidth={2} className="text-[#f20789]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-bold leading-4 text-[#111111]">
            Create your first experience
          </span>
          <span className="mt-[3px] block text-[10px] leading-[14px] text-[#666666]">
            Set up a clear, useful way for participants to contribute.
          </span>
          <span className="mt-[3px] block text-[11px] font-medium leading-[14px] text-[#f20789]">
            Create experience
          </span>
        </span>
        <ChevronRight size={18} strokeWidth={2} className="shrink-0 text-[#666666]" />
      </button>
    </main>
  );
}
