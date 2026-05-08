import { getOfferForApplicant } from "@/actions/offers";
import { OfferClient } from "./client";

export const dynamic = "force-dynamic";

export default async function OfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { code } = await params;
  const { t } = await searchParams;

  if (!t) {
    return (
      <CenteredMessage
        title="Invalid offer link"
        body="This offer link is missing its security token. Please use the link from your approval email."
      />
    );
  }

  const result = await getOfferForApplicant({ applicationCode: code, token: t });
  if (!result.ok) {
    return (
      <CenteredMessage
        title="We couldn't load your offer"
        body={result.error}
      />
    );
  }

  return <OfferClient applicationCode={code} token={t} initial={result} />;
}

function CenteredMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen bg-[#fafaf7] flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#0a0a0a]">{title}</h1>
        <p className="mt-3 text-[14px] text-[#52525b]">{body}</p>
      </div>
    </div>
  );
}
