import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "../src/app.ts";
import { initSchema, openDatabase } from "../src/repositories/sqlite/db.ts";
import { InvoiceRepository } from "../src/repositories/sqlite/invoice-repository.ts";
import { ContractorsStore } from "../src/services/contractors-store.ts";
import { InvoiceService } from "../src/services/invoice-service.ts";
import { KsefClient } from "../src/services/ksef-client.ts";

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ksef-lite-"));
  const contractorsFile = path.join(dir, "contractors.json");
  const dbFile = path.join(dir, "app.sqlite");

  fs.writeFileSync(
    contractorsFile,
    JSON.stringify([{ id: "c1", name: "A", nip: "1234567890", address: "addr" }]),
  );

  const db = openDatabase(dbFile);
  initSchema(db);

  const contractorsStore = new ContractorsStore(contractorsFile);
  contractorsStore.load();

  const repository = new InvoiceRepository(db);
  const service = new InvoiceService(repository, contractorsStore, new KsefClient({
    baseUrl: "https://example.invalid",
    timeoutMs: 1000,
    apiToken: "",
    simulate: true,
  }), {
    retryMaxAttempts: 3,
    seller: { nip: "1111111111", name: "Seller", address: "X" },
    item: { name: "Usluga", unit: "szt", netPrice: 100, vatRate: 23, currency: "PLN" },
  });

  return createApp({ contractorsStore, invoiceService: service, repository });
};

describe("app", () => {
  it("renders home page", async () => {
    const app = setup();
    const response = await app.request("/");
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Wystaw fakture KSeF/);
  });

  it("validates invalid invoice", async () => {
    const app = setup();
    const form = new URLSearchParams({ contractorId: "", quantity: "0", saleDate: "bad" });
    const response = await app.request("/invoices", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    assert.equal(response.status, 400);
  });

  it("creates invoice in simulated mode", async () => {
    const app = setup();
    const form = new URLSearchParams({ contractorId: "c1", quantity: "2", saleDate: "2026-02-27" });
    const response = await app.request("/invoices", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    assert.equal(response.status, 302);
    const location = response.headers.get("location");
    assert.match(location ?? "", /^\/invoices\/[0-9]+$/);
  });
});
