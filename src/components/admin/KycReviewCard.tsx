"use client";

import { useState } from "react";
import { gregorianISOToJalaliString, toFaDigits } from "@/lib/jalali";

export interface KycReviewRow {
  id: string;
  userId: string;
  fullName: string;
  nationalId: string;
  birthDate: string | null;
  idCardImageUrl: string;
  selfieImageUrl: string | null;
  status: string;
  rejectionReason?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  displayName: string | null;
  phoneNumber: string | null;
  flexaId: string | null;
  email?: string | null;
  username?: string | null;
  userCreatedAt?: string | null;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: "در انتظار بررسی", className: "border-amber-400/25 bg-amber-400/10 text-amber-200" },
  verified: { label: "تأیید شده", className: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" },
  rejected: { label: "رد شده", className: "border-red-400/25 bg-red-400/10 text-red-200" },
};

/**
 * Format a stored birth date for review.
 *
 * KYC stores the Jalali string the applicant picked ("1375/03/21"), but older
 * rows may hold a Gregorian ISO date. Detect which one we have instead of
 * assuming, so a reviewer never sees a date that is ~621 years wrong.
 */
function formatBirthDate(value: string | null): string {
  if (!value) return "—";
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const jalali = gregorianISOToJalaliString(raw, { monthName: true, digits: "fa" });
    return jalali || raw;
  }
  return toFaDigits(raw);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const iso = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 5);
  const jalali = gregorianISOToJalaliString(iso, { monthName: true, digits: "fa" });
  return `${jalali || iso} — ${toFaDigits(time)}`;
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/[.07] bg-black/20 px-3 py-2.5">
      <div className="text-[9px] font-black tracking-[.12em] text-gray-500">{label}</div>
      <div
        className={`mt-1 truncate text-xs font-bold text-gray-100 ${mono ? "font-mono" : ""}`}
        dir={mono ? "ltr" : undefined}
        title={value}
      >
        {value || "—"}
      </div>
    </div>
  );
}

export default function KycReviewCard({
  row,
  onReview,
  busy = false,
}: {
  row: KycReviewRow;
  onReview: (id: string, decision: "verified" | "rejected") => void;
  busy?: boolean;
}) {
  const [zoom, setZoom] = useState(false);
  const status = STATUS_STYLES[row.status] ?? {
    label: row.status,
    className: "border-white/15 bg-white/5 text-gray-300",
  };

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035]">
      {/* Header: who is applying, and where they stand */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[.07] px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-black text-white">{row.fullName}</h3>
            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${status.className}`}>
              {status.label}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            {row.displayName || row.username || "—"}
            {row.flexaId ? ` · ${row.flexaId}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => onReview(row.id, "verified")}
            disabled={busy || row.status === "verified"}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black transition active:scale-95 hover:bg-emerald-500 disabled:opacity-40"
          >
            تأیید فروشنده
          </button>
          <button
            onClick={() => onReview(row.id, "rejected")}
            disabled={busy || row.status === "rejected"}
            className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black transition active:scale-95 hover:bg-red-500 disabled:opacity-40"
          >
            رد
          </button>
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* Document image — the whole point of the review */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[9px] font-black tracking-[.16em] text-violet-300">تصویر کارت ملی</span>
            <a
              href={row.idCardImageUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-bold text-cyan-300 hover:underline"
            >
              باز کردن در تب جدید ↗
            </a>
          </div>
          <button
            type="button"
            onClick={() => setZoom(true)}
            className="group relative block h-52 w-full overflow-hidden rounded-2xl border border-white/10 bg-black/40"
            aria-label="بزرگ‌نمایی تصویر کارت ملی"
          >
            {/* Uploaded IDs are base64 data URLs when Cloudinary is off, so a
                plain <img> is correct here — next/image cannot optimise those
                and would only add cost. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={row.idCardImageUrl}
              alt={`کارت ملی ${row.fullName}`}
              className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.03]"
              loading="lazy"
              decoding="async"
            />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2 text-[10px] font-bold text-gray-200">
              برای بزرگ‌نمایی کلیک کنید
            </span>
          </button>

          {row.selfieImageUrl && (
            <a
              href={row.selfieImageUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-[10px] font-bold text-cyan-300 hover:underline"
            >
              سلفی بایگانی‌شده (این مورد دیگر دریافت نمی‌شود) ↗
            </a>
          )}
        </div>

        {/* Everything a reviewer needs to cross-check the document */}
        <div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="نام کامل (طبق مدرک)" value={row.fullName} />
            <Field label="کد ملی" value={toFaDigits(row.nationalId)} mono />
            <Field label="تاریخ تولد" value={formatBirthDate(row.birthDate)} />
            <Field label="شماره موبایل" value={row.phoneNumber ? toFaDigits(row.phoneNumber) : "—"} mono />
            <Field label="ایمیل" value={row.email || "—"} mono />
            <Field label="شناسه Flexa" value={row.flexaId || "—"} mono />
            <Field label="تاریخ ارسال مدارک" value={formatDateTime(row.submittedAt)} />
            <Field label="عضویت در Flexa" value={formatDateTime(row.userCreatedAt)} />
          </div>

          {row.status === "rejected" && row.rejectionReason && (
            <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-500/[.07] px-4 py-3">
              <div className="text-[9px] font-black tracking-[.12em] text-red-300">دلیل رد قبلی</div>
              <p className="mt-1 text-xs leading-6 text-red-100/90">{row.rejectionReason}</p>
            </div>
          )}

          <p className="mt-3 text-[10px] leading-5 text-gray-600">
            پیش از تأیید، نام و کد ملی روی تصویر را با فیلدهای بالا مطابقت دهید. تصویر باید خوانا و بدون
            برش باشد.
          </p>
        </div>
      </div>

      {/* Full-screen viewer: national ID text is unreadable in a thumbnail */}
      {zoom && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoom(false)}
          role="dialog"
          aria-modal="true"
          aria-label="نمایش کامل تصویر کارت ملی"
        >
          <button
            onClick={() => setZoom(false)}
            className="absolute right-5 top-5 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white"
          >
            بستن ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={row.idCardImageUrl}
            alt={`کارت ملی ${row.fullName}`}
            className="max-h-full max-w-full rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
