import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  // إعدادات خادم التطوير فقط — لا تؤثر على بناء الإنتاج.
  server: {
    host: true,          // الاستماع على 0.0.0.0 للمعاينة المباشرة
    allowedHosts: true,  // السماح بنطاق المعاينة المُدار
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
