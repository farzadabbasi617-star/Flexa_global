import Link from "next/link";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import TiltCard from "@/components/fx/TiltCard";
import Reveal from "@/components/fx/Reveal";
import { gameLandings } from "@/lib/game-landing";

export default function GamesPage() {
  return (
    <div className="min-h-screen bg-[#050508] text-white">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-12 pb-28" dir="rtl">
        <Reveal>
          <header className="text-right mb-8">
            <h1 className="text-3xl sm:text-5xl font-black mb-4">مسابقات بازی‌های محبوب</h1>
            <p className="text-gray-300 leading-8 max-w-3xl">
              صفحه‌های اختصاصی تورنومنت‌های Flexa برای کالاف دیوتی موبایل، فورتنایت و کلش رویال؛ هر صفحه شامل راهنمای شرکت، سوالات پرتکرار و لینک مستقیم مسابقات فعال است.
            </p>
          </header>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {gameLandings.map((game, i) => (
            <Reveal key={game.slug} delay={i * 0.08}>
              <TiltCard maxTilt={9} liftZ={16} className="rounded-3xl">
                <Link href={`/games/${game.slug}`} className="gaming-card p-6 rounded-3xl border border-white/5 hover:border-purple-400/30 transition block text-right">
                  <img src={game.icon} alt={game.title} className="w-16 h-16 object-contain mb-5" style={{ transform: "translateZ(24px)" }} loading="lazy" decoding="async" />
                  <h2 className="text-xl font-black mb-3" style={{ transform: "translateZ(16px)" }}>{game.title}</h2>
                  <p className="text-sm text-gray-400 leading-7">{game.shortDescription}</p>
                </Link>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
