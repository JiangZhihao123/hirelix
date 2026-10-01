import { AsyncLocalStorage } from "node:async_hooks";
import type { Job } from "./workspace/types";

// One context per worker execution, including nested AI calls. A reclaimed
// execution receives a new lease; failed/interrupted attempts never bill twice.
export const agentCreditContext = new AsyncLocalStorage<Job>();
