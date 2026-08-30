"use client";

/**
 * Creates an official (Flexa-owned) store listing.
 *
 * POST /api/admin/store/listings has existed since the store shipped, but no UI
 * ever called it, so the only way to get a product into the store was for a
 * KYC-verified seller to submit one and an admin to approve it. With zero
 * verified sellers that meant zero products, which in turn meant the featured
 * carousel had nothing to rotate. This form closes that gap.
 *
 * Field rules mirror StoreListingCreateSchema exactly so the server never
 * rejects something the form let through:
 *   - currency listings require a currency kind and amount
 *   - account listings are unique, so stock is forced to 1
 */
import { useState } from "react";
import ImageUploader from "@/components/ImageUploader";

const KINDS = [
  { id: "currency", label: "ارز درون‌بازی" },
  { id: "account", label: "اکانت" },
  { id: "item", label: "آیتم" },
  { id: "service", label: "خدمات" },
] as const;

const GAMES = [
  { id: "", label: "بدون بازی مشخص" },
  { id: "cod_mobile", label: "کالاف دیوتی موبایل" },
  { id: "clash_royale", label: "کلش رویال" },
  { id: "fortnite", label: "فورتنایت" },
] as const;

const CURRENCY_KINDS = [
  { id: "gem", label: "جم" },
  { id: "cp", label: "CP" },
  { id: "uc", label: "UC" },
  { id: "vbucks", label: "وی‌باکس" },
  { id: "coin", label: "سکه" },
  { id: "gold", label: "طلا" },
  { id: "other", label: "سایر" },
] as const;

type Kind = (typeof KINDS)[number]["id"];

const inputClass =
  "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition focus:border-purple-500";
const labelClass = "mb-1.5 block text-xs font-bold text-gray-300";

