import type Database from "better-sqlite3";
import type { InvoiceAttempt, InvoiceStatus, PendingJob } from "../../types.ts";

export class InvoiceRepository {
  #db: Database.Database;

  constructor(db: Database.Database) {
    this.#db = db;
  }

  createAttempt(params: {
    saleDate: string;
    contractorId: string;
    quantity: number;
    payloadJson: string;
    status: InvoiceStatus;
  }): number {
    const stmt = this.#db.prepare(`
      INSERT INTO invoice_attempts (sale_date, contractor_id, quantity, payload_json, status)
      VALUES (@saleDate, @contractorId, @quantity, @payloadJson, @status)
    `);
    const info = stmt.run(params);
    return Number(info.lastInsertRowid);
  }

  updateAttempt(id: number, patch: Partial<Pick<InvoiceAttempt, "status" | "ksef_reference" | "ksef_document_id" | "last_error">>): void {
    const columns: string[] = [];
    const values: Record<string, unknown> = { id };

    for (const [key, value] of Object.entries(patch)) {
      columns.push(`${key} = @${key}`);
      values[key] = value;
    }

    if (columns.length === 0) {
      return;
    }

    const stmt = this.#db.prepare(`UPDATE invoice_attempts SET ${columns.join(", ")} WHERE id = @id`);
    stmt.run(values);
  }

  getAttemptById(id: number): InvoiceAttempt | null {
    const stmt = this.#db.prepare(`SELECT * FROM invoice_attempts WHERE id = ?`);
    return (stmt.get(id) as InvoiceAttempt | undefined) ?? null;
  }

  listAttempts(limit = 200): InvoiceAttempt[] {
    const stmt = this.#db.prepare(`SELECT * FROM invoice_attempts ORDER BY id DESC LIMIT ?`);
    return stmt.all(limit) as InvoiceAttempt[];
  }

  appendEvent(params: {
    invoiceAttemptId: number;
    eventType: string;
    requestJson?: string;
    responseJson?: string;
    httpStatus?: number;
    errorCode?: string;
  }): void {
    const stmt = this.#db.prepare(`
      INSERT INTO ksef_events (invoice_attempt_id, event_type, request_json, response_json, http_status, error_code)
      VALUES (@invoiceAttemptId, @eventType, @requestJson, @responseJson, @httpStatus, @errorCode)
    `);
    stmt.run({
      invoiceAttemptId: params.invoiceAttemptId,
      eventType: params.eventType,
      requestJson: params.requestJson ?? null,
      responseJson: params.responseJson ?? null,
      httpStatus: params.httpStatus ?? null,
      errorCode: params.errorCode ?? null,
    });
  }

  listEvents(invoiceAttemptId: number): Array<Record<string, unknown>> {
    const stmt = this.#db.prepare(`
      SELECT * FROM ksef_events
      WHERE invoice_attempt_id = ?
      ORDER BY id ASC
    `);
    return stmt.all(invoiceAttemptId) as Array<Record<string, unknown>>;
  }

  enqueueRetry(params: {
    invoiceAttemptId: number;
    runAfter: string;
    maxAttempts: number;
  }): number {
    const stmt = this.#db.prepare(`
      INSERT INTO pending_jobs (invoice_attempt_id, job_type, run_after, max_attempts, status)
      VALUES (@invoiceAttemptId, 'retry_submit', @runAfter, @maxAttempts, 'pending')
    `);
    const info = stmt.run(params);
    return Number(info.lastInsertRowid);
  }

  getDuePendingJobs(nowIso: string, limit = 20): PendingJob[] {
    const stmt = this.#db.prepare(`
      SELECT * FROM pending_jobs
      WHERE status = 'pending' AND run_after <= ?
      ORDER BY run_after ASC, id ASC
      LIMIT ?
    `);
    return stmt.all(nowIso, limit) as PendingJob[];
  }

  markJobProcessing(id: number): void {
    this.#db.prepare(`UPDATE pending_jobs SET status = 'processing' WHERE id = ?`).run(id);
  }

  markJobDone(id: number): void {
    this.#db.prepare(`UPDATE pending_jobs SET status = 'done' WHERE id = ?`).run(id);
  }

  markJobFailed(id: number): void {
    this.#db.prepare(`UPDATE pending_jobs SET status = 'failed' WHERE id = ?`).run(id);
  }

  rescheduleJob(params: { id: number; runAfter: string; attemptCount: number }): void {
    this.#db
      .prepare(`
        UPDATE pending_jobs
        SET status = 'pending', run_after = @runAfter, attempt_count = @attemptCount
        WHERE id = @id
      `)
      .run(params);
  }
}
