// Сжатие фото в браузере перед отправкой: снимок с телефона (3–5 МБ) уменьшается до лимита.
// Уменьшаем сторону и качество JPEG, пока файл не уложится; прозрачность PNG заливается белым.

export const PRODUCT_PHOTO_BYTES = 1024 * 1024;

const SIDES = [1600, 1280, 1024, 800, 640];
const QUALITIES = [0.85, 0.75, 0.65, 0.55];

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // ниже — запасной путь через <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Возвращает файл не больше maxBytes (исходный, если он уже укладывается). Бросает ошибку, если сжать не удалось. */
export async function compressImage(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes) return file;
  const img = await decode(file);
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    for (const side of SIDES) {
      const scale = Math.min(1, side / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height);
      for (const q of QUALITIES) {
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", q));
        if (blob && blob.size <= maxBytes) {
          const name = file.name.replace(/\.[^.]*$/, "") || "photo";
          return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
        }
      }
    }
    throw new Error("too large");
  } finally {
    img.close();
  }
}
