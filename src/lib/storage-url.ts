// URL загруженного файла (без зависимостей от файловой системы — годится и для клиента).
export function fileUrl(rel: string | null | undefined) {
  return rel ? `/files/${rel}` : null;
}
