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

const server = serve(
  {
    fetch: app.fetch,
    port: appConfig.port,
  },
  (info) => {
    console.log(`KSeF Lite listening on http://localhost:${info.port}`);
  },
);

let shuttingDown = false;

const stopWorker = () => {
  worker.stop();
};

const shutdown = (signal: NodeJS.Signals) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  stopWorker();

  server.close((error) => {
    if (error) {
      console.error(`Error while shutting down after ${signal}:`, error);
      process.exitCode = 1;
    }
  });
};

server.once("close", stopWorker);

process.once("SIGINT", () => {
  shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  shutdown("SIGTERM");
});
