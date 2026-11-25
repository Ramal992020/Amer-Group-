import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // إعدادات خادم التطوير فقط — لا تؤثر على بناء الإنتاج.
  server: {
    host: true,          // الاستماع على 0.0.0.0 للمعاينة المباشرة
    allowedHosts: true,  // السماح بنطاق المعاينة المُدار
  },
  // نفس الفكرة لخادم معاينة الـ dist بعد البناء.
  preview: {
    host: true,
    allowedHosts: true,
  },
  build: {
    assetsInlineLimit: 100000000, // تضمين كل الأصول (صور/CSS) داخل ملفات HTML
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        landing: path.resolve(__dirname, "landing.html"),
        notFound: path.resolve(__dirname, "404.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
