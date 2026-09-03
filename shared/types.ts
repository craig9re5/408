export type StudyArea = "408" | "math" | "english" | "politics";

export type SectionProgress = {
  learned: boolean;
  learnedAt: string;
  reviewed: boolean;
  reviewedAt: string;
  plannedAt: string;
  reviewedPlannedAt: string;
  isCurrent: boolean;
};

export type ProgressValue = SectionProgress;

export type ProgressMap = Record<string, SectionProgress>;

export type PlanChangeSource = "manual" | "batchSchedule" | "shift" | "undo";

export type PlanHistoryEntry = {
  id: string;
  sectionId: string;
  from: string;
  to: string;
  changedAt: string;
  source: PlanChangeSource;
};

export type ProjectSetting = {
  examDate: string;
};

export type ProjectSettings = Record<StudyArea, ProjectSetting>;

export type JournalProjectContext = {
  type: "project";
  area: StudyArea;
};

export type JournalSubjectContext = {
  type: "subject";
  area: StudyArea;
  bookId: string;
  bookTitle?: string;
};

export type JournalSectionItem = {
  area: StudyArea;
  bookId: string;
  sectionId: string;
  bookTitle?: string;
  sectionTitle?: string;
  sectionNumber?: string;
};

export type JournalSectionContext = {
  type: "section";
  area: StudyArea;
  bookId: string;
  sectionId: string;
  bookTitle?: string;
  sectionTitle?: string;
  sectionNumber?: string;
};

export type JournalSectionsContext = {
  type: "sections";
  sections: JournalSectionItem[];
};

export type JournalPaperContext = {
  type: "paper";
  area: StudyArea;
  paperId: string;
  paperTitle: string;
};

export type JournalContext =
  | JournalProjectContext
  | JournalSubjectContext
  | JournalSectionContext
  | JournalSectionsContext
  | JournalPaperContext;

export type JournalPublish = {
  status: "local" | "published";
  publishedAt: string | null;
  blogUrl: string | null;
  blogPostId: string | null;
};

export type JournalEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string | null;
  content: string;
  context: JournalContext | null;
  publish: JournalPublish;
  important?: boolean;
};

export type PaperKind = "past" | "mock";

export type QuestionState = "correct" | "partial" | "wrong";

export type PaperRecord = {
  id: string;
  kind: PaperKind;
  area: StudyArea;
  title: string;
  groupName?: string;
  year?: number;
  completed: boolean;
  completedAt: string;
  score?: number | null;
  durationMinutes?: number | null;
  secondRound?: boolean;
  secondRoundAt?: string;
  notes?: string;
  questions?: Record<number, QuestionState>;
  questionScores?: Record<number, number>;
};

export type QuestionGroupDef = {
  type: "选择题" | "填空题" | "解答题" | "综合应用题" | "主观表达题";
  subject?: string;
  start: number;
  end: number;
  count: number;
  scorePerQuestion?: number;
  questionScores?: Record<number, number>;
};
