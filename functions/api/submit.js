import { json, readJsonBody } from "../_lib/http.js";
import { QUESTION_BANK } from "../_lib/questions.js";
import { gradeAnswers } from "../_lib/grading.js";
import { sendResultEmail } from "../_lib/email.js";
import { SESSION_TTL_SECONDS } from "../_lib/config.js";

export async function onRequestPost({ request, env }) {
  const body = await readJsonBody(request);
  if (!body || !body.token) return json({ status: "error", message: "Requête invalide." }, 400);

  const key = `session:${body.token}`;
  const raw = await env.QCM_KV.get(key);
  if (!raw) return json({ status: "error", message: "Session introuvable." });

  const session = JSON.parse(raw);
  if (session.status === "soumis") return json({ status: "error", message: "Évaluation déjà soumise." });

  const answers = body.answers || {};
  const startTime = new Date(session.startTime);
  const endTime = new Date();
  const dureeMinutes = Math.round(((endTime - startTime) / 60000) * 10) / 10;

  const { score, scoreMax, detail } = gradeAnswers(session.questionIds, answers, QUESTION_BANK);

  session.status = "soumis";
  await env.QCM_KV.put(key, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });

  const result = {
    token: body.token,
    nom: session.nom,
    startTime: session.startTime,
    endTime: endTime.toISOString(),
    dureeMinutes,
    violationCount: session.violationCount,
    score,
    scoreMax,
    detail,
  };
  await env.QCM_KV.put(`result:${body.token}`, JSON.stringify(result));

  const emailResult = await sendResultEmail(env, {
    nom: session.nom,
    score,
    scoreMax,
    dureeMinutes,
    violationCount: session.violationCount,
    startTime: session.startTime,
    endTime: result.endTime,
  });
  // L'échec d'envoi d'email ne doit jamais bloquer l'enregistrement du résultat
  // (déjà écrit ci-dessus) ; on note simplement le statut de l'envoi dans le
  // même enregistrement, consultable dans KV, pour pouvoir diagnostiquer sans
  // avoir besoin des logs Cloudflare.
  await env.QCM_KV.put(`result:${body.token}`, JSON.stringify({
    ...result,
    emailSent: emailResult.sent,
    emailDebug: emailResult.sent ? undefined : emailResult.reason,
  }));

  return json({
    status: "ok",
    message: "Vos réponses ont été enregistrées. Votre note vous sera communiquée après validation par le formateur.",
  });
}
