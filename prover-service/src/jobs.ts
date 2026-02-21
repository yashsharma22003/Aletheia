import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ──────────────────────────────────────────────
// Job Types
// ──────────────────────────────────────────────

export type JobStatus =
    | 'pending'
    | 'witness_generating'
    | 'proving'
    | 'completed'
    | 'failed';

export interface Job {
    id: string;
    status: JobStatus;
    workDir: string;
    createdAt: number;
    updatedAt: number;
    error?: string;
    proof?: string;
    publicInputs?: Record<string, any>;
}

// ──────────────────────────────────────────────
// Job Store (in-memory)
// ──────────────────────────────────────────────

const jobs = new Map<string, Job>();

const JOBS_BASE_DIR = path.join(os.tmpdir(), 'aletheia-prover-jobs');

// Ensure base dir exists
if (!fs.existsSync(JOBS_BASE_DIR)) {
    fs.mkdirSync(JOBS_BASE_DIR, { recursive: true });
}

export function createJob(): Job {
    const id = uuidv4();
    const workDir = path.join(JOBS_BASE_DIR, id);
    fs.mkdirSync(workDir, { recursive: true });

    const job: Job = {
        id,
        status: 'pending',
        workDir,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    jobs.set(id, job);
    return job;
}

export function getJob(id: string): Job | undefined {
    return jobs.get(id);
}

export function updateJob(id: string, update: Partial<Job>): Job | undefined {
    const job = jobs.get(id);
    if (!job) return undefined;

    Object.assign(job, update, { updatedAt: Date.now() });
    jobs.set(id, job);
    return job;
}

export function listJobs(): Job[] {
    return Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
}

/** Clean up old job directories (> 1 hour) */
export function cleanupOldJobs(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [id, job] of jobs.entries()) {
        if (job.updatedAt < oneHourAgo) {
            try {
                fs.rmSync(job.workDir, { recursive: true, force: true });
            } catch {
                // ignore cleanup errors
            }
            jobs.delete(id);
        }
    }
}

// Run cleanup every 15 minutes
setInterval(cleanupOldJobs, 15 * 60 * 1000);
