"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";

export type SelectMenuGroup = {
  label?: string;
  options: { value: string; label: string }[];
};

/**
 * 自绘下拉选择器。
 *
 * 原生 <select> 的展开列表由浏览器/系统绘制（Windows 上是深灰高亮、
 * 无圆角、字号不受页面控制），无法通过 CSS 与站点风格统一。手机端改用
 * 这个组件：触发区沿用原有外观，展开面板复用 .topbar-more-panel 的
 * 纸色、圆角与阴影语言。
 *
 * 无障碍：触发按钮带 aria-haspopup="listbox" / aria-expanded，面板用
 * role="listbox" + role="option" + aria-selected；支持 ↑↓ Home End
 * 移动、Enter/Space 选中、Esc 关闭、点击外部关闭。
 */
export function SelectMenu({
  value,
  onChange,
  groups,
  ariaLabel,
  className = "",
  triggerClassName = "",
  renderTrigger,
}: {
  value: string;
  onChange: (value: string) => void;
  groups: SelectMenuGroup[];
  ariaLabel: string;
  className?: string;
  triggerClassName?: string;
  /** 自定义触发区内容；缺省显示当前选中项文字 + 箭头。 */
  renderTrigger?: (current: { value: string; label: string }) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const flat = groups.flatMap((group) => group.options);
  const current = flat.find((option) => option.value === value) ?? flat[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => {
          const next = event.key === "ArrowDown" ? index + 1 : index - 1;
          return (next + flat.length) % flat.length;
        });
      }
      if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(0);
      }
      if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(flat.length - 1);
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const picked = flat[activeIndex];
        if (picked) {
          onChange(picked.value);
          setOpen(false);
        }
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, activeIndex, flat, onChange]);

  function openMenu() {
    const index = flat.findIndex((option) => option.value === value);
    setActiveIndex(index >= 0 ? index : 0);
    setOpen((currentOpen) => !currentOpen);
  }

  // 每个选项在整份列表中的扁平索引，用于键盘高亮。
  const indexById = new Map(flat.map((option, index) => [option.value, index]));

  return (
    <div className={`select-menu ${className}`} ref={rootRef}>
      <button
        type="button"
        className={`select-menu__trigger ${triggerClassName}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={openMenu}
      >
        {renderTrigger ? renderTrigger(current) : (
          <>
            <span className="select-menu__value">{current?.label}</span>
            <Icon name={open ? "chevron-up" : "chevron-down"} />
          </>
        )}
      </button>
      {open && (
        <div className="select-menu__panel" id={listId} role="listbox" aria-label={ariaLabel}>
          {groups.map((group, groupIndex) => (
            <div className="select-menu__group" key={group.label ?? groupIndex} role="group" aria-label={group.label}>
              {group.label && <span className="select-menu__group-label" aria-hidden="true">{group.label}</span>}
              {group.options.map((option) => {
                const index = indexById.get(option.value) ?? 0;
                return (
                  <button
                    type="button"
                    key={option.value}
                    role="option"
                    aria-selected={option.value === value}
                    className={`select-menu__option${option.value === value ? " is-selected" : ""}${index === activeIndex ? " is-active" : ""}`}
                    onPointerEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {option.value === value && <Icon name="check" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
