import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Локальное хранилище файлов. В продакшене заменяется на S3-совместимое без изменения вызовов.
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? "./storage/uploads");

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export class UploadError extends Error {}

export function isRealFile(v: FormDataEntryValue | null): v is File {
  return v instanceof File && v.size > 0;
}

// Файлы из поля формы; лишние не сохраняем на диск, а сразу отклоняем
export function realFiles(formData: FormData, name: string, max: number): File[] {
  const files = formData.getAll(name).filter(isRealFile);
  if (files.length > max) throw new UploadError(`Не больше ${max} файлов`);
  return files;
}

// Сигнатуры форматов: тип из браузера можно подделать, поэтому сверяем первые байты файла
function hasSignature(buf: Buffer, ext: string) {
  const at = (offset: number, bytes: number[] | string) =>
    (typeof bytes === "string" ? Buffer.from(bytes, "latin1") : Buffer.from(bytes)).equals(buf.subarray(offset, offset + bytes.length));
  switch (ext) {
    case "jpg":
      return at(0, [0xff, 0xd8, 0xff]);
    case "png":
      return at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "webp":
      return at(0, "RIFF") && at(8, "WEBP");
    case "webm":
      return at(0, [0x1a, 0x45, 0xdf, 0xa3]);
    case "mp4":
    case "mov":
      return at(4, "ftyp") || at(4, "moov") || at(4, "mdat") || at(4, "wide") || at(4, "free");
    default:
      return false;
  }
}

export type CheckedImage = { data: Buffer; ext: string };

// Проверка картинки без записи на диск: формы, где сохранение зависит от следующих шагов
// (регистрация ждёт код подтверждения), проверяют файл заранее, а пишут его только в конце.
export async function checkImage(file: File): Promise<CheckedImage> {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new UploadError("Допустимы изображения JPG, PNG или WEBP");
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError("Файл больше 10 МБ");
  const data = Buffer.from(await file.arrayBuffer());
  if (!hasSignature(data, ext)) throw new UploadError("Допустимы изображения JPG, PNG или WEBP");
  return { data, ext };
}

export async function storeImage(image: CheckedImage, folder: string): Promise<string> {
  const name = `${randomBytes(16).toString("hex")}.${image.ext}`;
  const rel = path.posix.join(folder, name);
  await mkdir(path.join(ROOT, folder), { recursive: true });
  await writeFile(path.join(ROOT, rel), image.data);
  return rel;
}

export async function saveImage(file: File, folder: string): Promise<string> {
  return storeImage(await checkImage(file), folder);
}

const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export async function saveVideo(file: File, folder: string): Promise<string> {
  const ext = VIDEO_TYPES[file.type];
  if (!ext) throw new UploadError("Допустимы видео MP4, WEBM или MOV");
  if (file.size > MAX_VIDEO_BYTES) throw new UploadError("Видео больше 50 МБ");
  const data = Buffer.from(await file.arrayBuffer());
  if (!hasSignature(data, ext)) throw new UploadError("Допустимы видео MP4, WEBM или MOV");
  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  const rel = path.posix.join(folder, name);
  await mkdir(path.join(ROOT, folder), { recursive: true });
  await writeFile(path.join(ROOT, rel), data);
  return rel;
}

export async function readStoredFile(rel: string) {
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(ROOT + path.sep)) return null;
  try {
    return await readFile(full);
  } catch {
    return null;
  }
}

export { fileUrl } from "./storage-url";
