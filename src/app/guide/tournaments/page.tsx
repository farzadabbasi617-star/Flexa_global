"use client";

import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";

export default function TournamentGuidePage() {
  return (
    <div className="min-h-screen bg-[#050508] text-white">
      <Navbar />
      <main className="pb-24">
        <div className="max-w-[480px] mx-auto px-6 pt-12">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">🎮</span>
            <h1 className="text-3xl font-black">راهنمای شرکت در تورنومنت</h1>
          </div>
        </div>

        <div className="space-y-8 text-[15px]">
          <div className="glass-panel p-6 rounded-3xl border border-white/10">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <span>۱</span> انتخاب بازی و روم
            </h3>
            <p className="text-sm text-white/75">از صفحه اصلی یا منوی تورنومنت‌ها، بازی مورد نظر (کالاف، فورتنایت، کلش) را انتخاب کنید و لیست روم‌های فعال را ببینید.</p>
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-white/10">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <span>۲</span> پرداخت هزینه ورودی
            </h3>
            <p className="text-sm text-white/75">با موجودی کیف پول خود می‌توانید در روم شرکت کنید. هزینه ورودی از کیف پول کسر می‌شود.</p>
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-white/10">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <span>۳</span> حضور در زمان مسابقه
            </h3>
            <p className="text-sm text-white/75">در زمان اعلام شده در لابی روم حضور داشته باشید و دستورات را دنبال کنید.</p>
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-white/10">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <span>۴</span> آپلود نتایج
            </h3>
            <p className="text-sm text-white/75">پس از پایان مسابقه، اسکرین‌شات یا ویدیوی نتیجه را آپلود کنید تا توسط سیستم داوری بررسی شود.</p>
          </div>
        </div>
      </div>
      </main>

      <BottomNav />
    </div>
  );
}
