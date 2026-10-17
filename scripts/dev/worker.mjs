import dotenv from 'dotenv';

// Reload local configuration on every watched restart, before importing clients.
dotenv.config({ path: ['.env.local', '.env'], override: true, quiet: true });
process.env.SEARCH_JOB_SCHEDULER_ENABLED = 'false';
await import('../../scheduler/index.ts');
