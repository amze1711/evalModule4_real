import { json } from "../_lib/http.js";
import { buildResultPdf } from "../_lib/pdf.js";
import { scoreLevel } from "../_lib/grading.js";

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
//
// Par défaut, la réponse est une page HTML avec un lien de téléchargement
// cliquable par participant (le JSON brut n'est pas cliquable dans un
// navigateur) ; ajoutez &format=json pour l'usage programmatique.
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function renderHtml(results) {
  const rows = results.map(r => {
    const note = r.status === "ok" ? scoreLevel(r.score, r.scoreMax) : null;
    return `
      <tr>
        <td>${escapeHtml(r.nom || "")}</td>
        <td>${escapeHtml(r.email || "")}</td>
        <td>${note ? `${r.score} / ${r.scoreMax} (${note.note20}/20 — ${escapeHtml(note.label)})` : "—"}</td>
        <td>${r.status === "ok"
          ? `<a class="dl" href="${escapeHtml(r.resultPdfUrl)}">Télécharger le PDF</a>`
          : `<span class="err" title="${escapeHtml(r.error || "")}">Échec</span>`}</td>
      </tr>`;
  }).join("");

  return `<!doctype html>
<html lang="fr"><head><meta charset="UTF-8" />
<title>Résultats — PDF régénérés</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 24px auto; padding: 0 16px; color: #1c1c2e; }
  h1 { font-size: 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e4e4e8; font-size: 14px; }
  th { background: #f4f4f0; }
  a.dl { color: #fff; background: #d62636; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 13px; }
  span.err { color: #d62636; font-weight: bold; }
  .summary { color: #6b6b76; font-size: 13px; }
</style></head>
<body>
  <h1>Résultats de l'évaluation — PDF régénérés</h1>
  <p class="summary">${results.length} résultat(s) — ${results.filter(r => r.status === "ok").length} PDF prêt(s) au téléchargement.</p>
  <table>
    <thead><tr><th>Participant</th><th>Email</th><th>Score</th><th>PDF</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body></html>`;
}

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

  if (url.searchParams.get("format") === "json") {
    const okCount = results.filter(r => r.status === "ok").length;
    return json({ status: "ok", total: results.length, regenerated: okCount, failed: results.length - okCount, results });
  }

  return new Response(renderHtml(results), { headers: { "Content-Type": "text/html;charset=utf-8" } });
}
