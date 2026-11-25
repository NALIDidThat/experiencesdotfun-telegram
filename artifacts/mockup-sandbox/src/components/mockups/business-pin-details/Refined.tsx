import { ArrowUpRight, ChevronRight, Clock3, MapPin, Navigation, Phone, Star, X } from "lucide-react";
import "./_group.css";

const place = {
  name: "The Common Room",
  address: "18 Market Street, Shoreditch",
  rating: "4.8",
  ratingCount: "126",
  status: "Operating",
};

export function Refined() {
  return (
    <main className="min-h-screen bg-[#e8edf0] p-3 text-[#111]">
      <div className="relative mx-auto h-[576px] max-w-[420px] overflow-hidden rounded-[28px] border border-black/10 bg-[#e7edf0] shadow-xl">
        <div className="absolute inset-0 opacity-70" aria-hidden="true">
          <div className="absolute left-[38%] top-[-10%] h-[120%] w-[18px] rotate-[28deg] bg-white" />
          <div className="absolute left-[-10%] top-[34%] h-[17px] w-[120%] rotate-[-12deg] bg-white" />
          <div className="absolute left-[68%] top-[-10%] h-[120%] w-[10px] rotate-[-24deg] bg-white" />
          <div className="absolute left-[10%] top-[24%] h-[10px] w-[120%] rotate-[18deg] bg-white" />
          <div className="absolute left-[49%] top-[10%] rotate-[-18deg] text-[10px] font-medium text-slate-500">SHOREDITCH</div>
          <div className="absolute left-[14%] top-[55%] rotate-[12deg] text-[9px] text-slate-500">MARKET STREET</div>
        </div>

        <div className="absolute left-[14%] top-[17%] flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white bg-[#f20789] text-xs font-bold text-white shadow-md">3</div>
        <button aria-label="The Common Room business pin" className="absolute right-[18%] top-[28%] flex h-12 w-10 flex-col items-center justify-start" onClick={() => document.getElementById("business-card")?.scrollIntoView({ behavior: "smooth", block: "nearest" })}>
          <span className="z-10 flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white bg-[#f20789] text-white shadow-[0_5px_14px_rgba(90,0,50,0.3)]"><MapPin size={17} fill="white" strokeWidth={2.5} /></span>
          <span className="-mt-2 h-3 w-3 rotate-45 rounded-[2px] bg-[#f20789]" />
        </button>
        <div className="absolute right-[28%] top-[47%] flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#f20789] bg-white text-[11px] font-bold text-[#f20789] shadow-md">2</div>
        <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-[11px] font-semibold shadow-sm backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-[#04adbf]" />Local places
        </div>

        <section id="business-card" className="absolute inset-x-3 bottom-3 overflow-hidden rounded-[22px] border border-black/10 bg-white shadow-[0_14px_36px_rgba(17,24,39,0.22)]">
          <div className="h-1.5 bg-gradient-to-r from-[#f20789] via-[#f20789] to-[#6805f2]" />
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f20789]/10 text-[#f20789]">
                <MapPin size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[17px] font-bold tracking-[-0.02em]">{place.name}</p>
                  <span className="shrink-0 rounded-full bg-[#6805f2]/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#6805f2]">EXP place</span>
                </div>
                <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-slate-600">
                  <MapPin size={13} className="mt-0.5 shrink-0 text-slate-400" />{place.address}
                </p>
              </div>
              <button aria-label="Close business details" className="rounded-full p-2 text-slate-500"><X size={17} /></button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-slate-100 py-3 text-xs">
              <span className="inline-flex items-center gap-1 font-bold"><Star size={14} fill="#f3a712" className="text-amber-500" />{place.rating}<span className="font-normal text-slate-500">({place.ratingCount})</span></span>
              <span className="inline-flex items-center gap-1.5 text-slate-600"><Clock3 size={13} className="text-[#04adbf]" />{place.status}</span>
              <span className="text-[10px] text-slate-400">Google Maps details</span>
            </div>

            <div className="mt-3 flex gap-2">
              <button className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#f20789] px-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#d90079]">
                <Navigation size={16} />Directions <ArrowUpRight size={14} className="opacity-80" />
              </button>
              <button aria-label="Call The Common Room" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">
                <Phone size={16} className="text-[#f20789]" />Call
              </button>
            </div>
            <button className="mt-2 flex min-h-10 w-full items-center justify-between rounded-lg px-1 text-xs font-semibold text-slate-600">
              <span>Browse 3 nearby places</span><ChevronRight size={16} />
            </button>
          </div>
        </section>
      </div>
      <p className="mx-auto mt-3 max-w-[420px] text-xs text-gray-500">Selected pin opens a focused card above the map sheet, with an obvious route out.</p>
    </main>
  );
}
