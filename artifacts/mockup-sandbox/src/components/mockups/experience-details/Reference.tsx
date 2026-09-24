import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
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
  description: "The first experience ever.",
  xpReward: 1500,
  cashReward: "£5.00",
  places: 8,
  whatYouWillDo: "Just join the experience",
  whatToBring: "Bring commitment.",
};

export function Reference() {
  return (
    <div className="experience-details-scope min-h-screen bg-[#f7f7f8]">
      <div className="bg-[#f20789] px-3 py-2 text-center text-[12px] font-medium text-white">
        You&apos;re early! Please give feedback to <u>@NALIDidThat</u>
      </div>

      <main className="mx-auto min-h-screen max-w-[390px] bg-[#f7f7f8] px-4 pb-40 pt-2">
        <header className="mb-3 flex h-11 items-center justify-between">
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e8e8ed] bg-white"
            aria-label="Back"
          >
            <ArrowLeft size={19} />
          </button>
          <h1 className="text-[14px] font-semibold">Experience details</h1>
          <div className="h-10 w-10" />
        </header>

        <section className="relative h-[182px] overflow-hidden rounded-[24px]">
          <img
            src="/__mockup/images/community-cover.jpg"
            alt="Community category cover art"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent" />
          <div className="absolute bottom-3.5 left-4 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.8px] text-[#f20789]">
            <Users size={13} />
            {experience.category}
          </div>
        </section>

        <section className="mt-3 rounded-[24px] border border-[#e8e8ed] bg-white p-4">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#17171b]">
              {experience.organisation}
            </span>
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#eaf7f5] px-2 py-1 text-[10px] font-semibold text-[#05727d]">
              <BadgeCheck size={13} />
              Verified host
            </span>
          </div>
          <h2 className="text-[28px] font-bold leading-[1.12] tracking-[-0.7px] text-[#111]">
            {experience.title}
          </h2>
          <div className="mt-3 flex gap-3 rounded-[17px] bg-[#f7f7f8] p-3">
            <div className="w-[3px] shrink-0 rounded-full bg-[#f20789]" />
            <div className="min-w-0 flex-1">
              <h3 className="mb-1 text-[12px] font-bold text-[#666]">
                About this experience
              </h3>
              <p className="text-[14px] leading-5 text-[#333]">{experience.description}</p>
            </div>
          </div>
        </section>

        <section className="mt-3 grid grid-cols-[1.2fr_1fr] gap-3">
          <div className="min-w-0 rounded-[22px] border border-[#e8e8ed] bg-white p-3.5">
            <div className="mb-3 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.8px] text-[#666]">
              <CalendarDays size={15} className="text-[#f20789]" />
              WHEN
            </div>
            <p className="text-[14px] font-semibold text-[#17171b]">{experience.date}</p>
            <p className="mt-1 text-[12px] text-[#666]">{experience.time}</p>
          </div>
          <div className="min-w-0 rounded-[22px] border border-[#d8f0f0] bg-[#effafa] p-3.5">
            <div className="mb-3 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.8px] text-[#666]">
              <MapPin size={15} className="text-[#05727d]" />
              WHERE
            </div>
            <p className="text-[14px] font-semibold text-[#17171b]">{experience.city}</p>
            <p className="mt-1 truncate text-[12px] text-[#666]">{experience.location}</p>
          </div>
        </section>

        <section className="mt-3 flex items-center gap-3 rounded-[22px] border border-[#e8e8ed] bg-white p-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#fce8f3] text-[15px] font-bold text-[#f20789]">
            E
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#666]">Hosted by</p>
            <p className="mt-1 truncate text-[14px] font-semibold text-[#17171b]">{experience.organisation}</p>
          </div>
          <BadgeCheck size={19} className="shrink-0 text-[#05727d]" />
        </section>

        <section className="mt-3 flex items-stretch rounded-[22px] border border-[#e8e8ed] bg-white px-2 py-4">
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 px-2">
            <p className="truncate text-[9px] font-bold tracking-[0.5px] text-[#666]">YOU&apos;LL EARN</p>
            <p className="truncate text-[15px] font-bold text-[#f20789]">+{experience.xpReward} XP</p>
          </div>
          <div className="my-1 w-px bg-[#e8e8ed]" />
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 px-2">
            <p className="truncate text-[9px] font-bold tracking-[0.5px] text-[#666]">REWARD</p>
            <p className="truncate text-[15px] font-bold text-[#05727d]">{experience.cashReward}</p>
          </div>
          <div className="my-1 w-px bg-[#e8e8ed]" />
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 px-2">
            <p className="truncate text-[9px] font-bold tracking-[0.5px] text-[#666]">PLACES LEFT</p>
            <p className="text-[15px] font-bold text-[#17171b]">{experience.places}</p>
          </div>
        </section>

        <section className="mt-3 rounded-[22px] border border-[#e8e8ed] bg-white p-3.5">
          <div className="mb-2.5 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-[#fce8f3]">
              <CheckCircle2 size={16} className="text-[#f20789]" />
            </div>
            <h3 className="text-[14px] font-bold text-[#17171b]">What you&apos;ll do</h3>
          </div>
          <p className="text-[13px] leading-5 text-[#555]">{experience.whatYouWillDo}</p>
        </section>

        <section className="mt-3 rounded-[22px] border border-[#e8e8ed] bg-white p-3.5">
          <div className="mb-2.5 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-[#effafa]">
              <BriefcaseBusiness size={16} className="text-[#05727d]" />
            </div>
            <h3 className="text-[14px] font-bold text-[#17171b]">What to bring</h3>
          </div>
          <p className="text-[13px] leading-5 text-[#555]">{experience.whatToBring}</p>
        </section>
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-[#e8e8ed] bg-white px-4 pb-8 pt-3">
        <div className="mx-auto flex max-w-[390px] items-center gap-3">
          <div className="min-w-[84px]">
            <p className="text-[9px] font-bold tracking-[0.6px] text-[#666]">YOUR REWARD</p>
            <p className="mt-1 text-[15px] font-bold text-[#f20789]">+{experience.xpReward} XP</p>
          </div>
          <button className="h-12 flex-1 rounded-full bg-[#f20789] text-[14px] font-semibold text-white">
            Join experience
          </button>
        </div>
      </footer>
    </div>
  );
}