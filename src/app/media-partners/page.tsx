"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import OtpCodeInput from "@/components/OtpCodeInput";
import ImageUploader from "@/components/ImageUploader";
import { copyTextSafely } from "@/lib/client-clipboard";

interface DashboardData {
  partner: null | Record<string, any>;
  agreement?: null | { contractVersion: string; acceptedAt: string };
  stats: null | {
    clicks: number;
    activeAttributions: number;
    qualifiedMatches: number;
    totals: Record<string, string>;
  };
  properties: Array<Record<string, any>>;
  payouts: Array<Record<string, any>>;
  live?: boolean;
}

interface ContractData {
  title: string;
  version: string;
  contentHash: string;
  content: string;
  confirmations: string[];
  agreement?: { acceptedAt: string } | null;
}

const inputClass = "w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-violet-400/60";

function tomanFromRial(value?: string | number | null) {
  try { return `${(BigInt(value || 0) / BigInt(10)).toLocaleString("fa-IR")} USDT`; }
  catch { return "۰ USDT"; }
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    draft: "تکمیل قرارداد",
    pending: "در انتظار بررسی",
    active: "فعال",
    suspended: "تعلیق‌شده",
    rejected: "ردشده",
    terminated: "خاتمه‌یافته",
  };
  return labels[status || ""] || status || "—";
}

