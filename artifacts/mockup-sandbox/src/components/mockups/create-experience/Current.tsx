import {
  ArrowLeft,
  BookOpen,
  Feather,
  Users,
} from "lucide-react";
import "./_group.css";

const fields = [
  ["Organisation name", false],
  ["What does your organisation do?", true],
  ["Experience title", false],
  ["Describe what participants will do", true],
  ["Date (YYYY-MM-DD)", false],
  ["Start time (e.g. 10:00)", false],
  ["End time (e.g. 13:00)", false],
  ["Meeting point", false],
  ["City", false],
  ["Maximum participants", false],
  ["XP reward", false],
  ["Money reward in pence (optional)", false],
  ["What will participants do?", true],
  ["What should participants bring?", true],
] as const;

function Field({ label, multiline }: { label: string; multiline: boolean }) {
  return multiline ? (
    <textarea
      aria-label={label}
      placeholder={label}
      className="min-h-24 w-full resize-none rounded-2xl border border-[#eaeaea] bg-white px-4 py-4 text-[15px] text-[#111] outline-none placeholder:text-[#777]"
    />
  ) : (
    <input
      aria-label={label}
      placeholder={label}
      className="h-14 w-full rounded-2xl border border-[#eaeaea] bg-white px-4 text-[15px] text-[#111] outline-none placeholder:text-[#777]"
    />
  );
}

export function Current() {
  return (
    <main className="create-experience-scope min-h-screen bg-white text-[#111]">
      <div className="mx-auto min-h-screen max-w-[390px] px-5 pb-16 pt-8">
        <header className="mb-7 flex items-start gap-4">
          <button className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f7f7f8]" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-[28px] font-bold tracking-[-0.8px]">Create experience</h1>
            <p className="mt-1 text-[15px] text-[#666]">Give your community a way to show up.</p>
          </div>
        </header>

        <section>
          <p className="mb-3 mt-6 text-xs font-bold tracking-[1px] text-[#f20789]">ORGANISATION</p>
          <div className="space-y-3">
            <Field label={fields[0][0]} multiline={fields[0][1]} />
            <Field label={fields[1][0]} multiline={fields[1][1]} />
          </div>

          <p className="mb-3 mt-7 text-xs font-bold tracking-[1px] text-[#f20789]">THE EXPERIENCE</p>
          <div className="space-y-3">
            <Field label={fields[2][0]} multiline={fields[2][1]} />
            <Field label={fields[3][0]} multiline={fields[3][1]} />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              [Feather, "Environmental"],
              [BookOpen, "Education"],
              [Users, "Community"],
            ].map(([Icon, label]) => (
              <button key={String(label)} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-[#eaeaea] bg-white px-2">
                <Icon size={20} className="text-[#666]" />
                <span className="text-[11px] font-semibold">{String(label)}</span>
              </button>
            ))}
          </div>

          <p className="mb-3 mt-7 text-xs font-bold tracking-[1px] text-[#f20789]">WHEN &amp; WHERE</p>
          <div className="space-y-3">
            {fields.slice(4, 9).map(([label, multiline]) => <Field key={label} label={label} multiline={multiline} />)}
          </div>

          <p className="mb-3 mt-7 text-xs font-bold tracking-[1px] text-[#f20789]">CAPACITY &amp; REWARDS</p>
          <div className="space-y-3">
            {fields.slice(9).map(([label, multiline]) => <Field key={label} label={label} multiline={multiline} />)}
          </div>

          <button className="mt-8 h-14 w-full rounded-2xl bg-[#f20789] text-base font-semibold text-white">
            Publish experience
          </button>
        </section>
      </div>
    </main>
  );
}