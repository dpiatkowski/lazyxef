import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ContractorsStore } from "../src/services/contractors-store.ts";

describe("ContractorsStore", () => {
  it("loads valid contractors", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "contractors-"));
    const file = path.join(dir, "contractors.json");
    fs.writeFileSync(
      file,
      JSON.stringify([
        { id: "c1", name: "A", nip: "1234567890", address: "x" },
        { id: "c2", name: "B", nip: "0987654321", address: "y" },
      ]),
    );

    const store = new ContractorsStore(file);
    const contractors = store.load();
    assert.equal(contractors.length, 2);
  });

  it("throws for duplicate ids", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "contractors-"));
    const file = path.join(dir, "contractors.json");
    fs.writeFileSync(
      file,
      JSON.stringify([
        { id: "c1", name: "A", nip: "1234567890", address: "x" },
        { id: "c1", name: "B", nip: "0987654321", address: "y" },
      ]),
    );

    const store = new ContractorsStore(file);
    assert.throws(() => store.load(), /Duplicate contractor id/);
  });
});
