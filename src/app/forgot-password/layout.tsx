import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "بازیابی رمز عبور",
  description: "بازیابی امن رمز عبور حساب Flexa با کد یک‌بارمصرف ایمیل.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
