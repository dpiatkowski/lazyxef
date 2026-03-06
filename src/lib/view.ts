import { Eta } from "eta";
import path from "node:path";

export const view = new Eta({
  views: path.resolve(process.cwd(), "src/views"),
  cache: false,
  autoEscape: true,
});
