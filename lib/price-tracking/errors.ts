export class ProductLookupError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProductLookupError";
  }
}

export function storeResponseError(status: number): ProductLookupError {
  if ([401, 403].includes(status))
    return new ProductLookupError(
      "store_access_denied",
      "This store declined DayHub's automated request. Please enter the price manually.",
    );
  if (status === 429)
    return new ProductLookupError(
      "store_rate_limited",
      "This store is limiting automated checks. Try again later or enter the price manually.",
    );
  if (status === 404)
    return new ProductLookupError(
      "product_not_found",
      "This product page could not be found. Check the link or enter the price manually.",
    );
  return new ProductLookupError(
    "store_unavailable",
    "This store is temporarily unavailable. Try again later or enter the price manually.",
  );
}
