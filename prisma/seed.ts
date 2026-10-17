import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create admin user — password from env or a secure default for dev only
  const adminPw = process.env.ADMIN_SEED_PASSWORD || "Admin@123!Dev";
  const adminPassword = await bcrypt.hash(adminPw, 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@nextstep.in" },
    update: {},
    create: {
      email: "admin@nextstep.in",
      name: "NEXT STEP Admin",
      password: adminPassword,
      role: "ADMIN",
    },
  });
  console.log("Admin user created:", admin.email);

  // Create employer user
  const employerPassword = await bcrypt.hash("Employer@123", 12);
  const employer = await prisma.user.upsert({
    where: { email: "employer@technova.in" },
    update: {},
    create: {
      email: "employer@technova.in",
      name: "TechNova HR",
      password: employerPassword,
      role: "EMPLOYER",
    },
  });

  // Create company for employer
  const company = await prisma.company.upsert({
    where: { userId: employer.id },
    update: {},
    create: {
      name: "TechNova Solutions",
      description: "Leading technology solutions company in India",
      location: "Bangalore, India",
      industry: "Technology",
      size: "50-200",
      userId: employer.id,
    },
  });
  console.log("Employer + company created:", employer.email);

  // Seed jobs
  const jobs = [
    {
      title: "Software Developer",
      description: "We are looking for a passionate Software Developer to join our growing team. You will work on building scalable web applications using modern technologies. This is an excellent opportunity for fresh graduates who are eager to learn and grow in a dynamic startup environment.",
      category: "Technology",
      type: "Full Time",
      salary: "4.5 - 6.5 LPA",
      location: "Bangalore, India",
      deadline: new Date("2026-05-15"),
      experience: "Freshers / 0-1 Years",
      requirements: [
        "B.Tech/B.E. in Computer Science or related field",
        "Proficiency in JavaScript, HTML, CSS",
        "Knowledge of React.js or Angular",
        "Basic understanding of Node.js and REST APIs",
        "Familiarity with Git version control",
        "Strong problem-solving skills",
      ],
      applyLink: "https://example.com/apply/software-developer",
      isUrgent: true,
      isFeatured: true,
      color: "#6366f1",
      companyId: company.id,
    },
    {
      title: "Digital Marketing Executive",
      description: "Join our creative marketing team and help brands grow their digital presence. You will manage social media campaigns, SEO strategies, and content marketing initiatives for a diverse portfolio of clients across India.",
      category: "Marketing",
      type: "Full Time",
      salary: "3.0 - 4.5 LPA",
      location: "Mumbai, India",
      deadline: new Date("2026-04-30"),
      experience: "Freshers / 0-1 Years",
      requirements: [
        "MBA/BBA in Marketing or related field",
        "Understanding of SEO, SEM, and social media marketing",
        "Experience with Google Analytics and Ads",
        "Excellent written and verbal communication",
        "Creative thinking and attention to detail",
      ],
      applyLink: "https://example.com/apply/digital-marketing",
      isFeatured: true,
      color: "#f59e0b",
      companyId: company.id,
    },
    {
      title: "Finance Analyst Intern",
      description: "Kickstart your career in finance with a hands-on internship. You will assist senior analysts with financial modelling, market research, and investment analysis. Top performers will be offered full-time positions upon completion.",
      category: "Finance",
      type: "Internship",
      salary: "15,000 - 20,000/month",
      location: "Delhi NCR, India",
      deadline: new Date("2026-04-20"),
      experience: "Freshers",
      requirements: [
        "B.Com/BBA/MBA in Finance or related field",
        "Strong analytical and quantitative skills",
        "Proficiency in MS Excel and financial modelling",
        "Basic understanding of equity and debt markets",
      ],
      applyLink: "https://example.com/apply/finance-intern",
      isUrgent: true,
      color: "#10b981",
      companyId: company.id,
    },
    {
      title: "UI/UX Designer",
      description: "We are seeking a creative UI/UX Designer who can translate user needs into intuitive and visually appealing interfaces. You will collaborate with product managers and developers to design seamless digital experiences.",
      category: "Design",
      type: "Full Time",
      salary: "3.5 - 5.5 LPA",
      location: "Hyderabad, India",
      deadline: new Date("2026-05-10"),
      experience: "Freshers / 0-1 Years",
      requirements: [
        "Degree in Design, HCI, or related field",
        "Proficiency in Figma, Adobe XD, or Sketch",
        "Strong portfolio showcasing UI/UX projects",
        "Understanding of user research and usability testing",
      ],
      isFeatured: true,
      color: "#ec4899",
      companyId: company.id,
    },
    {
      title: "HR Executive",
      description: "Join our HR team and play a key role in talent acquisition, employee engagement, and HR operations. This role is ideal for fresh graduates who are passionate about building great workplace cultures.",
      category: "HR",
      type: "Full Time",
      salary: "3.0 - 4.0 LPA",
      location: "Pune, India",
      deadline: new Date("2026-05-01"),
      experience: "Freshers / 0-1 Years",
      requirements: [
        "MBA/BBA in Human Resources or related field",
        "Strong interpersonal and communication skills",
        "Knowledge of recruitment and onboarding processes",
      ],
      color: "#8b5cf6",
      companyId: company.id,
    },
    {
      title: "Content Writer",
      description: "We are looking for a talented Content Writer who can craft engaging blog posts, articles, and website copy. You will work remotely with our editorial team to produce high-quality content across various industries.",
      category: "Content Writing",
      type: "Part Time",
      salary: "2.5 - 3.5 LPA",
      location: "Remote (India)",
      deadline: new Date("2026-05-20"),
      experience: "Freshers / 0-1 Years",
      requirements: [
        "Degree in English, Journalism, or Mass Communication",
        "Excellent command of written English",
        "Ability to write SEO-friendly content",
        "Experience with WordPress or similar CMS",
      ],
      color: "#06b6d4",
      companyId: company.id,
    },
  ];

  for (const job of jobs) {
    await prisma.job.create({ data: job });
  }
  console.log(`${jobs.length} jobs seeded`);

  // Create a sample job seeker
  const seekerPassword = await bcrypt.hash("Seeker@123", 12);
  await prisma.user.upsert({
    where: { email: "rahul@example.com" },
    update: {},
    create: {
      email: "rahul@example.com",
      name: "Rahul Kumar",
      password: seekerPassword,
      role: "JOB_SEEKER",
      bio: "Fresh CS graduate looking for software development roles",
    },
  });
  console.log("Sample job seeker created: rahul@example.com");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
