// Corrections et sérialisation des questions — logique de sécurité serveur :
// jamais de bonne réponse envoyée au navigateur (voir questionsPublic), et
// la correction ne s'exécute jamais côté client.
export function questionsPublic(ids, bank) {
  return ids.map(id => {
    const q = bank.find(x => x.id === id);
    const out = { id: q.id, type: q.type, text: q.text, points: q.points };
    if (q.options) out.options = q.options;
    return out;
  });
}

export function gradeAnswers(questionIds, answers, bank) {
  let score = 0;
  let scoreMax = 0;
  const detail = [];

  questionIds.forEach(id => {
    const q = bank.find(x => x.id === id);
    scoreMax += q.points;
    const given = (answers[id] || "").toString().trim().toLowerCase();
    let correct = false;
    if (q.type === "mcq") {
      correct = given === q.answer.toString().trim().toLowerCase();
    } else {
      const accepted = Array.isArray(q.answer) ? q.answer : [q.answer];
      correct = accepted.some(a => given.includes(a.toString().trim().toLowerCase()));
    }
    if (correct) score += q.points;
    const correctAnswer = Array.isArray(q.answer) ? q.answer.join(" / ") : q.answer;
    detail.push({
      id,
      text: q.text,
      given: answers[id] || "",
      correctAnswer,
      correct,
      points: correct ? q.points : 0,
      max: q.points,
    });
  });

  return { score, scoreMax, detail };
}
