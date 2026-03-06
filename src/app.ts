import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { view } from "./lib/view.js";
import type { InvoiceRepository } from "./repositories/sqlite/invoice-repository.js";
import type { ContractorsStore } from "./services/contractors-store.js";
import type { InvoiceService } from "./services/invoice-service.js";

type CreateAppDeps = {
  contractorsStore: ContractorsStore;
  invoiceService: InvoiceService;
  repository: InvoiceRepository;
};

export const createApp = ({ contractorsStore, invoiceService, repository }: CreateAppDeps) => {
  const app = new Hono();

  app.get("/", async (c) => {
    const html = await view.renderAsync("index", {
      contractors: contractorsStore.list(),
      error: null,
      form: {
        saleDate: new Date().toISOString().slice(0, 10),
        quantity: "1",
        contractorId: "",
      },
    });

    return c.html(html ?? "Template rendering error");
  });

  app.post("/invoices", async (c) => {
    const formData = await c.req.formData();

    const input = {
      contractorId: String(formData.get("contractorId") ?? ""),
      quantity: Number(formData.get("quantity") ?? 0),
      saleDate: String(formData.get("saleDate") ?? ""),
    };

    try {
      const invoiceId = await invoiceService.createAndSend(input);
      return c.redirect(`/invoices/${invoiceId}`);
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? error.issues.map((issue) => issue.message).join("; ")
          : error instanceof Error
            ? error.message
            : "Nie udalo sie wyslac faktury";

      const html = await view.renderAsync("index", {
        contractors: contractorsStore.list(),
        error: message,
        form: {
          saleDate: input.saleDate,
          quantity: String(input.quantity || ""),
          contractorId: input.contractorId,
        },
      });

      return c.html(html ?? "Template rendering error", 400);
    }
  });

  app.get("/invoices", async (c) => {
    const attempts = repository.listAttempts(200);
    const html = await view.renderAsync("invoices", { attempts, contractors: contractorsStore.list() });
    return c.html(html ?? "Template rendering error");
  });

  app.get("/invoices/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new HTTPException(400, { message: "Invalid invoice id" });
    }

    const attempt = repository.getAttemptById(id);
    if (!attempt) {
      throw new HTTPException(404, { message: "Invoice not found" });
    }

    const events = repository.listEvents(id);
    const contractor = contractorsStore.getById(attempt.contractor_id);

    const html = await view.renderAsync("invoice-detail", {
      attempt,
      events,
      contractor,
      payload: JSON.parse(attempt.payload_json),
    });
    return c.html(html ?? "Template rendering error");
  });

  app.post("/invoices/:id/retry", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new HTTPException(400, { message: "Invalid invoice id" });
    }

    await invoiceService.retrySend(id);
    return c.redirect(`/invoices/${id}`);
  });

  app.post("/admin/reload-contractors", (c) => {
    contractorsStore.load();
    return c.redirect("/");
  });

  app.get("/health", (c) => c.json({ ok: true }));

  return app;
};
