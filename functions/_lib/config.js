// Réglages généraux de l'évaluation.
export const NB_QUESTIONS = 40;
export const DUREE_MAX_MINUTES = 90;

// Durée de vie d'une session "en cours" dans le stockage KV (en secondes).
// Largement supérieure à la durée max de l'épreuve, pour laisser une marge
// en cas de soumission tardive, sans garder indéfiniment des sessions abandonnées.
export const SESSION_TTL_SECONDS = 6 * 60 * 60; // 6h
