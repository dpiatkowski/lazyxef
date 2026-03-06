import type { InvoiceRepository } from "../repositories/sqlite/invoice-repository.js";
import type { InvoiceService } from "./invoice-service.js";

export class RetryWorker {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly repository: InvoiceRepository,
    private readonly invoiceService: InvoiceService,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);

    void this.tick();
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    const jobs = this.repository.getDuePendingJobs(new Date().toISOString(), 20);

    for (const job of jobs) {
      this.repository.markJobProcessing(job.id);
      const nextAttempt = job.attempt_count + 1;

      try {
        await this.invoiceService.retrySend(job.invoice_attempt_id);
        this.repository.markJobDone(job.id);
      } catch (error) {
        if (nextAttempt >= job.max_attempts) {
          this.repository.markJobFailed(job.id);
          this.repository.updateAttempt(job.invoice_attempt_id, {
            status: "failed",
            last_error: error instanceof Error ? error.message : "Retry attempts exceeded",
          });
          continue;
        }

        const delayMs = Math.min(300_000, 30_000 * nextAttempt);
        const runAfter = new Date(Date.now() + delayMs).toISOString();
        this.repository.rescheduleJob({
          id: job.id,
          runAfter,
          attemptCount: nextAttempt,
        });
      }
    }
  }
}
