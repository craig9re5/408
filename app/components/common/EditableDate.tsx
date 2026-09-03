import { useEffect, useRef, useState } from "react";
import { formatDateShort, parseFlexibleDate } from "../../lib/date-utils.ts";

export type EditableDateProps = {
  value: string;
  emptyLabel: string;
  ariaLabel: string;
  prefix?: string;
  tone?: "late" | "soon" | "normal" | "empty";
  validate?: (value: string) => string | null;
  onError?: (message: string) => void;
  onChange: (value: string) => void;
};

export function EditableDate({
  value,
  emptyLabel,
  ariaLabel,
  prefix = "",
  tone = "normal",
  validate,
  onError,
  onChange,
}: EditableDateProps) {
  const [editing, setEditing] = useState(false);
  const [inputText, setInputText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setInputText(value ? formatDateShort(value).replace("/", "") : "");
    setEditing(true);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    setEditing(false);
    const parsed = parseFlexibleDate(inputText);
    if (parsed !== null) {
      const validationError = validate?.(parsed);
      if (validationError) {
        onError?.(validationError);
        return;
      }
      if (parsed !== value) {
        onChange(parsed);
      }
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="date-editor"
        type="text"
        inputMode="numeric"
        placeholder="如 0805"
        value={inputText}
        aria-label={ariaLabel}
        onChange={(event) => setInputText(event.target.value)}
        onBlur={handleSave}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            handleSave();
          } else if (event.key === "Escape") {
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      className={`date-text ${tone}${!value ? " empty" : ""}`}
      type="button"
      onClick={startEditing}
      title={`${ariaLabel}：点击修改`}
      aria-label={`${ariaLabel}：${value || emptyLabel}`}
    >
      {value ? `${prefix}${formatDateShort(value)}` : emptyLabel}
    </button>
  );
}
