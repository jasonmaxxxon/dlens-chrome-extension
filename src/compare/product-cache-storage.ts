import { PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY } from "./product-agent-task-feedback";
import { PRODUCT_CONTEXT_STORAGE_KEY } from "./product-context";
import { PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY } from "./product-signal-storage";
import { SIGNAL_READINGS_STORAGE_KEY } from "./signal-reading-storage";

export interface ProductCacheStorageArea {
  remove(keys: string | string[]): Promise<void>;
}

export async function clearProductDerivedCache(storageArea: ProductCacheStorageArea): Promise<void> {
  await storageArea.remove([
    PRODUCT_SIGNAL_ANALYSES_STORAGE_KEY,
    PRODUCT_AGENT_TASK_FEEDBACK_STORAGE_KEY,
    SIGNAL_READINGS_STORAGE_KEY,
    PRODUCT_CONTEXT_STORAGE_KEY
  ]);
}
