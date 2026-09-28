import { json } from "../_lib/http.js";
import { buildResultPdf } from "../_lib/pdf.js";

// Régénère le PDF de TOUS les résultats déjà enregistrés dans KV, à partir
// des données déjà présentes (score, détail des réponses...) — utile après
// une correction du générateur de PDF (ex. bug d'encodage) pour rattraper
// les résultats dont le PDF avait échoué au moment de la soumission, sans
// demander aux apprenants de repasser l'évaluation. N'envoie aucun email :
// se contente de reconstruire le PDF et de mettre à jour son lien.
//
// Cette route touche l'ensemble des résultats (contrairement au reste de
// l'appli, protégé uniquement par le token non devinable de chaque
// participant) : elle exige donc un secret partagé (ADMIN_SECRET, à
// définir dans wrangler.toml comme ADMIN_EMAIL).
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (!env.ADMIN_SECRET) {
    return json({ status: "error", message: "ADMIN_SECRET non configuré côté serveur." }, 500);
  }
  if (secret !== env.ADMIN_SECRET) {
    return json({ status: "error", message: "Non autorisé." }, 403);
  }

  const results = [];
  let cursor;
  do {
    const page = await env.QCM_KV.list({ prefix: "result:", cursor });
    for (const entry of page.keys) {
      // Exclut les clés "result-pdf:*" qui partagent le même préfixe.
      if (!entry.name.startsWith("result:")) continue;
      const token = entry.name.slice("result:".length);
      const raw = await env.QCM_KV.get(entry.name);
      if (!raw) continue;
      const result = JSON.parse(raw);

      try {
        const pdfBytes = await buildResultPdf(result);
        await env.QCM_KV.put(`result-pdf:${token}`, pdfBytes);
        const resultPdfUrl = new URL(`/api/result-pdf?token=${token}`, request.url).toString();
        await env.QCM_KV.put(entry.name, JSON.stringify({ ...result, resultPdfUrl, pdfError: undefined }));
        results.push({ token, nom: result.nom, email: result.email, score: result.score, scoreMax: result.scoreMax, status: "ok", resultPdfUrl });
      } catch (err) {
        results.push({ token, nom: result.nom, email: result.email, status: "error", error: String(err) });
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  const okCount = results.filter(r => r.status === "ok").length;
  return json({ status: "ok", total: results.length, regenerated: okCount, failed: results.length - okCount, results });
}
