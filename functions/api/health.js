import { json } from "../_lib/http.js";

export async function onRequestGet() {
  return json({ status: "ok", message: "QCM backend actif." });
}
