import { json, readJsonBody } from "../_lib/http.js";
import { QUESTION_BANK } from "../_lib/questions.js";
import { gradeAnswers } from "../_lib/grading.js";
import { sendAdminEmail, sendParticipantEmail, buildParticipantEmailText } from "../_lib/email.js";
import { buildResultPdf } from "../_lib/pdf.js";
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
    email: session.email,
    startTime: session.startTime,
    endTime: endTime.toISOString(),
    dureeMinutes,
    violationCount: session.violationCount,
    score,
    scoreMax,
    detail,
  };
  await env.QCM_KV.put(`result:${body.token}`, JSON.stringify(result));

  const emailParams = {
    nom: session.nom,
    email: session.email,
    score,
    scoreMax,
    dureeMinutes,
    violationCount: session.violationCount,
    startTime: session.startTime,
    endTime: result.endTime,
    detail,
  };

  // PDF mis en forme (score + détail complet), stocké à part dans KV en
  // binaire brut (pas de base64 dans le JSON, plus compact). Utilisé à la
  // fois pour le téléchargement manuel (/api/result-pdf) et comme pièce
  // jointe automatique dès qu'un domaine Resend sera vérifié.
  let pdfBytes = null;
  let pdfError = null;
  try {
    pdfBytes = await buildResultPdf(emailParams);
    await env.QCM_KV.put(`result-pdf:${body.token}`, pdfBytes);
  } catch (err) {
    pdfError = String(err);
  }

  const resultPdfUrl = new URL(`/api/result-pdf?token=${body.token}`, request.url).toString();

  // Le lien de téléchargement est inclus dans le TEXTE de l'email (pas
  // seulement en pièce jointe binaire) : si l'attachement échoue pour une
  // raison quelconque côté Resend/client mail, le lien reste un moyen fiable
  // de récupérer le PDF. Si la génération elle-même a échoué, on le signale
  // explicitement plutôt que de laisser l'absence de PDF passer inaperçue.
  const emailParamsWithPdf = {
    ...emailParams,
    resultPdfUrl: pdfBytes ? resultPdfUrl : null,
    pdfGenerationFailed: !pdfBytes,
  };

  // Le formateur reçoit en plus le détail technique de l'erreur (utile pour
  // diagnostiquer), jamais montré au participant.
  const adminEmailResult = await sendAdminEmail(env, { ...emailParamsWithPdf, pdfBytes, pdfErrorDetail: pdfError });
  const participantEmailResult = await sendParticipantEmail(env, { ...emailParamsWithPdf, to: session.email, pdfBytes });

  // L'échec d'un envoi (ou des deux) ne doit jamais bloquer l'enregistrement
  // du résultat, déjà écrit ci-dessus. On note le statut de chaque envoi, et
  // on stocke systématiquement le texte complet prêt à copier-coller
  // (participantEmailText) et le lien du PDF : tant qu'aucun domaine n'est
  // vérifié sur Resend, l'envoi automatique au participant échoue et ces
  // deux éléments servent à l'envoi manuel de secours — voir README.md.
  await env.QCM_KV.put(`result:${body.token}`, JSON.stringify({
    ...result,
    adminEmailSent: adminEmailResult.sent,
    adminEmailDebug: adminEmailResult.sent ? undefined : adminEmailResult.reason,
    participantEmailSent: participantEmailResult.sent,
    participantEmailDebug: participantEmailResult.sent ? undefined : participantEmailResult.reason,
    participantEmailText: buildParticipantEmailText({ ...emailParamsWithPdf, to: session.email }),
    resultPdfUrl: pdfBytes ? resultPdfUrl : undefined,
    pdfError: pdfError || undefined,
  }));

  const message = participantEmailResult.sent
    ? `Vos réponses ont été enregistrées. Le détail de votre évaluation vous a été envoyé à ${session.email}.`
    : "Vos réponses ont été enregistrées. Le détail de votre évaluation vous sera transmis par le formateur.";

  return json({ status: "ok", message });
}
