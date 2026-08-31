"use server";

import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { requireNonSupportRole } from "@/lib/auth-helpers";
import { sendEmail } from "@/lib/emails/send";
import { interviewInviteEmail } from "@/lib/emails/interview-invite";
import { outreachEmail } from "@/lib/emails/outreach";
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

/**
 * Admin: send a plain outreach email (e.g. "we'd like to move forward, when are
 * you available this week"). No calendar needed. Moves NEW applicants to
 * REVIEWING so it's clear they've been contacted.
 */
export async function sendOutreach(input: {
  id: string;
  message: string;
}): Promise<{ ok: true; sentTo: string } | { ok: false; error: string }> {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { ok: false, error: auth.error };

  const message = input.message.trim();
  if (!message) return { ok: false, error: "Write a message first." };

  const applicant = await prisma.jobApplicant.findUnique({
    where: { id: input.id },
    select: { id: true, email: true, status: true },
  });
  if (!applicant) return { ok: false, error: "Applicant not found." };
  if (!applicant.email) return { ok: false, error: "This candidate has no email on file." };

  const { subject, html, preheader } = outreachEmail({ message });
  const res = await sendEmail({ to: applicant.email, subject, html, preheader, templateId: "hr-outreach" });
  if (!res?.success) {
    const err = (res as { error?: unknown })?.error;
    return { ok: false, error: err instanceof Error ? err.message : "Email failed to send." };
  }

  await prisma.jobApplicant.update({
    where: { id: applicant.id },
    data: applicant.status === "NEW" ? { status: "REVIEWING" } : {},
  });

  await logAudit({
    action: "CHANGE_SETTING",
    entityType: "APPLICATION",
    entityId: applicant.id,
    performedBy: auth.email,
    details: { kind: "HR_OUTREACH", sentTo: applicant.email },
  });

  return { ok: true, sentTo: applicant.email };
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
 * Admin: schedule an interview. Creates a Google Calendar event with a Google
 * Meet link (Google emails the candidate a calendar invite), sends our own
 * branded email with the Meet link and time, and marks them INVITED.
 */
export async function scheduleInterview(input: {
  id: string;
  startISO: string;
  durationMin: number;
  note?: string;
}): Promise<{ ok: true; sentTo: string; meetLink: string | null } | { ok: false; error: string }> {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!input.startISO || Number.isNaN(new Date(input.startISO).getTime())) {
    return { ok: false, error: "Pick a valid date and time." };
  }

  const applicant = await prisma.jobApplicant.findUnique({
    where: { id: input.id },
    select: { id: true, fullName: true, email: true, role: true },
  });
  if (!applicant) return { ok: false, error: "Applicant not found." };
  if (!applicant.email) return { ok: false, error: "This candidate has no email on file." };

  const { createInterviewEvent } = await import("@/lib/google-calendar");
  let meetLink: string | null = null;
  try {
    const ev = await createInterviewEvent({
      summary: `PennyLime interview: ${applicant.fullName} (${applicant.role})`,
      description: `Interview for the ${applicant.role} role at PennyLime.${input.note ? `\n\n${input.note}` : ""}`,
      startISO: input.startISO,
      durationMin: input.durationMin || 30,
      attendeeEmail: applicant.email,
      attendeeName: applicant.fullName,
    });
    meetLink = ev.meetLink;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "calendar error";
    if (/not connected/i.test(msg)) {
      return { ok: false, error: "Connect Google Calendar first (button at the top of this page)." };
    }
    return { ok: false, error: `Could not create the Google Meet: ${msg}` };
  }

  const whenText = new Date(input.startISO).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/New_York",
  });

  const { subject, html, preheader } = interviewInviteEmail({
    firstName: applicant.fullName.split(/\s+/)[0] || "there",
    role: applicant.role,
    whenText,
    meetLink: meetLink || "",
    note: input.note?.trim() || "",
  });
  await sendEmail({ to: applicant.email, subject, html, preheader, templateId: "interview-invite" });

  await prisma.jobApplicant.update({
    where: { id: applicant.id },
    data: {
      status: "INVITED",
      invitedAt: new Date(),
      interviewAt: new Date(input.startISO),
      meetLink,
      proposedTimes: whenText,
    },
  });

  await logAudit({
    action: "CHANGE_SETTING",
    entityType: "APPLICATION",
    entityId: applicant.id,
    performedBy: auth.email,
    details: { kind: "INTERVIEW_SCHEDULED", sentTo: applicant.email, when: whenText, meetLink },
  });

  return { ok: true, sentTo: applicant.email, meetLink };
}
