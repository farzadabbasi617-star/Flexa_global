"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { validateCryptoAddress, formatCryptoAmount } from "@/lib/crypto-wallet";

interface Transaction {
  id: string;
  amount: number;
  currency: string;
  type: "deposit" | "withdrawal" | "tournament_win" | "entry_fee" | "refund";
  status: "completed" | "pending" | "failed";
  network?: string;
  txHash?: string;
  createdAt: string;
}

export default function GlobalWalletPage() {
  const { user } = useAuth();
  const { lang, dir } = useLanguage();

  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw" | "history">("deposit");
  const [selectedCurrency, setSelectedCurrency] = useState<"USDT_TRC20" | "USDT_TON" | "STARS">("USDT_TRC20");
  
  // Withdrawal Form
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawNetwork, setWithdrawNetwork] = useState<"TRC20" | "TON">("TRC20");
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawSuccess, setWithdrawSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Copied state
  const [copied, setCopied] = useState(false);

  // Deposit Addresses (Configurable via ENV or fallback demo)
  const depositAddresses = {
    USDT_TRC20: process.env.NEXT_PUBLIC_USDT_TRC20_ADDRESS || "TX7N2bK9mP4wQ1zR8vL3S5uY2eX6aB9cD0",
    USDT_TON: process.env.NEXT_PUBLIC_TON_WALLET_ADDRESS || "EQD3a92bK8vM1zR4wQ7nL2sP5uY8eX1aB9c",
    STARS: `@${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "FlexaArenaBot"}`,
  };

  const currentDepositAddr = depositAddresses[selectedCurrency];

  function copyAddress() {
    navigator.clipboard.writeText(currentDepositAddr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleWithdrawSubmit(e: React.FormEvent) {
    e.preventDefault();
    setWithdrawError("");
    setWithdrawSuccess("");

    const amountNum = parseFloat(withdrawAmount);
    if (isNaN(amountNum) || amountNum < 5) {
      setWithdrawError(lang === "ar" ? "الحد الأدنى للسحب هو 5 USDT" : "Minimum withdrawal amount is $5 USDT.");
      return;
    }

    const isValid = validateCryptoAddress(withdrawAddress, withdrawNetwork);
    if (!isValid) {
      setWithdrawError(
        lang === "ar"
          ? "عنوان المحفظة غير صالح لشبكة " + withdrawNetwork
          : `Invalid ${withdrawNetwork} wallet address format.`
      );
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setWithdrawSuccess(
        lang === "ar"
          ? "تم تقديم طلب السحب بنجاح! سيتم المعالجة خلال 15 دقيقة."
          : "Withdrawal request submitted successfully! Processing within 15 minutes."
      );
      setWithdrawAddress("");
      setWithdrawAmount("");
    }, 1200);
  }

  // Sample transactions
  const sampleTransactions: Transaction[] = [
    {
      id: "tx-101",
      amount: 50.0,
      currency: "USDT",
      type: "tournament_win",
      status: "completed",
      network: "TRC20",
      createdAt: "2026-08-29 18:30 UTC",
    },
    {
      id: "tx-100",
      amount: -10.0,
      currency: "USDT",
      type: "entry_fee",
      status: "completed",
      createdAt: "2026-08-29 14:00 UTC",
    },
    {
      id: "tx-099",
      amount: 100.0,
      currency: "USDT",
      type: "deposit",
      status: "completed",
      network: "TRC20",
      createdAt: "2026-08-28 10:15 UTC",
    },
  ];

  return (
    <div className="min-h-screen bg-[#050508] text-white selection:bg-purple-500/30" dir={dir}>
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="text-xs font-black tracking-widest text-cyan-400 uppercase mb-1">
            FLEXA ARENA
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white">
            {lang === "ar" ? "المحفظة الرقمية" : "Crypto & Digital Wallet"}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {lang === "ar"
              ? "إدارة رصيد التتر (USDT)، شبكة TON والمكافآت السريعة"
              : "Manage your USDT, TON, and Telegram Stars balance with instant payouts."}
          </p>
        </div>

        {/* Balance Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="p-6 rounded-3xl bg-gradient-to-br from-purple-900/30 via-dark-900 to-dark-950 border border-purple-500/20 shadow-xl">
            <div className="flex items-center justify-between text-xs font-bold text-gray-400 mb-2">
              <span>{lang === "ar" ? "إجمالي الرصيد" : "Total Balance"}</span>
              <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full text-[10px]">
                USDT
              </span>
            </div>
            <div className="text-3xl font-black text-white">$140.00 <span className="text-sm font-normal text-purple-300">USDT</span></div>
            <div className="text-[11px] text-gray-400 mt-2">≈ $140.00 USD</div>
          </div>

          <div className="p-6 rounded-3xl bg-gradient-to-br from-cyan-900/30 via-dark-900 to-dark-950 border border-cyan-500/20 shadow-xl">
            <div className="flex items-center justify-between text-xs font-bold text-gray-400 mb-2">
              <span>{lang === "ar" ? "رصيد شبكة TON" : "TON Balance"}</span>
              <span className="text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full text-[10px]">
                TON
              </span>
            </div>
            <div className="text-3xl font-black text-white">25.50 <span className="text-sm font-normal text-cyan-300">TON</span></div>
            <div className="text-[11px] text-gray-400 mt-2">≈ $132.60 USD</div>
          </div>

          <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-900/30 via-dark-900 to-dark-950 border border-amber-500/20 shadow-xl">
            <div className="flex items-center justify-between text-xs font-bold text-gray-400 mb-2">
              <span>{lang === "ar" ? "نجوم تلغرام" : "Telegram Stars"}</span>
              <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full text-[10px]">
                XTR
              </span>
            </div>
            <div className="text-3xl font-black text-amber-300">⭐ 500</div>
            <div className="text-[11px] text-gray-400 mt-2">In-App Telegram Stars</div>
          </div>
        </div>

        {/* Action Tabs */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-4 mb-8">
          <button
            onClick={() => setActiveTab("deposit")}
            className={`px-5 py-2.5 rounded-2xl text-sm font-bold transition-all ${
              activeTab === "deposit"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            📥 {lang === "ar" ? "إيداع" : "Deposit"}
          </button>
          <button
            onClick={() => setActiveTab("withdraw")}
            className={`px-5 py-2.5 rounded-2xl text-sm font-bold transition-all ${
              activeTab === "withdraw"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            📤 {lang === "ar" ? "سحب" : "Withdraw"}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-5 py-2.5 rounded-2xl text-sm font-bold transition-all ${
              activeTab === "history"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            📜 {lang === "ar" ? "سجل المعاملات" : "Transactions"}
          </button>
        </div>

        {/* Deposit Tab */}
        {activeTab === "deposit" && (
          <div className="p-6 sm:p-8 rounded-3xl bg-dark-900 border border-white/10">
            <h2 className="text-xl font-black text-white mb-4">
              {lang === "ar" ? "اختر طريقة الإيداع" : "Select Deposit Currency & Network"}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <button
                onClick={() => setSelectedCurrency("USDT_TRC20")}
                className={`p-4 rounded-2xl border text-start transition-all ${
                  selectedCurrency === "USDT_TRC20"
                    ? "border-purple-500 bg-purple-500/10 text-white"
                    : "border-white/10 bg-dark-800/50 text-gray-400 hover:text-white"
                }`}
              >
                <div className="font-bold text-sm">USDT (TRC-20)</div>
                <div className="text-[10px] text-gray-400 mt-1">Tron Network • Low Fee</div>
              </button>

              <button
                onClick={() => setSelectedCurrency("USDT_TON")}
                className={`p-4 rounded-2xl border text-start transition-all ${
                  selectedCurrency === "USDT_TON"
                    ? "border-cyan-500 bg-cyan-500/10 text-white"
                    : "border-white/10 bg-dark-800/50 text-gray-400 hover:text-white"
                }`}
              >
                <div className="font-bold text-sm">USDT (TON)</div>
                <div className="text-[10px] text-gray-400 mt-1">TON Network • Instant</div>
              </button>

              <button
                onClick={() => setSelectedCurrency("STARS")}
                className={`p-4 rounded-2xl border text-start transition-all ${
                  selectedCurrency === "STARS"
                    ? "border-amber-500 bg-amber-500/10 text-white"
                    : "border-white/10 bg-dark-800/50 text-gray-400 hover:text-white"
                }`}
              >
                <div className="font-bold text-sm">⭐ Telegram Stars</div>
                <div className="text-[10px] text-gray-400 mt-1">In-App Pay</div>
              </button>
            </div>

            {/* Address Box */}
            <div className="p-5 rounded-2xl bg-dark-800 border border-white/10 mb-6">
              <div className="text-xs font-bold text-gray-400 mb-2">
                {lang === "ar" ? "عنوان الإيداع الخاص بك:" : "Your Deposit Address / Identifier:"}
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  readOnly
                  value={currentDepositAddr}
                  className="w-full bg-dark-950 border border-white/10 rounded-xl px-4 py-3 text-xs sm:text-sm font-mono text-cyan-300 focus:outline-none"
                />
                <button
                  onClick={copyAddress}
                  className="px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold whitespace-nowrap transition-all"
                >
                  {copied ? (lang === "ar" ? "تم النسخ! ✓" : "Copied! ✓") : (lang === "ar" ? "نسخ" : "Copy")}
                </button>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200 leading-6">
              💡 {lang === "ar"
                ? "يتم إضافة الرصيد إلى حسابك فور تأكيد المعاملة روی البلوكشين (عادةً خلال ۱ إلى ۳ دقائق)."
                : "Funds are automatically credited to your wallet once confirmed on the blockchain (usually 1-3 minutes)."}
            </div>
          </div>
        )}

        {/* Withdraw Tab */}
        {activeTab === "withdraw" && (
          <div className="p-6 sm:p-8 rounded-3xl bg-dark-900 border border-white/10">
            <h2 className="text-xl font-black text-white mb-4">
              {lang === "ar" ? "طلب سحب الأرباح" : "Withdraw Crypto Funds"}
            </h2>

            {withdrawSuccess && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold mb-6">
                {withdrawSuccess}
              </div>
            )}

            {withdrawError && (
              <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold mb-6">
                {withdrawError}
              </div>
            )}

            <form onSubmit={handleWithdrawSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-2">
                  {lang === "ar" ? "شبكة السحب" : "Withdrawal Network"}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setWithdrawNetwork("TRC20")}
                    className={`py-3 rounded-xl border text-xs font-bold transition-all ${
                      withdrawNetwork === "TRC20"
                        ? "border-purple-500 bg-purple-500/20 text-white"
                        : "border-white/10 bg-dark-800 text-gray-400"
                    }`}
                  >
                    USDT (TRC-20)
                  </button>
                  <button
                    type="button"
                    onClick={() => setWithdrawNetwork("TON")}
                    className={`py-3 rounded-xl border text-xs font-bold transition-all ${
                      withdrawNetwork === "TON"
                        ? "border-cyan-500 bg-cyan-500/20 text-white"
                        : "border-white/10 bg-dark-800 text-gray-400"
                    }`}
                  >
                    TON Network
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-2">
                  {lang === "ar" ? "عنوان المحفظة الخارجیة" : "Destination Wallet Address"}
                </label>
                <input
                  type="text"
                  placeholder={withdrawNetwork === "TRC20" ? "T..." : "EQ..."}
                  value={withdrawAddress}
                  onChange={(e) => setWithdrawAddress(e.target.value)}
                  className="w-full bg-dark-950 border border-white/10 rounded-xl px-4 py-3 text-xs sm:text-sm font-mono text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-2">
                  {lang === "ar" ? "المبلغ (USDT)" : "Amount (USDT)"}
                </label>
                <input
                  type="number"
                  placeholder="Min 5 USDT"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full bg-dark-950 border border-white/10 rounded-xl px-4 py-3 text-xs sm:text-sm font-mono text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-bold text-white transition-all shadow-lg shadow-purple-600/30 disabled:opacity-50"
              >
                {isSubmitting
                  ? (lang === "ar" ? "جاري المعالجة..." : "Processing...")
                  : (lang === "ar" ? "تأكيد طلب السحب" : "Submit Withdrawal Request")}
              </button>
            </form>
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="p-6 sm:p-8 rounded-3xl bg-dark-900 border border-white/10">
            <h2 className="text-xl font-black text-white mb-6">
              {lang === "ar" ? "سجل المعاملات الأخير" : "Recent Transactions"}
            </h2>

            <div className="space-y-3">
              {sampleTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-4 rounded-2xl bg-dark-800/60 border border-white/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-lg">
                      {tx.type === "tournament_win" ? "🏆" : tx.type === "deposit" ? "📥" : "🎮"}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white capitalize">
                        {tx.type.replace("_", " ")}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{tx.createdAt}</div>
                    </div>
                  </div>

                  <div className="text-end">
                    <div
                      className={`text-sm font-black ${
                        tx.amount > 0 ? "text-emerald-400" : "text-gray-200"
                      }`}
                    >
                      {tx.amount > 0 ? `+${tx.amount}` : tx.amount} {tx.currency}
                    </div>
                    <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold mt-1">
                      {tx.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
