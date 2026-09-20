# bodh.

**A calmer way to learn computer science.**

bodh. is a bilingual, AI-powered learning app for students aged 15–20 who want to understand Data Structures & Algorithms. Short lessons, adaptive quizzes, personalized feedback, and a roadmap that evolves with the learner — in **English or Hindi**.

---

## Features

| Feature                       | Description                                                          |
| ----------------------------- | -------------------------------------------------------------------- |
| 📖 **Bilingual lessons**      | Every topic has a full article in English and Hindi                  |
| 🗺️ **Visual mindmaps**        | AI-generated concept maps for each topic                             |
| 🧠 **Adaptive quizzes**       | Five questions per topic, generated via Amazon Bedrock               |
| 🤖 **Teaching team**          | Teacher, Evaluator, and Assessor agents collaborate via `/api/teach` |
| 📊 **Progress dashboard**     | Mastery scores, roadmap recommendations, and next-topic suggestions  |
| 🔐 **Magic-link auth**        | Passwordless sign-in via email verification codes                    |
| 🌐 **Offline-first fallback** | Seed content loads without AWS — the UI never breaks                 |

---

## Tech stack

| Layer            | Technology                                      |
| ---------------- | ----------------------------------------------- |
| Framework        | Next.js 15 (App Router)                         |
| Language         | TypeScript 5                                    |
| Styling          | Vanilla CSS (custom design system)              |
| AI / LLM         | Amazon Bedrock (`amazon.nova-lite-v1:0`)        |
| Agent runtime    | AWS AgentCore (optional, falls back to Bedrock) |
| Content storage  | Amazon S3                                       |
| Data persistence | Amazon DynamoDB                                 |
| Email delivery   | Resend                                          |

---

## Topics covered

`arrays` · `linked-list` · `stacks` · `queues` · `binary-search` · `recursion`

Each topic has seed content in `content/seed/<topic>/en.json` and `hi.json` that loads without any AWS configuration.

---

## Getting started

### Prerequisites

- Node.js 20 or newer
- npm

### Install and run locally

```bash
# From the project root (bodh/)
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app runs fully in local mode without AWS credentials. AI features return a local placeholder; seed content is loaded directly from disk.

### Key routes

| Route                    | Purpose                               |
| ------------------------ | ------------------------------------- |
| `/`                      | Product home page                     |
| `/onboarding`            | Choose a learning starting point      |
| `/onboarding/language`   | Choose English or Hindi               |
| `/learn`                 | Browse the topic library              |
| `/learn/[topic]`         | Topic overview and lesson path        |
| `/learn/[topic]/article` | Read the bilingual lesson article     |
| `/learn/[topic]/mindmap` | Explore the topic visually            |
| `/learn/[topic]/quiz`    | Take a five-question practice quiz    |
| `/dashboard`             | Progress overview and recommendations |
| `/auth`                  | Request and verify a magic-link code  |

**Typical learning flow:** sign in → choose language → pick a topic → read the article → take the quiz → get AI feedback → follow the recommended next topic.

---

## Configuration

Create a `.env.local` file in the project root. All variables are optional for local development — the app degrades gracefully without them.

```bash
# AWS (required for full AI + persistence features)
AWS_REGION=ap-southeast-2
AWS_S3_BUCKET=regional-dsa-learning
AWS_ACCESS_KEY_ID=<your-access-key-id>
AWS_SECRET_ACCESS_KEY=<your-secret-access-key>
AWS_DYNAMODB_TABLE=bodh-students
AWS_AUTH_TABLE=bodh-auth
AWS_STUDENT_RECORD_TABLE=bodh-student-records

# Amazon Bedrock
BEDROCK_MODEL_ID=amazon.nova-lite-v1:0

# Auth (required in production)
AUTH_SECRET=<generate with: openssl rand -base64 32>
JWT_SECRET=<generate with: openssl rand -base64 32>

