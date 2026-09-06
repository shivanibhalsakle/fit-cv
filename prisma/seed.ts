/**
 * Seeds the corpus from ShivaniB_Resume.pdf — the authoritative file for
 * titles, employers and dates — using the canonical values recorded in
 * docs/ROADMAP.md §2.
 *
 * This is manual structured entry, not import: bullets are transcribed exactly
 * as written, with no rewording. Bullets from the other seven resumes arrive in
 * Phase 2 via the merge queue, where dedup and conflict review happen.
 *
 * Idempotent — safe to re-run. Facts are keyed by (title, org).
 */
import { PrismaClient, type FactKind } from "@prisma/client";

const prisma = new PrismaClient();

const m = (year: number, month: number) => new Date(Date.UTC(year, month - 1, 1));

type SeedFact = {
  kind: FactKind;
  title: string;
  org?: string;
  location?: string;
  startDate?: Date;
  endDate?: Date;
  isCurrent?: boolean;
  tagline?: string;
  tags?: string[];
  archivedTitles?: string[];
  bullets?: { text: string; metrics?: string[]; tags?: string[] }[];
};

const FACTS: SeedFact[] = [
  // --- Education -----------------------------------------------------------
  {
    kind: "EDUCATION",
    title: "Master of Science, Management of Technology",
    org: "New York University",
    location: "New York, NY",
    startDate: m(2024, 9),
    endDate: m(2026, 5),
    tagline: "GPA: 3.69/4",
    tags: ["graduate"],
    bullets: [
      {
        text: "Relevant Coursework: Business Intelligence, Operations Management, Economics & Strategy, Financial Analysis",
        tags: ["coursework"],
      },
    ],
  },
  {
    kind: "EDUCATION",
    title: "Bachelor of Science, Computer Science, Honors Data Science",
    org: "University of Pune",
    location: "Pune, India",
    startDate: m(2020, 8),
    endDate: m(2024, 5),
    tagline: "GPA: 3.50/4",
    tags: ["undergraduate"],
    archivedTitles: [
      "Bachelors of Engineering, Computer Science (Minor in Data Science)",
    ],
    bullets: [
      {
        text: "Relevant Coursework: Artificial Intelligence, Database Management, Big Data, Cloud Computing, Data Visualization",
        tags: ["coursework"],
      },
    ],
  },

  // --- Certifications ------------------------------------------------------
  { kind: "CERTIFICATION", title: "CAPM", org: "PMI", tags: ["project-management"] },
  { kind: "CERTIFICATION", title: "ECBA", org: "IIBA", tags: ["business-analysis"] },
  {
    kind: "CERTIFICATION",
    title: "Google Project Management Professional Certificate",
    org: "Google",
    tags: ["project-management"],
  },
  {
    kind: "CERTIFICATION",
    title: "BCG Digital Transformation",
    org: "BCG",
    tags: ["strategy", "consulting"],
  },

  // --- Experience ----------------------------------------------------------
  {
    kind: "EXPERIENCE",
    title: "Software Engineer Intern",
    org: "InnovateMore LLC",
    location: "San Antonio, TX",
    startDate: m(2026, 8),
    isCurrent: true,
    tags: ["backend", "mobile", "full-stack"],
    bullets: [
      {
        text: "Developed a cross-platform React Native (Expo) app with 23 screens with Auth0-based authentication and role-based routing.",
        metrics: ["23 screens"],
        tags: ["mobile", "react-native", "auth0"],
      },
      {
        text: "Built a Spring Boot admin-override service for job reassignment, with WebSocket-driven offer cleanup and full audit logging.",
        tags: ["backend", "spring-boot", "websocket"],
      },
      {
        text: "Re-tuned a real-time GPS system by splitting heartbeat cadence into active (10s) and idle (3min) states, fixing a race condition.",
        metrics: ["10s active cadence", "3min idle cadence"],
        tags: ["backend", "real-time", "debugging"],
      },
      {
        text: "Shipped a core user-facing product feature end-to-end across Spring Boot, Next.js, React Native, and AWS Lambda.",
        tags: ["full-stack", "aws", "ownership"],
      },
    ],
  },
  {
    kind: "EXPERIENCE",
    title: "Full Stack Developer Intern",
    org: "Alhansat Solutions Pvt. Ltd.",
    location: "Mumbai, India",
    startDate: m(2022, 12),
    endDate: m(2023, 2),
    tags: ["full-stack", "open-source"],
    archivedTitles: [
      "Web Developer (Winter Intern)",
      "Web Developer (Product Team)",
      "Full Stack Developer Winter Intern",
    ],
    bullets: [
      {
        text: "Engineered a real-time speech-to-text module with Svelte and the Web Speech API, leveraging native browser APIs for low-latency in-browser inference, shipped as part of a 30+ utility open-source developer toolkit adopted by 2,000+ early users.",
        metrics: ["30+ utilities", "2,000+ early users"],
        tags: ["svelte", "web-api", "open-source"],
      },
      {
        text: "Identified a broken community-maintained Firebase adapter, pivoted the CI/CD pipeline to Netlify for native SvelteKit support, and resolved post-launch Android input bugs.",
        tags: ["ci-cd", "debugging", "firebase"],
      },
    ],
  },
  {
    kind: "EXPERIENCE",
    title: "Executive Web Developer",
    org: "SAKSHI",
    location: "New Delhi, India",
    startDate: m(2021, 12),
    endDate: m(2022, 9),
    tags: ["automation", "leadership", "python"],
    archivedTitles: [
      "Product Lead",
      "Tech Lead (Business Strategy)",
      "Business Analyst Intern",
    ],
    bullets: [
      {
        text: "Automated end-to-end certificate generation for a 20,000-certificate volunteer backlog using Python (pandas, openpyxl, Pillow), auto-dispatching personalized certificates via email while leading a rotating team of 3-4 contributors.",
        metrics: ["20,000 certificates", "team of 3-4"],
        tags: ["python", "automation", "team-lead"],
      },
      {
        text: "Implemented greytHR, a HRMS platform automating onboarding, invoicing, and tax workflows, replacing manual processes.",
        tags: ["hrms", "process-automation", "business-analysis"],
      },
    ],
  },
  {
    kind: "EXPERIENCE",
    title: "Developer Intern",
    org: "SAKSHI",
    location: "New Delhi, India",
    startDate: m(2021, 10),
    endDate: m(2021, 11),
    tags: ["backend", "analytics"],
    archivedTitles: ["Business Analyst Intern"],
    bullets: [
      {
        text: "Built REST API endpoints in ASP.NET Core with LINQ-based data access to SQL Server, powering a volunteer management database used by 10,000+ active volunteers.",
        metrics: ["10,000+ active volunteers"],
        tags: ["dotnet", "sql", "api"],
      },
      {
        text: "Used Hotjar to analyze clickstream patterns and session recordings across 3 websites, identifying usability bottlenecks that increased user engagement by 15%.",
        metrics: ["3 websites", "15% engagement increase"],
        tags: ["analytics", "ux-research", "business-analysis"],
      },
    ],
  },

  // --- Projects ------------------------------------------------------------
  {
    kind: "PROJECT",
    title: "Rel-AI Relocation Agent",
    startDate: m(2026, 8),
    endDate: m(2026, 8),
    tagline:
      "An agentic system to help recently relocated people rebuild their fitness, workspace, and outdoor routines",
    tags: ["agentic-ai", "langgraph"],
    bullets: [
      {
        text: "Developed a 27-node LangGraph state machine spanning 7 conversational intents, with per-call tool-budget gating with a deterministic ranking engine across 4 domains, governed by a feedback-driven adjustment loop.",
        metrics: ["27 nodes", "7 intents", "4 domains"],
        tags: ["langgraph", "agentic-ai", "state-machine"],
      },
      {
        text: "Implemented a human-in-the-loop approval system for the app's one side-effecting action (Google Calendar writes) using interrupt/resume primitive, enforced redundantly at 3 independent layers",
        metrics: ["3 independent layers"],
        tags: ["human-in-the-loop", "safety"],
      },
    ],
  },
  {
    kind: "PROJECT",
    title: "Vesper AI",
    startDate: m(2026, 7),
    endDate: m(2026, 7),
    tagline:
      "A mobile sky-forecasting app to recommend and visualize sunrise/sunset viewing spots against user preferences",
    tags: ["mobile", "geospatial", "backend"],
    bullets: [
      {
        text: "Built a personalized sky-condition scoring engine using astronomical computation (astral) and altitude-banded cloud cover forecasting (Open-Meteo), weighted against per-user preference profiles.",
        tags: ["scoring-engine", "forecasting"],
      },
      {
        text: "Executed PostGIS geospatial search over OpenStreetMap data on a FastAPI backend serving a cross-platform Flutter client, with a Celery/Redis job system powering batch scoring and Firebase Cloud Messaging notifications on strong matches.",
        tags: ["postgis", "fastapi", "flutter", "celery"],
      },
    ],
  },
  {
    kind: "PROJECT",
    title: "Surgical Copilot",
    startDate: m(2026, 7),
    endDate: m(2026, 7),
    tagline: "A multi-model ML system for preoperative surgical risk stratification",
    tags: ["machine-learning", "healthcare"],
    bullets: [
      {
        text: "Profiled and cleaned raw clinical data (missing values, outliers, encoding) and engineered derived features for 3 XGBoost models predicting preoperative surgical risk, achieving 91.4%/90.0% ROC-AUC despite severe class imbalance.",
        metrics: ["3 XGBoost models", "91.4%/90.0% ROC-AUC"],
        tags: ["xgboost", "feature-engineering", "ml"],
      },
      {
        text: "Designed a FastAPI backend with strict Pydantic schema validation across 28 clinical input fields and cross-field consistency checks, loading all models once at application startup for low-latency real-time inference.",
        metrics: ["28 clinical input fields"],
        tags: ["fastapi", "pydantic", "inference"],
      },
    ],
  },
];

