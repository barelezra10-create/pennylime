"use client";
import { usePathname } from "next/navigation";
import { ChatWidget } from "./ChatWidget";

const HIDDEN_PREFIXES = ["/apply", "/admin", "/api"];

export function ChatWidgetGate() {
  const path = usePathname() ?? "";
  if (HIDDEN_PREFIXES.some((p) => path.startsWith(p))) return null;
  return <ChatWidget />;
}
