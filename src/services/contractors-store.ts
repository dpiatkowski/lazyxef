import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Contractor } from "../types.ts";

const contractorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nip: z.string().regex(/^\d{10}$/, "NIP musi miec 10 cyfr"),
  address: z.string().min(1),
});

const contractorsSchema = z.array(contractorSchema).min(1);

export class ContractorsStore {
  #contractors: Contractor[] = [];
  #filePath: string;

  constructor(filePath: string) {
    this.#filePath = filePath;
  }

  load(): Contractor[] {
    const absolute = path.resolve(process.cwd(), this.#filePath);
    const raw = fs.readFileSync(absolute, "utf-8");
    const parsed = JSON.parse(raw);
    const contractors = contractorsSchema.parse(parsed);

    const ids = new Set<string>();
    for (const contractor of contractors) {
      if (ids.has(contractor.id)) {
        throw new Error(`Duplicate contractor id: ${contractor.id}`);
      }
      ids.add(contractor.id);
    }

    this.#contractors = contractors;
    return this.#contractors;
  }

  list(): Contractor[] {
    return this.#contractors;
  }

  getById(id: string): Contractor | undefined {
    return this.#contractors.find((item) => item.id === id);
  }
}
