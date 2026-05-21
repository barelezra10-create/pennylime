"use client";

import { signOutPartnerAction } from "./actions";

export function PartnerLogoutButton() {
  return (
    <form action={signOutPartnerAction}>
      <button type="submit" className="text-[12px] text-[#71717a] hover:text-black">
        Sign out
      </button>
    </form>
  );
}
