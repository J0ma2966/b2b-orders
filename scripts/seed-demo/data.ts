// Справочник тестовых данных для scripts/seed-demo/seed.ts: поставщики, их каталоги и магазины.
// Картинки товаров лежат в scripts/seed-demo/images (сделаны scripts/seed-demo/make-images.ts).

export type Unit = {
  kind: "PIECE" | "BOX" | "BLOCK" | "KG" | "PACK" | "LITER";
  price: number;
  // Для коробки/блока: сколько базовых единиц (первой единицы товара) внутри. Остаток — только в базовой.
  per?: number;
};

export type DemoProduct = {
  key: string; // имя файла картинки и ключ для заказов
  name: string;
  category: string;
  brand: string;
  description: string;
  weightKg: number;
  country: string;
  shelfLife: string;
  barcode: string;
  extra?: [string, string][];
  units: Unit[];
  stock: number; // в базовой (первой) единице
  lowStock?: number;
  available?: boolean; // снят с продажи
  noReplacement?: boolean;
  emoji: string;
  bg: string;
};

export type DemoSupplier = {
  key: string;
  legalName: string;
  displayName: string;
  inn: string;
  legalAddress: string;
  officeAddress: string;
  district: string; // район г. Ташкента для офиса
  lat: number;
  lng: number;
  email: string;
  website?: string;
  description: string;
  owner: { phone: string; name: string; delivers?: boolean };
  admins: { phone: string; name: string }[];
  couriers: { phone: string; name: string }[];
  extraPhones: string[];
  // Территории доставки: регион или город + дни (1 = пн … 7 = вс, пусто — каждый день)
  territories: { region: string; city?: string; weekdays: number[]; courier?: number }[];
  minOrderTotal: number | null;
  orderCutoffHour: number | null;
  skipAssembly?: boolean;
  creditOverLimitBlock?: boolean;
  commissionRate?: number;
  logo: { emoji: string; bg: string; fg: string };
  products: DemoProduct[];
};

const UZ = "Узбекистан";

