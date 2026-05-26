import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Apply for a Cash Advance | PennyLime",
  description:
    "Apply for a PennyLime cash advance in under 5 minutes. $500 to $10,000 for gig workers and 1099 contractors. No credit check.",
  alternates: { canonical: "https://pennylime.com/apply" },
};

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
