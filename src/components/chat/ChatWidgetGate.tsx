"use client";
import { usePathname } from "next/navigation";
import { ChatWidget } from "./ChatWidget";

export function ChatWidgetGate() {
  const path = usePathname() ?? "";
  if (path.startsWith("/apply")) return null;
  return <ChatWidget />;
}
