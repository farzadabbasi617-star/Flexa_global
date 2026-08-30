"use client";

/**
 * Seller inventory management.
 *
 * Until this page existed a seller could post an ad and then never touch it
 * again: no price fix, no restock, no takedown, and no way to even see an ad
 * that was rejected or awaiting review. The only route was messaging an admin.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import StoreIcon from "@/components/store/StoreIcon";

interface MyListing {
  id: string;
  kind: string;
  game: string | null;
  title: string;
  description: string | null;
  priceToman: number;
  stock: number;
  soldCount: number;
  images: unknown;
  status: string;
  rejectionReason: string | null;
  featuredStatus: string;
  featuredUntil: string | null;
  deliveryNotes: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: "پیش‌نویس", className: "bg-gray-500/15 text-gray-300" },
  pending_review: { label: "در انتظار تأیید", className: "bg-amber-500/15 text-amber-300" },
  active: { label: "فعال", className: "bg-emerald-500/15 text-emerald-300" },
  paused: { label: "غیرفعال موقت", className: "bg-sky-500/15 text-sky-300" },
  sold_out: { label: "ناموجود", className: "bg-orange-500/15 text-orange-300" },
  rejected: { label: "ردشده", className: "bg-red-500/15 text-red-300" },
};

function toman(value: number) {
  return `${value.toLocaleString("fa-IR")} USDT`;
}

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  const found = images.find((entry) => typeof entry === "string" && entry.trim());
  return typeof found === "string" ? found : null;
}

export default function MyListingsPage() {
  const [items, setItems] = useState<MyListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [priceToman, setPriceToman] = useState("");
  const [stock, setStock] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/store/listings/mine", { cache: "no-store", credentials: "include" });
      if (res.status === 401) {
        setItems([]);
        setMsg({ type: "err", text: "برای مدیریت آگهی‌ها وارد شوید." });
        return;
      }
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!msg) return;
    const timer = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [msg]);

  function startEdit(row: MyListing) {
    setEditing(row.id);
    setTitle(row.title);
    setPriceToman(String(row.priceToman));
    setStock(String(row.stock));
    setDescription(row.description || "");
  }

  async function act(id: string, body: Record<string, unknown>, okText: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/store/listings/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type: "err", text: data.error || "عملیات ناموفق بود." });
        return;
      }
      // A price or title change pulls an approved ad out of the store, so say so
      // rather than letting the seller discover it by refreshing the storefront.
      setMsg({
        type: "ok",
        text: data.requiresReview
          ? "ذخیره شد. چون قیمت یا مشخصات تغییر کرد، آگهی دوباره به صف بررسی رفت."
          : okText,
      });
      setEditing(null);
      load();
    } catch {
      setMsg({ type: "err", text: "ارتباط با سرور برقرار نشد." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <main className="min-h-[100dvh] bg-[#06060f] px-4 pb-28 pt-6 text-white sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black">آگهی‌های من</h1>
              <p className="mt-1 text-xs text-gray-500">قیمت، موجودی و وضعیت نمایش آگهی‌هایتان را مدیریت کنید.</p>
            </div>
            <Link
              href="/store/sell"
              className="rounded-2xl bg-violet-600 px-4 py-2.5 text-xs font-black transition hover:bg-violet-500"
            >
              + ثبت آگهی جدید
            </Link>
          </div>

          {msg && (
            <p
              className={`mt-4 rounded-2xl border px-4 py-2.5 text-xs font-bold ${
                msg.type === "ok"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                  : "border-red-500/20 bg-red-500/10 text-red-300"
              }`}
            >
              {msg.text}
            </p>
          )}

          {loading ? (
            <p className="mt-10 text-sm text-gray-400">در حال بارگذاری...</p>
          ) : items.length === 0 ? (
            <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] py-12 text-center">
              <p className="text-sm text-gray-400">هنوز آگهی‌ای ثبت نکرده‌اید.</p>
              <Link href="/store/sell" className="mt-4 inline-block text-xs font-black text-violet-300">
                ثبت اولین آگهی →
              </Link>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {items.map((row) => {
                const badge = STATUS_LABELS[row.status] || {
                  label: row.status,
                  className: "bg-gray-500/15 text-gray-300",
                };
                const image = firstImage(row.images);
                const isEditing = editing === row.id;

                return (
                  <div key={row.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex gap-4">
                      {image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={image}
                          alt=""
                          className="h-16 w-16 shrink-0 rounded-2xl border border-white/10 object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black">{row.title}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${badge.className}`}>
                            {badge.label}
                          </span>
                          {row.featuredStatus === "approved" && (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-black text-amber-300">
                              ویژه
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[11px] text-gray-500">
                          {toman(row.priceToman)} · موجودی {row.stock.toLocaleString("fa-IR")}
                          {row.soldCount > 0 && ` · ${row.soldCount.toLocaleString("fa-IR")} فروش`}
                        </div>

                        {row.status === "rejected" && row.rejectionReason && (
                          <p className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                            دلیل رد: {row.rejectionReason}
                          </p>
                        )}
                        {row.status === "pending_review" && (
                          <p className="mt-2 text-[11px] text-amber-300/80">
                            تا زمان تأیید مدیر، این آگهی در فروشگاه دیده نمی‌شود.
                          </p>
                        )}
                        {row.status === "sold_out" && (
                          <p className="mt-2 text-[11px] text-orange-300/80">
                            موجودی تمام شده است. با افزایش موجودی دوباره فعال می‌شود.
                          </p>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-[11px] font-bold text-gray-400">عنوان</label>
                            <input
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-violet-500"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-[11px] font-bold text-gray-400">قیمت (USDT)</label>
                            <input
                              value={priceToman}
                              onChange={(e) => setPriceToman(e.target.value.replace(/[^\d]/g, ""))}
                              inputMode="numeric"
                              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-violet-500"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-[11px] font-bold text-gray-400">موجودی</label>
                            <input
                              value={stock}
                              onChange={(e) => setStock(e.target.value.replace(/[^\d]/g, ""))}
                              inputMode="numeric"
                              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-violet-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[11px] font-bold text-gray-400">توضیحات</label>
                          <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-violet-500"
                          />
                        </div>
                        <p className="text-[10px] text-gray-500">
                          تغییر قیمت، عنوان یا توضیحات باعث می‌شود آگهی دوباره بررسی شود. تغییر موجودی نیازی به بررسی ندارد.
                        </p>
                        <div className="flex gap-2">
                          <button
                            disabled={busy}
                            onClick={() =>
                              act(
                                row.id,
                                {
                                  action: "update",
                                  title,
                                  priceToman,
                                  stock: Number(stock || 0),
                                  description,
                                },
                                "تغییرات ذخیره شد."
                              )
                            }
                            className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-black disabled:opacity-50"
                          >
                            {busy ? "..." : "ذخیره"}
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black text-gray-300"
                          >
                            انصراف
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-3">
                        {row.status !== "rejected" && (
                          <button
                            onClick={() => startEdit(row)}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-black text-gray-200"
                          >
                            ویرایش
                          </button>
                        )}
                        {(row.status === "active" || row.status === "sold_out") && (
                          <button
                            disabled={busy}
                            onClick={() => act(row.id, { action: "pause" }, "آگهی موقتاً غیرفعال شد.")}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-black text-sky-300 disabled:opacity-50"
                          >
                            غیرفعال کردن
                          </button>
                        )}
                        {row.status === "paused" && (
                          <button
                            disabled={busy}
                            onClick={() => act(row.id, { action: "resume" }, "آگهی دوباره فعال شد.")}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-black text-emerald-300 disabled:opacity-50"
                          >
                            فعال کردن
                          </button>
                        )}
                        <Link
                          href={`/store/${row.id}`}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-black text-gray-300"
                        >
                          مشاهده
                        </Link>
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (!window.confirm("این آگهی حذف شود؟ این کار قابل بازگشت نیست.")) return;
                            act(row.id, { action: "archive" }, "آگهی حذف شد.");
                          }}
                          className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-[11px] font-black text-red-300 disabled:opacity-50"
                        >
                          حذف
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <Link
            href="/store"
            className="mt-8 inline-flex items-center gap-1.5 text-xs font-black text-gray-400 transition hover:text-white"
          >
            <StoreIcon name="chevron-left" className="h-3.5 w-3.5 rotate-180" />
            بازگشت به فروشگاه
          </Link>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
