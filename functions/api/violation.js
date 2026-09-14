import { json, readJsonBody } from "../_lib/http.js";
import { QUESTION_BANK } from "../_lib/questions.js";
import { seededShuffledIds } from "../_lib/random.js";
import { questionsPublic } from "../_lib/grading.js";
import { NB_QUESTIONS, SESSION_TTL_SECONDS } from "../_lib/config.js";

export async function onRequestPost({ request, env }) {
  const body = await readJsonBody(request);
  if (!body || !body.token) return json({ status: "error", message: "Requête invalide." }, 400);

  const key = `session:${body.token}`;
  const raw = await env.QCM_KV.get(key);
  if (!raw) return json({ status: "error", message: "Session introuvable." });

  const session = JSON.parse(raw);
  if (session.status === "soumis") return json({ status: "error", message: "Évaluation déjà soumise." });

  session.violationCount += 1;
  const seed = session.nom + "|" + body.token + "|v" + session.violationCount;
  session.questionIds = seededShuffledIds(seed, NB_QUESTIONS, QUESTION_BANK);

  await env.QCM_KV.put(key, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });

  return json({
    status: "ok",
    violationCount: session.violationCount,
    questions: questionsPublic(session.questionIds, QUESTION_BANK),
    message: "Changement de fenêtre détecté : vos réponses ont été effacées et un nouveau tirage de questions a été généré. Le chronomètre continue.",
  });
}
