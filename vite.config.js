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
  const builtAt = new Date().toISOString();
  const buildId = `${env.GITHUB_SHA || env.VITE_HD_BUILD_ID || `${env.npm_package_version || 'local'}-${Date.now()}`}`
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-');
  const allowPreviewBuild = env.VITE_ALLOW_PREVIEW_BUILD === 'true';
  const usePreviewData = env.VITE_DATA_MODE === 'preview' && (mode !== 'production' || allowPreviewBuild);
  const vpsDataMode = `${env.VITE_DATA_MODE || ''}`.trim();
  const useVpsData = vpsDataMode === 'vps-staging' || vpsDataMode === 'vps-production';
  const useCloudData = !usePreviewData && !useVpsData;
  if (useVpsData && !`${env.VITE_API_BASE_URL || ''}`.trim()) {
    throw new Error(`VITE_API_BASE_URL is required when VITE_DATA_MODE=${vpsDataMode}.`);
  }
  const cloudFirebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY || defaultCloudFirebaseConfig.apiKey,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || defaultCloudFirebaseConfig.authDomain,
    projectId: env.VITE_FIREBASE_PROJECT_ID || defaultCloudFirebaseConfig.projectId,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || defaultCloudFirebaseConfig.storageBucket,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultCloudFirebaseConfig.messagingSenderId,
    appId: env.VITE_FIREBASE_APP_ID || defaultCloudFirebaseConfig.appId,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || defaultCloudFirebaseConfig.measurementId
  };
  const firebaseConfig = useCloudData
    ? cloudFirebaseConfig
    : (usePreviewData ? previewFirebaseConfig : {});
  const dataAppId = usePreviewData
    ? (env.VITE_HD_APP_ID || 'preview-app')
    : (useVpsData ? `hd-manager-${vpsDataMode}` : (env.VITE_HD_APP_ID || defaultProductionAppId));
  const firebaseAliases = useCloudData
    ? {}
    : {
        'firebase/app': fileURLToPath(new URL('./src/mocks/firebase-app.js', import.meta.url)),
        'firebase/auth': fileURLToPath(new URL('./src/mocks/firebase-auth.js', import.meta.url)),
        'firebase/firestore': fileURLToPath(new URL('./src/mocks/firebase-firestore.js', import.meta.url)),
        'firebase/performance': fileURLToPath(new URL('./src/mocks/firebase-performance.js', import.meta.url)),
        './services/identityCenter.js': fileURLToPath(new URL('./src/mocks/identity-center-vps.js', import.meta.url))
      };
  const runtimeAliases = {
    ...firebaseAliases,
    '@hd/firebase-runtime': fileURLToPath(new URL(
      useVpsData ? './src/mocks/firebase-runtime-vps.js' : './src/config/firebase-runtime.js',
      import.meta.url,
    )),
    '@hd/client-runtime': fileURLToPath(new URL(
      useVpsData ? './src/mocks/client-runtime-vps.js' : './src/config/client-runtime.js',
      import.meta.url,
    )),
    '@hd/firebase-rest-runtime': fileURLToPath(new URL(
      useVpsData ? './src/mocks/firebase-rest-runtime-vps.js' : './src/config/firebase-rest-runtime.js',
      import.meta.url,
    )),
  };
  const releaseManifestPlugin = {
    name: 'hd-manager-release-manifest',
    transformIndexHtml(html) {
      return html.replaceAll('__HD_MANAGER_BUILD_ID__', buildId);
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ buildId, builtAt })}\n`
      });
    }
  };

  return {
    plugins: [react(), releaseManifestPlugin],
    base: './',
    // VPS bundles must not expose legacy Firebase/provider credentials through
    // Vite's import.meta.env serialization. Cloud builds retain the legacy env
    // surface until their migration is completed.
    envPrefix: useVpsData
      ? ['VITE_API_BASE_URL', 'VITE_DATA_MODE', 'VITE_HD_BUILD_ID']
      : 'VITE_',
    define: {
      __firebase_config: JSON.stringify(JSON.stringify(firebaseConfig)),
      __app_id: JSON.stringify(dataAppId),
      'import.meta.env.VITE_HD_BUILD_ID': JSON.stringify(buildId)
    },
    resolve: {
      alias: runtimeAliases
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
            if (/[\\/]node_modules[\\/]qrcode[\\/]/.test(id)) return 'vendor-qrcode';
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
