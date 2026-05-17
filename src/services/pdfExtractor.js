import { useCallback, useRef } from 'react';
import { WebView } from 'react-native-webview';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { extractText, isAvailable } from 'expo-pdf-text-extract';

const PDFJS_VERSION = '3.11.174';
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;
const EXTRACT_TIMEOUT_MS = 30000;

export const PDF_EXTRACTOR_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body>
<script src="${PDFJS_CDN}/pdf.min.js"></script>
<script>
(function () {
  function post(payload) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }

  if (typeof pdfjsLib === 'undefined') {
    post({ type: 'bootstrap_error', error: 'PDF.js failed to load from CDN' });
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDFJS_CDN}/pdf.worker.min.js';

  function base64ToBytes(b64) {
    var bin = atob(b64);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  window.__extractPdf = async function (id, base64) {
    try {
      var bytes = base64ToBytes(base64);
      var pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      var out = '';
      for (var i = 1; i <= pdf.numPages; i++) {
        var page = await pdf.getPage(i);
        var content = await page.getTextContent();
        out += content.items.map(function (it) { return it.str; }).join(' ') + '\\n\\n';
      }
      post({ type: 'result', id: id, ok: true, text: out });
    } catch (e) {
      post({ type: 'result', id: id, ok: false, error: String((e && e.message) || e) });
    }
  };

  post({ type: 'ready' });
})();
</script>
</body>
</html>`;

// Hook React: devolve uma função de extração e o elemento da WebView a ser
// montado em algum lugar da árvore. A WebView só é criada quando o módulo
// nativo `expo-pdf-text-extract` não está disponível (i.e., Expo Go).
export function usePdfExtractor() {
  const webViewRef = useRef(null);
  const pendingRef = useRef(new Map());
  const readyRef = useRef(false);
  const readyWaitersRef = useRef([]);

  // Se o nativo está disponível, dispensamos completamente a WebView.
  const useWebViewFallback = !isAvailable();

  const handleMessage = useCallback((event) => {
    let data;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (data.type === 'ready') {
      readyRef.current = true;
      const waiters = readyWaitersRef.current;
      readyWaitersRef.current = [];
      waiters.forEach((fn) => fn());
      return;
    }

    if (data.type === 'bootstrap_error') {
      const err = new Error(data.error || 'Falha ao carregar PDF.js');
      pendingRef.current.forEach(({ reject }) => reject(err));
      pendingRef.current.clear();
      readyWaitersRef.current.forEach((fn) => fn(err));
      readyWaitersRef.current = [];
      return;
    }

    if (data.type === 'result') {
      const pending = pendingRef.current.get(data.id);
      if (!pending) return;
      pendingRef.current.delete(data.id);
      if (data.ok) pending.resolve(typeof data.text === 'string' ? data.text : '');
      else pending.reject(new Error(data.error || 'Falha ao extrair texto do PDF.'));
    }
  }, []);

  const waitForReady = useCallback(() => {
    if (readyRef.current) return Promise.resolve();
    return new Promise((resolve, reject) => {
      readyWaitersRef.current.push((err) => (err ? reject(err) : resolve()));
    });
  }, []);

  const extractRawText = useCallback(
    async (pdfFile) => {
      if (!pdfFile?.uri) {
        throw new Error('Arquivo PDF inválido: URI ausente.');
      }

      if (!useWebViewFallback) {
        const text = await extractText(pdfFile.uri);
        return typeof text === 'string' ? text : '';
      }

      if (!webViewRef.current) {
        throw new Error('WebView de extração de PDF ainda não está montada.');
      }

      await waitForReady();

      const base64 = await readAsStringAsync(pdfFile.uri, { encoding: 'base64' });
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingRef.current.delete(id);
          reject(new Error('Tempo esgotado ao extrair texto do PDF.'));
        }, EXTRACT_TIMEOUT_MS);

        pendingRef.current.set(id, {
          resolve: (text) => {
            clearTimeout(timeout);
            resolve(text);
          },
          reject: (err) => {
            clearTimeout(timeout);
            reject(err);
          },
        });

        const script = `
          if (window.__extractPdf) {
            window.__extractPdf(${JSON.stringify(id)}, ${JSON.stringify(base64)});
          } else {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'result',
              id: ${JSON.stringify(id)},
              ok: false,
              error: 'PDF.js indisponível'
            }));
          }
          true;
        `;
        webViewRef.current.injectJavaScript(script);
      });
    },
    [useWebViewFallback, waitForReady]
  );

  const webViewElement = useWebViewFallback ? (
    <WebView
      ref={webViewRef}
      source={{ html: PDF_EXTRACTOR_HTML }}
      onMessage={handleMessage}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      mixedContentMode="always"
      style={hiddenStyle}
      pointerEvents="none"
    />
  ) : null;

  return { extractRawText, webViewElement };
}

const hiddenStyle = {
  position: 'absolute',
  width: 0,
  height: 0,
  opacity: 0,
};
