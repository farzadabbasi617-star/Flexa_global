"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import ImageUploader from "@/components/ImageUploader";
import JalaliDatePicker from "@/components/JalaliDatePicker";
import { gregorianISOToJalaliString, jalaliStringToGregorianISO } from "@/lib/jalali";
import BottomNav from "@/components/BottomNav";

type KycStatus = "none" | "pending" | "verified" | "rejected";

interface KycState {
  status: KycStatus;
  rejectionReason?: string | null;
}

const KINDS = [
  { id: "currency", label: "ارز داخل بازی (جم، CP، UC، وی‌باکس)" },
  { id: "account", label: "اکانت بازی" },
  { id: "item", label: "آیتم داخل بازی" },
  { id: "service", label: "خدمات (بوست، رنک و...)" },
];
const GAMES = [
  { id: "", label: "— انتخاب بازی (اختیاری) —" },
  { id: "clash_royale", label: "کلش رویال" },
  { id: "cod_mobile", label: "کالاف دیوتی موبایل" },
  { id: "fortnite", label: "فورتنایت" },
];
const CURRENCIES = [
  { id: "gem", label: "جم (Gem)" },
  { id: "cp", label: "CP" },
  { id: "uc", label: "UC" },
  { id: "vbucks", label: "وی‌باکس (V-Bucks)" },
  { id: "coin", label: "سکه" },
  { id: "gold", label: "طلا" },
  { id: "other", label: "سایر" },
];
const CODM_PLATFORMS = ["Android", "iOS", "Android + iOS", "هر دو / قابل لینک"].map((label) => ({ id: label, label }));
const CODM_LOGIN_METHODS = ["Activision Only", "Activision + Email", "Facebook", "Apple", "Google", "Full Access / Email Changeable", "سایر"].map((label) => ({ id: label, label }));

const inputCls =
  "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition placeholder:text-gray-600 focus:border-purple-400";

