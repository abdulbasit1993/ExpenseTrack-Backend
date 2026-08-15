import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import swaggerSpec from "./swagger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(__dirname, "./swagger.json");

console.log("outputPath: ", outputPath);

fs.writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2));
console.log("Swagger spec generated successfully at src/config/swagger.json");
