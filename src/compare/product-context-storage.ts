import type { ProductContext } from "../state/types";
import {
  LEGACY_PRODUCT_CONTEXT_STORAGE_KEY,
  PRODUCT_CONTEXT_STORAGE_KEY
} from "./product-context";

export interface ProductContextStorageArea {
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export async function writeProductContextStorage(
  storageArea: ProductContextStorageArea,
  productContext: ProductContext | null
): Promise<void> {
  await storageArea.set({ [PRODUCT_CONTEXT_STORAGE_KEY]: productContext });
  await storageArea.remove(LEGACY_PRODUCT_CONTEXT_STORAGE_KEY);
}

export async function migrateLegacyProductContextStorage(
  storageArea: ProductContextStorageArea,
  value: unknown
): Promise<void> {
  await storageArea.set({ [PRODUCT_CONTEXT_STORAGE_KEY]: value });
  await storageArea.remove(LEGACY_PRODUCT_CONTEXT_STORAGE_KEY);
}
