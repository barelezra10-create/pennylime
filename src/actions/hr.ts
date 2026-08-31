"use server";

import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { requireNonSupportRole } from "@/lib/auth-helpers";
import { sendEmail } from "@/lib/emails/send";
import { interviewInviteEmail } from "@/lib/emails/interview-invite";
import { logAudit } from "@/lib/audit";
import { parseCv, type CvFields } from "@/lib/cv-parser";

const CV_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_CV_BYTES = 15 * 1024 * 1024;

/**
 * Public action: a candidate applies through /hr. Stores the uploaded CV and
 * creates a JobApplicant row. No auth — this is the public careers form.
 */
export async function submitJobApplication(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const linkedin = String(formData.get("linkedin") || "").trim();
  const yearsExperience = String(formData.get("yearsExperience") || "").trim();
  const mcaExperience = formData.get("mcaExperience") === "on" || formData.get("mcaExperience") === "true";
  const message = String(formData.get("message") || "").trim();
  const file = formData.get("cv") as File | null;

  if (!fullName) return { ok: false, error: "Please enter your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Please enter a valid email." };
  if (!file || file.size === 0) return { ok: false, error: "Please attach your CV." };
  if (!CV_TYPES.includes(file.type)) return { ok: false, error: "Your CV must be a PDF or Word document." };
  if (file.size > MAX_CV_BYTES) return { ok: false, error: "That file is too large (max 15MB)." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const cvStoragePath = await storage.upload(buffer, file.name);

  await prisma.jobApplicant.create({
    data: {
      fullName,
      email,
      phone: phone || null,
      linkedin: linkedin || null,
      yearsExperience: yearsExperience || null,
      mcaExperience,
      message: message || null,
      cvStoragePath,
      cvFileName: file.name,
      cvMimeType: file.type,
    },
  });

  return { ok: true };
}

/**
 * Admin: read a CV file and extract the candidate's details with Gemini so the
 * add form can be prefilled. Does NOT save anything.
 */
export async function parseCvFromUpload(
  formData: FormData,
): Promise<{ ok: true; fields: CvFields } | { ok: false; error: string }> {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { ok: false, error: auth.error };
  const file = formData.get("cv") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "No CV attached." };
  if (!CV_TYPES.includes(file.type)) return { ok: false, error: "CV must be a PDF or Word document." };
  if (file.size > MAX_CV_BYTES) return { ok: false, error: "That file is too large (max 15MB)." };
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const fields = await parseCv(buffer, file.type);
    return { ok: true, fields };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the CV." };
  }
}

/**
 * Admin: manually add a candidate + CV to the pipeline (e.g. someone sourced
 * off Indeed or referred). Same storage as the public form, but auth-gated and
 * defaults to REVIEWING since a human is adding a known candidate.
 */
export async function addApplicantByAdmin(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { ok: false, error: auth.error };

  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const linkedin = String(formData.get("linkedin") || "").trim();
  const yearsExperience = String(formData.get("yearsExperience") || "").trim();
  const mcaExperience = formData.get("mcaExperience") === "on" || formData.get("mcaExperience") === "true";
  const message = String(formData.get("message") || "").trim();
  const file = formData.get("cv") as File | null;

  if (!fullName) return { ok: false, error: "Enter a name." };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "That email looks invalid." };
  if (!file || file.size === 0) return { ok: false, error: "Attach a CV." };
  if (!CV_TYPES.includes(file.type)) return { ok: false, error: "CV must be a PDF or Word document." };
  if (file.size > MAX_CV_BYTES) return { ok: false, error: "That file is too large (max 15MB)." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const cvStoragePath = await storage.upload(buffer, file.name);

  await prisma.jobApplicant.create({
    data: {
      fullName,
      email: email || "",
      phone: phone || null,
      linkedin: linkedin || null,
      yearsExperience: yearsExperience || null,
      mcaExperience,
      message: message || null,
      cvStoragePath,
      cvFileName: file.name,
      cvMimeType: file.type,
      status: "REVIEWING",
    },
  });

  return { ok: true };
}

/** Admin: change an applicant's pipeline status. */
export async function setApplicantStatus(
  id: string,
  status: "NEW" | "REVIEWING" | "INVITED" | "REJECTED" | "HIRED",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { ok: false, error: auth.error };
  await prisma.jobApplicant.update({ where: { id }, data: { status } });
  return { ok: true };
}

/** Admin: save a private note on an applicant. */
export async function setApplicantNote(
  id: string,
  notes: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { ok: false, error: auth.error };
  await prisma.jobApplicant.update({ where: { id }, data: { notes: notes.slice(0, 2000) } });
  return { ok: true };
}

/**
 * Admin: email a candidate to set up an interview. The admin types the
 * specific time slots to propose; we send the invite and mark them INVITED.
 */
export async function inviteApplicant(input: {
  id: string;
  proposedTimes: string;
  note?: string;
}): Promise<{ ok: true; sentTo: string } | { ok: false; error: string }> {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { ok: false, error: auth.error };

  const times = input.proposedTimes.trim();
  if (!times) return { ok: false, error: "Add at least one proposed time." };

  const applicant = await prisma.jobApplicant.findUnique({
    where: { id: input.id },
    select: { id: true, fullName: true, email: true, role: true },
  });
  if (!applicant) return { ok: false, error: "Applicant not found." };

  const firstName = applicant.fullName.split(/\s+/)[0] || "there";
  const { subject, html, preheader } = interviewInviteEmail({
    firstName,
    role: applicant.role,
    proposedTimes: times,
    note: input.note?.trim() || "",
  });
  const res = await sendEmail({ to: applicant.email, subject, html, preheader, templateId: "interview-invite" });
  if (!res?.success) {
    const err = (res as { error?: unknown })?.error;
    return { ok: false, error: err instanceof Error ? err.message : "Email failed to send." };
  }

  await prisma.jobApplicant.update({
    where: { id: applicant.id },
    data: { status: "INVITED", invitedAt: new Date(), proposedTimes: times },
  });

  await logAudit({
    action: "CHANGE_SETTING",
    entityType: "APPLICATION",
    entityId: applicant.id,
    performedBy: auth.email,
    details: { kind: "INTERVIEW_INVITE", sentTo: applicant.email, proposedTimes: times },
  });

  return { ok: true, sentTo: applicant.email };
}
