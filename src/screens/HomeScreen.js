import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { useProcessTextWithAI } from '../services/pdfScraping';

export default function HomeScreen() {
  const navigation = useNavigation();
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const isProcessingRef = useRef(false);
  const { processFile, webViewElement } = useProcessTextWithAI();

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
        Alert.alert('Seleção cancelada', 'Nenhum arquivo foi selecionado.');
        return;
      }

      const file = result.assets[0];

      if (!file || !isPdfFile(file)) {
        setSelectedFile(null);
        Alert.alert('Arquivo inválido', 'Selecione um arquivo PDF.');
        return;
      }

      setSelectedFile(file);
      setIsLoading(true);
      await waitForLoadingFrame();

      let processedMarkdown = '';

      try {
        processedMarkdown = await processFile(file);
      } catch (serviceError) {
        throw createProcessError(isNetworkError(serviceError) ? 'network' : 'service');
      }

      const markdownText = normalizeMarkdownText(processedMarkdown);

      if (!markdownText) {
        Alert.alert(
          'Texto não encontrado',
          'Não foi possível extrair texto deste PDF. Tente outro arquivo.'
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
      <Text style={styles.title}>Audia TTS</Text>

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

      {isLoading && (
        <View style={styles.loadingOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      )}

      {webViewElement}
    </View>
  );
}

function waitForLoadingFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function normalizeMarkdownText(markdown) {
  return markdown.trim();
}

function createProcessError(kind) {
  const error = new Error(kind);
  error.kind = kind;
  return error;
}

function showProcessingError(error) {
  const kind = error?.kind;

  if (kind === 'network' || isNetworkError(error)) {
    Alert.alert('Falha de rede', 'Verifique sua conexão e tente novamente.');
    return;
  }

  if (kind === 'service') {
    Alert.alert('Erro no processamento', 'Não foi possível processar este PDF agora.');
    return;
  }

  Alert.alert('Erro inesperado', 'Algo deu errado. Tente novamente.');
}

function isNetworkError(error) {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('rede') ||
    message.includes('internet') ||
    message.includes('timeout')
  );
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isPdfFile(file) {
  const fileName = file.name.toLowerCase();
  const mimeType = file.mimeType?.toLowerCase();

  return mimeType === 'application/pdf' || fileName.endsWith('.pdf');
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
  },
  title: {
    fontSize: 24,
    color: '#FFF',
    marginBottom: 20,
  },
  button: {
    padding: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 18,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(26, 26, 26, 0.6)',
  },
});