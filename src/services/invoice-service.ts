import { z } from "zod";
import type { InvoiceRepository } from "../repositories/sqlite/invoice-repository.ts";
import type { Contractor } from "../types.ts";
import type { ContractorsStore } from "./contractors-store.ts";
import type { KsefClient } from "./ksef-client.ts";

const inputSchema = z.object({
  contractorId: z.string().min(1, "Wybierz kontrahenta"),
  quantity: z.number().positive("Ilosc musi byc wieksza od zera"),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data musi miec format YYYY-MM-DD"),
});

type InvoiceConfig = {
  retryMaxAttempts: number;
  seller: {
    nip: string;
    name: string;
    address: string;
  };
  item: {
    name: string;
    unit: string;
    netPrice: number;
    vatRate: number;
    currency: string;
  };
};

export class InvoiceService {
  #repository: InvoiceRepository;
  #contractorsStore: ContractorsStore;
  #ksefClient: KsefClient;
  #config: InvoiceConfig;

  constructor(
    repository: InvoiceRepository,
    contractorsStore: ContractorsStore,
    ksefClient: KsefClient,
    config: InvoiceConfig,
  ) {
    this.#repository = repository;
    this.#contractorsStore = contractorsStore;
    this.#ksefClient = ksefClient;
    this.#config = config;
  }

  validateInput(input: unknown) {
    return inputSchema.parse(input);
  }

  async createAndSend(input: unknown): Promise<number> {
    const parsed = this.validateInput(input);
    const contractor = this.#contractorsStore.getById(parsed.contractorId);

    if (!contractor) {
      throw new Error("Nie znaleziono kontrahenta");
    }

    const payload = this.#buildInvoicePayload(contractor, parsed.quantity, parsed.saleDate);
    const invoiceAttemptId = this.#repository.createAttempt({
      contractorId: contractor.id,
      saleDate: parsed.saleDate,
      quantity: parsed.quantity,
      payloadJson: JSON.stringify(payload),
      status: "sending",
    });

    await this.#sendAttempt(invoiceAttemptId, payload);
    return invoiceAttemptId;
  }

  async retrySend(invoiceAttemptId: number): Promise<void> {
    const attempt = this.#repository.getAttemptById(invoiceAttemptId);
    if (!attempt) {
      throw new Error("Nie znaleziono faktury");
    }

    const payload = JSON.parse(attempt.payload_json);
    this.#repository.updateAttempt(invoiceAttemptId, { status: "sending", last_error: null });
    await this.#sendAttempt(invoiceAttemptId, payload);
  }

  async #sendAttempt(invoiceAttemptId: number, payload: unknown): Promise<void> {
    this.#repository.appendEvent({
      invoiceAttemptId,
      eventType: "submit_requested",
      requestJson: JSON.stringify(payload),
    });

    try {
      const response = await this.#ksefClient.submitInvoice(payload);
      this.#repository.updateAttempt(invoiceAttemptId, {
        status: "accepted",
        ksef_reference: response.ksefReference,
        ksef_document_id: response.ksefDocumentId,
        last_error: null,
      });
      this.#repository.appendEvent({
        invoiceAttemptId,
        eventType: "submit_accepted",
        responseJson: JSON.stringify(response.rawResponse),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String((error as { message?: string }).message ?? "Unknown error");
      const transient = Boolean((error as { transient?: boolean }).transient);
      const httpStatus = (error as { httpStatus?: number }).httpStatus;
      const code = (error as { code?: string }).code;

      this.#repository.appendEvent({
        invoiceAttemptId,
        eventType: "submit_failed",
        responseJson: JSON.stringify(error),
        httpStatus,
        errorCode: code,
      });

      if (transient) {
        this.#repository.updateAttempt(invoiceAttemptId, { status: "retry_pending", last_error: message });
        const runAfter = new Date(Date.now() + 30_000).toISOString();
        this.#repository.enqueueRetry({
          invoiceAttemptId,
          runAfter,
          maxAttempts: this.#config.retryMaxAttempts,
        });
        return;
      }

      this.#repository.updateAttempt(invoiceAttemptId, {
        status: "failed",
        last_error: message,
      });
    }
  }

  #buildInvoicePayload(contractor: Contractor, quantity: number, saleDate: string): Record<string, unknown> {
    const net = this.#config.item.netPrice * quantity;
    const vat = net * (this.#config.item.vatRate / 100);
    const gross = net + vat;

    return {
      schema: "FA(3)",
      invoiceDate: saleDate,
      saleDate,
      seller: this.#config.seller,
      buyer: contractor,
      currency: this.#config.item.currency,
      items: [
        {
          name: this.#config.item.name,
          unit: this.#config.item.unit,
          quantity,
          netPrice: this.#config.item.netPrice,
          vatRate: this.#config.item.vatRate,
          netValue: Number(net.toFixed(2)),
          vatValue: Number(vat.toFixed(2)),
          grossValue: Number(gross.toFixed(2)),
        },
      ],
      totals: {
        net: Number(net.toFixed(2)),
        vat: Number(vat.toFixed(2)),
        gross: Number(gross.toFixed(2)),
      },
    };
  }
}
