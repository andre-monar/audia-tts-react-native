import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { processTextWithAI } from '../services/aiScraping';
import type { RootStackParamList } from '../navigation/AppNavigator';

type ProcessError = Error & {
  kind?: 'network' | 'service';
};

const processPdfWithAI = processTextWithAI as unknown as (
  pdfFile: DocumentPickerAsset
) => Promise<unknown>;

export default function HomeScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList, 'Home'>>();
  const [selectedFile, setSelectedFile] = useState<DocumentPickerAsset | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isProcessingRef = useRef(false);

  async function handlePickPdf() {
    if (isLoading || isProcessingRef.current) {
      return;
    }

    isProcessingRef.current = true;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        Alert.alert('Selecao cancelada', 'Nenhum arquivo foi selecionado.');
        return;
      }

      const file = result.assets[0];

      if (!file || !isPdfFile(file)) {
        setSelectedFile(null);
        Alert.alert('Arquivo invalido', 'Selecione um arquivo PDF.');
        return;
      }

      setSelectedFile(file);
      setIsLoading(true);
      await waitForLoadingFrame();

      let processedMarkdown: unknown = '';

      try {
        processedMarkdown = await processPdfWithAI(file);
      } catch (serviceError) {
        throw createProcessError(isNetworkError(serviceError) ? 'network' : 'service');
      }

      const markdownText = normalizeMarkdownText(processedMarkdown);

      if (!markdownText) {
        Alert.alert(
          'Texto nao encontrado',
          'Nao foi possivel extrair texto deste PDF. Tente outro arquivo.'
        );
        return;
      }

      navigation.navigate('TTS', { markdownText });
    } catch (error) {
      setSelectedFile(null);
      showProcessingError(error);
    } finally {
      isProcessingRef.current = false;
      setIsLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TTS</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handlePickPdf}
          activeOpacity={0.8}
          disabled={isLoading}
          accessibilityLabel={
            selectedFile ? `Arquivo selecionado: ${selectedFile.name}` : 'Carregar arquivo'
          }
        >
          <Text style={styles.buttonText}>Carregar arquivo</Text>
        </TouchableOpacity>
      </View>

      {isLoading && (
        <View style={styles.loadingOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color="#E5E5E5" />
        </View>
      )}
    </View>
  );
}

function waitForLoadingFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function normalizeMarkdownText(markdown: unknown) {
  if (typeof markdown !== 'string') {
    return '';
  }

  return markdown.trim();
}

function createProcessError(kind: ProcessError['kind']) {
  const error = new Error(kind);
  (error as ProcessError).kind = kind;
  return error;
}

function showProcessingError(error: unknown) {
  const kind = (error as ProcessError)?.kind;

  if (kind === 'network' || isNetworkError(error)) {
    Alert.alert('Falha de rede', 'Verifique sua conexao e tente novamente.');
    return;
  }

  if (kind === 'service') {
    Alert.alert('Erro no processamento', 'Nao foi possivel processar este PDF agora.');
    return;
  }

  Alert.alert('Erro inesperado', 'Algo deu errado. Tente novamente.');
}

function isNetworkError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('rede') ||
    message.includes('internet') ||
    message.includes('timeout')
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isPdfFile(file: DocumentPickerAsset) {
  const fileName = file.name.toLowerCase();
  const mimeType = file.mimeType?.toLowerCase();

  return mimeType === 'application/pdf' || fileName.endsWith('.pdf');
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
  },
  title: {
    position: 'absolute',
    top: '28%',
    left: 0,
    right: 0,
    color: '#CCCCCC',
    fontSize: 48,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  button: {
    backgroundColor: '#E5E5E5',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(26, 26, 26, 0.35)',
  },
});
