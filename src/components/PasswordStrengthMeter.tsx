"use client";

import { checkPasswordRules, passwordStrengthScore } from "@/lib/password-strength";

export default function PasswordStrengthMeter({ password, lang }: { password: string; lang: "fa" | "en" }) {
  const rules = checkPasswordRules(password);
  const score = passwordStrengthScore(password);

  const barColor =
    score < 0.41 ? "bg-red-500" : score < 0.8 ? "bg-yellow-400" : score < 1 ? "bg-lime-400" : "bg-emerald-500";

  const labelFa = score < 0.41 ? "ضعیف" : score < 0.8 ? "متوسط" : score < 1 ? "خوب" : "قوی";
  const labelEn = score < 0.41 ? "Weak" : score < 0.8 ? "Fair" : score < 1 ? "Good" : "Strong";

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-dark-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${Math.max(score * 100, 6)}%` }}
          />
        </div>
        <span className="text-[11px] font-bold text-gray-400 whitespace-nowrap">
          {lang === "fa" ? labelFa : labelEn}
        </span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
        {rules.map((rule) => (
          <li
            key={rule.key}
            className={`text-[11px] flex items-center gap-1.5 transition-colors ${
              rule.passed ? "text-emerald-400" : "text-gray-500"
            }`}
          >
            <span>{rule.passed ? "✓" : "○"}</span>
            <span>{lang === "fa" ? rule.labelFa : rule.labelEn}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
