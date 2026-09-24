import { CalendarDays, ChevronRight } from "lucide-react";
import "./_group.css";

export function Reference() {
  return (
    <main className="dashboard-greeting-scope min-h-screen bg-[#f0f0f2] p-[18px]">
      <section className="relative min-h-[260px] overflow-hidden rounded-[30px] px-6 pt-[34px]">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#6805f2_0%,#f20789_52%,#1a98e5_100%)]" />
        <div className="absolute -right-[82px] -top-[82px] h-[220px] w-[220px] rounded-full bg-white/[0.15]" />
        <div className="absolute -bottom-[76px] -left-[60px] h-[160px] w-[160px] rounded-full bg-white/[0.15]" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="h-12 w-[3px] shrink-0 rounded-full bg-white/60" />
            <div className="min-w-0">
              <p className="mb-[3px] text-[14px] font-medium leading-[18px] text-white/[0.82]">
                Welcome back
              </p>
              <h1 className="truncate text-[34px] font-bold leading-10 tracking-[-0.9px] text-white">
                Alex
              </h1>
            </div>
          </div>

          <button
            type="button"
            className="mt-6 flex min-h-[72px] w-full items-center gap-3 rounded-[22px] bg-white px-3 py-2.5 text-left"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center gap-[3px] rounded-full bg-[#f20789] text-white">
              <span className="text-[16px] font-bold">0</span>
              <CalendarDays size={14} strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold leading-[18px] text-[#17171b]">
                Ready for your first experience?
              </span>
              <span className="block text-[11px] leading-4 text-[#72727c]">
                Find something meaningful nearby
              </span>
            </span>
            <ChevronRight size={22} className="shrink-0 text-[#72727c]" />
          </button>
        </div>
      </section>
    </main>
  );
}