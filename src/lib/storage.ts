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

export async function saveImage(file: File, folder: string): Promise<string> {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new UploadError("Допустимы изображения JPG, PNG или WEBP");
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError("Файл больше 10 МБ");
  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  const rel = path.posix.join(folder, name);
  await mkdir(path.join(ROOT, folder), { recursive: true });
  await writeFile(path.join(ROOT, rel), Buffer.from(await file.arrayBuffer()));
  return rel;
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
  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  const rel = path.posix.join(folder, name);
  await mkdir(path.join(ROOT, folder), { recursive: true });
  await writeFile(path.join(ROOT, rel), Buffer.from(await file.arrayBuffer()));
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
