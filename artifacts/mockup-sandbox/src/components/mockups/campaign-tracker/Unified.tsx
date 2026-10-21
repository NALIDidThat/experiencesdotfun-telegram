import { useState, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronRight,
  Circle,
  Info,
  LockKeyhole,
  ShieldCheck,
  Target,
} from "lucide-react";

const checkpoints = [25, 50, 75, 100];

function SectionHeading({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="mb-3">
      <h2 className="text-[16px] font-bold tracking-[-0.035em] text-[#19151b]">
        {title}
      </h2>
      <p className="mt-1 text-[11px] leading-[1.55] text-[#77717a]">{detail}</p>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  detail,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex min-h-[112px] flex-col items-center justify-center rounded-[18px] border border-dashed border-[#e5dfe5] bg-[#fbf9fb] px-5 py-5 text-center">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#a49ba6] shadow-[0_2px_10px_rgba(50,25,45,0.05)]">
        {icon}
      </div>
      <p className="text-[12px] font-semibold text-[#37313a]">{title}</p>
      <p className="mt-1 max-w-[250px] text-[10px] leading-[1.55] text-[#827a84]">
        {detail}
      </p>
    </div>
  );
}

export function Unified() {
  const [period, setPeriod] = useState<"all" | "month">("all");

  return (
    <main className="min-h-[100dvh] bg-[#f7f5f7] px-4 pb-8 pt-3 text-[#19151b] antialiased">
      <div className="mx-auto w-full max-w-[430px]">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-white text-[#302832] shadow-[0_2px_10px_rgba(48,34,48,0.05)]">
              <ArrowLeft size={17} strokeWidth={2.1} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#88808a]">
                Experiences.fun
              </p>
              <p className="text-[13px] font-bold tracking-[-0.02em]">
                Campaign tracker
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-[#d9eee8] bg-[#f2fbf7] px-2.5 py-1.5">
            <span className="h-[6px] w-[6px] rounded-full bg-[#16836f]" />
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#236d5e]">
              Active
            </span>
          </div>
        </header>

        <section className="relative overflow-hidden rounded-[24px] bg-[#f20789] px-5 pb-5 pt-5 text-white shadow-[0_12px_28px_rgba(204,0,111,0.14)]">
          <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full border border-white/10" />
          <div className="absolute -right-5 -top-9 h-32 w-32 rounded-full border border-white/10" />
          <div className="relative">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em]">
                <BadgeCheck size={12} strokeWidth={2.2} />
                Verified campaign totals
              </div>
              <span className="pt-1 text-[10px] font-medium text-white/75">
                Campaign #4
              </span>
            </div>
            <h1 className="max-w-[300px] text-[25px] font-extrabold leading-[1.08] tracking-[-0.055em]">
              EXP Treasury
              <br />
              Test 1
            </h1>
            <div className="mt-2 flex items-center gap-2 text-[12px] font-medium text-white/85">
              <span className="flex h-[19px] w-[19px] items-center justify-center rounded-full bg-white/20">
                <ShieldCheck size={12} />
              </span>
              EXP Foundation
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5 rounded-[10px] bg-white px-3 py-2 text-[10px] font-bold text-[#2a2029]">
                <Target size={12} className="text-[#f20789]" />
                Goal · 100 SOL
              </div>
              <div className="rounded-[10px] border border-white/25 bg-white/10 px-3 py-2 text-[10px] font-semibold text-white">
                Active campaign
              </div>
            </div>
          </div>
        </section>

        <section className="mt-3 rounded-[21px] border border-[#eee9ee] bg-white p-4 shadow-[0_3px_14px_rgba(38,25,38,0.035)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-[14px] font-bold tracking-[-0.025em]">
                  Funding progress
                </h2>
                <BadgeCheck size={14} className="text-[#16836f]" />
              </div>
              <p className="mt-1 text-[10px] text-[#827a84]">
                Recorded, verified campaign deposits only
              </p>
            </div>
            <span className="rounded-full bg-[#f7f3f7] px-2.5 py-1 text-[10px] font-bold text-[#817783]">
              0%
            </span>
          </div>
          <div
            aria-label="0 percent of campaign goal funded"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={0}
            className="mt-4 h-[8px] overflow-hidden rounded-full bg-[#f0edf0]"
          >
            <div className="h-full w-0 rounded-full bg-[#f20789]" />
          </div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[19px] font-extrabold tracking-[-0.045em] tabular-nums">
                0.000000000 <span className="text-[12px]">SOL</span>
              </p>
              <p className="mt-0.5 text-[10px] text-[#827a84]">raised</p>
            </div>
            <p className="pb-0.5 text-right text-[10px] leading-4 text-[#827a84]">
              Goal
              <br />
              <span className="font-bold text-[#332c35]">100 SOL</span>
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-[13px] bg-[#f8f6f8] px-3 py-2.5">
              <p className="text-[15px] font-bold tabular-nums">0</p>
              <p className="mt-0.5 text-[9px] text-[#827a84]">Verified deposits</p>
            </div>
            <div className="rounded-[13px] bg-[#f8f6f8] px-3 py-2.5">
              <p className="text-[15px] font-bold tabular-nums">100 SOL</p>
              <p className="mt-0.5 text-[9px] text-[#827a84]">Campaign goal</p>
            </div>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[9px] leading-[1.55] text-[#8c848e]">
            <LockKeyhole size={11} className="mt-[1px] shrink-0" />
            Totals include verified deposits attributed to this campaign only.
          </p>
        </section>

        <section className="mt-5">
          <SectionHeading
            title="Funding checkpoints"
            detail="Goal-percentage milestones are funding checkpoints, not promises of real-world outcomes."
          />
          <div className="overflow-hidden rounded-[19px] border border-[#eee9ee] bg-white px-3.5">
            {checkpoints.map((checkpoint, index) => (
              <div
                key={checkpoint}
                className={`flex min-h-[61px] items-center gap-3 ${
                  index < checkpoints.length - 1 ? "border-b border-[#f0edf0]" : ""
                }`}
              >
                <div className="flex h-[29px] w-[29px] items-center justify-center rounded-[10px] bg-[#f7f5f7] text-[#a59ca7]">
                  {index === 0 ? <Target size={14} /> : <Circle size={13} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold">{checkpoint}% of goal</p>
                  <p className="mt-0.5 text-[9px] text-[#89818b]">
                    {checkpoint} SOL funding checkpoint
                  </p>
                </div>
                <span className="rounded-full bg-[#f7f5f7] px-2 py-1 text-[8px] font-semibold text-[#857d87]">
                  Upcoming
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5">
          <SectionHeading
            title="Recent verified deposits"
            detail="Only verified deposits linked to this campaign appear here."
          />
          <EmptyState
            icon={<ArrowDownLeft size={17} />}
            title="No verified deposits yet"
            detail="When a campaign-linked deposit is verified, it will appear here."
          />
        </section>

        <section className="mt-5 rounded-[20px] border border-[#eee9ee] bg-white p-4 shadow-[0_3px_14px_rgba(38,25,38,0.025)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-bold tracking-[-0.03em]">
                Supporter rankings
              </h2>
              <p className="mt-1 text-[10px] text-[#827a84]">
                Ranked by verified campaign deposits
              </p>
            </div>
            <div
              aria-label="Supporter ranking period"
              role="tablist"
              className="flex rounded-full bg-[#f5f2f5] p-[3px]"
            >
              {([
                ["all", "All Time"],
                ["month", "This Month"],
              ] as const).map(([value, label]) => {
                const selected = period === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setPeriod(value)}
                    className={`min-h-[29px] rounded-full px-2.5 text-[9px] font-bold transition-colors ${
                      selected
                        ? "bg-[#f20789] text-white shadow-sm"
                        : "text-[#77717a]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-3">
            <EmptyState
              icon={<LockKeyhole size={15} />}
              title="No rankings to show"
              detail="Rankings will appear after verified campaign deposits. Supporters remain anonymous."
            />
          </div>
          <p className="mt-3 text-[9px] leading-[1.55] text-[#8c848e]">
            Wallet identities are not shown. Only campaign-attributed deposits are included.
          </p>
        </section>

        <section className="mt-5">
          <SectionHeading
            title="Campaign details"
            detail="Details provided by the campaign organiser."
          />
          <div className="rounded-[19px] border border-[#eee9ee] bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-[#fff0f8] text-[#e6007e]">
                <Info size={15} />
              </div>
              <div>
                <p className="text-[11px] font-bold">Organiser-provided information</p>
                <p className="mt-0.5 text-[9px] text-[#89818b]">EXP Foundation</p>
              </div>
              <ChevronRight size={14} className="ml-auto text-[#b2aab3]" />
            </div>
            <div className="rounded-[13px] bg-[#f8f6f8] px-3.5 py-3">
              <p className="text-[12px] leading-[1.65] text-[#39323b]">
                We will build it and you will like it.
              </p>
            </div>
            <p className="mt-3 text-[9px] leading-[1.55] text-[#8c848e]">
              This description is supplied by the organiser and is not an independently verified outcome.
            </p>
          </div>
        </section>

        <footer className="mt-5 flex items-center justify-center gap-2 pb-2 text-[9px] text-[#8e8690]">
          <Check size={12} className="text-[#16836f]" />
          Verified totals. Clear campaign details.
        </footer>
      </div>
    </main>
  );
}
