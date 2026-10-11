// Listing preferences never delete products, change publication or revoke access.
export function includeArchivedProducts(params: URLSearchParams): boolean {
  return params.get("includeArchived") === "true";
}

export function adminProductListUrl(page: number, includeArchived: boolean): string {
  return `/api/admin/products?page=${page}&includeArchived=${includeArchived}`;
}

export function productArchiveFilter(includeArchived: boolean) {
  return includeArchived ? null : { column: "publication_status", value: "ARCHIVED" } as const;
}
