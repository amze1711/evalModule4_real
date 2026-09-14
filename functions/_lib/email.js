// Envoi du résultat par email via l'API Resend (https://resend.com), qui
// offre un vrai niveau gratuit (100 emails/jour, 3000/mois) sans carte
// bancaire. Sans domaine vérifié, Resend n'autorise l'envoi qu'à l'adresse
// email du compte Resend lui-même — voir README.md. Un échec d'envoi ne
// doit jamais bloquer l'enregistrement du résultat, déjà en base à ce stade.
export async function sendResultEmail(env, { nom, score, scoreMax, dureeMinutes, violationCount, startTime, endTime }) {
  if (!env.RESEND_API_KEY || !env.ADMIN_EMAIL) return { sent: false, reason: "Configuration email absente." };

  const pct = scoreMax > 0 ? Math.round((score / scoreMax) * 1000) / 10 : 0;
  const text = [
    `Résultat de l'évaluation Module 4`,
    ``,
    `Participant : ${nom}`,
    `Score : ${score} / ${scoreMax} (${pct}%)`,
    `Durée : ${dureeMinutes} min`,
    `Changements de fenêtre détectés : ${violationCount}`,
    `Début : ${new Date(startTime).toLocaleString("fr-FR")}`,
    `Fin : ${new Date(endTime).toLocaleString("fr-FR")}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || "QCM Module 4 <onboarding@resend.dev>",
        to: [env.ADMIN_EMAIL],
        subject: `Résultat QCM — ${nom}`,
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
