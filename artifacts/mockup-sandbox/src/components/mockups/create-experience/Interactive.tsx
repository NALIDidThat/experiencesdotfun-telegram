import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Clock3,
  Feather,
  Heart,
  MapPin,
  PartyPopper,
  Sparkles,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import "./_group.css";

type FormState = {
  organisation: string;
  organisationDescription: string;
  title: string;
  description: string;
  category: string;
  date: string;
  start: string;
  end: string;
  meeting: string;
  city: string;
  capacity: string;
  xp: string;
  money: string;
  activities: string;
  bring: string;
};

const categories = [
  { label: "Environment", icon: Feather, color: "#04adbf", tint: "#e4f8f8" },
  { label: "Community", icon: Users, color: "#f20789", tint: "#fff0f8" },
  { label: "Learning", icon: Sparkles, color: "#6805f2", tint: "#f1ebff" },
];

const initialForm: FormState = {
  organisation: "",
  organisationDescription: "",
  title: "",
  description: "",
  category: "Community",
  date: "2025-06-21",
  start: "10:00",
  end: "13:00",
  meeting: "",
  city: "London",
  capacity: "12",
  xp: "150",
  money: "",
  activities: "",
  bring: "",
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  const common =
    "w-full rounded-[16px] border border-[#e6dff0] bg-white px-4 text-[15px] text-[#251832] outline-none transition focus:border-[#6805f2] focus:ring-4 focus:ring-[#6805f2]/10 placeholder:text-[#a99fb4]";
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-bold uppercase tracking-[.08em] text-[#766b82]">
        {label}
      </span>
      {multiline ? (
        <textarea
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`${common} min-h-[96px] resize-none py-3.5 leading-6`}
        />
      ) : (
        <input
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`${common} h-[52px]`}
        />
      )}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="relative block">
      <span className="mb-2 block text-[12px] font-bold uppercase tracking-[.08em] text-[#766b82]">
        {label}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[52px] w-full appearance-none rounded-[16px] border border-[#e6dff0] bg-white px-4 text-[15px] text-[#251832] outline-none focus:border-[#6805f2] focus:ring-4 focus:ring-[#6805f2]/10"
      >
        {children}
      </select>
      <ChevronDown size={17} className="pointer-events-none absolute bottom-[18px] right-4 text-[#766b82]" />
    </label>
  );
}

