# NEXT STEP — Setup Guide

Complete guide to set up and run the Next Step Career Portal on a new system.

---

## Prerequisites

Install these on your system before starting:

| Tool | Version | Download |
|------|---------|----------|
| **Node.js** | v18.17 or higher | https://nodejs.org |
| **npm** | v9+ (comes with Node.js) | Included with Node.js |
| **PostgreSQL** | v14+ | https://www.postgresql.org/download |
| **Git** | Latest | https://git-scm.com/downloads |

### Optional (for full features)

| Tool | Purpose | Link |
|------|---------|------|
| **Redis** | Caching & session store | https://redis.io/download |
| **AWS Account** | S3 file uploads (resumes/logos) | https://aws.amazon.com |

---

## Step 1: Clone or Copy the Project

```bash
# If using Git
git clone <your-repo-url>
cd next-app

# Or if copying manually, copy the entire next-app folder
# Do NOT copy node_modules/ or .next/ — they will be regenerated
```

---

## Step 2: Install Dependencies

```bash
npm install
```

This installs all packages listed in `package.json`. The `package-lock.json` ensures exact versions match.

---

## Step 3: Set Up Environment Variables

```bash
cp .env.example .env
```

Open `.env` in a text editor and fill in the values:

### Required Variables

```env
# Database — PostgreSQL connection string
DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/nextstep?schema=public"

# NextAuth — Authentication
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-a-random-secret-here"
```

**To generate NEXTAUTH_SECRET**, run:
```bash
openssl rand -base64 32
```
Or use any random string generator (minimum 32 characters).

### Optional Variables

