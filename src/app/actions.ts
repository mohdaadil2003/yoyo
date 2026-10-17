"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/data/account";
import { alertSchema, jobSubmissionSchema, reportSchema } from "@/lib/validation/jobs";

type ActionState = { ok: boolean; message?: string; saved?: boolean };
const uuid = (z: unknown) => typeof z === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(z);
function formObject(formData: FormData) {
  const raw = Object.fromEntries(formData.entries()) as Record<string, unknown>;
  for (const key of ["termsAccepted"]) raw[key] = formData.get(key) === "on" || formData.get(key) === "true";
  if (typeof raw.expiresAt === "string" && raw.expiresAt) {
    const date = new Date(raw.expiresAt);
    raw.expiresAt = Number.isNaN(date.getTime()) ? raw.expiresAt : date.toISOString();
  }
  return raw;
}
async function rateLimit(scope: string, userId: string): Promise<ActionState | null> {
  const url = process.env.RATE_LIMIT_URL;
  if (!url) return { ok: false, message: "Writing is temporarily unavailable because rate limiting is not configured." };
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(process.env.RATE_LIMIT_TOKEN ? { authorization: `Bearer ${process.env.RATE_LIMIT_TOKEN}` } : {}) }, body: JSON.stringify({ scope, key: userId }), cache: "no-store" });
    if (!response.ok) return { ok: false, message: "Too many requests. Please try again later." };
    return (await response.json() as { allowed?: boolean }).allowed === false ? { ok: false, message: "Too many requests. Please try again later." } : null;
  } catch { return { ok: false, message: "Writing is temporarily unavailable." }; }
}
async function requireUser() { const result = await getCurrentUser(); if (!result.user) throw new Error("Please sign in to continue"); return result as { supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createSupabaseServerClient>>; user: NonNullable<typeof result.user> }; }
async function requireAdmin() { const result = await requireUser(); const { data, error } = await result.supabase.from("profiles").select("role").eq("id", result.user.id).single(); if (error || data?.role !== "admin") throw new Error("You do not have permission to do that"); return result; }

export async function submitJobAction(formData: FormData): Promise<void> {
  const parsed = jobSubmissionSchema.safeParse(formObject(formData)); if (!parsed.success) { redirect("/submit-job?error=validation"); }
  try { const { supabase, user } = await requireUser(); const limited = await rateLimit("submit-job", user.id); if (limited) redirect(`/submit-job?error=${encodeURIComponent(limited.message!)}`);
    const value = parsed.data; const companySlug = value.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const { data: company, error: companyError } = await supabase.from("companies").upsert({ owner_id: user.id, name: value.companyName, slug: `${companySlug}-${user.id.slice(0, 8)}`, website_url: value.companyWebsite || null }, { onConflict: "slug" }).select("id").single();
    if (companyError || !company) redirect("/submit-job?error=company");
    const { error } = await supabase.from("jobs").insert({ created_by: user.id, company_id: company.id, category_id: value.categoryId || null, title: value.title, slug: `${value.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${crypto.randomUUID().slice(0, 8)}`, description: value.description, requirements: value.requirements?.split("\n").map(x => x.trim()).filter(Boolean) ?? [], location: value.location || null, employment_type: value.employmentType || null, work_mode: value.workMode, apply_url: value.applyUrl, expires_at: value.expiresAt || null, status: "pending_review" });
    if (error) redirect("/submit-job?error=submit"); revalidatePath("/"); revalidatePath("/jobs"); redirect("/submit-job?submitted=1");
  } catch (error) { if (error && typeof error === "object" && "digest" in error) throw error; redirect("/submit-job?error=server"); }
}
export async function toggleSavedJobAction(jobId: string): Promise<ActionState> { if (!uuid(jobId)) return { ok: false, message: "Invalid job." }; try { const { supabase, user } = await requireUser(); const limited = await rateLimit("saved-job", user.id); if (limited) return limited; const { data: existing, error: readError } = await supabase.from("saved_jobs").select("job_id").eq("user_id", user.id).eq("job_id", jobId).maybeSingle(); if (readError) return { ok: false, message: "Unable to update saved jobs." }; const mutation = existing ? await supabase.from("saved_jobs").delete().eq("user_id", user.id).eq("job_id", jobId) : await supabase.from("saved_jobs").insert({ user_id: user.id, job_id: jobId }); if (mutation.error) return { ok: false, message: "Unable to update saved jobs." }; revalidatePath("/saved-jobs"); return { ok: true, saved: !existing, message: existing ? "Removed from saved jobs" : "Saved" }; } catch { return { ok: false, message: "Unable to update saved jobs." }; } }
export async function submitReportAction(formData: FormData): Promise<ActionState> { const parsed = reportSchema.safeParse(formObject(formData)); if (!parsed.success) return { ok: false, message: "Please provide a valid report." }; try { const { supabase, user } = await requireUser(); const limited = await rateLimit("report", user.id); if (limited) return limited; const { error } = await supabase.from("job_reports").insert({ job_id: parsed.data.jobId, reporter_id: user.id, reason: parsed.data.reason }); return error ? { ok: false, message: "You may have already reported this job." } : { ok: true, message: "Thanks. We will review this report." }; } catch { return { ok: false, message: "Unable to submit report." }; } }
export async function createAlertAction(formData: FormData): Promise<void> { const parsed = alertSchema.safeParse(formObject(formData)); if (!parsed.success) redirect("/job-alerts?error=validation"); try { const { supabase, user } = await requireUser(); const limited = await rateLimit("job-alert", user.id); if (limited) redirect(`/job-alerts?error=${encodeURIComponent(limited.message!)}`); const { error } = await supabase.from("job_alerts").insert({ name: parsed.data.name, keywords: parsed.data.keywords || null, category_id: parsed.data.categoryId || null, location: parsed.data.location || null, work_mode: parsed.data.workMode || null, user_id: user.id }); if (error) redirect("/job-alerts?error=server"); revalidatePath("/job-alerts"); redirect("/job-alerts?created=1"); } catch (error) { if (error && typeof error === "object" && "digest" in error) throw error; redirect("/job-alerts?error=server"); } }
export async function moderateJobAction(jobId: string, status: "published" | "rejected" | "closed", isFeatured = false): Promise<ActionState> { if (!uuid(jobId) || !["published", "rejected", "closed"].includes(status) || typeof isFeatured !== "boolean") return { ok: false, message: "Invalid moderation request." }; try { const { supabase, user } = await requireAdmin(); const limited = await rateLimit("moderate-job", user.id); if (limited) return limited; const { error } = await supabase.from("jobs").update({ status, is_featured: isFeatured, approved_by: status === "published" ? user.id : null, approved_at: status === "published" ? new Date().toISOString() : null }).eq("id", jobId); if (error) return { ok: false, message: "Unable to update this job." }; const audit = await createSupabaseAdminClient().from("audit_logs").insert({ actor_id: user.id, action: `job_${status}`, table_name: "jobs", record_id: jobId }); if (audit.error) return { ok: false, message: "Job updated, but audit logging failed." }; revalidatePath("/admin"); revalidatePath("/jobs"); return { ok: true }; } catch { return { ok: false, message: "You are not authorized to do that." }; } }
