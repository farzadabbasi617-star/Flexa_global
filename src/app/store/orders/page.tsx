"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import StoreIcon from "@/components/store/StoreIcon";

interface Order {
  id: string;
  title: string | null;
  kind: string | null;
  source: "official" | "user";
  quantity: number;
  totalPriceToman: number;
  status: string;
  sellerId: string | null;
  iAmBuyer: boolean;
  iAmSeller: boolean;
  deliveryDeadlineAt?: string | null;
  autoReleaseAt?: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending_payment: { label: "در انتظار پرداخت", cls: "bg-gray-500/20 text-gray-300" },
  paid_escrow: { label: "پرداخت‌شده (امانی)", cls: "bg-blue-500/20 text-blue-300" },
  delivered: { label: "تحویل داده شد", cls: "bg-cyan-500/20 text-cyan-300" },
  completed: { label: "تکمیل‌شده", cls: "bg-green-500/20 text-green-300" },
  disputed: { label: "در حال اعتراض", cls: "bg-orange-500/20 text-orange-300" },
  refunded: { label: "بازپرداخت‌شده", cls: "bg-purple-500/20 text-purple-300" },
  cancelled: { label: "لغو شد", cls: "bg-red-500/20 text-red-300" },
};

interface Offer {
  id: string;
  listingId: string;
  title: string | null;
  buyerName: string | null;
  offerToman: number;
  listingToman: number;
  message: string | null;
  status: string;
  orderId: string | null;
  iAmBuyer: boolean;
  iAmSeller: boolean;
  createdAt: string;
}

const OFFER_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: "در انتظار پاسخ", cls: "bg-blue-500/20 text-blue-300" },
  accepted: { label: "پذیرفته شد", cls: "bg-green-500/20 text-green-300" },
  rejected: { label: "رد شد", cls: "bg-red-500/20 text-red-300" },
  withdrawn: { label: "لغو شد", cls: "bg-gray-500/20 text-gray-300" },
  expired: { label: "منقضی شد", cls: "bg-gray-500/20 text-gray-400" },
};

function toman(n: number) { return `${n.toLocaleString("fa-IR")} USDT`; }

