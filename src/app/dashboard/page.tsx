import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { topics } from "@/config/topics";
import { ScoreCard } from "@/components/dashboard/ScoreCard";
import { TopicProgress } from "@/components/dashboard/TopicProgress";
import { RecommendationCard } from "@/components/dashboard/RecommendationCard";
import { getRecommendations } from "@/lib/learning/recommendation";
import {
  readSession,
  DEMO_SESSION,
  sessionCookie,
  DEMO_STUDENT_ID,
} from "@/lib/auth/session";
import { getRoadmap } from "@/lib/learning/roadmap";
import { getStudentRecord } from "@/lib/aws/dynamodb";
import { LogoutButton } from "@/components/ui/LogoutButton";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import {
  LANGUAGE_COOKIE,
  resolveLanguage,
  getTopicTitle,
  getGreeting,
  UI_STRINGS,
} from "@/lib/i18n";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ language?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookie)?.value;
  const userSession = await readSession(token);

  if (!userSession) {
    const allowDemo =
      process.env.ALLOW_DEMO === "true" ||
      process.env.app_ALLOW_DEMO === "true" ||
      process.env.NODE_ENV !== "production";
    if (!allowDemo) {
      redirect("/auth");
    }
  }

  const session = userSession ?? DEMO_SESSION;

  const isDemoUser = session.email === "student_001@bodh.demo";
  const studentId = isDemoUser ? DEMO_STUDENT_ID : session.email;

  // Prefer the fine-grained StudentRecord for per-topic scores
  const record = await getStudentRecord(studentId);
  const roadmap = await getRoadmap(session.email);

  const language = resolveLanguage(
    resolvedSearchParams.language,
    cookieStore.get(LANGUAGE_COOKIE)?.value,
    record?.language,
  );
  const isHindi = language === "hi";
  const strings = UI_STRINGS[language];

  // Build topic score map
  const topicScoreMap = new Map<string, number>();
  if (record) {
    for (const [slug, perf] of Object.entries(record.topics)) {
      topicScoreMap.set(slug, perf.score);
    }
  } else {
    for (const item of roadmap) {
      topicScoreMap.set(item.topicSlug, item.mastery);
    }
  }

  // Overall metrics
  const attempted = topics.filter((t) => (topicScoreMap.get(t.slug) ?? 0) > 0);
  const averageMastery =
    attempted.length > 0
      ? Math.round(
          attempted.reduce((s, t) => s + (topicScoreMap.get(t.slug) ?? 0), 0) /
            attempted.length,
        )
      : 0;
  const lessonsCompleted = record
    ? Object.values(record.topics).reduce((s, t) => s + (t.attempts ?? 0), 0)
    : roadmap.reduce((s, r) => s + r.completedLessons, 0);
  const loginStreak = record?.loginCount ?? 1;

  // Weak topics
  const weakTopics = record
    ? record.weakTopics
    : roadmap
        .filter((r) => r.attempts > 0 && r.mastery < 60)
        .sort((a, b) => a.mastery - b.mastery)
        .map((r) => r.topicSlug);

  const weakestSlug = weakTopics[0];
  const weakestTopic = topics.find((t) => t.slug === weakestSlug);

  const recommendations = getRecommendations(roadmap);
  const greeting = getGreeting(language);

  return (
    <main className="site-shell">
      <nav className="nav">
        <Link className="brand" href={`/?language=${language}`}>
          bodh<span>.</span>
        </Link>

        <div>
          <Link href={`/learn?language=${language}`}>{strings.nav.learn}</Link>
          <LanguageToggle currentLanguage={language} />
          <span className="avatar">{session.name[0].toUpperCase()}</span>
          <LogoutButton language={language} />
        </div>
      </nav>

      <section className="dashboard-header">
        <div>
          <span className="eyebrow">{strings.dashboardPage.spaceEyebrow}</span>
          <h1>
            {greeting}, {session.name}.
          </h1>
          <p>{strings.dashboardPage.keepGoing}</p>
        </div>

        <div className="streak">
          <strong>{loginStreak}</strong>
          <span>
            {strings.dashboardPage.session}
            <br />
            {loginStreak === 1
              ? strings.dashboardPage.start
              : strings.dashboardPage.streak}
          </span>
        </div>
      </section>

      <div className="score-grid">
        <ScoreCard
          label={strings.dashboardPage.lessonsCompleted}
          value={String(lessonsCompleted)}
          detail={strings.dashboardPage.totalAttempts}
        />
        <ScoreCard
          label={strings.dashboardPage.timeLearning}
          value={
            isHindi
              ? `${Math.round(lessonsCompleted * 0.13 * 10) / 10} घंटे`
              : `${Math.round(lessonsCompleted * 0.13 * 10) / 10}h`
          }
          detail={strings.dashboardPage.estimated}
        />
        <ScoreCard
          label={strings.dashboardPage.averageMastery}
          value={`${averageMastery}%`}
          detail={
            attempted.length > 0
              ? strings.dashboardPage.acrossTopics(attempted.length)
              : strings.dashboardPage.noQuizzes
          }
        />
      </div>

      <section className="dashboard-columns">
        <div className="dashboard-panel">
          <div className="section-heading">
            <h2>{strings.dashboardPage.yourProgress}</h2>

            <Link className="text-link" href={`/learn?language=${language}`}>
              {strings.dashboardPage.seeLibrary}
            </Link>
          </div>
          {topics.map((topic) => (
            <TopicProgress
              key={topic.slug}
              title={getTopicTitle(topic.slug, language)}
              value={topicScoreMap.get(topic.slug) ?? 0}
            />
          ))}
        </div>

        <div className="dashboard-side">
          {weakestTopic && (
            <div className="card focus-card">
              <span className="eyebrow">{strings.dashboardPage.focusArea}</span>
              <h3>{getTopicTitle(weakestTopic.slug, language)}</h3>
              <p>
                {topicScoreMap.get(weakestSlug!) === 0
                  ? strings.dashboardPage.notAttemptedDesc
                  : strings.dashboardPage.inProgressDesc(
                      topicScoreMap.get(weakestSlug!)!,
                    )}
              </p>
              <Link
                className="button button-primary"
                href={`/learn/${weakestTopic.slug}?language=${language}`}
              >
                {strings.dashboardPage.startLesson}
              </Link>
            </div>
          )}
          {!weakestTopic && (
            <div className="card focus-card">
              <span className="eyebrow">{strings.dashboardPage.focusArea}</span>
              <h3>{getTopicTitle("arrays", language)}</h3>
              <p>{strings.dashboardPage.welcomeCardDesc}</p>
              <Link
                className="button button-primary"
                href={`/learn/arrays/quiz?language=${language}`}
              >
                {strings.dashboardPage.startLesson}
              </Link>
            </div>
          )}
          {recommendations.map((recommendation) => (
            <RecommendationCard
              key={recommendation.topicSlug}
              recommendation={recommendation}
              language={language}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