export default function SellPage() {
  const [kyc, setKyc] = useState<KycState | null>(null);
  const [loadingKyc, setLoadingKyc] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/kyc", { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : { kyc: null }))
      .then((d) => setKyc(d.kyc ? { status: d.kyc.status, rejectionReason: d.kyc.rejectionReason } : { status: "none" }))
      .catch(() => setKyc({ status: "none" }))
      .finally(() => setLoadingKyc(false));
  }, []);

  if (loadingKyc) {
    // Must reserve the same height as the loaded state below (100dvh).
    // A shorter skeleton let the document grow once the KYC check resolved,
    // shoving the footer down and costing ~0.16 CLS on this page.
    return <main className="grid min-h-[100dvh] place-items-center bg-[#06060f] text-white">در حال بارگذاری...</main>;
  }

  return (
    <main className="min-h-[100dvh] bg-[#06060f] px-4 py-8 text-white sm:px-6 pb-28">
      <div className="mx-auto max-w-2xl">
        <Link href="/store" className="text-sm text-gray-400 hover:text-white">← بازگشت به فروشگاه</Link>
        <h1 className="mt-3 text-2xl font-black sm:text-3xl">ثبت آگهی فروش</h1>

        {kyc?.status !== "verified" ? (
          <KycGate kyc={kyc} onMessage={setMsg} onUpdated={setKyc} />
        ) : (
          <ListingForm onMessage={setMsg} />
        )}

        {msg && (
          <div className={`mt-5 rounded-2xl px-4 py-3 text-sm font-bold ${msg.type === "ok" ? "bg-green-600/20 text-green-300 ring-1 ring-green-500/40" : "bg-red-600/20 text-red-300 ring-1 ring-red-500/40"}`}>
            {msg.text}
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}

function KycGate({
  kyc,
  onMessage,
  onUpdated,
}: {
  kyc: KycState | null;
  onMessage: (m: { type: "ok" | "err"; text: string }) => void;
  onUpdated: (k: KycState) => void;
}) {
  const [form, setForm] = useState({ fullName: "", nationalId: "", birthDate: "", idCardImageUrl: "" });
  const [submitting, setSubmitting] = useState(false);

  if (kyc?.status === "pending") {
    return (
      <div className="mt-6 rounded-3xl border border-yellow-500/30 bg-yellow-500/10 p-6 text-center">
        <div className="text-4xl">⏳</div>
        <h2 className="mt-3 text-lg font-black text-yellow-200">احراز هویت در حال بررسی است</h2>
        <p className="mt-2 text-sm text-yellow-100/80">
          مدارک شما ارسال شد و توسط تیم Flexa بررسی می‌شود. پس از تأیید، می‌توانید آگهی ثبت کنید.
        </p>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    // The image is uploaded separately, so a plain `required` on the form
    // cannot cover it. Without this the server answers with a generic
    // validation error that does not say which field is missing.
    if (!form.idCardImageUrl) {
      onMessage({ type: "err", text: "لطفاً تصویر کارت ملی را بارگذاری کنید." });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/kyc", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        onMessage({ type: "err", text: data.error || "ارسال ناموفق بود." });
        return;
      }
      onMessage({ type: "ok", text: "مدارک ارسال شد و در حال بررسی است." });
      onUpdated({ status: "pending" });
    } catch {
      onMessage({ type: "err", text: "خطای ارتباط با سرور." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="rounded-2xl bg-purple-600/15 p-4 text-sm leading-7 text-purple-100 ring-1 ring-purple-500/30">
        🛡️ برای فروش در فروشگاه، ابتدا باید هویت شما تأیید شود. لطفاً اطلاعات و تصاویر زیر را وارد کنید.
        {kyc?.status === "rejected" && kyc.rejectionReason && (
          <p className="mt-2 font-bold text-red-300">دلیل رد قبلی: {kyc.rejectionReason}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-gray-400">نام و نام خانوادگی</label>
        <input className={inputCls} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required maxLength={150} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold text-gray-400">کد ملی</label>
        <input className={inputCls} value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} inputMode="numeric" maxLength={10} required placeholder="مثال: 0012345678" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold text-gray-400">تاریخ تولد (اختیاری)</label>
        {/* JalaliDatePicker speaks Gregorian ISO, but KYC stores the Jalali
            string, so convert on the way in and out. */}
        <JalaliDatePicker
          value={jalaliStringToGregorianISO(form.birthDate) || ""}
          onChange={(iso) =>
            setForm({
              ...form,
              birthDate: iso ? gregorianISOToJalaliString(iso, { digits: "latin" }) : "",
            })
          }
        />
      </div>
      <ImageUploader
        purpose="kyc"
        max={1}
        label="تصویر کارت ملی"
        hint="تصویر واضح از روی کارت ملی"
        value={form.idCardImageUrl ? [form.idCardImageUrl] : []}
        onChange={(urls) => setForm({ ...form, idCardImageUrl: urls[0] || "" })}
      />
      <button disabled={submitting} className="w-full rounded-2xl bg-purple-600 py-3 text-sm font-black transition active:scale-95 hover:bg-purple-500 disabled:opacity-40">
        {submitting ? "در حال ارسال..." : "ارسال برای احراز هویت"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><label className="mb-1 block text-xs font-bold text-gray-400">{label}</label>{children}</div>;
}
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-xs font-bold text-gray-200"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-orange-500" />{label}</label>;
}

function ListingForm({ onMessage }: { onMessage: (m: { type: "ok" | "err"; text: string }) => void }) {
  const [images, setImages] = useState<string[]>([]);
  const [form, setForm] = useState({
    kind: "currency",
    game: "",
    title: "",
    description: "",
    priceToman: "",
    currencyKind: "gem",
    currencyAmount: "",
    stock: "1",
    warrantyDays: "",
    deliveryNotes: "",
  });
  const [codm, setCodm] = useState({
    level: "",
    uid: "",
    region: "global",
    platform: "Android + iOS",
    loginMethod: "Activision Only",
    activisionOnly: true,
    fullAccess: false,
    emailChangeable: false,
    firstOwner: false,
    cpBalance: "",
    mythicWeapons: "",
    maxedMythicWeapons: "",
    legendaryWeapons: "",
    epicWeapons: "",
    mythicCharacters: "",
    legendaryCharacters: "",
    epicCharacters: "",
    diamondCamos: "",
    damascusUnlocked: false,
    battlePass: "",
    rankMp: "",
    rankBr: "",
    notableWeapons: "",
    notableCharacters: "",
    rareItems: "",
    screenshotsIncluded: "پروفایل/لول، گان‌ها، کاراکترها، لینک‌شده‌ها",
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (form.kind === "account" && form.game === "cod_mobile") {
      if (!codm.level) return onMessage({ type: "err", text: "برای اکانت کالاف، لول اکانت الزامی است." });
      if (images.length < 3) return onMessage({ type: "err", text: "برای اکانت کالاف حداقل ۳ تصویر لازم است." });
      if (form.deliveryNotes.trim().length < 20) return onMessage({ type: "err", text: "اطلاعات تحویل محرمانه را کامل‌تر وارد کنید." });
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        kind: form.kind,
        title: form.title,
        description: form.description || undefined,
        priceToman: Number(form.priceToman),
        stock: Number(form.stock),
        images,
        deliveryNotes: form.deliveryNotes || undefined,
        warrantyDays: form.warrantyDays ? Number(form.warrantyDays) : undefined,
      };
      if (form.game) payload.game = form.game;
      if (form.kind === "account" && form.game === "cod_mobile") {
        payload.metadata = { codm };
      }
      if (form.kind === "currency") {
        payload.currencyKind = form.currencyKind;
        payload.currencyAmount = Number(form.currencyAmount);
      }
      const res = await fetch("/api/store/listings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        onMessage({ type: "err", text: data.error || "ثبت آگهی ناموفق بود." });
        return;
      }
      onMessage({ type: "ok", text: "آگهی ثبت شد و پس از تأیید ادمین در فروشگاه نمایش داده می‌شود." });
      setForm({ ...form, title: "", description: "", priceToman: "", currencyAmount: "", deliveryNotes: "" });
      setImages([]);
    } catch {
      onMessage({ type: "err", text: "خطای ارتباط با سرور." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="rounded-2xl bg-green-600/15 p-3 text-sm font-bold text-green-300 ring-1 ring-green-500/30">
        ✅ هویت شما تأیید شده است. می‌توانید آگهی ثبت کنید.
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-bold text-gray-400">نوع کالا</label>
          <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value, stock: e.target.value === "account" ? "1" : form.stock })}>
            {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-gray-400">بازی</label>
          <select className={inputCls} value={form.game} onChange={(e) => setForm({ ...form, game: e.target.value })}>
            {GAMES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-gray-400">عنوان آگهی</label>
        <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={200} placeholder="مثال: ۱۰۰۰ جم کلش رویال" />
      </div>

      {form.kind === "currency" && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-400">نوع ارز</label>
            <select className={inputCls} value={form.currencyKind} onChange={(e) => setForm({ ...form, currencyKind: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-400">مقدار</label>
            <input className={inputCls} value={form.currencyAmount} onChange={(e) => setForm({ ...form, currencyAmount: e.target.value })} inputMode="numeric" placeholder="مثال: 1000" />
          </div>
        </div>
      )}

      {form.kind === "account" && form.game === "cod_mobile" && (
        <div className="space-y-4 rounded-3xl border border-orange-500/20 bg-orange-950/10 p-4">
          <div className="rounded-2xl bg-black/25 p-3 text-xs leading-6 text-orange-100">
            🎯 برای فروش حرفه‌ای اکانت کالاف، حداقل ۳ تصویر بگذارید: پروفایل/لول، گان‌ها، کاراکترها یا صفحه لینک‌شده‌ها. اطلاعات محرمانه مثل پسورد را فقط در بخش تحویل وارد کنید.
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="لول اکانت *"><input className={inputCls} value={codm.level} onChange={(e) => setCodm({ ...codm, level: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" placeholder="مثال: 400" required /></Field>
            <Field label="UID کالاف (اختیاری)"><input className={inputCls} value={codm.uid} onChange={(e) => setCodm({ ...codm, uid: e.target.value })} dir="ltr" placeholder="مثال: 7322..." /></Field>
            <Field label="ریجن"><select className={inputCls} value={codm.region} onChange={(e) => setCodm({ ...codm, region: e.target.value })}><option value="global">Global</option><option value="garena">Garena</option></select></Field>
            <Field label="پلتفرم قابل تحویل *"><select className={inputCls} value={codm.platform} onChange={(e) => setCodm({ ...codm, platform: e.target.value })}>{CODM_PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
            <Field label="روش ورود / اتصال *"><select className={inputCls} value={codm.loginMethod} onChange={(e) => setCodm({ ...codm, loginMethod: e.target.value, activisionOnly: e.target.value === "Activision Only" })}>{CODM_LOGIN_METHODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
            <Field label="CP موجود"><input className={inputCls} value={codm.cpBalance} onChange={(e) => setCodm({ ...codm, cpBalance: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" placeholder="مثال: 220" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Mythic Gun"><input className={inputCls} value={codm.mythicWeapons} onChange={(e) => setCodm({ ...codm, mythicWeapons: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" /></Field>
            <Field label="Mythic Max"><input className={inputCls} value={codm.maxedMythicWeapons} onChange={(e) => setCodm({ ...codm, maxedMythicWeapons: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" /></Field>
            <Field label="Legendary Gun"><input className={inputCls} value={codm.legendaryWeapons} onChange={(e) => setCodm({ ...codm, legendaryWeapons: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" /></Field>
            <Field label="Epic Gun"><input className={inputCls} value={codm.epicWeapons} onChange={(e) => setCodm({ ...codm, epicWeapons: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" /></Field>
            <Field label="Mythic Character"><input className={inputCls} value={codm.mythicCharacters} onChange={(e) => setCodm({ ...codm, mythicCharacters: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" /></Field>
            <Field label="Legendary Character"><input className={inputCls} value={codm.legendaryCharacters} onChange={(e) => setCodm({ ...codm, legendaryCharacters: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" /></Field>
            <Field label="Epic Character"><input className={inputCls} value={codm.epicCharacters} onChange={(e) => setCodm({ ...codm, epicCharacters: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" /></Field>
            <Field label="Diamond Camo"><input className={inputCls} value={codm.diamondCamos} onChange={(e) => setCodm({ ...codm, diamondCamos: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" /></Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="رنک MP"><input className={inputCls} value={codm.rankMp} onChange={(e) => setCodm({ ...codm, rankMp: e.target.value })} placeholder="مثال: Legendary / Master" /></Field>
            <Field label="رنک BR"><input className={inputCls} value={codm.rankBr} onChange={(e) => setCodm({ ...codm, rankBr: e.target.value })} placeholder="مثال: Legendary" /></Field>
            <Field label="Battle Pass / Draw"><input className={inputCls} value={codm.battlePass} onChange={(e) => setCodm({ ...codm, battlePass: e.target.value })} placeholder="مثال: BP فعال، Draw ده CP" /></Field>
            <Field label="تصاویر موجود"><input className={inputCls} value={codm.screenshotsIncluded} onChange={(e) => setCodm({ ...codm, screenshotsIncluded: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Check label="Activision Only" checked={codm.activisionOnly} onChange={(v)=>setCodm({...codm,activisionOnly:v})}/>
            <Check label="Full Access" checked={codm.fullAccess} onChange={(v)=>setCodm({...codm,fullAccess:v})}/>
            <Check label="Email Changeable" checked={codm.emailChangeable} onChange={(v)=>setCodm({...codm,emailChangeable:v})}/>
            <Check label="First Owner" checked={codm.firstOwner} onChange={(v)=>setCodm({...codm,firstOwner:v})}/>
            <Check label="Damascus Unlocked" checked={codm.damascusUnlocked} onChange={(v)=>setCodm({...codm,damascusUnlocked:v})}/>
          </div>
          <Field label="گان‌های شاخص"><textarea className={`${inputCls} min-h-[70px]`} value={codm.notableWeapons} onChange={(e) => setCodm({ ...codm, notableWeapons: e.target.value })} placeholder="مثال: AK117 Lava Remix، Kilo 141 Demonsong، M13 Morningstar..." /></Field>
          <Field label="کاراکترهای شاخص"><textarea className={`${inputCls} min-h-[70px]`} value={codm.notableCharacters} onChange={(e) => setCodm({ ...codm, notableCharacters: e.target.value })} placeholder="مثال: Templar، Mythic Ghost، Nyx، Kestrel..." /></Field>
          <Field label="آیتم‌ها و نکات کمیاب"><textarea className={`${inputCls} min-h-[70px]`} value={codm.rareItems} onChange={(e) => setCodm({ ...codm, rareItems: e.target.value })} placeholder="کموها، اسکین‌های قدیمی، BPهای خاص، Rename Card، منطقه ارزان CP و..." /></Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-bold text-gray-400">قیمت (USDT)</label>
          <input className={inputCls} value={form.priceToman} onChange={(e) => setForm({ ...form, priceToman: e.target.value })} inputMode="numeric" required placeholder="مثال: 150000" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-gray-400">موجودی</label>
          <input className={inputCls} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} inputMode="numeric" disabled={form.kind === "account"} />
          {form.kind === "account" && <p className="mt-1 text-[11px] text-gray-500">برای اکانت، موجودی همیشه ۱ است.</p>}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-gray-400">مدت گارانتی (روز) — اختیاری</label>
        <input className={inputCls} value={form.warrantyDays} onChange={(e) => setForm({ ...form, warrantyDays: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" placeholder="مثال: 7 (در صورت نداشتن، خالی بگذارید)" dir="ltr" />
        <p className="mt-1 text-[11px] text-gray-500">گارانتی باعث افزایش اعتماد خریدار و شانس فروش می‌شود.</p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-gray-400">توضیحات</label>
        <textarea className={`${inputCls} min-h-[90px]`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={5000} />
      </div>

      <ImageUploader
        purpose="listing"
        max={8}
        label="تصاویر آگهی"
        hint={form.kind === "account" && form.game === "cod_mobile" ? "حداقل ۳ تصویر: پروفایل/لول، گان‌ها، کاراکترها یا لینک‌شده‌ها. اولین تصویر کاور است." : "حداکثر ۸ تصویر. اولین تصویر به عنوان کاور نمایش داده می‌شود."}
        value={images}
        onChange={setImages}
      />

      <div>
        <label className="mb-1 block text-xs font-bold text-gray-400">اطلاعات تحویل (محرمانه — فقط بعد از خرید به خریدار نشان داده می‌شود)</label>
        <textarea className={`${inputCls} min-h-[70px]`} value={form.deliveryNotes} onChange={(e) => setForm({ ...form, deliveryNotes: e.target.value })} placeholder="مثال: یوزرنیم و پسورد اکانت، کد تحویل و..." />
      </div>

      <button disabled={submitting} className="w-full rounded-2xl bg-purple-600 py-3 text-sm font-black transition active:scale-95 hover:bg-purple-500 disabled:opacity-40">
        {submitting ? "در حال ثبت..." : "ثبت آگهی"}
      </button>
    </form>
  );
}
