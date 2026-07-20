import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

const STORAGE_KEY = 'hd_manager_ios_web_url';
const WEB_PORT = '5173';

function normalizeWebUrl(value) {
  const trimmed = `${value || ''}`.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

const CONFIGURED_WEB_URL = normalizeWebUrl(
  process.env.EXPO_PUBLIC_HD_MANAGER_URL || Constants.expoConfig?.extra?.hdManagerWebUrl || '',
);
const DEFAULT_WEB_URL = CONFIGURED_WEB_URL || 'http://127.0.0.1:5173';

function extractHost(value) {
  const rawValue = `${value || ''}`.trim();
  if (!rawValue) return '';
  const withoutProtocol = rawValue.replace(/^[a-z]+:\/\//i, '');
  const hostWithPort = withoutProtocol.split('/')[0] || '';
  return hostWithPort.split(':')[0] || '';
}

function getSuggestedLanWebUrl() {
  const hostCandidates = [
    Constants.expoConfig?.hostUri,
    Constants.manifest2?.extra?.expoClient?.hostUri,
    Constants.manifest?.debuggerHost,
    Constants.manifest?.hostUri,
  ];
  const lanHost = hostCandidates
    .map(extractHost)
    .find((host) => host && !/^(127\.0\.0\.1|localhost)$/i.test(host));
  return lanHost ? `http://${lanHost}:${WEB_PORT}` : DEFAULT_WEB_URL;
}

function isLocalhostUrl(url) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(`${url || ''}`);
}

function isPrivateNetworkUrl(url) {
  const host = extractHost(url);
  return /^(127\.0\.0\.1|localhost|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(host);
}

function getSuggestedWebUrl() {
  return CONFIGURED_WEB_URL || getSuggestedLanWebUrl();
}

function shouldUseSuggestedUrl(savedUrl) {
  const normalizedSavedUrl = normalizeWebUrl(savedUrl);
  if (!normalizedSavedUrl) return true;
  if (isLocalhostUrl(normalizedSavedUrl)) return true;
  if (CONFIGURED_WEB_URL && isPrivateNetworkUrl(normalizedSavedUrl)) return true;
  return false;
}

export default function App() {
  const webViewRef = useRef(null);
  const [webUrl, setWebUrl] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let isMounted = true;
    const loadSavedUrl = async () => {
      try {
        const savedUrl = await AsyncStorage.getItem(STORAGE_KEY);
        const suggestedUrl = getSuggestedWebUrl();
        const useSuggestedUrl = shouldUseSuggestedUrl(savedUrl);
        const nextUrl = normalizeWebUrl(useSuggestedUrl ? suggestedUrl : savedUrl);
        if (useSuggestedUrl && !isLocalhostUrl(nextUrl)) {
          await AsyncStorage.setItem(STORAGE_KEY, nextUrl);
        }
        if (!isMounted) return;
        setWebUrl(nextUrl);
        setDraftUrl(nextUrl);
        setShowSettings(!savedUrl && isLocalhostUrl(nextUrl) && !CONFIGURED_WEB_URL);
      } finally {
        if (isMounted) setIsReady(true);
      }
    };
    loadSavedUrl();
    return () => {
      isMounted = false;
    };
  }, []);

  const helperText = useMemo(() => {
    if (CONFIGURED_WEB_URL) {
      return 'Dang dung dia chi online. iPhone khong can cung WiFi voi may Windows.';
    }
    if (isLocalhostUrl(webUrl)) {
      return 'Tren iPhone, 127.0.0.1 khong tro ve may tinh. Hay nhap IP LAN cua may Windows, vi du: http://192.168.1.25:5173';
    }
    if (isPrivateNetworkUrl(webUrl)) {
      return 'Dia chi nay la LAN. Neu khac WiFi, hay chay Expo bang tunnel hoac dung URL online da deploy.';
    }
    return 'Dia chi nay co the dung qua internet neu server dang online va mo cong truy cap.';
  }, [webUrl]);

  const handleSaveUrl = async () => {
    const nextUrl = normalizeWebUrl(draftUrl);
    if (!nextUrl) return;
    await AsyncStorage.setItem(STORAGE_KEY, nextUrl);
    setLoadError('');
    setWebUrl(nextUrl);
    setShowSettings(false);
  };

  if (!isReady) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <StatusBar style="dark" />
        <ActivityIndicator color="#10b981" size="large" />
        <Text style={styles.loadingText}>Dang mo HD Manager...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <WebView
        ref={webViewRef}
        source={{ uri: webUrl }}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        allowsBackForwardNavigationGestures
        mediaPlaybackRequiresUserAction={false}
        startInLoadingState
        onLoadStart={() => setLoadError('')}
        onError={(event) => setLoadError(event.nativeEvent.description || 'Khong mo duoc app web.')}
        onHttpError={(event) => {
          const statusCode = event.nativeEvent.statusCode;
          if (statusCode >= 400) setLoadError(`Server tra ve loi ${statusCode}.`);
        }}
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#10b981" size="large" />
            <Text style={styles.loadingText}>Dang nap du lieu...</Text>
          </View>
        )}
      />

      <TouchableOpacity style={styles.settingsButton} onPress={() => setShowSettings(true)} activeOpacity={0.85}>
        <Text style={styles.settingsButtonText}>URL</Text>
      </TouchableOpacity>

      {!!loadError && (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Chua ket noi duoc app</Text>
          <Text style={styles.errorText}>{loadError}</Text>
          <Text style={styles.errorHint}>{helperText}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setShowSettings(true)}>
            <Text style={styles.primaryButtonText}>Sua dia chi server</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={showSettings} animationType="slide" transparent onRequestClose={() => setShowSettings(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <View style={styles.settingsCard}>
            <Text style={styles.modalEyebrow}>HD Manager</Text>
            <Text style={styles.modalTitle}>Dia chi app web</Text>
            <Text style={styles.modalText}>
              De nhan vien dung that, hay nhap URL online da deploy. Neu chi test tam thoi bang may Windows, co the dung LAN hoac Expo tunnel.
            </Text>
            {!!CONFIGURED_WEB_URL && (
              <TouchableOpacity
                style={styles.onlineButton}
                onPress={() => setDraftUrl(CONFIGURED_WEB_URL)}
                activeOpacity={0.85}
              >
                <Text style={styles.onlineButtonText}>Dung URL online mac dinh</Text>
                <Text style={styles.onlineButtonUrl}>{CONFIGURED_WEB_URL}</Text>
              </TouchableOpacity>
            )}
            <TextInput
              value={draftUrl}
              onChangeText={setDraftUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="http://192.168.1.25:5173"
              style={styles.input}
            />
            <Text style={styles.modalHint}>{helperText}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowSettings(false)}>
                <Text style={styles.secondaryButtonText}>Dong</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveUrl}>
                <Text style={styles.saveButtonText}>Mo app</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#059669',
  },
  webview: {
    flex: 1,
    backgroundColor: '#f4f6f8',
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f6f8',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f6f8',
  },
  loadingText: {
    marginTop: 12,
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
  settingsButton: {
    position: 'absolute',
    top: 54,
    right: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.68)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  settingsButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  errorCard: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: '30%',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#fee2e2',
    backgroundColor: '#fff',
    padding: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  errorTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
  },
  errorText: {
    marginTop: 8,
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '800',
  },
  errorHint: {
    marginTop: 8,
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    marginTop: 14,
    borderRadius: 18,
    backgroundColor: '#10b981',
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
  },
  settingsCard: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 30,
  },
  modalEyebrow: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  modalTitle: {
    marginTop: 6,
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '900',
  },
  modalText: {
    marginTop: 8,
    color: '#64748b',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  onlineButton: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#99f6e4',
    backgroundColor: '#ecfeff',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  onlineButtonText: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '900',
  },
  onlineButtonUrl: {
    marginTop: 4,
    color: '#155e75',
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  modalHint: {
    marginTop: 8,
    color: '#f97316',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  modalActions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '900',
  },
  saveButton: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: '#10b981',
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
});