```env
# Redis — Caching (app works without it, just no caching)
REDIS_URL="redis://localhost:6379"

# AWS S3 — File uploads (resume/logo upload won't work without this)
AWS_ACCESS_KEY_ID="your-aws-access-key"
AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
AWS_REGION="ap-south-1"
AWS_S3_BUCKET="your-bucket-name"

# App Config
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## Step 4: Set Up the Database

### 4a. Create the PostgreSQL Database

Open your PostgreSQL client (psql, pgAdmin, or any GUI) and create a database:

```sql
CREATE DATABASE nextstep;
```

Or via terminal:
```bash
psql -U postgres -c "CREATE DATABASE nextstep;"
```

### 4b. Push the Schema to the Database

This creates all tables defined in `prisma/schema.prisma`:

```bash
npm run db:push
```

You should see output like:
```
Your database is now in sync with your Prisma schema.
```

### 4c. Seed the Database (Optional but Recommended)

This creates test data — an admin user, an employer, a company, and sample jobs:

```bash
npm run db:seed
```

**Seeded accounts:**

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@nextstep.in | Admin@123 |
| Employer | employer@technova.in | Employer@123 |

### 4d. Explore the Database (Optional)

Prisma Studio gives you a visual database browser:

```bash
npm run db:studio
```

Opens at http://localhost:5555

---

## Step 5: Run the Development Server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

---

## Step 6: Build for Production

```bash
npm run build
npm start
```

---

## Project Structure

```
next-app/
├── prisma/
│   ├── schema.prisma        # Database schema (all models/tables)
│   ├── prisma.config.ts     # Prisma 7 configuration
│   └── seed.ts              # Database seed script
├── public/                   # Static assets
├── src/
│   ├── app/                  # Next.js App Router pages & API routes
│   │   ├── page.tsx          # Home page
│   │   ├── layout.tsx        # Root layout
│   │   ├── globals.css       # Global styles & Tailwind theme
│   │   ├── admin/            # Admin dashboard
│   │   ├── auth/             # Sign in & Register pages
│   │   ├── consulting/       # Career consulting page
│   │   ├── dashboard/        # Job seeker dashboard
│   │   ├── employer/         # Employer dashboard
│   │   ├── jobs/[id]/        # Job detail page
│   │   ├── resources/        # Career resources page
│   │   └── api/              # API routes
│   │       ├── auth/         # NextAuth + registration
│   │       ├── jobs/         # CRUD for job listings
│   │       ├── applications/ # Job applications
│   │       ├── saved-jobs/   # Save/unsave jobs
│   │       ├── contact/      # Contact form
│   │       ├── newsletter/   # Newsletter subscription
│   │       └── upload/       # File upload (S3)
│   ├── components/           # Reusable UI components
│   │   ├── home/             # Hero, TrustBar, HowItWorks, etc.
│   │   ├── jobs/             # JobCard, JobGrid, CategoryCard, etc.
│   │   ├── layout/           # Navbar, Footer, AppShell
│   │   └── ui/               # Modal, SearchBar, WhatsAppModal
│   └── lib/                  # Shared utilities & config
│       ├── auth.ts           # NextAuth configuration
│       ├── prisma.ts         # Database client (Prisma)
│       ├── redis.ts          # Cache helpers
│       ├── s3.ts             # AWS S3 file upload
│       ├── validations.ts    # Zod schemas for input validation
│       ├── rate-limit.ts     # API rate limiting
│       ├── constants.ts      # App constants
│       └── helpers.ts        # Utility functions
├── .env.example              # Environment variable template
├── next.config.ts            # Next.js configuration
├── package.json              # Dependencies & scripts
├── postcss.config.mjs        # PostCSS (Tailwind v4)
└── tsconfig.json             # TypeScript configuration
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (http://localhost:3000) |
| `npm run build` | Create production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Push schema changes to database |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed database with test data |
| `npm run db:studio` | Open Prisma Studio (database GUI) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 + TypeScript + Tailwind CSS v4 |
| **Authentication** | NextAuth.js v4 (JWT + Credentials) |
| **Database** | PostgreSQL + Prisma 7 ORM |
| **Caching** | Redis (optional) |
| **File Storage** | AWS S3 |
| **Validation** | Zod |
| **Security** | Rate limiting, security headers (HSTS, CSP, etc.) |
| **Hosting** | Vercel (recommended) |

---

## User Roles

| Role | Access |
|------|--------|
| **Job Seeker** | Browse jobs, apply, save jobs, upload resume, dashboard |
| **Employer** | Post jobs, manage listings, view applications, company profile |
| **Admin** | Full access — manage all jobs, users, and settings |

---

## Deploying to Vercel

1. Push your code to GitHub
2. Go to https://vercel.com and import your repository
3. Set environment variables in Vercel dashboard (same as `.env`)
4. Vercel auto-detects Next.js — deploy happens automatically
5. After deploy, update `NEXTAUTH_URL` to your Vercel domain

### Database for Production

Use a managed PostgreSQL service:
- **Neon** (free tier) — https://neon.tech
- **Supabase** (free tier) — https://supabase.com
- **Railway** — https://railway.app
- **AWS RDS** — https://aws.amazon.com/rds

After setting up, copy the connection string to `DATABASE_URL` in Vercel environment variables, then run:
```bash
npx prisma db push
npx prisma db seed
```

---

## Troubleshooting

### "Cannot find module" errors
```bash
rm -rf node_modules
npm install
```

### Prisma errors after schema changes
```bash
npx prisma generate
npm run db:push
```

### "NEXTAUTH_SECRET missing" warning
Generate and set the secret:
```bash
openssl rand -base64 32
# Copy the output to NEXTAUTH_SECRET in .env
```

### Port 3000 already in use
```bash
# Find and kill the process
npx kill-port 3000
# Or use a different port
npm run dev -- -p 3001
```

### Database connection refused
- Ensure PostgreSQL is running
- Check `DATABASE_URL` format: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`
- Default PostgreSQL port is `5432`

---

## Need Help?

- **Next.js Docs**: https://nextjs.org/docs
- **Prisma Docs**: https://www.prisma.io/docs
- **NextAuth Docs**: https://next-auth.js.org
- **Tailwind CSS v4**: https://tailwindcss.com/docs
