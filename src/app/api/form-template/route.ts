import { NextRequest, NextResponse } from "next/server";
import { getFormTemplateBySlug } from "@/actions/form-templates";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json(null);
  const template = await getFormTemplateBySlug(slug);
  return NextResponse.json(template);
}
