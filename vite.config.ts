import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, '.', '');

  const buildConfig = command === 'build'
    ? {
        rollupOptions: {
          output: {
            manualChunks: {
              // React core stays together
              'react-vendor': ['react', 'react-dom', 'react-router-dom'],
              // Charts separate (only for Statistics page)
              'charts': ['recharts'],
              // Analytics/Monitoring separate
              'analytics': ['posthog-js', '@sentry/react'],
              // Stripe separate (only for Checkout)
              'stripe': ['@stripe/stripe-js', '@stripe/react-stripe-js'],
              // Supabase
              'supabase': ['@supabase/supabase-js'],
              // UI libraries
              'ui': ['lucide-react', 'react-markdown', 'remark-gfm'],
            }
          }
        }
      }
    : undefined;

  return {
    server: {
      port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
      // PostHog Reverse Proxy: umgeht Ad-Blocker in der Entwicklung
      proxy: {
        '/ingest': {
          target: 'https://eu.i.posthog.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ingest/, ''),
        },
      },
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      }
    },
    build: buildConfig
  };
});
