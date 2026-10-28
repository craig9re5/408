import assert from "node:assert/strict";
import test from "node:test";

import { shouldIgnoreImeKey } from "../app/lib/ime.ts";

test("输入法合成中的按键不触发编辑器快捷键", () => {
  const key = (overrides = {}) => ({
    key: "Enter",
    keyCode: 13,
    timeStamp: 10_000,
    nativeEvent: {},
    ...overrides,
  });

  // 合成中：选词回车必须交给输入法
  assert.equal(shouldIgnoreImeKey(key({ nativeEvent: { isComposing: true } }), -1, false), true);
  assert.equal(shouldIgnoreImeKey(key({ keyCode: 229 }), -1, false), true);

  // WebKit 合成结束后 500ms 内补送的 Enter 只吞一次；超出窗口或非 Enter 放行
  assert.equal(shouldIgnoreImeKey(key(), 9_800, true), true);
  assert.equal(shouldIgnoreImeKey(key(), 9_000, true), false);
  assert.equal(shouldIgnoreImeKey(key({ key: "a" }), 9_800, true), false);

  // 非 WebKit 不受时间窗影响
  assert.equal(shouldIgnoreImeKey(key(), 9_800, false), false);
});
