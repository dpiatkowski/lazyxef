export type InvoiceStatus =
  | "draft"
  | "sending"
  | "accepted"
  | "retry_pending"
  | "failed";

export type Contractor = {
  id: string;
  name: string;
  nip: string;
  address: string;
};

export type InvoiceAttempt = {
  id: number;
  created_at: string;
  sale_date: string;
  contractor_id: string;
  quantity: number;
  payload_json: string;
  status: InvoiceStatus;
  ksef_reference: string | null;
  ksef_document_id: string | null;
  last_error: string | null;
};

export type PendingJob = {
  id: number;
  invoice_attempt_id: number;
  job_type: "retry_submit";
  run_after: string;
  attempt_count: number;
  max_attempts: number;
  status: "pending" | "processing" | "done" | "failed";
};

export type SubmitInvoiceInput = {
  contractorId: string;
  quantity: number;
  saleDate: string;
};

export type KsefSubmitResult = {
  ksefReference: string;
  ksefDocumentId: string;
  rawResponse: unknown;
};

export type KsefSubmitError = {
  message: string;
  transient: boolean;
  httpStatus?: number;
  code?: string;
  rawResponse?: unknown;
};
