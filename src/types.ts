export type Difficulty = 'Easy' | 'Intermediate' | 'Advanced';

export interface Example {
  tibetan: string;
  translation: string;
}

export interface Word {
  id: string;
  tibetan: string;
  wylie: string;
  partOfSpeech: string;
  correctMeaning: string;
  distractors: string[];
  examples: Example[];
  difficulty: Difficulty;
  notes?: string;
  secondaryMeanings?: string[];
  sources?: string[];
}

export interface UserAnswer {
  questionIndex: number;
  wordId: string;
  selectedOption: string;
  isCorrect: boolean;
}
