export interface ResearchQuestion {
  text: string;
  kind: 'intervention' | 'monitoring' | 'prognosis' | 'physiology';
  population?: string;
}
export interface ScientificEvidence {
  title: string;
  url: string;
  studyDesign: string;
  year: number;
  population: string;
  peerReviewed: boolean;
  journalQuartile?: 1 | 2 | 3 | 4;
  limitations: string[];
}
export interface ResearchProvider {
  search(question: ResearchQuestion): Promise<{
    status: 'available' | 'unavailable' | 'quota-limited';
    evidence: ScientificEvidence[];
    disclosure: string;
  }>;
}
export const consensusAdapter: ResearchProvider = {
  async search() {
    return {
      status: 'unavailable',
      evidence: [],
      disclosure:
        'Live literature verification is unavailable. Consensus is not connected.',
    };
  },
};
