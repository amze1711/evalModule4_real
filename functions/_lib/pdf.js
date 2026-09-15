// Génération du PDF de résultat via pdf-lib (bibliothèque JS pure, sans
// dépendance native ni service externe — fonctionne directement dans le
// Worker Cloudflare, contrairement à la plupart des générateurs PDF qui
// nécessitent Node.js ou un navigateur headless).
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { scoreLevel } from "./grading.js";

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function wrapText(text, font, size, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildResultPdf({
  nom, email, score, scoreMax, dureeMinutes, violationCount, startTime, endTime, detail,
}) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(needed) {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function drawLine(text, { size = 10, bold = false, color, gap = 4 } = {}) {
    const f = bold ? fontBold : font;
    const c = color || rgb(0.11, 0.11, 0.18); // proche de --ink du frontend
    for (const line of wrapText(text, f, size, CONTENT_WIDTH)) {
      ensureSpace(size + gap);
      page.drawText(line, { x: MARGIN, y, size, font: f, color: c });
      y -= size + gap;
    }
  }

  function drawRule() {
    ensureSpace(12);
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.75,
      color: rgb(0.89, 0.89, 0.92), // --border
    });
    y -= 14;
  }

  const { pct, note20, label } = scoreLevel(score, scoreMax);
  const levelColor = pct < 50 ? rgb(0.84, 0.15, 0.24) // rouge — non acquis
    : pct < 75 ? rgb(0.80, 0.52, 0.06) // orange — en cours d'acquisition
    : rgb(0.13, 0.5, 0.24); // vert — acquis

  drawLine("Résultat d'évaluation", { size: 18, bold: true, gap: 6 });
  drawLine("Module 4 — Diffusion et distribution du documentaire", { size: 12, gap: 16, color: rgb(0.42, 0.42, 0.46) });

  drawLine(`Participant : ${nom}`, { size: 11 });
  if (email) drawLine(`Email : ${email}`, { size: 11 });
  drawLine(`Score : ${score} / ${scoreMax} (${pct}%) — ${note20}/20`, { size: 13, bold: true, color: levelColor });
  drawLine(`Niveau d'acquisition : ${label}`, { size: 12, bold: true, gap: 10, color: levelColor });
  drawLine(`Durée : ${dureeMinutes} min`, { size: 11 });
  drawLine(`Changements de fenêtre détectés : ${violationCount}`, { size: 11 });
  drawLine(`Début : ${new Date(startTime).toLocaleString("fr-FR")}`, { size: 11 });
  drawLine(`Fin : ${new Date(endTime).toLocaleString("fr-FR")}`, { size: 11, gap: 16 });

  drawRule();
  drawLine("Détail des réponses", { size: 13, bold: true, gap: 12 });

  detail.forEach((d, i) => {
    ensureSpace(20);
    drawLine(`${i + 1}. ${d.text}`, { size: 10, bold: true, gap: 3 });
    drawLine(`Votre réponse : ${d.given || "(sans réponse)"}`, { size: 10, gap: 3 });
    drawLine(`Réponse attendue : ${d.correctAnswer}`, { size: 10, gap: 3, color: rgb(0.42, 0.42, 0.46) });
    drawLine(
      `${d.correct ? "Correct" : "Incorrect"} (${d.points}/${d.max} point${d.max > 1 ? "s" : ""})`,
      { size: 10, bold: true, gap: 14, color: d.correct ? rgb(0.13, 0.5, 0.24) : rgb(0.84, 0.15, 0.24) },
    );
  });

  // useObjectStreams: false évite la passe de compression des object streams
  // (coûteuse en CPU pour un gain de taille négligeable sur un PDF de
  // quelques pages) — utile sous la limite de temps CPU des Workers Cloudflare.
  return pdfDoc.save({ useObjectStreams: false }); // Uint8Array
}
