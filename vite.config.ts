import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  // Đưa các biến trong .env (vd GEMINI_API_KEY) vào process.env để phần AI chạy được khi `npm run dev`
  for (const [k, v] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // Chỉ dùng khi chạy `npm run dev` ở máy. Trên Vercel, file api/ai/extract-questions.ts tự chạy thành hàm serverless.
        name: 'api-ai-server',
        configureServer(server) {
          server.middlewares.use('/api/health', (_req, res) => {
            const key = process.env.GEMINI_API_KEY;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ai: Boolean(key && key !== 'MY_GEMINI_API_KEY') }));
          });
          server.middlewares.use('/api/ai/extract-questions', async (req, res) => {
            if (req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: any) => {
                body += chunk;
              });
              req.on('end', async () => {
                try {
                  const mod = await server.ssrLoadModule('/api/ai/extract-questions.ts');
                  const result = await mod.extractQuestions(JSON.parse(body || '{}'));
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(result));
                } catch (err: any) {
                  res.statusCode = err.status || 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err.message || 'AI processing error' }));
                }
              });
            } else {
              res.statusCode = 405;
              res.end('Method Not Allowed');
            }
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './tests/setup.ts',
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
