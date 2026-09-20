import type { ProjectSettings, StudyArea } from "./types.ts";

export const DEFAULT_EXAM_DATE = "2026-12-19";

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  "408": { examDate: DEFAULT_EXAM_DATE },
  math: { examDate: DEFAULT_EXAM_DATE },
  english: { examDate: DEFAULT_EXAM_DATE },
  politics: { examDate: DEFAULT_EXAM_DATE },
};

export const PAST_PAPER_YEARS = [
  2026, 2025, 2024, 2023, 2022, 2021, 2020,
  2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010
] as const;

export const POLITICS_PAST_PAPER_YEARS = [
  2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017
] as const;

export function maxPaperScore(area: StudyArea): number {
  if (area === "politics") return 50;
  if (area === "english") return 100;
  return 150;
}

export const MAX_PAPER_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
export const DEFAULT_USER_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 GB

export const EXAM_PAPER_SUBJECT_MAP: Record<string, { label: string; badgeClass: string }> = {
  cs408: { label: "408", badgeClass: "badge-cs408" },
  math: { label: "数学", badgeClass: "badge-math" },
  other: { label: "其他", badgeClass: "badge-other" },
};
