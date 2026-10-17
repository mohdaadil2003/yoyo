import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyJobSchema } from "@/lib/validations";
import { apiLimiter } from "@/lib/rate-limit";

// POST /api/applications — job seeker applies
export async function POST(req: NextRequest) {
  const rateLimited = await apiLimiter(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Please sign in to apply" }, { status: 401 });
    }
    if (session.user.role !== "JOB_SEEKER") {
      return NextResponse.json({ error: "Only job seekers can apply" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = applyJobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { jobId, coverLetter } = parsed.data;

    const application = await prisma.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: jobId } });
      if (!job || !job.isActive) {
        throw Object.assign(new Error("This job is no longer available"), { status: 404 });
      }

      const existing = await tx.application.findUnique({
        where: { userId_jobId: { userId: session.user.id, jobId } },
      });
      if (existing) {
        throw Object.assign(new Error("You have already applied to this job"), { status: 409 });
      }

      const user = await tx.user.findUnique({
        where: { id: session.user.id },
        select: { resumeUrl: true, resumeKey: true },
      });

      return tx.application.create({
        data: {
          userId: session.user.id,
          jobId,
          coverLetter,
          resumeUrl: user?.resumeUrl,
          resumeKey: user?.resumeKey,
        },
      });
    });

    return NextResponse.json({ success: true, application }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const status = (error as Error & { status: number }).status;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("Application error:", error);
    return NextResponse.json({ error: "Failed to submit application" }, { status: 500 });
  }
}

// GET /api/applications — get user's applications
export async function GET(req: NextRequest) {
  const rateLimited = await apiLimiter(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const countOnly = searchParams.get("count") === "true";

    // Employers: count applications for their jobs
    if (session.user.role === "EMPLOYER") {
      const company = await prisma.company.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      });
      if (!company) {
        return NextResponse.json({ success: true, count: 0, applications: [] });
      }
      if (countOnly) {
        const count = await prisma.application.count({
          where: { job: { companyId: company.id } },
        });
        return NextResponse.json({ success: true, count });
      }
      const applications = await prisma.application.findMany({
        where: { job: { companyId: company.id } },
        include: {
          job: { select: { id: true, title: true } },
          user: { select: { id: true, name: true, email: true, resumeUrl: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ success: true, applications });
    }

    // Job seekers: their own applications
    const applications = await prisma.application.findMany({
      where: { userId: session.user.id },
      include: {
        job: {
          include: {
            company: { select: { name: true, logoUrl: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, applications });
  } catch (error) {
    console.error("Error fetching applications:", error);
    return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 });
  }
}
