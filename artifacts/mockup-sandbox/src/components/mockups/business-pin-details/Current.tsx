import { MapPin, Navigation, Phone, Star, X } from "lucide-react";
import "./_group.css";

const place = {
  name: "The Common Room",
  address: "18 Market Street, Shoreditch",
  rating: "4.8",
  ratingCount: "126 ratings",
  status: "Operating",
};

export function Current() {
  return (
    <main className="min-h-screen bg-[#e8edf0] p-3 text-[#111]">
      <div className="relative mx-auto h-[576px] max-w-[420px] overflow-hidden rounded-[28px] border border-black/10 bg-[#e7edf0] shadow-xl">
        <div className="absolute inset-0 opacity-70" aria-hidden="true">
          <div className="absolute left-[38%] top-[-10%] h-[120%] w-[18px] rotate-[28deg] bg-white" />
          <div className="absolute left-[-10%] top-[34%] h-[17px] w-[120%] rotate-[-12deg] bg-white" />
          <div className="absolute left-[68%] top-[-10%] h-[120%] w-[10px] rotate-[-24deg] bg-white" />
          <div className="absolute left-[10%] top-[24%] h-[10px] w-[120%] rotate-[18deg] bg-white" />
        </div>
        <div className="absolute left-[14%] top-[17%] flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white bg-[#f20789] text-xs font-bold text-white shadow-md">3</div>
        <div className="absolute right-[18%] top-[28%] flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#f20789] bg-white text-[11px] font-bold text-[#f20789] shadow-md">1</div>
        <div className="absolute right-[28%] top-[47%] flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#f20789] bg-[#f20789] text-[11px] font-bold text-white shadow-md">2</div>

        <section className="absolute inset-x-3 bottom-3 max-h-[330px] overflow-hidden rounded-[20px] border border-black/10 bg-white p-3 shadow-[0_10px_32px_rgba(17,24,39,0.16)]">
          <div className="mb-2 flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f20789]">Nearby places</p>
              <p className="mt-1 text-[15px] font-bold">Google businesses around this map area</p>
            </div>
            <button aria-label="Close" className="rounded-full p-2 text-gray-500"><X size={17} /></button>
          </div>
          <div className="mb-2 flex items-center gap-2 overflow-hidden text-xs text-gray-600">
            <span className="rounded-full bg-[#f7f7f8] px-3 py-1.5">All</span>
            <span className="rounded-full bg-[#f7f7f8] px-3 py-1.5">Food</span>
            <span className="rounded-full bg-[#f7f7f8] px-3 py-1.5">Community</span>
          </div>
          <div className="rounded-xl border border-[#eaeaea] bg-[#f7f7f8] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-bold">{place.name}</h1>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-600">{place.address}</p>
              </div>
              <button aria-label="Close business details" className="rounded-full p-1.5 text-gray-500"><X size={15} /></button>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 font-semibold"><Star size={13} fill="#f3a712" className="text-amber-500" />{place.rating} <span className="font-normal text-gray-500">· {place.ratingCount}</span></span>
              <span className="text-gray-600">{place.status}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#eaeaea] bg-white text-xs font-semibold text-[#f20789]"><Navigation size={14} />View in Google Maps</button>
              <button aria-label="Call business" className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#eaeaea] bg-white px-3 text-xs font-semibold text-[#f20789]"><Phone size={14} />Call</button>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-[#eaeaea] pt-2 text-xs">
            <span className="font-semibold">Places in this area</span>
            <span className="text-gray-500">3</span>
          </div>
          <div className="mt-1 flex items-center gap-2 py-1.5 text-xs text-gray-600">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-50 font-bold text-[#f20789]">1</span>
            <span>{place.name}</span>
            <MapPin size={13} className="ml-auto text-gray-400" />
          </div>
        </section>
      </div>
      <p className="mx-auto mt-3 max-w-[420px] text-xs text-gray-500">Current Nearby Places layout — details are nested inside the map-tools panel.</p>
    </main>
  );
}
