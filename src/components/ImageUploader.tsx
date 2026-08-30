"use client";

import { useRef, useState } from "react";

interface ImageUploaderProps {
  purpose: "listing" | "kyc";
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  label?: string;
  hint?: string;
}

/**
 * Reusable image uploader for store listings & KYC documents.
 * Uploads via /api/store/upload (Cloudinary if configured, else inline data-URL)
 * and keeps a list of resulting URLs.
 */
export default function ImageUploader({
  purpose,
  value,
  onChange,
  max = 8,
  label,
  hint,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Downscale + re-encode the picked image to a JPEG so gallery photos
  // (often 3-8MB, sometimes HEIC) fit under the upload limit and are a format
  // the server accepts. Falls back to the original file if anything fails.
  async function compressImage(file: File, targetBytes = 900 * 1024): Promise<File> {
    if (typeof document === "undefined") return file;
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("read failed"));
        fr.readAsDataURL(file);
      });
      const img: HTMLImageElement = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("decode failed"));
        i.src = dataUrl;
      });

      const maxDim = 1600;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, width, height);

      // Try decreasing quality until under the target size.
      for (const q of [0.82, 0.7, 0.6, 0.5, 0.4]) {
        const blob: Blob | null = await new Promise((resolve) =>
          canvas.toBlob((b) => resolve(b), "image/jpeg", q)
        );
        if (blob && blob.size <= targetBytes) {
          return new File([blob], (file.name.replace(/\.[^.]+$/, "") || "image") + ".jpg", { type: "image/jpeg" });
        }
        // Keep the smallest produced even if still slightly over.
        if (blob && q === 0.4) {
          return new File([blob], (file.name.replace(/\.[^.]+$/, "") || "image") + ".jpg", { type: "image/jpeg" });
        }
      }
      return file;
    } catch {
      return file; // server-side limits will catch anything too large
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const remaining = max - value.length;
    if (remaining <= 0) {
      setError(`حداکثر ${max} تصویر مجاز است.`);
      return;
    }
    const toUpload = Array.from(files).slice(0, remaining);
    setBusy(true);
    const uploaded: string[] = [];
    try {
      for (const original of toUpload) {
        const file = await compressImage(original);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("purpose", purpose);
        const res = await fetch("/api/store/upload", {
          method: "POST",
          credentials: "include",
          // validateSession() rejects every mutating request without this
          // header as a CSRF attempt, so omitting it made authenticated
          // uploads fail with "Unauthorized" — which is what the seller
          // verification form hit when attaching a national ID card.
          // Do NOT set Content-Type: the browser must add the multipart
          // boundary for FormData itself.
          headers: { "X-Requested-With": "XMLHttpRequest" },
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "آپلود ناموفق بود.");
          break;
        }
        uploaded.push(data.url);
      }
      if (uploaded.length) onChange([...value, ...uploaded]);
    } catch {
      setError("خطای ارتباط هنگام آپلود.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div>
      {label && <label className="mb-1 block text-xs font-bold text-gray-400">{label}</label>}

      <div className="flex flex-wrap gap-2">
        {value.map((url, idx) => (
          <div key={`${url.slice(0, 24)}-${idx}`} className="relative h-20 w-20 overflow-hidden rounded-2xl border border-white/15">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(idx)}
              className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-xs font-black text-white"
              aria-label="حذف تصویر"
            >
              ×
            </button>
          </div>
        ))}

        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="grid h-20 w-20 place-items-center rounded-2xl border border-dashed border-white/25 bg-white/[0.03] text-2xl text-gray-400 transition hover:border-purple-400/60 disabled:opacity-50"
          >
            {busy ? <span className="text-xs font-bold">...</span> : "＋"}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={max > 1}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {hint && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-[11px] font-bold text-red-400">{error}</p>}
    </div>
  );
}
