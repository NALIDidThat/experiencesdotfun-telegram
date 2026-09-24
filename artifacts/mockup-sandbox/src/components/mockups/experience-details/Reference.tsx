import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  MapPin,
  Users,
} from "lucide-react";
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
    "Spend time with local people, learn something new, and make a positive difference in your community.",
  xpReward: 150,
  cashReward: "£5.00",
  places: 8,
};

export function Reference() {
  return (
    <div className="experience-details-scope min-h-screen bg-[#f7f7f8]">
      <div className="bg-[#f20789] px-3 py-2 text-center text-[12px] font-medium text-white">
        You&apos;re early!🥳 Please give feedback to <u>@NALIDidThat</u>
      </div>

      <main className="mx-auto min-h-screen max-w-[390px] bg-white pb-40">
        <header className="flex h-[58px] items-center justify-between px-5">
          <button className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f7f8]" aria-label="Back">
            <ArrowLeft size={19} />
          </button>
          <h1 className="text-[15px] font-semibold">Experience details</h1>
          <button className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f7f8]" aria-label="Share experience">
            <span className="text-[18px]">↗</span>
          </button>
        </header>

        <div className="relative h-[190px] overflow-hidden">
          <img
            src="/__mockup/images/community-cover.jpg"
            alt="People sharing food at a community gathering"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
          <div className="absolute bottom-4 left-5 flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.8px] text-[#f20789]">
            <Users size={14} />
            {experience.category}
          </div>
        </div>

        <section className="px-5 pt-5">
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-[#72727c]">
            <span>{experience.organisation}</span>
            <BadgeCheck size={15} className="text-[#04adbf]" />
          </div>
          <h2 className="text-[26px] font-bold leading-[1.15] tracking-[-0.7px]">{experience.title}</h2>
          <p className="mt-2 text-[14px] leading-[1.45] text-[#62626c]">{experience.description}</p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[#e8e8ed] bg-white p-3.5">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold tracking-[1px] text-[#72727c]">
                <CalendarDays size={14} className="text-[#f20789]" />
                WHEN
              </div>
              <p className="text-[14px] font-semibold">{experience.date}</p>
              <p className="mt-1 text-[12px] text-[#72727c]">{experience.time}</p>
            </div>
            <div className="rounded-2xl border border-[#e8e8ed] bg-white p-3.5">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold tracking-[1px] text-[#72727c]">
                <MapPin size={14} className="text-[#f20789]" />
                WHERE
              </div>
              <p className="text-[14px] font-semibold">{experience.city}</p>
              <p className="mt-1 truncate text-[12px] text-[#72727c]">{experience.location}</p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[#e8e8ed] p-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fce6f3] text-[15px] font-bold text-[#f20789]">E</div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#72727c]">Hosted by</p>
              <p className="mt-1 truncate text-[14px] font-semibold">{experience.organisation}</p>
            </div>
            <BadgeCheck size={19} className="shrink-0 text-[#04adbf]" />
          </div>

          <section className="mt-5 rounded-2xl border border-[#e8e8ed] bg-white px-4 py-3.5">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[9px] font-bold tracking-[0.8px] text-[#72727c]">YOU&apos;LL EARN</p>
                <p className="mt-1 text-[15px] font-bold text-[#f20789]">+{experience.xpReward} XP</p>
              </div>
              <div>
                <p className="text-[9px] font-bold tracking-[0.8px] text-[#72727c]">REWARD</p>
                <p className="mt-1 text-[15px] font-bold text-[#04adbf]">{experience.cashReward}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold tracking-[0.8px] text-[#72727c]">PLACES</p>
                <p className="mt-1 flex items-center gap-1 text-[15px] font-bold">
                  <Users size={13} className="text-[#72727c]" />
                  {experience.places}
                </p>
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-2xl bg-[#f7f7f8] p-4">
            <h3 className="text-[14px] font-semibold">What to expect</h3>
            <p className="mt-1.5 text-[13px] leading-5 text-[#62626c]">A relaxed, welcoming activity with people from your local community.</p>
          </section>
        </section>
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-[#e8e8ed] bg-white/95 px-5 pb-8 pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-[390px] items-center gap-4">
          <div className="min-w-[84px]">
            <p className="text-[10px] font-bold tracking-[0.8px] text-[#72727c]">YOUR REWARD</p>
            <p className="mt-1 text-[16px] font-bold text-[#f20789]">+{experience.xpReward} XP</p>
          </div>
          <button className="h-12 flex-1 rounded-full bg-[#f20789] text-[14px] font-semibold text-white">Join experience</button>
        </div>
      </footer>
    </div>
  );
}