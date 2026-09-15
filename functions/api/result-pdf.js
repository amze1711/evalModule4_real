import { json } from "../_lib/http.js";

// Sert le PDF déjà généré à la soumission (stocké dans KV sous
// result-pdf:<token>). Le token est un UUID non devinable : c'est le même
// niveau de protection que le reste de l'application (aucune authentification
// formelle n'est mise en place pour le formateur, qui est seul à avoir accès
// aux tokens via le tableau de bord Cloudflare KV).
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return json({ status: "error", message: "Paramètre token manquant." }, 400);

  const bytes = await env.QCM_KV.get(`result-pdf:${token}`, "arrayBuffer");
  if (!bytes) return json({ status: "error", message: "PDF introuvable pour ce token." }, 404);

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="resultat-${token}.pdf"`,
    },
  });
}
