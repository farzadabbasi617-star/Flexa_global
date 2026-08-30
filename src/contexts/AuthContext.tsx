"use client";

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface User {
  id: string;
  email: string | null;
  phoneNumber: string;
  phoneVerifiedAt: string | null;
  emailVerifiedAt?: string | null;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName: string;
  flexaId: string;
  role: string;
  avatarUrl: string | null;
  isVerified: boolean;
  level: number;
  rankPoints: number;
  xp: number;
  clashRoyaleId: string | null;
  clashRoyaleUsername: string | null;
  codMobileId: string | null;
  codMobileUsername: string | null;
  codMobileRegion: "global" | "garena";
  codMobileStatus: "unlinked" | "pending" | "verified" | "rejected" | null;
  fortniteId: string | null;
  fortniteUsername: string | null;
  // Age-gate fields — used by the UI to disable paid actions client-side.
  // Server always re-checks via checkAgeGate() so the client copy is only
  // for UX, never for authorisation.
  birthDate?: string | null;
  nationalId?: string | null;
  metadata?: any;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string; pendingVerification?: boolean; email?: string }>;
  register: (
    phoneNumber: string,
    email: string,
    username: string,
    password: string,
    firstName: string,
    lastName: string,
    birthDate: string,
    nationalId: string,
    termsAccepted: boolean,
    riskAndAgeAccepted: boolean
  ) => Promise<{ success: boolean; pendingVerification?: boolean; email?: string; error?: string }>;
  verifyEmailOtp: (email: string, code: string) => Promise<{ success: boolean; error?: string }>;
  resendEmailOtp: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const csrfHeaders = {
  "X-Requested-With": "XMLHttpRequest",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);

  const { data: sessionData, isLoading: isSessionLoading, refetch: refetchSession } = useQuery({
    queryKey: ["auth-session"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("No active session");
      const data = await res.json();
      return data.user as User | null;
    },
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const currentUser = sessionData || user;

  const refreshUser = useCallback(async () => {
    const result = await refetchSession();
    setUser(result.data ?? null);
  }, [refetchSession]);

  // Telegram Mini App seamless auto-login hook
  useEffect(() => {
    if (typeof window !== "undefined" && !isSessionLoading && !sessionData && !user) {
      const tg = (window as any).Telegram?.WebApp;
      if (tg && tg.initData) {
        console.log("Telegram Mini App detected. Attempting secure auto-login...");
        fetch("/api/auth/telegram-login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify({ initData: tg.initData }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.user) {
              console.log("Flexa seamless Telegram auto-login successful!");
              setUser(data.user);
              queryClient.setQueryData(["auth-session"], data.user);
              refetchSession();
            }
          })
          .catch((err) => {
            console.error("Telegram auto-login failed:", err);
          });
      }
    }
  }, [sessionData, user, isSessionLoading, queryClient, refetchSession]);

  async function login(identifier: string, password: string, rememberMe = true) {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders },
        credentials: "include",
        body: JSON.stringify({ emailOrUsername: identifier, password, rememberMe }),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          error: data.error || "ورود ناموفق بود",
          pendingVerification: data.pendingVerification,
          email: data.email,
        };
      }

      setUser(data.user);
      queryClient.setQueryData(["auth-session"], data.user);
      return { success: true };
    } catch {
      return { success: false, error: "Login failed" };
    }
  }

  async function register(
    phoneNumber: string,
    email: string,
    username: string,
    password: string,
    firstName: string,
    lastName: string,
    birthDate: string,
    nationalId: string,
    termsAccepted: boolean,
    riskAndAgeAccepted: boolean
  ) {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders },
        credentials: "include",
        body: JSON.stringify({ phoneNumber, email, username, password, firstName, lastName, birthDate, nationalId, termsAccepted, riskAndAgeAccepted }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || "ثبت‌نام با خطا مواجه شد" };
      }

      // Registration no longer logs the user in directly — an email OTP
      // must be confirmed first via verifyEmailOtp().
      return { success: true, pendingVerification: true, email: data.email };
    } catch {
      return { success: false, error: "خطای ارتباط با سرور. اتصال اینترنت را بررسی کنید." };
    }
  }

  async function verifyEmailOtp(email: string, code: string) {
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders },
        credentials: "include",
        body: JSON.stringify({ email, code }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || "تایید کد ناموفق بود" };
      }

      setUser(data.user);
      queryClient.setQueryData(["auth-session"], data.user);
      return { success: true };
    } catch {
      return { success: false, error: "خطای ارتباط با سرور. اتصال اینترنت را بررسی کنید." };
    }
  }

  async function resendEmailOtp(email: string) {
    try {
      const res = await fetch("/api/auth/resend-email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders },
        credentials: "include",
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || "ارسال مجدد کد ناموفق بود" };
      }

      return { success: true };
    } catch {
      return { success: false, error: "خطای ارتباط با سرور. اتصال اینترنت را بررسی کنید." };
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: csrfHeaders,
        credentials: "include",
      });
    } catch {
      // ignore
    }
    setUser(null);
    queryClient.setQueryData(["auth-session"], null);
  }

  return (
    <AuthContext.Provider
      value={{
        user: currentUser,
        loading: isSessionLoading,
        login,
        register,
        verifyEmailOtp,
        resendEmailOtp,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
