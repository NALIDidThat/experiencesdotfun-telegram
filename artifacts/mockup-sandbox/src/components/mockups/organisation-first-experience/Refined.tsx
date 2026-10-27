import { ArrowRight, Plus } from "lucide-react";
import "./_group.css";

export function Refined() {
  return (
    <main className="organisation-first-experience-scope flex min-h-[100dvh] items-center justify-center bg-[#f6f3f8] px-4 py-8">
      <article className="w-full max-w-[360px] rounded-[22px] border border-[#e7dce9] bg-[#fffdfd] p-[14px] shadow-[0_12px_30px_rgba(62,28,67,0.08)]">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#fce5f1] text-[#b90068]"
          >
            <Plus size={21} strokeWidth={2.5} />
          </span>
          <div className="min-w-0 pt-[1px]">
            <h2 className="text-[14px] font-bold leading-[19px] tracking-[-0.25px] text-[#251b29]">
              Create your first experience
            </h2>
            <p className="mt-1 text-[12px] leading-[17px] text-[#5e5362]">
              Set up a clear, useful way for participants to contribute.
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-label="Create experience"
          className="mt-3 flex min-h-12 w-full items-center justify-between rounded-[14px] bg-[#6805f2] px-4 text-left text-[13px] font-semibold text-white shadow-[0_3px_8px_rgba(104,5,242,0.18)] transition-transform duration-150 hover:bg-[#5d04d9] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b008b]"
        >
          <span>Create experience</span>
          <ArrowRight size={17} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </article>
    </main>
  );
}
