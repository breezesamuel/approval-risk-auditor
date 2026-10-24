/**
 * 全量验收生成的工具页：对每一页
 *   1) 解析出内联脚本
 *   2) 在最小 DOM 沙箱里执行
 *   3) 调用 bdsGo()，检查输出非空、不含 undefined/NaN
 * 输出统计 + 问题清单。
 */
import fs from "node:fs";
import path from "node:path";
import { webcrypto } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SITE = "C:/bingdashan/site";
const CATALOG = "F:/2026/新建文件夹/artifacts/tool_catalog.json";

// Node 25 的 globalThis.crypto 是只读 getter → 用 defineProperty 兜住
try { globalThis.crypto = webcrypto; }
catch { Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true }); }

// ---- 加载共享运行时与引擎 ----
const core = fs.readFileSync(path.join(SITE, "bds-core.js"), "utf8");
const engines = fs.readFileSync(path.join(SITE, "bds-engines.js"), "utf8");
globalThis.window = globalThis;
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); } };
function defineGlobal(name, value) {
  try { globalThis[name] = value; }
  catch { Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }); }
}
defineGlobal("navigator", { language: "zh-CN" });
defineGlobal("location", { search: "" });
// 最小 DOM（核心运行时在加载时就会读 document）
const els = new Map();
const document = {
  getElementById: (id) => els.get(id) || null,
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  documentElement: { setAttribute() {} },
  addEventListener() {},
};
defineGlobal("document", document);
globalThis.URL = URL;
new Function(core)();
new Function(engines)();
console.log("引擎数:", Object.keys(globalThis.BDS_E || {}).length);

const tools = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
console.log("待验收工具:", tools.length);

let ok = 0, fail = 0, empty = 0;
const problems = [];
const t0 = Date.now();

for (const spec of tools) {
  const file = path.join(SITE, spec.slug, "index.html");
  let html;
  try { html = fs.readFileSync(file, "utf8"); }
  catch (e) { fail++; problems.push(`${spec.slug}: 页面不存在`); continue; }

  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const inline = scripts.find(s => s.includes("function bdsGo"));
  if (!inline) { fail++; problems.push(`${spec.slug}: 找不到内联脚本`); continue; }

  // 最小 DOM（每页重置）
  els.clear();
  for (const inp of spec.inputs || []) {
    els.set(inp.id, { value: String(inp.def ?? ""), textContent: "", innerHTML: "", style: {} });
  }
  els.set("o", { value: "", textContent: "", innerHTML: "", style: {} });
  els.set("freeleft", { textContent: "10", style: {} });
  els.set("gate", { style: {} });
  els.set("modal", { style: {} });
  els.set("modal-body", { innerHTML: "" });
  els.set("per2", { textContent: "" });
  els.set("ttl", { textContent: "" });

  try {
    // 必须用**间接 eval**（全局作用域、非严格模式）：
    // new Function(inline)() 里声明的 function bdsGo 只是局部函数 → 取不到
    (0, eval)(inline);
  } catch (e) {
    fail++; problems.push(`${spec.slug}: 脚本执行失败 ${e.message.slice(0, 70)}`); continue;
  }
  if (typeof globalThis.bdsGo !== "function") {
    fail++; problems.push(`${spec.slug}: bdsGo 未定义`); continue;
  }
  try {
    globalThis.bdsGo();
  } catch (e) {
    fail++; problems.push(`${spec.slug}: bdsGo 抛错 ${e.message.slice(0, 70)}`); continue;
  }
  const out = els.get("o");
  const text = (out.innerHTML || out.textContent || "");
  if (!text || text.length < 8) {
    empty++; problems.push(`${spec.slug}: 输出为空`); continue;
  }
  if (/undefined|NaN/.test(text)) {
    fail++; problems.push(`${spec.slug}: 输出含 undefined/NaN -> ${text.slice(0, 60)}`); continue;
  }
  ok++;
}

const sec = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n验收结果: 通过 ${ok} / ${tools.length}  失败 ${fail}  空输出 ${empty}  用时 ${sec}s`);
if (problems.length) {
  console.log("问题前 25 条:");
  problems.slice(0, 25).forEach(p => console.log("  ❌", p));
  if (problems.length > 25) console.log(`  ...还有 ${problems.length - 25} 条`);
}
