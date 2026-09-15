import { json, readJsonBody } from "../_lib/http.js";
import { QUESTION_BANK } from "../_lib/questions.js";
import { seededShuffledIds } from "../_lib/random.js";
import { questionsPublic } from "../_lib/grading.js";
import { NB_QUESTIONS, DUREE_MAX_MINUTES, SESSION_TTL_SECONDS } from "../_lib/config.js";

export async function onRequestPost({ request, env }) {
  const body = await readJsonBody(request);
  if (!body) return json({ status: "error", message: "Requête invalide." }, 400);

  const nom = (body.nom || "").toString().trim();
  if (!nom) return json({ status: "error", message: "Nom requis." });
  if (nom.length > 200) return json({ status: "error", message: "Nom trop long." });

  const email = (body.email || "").toString().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ status: "error", message: "Adresse email invalide." });
  }

  const token = crypto.randomUUID();
  const startTime = new Date();
  const seed = nom + "|" + token;
  const questionIds = seededShuffledIds(seed, NB_QUESTIONS, QUESTION_BANK);

  const session = {
    nom,
    email,
    startTime: startTime.toISOString(),
    questionIds,
    violationCount: 0,
    status: "en_cours",
  };

  await env.QCM_KV.put(`session:${token}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  return json({
    status: "ok",
    token,
    startTime: session.startTime,
    dureeMaxMinutes: DUREE_MAX_MINUTES,
    questions: questionsPublic(questionIds, QUESTION_BANK),
  });
}
