"use client";

import Navbar from "@/components/Navbar";
import { channelHandle, channelUrl } from "@/lib/telegram-channel";
import BottomNav from "@/components/BottomNav";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[#050508] text-white">
      <Navbar />
      <main className="pb-24">
        <div className="max-w-[480px] mx-auto px-6 pt-12">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">📬</span>
            <h1 className="text-3xl font-black">تماس با ما</h1>
          </div>
          <p className="text-sm text-white/60">ما همیشه در دسترس هستیم</p>
        </div>

        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-3xl border border-white/10">
            <div className="flex items-start gap-4">
              <span className="text-2xl mt-0.5">✉️</span>
              <div>
                <div className="font-bold mb-1">ایمیل پشتیبانی</div>
                <a href="mailto:support@flexa1.ir" className="text-purple-400 hover:underline">
                  support@flexa1.ir
                </a>
              </div>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-white/10">
            <div className="flex items-start gap-4">
              <span className="text-2xl mt-0.5">📱</span>
              <div>
                <div className="font-bold mb-1">تلگرام</div>
                <a href={channelUrl(process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL)} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
                  {channelHandle(process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL)}
                </a>
              </div>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-white/10">
            <div className="flex items-start gap-4">
              <span className="text-2xl mt-0.5">📷</span>
              <div>
                <div className="font-bold mb-1">اینستاگرام</div>
                <a href="https://instagram.com/flexa" target="_blank" className="text-purple-400 hover:underline">
                  @flexa
                </a>
              </div>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-white/10">
            <div className="flex items-start gap-4">
              <span className="text-2xl mt-0.5">💬</span>
              <div>
                <div className="font-bold mb-1">چت داخل اپلیکیشن</div>
                <p className="text-sm text-white/70">از بخش پروفایل → پشتیبانی می‌توانید مستقیماً با تیم ما چت کنید.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 text-center text-xs text-white/40">
          معمولاً در کمتر از ۲ ساعت پاسخگو هستیم
        </div>
      </div>
      </main>

      <BottomNav />
    </div>
  );
}
