// Разовая помощь при переводе: оборачивает русский текст JSX в t(...) и добавляет t в компоненты.
// node scripts/i18n-codemod.mjs file.tsx [...]
// Что не удалось обработать автоматически, печатается для ручной правки.
import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";

const CYR = /[А-Яа-яЁё]/;
const ATTRS = new Set(["placeholder", "aria-label", "alt", "title"]);
const AUTO = new Set(["Field", "PageHeader", "FilterBar", "SubmitButton", "Tr"]); // переводят строки сами

for (const file of process.argv.slice(2)) {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const isClient = /^["']use client["']/.test(src.trimStart());
  const edits = []; // {start, end, text}
  const needT = new Set(); // function nodes
  const report = [];
  const lit = (s) => JSON.stringify(s);

  const componentOf = (node) => {
    let n = node.parent;
    let comp = null;
    while (n) {
      if ((ts.isFunctionDeclaration(n) && n.name && /^[A-Z]/.test(n.name.text)) ||
        ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isVariableDeclaration(n.parent) && /^[A-Z]/.test(n.parent.name.getText(sf)))) {
        comp = n;
      }
      n = n.parent;
    }
    return comp;
  };
  // Не затеняет ли что-то имя t между узлом и компонентом
  const shadowed = (node, comp) => {
    for (let n = node.parent; n && n !== comp; n = n.parent) {
      if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)) && n.parameters.some((p) => p.name.getText(sf) === "t")) return true;
    }
    return false;
  };
  const line = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const wrap = (node, text) => {
    const comp = componentOf(node);
    if (!comp || shadowed(node, comp)) {
      report.push(`${file}:${line(node)} вручную: ${text.slice(0, 70)}`);
      return false;
    }
    needT.add(comp);
    return true;
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const raw = node.getText(sf);
      const trimmed = raw.replace(/\s+/g, " ").trim();
      const parent = node.parent;
      const tag = ts.isJsxElement(parent) ? parent.openingElement.tagName.getText(sf) : "";
      if (CYR.test(trimmed) && tag !== "Tr" && wrap(node, trimmed)) {
        const lead = raw.match(/^\s*/)[0];
        const trail = raw.match(/\s*$/)[0];
        const keepLead = lead.includes("\n") ? lead : lead ? " " : "";
        const keepTrail = trail.includes("\n") ? trail : trail ? " " : "";
        // Пробелы вокруг текста в одной строке сохраняются явно
        const pre = keepLead === " " ? '{" "}' : keepLead;
        const post = keepTrail === " " ? '{" "}' : keepTrail;
        edits.push({ start: node.getStart(sf), end: node.getEnd(), text: `${pre}{t(${lit(trimmed)})}${post}` });
      }
    } else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && CYR.test(node.initializer.text)) {
      const name = node.name.getText(sf);
      const tag = node.parent.parent.tagName.getText(sf);
      if (ATTRS.has(name) && !AUTO.has(tag) && wrap(node, node.initializer.text)) {
        edits.push({ start: node.initializer.getStart(sf), end: node.initializer.getEnd(), text: `{t(${lit(node.initializer.text)})}` });
      }
    } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && CYR.test(node.text)) {
      // Строка как содержимое JSX: {"…"}, {a ? "…" : "…"}, {x || "…"}
      let p = node.parent;
      while (p && (ts.isConditionalExpression(p) || ts.isParenthesizedExpression(p) || (ts.isBinaryExpression(p) && ["||", "??", "&&"].includes(p.operatorToken.getText(sf))))) {
        if (ts.isConditionalExpression(p) && p.condition === node) break;
        p = p.parent;
      }
      if (p && ts.isJsxExpression(p) && (ts.isJsxElement(p.parent) || ts.isJsxFragment(p.parent))) {
        const parentTag = ts.isJsxElement(p.parent) ? p.parent.openingElement.tagName.getText(sf) : "";
        if (!AUTO.has(parentTag) && wrap(node, node.text)) edits.push({ start: node.getStart(sf), end: node.getEnd(), text: `t(${lit(node.text)})` });
      }
    } else if (ts.isTemplateExpression(node)) {
      const text = node.getText(sf);
      if (CYR.test(text)) report.push(`${file}:${line(node)} шаблон: ${text.slice(0, 90)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Объявление t в начале каждого затронутого компонента
  for (const comp of needT) {
    const body = comp.body;
    if (!body) continue;
    const already = ts.isBlock(body) && /\bconst (t|\[[^\]]*\bt\b[^\]]*\]) = /.test(body.getText(sf).split("\n").slice(0, 4).join("\n"));
    if (already) continue;
    const isAsync = comp.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
    if (!isClient && !isAsync) {
      report.push(`${file}:${line(comp)} синхронный серверный компонент — добавьте t вручную`);
      continue;
    }
    const decl = isClient ? "const t = useT();" : "const t = await getT();";
    if (ts.isBlock(body)) {
      const first = body.statements[0];
      const indent = first ? " ".repeat(sf.getLineAndCharacterOfPosition(first.getStart(sf)).character) : "  ";
      const pos = first ? first.getStart(sf) : body.getStart(sf) + 1;
      edits.push({ start: pos, end: pos, text: `${decl}\n${indent}` });
    } else {
      // Стрелочная функция с выражением: оборачиваем в блок
      edits.push({ start: body.getStart(sf), end: body.getStart(sf), text: `{\n  ${decl}\n  return ` });
      edits.push({ start: body.getEnd(), end: body.getEnd(), text: `;\n}` });
    }
  }

  if (edits.length === 0) {
    if (report.length) console.log(report.join("\n"));
    continue;
  }
  let out = src;
  for (const e of edits.sort((a, b) => b.start - a.start || b.end - a.end)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  const importLine = isClient ? 'import { useT } from "@/lib/i18n/client";' : 'import { getT } from "@/lib/i18n/server";';
  const importName = isClient ? "useT" : "getT";
  if (!new RegExp(`\\b${importName}\\b[^\\n]*from "@/lib/i18n`).test(out)) {
    const lines = out.split("\n");
    let last = -1;
    lines.forEach((l, i) => { if (/^import /.test(l) || /^} from /.test(l)) last = i; });
    lines.splice(last + 1, 0, importLine);
    out = lines.join("\n");
  }
  writeFileSync(file, out);
  console.log(`✓ ${file}: ${edits.length} правок`);
  if (report.length) console.log(report.join("\n"));
}
