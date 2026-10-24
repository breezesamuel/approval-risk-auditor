/** 引擎功能自测：每个引擎跑一次，检查是否返回非空 HTML。 */
import { webcrypto } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
global.window = { crypto: webcrypto };
require("C:/bingdashan/site/bds-engines.js");
const E = global.window.BDS_E;

const cases = [
  ["unit", [100], { rows: [{ zh: "米", en: "m", f: 1 }, { zh: "厘米", en: "cm", f: 0.01 }], from: 0, to: 1 }],
  ["pct_of", [30, 200], {}],
  ["pct_change", [100, 120], {}],
  ["loan_payment", [1000000, 4.9, 30], {}],
  ["compound", [10000, 5, 10], { periods: 12 }],
  ["bmi", [60, 170], {}],
  ["bmr", [60, 170, 30, 1], {}],
  ["tdee", [1.375, 1600], {}],
  ["age", ["1990-05-01", "2026-10-21"], {}],
  ["date_diff", ["2026-01-01", "2026-10-21"], {}],
  ["workdays", ["2026-10-01", "2026-10-21", "[]"], {}],
  ["char_count", ["你好世界 hello"], {}],
  ["word_count", ["你好世界 hello world"], {}],
  ["base64", ["hello"], { mode: "encode" }],
  ["color_convert", ["#ff8800"], { mode: "hex2rgb" }],
  ["password_gen", [16], { sets: 3 }],
  ["area", [4, 3], { shape: "rect" }],
  ["volume", [2, 3, 4], { shape: "box" }],
  ["gcd_lcm", [12, 18], {}],
  ["prime_factor", [360], {}],
  ["quadratic", [1, -3, 2], {}],
  ["stat", ["1 2 3 4 5 6 7 8 9 10"], {}],
  ["combinatorics", [5, 2], { mode: "comb" }],
  ["percentile", ["1 2 3 4 5 6 7 8 9 10", 90], {}],
  ["fraction", [3, 6], {}],
  ["text_ops", ["Hello World"], { op: "reverse" }],
  ["text_diff", ["a\nb", "b\nc"], {}],
  ["tip", [200, 10, 2], {}],
  ["split_bill", [300, 4, 10], {}],
  ["unit_price", [10, 500, 25, 1000], {}],
  ["salary_net", [20000, 21, 5000, 10], {}],
  ["hourly_salary", [80, 50, 21.75, 8], {}],
  ["overtime", [100, 1.5, 8, 22], {}],
  ["tax_vat", [100, 13], { mode: "add" }],
  ["discount_chain", [100], { ds: [20, 10] }],
  ["markup_margin", [100, 150], { target: 30 }],
  ["net_worth", [500000, 200000], {}],
  ["inflation", [100, 3, 10], {}],
  ["credit_card", [5000, 18, 500], {}],
  ["debt_payoff", [100000, 12, 2000], {}],
  ["savings_goal", [100000, 2000, 3], {}],
  ["unit_econ", [100, 500, 5], {}],
  ["roi", [1000, 1500, 180], {}],
  ["break_even", [10000, 100, 40], {}],
  ["calorie_deficit", [2000, 5, 12], {}],
  ["macro", [2000, 1.6, 25, 50], {}],
  ["water", [60, 1.5, 30], {}],
  ["heart_zones", [30, 60, 50, 85], {}],
  ["pace", [30, 5], {}],
  ["run_time", [10, 6, 60], {}],
  ["calories_burned", [65, 30, 7], {}],
  ["sleep_cycles", ["07:00", 5], {}],
  ["time_convert", [3661], {}],
  ["chinese_age", ["1990-05-01", "2026-10-21"], {}],
  ["zodiac", ["1990-05-01"], {}],
  ["future_date", ["2026-10-21", 30], {}],
  ["steps", [8000, 72], {}],
  ["ideal_weight", [170, 1], {}],
  ["distance", [0, 0, 3, 4], {}],
  ["json_format", ['{"a":1}'], {}],
  ["url_encode", ["a b&c"], { mode: "encode" }],
  ["cpc_cpm", [1000, 500, 50000], {}],
  ["conversion_rate", [1000, 20], {}],
  ["aov", [100, 8000], {}],
  ["roi_ads", [1000, 50, 10, 300], {}],
  ["ad_budget", [10000, 40, 30, 30], {}],
  ["seo_ctr", [10000, 250, 5], {}],
  ["cart_recovery", [1000, 8, 120], {}],
  ["price_elasticity", [100, 1000, 90, 1150], {}],
  ["grade", [85, 100], {}],
  ["study_plan", [30, 2, 600], {}],
  ["pomodoro", [25, 5, 4, 9], {}],
  ["time_billing", [7.5, 500, 20, 6], {}],
  ["invoice_total", ["设计 x 2\n开发 x 10", 500, 6, 0], {}],
  ["forty_two", ["1 2 3 4 5"], {}],
  ["gpa", ["3 3 4 2", "85 90 78 66"], {}],
  ["trip_budget", [2, 5, 1200, 400, 150, 200, 1], {}],
  ["depart_by", [500, 80, 30, "09:00"], {}],
  ["postage", [1, 1, 12, 5], {}],
  ["ev_charge", [30, 1.2, 90, 300], {}],
  ["gear_ratio", [50, 20, 700], {}],
  ["carpool", [4, 30, 8, 7.5], {}],
  ["paint", [30, 10, 2, 60], {}],
  ["tile", [20, 60, 60, 5, 80], {}],
  ["flooring", [20, 8, 150, 40], {}],
  ["concrete", [4, 3, 0.1, 480], {}],
  ["electricity", [300, 0.55, 0], {}],
  ["fuel", [8, 500, 7.5], {}],
  ["solar", [6, 550, 4, 900, 0.45], {}],
  ["battery", [50000, 150, 90], {}],
  ["recipe_scale", [4, 10], {}],
  ["cooking_time", [30, 2000], {}],
  ["pet_age", [3, "cat"], {}],
  ["pet_food", [5, 1.2, "cat", 30], {}],
  ["wallpaper", [5.2, 60, 2.5, 10], {}],
  ["bricks", [3, 0.24, 0.24, 0.115, 0.01], {}],
  ["carbon_footprint", [300, 50, 5000, 20], {}],
  ["reading_light", [500, 10], {}],
  ["recharge_cycles", [50, 80, 3000, 25], {}],
  ["tax_year", [100000, 60000, "[]"], {}],
  ["shopping_cart", ["笔 x 2\n本 x 3", 10, 0, 100], {}],
  ["loan_compare", [4.9, 30, 3.2, 20, 1000000], {}],
  ["salary_compare", [20000, 23000, 30, 20], {}],
  ["reading_time", [1000, 250], {}],
  ["stock_sip", [1000, 10, 8], {}],
  ["freelance_tax", [200000, 20, 20000], {}],
  ["warranty", [5000, 3, 100], {}],
  ["salary_offer", [15000, 18000, 3, 3, 0], {}],
  ["weight_watch", [70, 68, 65, 30], {}],
  ["calorie_target", [60, 170, 30, 1, "cut"], {}],
  ["bmi_reverse", [22, 170], {}],
  ["loan_total_interest", [1000000, 4.9, 30], {}],
  ["loan_prepay", [1000000, 4.9, 30, 100000], {}],
  ["simple_interest", [10000, 5, 3], {}],
  ["pct_diff", [10, 15], {}],
  ["unit_all", [5], { rows: [{ zh: "米", en: "m", f: 1 }, { zh: "厘米", en: "cm", f: 0.01 }], from: 0 }],
  ["fourty_two", ["1 2 3 4 5"], {}],
  ["invoice_tax", [100, 13], { mode: "add" }],
  ["bmi_category", [60, 170], {}],
  ["inflation_adj", [100, 3, 10], {}],
];