export function Interactive() {
  const [step, setStep] = useState(1);
  const [published, setPublished] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const set = (key: keyof FormState) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const selectedCategory = useMemo(
    () => categories.find((category) => category.label === form.category) ?? categories[1],
    [form.category],
  );
  const canContinue =
    step === 1 ? Boolean(form.organisation && form.organisationDescription) :
    step === 2 ? Boolean(form.title && form.description && form.category) :
    step === 3 ? Boolean(form.date && form.start && form.end && form.meeting && form.city) :
    Boolean(form.activities && form.bring);

  if (published) {
    return (
      <main className="create-experience-scope min-h-[100dvh] bg-[#fff8fc] text-[#251832]">
        <div className="mx-auto flex min-h-[100dvh] max-w-[390px] flex-col items-center justify-center px-6 text-center">
          <div className="relative mb-7 flex h-[104px] w-[104px] items-center justify-center rounded-[32px] bg-[#f20789] text-white shadow-[8px_10px_0_#ffd2ea]">
            <PartyPopper size={46} strokeWidth={1.7} />
            <span className="absolute -right-3 -top-3 rounded-full bg-[#04adbf] p-2 text-white"><Sparkles size={16} /></span>
          </div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-[#f20789]">It’s out there</p>
          <h1 className="text-[34px] font-black leading-[1.02] tracking-[-1.2px]">Your experience is live!</h1>
          <p className="mt-4 max-w-[290px] text-[15px] leading-6 text-[#766b82]">
            {form.title || "Your experience"} is ready for people to discover in {form.city || "your city"}.
          </p>
          <div className="mt-8 w-full rounded-[24px] border border-[#ecddea] bg-white p-4 text-left shadow-[0_8px_24px_rgba(91,35,110,.07)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="rounded-full px-3 py-1 text-[11px] font-bold" style={{ background: selectedCategory.tint, color: selectedCategory.color }}>{form.category}</span>
              <span className="flex items-center gap-1 text-xs text-[#766b82]"><Heart size={14} fill="#f20789" color="#f20789" /> Ready to meet</span>
            </div>
            <p className="text-lg font-extrabold">{form.title || "A new experience"}</p>
            <p className="mt-1 text-sm text-[#766b82]">{form.date} · {form.start}–{form.end} · {form.city}</p>
          </div>
          <button onClick={() => { setPublished(false); setStep(1); setForm(initialForm); }} className="mt-7 flex h-[52px] w-full items-center justify-center rounded-[17px] bg-[#251832] text-[15px] font-bold text-white">
            Create another experience
          </button>
        </div>
      </main>
    );
  }

  const stepTitles = ["Tell us about you", "Shape the idea", "Set the scene", "Make it yours"];
  return (
    <main className="create-experience-scope min-h-[100dvh] bg-[#fff8fc] text-[#251832]">
      <div className="mx-auto min-h-[100dvh] max-w-[390px] overflow-hidden px-5 pb-8">
        <header className="flex items-center justify-between pb-7 pt-7">
          <button onClick={() => step > 1 ? setStep(step - 1) : undefined} aria-label="Back" className={`flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#251832] shadow-sm ${step === 1 ? "opacity-0" : ""}`}>
            <ArrowLeft size={19} />
          </button>
          <div className="flex items-center gap-1.5" aria-label={`Step ${step} of 4`}>
            {[1, 2, 3, 4].map((item) => <span key={item} className={`h-1.5 rounded-full transition-all ${item === step ? "w-8 bg-[#f20789]" : item < step ? "w-5 bg-[#04adbf]" : "w-5 bg-[#e8dce9]"}`} />)}
          </div>
          <span className="text-xs font-bold text-[#766b82]">{step}/4</span>
        </header>

        <div className="mb-7">
          <p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-[#f20789]">Create experience</p>
          <h1 className="text-[31px] font-black leading-[1.05] tracking-[-1px]">{stepTitles[step - 1]}</h1>
          <p className="mt-2 text-[15px] leading-6 text-[#766b82]">
            {step === 1 && "Every great gathering starts with a good host."}
            {step === 2 && "Give your idea a little shape — you can change it later."}
            {step === 3 && "A few details help the right people show up."}
            {step === 4 && "Add the magic, then take a look before you share it."}
          </p>
        </div>

        <section className="space-y-5">
          {step === 1 && <>
            <div className="rounded-[23px] bg-[#f1ebff] p-4 text-[14px] leading-5 text-[#5e477d]"><Sparkles size={18} className="mb-2 text-[#6805f2]" /><b>People join people.</b> Tell participants who is behind this experience.</div>
            <Field label="Organisation name" value={form.organisation} onChange={set("organisation")} placeholder="e.g. The Good Gym" />
            <Field label="What does your organisation do?" value={form.organisationDescription} onChange={set("organisationDescription")} placeholder="A sentence or two about your community" multiline />
          </>}
          {step === 2 && <>
            <Field label="Experience title" value={form.title} onChange={set("title")} placeholder="e.g. Make a river wild again" />
            <Field label="What is it about?" value={form.description} onChange={set("description")} placeholder="Give your experience a warm, inviting intro" multiline />
            <div>
              <span className="mb-2 block text-[12px] font-bold uppercase tracking-[.08em] text-[#766b82]">Choose a feeling</span>
              <div className="grid grid-cols-3 gap-2">
                {categories.map(({ label, icon: Icon, color, tint }) => {
                  const active = form.category === label;
                  return <button key={label} onClick={() => set("category")(label)} className={`flex min-h-[94px] flex-col items-center justify-center gap-2 rounded-[18px] border-2 bg-white px-1 transition ${active ? "border-[#f20789] shadow-[0_5px_0_#ffd2ea]" : "border-transparent shadow-sm"}`} style={{ color: active ? color : "#766b82" }}>
                    <span className="rounded-full p-2" style={{ background: tint }}><Icon size={19} /></span><span className="text-[11px] font-bold">{label}</span>
                  </button>;
                })}
              </div>
            </div>
          </>}
          {step === 3 && <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" value={form.date} onChange={set("date")} placeholder="YYYY-MM-DD" />
              <SelectField label="City" value={form.city} onChange={set("city")}><option>London</option><option>Manchester</option><option>Bristol</option><option>Edinburgh</option></SelectField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts" value={form.start} onChange={set("start")} placeholder="10:00" />
              <Field label="Ends" value={form.end} onChange={set("end")} placeholder="13:00" />
            </div>
            <Field label="Meeting point" value={form.meeting} onChange={set("meeting")} placeholder="A clear place people can find" />
            <div className="rounded-[20px] border border-[#ecddea] bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold"><WalletCards size={18} className="text-[#6805f2]" /> Make joining easy</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Capacity" value={form.capacity} onChange={set("capacity")} placeholder="12" />
                <Field label="XP reward" value={form.xp} onChange={set("xp")} placeholder="150" />
              </div>
              <div className="mt-4"><Field label="Money reward (optional)" value={form.money} onChange={set("money")} placeholder="£0.00" /></div>
            </div>
          </>}
          {step === 4 && <>
            <Field label="What will participants do?" value={form.activities} onChange={set("activities")} placeholder="Walk, make, chat, discover..." multiline />
            <Field label="What should they bring?" value={form.bring} onChange={set("bring")} placeholder="Comfortable shoes and a curious mind" multiline />
            <div className="rounded-[23px] bg-[#251832] p-4 text-white">
              <div className="mb-3 flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-[.12em] text-[#ff8dc7]">Live preview</span><span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px]">{form.category}</span></div>
              <p className="text-xl font-extrabold">{form.title || "Your experience title"}</p>
              <p className="mt-1 text-sm text-[#cabdd0]">{form.description || "Your welcoming description will appear here."}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[#f5eaf5]"><span className="flex items-center gap-1.5"><CalendarDays size={14} className="text-[#04adbf]" />{form.date}</span><span className="flex items-center gap-1.5"><Clock3 size={14} className="text-[#04adbf]" />{form.start}–{form.end}</span><span className="flex items-center gap-1.5"><MapPin size={14} className="text-[#04adbf]" />{form.city}</span><span className="flex items-center gap-1.5"><Users size={14} className="text-[#04adbf]" />{form.capacity} places</span></div>
            </div>
          </>}
        </section>

        <div className="mt-7 flex items-center gap-3">
          {step === 4 && <button onClick={() => setStep(1)} aria-label="Start over" className="flex h-[54px] w-[54px] items-center justify-center rounded-[17px] border border-[#e6dff0] bg-white text-[#766b82]"><X size={18} /></button>}
          <button disabled={!canContinue} onClick={() => step < 4 ? setStep(step + 1) : setPublished(true)} className="flex h-[54px] flex-1 items-center justify-center gap-2 rounded-[17px] bg-[#f20789] text-[15px] font-bold text-white shadow-[0_5px_0_#b70668] transition active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:bg-[#d8cbd8] disabled:shadow-none">
            {step === 4 ? "Publish experience" : "Keep going"} {step === 4 ? <PartyPopper size={18} /> : <ArrowRight size={18} />}
          </button>
        </div>
        <p className="mt-4 text-center text-[11px] text-[#9a8fa0]">{step === 4 ? "You can edit the details after publishing." : "Nothing is published until you say so."}</p>
      </div>
    </main>
  );
}