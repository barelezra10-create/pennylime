/** Keep the rendered page and its canonical URL on the same valid page number. */
export function paginationPage(value?: string | string[]): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function paginationPath(path: string, page: number): string {
  return page > 1 ? `${path}?page=${page}` : path;
}
