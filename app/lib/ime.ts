import { useCallback, useRef } from "react";

const WEBKIT_ENTER_GUARD_MS = 500;

/** WebKit（Safari / iOS 全系浏览器）在输入法合成结束后可能补送一次 Enter。 */
function isWebKitBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /^((?!chrome|android|crios|fxios|edgios|opr).)*safari/i.test(navigator.userAgent);
}

export type ImeKeyLike = {
  key: string;
  keyCode: number;
  timeStamp: number;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
};

/**
 * 输入法合成中（含 WebKit 合成刚结束的补送事件）的按键必须交给输入法处理，
 * 否则中文选词的回车会变成「插入列表 / 提交」。
 */
export function shouldIgnoreImeKey(
  event: ImeKeyLike,
  lastCompositionEndAt: number,
  webkit: boolean
): boolean {
  if (event.nativeEvent?.isComposing || event.keyCode === 229 || event.nativeEvent?.keyCode === 229) {
    return true;
  }
  return Boolean(
    webkit
      && event.key === "Enter"
      && lastCompositionEndAt >= 0
      && Math.abs(event.timeStamp - lastCompositionEndAt) < WEBKIT_ENTER_GUARD_MS
  );
}

/** 编辑器的输入法守卫：合成结束时间只用于 WebKit 的补送 Enter，且只吞一次。 */
export function useImeGuard() {
  const lastCompositionEndAtRef = useRef(-1);
  const webkitRef = useRef<boolean | null>(null);

  const isImeKey = useCallback((event: ImeKeyLike) => {
    const webkit = webkitRef.current ?? isWebKitBrowser();
    webkitRef.current = webkit;
    const ignore = shouldIgnoreImeKey(event, lastCompositionEndAtRef.current, webkit);
    if (ignore && event.key === "Enter") lastCompositionEndAtRef.current = -1;
    return ignore;
  }, []);

  const markCompositionEnd = useCallback(() => {
    lastCompositionEndAtRef.current = performance.now();
  }, []);

  return { isImeKey, markCompositionEnd };
}
