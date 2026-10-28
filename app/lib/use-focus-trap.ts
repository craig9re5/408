import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type FocusTrapOptions = {
  /** 打开时的初始焦点；缺省优先容器自身（带 tabindex），否则第一个可聚焦元素。 */
  initialFocus?: string;
  /** 按 Esc 时执行；合成输入中的 Esc 交给输入法，不触发。 */
  onEscape?: () => void;
};

// 弹窗可能叠加（例如答题卡里再开一层确认框），用计数避免内层关闭时提前解锁页面滚动。
let scrollLockCount = 0;
let scrollLockOverflow = "";

function lockBodyScroll() {
  if (scrollLockCount === 0) {
    scrollLockOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockCount += 1;
}

function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) document.body.style.overflow = scrollLockOverflow;
}

/**
 * 弹窗焦点收束：打开时移入焦点，Tab 在弹窗内循环，关闭后回到触发元素。
 * 组件需在打开时挂载、关闭时卸载（本项目的弹窗均如此）。
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  options: FocusTrapOptions = {}
) {
  const { initialFocus, onEscape } = options;
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    lockBodyScroll();

    const getFocusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    const initial =
      (initialFocus ? container.querySelector<HTMLElement>(initialFocus) : null) ??
      (container.hasAttribute("tabindex") ? container : null) ??
      getFocusables()[0] ??
      container;
    initial.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      // 输入法正在合成时，Esc 与方向键都属于输入法。
      if (event.isComposing || event.keyCode === 229) return;

      if (event.key === "Escape") {
        if (!onEscapeRef.current) return;
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = getFocusables();
      if (items.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const focusInside = active !== null && container.contains(active);

      if (event.shiftKey) {
        if (!focusInside || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!focusInside || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      unlockBodyScroll();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [containerRef, initialFocus]);
}
