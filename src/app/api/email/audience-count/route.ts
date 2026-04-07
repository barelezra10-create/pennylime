import { NextRequest, NextResponse } from "next/server";
import { countSegment } from "@/lib/segment-resolver";

export async function POST(request: NextRequest) {
  const { rules } = await request.json();
  const count = await countSegment(rules || []);
  return NextResponse.json({ count });
}