export default function MediaPartnersPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [contract, setContract] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [proof, setProof] = useState<string[]>([]);
  const [form, setForm] = useState({ legalName: "", nationalId: "", sheba: "IR", mediaName: "", mediaType: "telegram_channel", mediaUrl: "", followerCount: "" });
  const [confirmations, setConfirmations] = useState<boolean[]>([]);
  const [signerName, setSignerName] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboardResponse, contractResponse] = await Promise.all([
        fetch("/api/media-partners", { cache: "no-store", credentials: "include" }),
        fetch("/api/media-partners/contract", { cache: "no-store", credentials: "include" }),
      ]);
      if (dashboardResponse.status === 401) {
        setMessage({ ok: false, text: "برای همکاری رسانه‌ای ابتدا وارد حساب Flexa شوید." });
        setData(null);
        return;
      }
      setData(await dashboardResponse.json());
      if (contractResponse.ok) {
        const contractData = await contractResponse.json();
        setContract(contractData);
        setConfirmations(new Array(contractData.confirmations?.length || 0).fill(false));
      }
    } catch {
      setMessage({ ok: false, text: "دریافت اطلاعات همکاری انجام نشد." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totals = data?.stats?.totals || {};
  const pendingAmount = useMemo(() => BigInt(totals.pending || 0) + BigInt(totals.shadow || 0), [totals.pending, totals.shadow]);

  async function submitApplication(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/media-partners", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ ...form, followerCount: Number(form.followerCount || 0), ownershipProofUrl: proof[0] || "" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "ثبت درخواست انجام نشد");
      setMessage({ ok: true, text: "فرم ذخیره شد. حالا قرارداد را مطالعه و با OTP امضا کنید." });
      setSignerName(form.legalName.trim());
      await load();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "ثبت درخواست انجام نشد" });
    } finally { setBusy(false); }
  }

  async function sendOtp() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/media-partners/contract", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ action: "send_otp" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "ارسال کد انجام نشد");
      setOtpSent(true);
      setMessage({ ok: true, text: `کد امضای قرارداد به ${result.emailHint || "ایمیل تأییدشده"} ارسال شد.` });
      if (result.devCode) setOtpCode(result.devCode);
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "ارسال کد انجام نشد" }); }
    finally { setBusy(false); }
  }

  async function signContract() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/media-partners/contract", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ action: "sign", signerName, code: otpCode, confirmations }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "امضای قرارداد انجام نشد");
      setMessage({ ok: true, text: "قرارداد ثبت شد و درخواست شما برای بررسی ادمین ارسال شد." });
      await load();
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "امضای قرارداد انجام نشد" }); }
    finally { setBusy(false); }
  }

  async function requestPayout() {
    if (!confirm("تمام موجودی قابل برداشت برای تسویه رزرو شود؟")) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/media-partners/payouts", {
        method: "POST", credentials: "include",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "درخواست تسویه انجام نشد");
      setMessage({ ok: true, text: "درخواست تسویه ثبت شد." }); await load();
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "درخواست تسویه انجام نشد" }); }
    finally { setBusy(false); }
  }

  async function copyReferralLink(link: string) {
    const copied = await copyTextSafely(link);
    setMessage({
      ok: copied,
      text: copied ? "لینک اختصاصی با موفقیت کپی شد." : "کپی خودکار در این مرورگر انجام نشد؛ از دکمه اشتراک‌گذاری یا نگه‌داشتن روی لینک استفاده کن.",
    });
  }

  if (loading) return <main className="grid min-h-[100dvh] place-items-center bg-[#07080d] text-white">در حال بارگذاری همکاری رسانه‌ای...</main>;

  const partner = data?.partner;
  const canApply = !partner || ["draft", "rejected"].includes(partner.status);
  const needsContract = partner?.status === "draft" && !data?.agreement;

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#07080d] pb-28 text-white" dir="rtl">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(124,58,237,.2),transparent_32%),radial-gradient(circle_at_5%_40%,rgba(6,182,212,.08),transparent_25%)]" />
      <header className="relative border-b border-white/[.07] bg-[#0a0b12]/90">
        <div className="mx-auto flex h-18 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/flexa-icon-192.png" alt="Flexa" className="h-11 w-11 object-contain" />
            <div><div className="text-[8px] font-black tracking-[.22em] text-violet-300">GAMENT MEDIA PARTNERS</div><div className="text-sm font-black">همکاری رسانه‌ای</div></div>
          </Link>
          <Link href="/profile" className="mr-auto rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-[10px] font-black text-gray-300">پروفایل</Link>
        </div>
      </header>

      <div className="relative mx-auto max-w-6xl px-4 py-7 sm:px-6">
        <section className="overflow-hidden rounded-[32px] border border-violet-300/15 bg-[linear-gradient(135deg,rgba(124,58,237,.18),rgba(255,255,255,.025))] p-6 sm:p-9">
          <span className="rounded-full border border-violet-300/20 bg-violet-500/10 px-3 py-1.5 text-[9px] font-black text-violet-200">PERFORMANCE-BASED GROWTH</span>
          <h1 className="mt-5 text-3xl font-black leading-[1.45] sm:text-5xl">رسانه‌ات را به شریک درآمدی <span className="text-violet-300">Flexa</span> تبدیل کن</h1>
          <p className="mt-4 max-w-3xl text-xs leading-7 text-gray-400 sm:text-sm">برای هر Match پولی تأییدشده، مجموعاً ۷ هزار USDT کمیسیون رسانه‌ای ثبت می‌شود. انتساب ۳۰ روزه است و پرداخت‌ها فقط پس از Battle Log، دوره بررسی و قرارداد OTPشده انجام می‌شوند.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["۷,۰۰۰", "کمیسیون کل Match"], ["۳۰ روز", "مدت انتساب"], ["۷۲ ساعت", "دوره بررسی"], ["۳۰۰ هزار", "حداقل برداشت"]].map(([value,label]) => <div key={label} className="rounded-2xl border border-white/[.07] bg-black/15 p-3"><strong className="text-lg text-violet-200">{value}</strong><span className="mt-1 block text-[9px] text-gray-600">{label}</span></div>)}
          </div>
        </section>

        {message && <div className={`mt-5 rounded-2xl border p-4 text-sm font-bold ${message.ok ? "border-emerald-300/20 bg-emerald-500/[.08] text-emerald-300" : "border-red-300/20 bg-red-500/[.08] text-red-300"}`}>{message.text}</div>}

        {canApply && !needsContract && (
          <form onSubmit={submitApplication} className="mt-6 rounded-[28px] border border-white/[.08] bg-white/[.025] p-5 sm:p-7">
            <h2 className="text-xl font-black">فرم درخواست همکاری</h2>
            {partner?.status === "rejected" && <p className="mt-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-300">دلیل رد قبلی: {partner.rejectionReason || "نیاز به اصلاح اطلاعات"}</p>}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-gray-400">نام قانونی کامل<input required className={`${inputClass} mt-2`} value={form.legalName} onChange={(e)=>setForm({...form,legalName:e.target.value})} /></label>
              <label className="text-xs text-gray-400">کد ملی<input required inputMode="numeric" maxLength={10} dir="ltr" className={`${inputClass} mt-2 text-left`} value={form.nationalId} onChange={(e)=>setForm({...form,nationalId:e.target.value.replace(/\D/g,"").slice(0,10)})} /></label>
              <label className="text-xs text-gray-400">شماره شبا به نام متقاضی<input required dir="ltr" placeholder="IR000000000000000000000000" className={`${inputClass} mt-2 text-left`} value={form.sheba} onChange={(e)=>setForm({...form,sheba:e.target.value.toUpperCase().replace(/\s/g,"").slice(0,26)})} /></label>
              <label className="text-xs text-gray-400">نام رسانه<input required className={`${inputClass} mt-2`} value={form.mediaName} onChange={(e)=>setForm({...form,mediaName:e.target.value})} /></label>
              <label className="text-xs text-gray-400">نوع رسانه<select className={`${inputClass} mt-2`} value={form.mediaType} onChange={(e)=>setForm({...form,mediaType:e.target.value})}><option value="telegram_channel">کانال تلگرام</option><option value="telegram_group">گروه تلگرام</option><option value="instagram">اینستاگرام</option><option value="youtube">یوتیوب</option><option value="website">وب‌سایت</option><option value="other">سایر</option></select></label>
              <label className="text-xs text-gray-400">تعداد اعضا/دنبال‌کننده<input required inputMode="numeric" dir="ltr" className={`${inputClass} mt-2 text-left`} value={form.followerCount} onChange={(e)=>setForm({...form,followerCount:e.target.value.replace(/\D/g,"")})} /></label>
              <label className="text-xs text-gray-400 sm:col-span-2">آدرس رسانه<input required dir="ltr" placeholder="https://t.me/your_channel" className={`${inputClass} mt-2 text-left`} value={form.mediaUrl} onChange={(e)=>setForm({...form,mediaUrl:e.target.value})} /></label>
              <div className="sm:col-span-2"><ImageUploader purpose="kyc" max={1} value={proof} onChange={setProof} label="مدرک مالکیت یا مدیریت رسانه (اختیاری)" hint="اسکرین‌شات پنل مدیریت یا مدرکی که مالکیت رسانه را نشان دهد." /></div>
            </div>
            <button disabled={busy} className="mt-6 w-full rounded-2xl bg-violet-600 py-3.5 text-sm font-black disabled:opacity-50">{busy ? "در حال ثبت..." : "ذخیره فرم و ورود به قرارداد"}</button>
          </form>
        )}

        {needsContract && contract && (
          <section className="mt-6 rounded-[28px] border border-amber-300/15 bg-white/[.025] p-5 sm:p-7">
            <h2 className="text-xl font-black">قرارداد همکاری رسانه‌ای</h2>
            <p className="mt-2 text-xs text-gray-500">نسخه {contract.version} · هش: <code dir="ltr">{contract.contentHash.slice(0,16)}…</code></p>
            <div className="mt-4 flex justify-end"><button type="button" onClick={()=>window.print()} className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-[10px] font-black text-gray-300">چاپ یا ذخیره PDF قرارداد</button></div>
            <pre className="mt-3 max-h-[520px] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-white/[.08] bg-black/25 p-4 text-xs leading-7 text-gray-300">{contract.content}</pre>
            <div className="mt-5 space-y-2">{contract.confirmations.map((text,index)=><label key={text} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[.06] bg-white/[.025] p-3 text-xs leading-6 text-gray-300"><input type="checkbox" className="mt-1 h-4 w-4 accent-violet-600" checked={confirmations[index]||false} onChange={(e)=>setConfirmations(confirmations.map((v,i)=>i===index?e.target.checked:v))}/><span>{text}</span></label>)}</div>
            <label className="mt-5 block text-xs text-gray-400">نام کامل امضاکننده<input className={`${inputClass} mt-2`} value={signerName} onChange={(e)=>setSignerName(e.target.value)} placeholder={partner.legalName}/></label>
            {!otpSent ? <button onClick={sendOtp} disabled={busy||confirmations.some(v=>!v)} className="mt-4 w-full rounded-2xl bg-amber-500 py-3.5 text-sm font-black text-black disabled:opacity-40">ارسال کد OTP امضای قرارداد</button> : <div className="mt-4"><OtpCodeInput value={otpCode} onChange={setOtpCode} onComplete={()=>{ if(!confirmations.some(v=>!v)) signContract(); }} length={6} disabled={busy} label="کد ۶ رقمی ارسال‌شده به ایمیلت را وارد کن؛ خودکار امضا می‌شود"/>{busy&&<p className="mt-3 text-center text-xs font-bold text-cyan-300">در حال تأیید...</p>}</div>}
          </section>
        )}

        {partner && !["draft", "rejected"].includes(partner.status) && (
          <section className="mt-6 space-y-5">
            <div className="rounded-[28px] border border-white/[.08] bg-white/[.025] p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">{partner.mediaName}</h2><p className="mt-1 text-xs text-gray-500">وضعیت همکاری: <b className="text-violet-300">{statusLabel(partner.status)}</b></p></div>{data?.live ? <span className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black text-emerald-300">LIVE</span> : <span className="rounded-full bg-amber-500/10 px-3 py-1.5 text-[10px] font-black text-amber-300">SHADOW MODE</span>}</div>
              {partner.status === "pending" && <p className="mt-5 rounded-2xl bg-cyan-500/[.07] p-4 text-xs leading-6 text-cyan-200">قرارداد ثبت شده و درخواست در صف بررسی ادمین است. لینک پس از تأیید فعال می‌شود.</p>}
              {partner.status === "active" && <><div className="mt-5 rounded-2xl border border-violet-300/15 bg-violet-500/[.07] p-4"><span className="text-[9px] text-gray-500">لینک اختصاصی</span><code dir="ltr" className="mt-2 block select-all break-all text-xs text-violet-200">{partner.referralLink}</code><button type="button" onClick={()=>copyReferralLink(partner.referralLink)} className="mt-3 rounded-xl bg-violet-600 px-4 py-2 text-[10px] font-black active:scale-95">کپی لینک</button></div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{[[data?.stats?.clicks||0,"کلیک"],[data?.stats?.activeAttributions||0,"انتساب فعال"],[data?.stats?.qualifiedMatches||0,"Match واجد"],[tomanFromRial(totals.available||0),"قابل برداشت"]].map(([value,label])=><div key={label} className="rounded-2xl border border-white/[.07] bg-black/15 p-3"><strong className="block text-lg text-violet-200">{typeof value==='number'?value.toLocaleString('fa-IR'):value}</strong><span className="text-[9px] text-gray-600">{label}</span></div>)}</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-white/[.025] p-3 text-xs">Pending/Shadow: <b>{tomanFromRial(pendingAmount.toString())}</b></div><div className="rounded-2xl bg-white/[.025] p-3 text-xs">پرداخت‌شده: <b>{tomanFromRial(totals.paid||0)}</b></div><button onClick={requestPayout} disabled={busy||!data?.live} className="rounded-2xl bg-emerald-600 p-3 text-xs font-black disabled:opacity-40">درخواست تسویه</button></div></>}
            </div>
            {data?.payouts?.length ? <div className="rounded-[26px] border border-white/[.08] bg-white/[.025] p-5"><h3 className="font-black">سوابق تسویه</h3><div className="mt-3 space-y-2">{data.payouts.map((payout)=><div key={payout.id} className="flex items-center justify-between rounded-xl bg-black/20 p-3 text-xs"><span>{tomanFromRial(payout.amountRial)}</span><span className="text-gray-500">{payout.status}</span></div>)}</div></div> : null}
          </section>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
