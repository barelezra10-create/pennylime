"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { saveSmsCampaign, sendSmsCampaign, sendTestSms } from "@/actions/sms";

type SmsRule = {
  stage?: string;
  tag?: string;
  hasLoan?: boolean;
  verifiedPhone?: boolean;
};

interface Campaign {
  id: string;
  name: string;
  body: string;
  segmentRules: string;
  scheduledAt: Date | null;
  status: string;
}

interface Props {
  campaign?: Campaign;
}

const STAGES = ["LEAD", "APPLICANT", "QUALIFIED", "APPROVED", "OFFER_ACCEPTED", "FUNDED", "REJECTED", "CHURN"];

export function SmsCampaignEditorClient({ campaign }: Props) {
  const router = useRouter();
  const [name, setName] = useState(campaign?.name ?? "");
  const [body, setBody] = useState(campaign?.body ?? "");
  const [rule, setRule] = useState<SmsRule>(() => {
    if (campaign?.segmentRules) {
      try {
        const parsed = JSON.parse(campaign.segmentRules) as SmsRule[];
        if (Array.isArray(parsed) && parsed[0]) return parsed[0];
      } catch {}
    }
    return {};
  });
  const [scheduledAt, setScheduledAt] = useState(
    campaign?.scheduledAt ? new Date(campaign.scheduledAt).toISOString().slice(0, 16) : ""
  );
  const [testTo, setTestTo] = useState("");
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [audienceSample, setAudienceSample] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchAudience = useCallback(async (r: SmsRule) => {
    try {
      const res = await fetch("/api/sms/audience-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: [r] }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setAudienceCount(data.count);
      setAudienceSample(data.sample ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchAudience(rule);
  }, [rule, fetchAudience]);

  function updateRule<K extends keyof SmsRule>(key: K, value: SmsRule[K]) {
    setRule((prev) => ({ ...prev, [key]: value }));
  }

  function clearKey(key: keyof SmsRule) {
    setRule((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function segCount() {
    return Math.max(1, Math.ceil(body.length / 160));
  }

  async function save(status: "DRAFT" | "SCHEDULED", sendNow = false) {
    if (!name.trim() || !body.trim()) {
      toast.error("Name and body are required");
      return;
    }
    setSaving(true);
    try {
      const scheduledAtValue = sendNow ? new Date().toISOString() : scheduledAt || undefined;
      const cleanedRule: SmsRule = {};
      if (rule.stage) cleanedRule.stage = rule.stage;
      if (rule.tag) cleanedRule.tag = rule.tag;
      if (rule.hasLoan) cleanedRule.hasLoan = true;
      if (rule.verifiedPhone) cleanedRule.verifiedPhone = true;

      await saveSmsCampaign({
        id: campaign?.id,
        name,
        body,
        segmentRules: JSON.stringify([cleanedRule]),
        status,
        scheduledAt: scheduledAtValue,
      });
      toast.success(campaign ? "Campaign updated" : "Campaign created");
      router.push("/admin/sms/campaigns");
    } catch {
      toast.error("Failed to save campaign");
    } finally {
      setSaving(false);
    }
  }

  async function sendImmediate() {
    if (!campaign?.id) {
      toast.error("Save the campaign first");
      return;
    }
    setSaving(true);
    try {
      const r = await sendSmsCampaign(campaign.id);
      if (r.ok) {
        toast.success(`Sent: ${r.sent}, Failed: ${r.failed}`);
        router.push("/admin/sms/campaigns");
      } else {
        toast.error(r.error || "Send failed");
      }
    } catch {
      toast.error("Send failed");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!testTo.trim() || !body.trim()) {
      toast.error("Test phone and body required");
      return;
    }
    const r = await sendTestSms({ to: testTo, body });
    if (r.ok) toast.success("Test sent");
    else toast.error(r.error || "Send failed");
  }

  return (
    <div>
      <PageHeader
        title={campaign ? "Edit SMS Campaign" : "New SMS Campaign"}
        description="One-time SMS blast to a contact segment"
      />

      <div className="grid grid-cols-[1fr_280px] gap-6">
        <div className="space-y-5">
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-[#71717a] mb-2">Campaign Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. May Re-engagement Blast"
              className="w-full bg-[#f4f4f5] rounded-xl px-4 py-3 text-[14px] text-black placeholder:text-[#a1a1aa] focus:outline-none focus:ring-2 focus:ring-[#15803d]/30"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-[#71717a]">SMS Body</label>
              <span className="text-[11px] text-[#a1a1aa]">{body.length} chars · {segCount()} segment{segCount() > 1 ? "s" : ""}</span>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={1600}
              placeholder="Hey {{firstName}}, your $500 advance is ready. Tap pennylime.com/apply/{{applicationCode}} to claim."
              className="w-full bg-[#f4f4f5] rounded-xl px-4 py-3 text-[13px] text-black placeholder:text-[#a1a1aa] focus:outline-none focus:ring-2 focus:ring-[#15803d]/30 font-mono"
            />
            <p className="text-[11px] text-[#a1a1aa] mt-1">Vars: {`{{firstName}}`}, {`{{lastName}}`}, {`{{loanAmount}}`}, {`{{applicationCode}}`}. Each segment = 160 chars.</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-[#71717a]">
                Audience Segment
                {audienceCount !== null && (
                  <span className="ml-2 normal-case font-medium text-[#15803d]">
                    ({audienceCount.toLocaleString()} contacts)
                  </span>
                )}
              </label>
            </div>

            <div className="bg-white border border-[#e4e4e7] rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#71717a] mb-1">Stage</span>
                  <select
                    value={rule.stage ?? ""}
                    onChange={(e) => e.target.value ? updateRule("stage", e.target.value) : clearKey("stage")}
                    className="text-[13px] border border-[#e4e4e7] rounded-lg px-2 py-1.5 bg-white"
                  >
                    <option value="">Any stage</option>
                    {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="flex flex-col">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#71717a] mb-1">Tag</span>
                  <input
                    value={rule.tag ?? ""}
                    onChange={(e) => e.target.value ? updateRule("tag", e.target.value) : clearKey("tag")}
                    placeholder="e.g. high-intent"
                    className="text-[13px] border border-[#e4e4e7] rounded-lg px-2 py-1.5"
                  />
                </label>
              </div>
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-[13px] text-black">
                  <input
                    type="checkbox"
                    checked={!!rule.hasLoan}
                    onChange={(e) => e.target.checked ? updateRule("hasLoan", true) : clearKey("hasLoan")}
                  />
                  Has loan
                </label>
                <label className="flex items-center gap-2 text-[13px] text-black">
                  <input
                    type="checkbox"
                    checked={!!rule.verifiedPhone}
                    onChange={(e) => e.target.checked ? updateRule("verifiedPhone", true) : clearKey("verifiedPhone")}
                  />
                  Phone verified
                </label>
              </div>
              <p className="text-[11px] text-[#a1a1aa] pt-1 border-t border-[#f4f4f5]">
                Always: contact must have a phone number AND smsOptIn = true.
              </p>
            </div>

            {audienceSample.length > 0 && (
              <div className="mt-3 bg-[#fafafa] border border-[#e4e4e7] rounded-xl p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#71717a] mb-2">Audience sample</p>
                <ul className="space-y-1 text-[12px] text-black">
                  {audienceSample.map((s, i) => <li key={i} className="font-mono">{s}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* Test send */}
          <div className="bg-white border border-[#e4e4e7] rounded-xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#71717a] mb-2">Test send</p>
            <div className="flex items-center gap-2">
              <input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="+16153354714"
                className="flex-1 text-[13px] border border-[#e4e4e7] rounded-lg px-3 py-2"
              />
              <button
                type="button"
                onClick={sendTest}
                className="bg-[#f4f4f5] text-black text-[12px] font-semibold rounded-lg px-3 py-2 hover:bg-[#e4e4e7]"
              >
                Send test
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-[#e4e4e7] rounded-xl p-5">
            <h3 className="text-[13px] font-bold text-black mb-4">Publish</h3>

            <div className="mb-4">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-[#71717a] mb-2">Schedule For</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full bg-[#f4f4f5] rounded-lg px-3 py-2 text-[13px] text-black focus:outline-none focus:ring-2 focus:ring-[#15803d]/30"
              />
            </div>

            <div className="space-y-2">
              <button
                onClick={() => save("DRAFT")}
                disabled={saving}
                className="w-full bg-[#f4f4f5] text-black text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-[#e4e4e7] transition-colors disabled:opacity-50"
              >
                Save as Draft
              </button>
              <button
                onClick={() => save("SCHEDULED")}
                disabled={saving || !scheduledAt}
                className="w-full bg-amber-500 text-white text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                Schedule
              </button>
              {campaign?.id ? (
                <button
                  onClick={sendImmediate}
                  disabled={saving || campaign.status === "SENT"}
                  className="w-full bg-[#15803d] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-[#166534] transition-colors disabled:opacity-50"
                >
                  Send Now
                </button>
              ) : (
                <p className="text-[11px] text-[#a1a1aa] text-center pt-1">Save first, then send</p>
              )}
            </div>
          </div>

          <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-4">
            <p className="text-[12px] text-[#15803d] font-medium">Audience</p>
            <p className="text-[24px] font-extrabold text-[#15803d] mt-1">
              {audienceCount !== null ? audienceCount.toLocaleString() : "—"}
            </p>
            <p className="text-[11px] text-[#166534] mt-0.5">contacts will receive this SMS</p>
          </div>
        </div>
      </div>
    </div>
  );
}