const SKILLS: Record<string, string[]> = {
  language: ["Python", "SQL", "TypeScript", "Java", "Kotlin", "C#"],
  "tool-platform": [
    "AWS", "Databricks", "Kafka", "Auth0", "Firebase", "PostgreSQL", "Redis",
    "Celery", "Docker", "Google Maps Platform", "GitHub Actions",
    "MS Power BI (Power Query, DAX)", "Swagger/OpenAPI", "Tableau",
  ],
  framework: [
    "LangGraph", "Anthropic Claude SDK", "Spring Boot", "React Native (Expo)",
    "Zustand", "XGBoost", "SHAP", "Pydantic", "FastAPI", "Next.js",
    "ASP.NET Core", "LINQ", "Flutter", "Svelte", "Tailwind CSS",
  ],
  domain: [
    "Agentic AI / LLM Systems", "Machine Learning", "Full-Stack Development",
    "Mobile Development",
  ],
};

async function main() {
  await prisma.contact.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      name: "Shivani Bhalsakle",
      email: "sab10099@nyu.edu",
      phone: "(347) 557 5316",
      location: "New York, NY",
      links: [
        { label: "LinkedIn", url: "https://www.linkedin.com/in/shivani-bhalsakle/" },
        { label: "GitHub", url: "https://github.com/shivanibhalsakle" },
        { label: "Website", url: "https://shivanibhalsakle.com" },
      ],
    },
  });

  await prisma.standingProfile.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  await prisma.targetRules.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  let createdFacts = 0;
  let createdBullets = 0;

  for (const [index, f] of FACTS.entries()) {
    const existing = await prisma.fact.findFirst({
      where: { title: f.title, org: f.org ?? null },
      select: { id: true },
    });
    if (existing) continue;

    const fact = await prisma.fact.create({
      data: {
        kind: f.kind,
        title: f.title,
        org: f.org ?? null,
        location: f.location ?? null,
        startDate: f.startDate ?? null,
        endDate: f.isCurrent ? null : (f.endDate ?? null),
        isCurrent: f.isCurrent ?? false,
        tagline: f.tagline ?? null,
        tags: f.tags ?? [],
        archivedTitles: f.archivedTitles ?? [],
        sortHint: index,
        bullets: {
          create: (f.bullets ?? []).map((b, i) => ({
            canonicalText: b.text,
            metrics: b.metrics ?? [],
            tags: b.tags ?? [],
            sortHint: i,
          })),
        },
      },
      include: { _count: { select: { bullets: true } } },
    });

    createdFacts += 1;
    createdBullets += fact._count.bullets;
  }

  let createdSkills = 0;
  for (const [tag, names] of Object.entries(SKILLS)) {
    for (const name of names) {
      const result = await prisma.skill.upsert({
        where: { name },
        update: {},
        create: { name, tags: [tag] },
      });
      if (result) createdSkills += 1;
    }
  }

  console.log(
    `Seed complete — ${createdFacts} facts, ${createdBullets} bullets, ${createdSkills} skills.`,
  );
  if (createdFacts === 0) {
    console.log("(Facts already present; nothing re-created.)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
