import crypto from "node:crypto";
import type { KsefSubmitError, KsefSubmitResult } from "../types.js";

type KsefClientConfig = {
  baseUrl: string;
  timeoutMs: number;
  apiToken: string;
  simulate: boolean;
};

export class KsefClient {
  constructor(private readonly config: KsefClientConfig) {}

  async submitInvoice(payload: unknown): Promise<KsefSubmitResult> {
    if (this.config.simulate) {
      const seed = crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
      return {
        ksefReference: `SIM-REF-${seed}`,
        ksefDocumentId: `SIM-DOC-${seed}`,
        rawResponse: { mode: "simulated" },
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.config.apiToken ? `Bearer ${this.config.apiToken}` : "",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await response.text();
      const body = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw {
          message: `KSeF returned ${response.status}`,
          transient: response.status >= 500 || response.status === 429,
          httpStatus: response.status,
          rawResponse: body,
        } satisfies KsefSubmitError;
      }

      return {
        ksefReference: String(body.ksefReference ?? body.reference ?? ""),
        ksefDocumentId: String(body.ksefDocumentId ?? body.documentId ?? ""),
        rawResponse: body,
      };
    } catch (error) {
      if (typeof error === "object" && error && "transient" in error) {
        throw error;
      }

      const submitError: KsefSubmitError = {
        message: error instanceof Error ? error.message : "Unknown KSeF error",
        transient: true,
      };
      throw submitError;
    } finally {
      clearTimeout(timer);
    }
  }
}