export const SUPPLIERS: DemoSupplier[] = [
  {
    key: "food",
    legalName: "ООО «Toshkent Oziq-Ovqat Savdo»",
    displayName: "Ташкент Продукт Опт",
    inn: "305112233",
    legalAddress: "г. Ташкент, Яшнабадский район, ул. Махтумкули, 45",
    officeAddress: "г. Ташкент, ул. Махтумкули, 45, склад №3",
    district: "Яшнабадский район",
    lat: 41.2995,
    lng: 69.3155,
    email: "sales@toshkent-oziq.uz",
    website: "https://toshkent-oziq.uz",
    description: "Бакалея, масло, консервы, чай и молочная продукция оптом. Доставка по Ташкенту каждый день, по Чирчику — вт, чт, сб.",
    owner: { phone: "+998901100001", name: "Рустам Ахмедов" },
    admins: [{ phone: "+998901100011", name: "Нигора Саидова" }],
    couriers: [
      { phone: "+998901200001", name: "Шерзод Турсунов" },
      { phone: "+998901200002", name: "Отабек Мирзаев" },
    ],
    extraPhones: ["+998712001122"],
    territories: [
      { region: "г. Ташкент", weekdays: [], courier: 0 },
      { region: "Ташкентская область", city: "Чирчик", weekdays: [2, 4, 6], courier: 1 },
    ],
    minOrderTotal: 300000,
    orderCutoffHour: 17,
    logo: { emoji: "🌾", bg: "#1f6f43", fg: "#ffffff" },
    products: [
      { key: "food-rice-devzira", name: "Рис девзира 1 кг", category: "Бакалея", brand: "Фергана Гуруч", description: "Красный рис девзира из Ферганской долины — классика для плова. Зёрна плотные, не развариваются.", weightKg: 1, country: UZ, shelfLife: "12 месяцев", barcode: "4780001000011", extra: [["Сорт", "Девзира красная"]], units: [{ kind: "PIECE", price: 32000 }, { kind: "BOX", price: 310000, per: 10 }], stock: 900, lowStock: 100, emoji: "🍚", bg: "#f3ead8" },
      { key: "food-rice-laser", name: "Рис лазер 5 кг", category: "Бакалея", brand: "Oq Don", description: "Длиннозёрный белый рис для гарниров и супов, мешок 5 кг.", weightKg: 5, country: UZ, shelfLife: "12 месяцев", barcode: "4780001000028", units: [{ kind: "PIECE", price: 98000 }, { kind: "PACK", price: 380000, per: 4 }], stock: 240, lowStock: 30, emoji: "🌾", bg: "#f6f1e3" },
      { key: "food-flour", name: "Мука пшеничная высший сорт 2 кг", category: "Бакалея", brand: "Дон Махсулотлари", description: "Мука высшего сорта для выпечки хлеба, самсы и лагмана.", weightKg: 2, country: UZ, shelfLife: "9 месяцев", barcode: "4780001000035", units: [{ kind: "PIECE", price: 17000 }, { kind: "PACK", price: 160000, per: 10 }], stock: 600, lowStock: 80, emoji: "🥖", bg: "#f5ecd9" },
      { key: "food-sugar", name: "Сахар-песок 1 кг", category: "Бакалея", brand: "Хоразм Шакар", description: "Белый кристаллический сахар, фасовка 1 кг.", weightKg: 1, country: UZ, shelfLife: "24 месяца", barcode: "4780001000042", units: [{ kind: "PIECE", price: 14500 }, { kind: "PACK", price: 138000, per: 10 }], stock: 1000, lowStock: 150, emoji: "🧂", bg: "#eef1f4" },
      { key: "food-salt", name: "Соль поваренная йодированная 1 кг", category: "Бакалея", brand: "Баркчи Туз", description: "Пищевая соль помола №1 с йодом.", weightKg: 1, country: UZ, shelfLife: "5 лет", barcode: "4780001000059", units: [{ kind: "PIECE", price: 3500 }, { kind: "PACK", price: 66000, per: 20 }], stock: 800, lowStock: 100, emoji: "🧂", bg: "#e7ecef" },
      { key: "food-pasta", name: "Макароны рожки 400 г", category: "Бакалея", brand: "Makfa", description: "Макаронные изделия из твёрдых сортов пшеницы, группа А.", weightKg: 0.4, country: "Россия", shelfLife: "24 месяца", barcode: "4600001000066", units: [{ kind: "PIECE", price: 11500 }, { kind: "BOX", price: 215000, per: 20 }], stock: 400, lowStock: 60, emoji: "🍝", bg: "#fbefcf" },
      { key: "food-buckwheat", name: "Гречка ядрица 800 г", category: "Бакалея", brand: "Увелка", description: "Гречневая крупа ядрица первого сорта, пропаренная.", weightKg: 0.8, country: "Россия", shelfLife: "18 месяцев", barcode: "4600001000073", units: [{ kind: "PIECE", price: 19000 }, { kind: "BOX", price: 220000, per: 12 }], stock: 0, lowStock: 24, emoji: "🌰", bg: "#ecdcc9" },
      { key: "food-oil-sunflower", name: "Масло подсолнечное рафинированное 1 л", category: "Масло и соусы", brand: "Oltin Don", description: "Рафинированное дезодорированное масло для жарки и салатов.", weightKg: 0.92, country: UZ, shelfLife: "12 месяцев", barcode: "4780001000080", units: [{ kind: "PIECE", price: 22000 }, { kind: "BOX", price: 252000, per: 12 }], stock: 720, lowStock: 96, emoji: "🌻", bg: "#fbf0c2" },
      { key: "food-oil-cotton", name: "Масло хлопковое 5 л", category: "Масло и соусы", brand: "Yog' Kombinati", description: "Хлопковое масло для плова, канистра 5 литров.", weightKg: 4.6, country: UZ, shelfLife: "12 месяцев", barcode: "4780001000097", units: [{ kind: "PIECE", price: 115000 }, { kind: "BOX", price: 450000, per: 4 }], stock: 160, lowStock: 20, emoji: "🫒", bg: "#f4e6b0" },
      { key: "food-ketchup", name: "Кетчуп томатный 450 г", category: "Масло и соусы", brand: "Baltimor", description: "Классический томатный кетчуп в мягкой упаковке.", weightKg: 0.45, country: "Россия", shelfLife: "12 месяцев", barcode: "4600001000103", units: [{ kind: "PIECE", price: 14000 }, { kind: "BOX", price: 260000, per: 20 }], stock: 300, emoji: "🍅", bg: "#f7d9d4" },
      { key: "food-mayo", name: "Майонез Провансаль 67% 380 г", category: "Масло и соусы", brand: "Махеевъ", description: "Майонез с перепелиным яйцом, дой-пак с дозатором.", weightKg: 0.38, country: "Россия", shelfLife: "6 месяцев", barcode: "4600001000110", units: [{ kind: "PIECE", price: 16500 }, { kind: "BOX", price: 300000, per: 20 }], stock: 280, noReplacement: false, emoji: "🥚", bg: "#fbf6e6" },
      { key: "food-tomato-paste", name: "Томатная паста 500 г", category: "Консервы", brand: "Bodom", description: "Томатная паста 25%, стеклянная банка.", weightKg: 0.5, country: UZ, shelfLife: "24 месяца", barcode: "4780001000127", units: [{ kind: "PIECE", price: 18000 }, { kind: "BOX", price: 200000, per: 12 }], stock: 360, emoji: "🥫", bg: "#f6d5cc" },
      { key: "food-peas", name: "Горошек зелёный 400 г", category: "Консервы", brand: "Bonduelle", description: "Нежный зелёный горошек, жестяная банка с ключом.", weightKg: 0.4, country: "Венгрия", shelfLife: "36 месяцев", barcode: "3083681000134", units: [{ kind: "PIECE", price: 16000 }, { kind: "BOX", price: 180000, per: 12 }], stock: 240, emoji: "🫛", bg: "#e3f0d4" },
      { key: "food-tea-green", name: "Чай зелёный №95 100 г", category: "Чай и кофе", brand: "Шифо", description: "Байховый зелёный чай №95 — самый популярный в чайхане.", weightKg: 0.1, country: UZ, shelfLife: "24 месяца", barcode: "4780001000141", units: [{ kind: "PIECE", price: 9000 }, { kind: "BOX", price: 330000, per: 40 }], stock: 1200, lowStock: 120, emoji: "🍵", bg: "#dcefd8" },
      { key: "food-tea-black", name: "Чай чёрный листовой 250 г", category: "Чай и кофе", brand: "Ahmad Tea", description: "Цейлонский чёрный чай крупный лист.", weightKg: 0.25, country: "Шри-Ланка", shelfLife: "36 месяцев", barcode: "0543001000158", units: [{ kind: "PIECE", price: 42000 }, { kind: "BOX", price: 470000, per: 12 }], stock: 180, emoji: "🫖", bg: "#efe0d0" },
      { key: "food-coffee", name: "Кофе растворимый 95 г", category: "Чай и кофе", brand: "Nescafé Classic", description: "Растворимый гранулированный кофе в стеклянной банке.", weightKg: 0.095, country: "Россия", shelfLife: "24 месяца", barcode: "7613001000165", units: [{ kind: "PIECE", price: 48000 }, { kind: "BOX", price: 540000, per: 12 }], stock: 150, available: false, emoji: "☕", bg: "#e6d3c3" },
      { key: "food-milk", name: "Молоко 3,2% 1 л", category: "Молочная продукция", brand: "Musaffo", description: "Ультрапастеризованное молоко в тетрапаке. Хранить при температуре до +25 °C.", weightKg: 1.03, country: UZ, shelfLife: "6 месяцев", barcode: "4780001000172", units: [{ kind: "PIECE", price: 13500 }, { kind: "BOX", price: 155000, per: 12 }], stock: 480, lowStock: 60, noReplacement: true, emoji: "🥛", bg: "#e8f1fb" },
      { key: "food-butter", name: "Масло сливочное 72,5% 200 г", category: "Молочная продукция", brand: "Lactel", description: "Сладкосливочное несолёное масло. Хранить при +2…+6 °C.", weightKg: 0.2, country: UZ, shelfLife: "60 суток", barcode: "4780001000189", units: [{ kind: "PIECE", price: 27000 }, { kind: "BOX", price: 500000, per: 20 }], stock: 200, noReplacement: true, emoji: "🧈", bg: "#fbf3cf" },
    ],
  },
  {
    key: "drinks",
    legalName: "ООО «Samarqand Ichimliklari»",
    displayName: "Самарканд Напитки",
    inn: "305223344",
    legalAddress: "г. Самарканд, ул. Регистан, 12",
    officeAddress: "г. Ташкент, Сергелийский район, промзона, ул. Янги Сергели, 8",
    district: "Сергелийский район",
    lat: 41.2235,
    lng: 69.2205,
    email: "opt@samarqand-ichimlik.uz",
    description: "Вода, газированные напитки, соки и холодный чай. Возим по Ташкенту в пн, ср, пт. Заказ принимается без отдельной сборки.",
    owner: { phone: "+998901100002", name: "Фаррух Норматов" },
    admins: [],
    couriers: [{ phone: "+998901200003", name: "Жасур Каримов" }],
    extraPhones: [],
    territories: [{ region: "г. Ташкент", weekdays: [1, 3, 5], courier: 0 }],
    minOrderTotal: 250000,
    orderCutoffHour: 15,
    skipAssembly: true,
    logo: { emoji: "🥤", bg: "#1d5fa8", fg: "#ffffff" },
    products: [
      { key: "drk-water-15", name: "Вода питьевая негазированная 1,5 л", category: "Вода", brand: "Hydrolife", description: "Очищенная питьевая вода, ПЭТ-бутылка 1,5 л.", weightKg: 1.55, country: UZ, shelfLife: "12 месяцев", barcode: "4780002000011", units: [{ kind: "PIECE", price: 4500 }, { kind: "PACK", price: 25000, per: 6 }], stock: 3000, lowStock: 300, emoji: "💧", bg: "#d8ecf7" },
      { key: "drk-water-05", name: "Вода питьевая негазированная 0,5 л", category: "Вода", brand: "Hydrolife", description: "Маленькая бутылка воды для прилавка у кассы.", weightKg: 0.52, country: UZ, shelfLife: "12 месяцев", barcode: "4780002000028", units: [{ kind: "PIECE", price: 2500 }, { kind: "PACK", price: 28000, per: 12 }], stock: 2400, lowStock: 240, emoji: "💦", bg: "#e1f1fa" },
      { key: "drk-water-gas", name: "Минеральная вода газированная 1 л", category: "Вода", brand: "Chortoq", description: "Природная лечебно-столовая минеральная вода из Наманганской области.", weightKg: 1.05, country: UZ, shelfLife: "18 месяцев", barcode: "4780002000035", units: [{ kind: "PIECE", price: 8000 }, { kind: "PACK", price: 45000, per: 6 }], stock: 900, emoji: "🫧", bg: "#d6eef0" },
      { key: "drk-water-19", name: "Вода питьевая 19 л (бутыль)", category: "Вода", brand: "Toza Suv", description: "Бутыль 19 л для кулера. Тара возвратная, залог не взимается.", weightKg: 19.5, country: UZ, shelfLife: "6 месяцев", barcode: "4780002000042", units: [{ kind: "PIECE", price: 22000 }], stock: 120, lowStock: 20, noReplacement: true, emoji: "🚰", bg: "#cfe6f5" },
      { key: "drk-cola", name: "Кола 1,5 л", category: "Газированные напитки", brand: "Coca-Cola", description: "Классическая кола в бутылке 1,5 л.", weightKg: 1.6, country: UZ, shelfLife: "12 месяцев", barcode: "5449000000011", units: [{ kind: "PIECE", price: 13000 }, { kind: "PACK", price: 75000, per: 6 }], stock: 1200, lowStock: 120, emoji: "🥤", bg: "#f7d6d6" },
      { key: "drk-fanta", name: "Апельсиновый лимонад 1,5 л", category: "Газированные напитки", brand: "Fanta", description: "Газированный напиток со вкусом апельсина.", weightKg: 1.6, country: UZ, shelfLife: "12 месяцев", barcode: "5449000000028", units: [{ kind: "PIECE", price: 12500 }, { kind: "PACK", price: 72000, per: 6 }], stock: 900, emoji: "🍊", bg: "#fde0c2" },
      { key: "drk-tarhun", name: "Лимонад «Тархун» 1 л", category: "Газированные напитки", brand: "Nestle", description: "Лимонад на экстракте эстрагона, стеклянная бутылка.", weightKg: 1.3, country: UZ, shelfLife: "9 месяцев", barcode: "4780002000059", units: [{ kind: "PIECE", price: 9000 }, { kind: "BOX", price: 102000, per: 12 }], stock: 600, emoji: "🌿", bg: "#dbf2d3" },
      { key: "drk-juice-apple", name: "Сок яблочный 1 л", category: "Соки и нектары", brand: "Bodom", description: "Осветлённый яблочный сок прямого отжима, без сахара.", weightKg: 1.05, country: UZ, shelfLife: "12 месяцев", barcode: "4780002000066", units: [{ kind: "PIECE", price: 14000 }, { kind: "BOX", price: 160000, per: 12 }], stock: 720, lowStock: 72, emoji: "🍎", bg: "#fbe7c6" },
      { key: "drk-juice-peach", name: "Нектар персиковый 1 л", category: "Соки и нектары", brand: "Bodom", description: "Нектар из ферганских персиков с мякотью.", weightKg: 1.05, country: UZ, shelfLife: "12 месяцев", barcode: "4780002000073", units: [{ kind: "PIECE", price: 15000 }, { kind: "BOX", price: 170000, per: 12 }], stock: 480, emoji: "🍑", bg: "#fde3d3" },
      { key: "drk-juice-cherry", name: "Нектар вишнёвый 0,2 л", category: "Соки и нектары", brand: "Rich", description: "Маленькая упаковка с трубочкой — для школьников и перекуса.", weightKg: 0.21, country: "Россия", shelfLife: "12 месяцев", barcode: "4600002000080", units: [{ kind: "PIECE", price: 5500 }, { kind: "BOX", price: 145000, per: 27 }], stock: 810, emoji: "🍒", bg: "#f6d0d6" },
      { key: "drk-icetea", name: "Холодный чай лимон 0,5 л", category: "Холодный чай и энергетики", brand: "Fuse Tea", description: "Холодный чёрный чай со вкусом лимона.", weightKg: 0.52, country: UZ, shelfLife: "9 месяцев", barcode: "5449000000097", units: [{ kind: "PIECE", price: 8500 }, { kind: "PACK", price: 96000, per: 12 }], stock: 600, emoji: "🧊", bg: "#f6efc8" },
      { key: "drk-energy", name: "Энергетический напиток 0,45 л", category: "Холодный чай и энергетики", brand: "Flash Up", description: "Энергетик в банке. Продажа лицам старше 18 лет.", weightKg: 0.47, country: "Россия", shelfLife: "12 месяцев", barcode: "4600002000103", extra: [["Ограничение", "18+"]], units: [{ kind: "PIECE", price: 11000 }, { kind: "BOX", price: 252000, per: 24 }], stock: 480, emoji: "⚡", bg: "#e9e3f7" },
      { key: "drk-ayran", name: "Айран 0,5 л", category: "Холодный чай и энергетики", brand: "Musaffo", description: "Кисломолочный напиток, хранить при +2…+6 °C.", weightKg: 0.52, country: UZ, shelfLife: "14 суток", barcode: "4780002000110", units: [{ kind: "PIECE", price: 7000 }, { kind: "BOX", price: 80000, per: 12 }], stock: 240, noReplacement: true, emoji: "🥛", bg: "#eef5fb" },
    ],
  },
  {
    key: "home",
    legalName: "ООО «Toza Uy Plus»",
    displayName: "Тоза Уй — бытовая химия",
    inn: "305334455",
    legalAddress: "г. Ташкент, Мирзо-Улугбекский район, ул. Буюк Ипак Йули, 150",
    officeAddress: "г. Ташкент, ул. Буюк Ипак Йули, 150",
    district: "Мирзо-Улугбекский район",
    lat: 41.3275,
    lng: 69.3412,
    email: "info@tozauy.uz",
    description: "Бытовая химия, средства гигиены и бумажная продукция. Работаем с отсрочкой платежа для проверенных магазинов.",
    owner: { phone: "+998901100003", name: "Камола Юлдашева" },
    admins: [{ phone: "+998901100013", name: "Азамат Хасанов" }],
    couriers: [{ phone: "+998901200004", name: "Улугбек Рахимов" }],
    extraPhones: ["+998712345566"],
    territories: [{ region: "г. Ташкент", weekdays: [2, 4, 6], courier: 0 }],
    minOrderTotal: 200000,
    orderCutoffHour: 18,
    creditOverLimitBlock: true,
    commissionRate: 2.5,
    logo: { emoji: "🫧", bg: "#7c3aed", fg: "#ffffff" },
    products: [
      { key: "home-dish", name: "Средство для мытья посуды «Лимон» 500 мл", category: "Бытовая химия", brand: "Fairy", description: "Концентрированный гель для посуды, удаляет жир даже в холодной воде.", weightKg: 0.53, country: "Россия", shelfLife: "36 месяцев", barcode: "8001003000011", units: [{ kind: "PIECE", price: 16000 }, { kind: "BOX", price: 180000, per: 12 }], stock: 480, lowStock: 48, emoji: "🍋", bg: "#f9f3c4" },
      { key: "home-powder", name: "Стиральный порошок автомат 3 кг", category: "Бытовая химия", brand: "Ariel", description: "Порошок для автоматических стиральных машин, на 20 стирок.", weightKg: 3, country: "Россия", shelfLife: "36 месяцев", barcode: "8001003000028", units: [{ kind: "PIECE", price: 89000 }, { kind: "BOX", price: 340000, per: 4 }], stock: 160, lowStock: 16, emoji: "🧺", bg: "#dbe7fb" },
      { key: "home-gel", name: "Гель для стирки цветного белья 1,3 л", category: "Бытовая химия", brand: "Persil", description: "Жидкое средство для стирки цветных тканей.", weightKg: 1.35, country: "Россия", shelfLife: "24 месяца", barcode: "9000101000035", units: [{ kind: "PIECE", price: 72000 }, { kind: "BOX", price: 410000, per: 6 }], stock: 120, emoji: "🧴", bg: "#e5f3e8" },
      { key: "home-bleach", name: "Отбеливатель «Белизна» 1 л", category: "Бытовая химия", brand: "Белизна", description: "Хлорсодержащее средство для отбеливания и дезинфекции.", weightKg: 1.1, country: UZ, shelfLife: "12 месяцев", barcode: "4780003000042", units: [{ kind: "PIECE", price: 9500 }, { kind: "BOX", price: 105000, per: 12 }], stock: 360, emoji: "🧪", bg: "#e8eef2" },
      { key: "home-glass", name: "Средство для стёкол 500 мл", category: "Бытовая химия", brand: "Mr. Muscle", description: "Спрей для стёкол и зеркал без разводов.", weightKg: 0.55, country: "Россия", shelfLife: "36 месяцев", barcode: "4600003000059", units: [{ kind: "PIECE", price: 24000 }, { kind: "BOX", price: 270000, per: 12 }], stock: 144, emoji: "🪟", bg: "#dff1fb" },
      { key: "home-toilet", name: "Чистящий гель для унитаза 750 мл", category: "Бытовая химия", brand: "Domestos", description: "Густой гель с хлором, убивает микробы.", weightKg: 0.8, country: "Россия", shelfLife: "24 месяца", barcode: "8714100000066", units: [{ kind: "PIECE", price: 29000 }, { kind: "BOX", price: 320000, per: 12 }], stock: 96, emoji: "🚽", bg: "#e2ecf8" },
      { key: "home-soap", name: "Мыло туалетное 90 г", category: "Гигиена", brand: "Duru", description: "Твёрдое мыло с увлажняющим кремом.", weightKg: 0.09, country: "Турция", shelfLife: "36 месяцев", barcode: "8690506000073", units: [{ kind: "PIECE", price: 5000 }, { kind: "BLOCK", price: 27000, per: 6 }, { kind: "BOX", price: 210000, per: 48 }], stock: 1440, lowStock: 144, emoji: "🧼", bg: "#fbe3ee" },
      { key: "home-shampoo", name: "Шампунь «Объём» 400 мл", category: "Гигиена", brand: "Head & Shoulders", description: "Шампунь против перхоти для всех типов волос.", weightKg: 0.43, country: "Россия", shelfLife: "36 месяцев", barcode: "5011321000080", units: [{ kind: "PIECE", price: 58000 }, { kind: "BOX", price: 330000, per: 6 }], stock: 120, emoji: "🧴", bg: "#e3ecfb" },
      { key: "home-toothpaste", name: "Зубная паста 100 мл", category: "Гигиена", brand: "Colgate", description: "Зубная паста с фтором для защиты от кариеса.", weightKg: 0.13, country: "Китай", shelfLife: "36 месяцев", barcode: "8714789000097", units: [{ kind: "PIECE", price: 18000 }, { kind: "BOX", price: 400000, per: 24 }], stock: 240, emoji: "🪥", bg: "#e8f6f6" },
      { key: "home-diapers", name: "Подгузники 4 (9–14 кг), 52 шт.", category: "Гигиена", brand: "Pampers", description: "Дышащие подгузники с индикатором влаги.", weightKg: 1.6, country: "Польша", shelfLife: "36 месяцев", barcode: "8006540000103", units: [{ kind: "PACK", price: 185000 }], stock: 40, lowStock: 10, emoji: "👶", bg: "#e7f0fd" },
      { key: "home-pads", name: "Влажные салфетки детские, 72 шт.", category: "Гигиена", brand: "Huggies", description: "Салфетки без спирта и отдушек, с клапаном.", weightKg: 0.45, country: "Россия", shelfLife: "24 месяца", barcode: "5029053000110", units: [{ kind: "PIECE", price: 21000 }, { kind: "BOX", price: 230000, per: 12 }], stock: 0, emoji: "🧻", bg: "#f2f2f8" },
      { key: "home-toilet-paper", name: "Туалетная бумага 2-слойная, 4 рулона", category: "Бумажная продукция", brand: "Familia", description: "Мягкая белая бумага, 4 рулона в упаковке.", weightKg: 0.42, country: UZ, shelfLife: "без ограничений", barcode: "4780003000127", units: [{ kind: "PACK", price: 14000 }, { kind: "BOX", price: 160000, per: 12 }], stock: 600, lowStock: 60, emoji: "🧻", bg: "#eef0f5" },
      { key: "home-towels", name: "Бумажные полотенца, 2 рулона", category: "Бумажная продукция", brand: "Zewa", description: "Двухслойные кухонные полотенца.", weightKg: 0.3, country: "Россия", shelfLife: "без ограничений", barcode: "7322540000134", units: [{ kind: "PACK", price: 16000 }, { kind: "BOX", price: 180000, per: 12 }], stock: 300, emoji: "🧾", bg: "#f3efe8" },
      { key: "home-napkins", name: "Салфетки бумажные 100 шт.", category: "Бумажная продукция", brand: "Familia", description: "Однослойные столовые салфетки 24×24 см.", weightKg: 0.2, country: UZ, shelfLife: "без ограничений", barcode: "4780003000141", units: [{ kind: "PACK", price: 6000 }, { kind: "BOX", price: 135000, per: 24 }], stock: 480, emoji: "📄", bg: "#f6f3ea" },
    ],
  },
  {
    key: "sweets",
    legalName: "ИП Абдуллаева Шахноза",
    displayName: "Ширин Дунё — сладости",
    inn: "605445566",
    legalAddress: "г. Ташкент, Чиланзарский район, 9-й квартал, дом 14, кв. 5",
    officeAddress: "г. Ташкент, Чиланзар, 9-й квартал, дом 14",
    district: "Чиланзарский район",
    lat: 41.2856,
    lng: 69.2042,
    email: "shirin.dunyo@mail.uz",
    description: "Домашнее производство и перепродажа сладостей: печенье, нават, халва, конфеты на развес. Развожу сама по Чиланзару и соседним районам.",
    owner: { phone: "+998901100004", name: "Шахноза Абдуллаева", delivers: true },
    admins: [],
    couriers: [],
    extraPhones: [],
    territories: [{ region: "г. Ташкент", weekdays: [] }],
    minOrderTotal: 100000,
    orderCutoffHour: 12,
    logo: { emoji: "🍬", bg: "#c2185b", fg: "#ffffff" },
    products: [
      { key: "sw-cookies-sugar", name: "Печенье сахарное «Юбилейное» 400 г", category: "Печенье и вафли", brand: "Crafers", description: "Хрустящее сахарное печенье к чаю.", weightKg: 0.4, country: UZ, shelfLife: "6 месяцев", barcode: "4780004000011", units: [{ kind: "PIECE", price: 11000 }, { kind: "BOX", price: 168000, per: 16 }], stock: 320, lowStock: 32, emoji: "🍪", bg: "#f5e1c8" },
      { key: "sw-cookies-home", name: "Печенье домашнее «Курабье», на развес", category: "Печенье и вафли", brand: "Ширин Дунё", description: "Песочное печенье ручной работы с джемом. Продаётся на вес, минимум 0,5 кг.", weightKg: 1, country: UZ, shelfLife: "30 суток", barcode: "2000004000028", extra: [["Производство", "Собственное"]], units: [{ kind: "KG", price: 65000 }], stock: 60, lowStock: 10, emoji: "🥮", bg: "#f8e4c2" },
      { key: "sw-wafers", name: "Вафли «Артек» 250 г", category: "Печенье и вафли", brand: "Konti", description: "Вафли с ореховой начинкой.", weightKg: 0.25, country: "Украина", shelfLife: "9 месяцев", barcode: "4823004000035", units: [{ kind: "PIECE", price: 12000 }, { kind: "BOX", price: 270000, per: 24 }], stock: 240, emoji: "🧇", bg: "#f6e3c0" },
      { key: "sw-chocolate", name: "Шоколад молочный 90 г", category: "Шоколад и конфеты", brand: "Alpen Gold", description: "Молочный шоколад с цельным фундуком.", weightKg: 0.09, country: "Россия", shelfLife: "12 месяцев", barcode: "7622004000042", units: [{ kind: "PIECE", price: 13000 }, { kind: "BOX", price: 250000, per: 20 }], stock: 400, lowStock: 40, emoji: "🍫", bg: "#ead6cc" },
      { key: "sw-candies-kg", name: "Конфеты «Ассорти» шоколадные, на развес", category: "Шоколад и конфеты", brand: "Тошкент Ширинликлари", description: "Шоколадные конфеты с разными начинками. Цена за 1 кг.", weightKg: 1, country: UZ, shelfLife: "6 месяцев", barcode: "2000004000059", units: [{ kind: "KG", price: 85000 }], stock: 80, lowStock: 10, emoji: "🍬", bg: "#f5d3df" },
      { key: "sw-caramel", name: "Карамель «Барбарис», на развес", category: "Шоколад и конфеты", brand: "Тошкент Ширинликлари", description: "Леденцовая карамель с барбарисом. Цена за 1 кг.", weightKg: 1, country: UZ, shelfLife: "12 месяцев", barcode: "2000004000066", units: [{ kind: "KG", price: 42000 }], stock: 120, emoji: "🍭", bg: "#f9d7e3" },
      { key: "sw-snickers", name: "Батончик шоколадный 50 г", category: "Шоколад и конфеты", brand: "Snickers", description: "Батончик с арахисом, карамелью и нугой.", weightKg: 0.05, country: "Россия", shelfLife: "12 месяцев", barcode: "5000159000073", units: [{ kind: "PIECE", price: 9000 }, { kind: "BLOCK", price: 300000, per: 36 }], stock: 720, emoji: "🍫", bg: "#e7d1c2" },
      { key: "sw-navat", name: "Нават (кристаллический сахар) 500 г", category: "Восточные сладости", brand: "Ширин Дунё", description: "Традиционный нават на нитке — к чаю и от простуды.", weightKg: 0.5, country: UZ, shelfLife: "24 месяца", barcode: "2000004000080", extra: [["Производство", "Собственное"]], units: [{ kind: "PIECE", price: 25000 }, { kind: "BOX", price: 230000, per: 10 }], stock: 150, emoji: "💎", bg: "#f6efd9" },
      { key: "sw-halva", name: "Халва кунжутная, на развес", category: "Восточные сладости", brand: "Ширин Дунё", description: "Кунжутная халва (тахинная) с фисташкой. Цена за 1 кг.", weightKg: 1, country: UZ, shelfLife: "3 месяца", barcode: "2000004000097", extra: [["Производство", "Собственное"]], units: [{ kind: "KG", price: 78000 }], stock: 40, lowStock: 8, emoji: "🥜", bg: "#efe0c4" },
      { key: "sw-parvarda", name: "Парварда 300 г", category: "Восточные сладости", brand: "Ширин Дунё", description: "Тянучки из сахара и муки — классика узбекского дастархана.", weightKg: 0.3, country: UZ, shelfLife: "6 месяцев", barcode: "2000004000103", extra: [["Производство", "Собственное"]], units: [{ kind: "PIECE", price: 15000 }], stock: 200, emoji: "🍡", bg: "#fbefe6" },
      { key: "sw-pishmaniye", name: "Пишмание 250 г", category: "Восточные сладости", brand: "Koska", description: "Сахарная вата по-турецки в коробке.", weightKg: 0.25, country: "Турция", shelfLife: "12 месяцев", barcode: "8690526000110", units: [{ kind: "PIECE", price: 28000 }], stock: 90, available: false, emoji: "☁️", bg: "#f3eee6" },
      { key: "sw-dried-apricot", name: "Курага сушёная, на развес", category: "Сухофрукты и орехи", brand: "Ферганские сады", description: "Курага без косточки, сушка на солнце. Цена за 1 кг.", weightKg: 1, country: UZ, shelfLife: "12 месяцев", barcode: "2000004000127", units: [{ kind: "KG", price: 95000 }], stock: 50, emoji: "🍑", bg: "#fbe0bf" },
      { key: "sw-almonds", name: "Миндаль жареный 200 г", category: "Сухофрукты и орехи", brand: "Ферганские сады", description: "Обжаренный солёный миндаль, вакуумная упаковка.", weightKg: 0.2, country: UZ, shelfLife: "9 месяцев", barcode: "2000004000134", units: [{ kind: "PIECE", price: 38000 }, { kind: "BOX", price: 430000, per: 12 }], stock: 120, emoji: "🌰", bg: "#ecdac6" },
    ],
  },
];

