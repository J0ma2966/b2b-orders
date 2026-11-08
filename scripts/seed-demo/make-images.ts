// Рисует картинки для тестовых данных (товары, логотипы поставщиков, фото магазинов) в
// scripts/seed-demo/images. Готовые файлы лежат в репозитории, запускать нужно только после
// правок в data.ts:  CHROMIUM_PATH=… npx tsx scripts/seed-demo/make-images.ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { SHOPS, SUPPLIERS } from "./data";

const OUT = path.resolve(import.meta.dirname, "images");
const FONT = "font-family: 'Noto Sans', 'DejaVu Sans', sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// Без надписей: приложение показывает фото и в круге, и в квадрате
function productHtml(p: { emoji: string; bg: string }) {
  return `<body style="margin:0;width:600px;height:600px;${FONT};background:radial-gradient(circle at 50% 42%, #ffffff 0%, ${p.bg} 62%);display:flex;align-items:center;justify-content:center">
  <div style="font-size:280px;line-height:1;filter:drop-shadow(0 18px 18px rgba(0,0,0,.18))">${p.emoji}</div>
</body>`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
  const shot = async (html: string, file: string, w = 600, h = 600) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(html);
    await writeFile(path.join(OUT, file), await page.screenshot({ type: "jpeg", quality: 82 }));
  };
  for (const s of SUPPLIERS) {
    await shot(
      `<body style="margin:0;width:400px;height:400px;background:${s.logo.bg};display:grid;place-items:center;${FONT}"><div style="text-align:center;color:${s.logo.fg}"><div style="font-size:170px;line-height:1">${s.logo.emoji}</div><div style="font-size:34px;font-weight:700;margin-top:18px">${esc(s.displayName.split(" — ")[0])}</div></div></body>`,
      `logo-${s.key}.jpg`, 400, 400,
    );
    for (const p of s.products) await shot(productHtml(p), `${p.key}.jpg`);
  }
  for (const sh of SHOPS) {
    await shot(
      `<body style="margin:0;width:800px;height:600px;background:linear-gradient(180deg,#bfe3ff 0%,#bfe3ff 55%,#cfcfcf 55%);${FONT};display:flex;align-items:flex-end;justify-content:center"><div style="width:620px;height:400px;background:${sh.bg};border-radius:18px 18px 0 0;box-shadow:0 -6px 30px rgba(0,0,0,.15);display:flex;flex-direction:column;align-items:center"><div style="margin-top:26px;padding:14px 30px;background:#fff;border-radius:12px;font-size:40px;font-weight:700;color:#234">${esc(sh.name)}</div><div style="font-size:190px;line-height:1;margin-top:24px">${sh.emoji}</div></div></body>`,
      `shop-${sh.key}.jpg`, 800, 600,
    );
  }
  await browser.close();
  console.log(`Картинки сохранены в ${OUT}`);
}

main();
