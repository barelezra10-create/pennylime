"use client";

import { signOut } from "next-auth/react";

export function SupportSignOut() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/admin/login" })}
      className="text-[#71717a] hover:text-black text-[12px]"
    >
      Sign out
    </button>
  );
}
