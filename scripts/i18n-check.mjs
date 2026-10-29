// Проверка перевода: node scripts/i18n-check.mjs [--keys] [--missing] [--jsx]
//   --jsx      русский текст прямо в JSX (не обёрнут в t / Tr)
//   --keys     все русские строки исходников (шаблоны с {0}, {1} вместо подстановок)
//   --missing  строки, которых нет в узбекском словаре
//   --unused   ключи словаря, которых больше нет в коде
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");
// Юридические страницы написаны на двух языках целиком, без словаря
const SKIP = [/generated/, /lib\/i18n\//, /\.test\./, /\(public\)\//, /lib\/legal\.ts/, /lib\/native-push\.ts/];
const SELF_TRANSLATING = new Set(["Tr", "Button", "ButtonLink", "Badge", "Alert", "EmptyState", "SubmitButton"]);
const CYR = /[А-Яа-яЁё]/;

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f) && !SKIP.some((r) => r.test(p))) out.push(p);
  }
  return out;
}

const keys = new Map(); // key -> first location
const jsx = [];
const add = (k, file, node, sf) => {
  k = k.replace(/\s+/g, " ").trim();
  if (!CYR.test(k) || keys.has(k)) return;
  keys.set(k, `${path.relative(ROOT, file)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
};

// Списки распознаваемых слов (*_ALIASES) — это ввод пользователя, а не текст интерфейса
const inAliases = (node) => {
  for (let p = node.parent; p; p = p.parent) if (ts.isVariableDeclaration(p)) return /_ALIASES$/.test(p.name.getText());
  return false;
};

// Названия территорий из начальных данных тоже показываются в интерфейсе
for (const file of [...walk(SRC), path.join(ROOT, "prisma/territories.ts"), path.join(ROOT, "prisma/seed.ts")]) {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!ts.isImportDeclaration(node.parent) && !inAliases(node)) add(node.text, file, node, sf);
    } else if (ts.isTemplateExpression(node)) {
      let s = node.head.text;
      node.templateSpans.forEach((span, i) => (s += `{${i}}` + span.literal.text));
      add(s, file, node, sf);
    } else if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, " ").trim();
      const parent = node.parent;
      // Эти компоненты переводят текст-содержимое сами
      const inTr = ts.isJsxElement(parent) && SELF_TRANSLATING.has(parent.openingElement.tagName.getText(sf));
      if (CYR.test(text) && !inTr) {
        jsx.push(`${path.relative(ROOT, file)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}  ${text}`);
      }
      if (CYR.test(text)) add(text, file, node, sf);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const arg = process.argv[2] ?? "--missing";
if (arg === "--jsx") {
  console.log(jsx.join("\n"));
  console.error(`${jsx.length} строк JSX без перевода`);
} else if (arg === "--keys") {
  for (const [k, loc] of keys) console.log(`${loc}\t${k}`);
} else if (arg === "--unused") {
  const uz = (await import(path.join(SRC, "lib/i18n/uz.ts"))).default;
  const unused = Object.keys(uz).filter((k) => !keys.has(k));
  console.log(unused.join("\n"));
  console.error(`${unused.length} лишних ключей`);
} else {
  const uz = (await import(path.join(SRC, "lib/i18n/uz.ts"))).default;
  const missing = [...keys].filter(([k]) => !(k in uz));
  for (const [k, loc] of missing) console.log(`${loc}\t${k}`);
  console.error(`${missing.length} из ${keys.size} строк без перевода`);
}