export default function OfficialListingForm({ onCreated }: { onCreated: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<Kind>("currency");
  const [game, setGame] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceToman, setPriceToman] = useState("");
  const [currencyKind, setCurrencyKind] = useState("gem");
  const [currencyAmount, setCurrencyAmount] = useState("");
  const [stock, setStock] = useState("1");
  const [warrantyDays, setWarrantyDays] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [images, setImages] = useState<string[]>([]);

  // An account is a single unique thing; the server rejects stock > 1 for it,
  // so keep the form from ever getting into that state.
  const stockLocked = kind === "account";

  function reset() {
    setKind("currency");
    setGame("");
    setTitle("");
    setDescription("");
    setPriceToman("");
    setCurrencyKind("gem");
    setCurrencyAmount("");
    setStock("1");
    setWarrantyDays("");
    setDeliveryNotes("");
    setImages([]);
    setError(null);
  }

  async function submit() {
    setError(null);

    if (title.trim().length < 3) return setError("عنوان حداقل ۳ کاراکتر باشد.");
    if (!priceToman.trim()) return setError("قیمت الزامی است.");
    if (kind === "currency" && !currencyAmount.trim()) {
      return setError("برای ارز درون‌بازی، مقدار ارز الزامی است.");
    }

    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        kind,
        title: title.trim(),
        priceToman: priceToman.trim(),
        stock: stockLocked ? 1 : Number(stock || 1),
        images,
      };
      // Send optional fields only when filled: the schema treats "" as invalid
      // for enums, while `undefined` is accepted.
      if (game) body.game = game;
      if (description.trim()) body.description = description.trim();
      if (deliveryNotes.trim()) body.deliveryNotes = deliveryNotes.trim();
      if (warrantyDays.trim()) body.warrantyDays = Number(warrantyDays);
      if (kind === "currency") {
        body.currencyKind = currencyKind;
        body.currencyAmount = Number(currencyAmount);
      }

      const res = await fetch("/api/admin/store/listings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "ثبت محصول ناموفق بود.");
        return;
      }

      reset();
      setOpen(false);
      onCreated("محصول ساخته شد و بلافاصله فعال است.");
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-3xl border border-dashed border-purple-400/30 bg-purple-500/[.06] py-4 text-sm font-black text-purple-200 transition hover:bg-purple-500/[.12]"
      >
        + افزودن محصول رسمی Flexa
      </button>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-black text-purple-200">افزودن محصول رسمی</h2>
        <button
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-gray-300"
        >
          انصراف
        </button>
      </div>

      <p className="mb-4 text-[11px] leading-5 text-gray-500">
        این محصول با نام خود Flexa ثبت می‌شود و <b className="text-gray-300">بدون نیاز به تأیید، فوراً فعال</b> است.
        بعد از ساخت می‌توانید از تب «محصولات ویژه» آن را به اسلایدر هدر اضافه کنید.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>نوع کالا</label>
          <select
            value={kind}
            onChange={(e) => {
              const next = e.target.value as Kind;
              setKind(next);
              if (next === "account") setStock("1");
            }}
            className={inputClass}
          >
            {KINDS.map((k) => (
              <option key={k.id} value={k.id} className="bg-[#14151f]">
                {k.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>بازی</label>
          <select value={game} onChange={(e) => setGame(e.target.value)} className={inputClass}>
            {GAMES.map((g) => (
              <option key={g.id} value={g.id} className="bg-[#14151f]">
                {g.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass}>عنوان</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثلاً ۱۰۰۰ جم کلش رویال"
            maxLength={200}
            className={inputClass}
          />
        </div>

        {kind === "currency" && (
          <>
            <div>
              <label className={labelClass}>نوع ارز</label>
              <select
                value={currencyKind}
                onChange={(e) => setCurrencyKind(e.target.value)}
                className={inputClass}
              >
                {CURRENCY_KINDS.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#14151f]">
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>مقدار ارز</label>
              <input
                value={currencyAmount}
                onChange={(e) => setCurrencyAmount(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                placeholder="1000"
                className={inputClass}
              />
            </div>
          </>
        )}

        <div>
          <label className={labelClass}>قیمت (USDT)</label>
          <input
            value={priceToman}
            onChange={(e) => setPriceToman(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            placeholder="50000"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>
            موجودی {stockLocked && <span className="text-gray-500">(اکانت همیشه ۱)</span>}
          </label>
          <input
            value={stockLocked ? "1" : stock}
            onChange={(e) => setStock(e.target.value.replace(/[^\d]/g, ""))}
            disabled={stockLocked}
            inputMode="numeric"
            className={`${inputClass} ${stockLocked ? "opacity-50" : ""}`}
          />
        </div>

        <div>
          <label className={labelClass}>گارانتی (روز، اختیاری)</label>
          <input
            value={warrantyDays}
            onChange={(e) => setWarrantyDays(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            placeholder="0"
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass}>توضیحات (اختیاری)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={5000}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass}>نحوهٔ تحویل (اختیاری)</label>
          <textarea
            value={deliveryNotes}
            onChange={(e) => setDeliveryNotes(e.target.value)}
            rows={2}
            maxLength={5000}
            placeholder="مثلاً: بعد از پرداخت، آیدی بازی را ارسال کنید."
            className={`${inputClass} resize-none`}
          />
        </div>

        <div className="sm:col-span-2">
          <ImageUploader
            purpose="listing"
            value={images}
            onChange={setImages}
            max={8}
            label="تصاویر محصول"
            hint="اولین تصویر در اسلایدر و کارت محصول نمایش داده می‌شود."
          />
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs font-bold text-red-300">
          {error}
        </p>
      )}

      <button
        onClick={submit}
        disabled={busy}
        className="mt-5 w-full rounded-2xl bg-purple-600 py-3 text-sm font-black text-white transition hover:bg-purple-500 disabled:opacity-50"
      >
        {busy ? "در حال ثبت..." : "ثبت محصول"}
      </button>
    </div>
  );
}
