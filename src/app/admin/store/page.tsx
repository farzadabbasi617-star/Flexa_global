"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import KycReviewCard, { type KycReviewRow } from "@/components/admin/KycReviewCard";
import OfficialListingForm from "@/components/admin/OfficialListingForm";

type Tab = "kyc" | "listings" | "orders" | "reports" | "rates" | "featured";

interface ReportRow {
  id: string;
  reason: string;
  reasonLabel: string;
  details: string | null;
  status: string;
  listingId: string | null;
  listingTitle: string | null;
  reporterName: string | null;
}

type EstGame = "cod_mobile" | "clash_royale" | "fortnite";
interface RateField {
  key: string;
  label: string;
  unitToman: number;
  isDefault: boolean;
}
const EST_GAMES: Array<{ id: EstGame; label: string }> = [
  { id: "cod_mobile", label: "کالاف دیوتی موبایل" },
  { id: "clash_royale", label: "کلش رویال" },
  { id: "fortnite", label: "فورتنایت" },
];

type KycRow = KycReviewRow;
interface ListingRow {
  id: string;
  source: string;
  sellerName: string | null;
  kind: string;
  game: string | null;
  title: string;
  description?: string | null;
  priceToman: number;
  stock: number;
  status: string;
  images?: string[];
  metadata?: any;
  deliveryNotes?: string | null;
}
interface FeaturedRow {
  id: string;
  title: string;
  source: string;
  sellerName: string | null;
  status: string;
  stock: number;
  priceToman: number;
  featuredStatus: "none" | "pending_review" | "approved" | "rejected";
  featuredUntil: string | null;
  featuredRank: number;
  featuredRejectionReason: string | null;
}
interface PromotableRow {
  id: string;
  title: string;
  source: string;
  sellerName: string | null;
  priceToman: number;
  stock: number;
  soldCount: number;
}

interface OrderRow {
  id: string;
  title: string | null;
  buyerName: string | null;
  source: string;
  totalPriceToman: number;
  status: string;
  disputeReason: string | null;
}

function toman(n: number) { return `${n.toLocaleString("fa-IR")} USDT`; }

