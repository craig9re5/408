import { useState } from "react";
import type { PaperRecord, QuestionState } from "../../../shared/types.ts";
import { CS408_PAPER_STRUCTURE, modalChoiceGroups } from "../../study-data.ts";

export type QuestionSummaryMetrics = {
  correctCount: number;
  partialCount: number;
  wrongCount: number;
} | null;

export type AnswerSheetModalProps = {
  paper: PaperRecord;
  onClose: () => void;
  onToggleQuestion: (questionNum: number, isSingleChoice: boolean) => void;
  onMarkAllQuestions: (state: "correct" | "wrong") => void;
  onSubjectiveRating: (questionNum: number, rating: QuestionState, maxScore: number) => void;
  onSubjectiveScoreInput: (questionNum: number, rawValue: string, maxScore: number) => void;
  onBatchSetWrong: (wrongStr: string) => void;
  onClearQuestions: () => void;
  onCreateWrongJournal: (paper: PaperRecord) => void;
  getPaperQuestionSummary: (paper: PaperRecord) => QuestionSummaryMetrics;
};

export function AnswerSheetModal({
  paper,
  onClose,
  onToggleQuestion,
  onMarkAllQuestions,
  onSubjectiveRating,
  onSubjectiveScoreInput,
  onBatchSetWrong,
  onClearQuestions,
  onCreateWrongJournal,
  getPaperQuestionSummary,
}: AnswerSheetModalProps) {
  const [quickWrongInput, setQuickWrongInput] = useState("");
  const qSummary = getPaperQuestionSummary(paper);

  const wrongNums = Object.entries(paper.questions ?? {})
    .filter(([_, st]) => st === "wrong")
    .map(([k]) => parseInt(k, 10))
    .sort((a, b) => a - b);

  return (
    <div
      className="confirm-overlay paper-q-modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="confirm-dialog paper-q-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="q-modal-title">
        <div className="paper-q-modal-header">
          <h2 id="q-modal-title">{paper.title.replace(/(\d{4})年\s*/, "$1 ")}</h2>
          <div className="paper-q-header-right">
            <div className="paper-q-header-metrics">
              <span className="q-header-pill q-pill--correct" title="正确 / 满分">
                <span className="q-pill-dot dot-correct" /> {qSummary?.correctCount ?? 0}
              </span>
              <span className="q-header-pill q-pill--partial" title="部分得分 / 良好">
                <span className="q-pill-dot dot-partial" /> {qSummary?.partialCount ?? 0}
              </span>
              <span className="q-header-pill q-pill--wrong" title="错题 / 低分">
                <span className="q-pill-dot dot-wrong" /> {qSummary?.wrongCount ?? 0}
              </span>
            </div>
            <button
              type="button"
              className="paper-modal-close-btn"
              onClick={onClose}
              title="关闭"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Quick Action Toolbar */}
        <div className="paper-q-tools">
          <div className="q-quick-input-group">
            <label htmlFor="quick-wrong-input">批量录入错题：</label>
            <input
              id="quick-wrong-input"
              type="text"
              placeholder="如: 3, 8, 14, 43"
              value={quickWrongInput}
              onChange={(e) => setQuickWrongInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && quickWrongInput.trim()) {
                  e.preventDefault();
                  onBatchSetWrong(quickWrongInput);
                }
              }}
            />
            <button
              type="button"
              className="btn-apply-quick-wrong"
              disabled={!quickWrongInput.trim()}
              onClick={() => onBatchSetWrong(quickWrongInput)}
            >
              应用
            </button>
          </div>

          <div className="q-quick-btn-group">
            <button
              type="button"
              className="btn-clear-questions"
              onClick={onClearQuestions}
              title="重置清空本卷所有做题记录"
            >
              一键清零
            </button>
          </div>
        </div>

        {/* Question Heatmap Matrix */}
        <div className="paper-q-heatmap-matrix">
          {paper.area === "math" ? (
            /* Math: 1~10 选择 (5分), 11~16 填空 (5分), 17~22 解答 (10~12分) */
            <div className="q-subjective-container">
              {/* Part 1: 客观题 (1~16, 包含单选与填空，纯点选对错) */}
              <div className="q-type-block">
                <div className="q-type-header">
                  <div className="q-type-header-left">
                    <span className="q-type-title">客观题</span>
                    <span className="q-type-subtitle">第 1 ~ 16 题 · 每题 5 分 · 共 80 分</span>
                  </div>
                  <button
                    type="button"
                    className="btn-choice-all-correct"
                    onClick={() => onMarkAllQuestions("correct")}
                    title="将客观选择与填空设为全部正确"
                  >
                    一键全对
                  </button>
                </div>
                <div className="q-type-rows">
                  {modalChoiceGroups(paper.area).map((grp) => (
                    <div className="q-heatmap-row" key={grp.name}>
                      <div className="q-subject-label">
                        <strong className="q-label-name">{grp.name}</strong>
                        <span className="q-label-range">{grp.start}~{grp.start + grp.count - 1}</span>
                      </div>
                      <div className="q-heatmap-chips">
                        {Array.from({ length: grp.count }, (_, i) => grp.start + i).map((num) => {
                          const state = paper.questions?.[num];
                          return (
                            <button
                              key={num}
                              type="button"
                              className={`q-chip-btn ${state ? `state-${state}` : "state-unset"}`}
                              aria-label={`第 ${num} 题 [${grp.scoreLabel}]，当前状态：${state === "correct" ? "正确" : state === "wrong" ? "错题" : "未标记"}；点击切换`}
                              title={`第 ${num} 题 [${grp.scoreLabel}]：点击切换 正确 / 错题 / 取消`}
                              onClick={() => onToggleQuestion(num, true)}
                            >
                              {num}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Part 2: 解答题 (17~22) */}
              <div className="q-type-block q-type-block--comprehensive">
                <div className="q-type-header">
                  <span className="q-type-title">解答题</span>
                  <span className="q-type-subtitle">第 17 ~ 22 题 · 共 70 分</span>
                </div>
                <div className="q-rating-grid">
                  {[
                    { num: 17, subj: "高数", max: 10 },
                    { num: 18, subj: "高数", max: 12 },
                    { num: 19, subj: "高数", max: 12 },
                    { num: 20, subj: "高数", max: 12 },
                    { num: 21, subj: "线代", max: 12 },
                    { num: 22, subj: "概率", max: 12 },
                  ].map((item) => {
                    const state = paper.questions?.[item.num];
                    const score = paper.questionScores?.[item.num];
                    return (
                      <div className={`q-rating-item ${state ? `state-${state}` : ""}`} key={item.num}>
                        <div className="q-rating-label">
                          <span className="q-rating-badge">{item.subj}</span>
                          <strong className="q-rating-title">第 {item.num} 题</strong>
                        </div>
                        <div className="q-rating-seg" role="radiogroup" aria-label={`第 ${item.num} 题评级`}>
                          <button
                            type="button"
                            className={`q-rating-btn rating--correct ${state === "correct" ? "active" : ""}`}
                            role="radio"
                            aria-checked={state === "correct"}
                            onClick={() => onSubjectiveRating(item.num, "correct", item.max)}
                            title="优 · 满分（再次点击取消）"
                          >
                            优
                          </button>
                          <button
                            type="button"
                            className={`q-rating-btn rating--partial ${state === "partial" ? "active" : ""}`}
                            role="radio"
                            aria-checked={state === "partial"}
                            onClick={() => onSubjectiveRating(item.num, "partial", item.max)}
                            title="良 · 部分分（再次点击取消）"
                          >
                            良
                          </button>
                          <button
                            type="button"
                            className={`q-rating-btn rating--wrong ${state === "wrong" ? "active" : ""}`}
                            role="radio"
                            aria-checked={state === "wrong"}
                            onClick={() => onSubjectiveRating(item.num, "wrong", item.max)}
                            title="差 · 失分（再次点击取消）"
                          >
                            差
                          </button>
                        </div>
                        <div className="q-score-input-wrap">
                          <input
                            type="number"
                            min={0}
                            max={item.max}
                            step={0.5}
                            placeholder="0"
                            value={score ?? ""}
                            onChange={(e) => onSubjectiveScoreInput(item.num, e.target.value, item.max)}
                          />
                          <span className="q-score-unit">分</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : paper.area === "politics" ? (
            /* Politics: 1~16 单选 (1分), 17~33 多选 (2分), 共 50 分，纯选择题 */
            <div className="q-subjective-container">
              {/* Part 1: 选择题 (1~33) */}
              <div className="q-type-block">
                <div className="q-type-header">
                  <div className="q-type-header-left">
                    <span className="q-type-title">选择题</span>
                    <span className="q-type-subtitle">第 1 ~ 33 题 · 单选 1~16 题 (每题 1 分) · 多选 17~33 题 (每题 2 分) · 共 50 分</span>
                  </div>
                  <button
                    type="button"
                    className="btn-choice-all-correct"
                    onClick={() => onMarkAllQuestions("correct")}
                    title="将选择题设为全部正确"
                  >
                    一键全对
                  </button>
                </div>
                <div className="q-type-rows">
                  {modalChoiceGroups(paper.area).map((grp) => (
                    <div className="q-heatmap-row" key={grp.name}>
                      <div className="q-subject-label">
                        <strong className="q-label-name">{grp.name}</strong>
                        <span className="q-label-range">{grp.start}~{grp.start + grp.count - 1}</span>
                      </div>
                      <div className="q-heatmap-chips">
                        {Array.from({ length: grp.count }, (_, i) => grp.start + i).map((num) => {
                          const state = paper.questions?.[num];
                          return (
                            <button
                              key={num}
                              type="button"
                              className={`q-chip-btn ${state ? `state-${state}` : "state-unset"}`}
                              aria-label={`第 ${num} 题 [${grp.scoreLabel}]，当前状态：${state === "correct" ? "正确" : state === "wrong" ? "错题" : "未标记"}；点击切换`}
                              title={`第 ${num} 题 [${grp.scoreLabel}]：点击切换 正确 / 错题 / 取消`}
                              onClick={() => onToggleQuestion(num, true)}
                            >
                              {num}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : paper.area === "english" ? (
            /* English: 1~45 选择, 46~50 英译汉, 51~52 写作 */
            <div className="q-subjective-container">
              {/* Part 1: 选择题 (1~45, 完形、传统阅读、新题型) */}
              <div className="q-type-block">
                <div className="q-type-header">
                  <div className="q-type-header-left">
                    <span className="q-type-title">选择题</span>
                    <span className="q-type-subtitle">第 1 ~ 45 题 · 共 60 分</span>
                  </div>
                  <button
                    type="button"
                    className="btn-choice-all-correct"
                    onClick={() => onMarkAllQuestions("correct")}
                    title="将全部选择题设为正确"
                  >
                    一键全对
                  </button>
                </div>
                <div className="q-type-rows">
                  {modalChoiceGroups(paper.area).map((grp) => (
                    <div className="q-heatmap-row" key={grp.name}>
                      <div className="q-subject-label">
                        <strong className="q-label-name">{grp.name}</strong>
                        <span className="q-label-range">{grp.start}~{grp.start + grp.count - 1}</span>
                      </div>
                      <div className="q-heatmap-chips">
                        {Array.from({ length: grp.count }, (_, i) => grp.start + i).map((num) => {
                          const state = paper.questions?.[num];
                          return (
                            <button
                              key={num}
                              type="button"
                              className={`q-chip-btn ${state ? `state-${state}` : "state-unset"}`}
                              aria-label={`第 ${num} 题 [${grp.scoreLabel}]，当前状态：${state === "correct" ? "正确" : state === "wrong" ? "错题" : "未标记"}；点击切换`}
                              title={`第 ${num} 题 [${grp.scoreLabel}]：点击切换 正确 / 错题 / 取消`}
                              onClick={() => onToggleQuestion(num, true)}
                            >
                              {num}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Part 2: 英译汉 (46~50, 每题 2 分, 共 10 分) */}
              <div className="q-type-block q-type-block--comprehensive">
                <div className="q-type-header">
                  <span className="q-type-title">英译汉</span>
                  <span className="q-type-subtitle">第 46 ~ 50 题 · 每题 2 分 · 共 10 分</span>
                </div>
                <div className="q-rating-grid">
                  {[
                    { num: 46, max: 2 },
                    { num: 47, max: 2 },
                    { num: 48, max: 2 },
                    { num: 49, max: 2 },
                    { num: 50, max: 2 },
                  ].map((item) => {
                    const state = paper.questions?.[item.num];
                    const score = paper.questionScores?.[item.num];
                    return (
                      <div className={`q-rating-item ${state ? `state-${state}` : ""}`} key={item.num}>
                        <div className="q-rating-label">
                          <span className="q-rating-badge">翻译</span>
                          <strong className="q-rating-title">第 {item.num} 题</strong>
                        </div>
                        <div className="q-rating-seg" role="radiogroup" aria-label={`第 ${item.num} 题评级`}>
                          <button
                            type="button"
                            className={`q-rating-btn rating--correct ${state === "correct" ? "active" : ""}`}
                            role="radio"
                            aria-checked={state === "correct"}
                            onClick={() => onSubjectiveRating(item.num, "correct", item.max)}
                            title="优 · 满分（再次点击取消）"
                          >
                            优
                          </button>
                          <button
                            type="button"
                            className={`q-rating-btn rating--partial ${state === "partial" ? "active" : ""}`}
                            role="radio"
                            aria-checked={state === "partial"}
                            onClick={() => onSubjectiveRating(item.num, "partial", item.max)}
                            title="良 · 部分分（再次点击取消）"
                          >
                            良
                          </button>
                          <button
                            type="button"
                            className={`q-rating-btn rating--wrong ${state === "wrong" ? "active" : ""}`}
                            role="radio"
                            aria-checked={state === "wrong"}
                            onClick={() => onSubjectiveRating(item.num, "wrong", item.max)}
                            title="差 · 失分（再次点击取消）"
                          >
                            差
                          </button>
                        </div>
                        <div className="q-score-input-wrap">
                          <input
                            type="number"
                            min={0}
                            max={item.max}
                            step={0.5}
                            placeholder="0"
                            value={score ?? ""}
                            onChange={(e) => onSubjectiveScoreInput(item.num, e.target.value, item.max)}
                          />
                          <span className="q-score-unit">分</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Part 3: 写作 (51~52, 作文A 10分 + 作文B 20分, 共 30 分) */}
              <div className="q-type-block q-type-block--comprehensive">
                <div className="q-type-header">
                  <span className="q-type-title">写作</span>
                  <span className="q-type-subtitle">第 51 ~ 52 题 · 作文A 10 分 · 作文B 20 分 · 共 30 分</span>
                </div>
                <div className="q-rating-grid">
                  {[
                    { num: 51, subj: "作文A", max: 10 },
                    { num: 52, subj: "作文B", max: 20 },
                  ].map((item) => {
                    const state = paper.questions?.[item.num];
                    const score = paper.questionScores?.[item.num];
                    return (
                      <div className={`q-rating-item ${state ? `state-${state}` : ""}`} key={item.num}>
                        <div className="q-rating-label">
                          <span className="q-rating-badge">{item.subj}</span>
                          <strong className="q-rating-title">第 {item.num} 题</strong>
                        </div>
                        <div className="q-rating-seg" role="radiogroup" aria-label={`第 ${item.num} 题评级`}>
                          <button
                            type="button"
                            className={`q-rating-btn rating--correct ${state === "correct" ? "active" : ""}`}
                            role="radio"
                            aria-checked={state === "correct"}
                            onClick={() => onSubjectiveRating(item.num, "correct", item.max)}
                            title="优 · 满分（再次点击取消）"
                          >
                            优
                          </button>
                          <button
                            type="button"
                            className={`q-rating-btn rating--partial ${state === "partial" ? "active" : ""}`}
                            role="radio"
                            aria-checked={state === "partial"}
                            onClick={() => onSubjectiveRating(item.num, "partial", item.max)}
                            title="良 · 部分分（再次点击取消）"
                          >
                            良
                          </button>
                          <button
                            type="button"
                            className={`q-rating-btn rating--wrong ${state === "wrong" ? "active" : ""}`}
                            role="radio"
                            aria-checked={state === "wrong"}
                            onClick={() => onSubjectiveRating(item.num, "wrong", item.max)}
                            title="差 · 失分（再次点击取消）"
                          >
                            差
                          </button>
                        </div>
                        <div className="q-score-input-wrap">
                          <input
                            type="number"
                            min={0}
                            max={item.max}
                            step={0.5}
                            placeholder="0"
                            value={score ?? ""}
                            onChange={(e) => onSubjectiveScoreInput(item.num, e.target.value, item.max)}
                          />
                          <span className="q-score-unit">分</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* 408: 1~40 选择 (80分), 41~47 综合应用 (70分) */
            <div className="q-subjective-container">
              {/* Part 1: 选择题 (1~40) */}
              <div className="q-type-block">
                <div className="q-type-header">
                  <div className="q-type-header-left">
                    <span className="q-type-title">单项选择题</span>
                    <span className="q-type-subtitle">第 1 ~ 40 题 · 每题 2 分 · 共 80 分</span>
                  </div>
                  <button
                    type="button"
                    className="btn-choice-all-correct"
                    onClick={() => onMarkAllQuestions("correct")}
                    title="将选择题 1~40 设为全部正确"
                  >
                    一键全对
                  </button>
                </div>
                <div className="q-type-rows">
                  {CS408_PAPER_STRUCTURE.groups
                    .filter((g) => g.type === "选择题")
                    .map((grp) => (
                      <div className="q-heatmap-row" key={grp.subject}>
                        <div className="q-subject-label">
                          <strong className="q-label-name">{grp.subject}</strong>
                          <span className="q-label-range">{grp.start}~{grp.end}</span>
                        </div>
                        <div className="q-heatmap-chips">
                          {Array.from({ length: grp.count }, (_, i) => grp.start + i).map((num) => {
                            const state = paper.questions?.[num];
                            return (
                              <button
                                key={num}
                                type="button"
                                className={`q-chip-btn ${state ? `state-${state}` : "state-unset"}`}
                                aria-label={`第 ${num} 题 [${grp.subject}]，当前状态：${state === "correct" ? "正确" : state === "wrong" ? "错题" : "未标记"}；点击切换`}
                                title={`第 ${num} 题 [${grp.subject}]：点击切换 正确 / 错题 / 取消`}
                                onClick={() => onToggleQuestion(num, true)}
                              >
                                {num}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Part 2: 综合应用题 (41~47) */}
              <div className="q-type-block q-type-block--comprehensive">
                <div className="q-type-header">
                  <span className="q-type-title">综合应用题</span>
                  <span className="q-type-subtitle">第 41 ~ 47 题 · 共 70 分</span>
                </div>
                <div className="q-rating-grid">
                  {[
                    { num: 41, subj: "DS", max: 9 },
                    { num: 42, subj: "DS", max: 13 },
                    { num: 43, subj: "CO", max: 13 },
                    { num: 44, subj: "CO", max: 13 },
                    { num: 45, subj: "OS", max: 12 },
                    { num: 46, subj: "OS", max: 12 },
                    { num: 47, subj: "CN", max: 11 },
                  ].map((item) => {
                    const state = paper.questions?.[item.num];
                    const score = paper.questionScores?.[item.num];
                    return (
                      <div className={`q-rating-item ${state ? `state-${state}` : ""}`} key={item.num}>
                        <div className="q-rating-label">
                          <span className="q-rating-badge">{item.subj}</span>
                          <strong className="q-rating-title">第 {item.num} 题</strong>
                        </div>
                        <div className="q-rating-seg" role="radiogroup" aria-label={`第 ${item.num} 题评级`}>
                          <button
                            type="button"
                            className={`q-rating-btn rating--correct ${state === "correct" ? "active" : ""}`}
                            role="radio"
                            aria-checked={state === "correct"}
                            onClick={() => onSubjectiveRating(item.num, "correct", item.max)}
                            title="优 · 满分（再次点击取消）"
                          >
                            优
                          </button>
                          <button
                            type="button"
                            className={`q-rating-btn rating--partial ${state === "partial" ? "active" : ""}`}
                            role="radio"
                            aria-checked={state === "partial"}
                            onClick={() => onSubjectiveRating(item.num, "partial", item.max)}
                            title="良 · 部分分（再次点击取消）"
                          >
                            良
                          </button>
                          <button
                            type="button"
                            className={`q-rating-btn rating--wrong ${state === "wrong" ? "active" : ""}`}
                            role="radio"
                            aria-checked={state === "wrong"}
                            onClick={() => onSubjectiveRating(item.num, "wrong", item.max)}
                            title="差 · 失分（再次点击取消）"
                          >
                            差
                          </button>
                        </div>
                        <div className="q-score-input-wrap">
                          <input
                            type="number"
                            min={0}
                            max={item.max}
                            step={0.5}
                            placeholder="0"
                            value={score ?? ""}
                            onChange={(e) => onSubjectiveScoreInput(item.num, e.target.value, item.max)}
                          />
                          <span className="q-score-unit">分</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="paper-q-modal-footer">
          <button
            type="button"
            className="btn-create-wrong-journal"
            onClick={() => onCreateWrongJournal(paper)}
          >
            生成错题复盘日志 {wrongNums.length > 0 ? `(${wrongNums.length}道错题)` : ""}
          </button>

          <button
            type="button"
            className="btn-confirm"
            onClick={onClose}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
