import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCachedAssetReportPdf } from "@/lib/plaid-report-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Plain anchor navigation only: retrieve once, then serve the saved PDF. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return new NextResponse("Sign in to view this Asset Report.", { status: 401 });
  const { id } = await params;
  try {
    const { buffer } = await getCachedAssetReportPdf(id);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="plaid-asset-report.pdf"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the report";
    if (message.includes("PRODUCT_NOT_READY")) {
      return new NextResponse("The Asset Report is still being prepared. Please return to the application and try again shortly.", { status: 409 });
    }
    if (message.includes("No asset report")) {
      return new NextResponse('No Asset Report is available yet. Return to the application and click "Pull Asset Report", then open the PDF.', { status: 404 });
    }
    return new NextResponse("The saved report could not be loaded. Please try again later.", { status: 502 });
  }
}
