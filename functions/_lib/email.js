// Envoi des emails de résultat via l'API Resend (https://resend.com), qui
// offre un vrai niveau gratuit (100 emails/jour, 3000/mois) sans carte
// bancaire.
//
// ATTENTION — limite du niveau gratuit sans domaine vérifié : Resend
// n'autorise l'envoi qu'à l'adresse email du compte Resend lui-même. Pour
// envoyer automatiquement aux participants (adresses arbitraires), un nom
// de domaine doit être vérifié sur Resend (menu Domains, enregistrements
// DNS) — voir README.md. Sans ça, sendParticipantEmail échouera pour toute
// adresse différente de celle du compte Resend.
//
// Un échec d'envoi ne doit jamais bloquer l'enregistrement du résultat,
// déjà en base à ce stade — chaque fonction retourne { sent, reason }
// plutôt que de lever une exception.

function formatSummary({ nom, score, scoreMax, dureeMinutes, violationCount, startTime, endTime }) {
  const pct = scoreMax > 0 ? Math.round((score / scoreMax) * 1000) / 10 : 0;
  return [
    `Participant : ${nom}`,
    `Score : ${score} / ${scoreMax} (${pct}%)`,
    `Durée : ${dureeMinutes} min`,
    `Changements de fenêtre détectés : ${violationCount}`,
    `Début : ${new Date(startTime).toLocaleString("fr-FR")}`,
    `Fin : ${new Date(endTime).toLocaleString("fr-FR")}`,
  ].join("\n");
}

function formatDetail(detail) {
  return detail.map((d, i) => {
    const lines = [
      `${i + 1}. ${d.text}`,
      `   Votre réponse : ${d.given ? d.given : "(sans réponse)"}`,
      `   Réponse attendue : ${d.correctAnswer}`,
      `   → ${d.correct ? "Correct" : "Incorrect"} (${d.points}/${d.max} points)`,
    ];
    return lines.join("\n");
  }).join("\n\n");
}

async function sendViaResend(env, { to, subject, text }) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || "QCM Module 4 <onboarding@resend.dev>",
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, reason: `Resend a répondu ${res.status} : ${body.slice(0, 300)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: String(err) };
  }
}

// Notification courte au formateur (ADMIN_EMAIL, fixé dans wrangler.toml).
export async function sendAdminEmail(env, params) {
  if (!env.RESEND_API_KEY) return { sent: false, reason: "RESEND_API_KEY absent." };
  if (!env.ADMIN_EMAIL) return { sent: false, reason: "ADMIN_EMAIL absent." };
  const text = `Résultat de l'évaluation Module 4\n\n${formatSummary(params)}`;
  return sendViaResend(env, { to: env.ADMIN_EMAIL, subject: `Résultat QCM — ${params.nom}`, text });
}

// Copie complète des réponses envoyée au participant (obligation légale de
// lui fournir une trace de son évaluation). Nécessite un domaine vérifié
// sur Resend pour fonctionner vers une adresse autre que celle du compte.
export async function sendParticipantEmail(env, params) {
  if (!env.RESEND_API_KEY) return { sent: false, reason: "RESEND_API_KEY absent." };
  if (!params.to) return { sent: false, reason: "Adresse email du participant manquante." };
  const text = [
    `Bonjour ${params.nom},`,
    ``,
    `Voici le détail de votre évaluation — Module 4 : Diffusion et distribution du documentaire.`,
    ``,
    formatSummary(params),
    ``,
    `Détail de vos réponses :`,
    ``,
    formatDetail(params.detail),
  ].join("\n");
  return sendViaResend(env, { to: params.to, subject: "Votre résultat — Module 4 : Diffusion et distribution du documentaire", text });
}
