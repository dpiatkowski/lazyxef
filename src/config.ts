import { config as loadEnv } from "dotenv";

loadEnv();

const required = (value: string | undefined, key: string): string => {
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const appConfig = {
  port: parseNumber(process.env.PORT, 3000),
  host: process.env.APP_HOST ?? "http://localhost:3000",
  timezone: process.env.APP_TIMEZONE ?? "Europe/Warsaw",
  databasePath: process.env.DATABASE_PATH ?? "data/app.sqlite",
  contractorsPath: process.env.CONTRACTORS_PATH ?? "data/contractors.json",
  seller: {
    nip: required(process.env.SELLER_NIP, "SELLER_NIP"),
    name: required(process.env.SELLER_NAME, "SELLER_NAME"),
    address: required(process.env.SELLER_ADDRESS, "SELLER_ADDRESS"),
  },
  item: {
    name: required(process.env.ITEM_NAME, "ITEM_NAME"),
    unit: process.env.ITEM_UNIT ?? "szt",
    netPrice: parseNumber(process.env.ITEM_NET_PRICE, 0),
    vatRate: parseNumber(process.env.ITEM_VAT_RATE, 23),
    currency: process.env.ITEM_CURRENCY ?? "PLN",
  },
  ksef: {
    mode: process.env.KSEF_MODE ?? "simulated",
    baseUrl: process.env.KSEF_BASE_URL ?? "https://ksef-test.mf.gov.pl",
    simulate: (process.env.KSEF_SIMULATE ?? "true") === "true",
    timeoutMs: parseNumber(process.env.KSEF_TIMEOUT_MS, 15000),
    apiToken: process.env.KSEF_API_TOKEN ?? "",
  },
  retry: {
    intervalMs: parseNumber(process.env.RETRY_INTERVAL_MS, 15000),
    maxAttempts: parseNumber(process.env.RETRY_MAX_ATTEMPTS, 5),
  },
};