let ok = 0, fail = [];
for (const [name, vals, params] of cases) {
  try {
    const fn = E[name];
    if (!fn) { fail.push(`${name}: 引擎不存在`); continue; }
    const out = fn(vals, params || {});
    if (typeof out !== "string" || out.length < 10) { fail.push(`${name}: 输出过短 (${JSON.stringify(out).slice(0, 40)})`); continue; }
    if (/undefined|NaN/.test(out)) { fail.push(`${name}: 输出含 undefined/NaN`); continue; }
    ok++;
  } catch (e) {
    fail.push(`${name}: 抛错 ${e.message.slice(0, 60)}`);
  }
}
console.log(`引擎自测: ${ok}/${cases.length} 通过`);
if (fail.length) { console.log("问题:"); fail.forEach((f) => console.log("  ❌", f)); }

// 抽查几个具体结果
console.log("\n抽查:");
const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 110);
console.log("  房贷月供:", strip(E.loan_payment([1000000, 4.9, 30], {})));
console.log("  BMI    :", strip(E.bmi([60, 170], {})));
console.log("  倒计时  :", strip(E.date_diff(["2026-01-01", "2026-10-21"], {})));
console.log("  单位换算:", strip(E.unit([100], { rows: [{ zh: "米", f: 1 }, { zh: "厘米", f: 0.01 }], from: 0, to: 1 })));
console.log("  复利    :", strip(E.compound([10000, 5, 10], { periods: 12 })));
