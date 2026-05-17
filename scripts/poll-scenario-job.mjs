import Scenario from "@scenario-labs/sdk";
const client = new Scenario({ timeout: 60_000, maxRetries: 1 });
const jobId = process.argv[2];
if (!jobId) throw new Error("usage: node poll-scenario-job.mjs <jobId>");
const result = await client.jobs.retrieve(jobId);
const job = result.job ?? result;
console.log(JSON.stringify({
  jobId: job.jobId,
  status: job.status,
  progress: job.progress,
  jobType: job.jobType,
  assetIds: job.metadata?.assetIds ?? [],
  error: job.metadata?.error ?? null,
  hint: job.metadata?.hint ?? null,
}, null, 2));
