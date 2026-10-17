import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AdminModerationButton from "@/components/admin/AdminModerationButton";

type AdminJob = { id: string; title: string; slug: string; status: string; is_featured: boolean; created_at: string; companies: { name: string } | null };

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin?next=/admin");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");
  const { data } = await supabase.from("jobs").select("id,title,slug,status,is_featured,created_at,companies(name)").order("created_at", { ascending: false }).limit(100);
  const jobs = (data ?? []) as unknown as AdminJob[];
  const pending = jobs.filter((job) => job.status === "pending_review");
  const published = jobs.filter((job) => job.status === "published");
  return <main className="bg-slate-50 py-12"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">Operations</p><h1 className="mt-2 text-4xl font-bold text-slate-950">Admin dashboard</h1></div><div className="flex gap-2"><Link href="/admin/jobs" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold">All jobs</Link><Link href="/admin/analytics" className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Analytics</Link></div></div><div className="mt-8 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><p className="text-sm text-slate-500">Total listings</p><p className="mt-2 text-3xl font-bold">{jobs.length}</p></div><div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><p className="text-sm text-slate-500">Pending review</p><p className="mt-2 text-3xl font-bold text-amber-600">{pending.length}</p></div><div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><p className="text-sm text-slate-500">Published</p><p className="mt-2 text-3xl font-bold text-emerald-600">{published.length}</p></div></div><section className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="text-lg font-bold">Moderation queue</h2><p className="mt-1 text-sm text-slate-500">Review every submission before it becomes public.</p></div><div className="divide-y divide-slate-100">{pending.length ? pending.map((job) => <div key={job.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><Link href={`/jobs/${job.slug}`} className="font-semibold text-slate-950 hover:text-blue-700">{job.title}</Link><p className="mt-1 text-sm text-slate-500">{job.companies?.name ?? "Unknown company"} · {new Date(job.created_at).toLocaleDateString("en-IN")}</p></div><div className="flex gap-2"><AdminModerationButton jobId={job.id} status="published" label="Approve" /><AdminModerationButton jobId={job.id} status="rejected" label="Reject" /></div></div>) : <p className="p-8 text-center text-slate-500">No jobs are waiting for review.</p>}</div></section></div></main>;
}
