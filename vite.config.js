import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const previewFirebaseConfig = {
  apiKey: 'preview-api-key',
  projectId: 'preview-project',
  appId: 'preview-app-id'
};

const defaultCloudFirebaseConfig = {
  apiKey: 'AIzaSyArlXDv5D_u1nSsZfK_hiytCZP5ifRczVs',
  authDomain: 'hd-manager-c5839.firebaseapp.com',
  projectId: 'hd-manager-c5839',
  storageBucket: 'hd-manager-c5839.firebasestorage.app',
  messagingSenderId: '644131886856',
  appId: '1:644131886856:web:f8d9b0713c4ba842d97ebd',
  measurementId: 'G-VL3C6P5RH4'
};
const defaultProductionAppId = 'hd-manager-production';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const usePreviewData = env.VITE_DATA_MODE === 'preview';
  const useCloudData = !usePreviewData;
  const cloudFirebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY || defaultCloudFirebaseConfig.apiKey,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || defaultCloudFirebaseConfig.authDomain,
    projectId: env.VITE_FIREBASE_PROJECT_ID || defaultCloudFirebaseConfig.projectId,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || defaultCloudFirebaseConfig.storageBucket,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultCloudFirebaseConfig.messagingSenderId,
    appId: env.VITE_FIREBASE_APP_ID || defaultCloudFirebaseConfig.appId,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || defaultCloudFirebaseConfig.measurementId
  };
  const firebaseConfig = useCloudData ? cloudFirebaseConfig : previewFirebaseConfig;
  const dataAppId = usePreviewData
    ? (env.VITE_HD_APP_ID || 'preview-app')
    : (env.VITE_HD_APP_ID || defaultProductionAppId);
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
      __app_id: JSON.stringify(dataAppId)
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
