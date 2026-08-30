"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadNotifications } from "@/contexts/UnreadNotificationsContext";
import AppImage from "@/components/AppImage";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, t } = useLanguage();
  const { user, loading, logout } = useAuth();
  const { unreadCount: unreadNotifications, refresh: refreshUnread } = useUnreadNotifications();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";


  const navItems = [
    { href: "/", label: t.nav.home, icon: "🏠" },
    { href: "/tournaments", label: t.nav.tournaments, icon: "🏆" },
    { href: "/cod-arena", label: "COD Arena", icon: "🎯" },
    { href: "/store", label: "Store", icon: "🛒" },
    { href: "/leaderboard", label: t.nav.leaderboard, icon: "📊" },
    { href: "/judging", label: t.nav.judging, icon: "⚖️" },
    { href: "/teams", label: t.teamsPage.title, icon: "🛡️" },
    { href: "/achievements", label: t.achievementsPage.title, icon: "🏅" },
    { href: "/referrals", label: "Invite & Earn", icon: "🎁" },
  ];

  if (isAdmin) {
    navItems.push({ href: "/admin", label: "Admin Panel", icon: "👑" });
  }

  async function handleLogout() {
    await logout();
    setShowUserMenu(false);
    router.push("/");
  }

  return (
    <nav className="sticky top-0 z-50 bg-dark-950/80 backdrop-blur-xl border-b border-gaming-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-11 h-11 rounded-2xl overflow-hidden border border-neon-purple/30 bg-dark-900 shadow-lg shadow-neon-purple/25 group-hover:scale-110 transition-transform flex items-center justify-center text-xl font-black text-neon-purple">
              ⚡
            </div>
            <span className="text-2xl font-black tracking-tighter text-white">
              FLEXA<span className="text-neon-purple"> ARENA</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-2">
            {navItems.map((item) => {
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${
                    isActive
                      ? "bg-neon-purple text-white shadow-lg shadow-neon-purple/40"
                      : "text-gray-400 hover:text-white hover:bg-dark-800"
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* Language Switcher */}
            <div className="ms-2 flex items-center bg-dark-800 rounded-full p-1 border border-gaming-border">
              <button
                onClick={() => setLang("en")}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${lang === "en" ? "bg-neon-purple text-white" : "text-gray-400 hover:text-white"}`}
                title="English"
              >
                🇬🇧
              </button>
              <button
                onClick={() => setLang("ar")}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${lang === "ar" ? "bg-neon-purple text-white" : "text-gray-400 hover:text-white"}`}
                title="العربية"
              >
                🇸🇦
              </button>
            </div>

            {/* User/Auth */}
            <div className="ms-4 border-s border-gaming-border ps-4">
              {loading ? (
                <div className="w-10 h-10 rounded-full bg-dark-800 animate-pulse" />
              ) : user ? (
                <div className="relative">
                  <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-dark-800 hover:bg-dark-700 transition-all border border-gaming-border">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isAdmin ? "bg-gradient-to-br from-neon-pink to-neon-orange" : "bg-gradient-to-br from-neon-purple to-neon-blue"}`}>
                      {isAdmin ? "👑" : user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-bold hidden xl:block">{user.displayName}</span>
                    <span className="text-gray-500 text-[10px]">▼</span>
                    {unreadNotifications > 0 && <span className="absolute -top-1 -end-1 min-w-5 h-5 rounded-full bg-red-500 px-1.5 text-[10px] font-black text-white grid place-items-center">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}
                  </button>

                  {showUserMenu && (
                    <div className="absolute end-0 mt-3 w-60 bg-dark-900 border border-gaming-border rounded-2xl shadow-2xl py-2 z-50 overflow-hidden">
                      <div className="px-4 py-3 bg-dark-800/50 border-b border-gaming-border">
                        <p className="text-xs text-gray-400">{lang === "fa" ? "حساب کاربری" : "User Account"}</p>
                        <p className="text-sm font-bold text-white truncate">{user.displayName}</p>
                      </div>
                      <div className="p-1">
                        <Link href="/profile" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-neon-purple/10 hover:text-neon-purple rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                          <span>👤</span> {lang === "fa" ? "پروفایل من" : "My Profile"}
                        </Link>
                        <Link href="/profile/edit" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-neon-purple/10 hover:text-neon-purple rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                          <span>🎮</span> {t.auth.gameIds}
                        </Link>
                        <Link href="/notifications" className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-neon-purple/10 hover:text-neon-purple rounded-xl transition-all" onClick={() => { setShowUserMenu(false); setTimeout(refreshUnread, 1200); }}>
                          <span className="flex items-center gap-3"><span>🔔</span> {t.notif.title}</span>
                          {unreadNotifications > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}
                        </Link>
                        <Link href="/referrals" className="flex items-center gap-3 px-4 py-2.5 text-sm text-cyan-300 hover:bg-cyan-500/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                          <span>🎁</span> {lang === "fa" ? "دعوت دوستان و درآمد" : "Invite & Earn"}
                        </Link>
                        <Link href="/support" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-neon-purple/10 hover:text-neon-purple rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                          <span>🎧</span> پشتیبانی
                        </Link>
                        <Link href="/profile/security" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-neon-purple/10 hover:text-neon-purple rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                          <span>🔐</span> امنیت حساب
                        </Link>

                        {isAdmin && (
                          <>
                            <div className="my-2 px-4 py-1">
                              <span className="text-[10px] uppercase tracking-widest text-neon-pink font-black">Admin Panel</span>
                            </div>
                            <Link href="/admin" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>📊</span> {lang === "fa" ? "داشبورد مدیریت" : "Admin Dashboard"}
                            </Link>
                            <Link href="/admin/images" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🖼️</span> {lang === "fa" ? "تصاویر" : "Images"}
                            </Link>
                            <Link href="/admin/users" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>👥</span> {lang === "fa" ? "کاربران" : "Users"}
                            </Link>
                            <Link href="/admin/settings" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>⚙️</span> {lang === "fa" ? "تنظیمات" : "Settings"}
                            </Link>
                            <Link href="/admin/customize" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🎨</span> {lang === "fa" ? "شخصی‌سازی ظاهر" : "Customize UI"}
                            </Link>
                            <Link href="/admin/tournaments" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🏆</span> مدیریت تورنومنت‌ها
                            </Link>
                            <Link href="/admin/cod-arena" className="flex items-center gap-3 px-4 py-2.5 text-sm text-orange-300 hover:bg-orange-500/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🎯</span> عملیات COD Arena
                            </Link>
                            <Link href="/admin/cod-profiles" className="flex items-center gap-3 px-4 py-2.5 text-sm text-emerald-300 hover:bg-emerald-500/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>✅</span> تأیید UID کالاف
                            </Link>
                            <Link href="/admin/cod-reports" className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-300 hover:bg-red-500/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🚨</span> گزارش‌ها و جریمه‌های COD
                            </Link>
                            <Link href="/admin/matches" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>⚔️</span> مدیریت مسابقات
                            </Link>
                            <Link href="/admin/judgments" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>⚖️</span> مدیریت داوری‌ها
                            </Link>
                            <Link href="/admin/disputes" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🚨</span> اعتراضات
                            </Link>
                            <Link href="/admin/wallets" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>💳</span> کیف پول کاربران
                            </Link>
                            <Link href="/admin/finance" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>📈</span> گزارش مالی
                            </Link>
                            <Link href="/admin/prizes" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🏆</span> پرداخت جایزه
                            </Link>
                            <Link href="/admin/notifications" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🔔</span> اعلان‌ها
                            </Link>
                            <Link href="/admin/support" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🎧</span> پشتیبانی
                            </Link>
                            <Link href="/admin/audit" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🧾</span> لاگ مدیران
                            </Link>
                            <Link href="/admin/maintenance" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🧹</span> نگهداری سیستم
                            </Link>
                            <Link href="/admin/ai" className="flex items-center gap-3 px-4 py-2.5 text-sm text-neon-pink hover:bg-neon-pink/10 rounded-xl transition-all" onClick={() => setShowUserMenu(false)}>
                              <span>🤖</span> {lang === "fa" ? "هوش مصنوعی" : "AI"}
                            </Link>
                          </>
                        )}
                        <div className="mt-2 pt-2 border-t border-gaming-border">
                          <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-all w-full text-start">
                            <span>🚪</span> {t.auth.logout}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Link href="/login" className="px-4 py-2 rounded-full text-sm font-bold text-gray-400 hover:text-white transition-all">{t.auth.login}</Link>
                  <Link href="/register" className="px-5 py-2 rounded-full text-sm font-bold bg-neon-purple text-white shadow-lg shadow-neon-purple/30 hover:bg-neon-purple/80 transition-all">
                    {t.auth.register}
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Top Navigation Menu - Premium Uniform Icons (No Duplicates!) */}
          <div className="lg:hidden flex items-center gap-1.5">
            {navItems.slice(0, 5).map((item) => {
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              
              const customIcons: Record<string, string> = {
                "/tournaments": "/icons/honors_icon.webp",
                "/cod-arena": "/icons/icon-cod-arena.png",
                "/leaderboard": "/icons/rankings_icon.webp",
                "/judging": "/icons/icon-judging.png", // Exclusive custom neon gavel/scale icon!
                "/teams": "/icons/icon-teams.png",     // Exclusive custom neon guild shield icon!
                "/admin": "/icons/profile_admin.png",
              };
              const finalIconUrl = customIcons[item.href];

              return (
                <Link 
                  key={item.href} 
                  href={item.href} 
                  className={`p-1.5 rounded-xl transition-all flex items-center justify-center border ${
                    isActive 
                      ? "bg-neon-purple/20 border-neon-purple/30 shadow-[0_0_10px_rgba(168,85,247,0.15)] text-white" 
                      : "border-transparent text-gray-400 hover:bg-dark-800"
                  }`} 
                  title={item.label}
                >
                  {finalIconUrl ? (
                    <AppImage
                      src={finalIconUrl}
                      alt={item.label}
                      width={24}
                      height={24}
                      className={`w-6 h-6 object-contain ${isActive ? "drop-shadow-[0_0_8px_#bc00ff]" : "opacity-60"}`}
                    />
                  ) : (
                    <span className="text-lg">{item.icon}</span>
                  )}
                </Link>
              );
            })}
            {user ? (
              <Link href="/profile" className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${isAdmin ? "bg-gradient-to-br from-neon-pink to-neon-orange shadow-[0_0_15px_rgba(244,63,94,0.3)]" : "bg-gradient-to-br from-neon-purple to-neon-blue shadow-[0_0_15px_rgba(188,0,255,0.3)]"}`}>
                {isAdmin ? "👑" : user.displayName.charAt(0).toUpperCase()}
              </Link>
            ) : (
              <Link href="/login" className="text-lg p-2 rounded-xl hover:bg-dark-800 text-gray-400">👤</Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
