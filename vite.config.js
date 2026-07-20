import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const previewFirebaseConfig = {
  apiKey: 'preview-api-key',
  projectId: 'preview-project',
  appId: 'preview-app-id'
};

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const useCloudData = env.VITE_DATA_MODE === 'cloud';
  const cloudFirebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY || '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: env.VITE_FIREBASE_APP_ID || '',
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || ''
  };
  const firebaseConfig = useCloudData ? cloudFirebaseConfig : previewFirebaseConfig;
  const firebaseAliases = useCloudData
    ? {}
    : {
        'firebase/app': fileURLToPath(new URL('./src/mocks/firebase-app.js', import.meta.url)),
        'firebase/auth': fileURLToPath(new URL('./src/mocks/firebase-auth.js', import.meta.url)),
        'firebase/firestore': fileURLToPath(new URL('./src/mocks/firebase-firestore.js', import.meta.url))
      };

  return {
    plugins: [react()],
    base: './',
    define: {
      __firebase_config: JSON.stringify(JSON.stringify(firebaseConfig)),
      __app_id: JSON.stringify(env.VITE_HD_APP_ID || env.VITE_FIREBASE_PROJECT_ID || 'preview-app')
    },
    resolve: {
      alias: firebaseAliases
    },
    build: {
      chunkSizeWarningLimit: 3200,
      cssCodeSplit: true,
      minify: 'esbuild',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('html-to-image') || id.includes('jspdf')) return 'vendor-export';
            if (id.includes('tesseract') || id.includes('@zxing') || id.includes('read-excel-file')) return 'vendor-tools';
            return 'vendor';
          }
        }
      }
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      watch: {
        ignored: [
          '**/android/**',
          '**/dist/**',
          '**/release/**',
          '**/backups/**',
          '**/node_modules/**',
          '**/.firebase/**',
          '**/tmp-*/**',
          '**/*.apk',
          '**/*.exe'
        ]
      }
    }
  };
});
