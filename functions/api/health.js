import { json } from "../_lib/http.js";

// N'expose jamais les valeurs des secrets, seulement s'ils sont présents —
// utile pour diagnostiquer une variable d'environnement manquante ou mal
// nommée sans avoir besoin des logs Cloudflare.
export async function onRequestGet({ env }) {
  return json({
    status: "ok",
    message: "QCM backend actif.",
    email_config: {
      RESEND_API_KEY: Boolean(env.RESEND_API_KEY),
      ADMIN_EMAIL: Boolean(env.ADMIN_EMAIL),
    },
  });
}
