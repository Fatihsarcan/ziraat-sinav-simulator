import { notFound, redirect } from "next/navigation";
import { db } from "../../../lib/server.ts";
import { getSessionState } from "../../../core/exam-engine.ts";
import { ExamRunner } from "./exam-runner.tsx";

export const dynamic = "force-dynamic";

export default async function ExamRunnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isFinite(sessionId)) notFound();

  // db() suresi dolmus oturumlari otomatik teslim eder; sonrasinda durum okunur.
  const state = getSessionState(sessionId, db());
  if (!state) notFound();

  if (state.session.status !== "in_progress") {
    redirect(`/exam/${sessionId}/result`);
  }

  // Sinav calistirici tam ekran kullanir; uygulama kabugunun ic bosluklari
  // negatif margin ile geri alinir (Nav zaten bu rotada gizleniyor).
  return (
    <div className="-mx-4 -my-6">
      <ExamRunner
        sessionId={sessionId}
        label={state.session.label}
        isFullExam={state.session.mode === "full_exam"}
        questions={state.questions}
        initialRemainingSeconds={state.remainingSeconds}
        sectionRanges={state.sectionRanges}
      />
    </div>
  );
}