export default function AdminStorePage() {
  const [tab, setTab] = useState<Tab>("kyc");
  const [kyc, setKyc] = useState<KycRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rateGame, setRateGame] = useState<EstGame>("cod_mobile");
  const [rateFields, setRateFields] = useState<RateField[]>([]);
  const [savingRates, setSavingRates] = useState(false);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [featured, setFeatured] = useState<FeaturedRow[]>([]);
  const [promotable, setPromotable] = useState<PromotableRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "kyc") {
        const r = await fetch("/api/admin/store/kyc?status=pending", { cache: "no-store", credentials: "include" });
        const d = await r.json(); setKyc(Array.isArray(d.items) ? d.items : []);
      } else if (tab === "listings") {
        const r = await fetch("/api/admin/store/listings?status=pending_review", { cache: "no-store", credentials: "include" });
        const d = await r.json(); setListings(Array.isArray(d.items) ? d.items : []);
      } else if (tab === "orders") {
        const r = await fetch("/api/admin/store/orders?status=disputed", { cache: "no-store", credentials: "include" });
        const d = await r.json(); setOrders(Array.isArray(d.items) ? d.items : []);
      } else if (tab === "reports") {
        const r = await fetch("/api/admin/store/reports?status=open", { cache: "no-store", credentials: "include" });
        const d = await r.json(); setReports(Array.isArray(d.items) ? d.items : []);
      } else if (tab === "featured") {
        const r = await fetch("/api/admin/store/featured", { cache: "no-store", credentials: "include" });
        const d = await r.json();
        setFeatured(Array.isArray(d.items) ? d.items : []);
        setPromotable(Array.isArray(d.promotable) ? d.promotable : []);
      } else if (tab === "rates") {
        const r = await fetch(`/api/admin/store/estimator-rates?game=${rateGame}`, { cache: "no-store", credentials: "include" });
        const d = await r.json(); setRateFields(Array.isArray(d.fields) ? d.fields : []);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, rateGame]);

  async function resolveReport(id: string, status: "resolved" | "dismissed") {
    const adminNote = window.prompt("یادداشت (اختیاری):") || undefined;
    const r = await fetch("/api/admin/store/reports", {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ id, status, adminNote }),
    });
    setMsg(r.ok ? "انجام شد" : "خطا"); load();
  }

  async function saveRates() {
    if (savingRates) return;
    setSavingRates(true);
    try {
      const rates: Record<string, number> = {};
      for (const f of rateFields) rates[f.key] = f.unitToman;
      const r = await fetch("/api/admin/store/estimator-rates", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ game: rateGame, rates }),
      });
      setMsg(r.ok ? "نرخ‌ها ذخیره شد" : "خطا در ذخیره");
      if (r.ok) load();
    } finally {
      setSavingRates(false);
    }
  }

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t); }, [msg]);

  async function reviewKyc(id: string, decision: "verified" | "rejected") {
    const rejectionReason = decision === "rejected" ? window.prompt("دلیل رد:") || "" : undefined;
    if (decision === "rejected" && !rejectionReason) return;
    const r = await fetch("/api/admin/store/kyc", {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ id, decision, rejectionReason }),
    });
    setMsg(r.ok ? "انجام شد" : "خطا"); load();
  }
  async function reviewListing(id: string, decision: "approve" | "reject") {
    const rejectionReason = decision === "reject" ? window.prompt("دلیل رد:") || "" : undefined;
    if (decision === "reject" && !rejectionReason) return;
    const r = await fetch("/api/admin/store/listings", {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ id, decision, rejectionReason }),
    });
    setMsg(r.ok ? "انجام شد" : "خطا"); load();
  }
  async function resolveOrder(id: string, resolution: "refund_buyer" | "release_seller") {
    const reason = window.prompt("یادداشت (اختیاری):") || undefined;
    const r = await fetch("/api/admin/store/orders", {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ id, resolution, reason }),
    });
    setMsg(r.ok ? "انجام شد" : "خطا"); load();
  }

  async function featuredAction(
    listingId: string,
    action: "approve" | "reject" | "clear",
    extra?: { days?: number; rank?: number; reason?: string }
  ) {
    const r = await fetch("/api/admin/store/featured", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ listingId, action, ...extra }),
    });
    const d = await r.json().catch(() => ({}));
    // Surface the server's own message: approve refuses a non-active listing,
    // and a clamped duration comes back as a warning worth reading.
    setMsg(r.ok ? d.warning || "انجام شد" : d.error || "خطا");
    load();
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "kyc", label: "احراز هویت" },
    { id: "listings", label: "آگهی‌های در انتظار" },
    { id: "orders", label: "اختلافات" },
    { id: "reports", label: "گزارش‌ها" },
    { id: "featured", label: "محصولات ویژه" },
    { id: "rates", label: "نرخ تخمین قیمت" },
  ];

  return (
    <>
      <Navbar />
      <main className="min-h-[100dvh] bg-[#06060f] px-4 py-6 text-white sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-black">مدیریت فروشگاه</h1>

          <div className="mt-4 flex gap-2">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${tab === t.id ? "bg-purple-600" : "border border-white/10 bg-white/5 text-gray-300"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="mt-8 text-gray-400">در حال بارگذاری...</p>
          ) : (
            <div className="mt-6 space-y-3">
              {tab === "kyc" && (kyc.length === 0 ? <Empty /> : kyc.map((k) => (
                <KycReviewCard key={k.id} row={k} onReview={reviewKyc} />
              )))}

              {/* The pending queue only ever holds seller submissions, so without
                  this the admin has no way to put a product in the store at all. */}
              {tab === "listings" && (
                <OfficialListingForm onCreated={(m) => { setMsg(m); load(); }} />
              )}

              {tab === "listings" && (listings.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] py-8 text-center text-sm text-gray-400">
                  آگهی در انتظار تأییدی وجود ندارد.
                </div>
              ) : listings.map((l) => (
                <div key={l.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-black">{l.title}</h3>
                      <p className="mt-1 text-xs text-gray-400">{l.kind}{l.game ? ` · ${l.game}` : ""} · {toman(l.priceToman)} · موجودی {l.stock} · فروشنده: {l.sellerName || "—"}</p>
                      {l.description && <p className="mt-2 rounded-xl bg-black/30 p-2 text-xs text-gray-300">{l.description}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => reviewListing(l.id, "approve")} className="rounded-xl bg-green-600 px-3 py-1.5 text-xs font-black">تأیید</button>
                      <button onClick={() => reviewListing(l.id, "reject")} className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-black">رد</button>
                    </div>
                  </div>
                  {l.kind === "account" && l.game === "cod_mobile" && <CodmSpecs meta={l.metadata?.codm || l.metadata} />}
                  <ImageThumbs images={l.images} />
                  {l.deliveryNotes && (
                    <p className="mt-2 rounded-xl bg-black/30 p-2 text-[11px] text-amber-200">تحویل محرمانه: {l.deliveryNotes}</p>
                  )}
                </div>
              )))}

              {tab === "orders" && (orders.length === 0 ? <Empty /> : orders.map((o) => (
                <div key={o.id} className="rounded-3xl border border-orange-500/30 bg-orange-500/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black">{o.title || "کالا"}</h3>
                      <p className="mt-1 text-xs text-gray-400">خریدار: {o.buyerName || "—"} · {toman(o.totalPriceToman)}</p>
                      {o.disputeReason && <p className="mt-2 rounded-xl bg-black/40 p-2 text-xs text-orange-200">دلیل: {o.disputeReason}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => resolveOrder(o.id, "refund_buyer")} className="rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-black">بازپرداخت خریدار</button>
                      <button onClick={() => resolveOrder(o.id, "release_seller")} className="rounded-xl bg-green-600 px-3 py-1.5 text-xs font-black">آزادسازی به فروشنده</button>
                    </div>
                  </div>
                </div>
              )))}

              {tab === "reports" && (reports.length === 0 ? <Empty /> : reports.map((rep) => (
                <div key={rep.id} className="rounded-3xl border border-red-500/30 bg-red-500/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black">{rep.reasonLabel}</h3>
                      <p className="mt-1 text-xs text-gray-400">
                        گزارش‌دهنده: {rep.reporterName || "—"}
                        {rep.listingTitle && ` · آگهی: ${rep.listingTitle}`}
                      </p>
                      {rep.details && <p className="mt-2 rounded-xl bg-black/40 p-2 text-xs text-red-200">{rep.details}</p>}
                      {rep.listingId && (
                        <a href={`/store/${rep.listingId}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-cyan-300 underline">مشاهده آگهی</a>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => resolveReport(rep.id, "resolved")} className="rounded-xl bg-green-600 px-3 py-1.5 text-xs font-black">رسیدگی شد</button>
                      <button onClick={() => resolveReport(rep.id, "dismissed")} className="rounded-xl bg-gray-600 px-3 py-1.5 text-xs font-black">رد گزارش</button>
                    </div>
                  </div>
                </div>
              )))}

              {tab === "featured" && (
                <div className="space-y-6">
                  {/* Live and pending placements. This is the review queue the
                      paid flow will feed into once it exists. */}
                  <div>
                    <h2 className="mb-3 text-sm font-black text-amber-300">جایگاه‌های ویژه</h2>
                    {featured.length === 0 ? (
                      <div className="rounded-3xl border border-white/10 bg-white/[0.03] py-8 text-center text-sm text-gray-400">
                        هنوز محصول ویژه‌ای ثبت نشده است.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {featured.map((row) => {
                          const expired = row.featuredUntil ? new Date(row.featuredUntil) <= new Date() : true;
                          const live = row.featuredStatus === "approved" && !expired && row.status === "active" && row.stock > 0;
                          return (
                            <div key={row.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-black">{row.title}</span>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${live ? "bg-emerald-500/15 text-emerald-300" : "bg-gray-500/15 text-gray-400"}`}>
                                      {live ? "در حال نمایش" : expired && row.featuredStatus === "approved" ? "منقضی‌شده" : row.featuredStatus === "pending_review" ? "در انتظار تأیید" : row.featuredStatus === "rejected" ? "ردشده" : "غیرفعال"}
                                    </span>
                                    <span className="text-[10px] text-gray-500">رتبه {row.featuredRank.toLocaleString("fa-IR")}</span>
                                  </div>
                                  <div className="mt-1 text-[11px] text-gray-500">
                                    {row.source === "user" ? row.sellerName || "فروشنده" : "عرضه Flexa"} · {toman(row.priceToman)}
                                    {row.featuredUntil && ` · تا ${new Date(row.featuredUntil).toLocaleDateString("fa-IR")}`}
                                  </div>
                                  {/* A promoted listing that went out of stock or was paused
                                      stops showing publicly; say so instead of leaving the
                                      admin wondering why it vanished. */}
                                  {row.featuredStatus === "approved" && !expired && (row.status !== "active" || row.stock <= 0) && (
                                    <p className="mt-1 text-[11px] text-amber-300">
                                      نمایش داده نمی‌شود: {row.stock <= 0 ? "موجودی صفر است" : "محصول فعال نیست"}
                                    </p>
                                  )}
                                  {row.featuredRejectionReason && (
                                    <p className="mt-1 text-[11px] text-red-300">دلیل رد: {row.featuredRejectionReason}</p>
                                  )}
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-2">
                                  {row.featuredStatus !== "approved" && (
                                    <button
                                      onClick={() => {
                                        const days = Number(window.prompt("مدت نمایش (روز):", "7") || 0);
                                        if (!days) return;
                                        const rank = Number(window.prompt("رتبه (عدد بزرگ‌تر = بالاتر):", "0") || 0);
                                        featuredAction(row.id, "approve", { days, rank });
                                      }}
                                      className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black"
                                    >
                                      تأیید
                                    </button>
                                  )}
                                  {row.featuredStatus === "pending_review" && (
                                    <button
                                      onClick={() => featuredAction(row.id, "reject", { reason: window.prompt("دلیل رد:") || undefined })}
                                      className="rounded-xl bg-red-600/80 px-3 py-1.5 text-xs font-black"
                                    >
                                      رد
                                    </button>
                                  )}
                                  <button
                                    onClick={() => featuredAction(row.id, "clear")}
                                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-black text-gray-300"
                                  >
                                    برداشتن
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Until sellers can buy a slot, this is how a placement starts. */}
                  <div>
                    <h2 className="mb-1 text-sm font-black text-gray-200">افزودن محصول به بخش ویژه</h2>
                    <p className="mb-3 text-[11px] text-gray-500">
                      فقط محصولات فعال و موجود قابل انتخاب‌اند. مدت نمایش حداکثر ۹۰ روز است.
                    </p>
                    {promotable.length === 0 ? (
                      <div className="rounded-3xl border border-white/10 bg-white/[0.03] py-8 text-center text-sm text-gray-400">
                        محصول فعالی برای ویژه‌کردن وجود ندارد.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {promotable.map((row) => (
                          <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold">{row.title}</div>
                              <div className="text-[11px] text-gray-500">
                                {row.source === "user" ? row.sellerName || "فروشنده" : "عرضه Flexa"} · {toman(row.priceToman)} · موجودی {row.stock.toLocaleString("fa-IR")}
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                const days = Number(window.prompt("مدت نمایش (روز):", "7") || 0);
                                if (!days) return;
                                const rank = Number(window.prompt("رتبه (عدد بزرگ‌تر = بالاتر):", "0") || 0);
                                featuredAction(row.id, "approve", { days, rank });
                              }}
                              className="shrink-0 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-black text-black"
                            >
                              ویژه کن
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === "rates" && (
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="mb-4 flex flex-wrap gap-2">
                    {EST_GAMES.map((g) => (
                      <button key={g.id} onClick={() => setRateGame(g.id)} className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${rateGame === g.id ? "bg-purple-600" : "border border-white/10 bg-white/5 text-gray-300"}`}>
                        {g.label}
                      </button>
                    ))}
                  </div>
                  <p className="mb-3 text-xs text-gray-400">قیمت هر واحد (به USDT). قیمت نهایی = تعداد × نرخ هر فیلد.</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {rateFields.map((f, idx) => (
                      <div key={f.key}>
                        <label className="mb-1 block text-xs font-bold text-gray-300">
                          {f.label} {f.isDefault && <span className="text-[10px] text-gray-500">(پیش‌فرض)</span>}
                        </label>
                        <input
                          className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm outline-none focus:border-purple-400"
                          value={f.unitToman}
                          inputMode="numeric"
                          dir="ltr"
                          onChange={(e) => {
                            const v = Number(e.target.value.replace(/[^\d]/g, "")) || 0;
                            setRateFields((prev) => prev.map((x, i) => (i === idx ? { ...x, unitToman: v } : x)));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <button onClick={saveRates} disabled={savingRates} className="mt-5 rounded-2xl bg-purple-600 px-6 py-2.5 text-sm font-black disabled:opacity-40">
                    {savingRates ? "در حال ذخیره..." : "ذخیره نرخ‌ها"}
                  </button>
                </div>
              )}
            </div>
          )}

          {msg && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-2xl bg-purple-600 px-5 py-3 text-sm font-bold shadow-2xl">{msg}</div>}
        </div>
      </main>
    </>
  );
}

function CodmSpecs({ meta }: { meta: any }) {
  if (!meta) return null;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const txt = (v: unknown) => (v == null ? "" : String(v).trim());
  const badges: Array<[string, boolean]> = [
    ["دسترسی کامل", meta.fullAccess === true],
    ["ایمیل قابل تغییر", meta.emailChangeable === true],
    ["مالک اول", meta.firstOwner === true],
    ["فقط Activision", meta.activisionOnly === true],
    ["دماسکوس باز", meta.damascusUnlocked === true],
  ];
  const stats: Array<[string, string]> = [
    ["لول", meta.level ? String(meta.level) : "—"],
    ["UID", txt(meta.uid) || "—"],
    ["منطقه", txt(meta.region).toUpperCase() || "—"],
    ["پلتفرم", txt(meta.platform) || "—"],
    ["روش ورود", txt(meta.loginMethod) || "—"],
    ["CP", meta.cpBalance ? String(num(meta.cpBalance)) : "—"],
    ["میثیک گان", String(num(meta.mythicWeapons))],
    ["میثیک مکس", String(num(meta.maxedMythicWeapons))],
    ["لجندری گان", String(num(meta.legendaryWeapons))],
    ["اپیک گان", String(num(meta.epicWeapons))],
    ["کاراکتر میثیک", String(num(meta.mythicCharacters))],
    ["کاراکتر لجندری", String(num(meta.legendaryCharacters))],
    ["کاراکتر اپیک", String(num(meta.epicCharacters))],
    ["الماس کامو", String(num(meta.diamondCamos))],
    ["رنک MP", txt(meta.rankMp) || "—"],
    ["رنک BR", txt(meta.rankBr) || "—"],
    ["باتل‌پس", txt(meta.battlePass) || "—"],
  ];
  return (
    <div className="mt-3 rounded-2xl border border-orange-400/20 bg-orange-500/[0.06] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black tracking-widest text-orange-300">مشخصات اکانت کالاف</span>
        {badges.filter(([, on]) => on).map(([label]) => (
          <span key={label} className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">✓ {label}</span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-black/30 px-2 py-1.5">
            <div className="text-[9px] text-gray-500">{label}</div>
            <div className="text-xs font-bold text-gray-100">{value}</div>
          </div>
        ))}
      </div>
      {[
        ["سلاح‌های شاخص", meta.notableWeapons],
        ["کاراکترهای شاخص", meta.notableCharacters],
        ["آیتم‌های نایاب", meta.rareItems],
        ["تصاویر همراه", meta.screenshotsIncluded],
      ].map(([label, v]) =>
        txt(v) ? (
          <p key={label} className="mt-2 text-[11px] leading-5 text-gray-300">
            <span className="text-gray-500">{label}:</span> {txt(v)}
          </p>
        ) : null
      )}
    </div>
  );
}

function ImageThumbs({ images }: { images?: string[] }) {
  if (!images || !images.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {images.slice(0, 6).map((src, i) => (
        <a key={i} href={src} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded-xl border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
        </a>
      ))}
    </div>
  );
}

function Empty() {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.03] py-12 text-center text-gray-400">موردی برای نمایش نیست.</div>;
}
