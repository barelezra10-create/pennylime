"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { TiptapEditor } from "@/components/content/tiptap-editor";
import { createEmailCampaign, updateEmailCampaign } from "@/actions/email";
import type { SegmentRule } from "@/types/email";

const FIELDS: { value: SegmentRule["field"]; label: string }[] = [
  { value: "stage", label: "Stage" },
  { value: "tag", label: "Tag" },
  { value: "source", label: "Source" },
  { value: "utmCampaign", label: "UTM Campaign" },
  { value: "assignedRepId", label: "Assigned Rep ID" },
  { value: "lastAppStep", label: "Last App Step" },
  { value: "createdAt", label: "Created At" },
];

const OPERATORS: { value: SegmentRule["operator"]; label: string }[] = [
  { value: "is", label: "is" },
  { value: "is_not", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
];

interface Campaign {
  id: string;
  name: string;
  subject: string;
  body: string;
  segmentRules: string;
  scheduledAt: Date | null;
  status: string;
  createdBy: string;
}

interface Props {
  campaign?: Campaign;
}

export function CampaignEditorClient({ campaign }: Props) {
  const router = useRouter();
  const [name, setName] = useState(campaign?.name ?? "");
  const [subject, setSubject] = useState(campaign?.subject ?? "");
  const [body, setBody] = useState(campaign?.body ?? "");
  const [rules, setRules] = useState<SegmentRule[]>(() => {
    if (campaign?.segmentRules) {
      try { return JSON.parse(campaign.segmentRules); } catch { return []; }
    }
    return [];
  });
  const [scheduledAt, setScheduledAt] = useState(
    campaign?.scheduledAt ? new Date(campaign.scheduledAt).toISOString().slice(0, 16) : ""
  );
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAudienceCount = useCallback(async (currentRules: SegmentRule[]) => {
    try {
      const res = await fetch("/api/email/audience-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: currentRules }),
      });
      const data = await res.json();
      setAudienceCount(data.count);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchAudienceCount(rules);
  }, [rules, fetchAudienceCount]);

  function addRule() {
    setRules((prev) => [...prev, { field: "stage", operator: "is", value: "" }]);
  }

  function removeRule(idx: number) {
    setRules((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateRule(idx: number, key: keyof SegmentRule, value: string) {
    setRules((prev) => prev.map((r, i) => i === idx ? { ...r, [key]: value } : r));
  }

  async function save(status: "DRAFT" | "SCHEDULED", sendNow = false) {
    if (!name.trim() || !subject.trim()) {
      toast.error("Name and subject are required");
      return;
    }
    setSaving(true);
    try {
      const scheduledAtValue = sendNow ? new Date().toISOString() : scheduledAt || undefined;
      const payload = {
        name,
        subject,
        body,
        segmentRules: JSON.stringify(rules),
        status,
        scheduledAt: scheduledAtValue,
        createdBy: "admin",
      };

      if (campaign?.id) {
        await updateEmailCampaign(campaign.id, payload);
        toast.success("Campaign updated");
      } else {
        await createEmailCampaign({ ...payload, createdBy: "admin" });
        toast.success("Campaign created");
      }
      router.push("/admin/email/campaigns");
    } catch {
      toast.error("Failed to save campaign");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={campaign ? "Edit Campaign" : "New Campaign"}
        description="Configure your email campaign"
      />

      <div className="grid grid-cols-[1fr_280px] gap-6">
        {/* Main editor */}
        <div className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-[#71717a] mb-2">Campaign Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. April Newsletter"
              className="w-full bg-[#f4f4f5] rounded-xl px-4 py-3 text-[14px] text-black placeholder:text-[#a1a1aa] focus:outline-none focus:ring-2 focus:ring-[#15803d]/30"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-[#71717a] mb-2">Subject Line</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Your debt relief options are ready"
              className="w-full bg-[#f4f4f5] rounded-xl px-4 py-3 text-[14px] text-black placeholder:text-[#a1a1aa] focus:outline-none focus:ring-2 focus:ring-[#15803d]/30"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-[#71717a] mb-2">Email Body</label>
            <div className="bg-white border border-[#e4e4e7] rounded-xl overflow-hidden">
              <TiptapEditor content={body} onChange={setBody} placeholder="Write your email content..." />
            </div>
          </div>

          {/* Segment builder */}
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
              <button
                type="button"
                onClick={addRule}
                className="text-[12px] font-medium text-[#15803d] hover:underline"
              >
                + Add Rule
              </button>
            </div>

            {rules.length === 0 ? (
              <div className="bg-[#f4f4f5] rounded-xl px-4 py-3 text-[13px] text-[#a1a1aa]">
                No rules, all contacts will be targeted. Click &quot;+ Add Rule&quot; to filter.
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-[#f4f4f5] rounded-xl px-3 py-2">
                    <select
                      value={rule.field}
                      onChange={(e) => updateRule(idx, "field", e.target.value)}
                      className="bg-white border border-[#e4e4e7] rounded-lg px-2 py-1.5 text-[13px] text-black focus:outline-none focus:ring-2 focus:ring-[#15803d]/30"
                    >
                      {FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    <select
                      value={rule.operator}
                      onChange={(e) => updateRule(idx, "operator", e.target.value)}
                      className="bg-white border border-[#e4e4e7] rounded-lg px-2 py-1.5 text-[13px] text-black focus:outline-none focus:ring-2 focus:ring-[#15803d]/30"
                    >
                      {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <input
                      value={rule.value}
                      onChange={(e) => updateRule(idx, "value", e.target.value)}
                      placeholder="value"
                      className="flex-1 bg-white border border-[#e4e4e7] rounded-lg px-2 py-1.5 text-[13px] text-black focus:outline-none focus:ring-2 focus:ring-[#15803d]/30"
                    />
                    <button
                      type="button"
                      onClick={() => removeRule(idx)}
                      className="text-[#a1a1aa] hover:text-red-500 transition-colors text-[18px] leading-none"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white border border-[#e4e4e7] rounded-xl p-5">
            <h3 className="text-[13px] font-bold text-black mb-4">Publish</h3>

            {/* Schedule datetime */}
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
              <button
                onClick={() => save("SCHEDULED", true)}
                disabled={saving}
                className="w-full bg-[#15803d] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-[#166534] transition-colors disabled:opacity-50"
              >
                Send Now
              </button>
            </div>
          </div>

          <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-4">
            <p className="text-[12px] text-[#15803d] font-medium">Audience</p>
            <p className="text-[24px] font-extrabold text-[#15803d] mt-1">
              {audienceCount !== null ? audienceCount.toLocaleString() : ","}
            </p>
            <p className="text-[11px] text-[#166534] mt-0.5">contacts will receive this</p>
          </div>
        </div>
      </div>
    </div>
  );
}
