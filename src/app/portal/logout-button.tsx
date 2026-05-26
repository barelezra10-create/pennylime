"use client";

import { useRouter } from "next/navigation";

export function PortalLogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/portal/logout", { method: "POST" });
        router.push("/portal/login");
        router.refresh();
      }}
      className="text-[12px] font-semibold text-[#71717a] hover:text-black"
    >
      Sign out
    </button>
  );
}
