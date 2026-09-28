import { useId, useState } from "react";
import type { JournalEntry, PaperRecord, StudyArea } from "../../../shared/types.ts";
import { bentoChoiceGroups } from "../../study-data.ts";
import { EditableDate } from "../common/EditableDate.tsx";

export type QuestionSummaryMetrics = {
  choiceWrongCount: number;
  choiceAccuracyPercent: number | null;
  subjectiveRecorded: number;
  subjectivePerfectCount: number;
  subjectivePartialCount: number;
  subjectiveWrongCount: number;
} | null;

export type PaperCardProps = {
  paper: PaperRecord;
  activeArea: StudyArea;
  paperJournals: JournalEntry[];
  maxScore: number;
  onUpdateScore: (paperId: string, score: number | null) => void;
  onToggleCompleted: (paperId: string, completed: boolean) => void;
  onToggleSecondRound: (paperId: string, secondRound: boolean) => void;
  onOpenAnswerSheet: (paperId: string) => void;
  onOpenCreateJournal: (paper: PaperRecord) => void;
  onViewJournals: (paper: PaperRecord) => void;
  onDelete?: (paperId: string) => void;
  onChangeCompletedAt: (paperId: string, date: string) => void;
  qSummary: QuestionSummaryMetrics;
};

type BigQuestion = { num: number; name: string; max?: number };

