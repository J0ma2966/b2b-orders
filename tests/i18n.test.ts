import { describe, expect, it } from "vitest";
import { makeT, translate } from "@/lib/i18n/core";
import uz from "@/lib/i18n/uz";

describe("translate", () => {
  it("русский выводится как есть, с подстановкой", () => {
    expect(translate("ru", "Заказ №{n}", { n: 1001 })).toBe("Заказ №1001");
    expect(translate("ru", "Корзина")).toBe("Корзина");
  });

  it("узбекский: точное совпадение и шаблон", () => {
    expect(translate("uz", "Корзина")).toBe(uz["Корзина"]);
    expect(translate("uz", "Заказ №{n}", { n: 1001 })).toBe("Buyurtma №1001");
  });

  it("готовая русская строка распознаётся по шаблону", () => {
    expect(translate("uz", "Минимум 8 символов")).toBe("Kamida 8 ta belgi");
    // Параметр сам переводится: сумма в сумах и статус
    expect(translate("uz", "долг 50 000 сум")).toBe("qarz 50 000 soʻm");
    expect(translate("uz", "Статус: Принят поставщиком")).toBe(`Holat: ${uz["Принят поставщиком"]}`);
  });

  it("незнакомый текст и данные пользователя не меняются", () => {
    expect(translate("uz", "ООО «Ташкент Опт»")).toBe("ООО «Ташкент Опт»");
    expect(translate("uz", "+998 90 123-45-67")).toBe("+998 90 123-45-67");
  });

  it("многострочный текст переводится по строкам", () => {
    expect(translate("uz", "Объём: 1 л\nСтрана: Узбекистан")).toBe("Hajmi: 1 l\nMamlakat: Oʻzbekiston");
  });

  it("составные подписи и строчная буква", () => {
    expect(translate("uz", "Вода 1 л · коробка")).toBe(`Вода 1 л · ${uz["коробка"]}`);
    const accepted = uz["Принят поставщиком"];
    expect(translate("uz", "принят поставщиком")).toBe(accepted[0].toLowerCase() + accepted.slice(1));
  });

  it("деньги и склонение", () => {
    const t = makeT("uz");
    expect(t.money(1500)).toMatch(/^1\s500 soʻm$/);
    expect(makeT("ru").plural(3, "товар", "товара", "товаров")).toBe("товара");
  });
});

describe("узбекский словарь", () => {
  const entries = Object.entries(uz);
  const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();

  it("плейсхолдеры совпадают с русским ключом", () => {
    expect(entries.filter(([k, v]) => placeholders(k) !== placeholders(v))).toEqual([]);
  });

  it("латиница и правильные знаки ʻ и ʼ", () => {
    const bad = entries.filter(([k, v]) => !k.startsWith("Рус") && !v.includes("Язык") && (/[А-Яа-яЁё]/.test(v) || /[oOgG]['‘’`]/.test(v)));
    expect(bad).toEqual([]);
  });
});
