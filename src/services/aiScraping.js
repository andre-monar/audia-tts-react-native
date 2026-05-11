import { extractText, isAvailable } from 'expo-pdf-text-extract';

// Recebe o arquivo PDF e retorna markdown limpo (string)
export async function processTextWithAI(pdfFile) {

}

// Extrai o texto bruto do PDF antes de mandar pra IA
async function extractRawText(pdfFile) {
  if (!isAvailable()) {
    throw new Error(
      'Extração de PDF não disponível. É necessário um dev build do Expo (não funciona em Expo Go).'
    );
  }

  if (!pdfFile?.uri) {
    throw new Error('Arquivo PDF inválido: URI ausente.');
  }

  const text = await extractText(pdfFile.uri);
  return text;
}

// Monta o prompt e chama a API da IA
async function callAI(rawText) {

}