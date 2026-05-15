import { Navbar } from "@/components/homepage/navbar";
import { Footer } from "@/components/homepage/footer";
import { ChatWidgetGate } from "@/components/chat/ChatWidgetGate";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="pt-16 md:pt-20 min-h-screen">{children}</main>
      <Footer />
      <ChatWidgetGate />
    </>
  );
}