# Email delivery via Resend (dev prints codes to console without this)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=onboarding@resend.dev

# AgentCore (optional — falls back to direct Bedrock calls)
AGENTCORE_RUNTIME_URL=https://...
```

> **Never commit `.env.local` to source control.** Use IAM roles or AWS SSO for local credentials rather than hard-coding `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.

---

## AWS infrastructure setup

Run the setup script once to provision all required AWS resources:

```bash
chmod +x scripts/setup-aws.sh
./scripts/setup-aws.sh
```

This creates:

- **S3 bucket** — versioned, private, with a 30-day lifecycle on old versions
- **DynamoDB `bodh-students`** — student profiles and roadmaps (`pk` hash key, PAY_PER_REQUEST)
- **DynamoDB `bodh-auth`** — magic-link codes with TTL auto-expiry
- Checks Bedrock model access and prints a console link if activation is needed

---

## Seeding content to S3

After AWS setup, upload all seed articles and mindmaps:

```bash
# PowerShell (Windows)
$env:AWS_REGION="ap-south-1"; $env:AWS_S3_BUCKET="bodh-content-prod"; npx tsx scripts/seed-s3.ts

# bash (Linux / macOS / WSL)
AWS_REGION=ap-south-1 AWS_S3_BUCKET=bodh-content-prod npx tsx scripts/seed-s3.ts
```

Add `SEED_DRY_RUN=true` to preview what would be uploaded without touching S3. Already-uploaded objects are skipped on re-runs.

The script uploads:

- `articles/<topic>/<lang>.json` — one per topic per language (12 total)
- `mindmaps/<topic>.json` — one per topic (6 total), built from the English article

---

## Project structure

```
content/
  seed/<topic>/       Bilingual seed articles (en.json + hi.json)

scripts/
  seed-s3.ts          Upload seed content to S3
  setup-aws.sh        Provision DynamoDB tables and S3 bucket

src/
  app/
    (marketing)/      Home and about pages
    api/              REST endpoints (learn, quiz, teach, progress, auth…)
    auth/             Sign-in and verify pages
    dashboard/        Progress and recommendations
    learn/            Topic library, article, mindmap, and quiz pages
    onboarding/       Language and starting-point selection
  components/
    dashboard/        Progress cards and roadmap UI
    learn/            Article reader, mindmap canvas, topic cards
    quiz/             Quiz session and feedback components
    shared/           Navigation, layout, and reusable atoms
  config/
    topics.ts         Topic slugs, titles, levels, and colors
    languages.ts      Supported language codes (en, hi)
  lib/
    ai/               Prompts, quiz generation, and feedback logic
    agentcore/        Teaching team agent orchestration
    aws/              Bedrock, DynamoDB, and S3 clients
    learning/         Content loading, mindmap generation, roadmap logic
  types/              Shared TypeScript domain types
```

---

## API routes

| Endpoint                 | Method     | Purpose                             |
| ------------------------ | ---------- | ----------------------------------- |
| `/api/learn`             | GET        | Fetch a lesson article              |
| `/api/topics`            | GET        | List all topics with metadata       |
| `/api/quiz/generate`     | POST       | Generate five questions via Bedrock |
| `/api/quiz/submit`       | POST       | Score answers and store progress    |
| `/api/teach`             | POST       | Teaching team multi-agent session   |
| `/api/progress`          | GET / POST | Read or update topic progress       |
| `/api/recommendation`    | GET        | Suggest next topic                  |
| `/api/student`           | GET / POST | Student profile management          |
| `/api/auth/request-code` | POST       | Send magic-link email               |
| `/api/auth/verify`       | POST       | Verify code, issue JWT              |
| `/api/auth/me`           | GET        | Return current session info         |

---

## Available scripts

```bash
npm run dev      # Start the development server (http://localhost:3000)
npm run build    # Create a production build
npm run start    # Serve the production build
npm run lint     # Run ESLint
```

...............................................................................
