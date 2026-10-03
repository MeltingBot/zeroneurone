import { useDossierStore } from '../stores';
import { getEvaluationModel } from '../utils/evaluation';
import type { EvaluationModel } from '../types';

/** Evaluation model of the open dossier ('zeroneurone' when none is open) */
export function useEvaluationModel(): EvaluationModel {
  return useDossierStore((s) => getEvaluationModel(s.currentDossier));
}
