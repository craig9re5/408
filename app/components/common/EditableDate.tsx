import { useEffect, useRef, useState } from "react";
import { formatDateShort, parseFlexibleDate } from "../../lib/date-utils.ts";
import { useImeGuard } from "../../lib/ime.ts";

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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const restoreButtonFocusRef = useRef(false);
  const skipBlurSaveRef = useRef(false);
  const { isImeKey, markCompositionEnd } = useImeGuard();

  const startEditing = () => {
    skipBlurSaveRef.current = false;
    setInputText(value ? formatDateShort(value).replace("/", "") : "");
    setEditing(true);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      return;
    }
    if (!editing && restoreButtonFocusRef.current) {
      restoreButtonFocusRef.current = false;
      buttonRef.current?.focus({ preventScroll: true });
    }
  }, [editing]);

  const handleSave = (fromKeyboard = false) => {
    if (fromKeyboard) {
      skipBlurSaveRef.current = true;
      restoreButtonFocusRef.current = true;
    }
    setEditing(false);
    const parsed = parseFlexibleDate(inputText);
    if (parsed === null) {
      onError?.("日期格式无效，请输入如 0805 或 8/5");
      return;
    }
    const validationError = validate?.(parsed);
    if (validationError) {
      onError?.(validationError);
      return;
    }
    if (parsed !== value) {
      onChange(parsed);
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
        onCompositionEnd={markCompositionEnd}
        onBlur={() => {
          if (skipBlurSaveRef.current) {
            skipBlurSaveRef.current = false;
            return;
          }
          handleSave(false);
        }}
        onKeyDown={(event) => {
          if (isImeKey(event)) return;
          if (event.key === "Enter") {
            event.preventDefault();
            handleSave(true);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            skipBlurSaveRef.current = true;
            restoreButtonFocusRef.current = true;
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      ref={buttonRef}
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
