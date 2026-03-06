import { serve } from "@hono/node-server";
import { appConfig } from "./config.ts";
import { createApp } from "./app.ts";
import { initSchema, openDatabase } from "./repositories/sqlite/db.ts";
import { InvoiceRepository } from "./repositories/sqlite/invoice-repository.ts";
import { ContractorsStore } from "./services/contractors-store.ts";
import { InvoiceService } from "./services/invoice-service.ts";
import { KsefClient } from "./services/ksef-client.ts";
import { RetryWorker } from "./services/retry-worker.ts";

const db = openDatabase(appConfig.databasePath);
initSchema(db);

const contractorsStore = new ContractorsStore(appConfig.contractorsPath);
contractorsStore.load();

const repository = new InvoiceRepository(db);
const ksefClient = new KsefClient(appConfig.ksef);
const invoiceService = new InvoiceService(repository, contractorsStore, ksefClient, {
  retryMaxAttempts: appConfig.retry.maxAttempts,
  seller: appConfig.seller,
  item: appConfig.item,
});

const worker = new RetryWorker(repository, invoiceService, appConfig.retry.intervalMs);
worker.start();

const app = createApp({ contractorsStore, invoiceService, repository });

serve(
  {
    fetch: app.fetch,
    port: appConfig.port,
  },
  (info) => {
    console.log(`KSeF Lite listening on http://localhost:${info.port}`);
  },
);
