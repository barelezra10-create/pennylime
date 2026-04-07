import { Navbar } from "@/components/homepage/navbar";
import { Footer } from "@/components/homepage/footer";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="pt-20 min-h-screen">{children}</main>
      <Footer />
    </>
  );
}
