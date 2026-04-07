"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTeamMember, updateTeamMemberRole, deleteTeamMember } from "@/actions/team";
import { PageHeader } from "@/components/admin/page-header";
import { toast } from "sonner";

interface Member {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
}

export function TeamClient({ members }: { members: Member[] }) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "REP" });
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!form.email || !form.name || !form.password) return;
    setSaving(true);
    try {
      await createTeamMember(form);
      setShowAdd(false);
      setForm({ email: "", name: "", password: "", role: "REP" });
      toast.success("Team member added");
      router.refresh();
    } catch {
      toast.error("Failed to add member");
    }
    setSaving(false);
  }

  async function handleRoleChange(id: string, role: string) {
    await updateTeamMemberRole(id, role);
    toast.success("Role updated");
    router.refresh();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove ${name} from the team?`)) return;
    await deleteTeamMember(id);
    toast.success("Member removed");
    router.refresh();
  }

  const inputClass = "w-full text-[13px] px-3.5 py-2.5 bg-[#f4f4f5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803d]/20";
  const labelClass = "text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] mb-1.5 block";

  return (
    <div>
      <PageHeader title="Team" description="Manage admin users and sales reps" action={{ label: "Add Member", onClick: () => setShowAdd(true) }} />

      {/* Add member form */}
      {showAdd && (
        <div className="bg-white rounded-xl p-6 mb-6 border border-[#e4e4e7]">
          <h3 className="text-[15px] font-bold text-black mb-4">Add Team Member</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Jane Smith" /></div>
            <div><label className={labelClass}>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} placeholder="jane@pennylime.com" type="email" /></div>
            <div><label className={labelClass}>Password</label><input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} type="password" placeholder="Minimum 8 characters" /></div>
            <div><label className={labelClass}>Role</label><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputClass}><option value="ADMIN">Admin</option><option value="REP">Rep</option></select></div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleAdd} disabled={saving} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-[#166534] disabled:opacity-50">{saving ? "Adding..." : "Add Member"}</button>
            <button onClick={() => setShowAdd(false)} className="text-[13px] text-[#71717a] px-4 py-2.5 rounded-xl hover:bg-[#f4f4f5]">Cancel</button>
          </div>
        </div>
      )}

      {/* Team list */}
      <div className="bg-white rounded-xl overflow-hidden border border-[#e4e4e7]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e4e4e7]">
              <th className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] px-5 py-3">Name</th>
              <th className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] px-5 py-3">Email</th>
              <th className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] px-5 py-3">Role</th>
              <th className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] px-5 py-3">Joined</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-[#f4f4f5] last:border-0 hover:bg-[#f8f8f6] transition-colors">
                <td className="px-5 py-3.5 text-[13px] font-medium text-black">{m.name}</td>
                <td className="px-5 py-3.5 text-[13px] text-[#71717a]">{m.email}</td>
                <td className="px-5 py-3.5">
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.id, e.target.value)}
                    className="text-[12px] font-semibold bg-[#f4f4f5] rounded-lg px-2.5 py-1.5"
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="REP">Rep</option>
                  </select>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-[#a1a1aa]">{new Date(m.createdAt).toLocaleDateString()}</td>
                <td className="px-5 py-3.5 text-right">
                  <button onClick={() => handleDelete(m.id, m.name)} className="text-[12px] text-red-500 hover:text-red-700">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