export default function OrdersPage() {
  const [tab, setTab] = useState<"orders" | "offers">("orders");
  const [items, setItems] = useState<Order[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Record<string, string | null>>({});
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/store/orders", { cache: "no-store", credentials: "include" });
      if (res.status === 401) { setItems([]); setMsg({ type: "err", text: "برای مشاهده سفارش‌ها وارد شوید." }); return; }
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      // Load offers too (best-effort).
      try {
        const or = await fetch("/api/store/offers", { cache: "no-store", credentials: "include" });
        if (or.ok) {
          const od = await or.json();
          setOffers(Array.isArray(od.items) ? od.items : []);
        }
      } catch { /* ignore */ }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  async function respondOffer(id: string, action: "accept" | "reject" | "withdraw") {
    if (busyId) return;
    if (action === "accept" && !window.confirm("با پذیرش این پیشنهاد، سفارش با مبلغ پیشنهادی ثبت می‌شود. مطمئن هستید؟")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/store/offers/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ type: "err", text: data.error || "عملیات ناموفق بود." }); return; }
      setMsg({ type: "ok", text: action === "accept" ? "پیشنهاد پذیرفته شد و سفارش ثبت شد." : "انجام شد." });
      load();
    } catch {
      setMsg({ type: "err", text: "خطای ارتباط." });
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 4000); return () => clearTimeout(t); }, [msg]);

  async function act(id: string, action: "deliver" | "confirm" | "dispute" | "cancel") {
    if (busyId) return;
    let reason: string | undefined;
    if (action === "dispute") {
      reason = window.prompt("دلیل اعتراض را بنویسید:") || undefined;
      if (!reason) return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/store/orders/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ type: "err", text: data.error || "عملیات ناموفق بود." }); return; }
      setMsg({ type: "ok", text: "انجام شد." });
      load();
    } catch {
      setMsg({ type: "err", text: "خطای ارتباط." });
    } finally {
      setBusyId(null);
    }
  }

  async function submitReview(id: string) {
    const ratingStr = window.prompt("امتیاز شما به فروشنده (۱ تا ۵):");
    const rating = Math.round(Number(ratingStr));
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      setMsg({ type: "err", text: "امتیاز باید بین ۱ تا ۵ باشد." });
      return;
    }
    const comment = window.prompt("نظر شما (اختیاری):") || undefined;
    try {
      const res = await fetch("/api/store/reviews", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ orderId: id, rating, comment }),
      });
      const data = await res.json();
      setMsg(res.ok ? { type: "ok", text: "نظر شما ثبت شد. ممنون!" } : { type: "err", text: data.error || "ثبت نظر ناموفق بود." });
    } catch {
      setMsg({ type: "err", text: "خطای ارتباط." });
    }
  }

  async function showDelivery(id: string) {
    try {
      const res = await fetch(`/api/store/orders/${id}`, { cache: "no-store", credentials: "include" });
      const data = await res.json();
      setReveal((p) => ({ ...p, [id]: data?.order?.deliveryNotes ?? "اطلاعات تحویل ثبت نشده است." }));
    } catch {
      setReveal((p) => ({ ...p, [id]: "خطا در دریافت اطلاعات." }));
    }
  }

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-[#07080d] pb-28 text-white" dir="rtl">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_82%_0%,rgba(124,58,237,.13),transparent_30%),radial-gradient(circle_at_8%_35%,rgba(6,182,212,.06),transparent_25%)]" />

      <div className="relative z-30 border-b border-white/[.06] bg-[#0b0c12] px-4 py-2 text-center text-[10px] font-bold text-gray-400 sm:text-xs">
        <span className="inline-flex items-center gap-1.5"><StoreIcon name="shield" className="h-3.5 w-3.5 text-emerald-400" /> وضعیت پرداخت امانی و تحویل سفارش‌ها در این صفحه قابل پیگیری است</span>
      </div>

      <header className="sticky top-0 z-30 border-b border-white/[.07] bg-[#090a10]/90 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/store" className="flex items-center gap-2.5" aria-label="فروشگاه Flexa">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/flexa-icon-192.png" alt="Flexa" className="h-10 w-10 object-contain drop-shadow-[0_0_15px_rgba(168,85,247,.45)]" />
            <div className="hidden sm:block">
              <div className="text-[8px] font-black tracking-[.2em] text-violet-300">GAMENT STORE</div>
              <div className="text-sm font-black">فروشگاه Flexa</div>
            </div>
          </Link>
          <nav className="mr-auto flex items-center gap-2">
            <Link href="/wallet" className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[.04] text-gray-300 hover:text-violet-200" title="کیف پول"><StoreIcon name="wallet" className="h-5 w-5" /></Link>
            <Link href="/store/sell" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[.04] px-3 text-xs font-black text-gray-200"><StoreIcon name="plus" className="h-4 w-4" /><span className="hidden min-[420px]:inline">ثبت آگهی</span></Link>
            <Link href="/store" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-xs font-black"><StoreIcon name="store" className="h-4 w-4" /><span className="hidden sm:inline">فروشگاه</span></Link>
          </nav>
        </div>
      </header>

      <div className="relative mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-9">
        <nav className="flex items-center gap-2 text-[11px] text-gray-500" aria-label="مسیر صفحه">
          <Link href="/store" className="hover:text-white">فروشگاه</Link>
          <StoreIcon name="chevron-left" className="h-3 w-3" />
          <span className="text-gray-300">سفارش‌های من</span>
        </nav>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-[9px] font-black tracking-[.24em] text-violet-400">ORDER CENTER</span>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">مدیریت سفارش‌ها</h1>
            <p className="mt-2 text-xs leading-6 text-gray-500">خریدها، فروش‌ها و پیشنهادهای قیمت خود را یک‌جا پیگیری کنید.</p>
          </div>
          <Link href="/store" className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-4 py-2.5 text-xs font-black text-gray-300 transition hover:border-violet-300/25 hover:text-white">
            ادامه خرید <StoreIcon name="arrow-left" className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-7 inline-flex rounded-2xl border border-white/[.08] bg-white/[.025] p-1.5">
          <button onClick={() => setTab("orders")} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition ${tab === "orders" ? "bg-violet-600 text-white shadow-[0_8px_20px_rgba(124,58,237,.24)]" : "text-gray-500 hover:text-gray-200"}`}>
            <StoreIcon name="package" className="h-4 w-4" /> سفارش‌ها
            {items.length > 0 && <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[9px] ${tab === "orders" ? "bg-white/15" : "bg-white/[.06]"}`}>{items.length.toLocaleString("fa-IR")}</span>}
          </button>
          <button onClick={() => setTab("offers")} className={`relative inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition ${tab === "offers" ? "bg-violet-600 text-white shadow-[0_8px_20px_rgba(124,58,237,.24)]" : "text-gray-500 hover:text-gray-200"}`}>
            <StoreIcon name="tag" className="h-4 w-4" /> پیشنهادها
            {offers.length > 0 && <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[9px] ${tab === "offers" ? "bg-white/15" : "bg-white/[.06]"}`}>{offers.length.toLocaleString("fa-IR")}</span>}
            {offers.some((offer) => offer.iAmSeller && offer.status === "pending") && <span className="absolute left-1 top-1 h-2 w-2 rounded-full bg-red-400 ring-2 ring-[#0f1017]" />}
          </button>
        </div>

        {loading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded-[26px] border border-white/[.07] bg-white/[.025] p-5">
                <div className="flex justify-between"><span className="h-5 w-2/5 rounded-full bg-white/[.06]" /><span className="h-6 w-24 rounded-full bg-white/[.06]" /></div>
                <div className="mt-5 h-14 rounded-2xl bg-white/[.05]" />
              </div>
            ))}
          </div>
        ) : tab === "offers" ? (
          offers.length === 0 ? (
            <div className="mt-6 rounded-[28px] border border-white/[.08] bg-white/[.025] px-5 py-16 text-center">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-cyan-500/[.08] text-cyan-300"><StoreIcon name="tag" className="h-8 w-8" /></span>
              <h2 className="mt-5 text-lg font-black">هنوز پیشنهاد قیمتی ندارید</h2>
              <p className="mt-2 text-xs text-gray-500">پیشنهادهایی که ارسال یا دریافت می‌کنید اینجا نمایش داده می‌شوند.</p>
              <Link href="/store" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black">مشاهده محصولات <StoreIcon name="arrow-left" className="h-4 w-4" /></Link>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {offers.map((offer) => {
                const status = OFFER_STATUS_LABELS[offer.status] || { label: offer.status, cls: "bg-gray-500/20 text-gray-300" };
                return (
                  <article key={offer.id} className="overflow-hidden rounded-[26px] border border-white/[.08] bg-[#0f1017] p-4 shadow-[0_14px_35px_rgba(0,0,0,.16)] sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-2 flex items-center gap-2 text-[9px] font-black text-gray-600"><StoreIcon name="tag" className="h-3.5 w-3.5" /> {offer.iAmSeller ? "پیشنهاد دریافتی" : "پیشنهاد ارسالی"} · {new Date(offer.createdAt).toLocaleDateString("fa-IR")}</div>
                        <h2 className="truncate text-sm font-black text-gray-100 sm:text-base">{offer.title || "آگهی فروشگاه"}</h2>
                        <p className="mt-1 text-[10px] text-gray-500">{offer.iAmSeller ? `ارسال‌کننده: ${offer.buyerName || "خریدار"}` : "پیشنهاد ثبت‌شده توسط شما"} · قیمت آگهی: {toman(offer.listingToman)}</p>
                      </div>
                      <span className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[9px] font-black ${status.cls}`}>{status.label}</span>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/[.06] bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div><span className="block text-[9px] text-gray-600">مبلغ پیشنهادی</span><strong className="mt-1 block text-lg font-black text-cyan-200">{toman(offer.offerToman)}</strong></div>
                      {offer.message && <p className="max-w-md text-[10px] leading-5 text-gray-400">«{offer.message}»</p>}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {offer.iAmSeller && offer.status === "pending" && (
                        <>
                          <button onClick={() => respondOffer(offer.id, "accept")} disabled={busyId === offer.id} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[10px] font-black transition hover:bg-emerald-500 disabled:opacity-40"><StoreIcon name="check" className="h-3.5 w-3.5" /> پذیرش پیشنهاد</button>
                          <button onClick={() => respondOffer(offer.id, "reject")} disabled={busyId === offer.id} className="rounded-xl border border-red-300/20 bg-red-500/[.07] px-4 py-2 text-[10px] font-black text-red-300 disabled:opacity-40">رد پیشنهاد</button>
                        </>
                      )}
                      {offer.iAmBuyer && offer.status === "pending" && <button onClick={() => respondOffer(offer.id, "withdraw")} disabled={busyId === offer.id} className="rounded-xl border border-white/10 bg-white/[.04] px-4 py-2 text-[10px] font-black text-gray-300 disabled:opacity-40">لغو پیشنهاد</button>}
                      {offer.status === "accepted" && <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-emerald-300"><StoreIcon name="check" className="h-4 w-4" /> سفارش ثبت شد؛ از تب سفارش‌ها پیگیری کنید.</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : items.length === 0 ? (
          <div className="mt-6 rounded-[28px] border border-white/[.08] bg-white/[.025] px-5 py-16 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-violet-500/[.09] text-violet-300"><StoreIcon name="package" className="h-8 w-8" /></span>
            <h2 className="mt-5 text-lg font-black">هنوز سفارشی ثبت نشده است</h2>
            <p className="mt-2 text-xs text-gray-500">پس از خرید یا فروش، روند معامله در این بخش نمایش داده می‌شود.</p>
            <Link href="/store" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black">رفتن به فروشگاه <StoreIcon name="arrow-left" className="h-4 w-4" /></Link>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {items.map((order) => {
              const status = STATUS_LABELS[order.status] || { label: order.status, cls: "bg-gray-500/20 text-gray-300" };
              const paidReached = !["pending_payment", "cancelled"].includes(order.status);
              const deliveredReached = ["delivered", "completed"].includes(order.status);
              const completedReached = order.status === "completed";
              const finalStatus = ["completed", "refunded", "cancelled"].includes(order.status);
              return (
                <article key={order.id} className="overflow-hidden rounded-[28px] border border-white/[.08] bg-[#0f1017] shadow-[0_16px_40px_rgba(0,0,0,.18)]">
                  <div className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-[9px] font-bold text-gray-600">
                          <span>سفارش #{order.id.slice(0, 8).toUpperCase()}</span>
                          <span>·</span>
                          <time>{new Date(order.createdAt).toLocaleDateString("fa-IR")}</time>
                          <span>·</span>
                          <span>{order.iAmBuyer ? "خرید شما" : "فروش شما"}</span>
                        </div>
                        <h2 className="truncate text-sm font-black text-gray-100 sm:text-base">{order.title || "کالای فروشگاه"}</h2>
                        <p className="mt-1 text-[10px] text-gray-500">تعداد {order.quantity.toLocaleString("fa-IR")}{order.source === "official" ? " · فروشگاه رسمی Flexa" : " · معامله کاربران"}</p>
                      </div>
                      <span className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[9px] font-black ${status.cls}`}>{status.label}</span>
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/[.06] pt-4">
                      <div><span className="text-[9px] text-gray-600">مبلغ سفارش</span><strong className="mt-1 block text-lg font-black text-white">{toman(order.totalPriceToman)}</strong></div>
                      {!finalStatus && <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/[.08] px-2.5 py-1.5 text-[9px] font-black text-emerald-300"><StoreIcon name="shield" className="h-3.5 w-3.5" /> وجه در حساب امانی</span>}
                    </div>

                    {!['refunded', 'cancelled'].includes(order.status) && (
                      <div className="mt-5 rounded-2xl border border-white/[.055] bg-black/20 p-3">
                        <div className="relative grid grid-cols-3 gap-1 before:absolute before:right-[16.66%] before:left-[16.66%] before:top-3 before:h-px before:bg-white/10">
                          {[
                            { label: "پرداخت امن", reached: paidReached },
                            { label: "تحویل کالا", reached: deliveredReached },
                            { label: "تکمیل معامله", reached: completedReached },
                          ].map((step) => (
                            <div key={step.label} className="relative z-10 text-center">
                              <span className={`mx-auto grid h-6 w-6 place-items-center rounded-full border ${step.reached ? "border-violet-400 bg-violet-600 text-white" : "border-white/15 bg-[#0b0c12] text-gray-700"}`}>{step.reached ? <StoreIcon name="check" className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</span>
                              <span className={`mt-2 block text-[9px] font-bold ${step.reached ? "text-gray-300" : "text-gray-700"}`}>{step.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {order.status === "paid_escrow" && order.deliveryDeadlineAt && <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-amber-300"><StoreIcon name="clock" className="h-3.5 w-3.5" /> مهلت تحویل: {new Date(order.deliveryDeadlineAt).toLocaleString("fa-IR")}</div>}
                    {order.status === "delivered" && order.autoReleaseAt && <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-cyan-300"><StoreIcon name="clock" className="h-3.5 w-3.5" /> آزادسازی خودکار وجه: {new Date(order.autoReleaseAt).toLocaleString("fa-IR")}</div>}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {order.iAmSeller && order.status === "paid_escrow" && <button onClick={() => act(order.id, "deliver")} disabled={busyId === order.id} className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 text-[10px] font-black hover:bg-cyan-500 disabled:opacity-40"><StoreIcon name="truck" className="h-4 w-4" /> اعلام تحویل کالا</button>}
                      {order.iAmBuyer && order.status === "delivered" && <button onClick={() => act(order.id, "confirm")} disabled={busyId === order.id} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[10px] font-black hover:bg-emerald-500 disabled:opacity-40"><StoreIcon name="check" className="h-4 w-4" /> تأیید دریافت</button>}
                      {order.iAmBuyer && ["paid_escrow", "delivered"].includes(order.status) && <button onClick={() => act(order.id, "dispute")} disabled={busyId === order.id} className="rounded-xl border border-amber-300/20 bg-amber-500/[.07] px-4 py-2 text-[10px] font-black text-amber-300 disabled:opacity-40">ثبت اعتراض</button>}
                      {order.iAmBuyer && order.status === "paid_escrow" && <button onClick={() => { if (confirm("سفارش پیش از تحویل لغو و مبلغ بازپرداخت شود؟")) act(order.id, "cancel"); }} disabled={busyId === order.id} className="rounded-xl border border-red-300/15 bg-red-500/[.05] px-4 py-2 text-[10px] font-black text-red-300 disabled:opacity-40">لغو و بازپرداخت</button>}
                      {order.iAmBuyer && ["delivered", "completed"].includes(order.status) && <button onClick={() => showDelivery(order.id)} className="rounded-xl border border-white/10 bg-white/[.04] px-4 py-2 text-[10px] font-black text-gray-300">اطلاعات تحویل</button>}
                      {order.iAmBuyer && order.status === "completed" && order.sellerId && <button onClick={() => submitReview(order.id)} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-[10px] font-black"><StoreIcon name="star" className="h-3.5 w-3.5" /> ثبت امتیاز</button>}
                    </div>

                    {reveal[order.id] && <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-cyan-300/10 bg-cyan-500/[.045] p-3 text-xs leading-6 text-gray-200">{reveal[order.id]}</div>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {msg && (
        <div className={`fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border px-5 py-3 text-center text-sm font-bold shadow-2xl backdrop-blur-xl ${msg.type === "ok" ? "border-emerald-300/25 bg-emerald-600/95" : "border-red-300/25 bg-red-600/95"}`}>
          {msg.text}
        </div>
      )}

      <BottomNav />
    </main>
  );
}
