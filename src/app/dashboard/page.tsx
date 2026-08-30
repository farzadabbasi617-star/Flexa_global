"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/profile");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#050508] text-white flex items-center justify-center">
      <div className="text-4xl animate-pulse">⚡</div>
    </div>
  );
}
