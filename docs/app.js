// ============================================================
// CONFIGURATION — à adapter après déploiement du backend
// ============================================================
const APPS_SCRIPT_URL = "COLLEZ_ICI_L_URL_DE_VOTRE_DEPLOIEMENT_APPS_SCRIPT";

// ============================================================
// ÉTAT
// ============================================================
let state = {
  token: null,
  startTimeServer: null, // Date ISO renvoyée par le serveur — référence pour le chrono
  dureeMaxMinutes: 90,
  questions: [],
  current: 0,
  answers: {}, // { questionId: valeur }
  submitted: false,
  timerInterval: null,
};

// ============================================================
// UTILITAIRES
// ============================================================
function $(id) { return document.getElementById(id); }

function showScreen(name) {
  ["start", "quiz", "done", "error"].forEach(s => {
    $("screen-" + s).classList.toggle("hidden", s !== name);
  });
}

async function callBackend(payload) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // évite le preflight CORS
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch (e) {
    // La réponse n'est pas du JSON : on affiche le début du contenu reçu
    // (souvent une page d'erreur Google) pour pouvoir diagnostiquer vite,
    // plutôt que le message générique "unexpected character..." du navigateur.
    const apercu = raw.slice(0, 200).replace(/\s+/g, " ").trim();
    throw new Error(
      "Le serveur n'a pas renvoyé de JSON valide. Vérifiez l'URL Apps Script et les " +
      "droits de déploiement (« Tout le monde »). Début de la réponse reçue : " + apercu
    );
  }
}

// ============================================================
// DÉMARRAGE
// ============================================================
$("btn-start").addEventListener("click", async () => {
  const nom = $("input-nom").value.trim();
  if (!nom) {
    $("start-error").textContent = "Merci d'indiquer votre nom et prénom.";
    return;
  }
  $("btn-start").disabled = true;
  $("btn-start").textContent = "Chargement...";

  try {
    const res = await callBackend({ action: "start", nom });
    if (res.status !== "ok") throw new Error(res.message || "Erreur au démarrage.");

    state.token = res.token;
    state.startTimeServer = res.startTime;
    state.dureeMaxMinutes = res.dureeMaxMinutes;
    state.questions = res.questions;
    state.current = 0;
    state.answers = {};

    // Optionnel : tenter le plein écran (non bloquant si refusé/non supporté)
    try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); } catch (e) {}

    showScreen("quiz");
    renderQuestion();
    startTimer();
  } catch (err) {
    $("start-error").textContent = "Erreur : " + err.message;
    $("btn-start").disabled = false;
    $("btn-start").textContent = "Commencer l'évaluation";
  }
});

// ============================================================
// CHRONOMÈTRE — basé sur l'heure de départ envoyée par le SERVEUR,
// pas sur l'horloge locale du stagiaire, pour éviter la triche par
// modification de l'heure de l'appareil.
// ============================================================
function startTimer() {
  updateTimer();
  state.timerInterval = setInterval(updateTimer, 1000);
}

function updateTimer() {
  const start = new Date(state.startTimeServer).getTime();
  const now = Date.now();
  const elapsedSec = Math.floor((now - start) / 1000);
  const totalSec = state.dureeMaxMinutes * 60;
  const remaining = Math.max(0, totalSec - elapsedSec);

  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  $("timer").textContent = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  if (remaining <= 0 && !state.submitted) {
    clearInterval(state.timerInterval);
    submitQuiz(true); // temps écoulé : soumission automatique
  }
}

// ============================================================
// AFFICHAGE DES QUESTIONS
// ============================================================
function renderQuestion() {
  const q = state.questions[state.current];
  $("progress").textContent = `Question ${state.current + 1} / ${state.questions.length}`;
  $("question-text").textContent = q.text;

  const container = $("question-options");
  container.innerHTML = "";

  if (q.type === "mcq") {
    q.options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "option-btn" + (state.answers[q.id] === opt ? " selected" : "");
      btn.textContent = opt;
      btn.addEventListener("click", () => {
        state.answers[q.id] = opt;
        renderQuestion();
      });
      container.appendChild(btn);
    });
  } else {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "text-answer";
    input.placeholder = "Votre réponse";
    input.value = state.answers[q.id] || "";
    input.addEventListener("input", () => { state.answers[q.id] = input.value; });
    container.appendChild(input);
  }

  $("btn-prev").disabled = state.current === 0;
  const isLast = state.current === state.questions.length - 1;
  $("btn-next").classList.toggle("hidden", isLast);
  $("btn-submit").classList.toggle("hidden", !isLast);
}

$("btn-prev").addEventListener("click", () => {
  if (state.current > 0) { state.current--; renderQuestion(); }
});
$("btn-next").addEventListener("click", () => {
  if (state.current < state.questions.length - 1) { state.current++; renderQuestion(); }
});

// ============================================================
// SOUMISSION
// ============================================================
$("btn-submit").addEventListener("click", () => submitQuiz(false));

async function submitQuiz(auto) {
  if (state.submitted) return;
  state.submitted = true;
  clearInterval(state.timerInterval);

  try {
    const res = await callBackend({ action: "submit", token: state.token, answers: state.answers });
    if (res.status !== "ok") throw new Error(res.message || "Erreur lors de l'envoi.");
    $("done-message").textContent = (auto ? "Temps écoulé — " : "") + res.message;
    showScreen("done");
  } catch (err) {
    $("error-message").textContent = err.message;
    showScreen("error");
  }
}

// ============================================================
// ANTI-TRICHE — détection de perte de focus (changement d'onglet,
// changement d'application, minimisation). Impossible d'empêcher
// techniquement le changement de fenêtre depuis une page web ; on
// détecte donc l'événement et on réagit, sans jamais toucher au
// chronomètre (qui reste basé sur l'heure de départ serveur).
// ============================================================
async function handleVisibilityLoss() {
  if (state.submitted || !state.token || state.current === undefined) return;
  if (document.hidden) {
    try {
      const res = await callBackend({ action: "violation", token: state.token });
      if (res.status === "ok") {
        state.questions = res.questions;
        state.answers = {};
        state.current = 0;
        renderQuestion();
        const banner = $("violation-banner");
        banner.classList.remove("hidden");
        setTimeout(() => banner.classList.add("hidden"), 6000);
      }
    } catch (e) {
      // en cas d'échec réseau, on ne bloque pas le stagiaire — le
      // journal des tentatives reste de toute façon côté serveur.
    }
  }
}

document.addEventListener("visibilitychange", handleVisibilityLoss);
window.addEventListener("blur", handleVisibilityLoss);

// Dissuasion basique : clic droit et copier-coller désactivés sur la zone de quiz.
document.addEventListener("contextmenu", e => {
  if (!$("screen-quiz").classList.contains("hidden")) e.preventDefault();
});
