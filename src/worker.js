// Point d'entrée Worker (modèle Cloudflare "Workers + assets statiques").
// Route les appels /api/* vers la même logique que celle utilisée par les
// anciennes Pages Functions (functions/api/*.js, inchangées) ; tout le
// reste retombe automatiquement sur les fichiers statiques de docs/ via
// le binding ASSETS (géré par Cloudflare, pas besoin de le coder ici).
import { onRequestGet as healthGet } from "../functions/api/health.js";
import { onRequestPost as startPost } from "../functions/api/start.js";
import { onRequestPost as violationPost } from "../functions/api/violation.js";
import { onRequestPost as submitPost } from "../functions/api/submit.js";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/health" && request.method === "GET") {
      return healthGet();
    }
    if (pathname === "/api/start" && request.method === "POST") {
      return startPost({ request, env });
    }
    if (pathname === "/api/violation" && request.method === "POST") {
      return violationPost({ request, env });
    }
    if (pathname === "/api/submit" && request.method === "POST") {
      return submitPost({ request, env });
    }

    return env.ASSETS.fetch(request);
  },
};
