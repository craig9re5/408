import { useEffect, useRef, useState, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type FocusTrapOptions = {
  /** 是否启用焦点收束；默认 true。嵌套子确认框挂载时会自动接管栈顶。 */
  enabled?: boolean;
  /** 打开时的初始焦点；缺省优先容器内首个可聚焦元素，其次容器自身。 */
  initialFocus?: string;
  /** 按 Esc 时执行；合成输入中的 Esc 交给输入法，不触发。 */
  onEscape?: () => void;
};

// 弹窗可能多层叠加（如日志抽屉 → 删除确认、日志编辑器 → 未保存确认、试卷云盘 → 重命名）：
// 仅栈顶弹层响应 Tab 循环与 Esc 关闭，关闭内层时不会误关外层或被外层抢走焦点。
const activeTrapStack: symbol[] = [];
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
 * 组件需在打开时挂载（或切换 enabled），支持多层弹窗嵌套栈管理。
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  options: FocusTrapOptions = {}
) {
  const { enabled = true, initialFocus, onEscape } = options;
  const onEscapeRef = useRef(onEscape);
  // 挂载时记录触发元素：React 的 autoFocus 会在 commit 阶段改写 activeElement，早于 useEffect。
  const [mountActiveElement] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null
  );

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const trapId = Symbol("focus-trap");
    activeTrapStack.push(trapId);
    const currentActive = document.activeElement as HTMLElement | null;
    const focusAlreadyInside = currentActive !== null && container.contains(currentActive);
    const previousFocus =
      focusAlreadyInside && mountActiveElement && !container.contains(mountActiveElement)
        ? mountActiveElement
        : currentActive;
    lockBodyScroll();

    const getFocusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    const explicitTarget = initialFocus ? container.querySelector<HTMLElement>(initialFocus) : null;
    if (explicitTarget) {
      explicitTarget.focus({ preventScroll: true });
    } else if (!focusAlreadyInside) {
      const initial =
        (container.hasAttribute("data-focus-self") ? container : null) ??
        getFocusables()[0] ??
        container;
      initial.focus({ preventScroll: true });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeTrapStack[activeTrapStack.length - 1] !== trapId) return;
      // 输入法正在合成时，Esc 与方向键都属于输入法。
      if (event.isComposing || event.keyCode === 229) return;

      if (event.key === "Escape") {
        if (!onEscapeRef.current) return;
        event.preventDefault();
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
      const stackIdx = activeTrapStack.indexOf(trapId);
      if (stackIdx !== -1) activeTrapStack.splice(stackIdx, 1);
      unlockBodyScroll();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [containerRef, enabled, initialFocus, mountActiveElement]);
}
