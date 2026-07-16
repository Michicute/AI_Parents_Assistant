"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe, UserSummary } from "@/lib/api";
import { clearAccessToken, getAccessToken } from "@/lib/dev-auth";

type AdminSessionProps = {
  children: (accessToken: string, user: UserSummary) => ReactNode;
};

export function AdminSession({ children }: AdminSessionProps) {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    void getMe(token)
      .then((currentUser) => {
        setAccessToken(token);
        setUser(currentUser);
        if (currentUser.role !== "ADMIN") {
          setError("Cần quyền quản trị viên.");
        }
      })
      .catch(() => {
        clearAccessToken();
        router.replace("/login");
      });
  }, [router]);

  if (error) {
    return <div className="rounded-lg border border-coral/30 bg-coral/10 p-4 text-sm font-semibold text-coral">{error}</div>;
  }

  if (!accessToken || !user) {
    return <div className="rounded-lg border border-ink/10 bg-white p-4 text-sm text-ink/60 shadow-panel">Đang tải phiên quản trị...</div>;
  }

  return children(accessToken, user);
}
