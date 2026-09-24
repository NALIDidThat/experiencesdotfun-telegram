import { CalendarDays, MapPin, Users } from "lucide-react";
import "./_group.css";

export function Reference() {
  return (
    <main className="experience-card-scope flex min-h-screen items-center justify-center bg-[#f7f7f8] px-4 py-6">
      <article className="w-full max-w-[360px] overflow-hidden rounded-[24px] border border-[#e8e8ed] bg-white shadow-[0_14px_36px_rgba(25,20,39,0.1)]">
        <div className="relative h-[184px] overflow-hidden">
          <img
            src="/__mockup/images/community-cover.jpg"
            alt="People taking part in a community experience"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/20" />
          <div className="relative flex items-start justify-between p-3.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/95 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.06em] text-[#25232b]">
              <Users size={13} strokeWidth={2.2} className="text-[#f20789]" />
              Community
            </span>
          </div>
        </div>

        <div className="flex min-h-[88px] items-center gap-2.5 px-3 py-3">
          <span className="flex shrink-0 items-center gap-1.5 rounded-[13px] bg-[#f7f7f8] px-2.5 py-2 text-[10px] font-semibold text-[#17171b]">
            <CalendarDays size={13} className="text-[#f20789]" />
            Fri 25 Sept
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[14px] font-bold leading-[18px] text-[#17171b]">
              EXP - 001
            </h2>
            <div className="mt-1 flex min-w-0 items-center gap-1 text-[11px] leading-4 text-[#72727c]">
              <MapPin size={12} className="shrink-0" />
              <span className="truncate">London</span>
            </div>
          </div>

          <span
            className="shrink-0 rounded-[12px] border px-2 py-[7px] text-[10px] font-bold text-[#f20789]"
            style={{
              backgroundColor: "rgba(242, 7, 137, 0.07)",
              borderColor: "rgba(242, 7, 137, 0.2)",
            }}
          >
            +1500 XP
          </span>
        </div>
      </article>
    </main>
  );
}