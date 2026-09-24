import { ArrowLeft, Award, CalendarDays, MapPin, Users } from "lucide-react";
import "./_group.css";

const experience = {
  category: "Community",
  title: "EXP - 001",
  organisation: "Experiences Dot Fun",
  date: "Fri 25 Sept",
  time: "10:00 – 12:00",
  city: "London",
  location: "N",
  description:
    "About this experience — spend time with local people, learn something new, and make a positive difference in your community.",
};

export function Current() {
  return (
    <div className="experience-details-scope min-h-screen bg-[#f7f7f8]">
      <div className="bg-[#f20789] px-3 py-2 text-center text-[12px] font-medium text-white">
        You&apos;re early!🥳 Please give feedback to <u>@NALIDidThat</u>
      </div>
      <main className="mx-auto min-h-screen max-w-[390px] bg-white px-5 pb-40 pt-4">
        <header className="mb-6 flex items-start gap-4">
          <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f5f5f7]" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="pt-1 text-[25px] font-bold tracking-[-0.7px]">Details</h1>
        </header>

        <section className="relative mb-6 flex h-[240px] flex-col justify-end overflow-hidden rounded-[22px] bg-gradient-to-br from-[#f20789] to-[#6805f2] p-6 text-white">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
            <Users size={32} />
          </div>
          <p className="mb-1 text-[12px] font-bold uppercase tracking-[1.1px] text-white/80">{experience.category}</p>
          <h2 className="mb-2 text-[28px] font-bold leading-tight">{experience.title}</h2>
          <p className="text-[15px] text-white/90">{experience.organisation} · Verified</p>
        </section>

        <section className="mb-7 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-[#e8e8ed] p-4">
            <p className="mb-2 text-[11px] font-bold tracking-[1px] text-[#72727c]">WHEN</p>
            <CalendarDays size={17} className="mb-2 text-[#f20789]" />
            <p className="text-[15px] font-semibold">{experience.date}</p>
            <p className="mt-1 text-[13px] text-[#72727c]">{experience.time}</p>
          </div>
          <div className="rounded-2xl border border-[#e8e8ed] p-4">
            <p className="mb-2 text-[11px] font-bold tracking-[1px] text-[#72727c]">WHERE</p>
            <MapPin size={17} className="mb-2 text-[#f20789]" />
            <p className="text-[15px] font-semibold">{experience.city}</p>
            <p className="mt-1 text-[13px] text-[#72727c]">{experience.location}</p>
          </div>
        </section>

        <h2 className="mb-2 text-[18px] font-bold">About this experience</h2>
        <p className="mb-7 text-[15px] leading-6 text-[#62626c]">{experience.description}</p>

        <section className="mb-6 flex items-center justify-between rounded-2xl border border-[#e8e8ed] p-4">
          <div>
            <p className="mb-1 text-[11px] font-bold tracking-[1px] text-[#72727c]">YOU&apos;LL EARN</p>
            <p className="text-[18px] font-bold text-[#f20789]">+150 XP</p>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-bold tracking-[1px] text-[#72727c]">REWARD</p>
            <p className="text-[18px] font-bold text-[#04adbf]">£5.00</p>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-bold tracking-[1px] text-[#72727c]">PLACES</p>
            <p className="text-[18px] font-bold">8</p>
          </div>
        </section>

        <section className="mb-6 rounded-2xl bg-[#f7f7f8] p-4">
          <div className="mb-2 flex items-center gap-2">
            <Award size={18} className="text-[#f20789]" />
            <h2 className="text-[16px] font-bold">What you&apos;ll do</h2>
          </div>
          <p className="text-[14px] leading-5 text-[#62626c]">Meet your neighbours and take part in a welcoming community activity.</p>
        </section>
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-[#e8e8ed] bg-white px-5 pb-8 pt-3">
        <div className="mx-auto flex max-w-[390px] items-center gap-4">
          <div className="min-w-[92px]">
            <p className="text-[10px] font-bold tracking-[0.8px] text-[#72727c]">YOUR REWARD</p>
            <p className="mt-1 text-[16px] font-bold text-[#f20789]">+150 XP</p>
          </div>
          <button className="h-12 flex-1 rounded-2xl bg-[#f20789] text-[15px] font-semibold text-white">Join experience</button>
        </div>
      </footer>
    </div>
  );
}