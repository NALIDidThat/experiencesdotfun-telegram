import { Users } from "lucide-react";
import "./_group.css";

export function Current() {
  return (
    <main className="experience-card-scope flex min-h-screen items-center justify-center bg-[#f7f7f8] px-4">
      <button
        type="button"
        aria-label="View EXP - 001"
        className="flex min-h-[76px] w-full max-w-[360px] items-center gap-3 rounded-2xl border border-[#e8e8ed] bg-white p-[11px] text-left"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] bg-gradient-to-br from-[#6805f2] to-[#f20789]">
          <Users size={24} strokeWidth={2} className="text-white" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold leading-[18px] text-[#17171b]">
            EXP - 001
          </span>
          <span className="mt-1 block truncate text-[12px] leading-4 text-[#72727c]">
            Fri 25 Sept · London
          </span>
        </span>
        <span
          className="shrink-0 rounded-[10px] px-[9px] py-[6px] text-[11px] font-bold text-[#f20789]"
          style={{ backgroundColor: "rgba(242, 7, 137, 0.07)" }}
        >
          +1500 XP
        </span>
      </button>
    </main>
  );
}