// Заявка на модерации — для проверки раздела «Поставщики» у администратора
export const PENDING_SUPPLIER = {
  legalName: "ООО «Farg'ona Meva Eksport»",
  displayName: "Фергана Фрукт",
  inn: "305556677",
  legalAddress: "г. Фергана, ул. Мустакиллик, 21",
  officeAddress: "г. Фергана, ул. Мустакиллик, 21",
  email: "fergana.meva@mail.uz",
  description: "Свежие фрукты и сухофрукты из Ферганской долины.",
  owner: { phone: "+998901100005", name: "Ботир Исмоилов" },
};

export type DemoShop = {
  key: string;
  name: string;
  inn?: string;
  district: string;
  address: string;
  lat: number;
  lng: number;
  owner: { phone: string; name: string };
  staff?: { phone: string; name: string };
  phone2?: string;
  emoji: string;
  bg: string;
};

export const SHOPS: DemoShop[] = [
  { key: "baraka", name: "Минимаркет «Baraka»", inn: "407001122", district: "Юнусабадский район", address: "г. Ташкент, Юнусабад, 4-й квартал, дом 12", lat: 41.3651, lng: 69.2878, owner: { phone: "+998901300001", name: "Дилшод Рахимов" }, staff: { phone: "+998901300011", name: "Мадина Рахимова (продавец)" }, phone2: "+998712223344", emoji: "🏪", bg: "#d9f2e3" },
  { key: "oila", name: "Магазин «Oila»", inn: "407002233", district: "Чиланзарский район", address: "г. Ташкент, Чиланзар, 7-й квартал, дом 3", lat: 41.2868, lng: 69.2051, owner: { phone: "+998901300002", name: "Гульнора Ташпулатова" }, emoji: "🛒", bg: "#fde9cf" },
  { key: "navruz", name: "Супермаркет «Navro'z»", inn: "407003344", district: "Мирзо-Улугбекский район", address: "г. Ташкент, ул. Мустакиллик, 88", lat: 41.3262, lng: 69.3348, owner: { phone: "+998901300003", name: "Анвар Холматов" }, emoji: "🏬", bg: "#e1ebfb" },
  { key: "hamkor", name: "Продукты «Hamkor»", district: "Яккасарайский район", address: "г. Ташкент, ул. Шота Руставели, 41", lat: 41.2921, lng: 69.2562, owner: { phone: "+998901300004", name: "Сардор Умаров" }, emoji: "🧺", bg: "#f6e2e2" },
  { key: "dostlik", name: "Магазин «Do'stlik»", district: "Сергелийский район", address: "г. Ташкент, Сергели-5, дом 21", lat: 41.2274, lng: 69.2187, owner: { phone: "+998901300005", name: "Зухра Назарова" }, emoji: "🏪", bg: "#efe6fb" },
  { key: "sharq", name: "Минимаркет «Sharq»", district: "Шайхантахурский район", address: "г. Ташкент, ул. Навои, 30", lat: 41.3268, lng: 69.2284, owner: { phone: "+998901300006", name: "Бобур Алиев" }, emoji: "🛍️", bg: "#fbf0cf" },
  { key: "yangihayot", name: "Магазин «Yangi Hayot»", district: "Яшнабадский район", address: "г. Ташкент, Яшнабад, ул. Тузель, 5", lat: 41.2952, lng: 69.3297, owner: { phone: "+998901300007", name: "Ирода Каримова" }, emoji: "🏠", bg: "#dcf1f1" },
  { key: "bahor", name: "Магазин «Bahor» (новый)", district: "Алмазарский район", address: "г. Ташкент, Алмазар, ул. Сагбан, 112", lat: 41.3479, lng: 69.2193, owner: { phone: "+998901300008", name: "Шохрух Ибрагимов" }, emoji: "🌸", bg: "#fde4ef" },
];