export function PaperCard({
  paper,
  activeArea,
  paperJournals,
  maxScore,
  onUpdateScore,
  onToggleCompleted,
  onToggleSecondRound,
  onOpenAnswerSheet,
  onOpenCreateJournal,
  onViewJournals,
  onDelete,
  onChangeCompletedAt,
  qSummary,
}: PaperCardProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const mobileDetailsId = useId();
  const isMock = paper.kind === "mock";
  const choiceGroups = bentoChoiceGroups(paper.area);

  let bigQuestions: BigQuestion[] = [];
  let choiceTagLabel = "选择";
  let subjTagLabel = "大题";
  let subjectiveLabel = "大题";

  if (paper.area === "408") {
    bigQuestions = [
      { num: 41, name: "DS" },
      { num: 42, name: "DS" },
      { num: 43, name: "CO" },
      { num: 44, name: "CO" },
      { num: 45, name: "OS" },
      { num: 46, name: "OS" },
      { num: 47, name: "CN" },
    ];
  } else if (paper.area === "politics") {
    bigQuestions = [];
    choiceTagLabel = "选择";
    subjTagLabel = "";
    subjectiveLabel = "";
  } else if (paper.area === "english") {
    bigQuestions = [
      { num: 46, name: "翻译 1" },
      { num: 47, name: "翻译 2" },
      { num: 48, name: "翻译 3" },
      { num: 49, name: "翻译 4" },
      { num: 50, name: "翻译 5" },
      { num: 51, name: "作文A" },
      { num: 52, name: "作文B" },
    ];
    choiceTagLabel = "选择";
    subjTagLabel = "主观";
    subjectiveLabel = "主观";
  } else {
    bigQuestions = [
      { num: 17, max: 10, name: "解答题 · 10分" },
      { num: 18, max: 12, name: "解答题 · 12分" },
      { num: 19, max: 12, name: "解答题 · 12分" },
      { num: 20, max: 12, name: "解答题 · 12分" },
      { num: 21, max: 12, name: "解答题 · 12分" },
      { num: 22, max: 12, name: "解答题 · 12分" },
    ];
    choiceTagLabel = "选填";
    subjTagLabel = "大题";
    subjectiveLabel = "解答";
  }

  return (
    <div className={`sprint-bento-card ${paper.completed ? "completed" : ""} ${mobileExpanded ? "is-expanded" : ""}`} key={paper.id}>
      <div className="bento-mobile-summary">
        <button
          type="button"
          className="bento-mobile-toggle"
          aria-label={`${mobileExpanded ? "收起" : "展开"}${paper.title}`}
          aria-expanded={mobileExpanded}
          aria-controls={mobileDetailsId}
          onClick={() => setMobileExpanded((expanded) => !expanded)}
        >
          <span className="bento-mobile-heading">
            <strong className="bento-mobile-title">{paper.title}</strong>
            {paper.score !== null && paper.score !== undefined && <span className="bento-mobile-score">{paper.score} 分</span>}
          </span>
          <span className="bento-mobile-chevron" aria-hidden="true">{mobileExpanded ? "⌃" : "⌄"}</span>
        </button>
      </div>
      <div className="bento-card-details" id={mobileDetailsId}>
      <div className={`bento-card-top ${isMock ? "bento-card-top--mock" : ""}`}>
        {isMock ? (
          <div className="bento-title-wrap" title={paper.title}>
            {paper.groupName && <span className="paper-group-badge">{paper.groupName}</span>}
            <strong className="bento-paper-title">{paper.title}</strong>
          </div>
        ) : (
          <span className="bento-year-pill">{paper.year}</span>
        )}

        <div className="bento-top-controls">
          <div className="bento-score-inline" title="点击输入分数">
            <input
              type="number"
              className="bento-score-input"
              aria-label={`${paper.title}分数`}
              min={0}
              max={maxScore}
              step={0.5}
              placeholder="分数"
              value={paper.score ?? ""}
              style={
                paper.score === null || paper.score === undefined
                  ? undefined
                  : { width: `${String(paper.score).length}ch` }
              }
              onChange={(e) => {
                const val = e.target.value;
                onUpdateScore(paper.id, val === "" ? null : parseFloat(val));
              }}
            />
            {paper.score !== null && paper.score !== undefined && (
              <span className="bento-score-unit">分</span>
            )}
          </div>

          <label className="bento-check-label" title={paper.completed ? "已完成一刷 (点击取消)" : "标记已做完"}>
            <input
              type="checkbox"
              checked={paper.completed}
              onChange={(e) => onToggleCompleted(paper.id, e.target.checked)}
            />
            <span className="bento-check-box" />
            <span className="bento-check-text">{paper.completed ? "已做" : "未做"}</span>
          </label>

          <label
            className="bento-check-label"
            title={
              paper.secondRound
                ? "已完成二刷 (点击取消)"
                : !paper.completed
                  ? "标记二刷（将同步标记一刷）"
                  : "标记二刷"
            }
          >
            <input
              type="checkbox"
              checked={Boolean(paper.secondRound)}
              onChange={(e) => onToggleSecondRound(paper.id, e.target.checked)}
            />
            <span className="bento-check-box" />
            <span className="bento-check-text">二刷</span>
          </label>
        </div>

        <details className="bento-mobile-record-menu">
          <summary aria-label={`${paper.title}记录操作`} title="记录操作">···</summary>
          <div className="bento-mobile-record-panel">
            <button type="button" onClick={() => onToggleCompleted(paper.id, !paper.completed)}>
              {paper.completed ? "取消完成记录" : "标记本套完成"}
            </button>
            <button type="button" onClick={() => onToggleSecondRound(paper.id, !paper.secondRound)}>
              {paper.secondRound ? "取消再次练习" : "记录再次练习"}
            </button>
            {paper.completed && (
              <div className="bento-mobile-record-date">
                <span>完成日期</span>
                <EditableDate
                  value={paper.completedAt}
                  emptyLabel="设置日期"
                  ariaLabel={`${paper.title}完成日期`}
                  onChange={(val) => onChangeCompletedAt(paper.id, val)}
                />
              </div>
            )}
          </div>
        </details>

        {isMock && onDelete && (
          <button
            type="button"
            className="paper-btn-del"
            title="删除该模拟卷"
            aria-label={`删除${paper.title}`}
            onClick={() => onDelete(paper.id)}
          >
            ×
          </button>
        )}
      </div>

      {/* Mini Heatmap Matrix */}
      <div className="bento-mini-heatmap">
        <div className="mini-heatmap-head">
          <button
            type="button"
            className="mini-heatmap-open-btn"
            aria-label={`打开${paper.title}答题卡`}
            title="打开答题卡录入或调整做题表现"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAnswerSheet(paper.id);
            }}
          >
            答题卡 ↗
          </button>
          <div className="mini-heatmap-tags">
            {qSummary && (
              <>
                <span className={`mini-heatmap-tag ${qSummary.choiceWrongCount > 0 ? "tag-wrong" : "tag-perfect"}`}>
                  {choiceTagLabel}: {qSummary.choiceAccuracyPercent}%
                </span>
                {qSummary.subjectiveRecorded > 0 && (
                  <span className="mini-heatmap-tag tag-subj">
                    {subjTagLabel}: {qSummary.subjectivePerfectCount}优 {qSummary.subjectivePartialCount}良 {qSummary.subjectiveWrongCount}差
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mini-heatmap-rows-stack">
          {choiceGroups.map((grp) => (
            <div className="mini-heatmap-row" key={grp.name} title={`[${grp.label}] 第 ${grp.start}~${grp.start + grp.count - 1} 题`}>
              <span className="mini-row-label">{grp.name}:</span>
              <div className="mini-group-dots">
                {Array.from({ length: grp.count }, (_, i) => {
                  const num = grp.start + i;
                  const st = paper.questions?.[num];
                  return (
                    <span
                      key={num}
                      className={`mini-dot ${st ? `dot-${st}` : "dot-unset"}`}
                      title={`第 ${num} 题: ${st === "correct" ? "正确" : st === "wrong" ? "错题" : "未做"}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {bigQuestions.length > 0 && (
            <div className="mini-heatmap-row" title={`[${subjectiveLabel}] 第 ${bigQuestions[0].num}~${bigQuestions[bigQuestions.length - 1].num} 题`}>
              <span className="mini-row-label">{subjectiveLabel}:</span>
              <div className="mini-group-dots">
                {bigQuestions.map((q) => {
                  const st = paper.questions?.[q.num];
                  const sc = paper.questionScores?.[q.num];
                  const scoreStr = sc !== undefined ? `${sc}分` : "";
                  return (
                    <span
                      key={q.num}
                      className={`mini-dot mini-dot--subjective ${st ? `dot-${st}` : "dot-unset"}`}
                      title={`第 ${q.num} 题 (${q.name}): ${st === "correct" ? "优" : st === "partial" ? "良" : st === "wrong" ? "差" : "未做"} ${scoreStr}`}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card Footer */}
      <div className="bento-card-footer">
        <div className="bento-footer-left">
          {paper.completed ? (
            <EditableDate
              value={paper.completedAt}
              emptyLabel="设置日期"
              ariaLabel={`${paper.title}完成日期`}
              onChange={(val) => onChangeCompletedAt(paper.id, val)}
            />
          ) : null}
        </div>

        <div className="bento-actions-wrap">
          {paperJournals.length > 0 && (
            <button
              type="button"
              className="section-journal-badge"
              title={`查看此试卷的 ${paperJournals.length} 条复盘日志`}
              onClick={() => onViewJournals(paper)}
            >
              📝 <span>{paperJournals.length}</span>
            </button>
          )}
          <button
            type="button"
            className="section-record-btn"
            title="写一条关于该试卷的复盘日志"
            onClick={() => onOpenCreateJournal(paper)}
          >
            <span className="record-plus">+</span>
            <span className="record-label">记</span>
          </button>
        </div>
      </div>
      <div className="bento-mobile-footer">
        <div className="bento-mobile-note-actions">
          <button type="button" className="bento-mobile-note" onClick={() => onOpenCreateJournal(paper)}>+ 笔记</button>
          {paperJournals.length > 0 && (
            <button type="button" className="bento-mobile-note-count" aria-label={`查看${paper.title}的${paperJournals.length}条笔记`} onClick={() => onViewJournals(paper)}>{paperJournals.length} 条</button>
          )}
        </div>
        <button type="button" className="bento-mobile-answer" onClick={() => onOpenAnswerSheet(paper.id)}>打开答题卡 <span aria-hidden="true">↗</span></button>
      </div>
      </div>
    </div>
  );
}
