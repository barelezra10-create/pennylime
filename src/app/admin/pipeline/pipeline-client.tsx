"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateContactStage } from "@/actions/contacts";
import { logActivity } from "@/actions/activities";
import { KANBAN_STAGES, STAGE_COLORS } from "@/lib/contact-helpers";
import { PageHeader } from "@/components/admin/page-header";

interface ContactCard {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  stage: string;
  source: string | null;
  lastAppStep: number | null;
  updatedAt: string;
  assignedRep: { id: string; name: string } | null;
  tags: string[];
}

export function PipelineClient({
  grouped,
}: {
  grouped: Record<string, ContactCard[]>;
  team: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingOver, setDraggingOver] = useState<string | null>(null);

  async function handleDrop(stage: string) {
    if (!draggingId) return;
    await updateContactStage(draggingId, stage);
    await logActivity({
      contactId: draggingId,
      type: "stage_changed",
      title: `Stage changed to ${stage}`,
      performedBy: "admin",
    });
    setDraggingId(null);
    setDraggingOver(null);
    router.refresh();
  }

  return (
    <div>
      <PageHeader title="Pipeline" description="Drag contacts between stages to update their status" />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {KANBAN_STAGES.map((stage) => {
          const contacts = grouped[stage] || [];
          const colors = STAGE_COLORS[stage];
          const isOver = draggingOver === stage;

          return (
            <div
              key={stage}
              className="flex-shrink-0 w-[280px]"
              onDragOver={(e) => {
                e.preventDefault();
                setDraggingOver(stage);
              }}
              onDragLeave={() => setDraggingOver(null)}
              onDrop={() => handleDrop(stage)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: colors.text.replace("text-[", "").replace("]", "") }}
                  />
                  <span className="text-[12px] font-semibold text-black uppercase tracking-[0.04em]">
                    {stage.replace("_", " ")}
                  </span>
                </div>
                <span className="text-[11px] text-[#a1a1aa] bg-[#f4f4f5] rounded-full px-2 py-0.5">
                  {contacts.length}
                </span>
              </div>

              {/* Cards drop zone */}
              <div
                className={`space-y-2 min-h-[200px] rounded-xl p-2 transition-colors ${
                  isOver ? "bg-[#e4e4e7]/60 ring-2 ring-[#3052FF]/30" : "bg-[#f4f4f5]/50"
                }`}
              >
                {contacts.map((contact) => (
                  <div
                    key={contact.id}
                    draggable
                    onDragStart={() => setDraggingId(contact.id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDraggingOver(null);
                    }}
                    className={`bg-white rounded-xl p-3.5 border border-[#e4e4e7] cursor-grab active:cursor-grabbing hover:shadow-sm transition-all ${
                      draggingId === contact.id ? "opacity-50 scale-95" : ""
                    }`}
                  >
                    <Link href={`/admin/contacts/${contact.id}`} className="block">
                      <p className="text-[13px] font-bold text-black">
                        {contact.firstName} {contact.lastName || ""}
                      </p>
                      <p className="text-[11px] text-[#71717a] mt-0.5 truncate">{contact.email}</p>
                      {contact.source && (
                        <p className="text-[10px] text-[#a1a1aa] mt-1">{contact.source}</p>
                      )}
                      {contact.lastAppStep && contact.lastAppStep < 7 && (
                        <p className="text-[10px] text-[#b45309] mt-1">
                          Stopped at step {contact.lastAppStep}/7
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        {contact.assignedRep && (
                          <span className="text-[10px] text-[#71717a]">{contact.assignedRep.name}</span>
                        )}
                        <span className="text-[10px] text-[#a1a1aa] ml-auto">
                          {new Date(contact.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {contact.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {contact.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] bg-[#f4f4f5] text-[#71717a] rounded-full px-1.5 py-0.5"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </Link>
                  </div>
                ))}
                {contacts.length === 0 && (
                  <p className="text-center text-[11px] text-[#a1a1aa] py-8">No contacts</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
