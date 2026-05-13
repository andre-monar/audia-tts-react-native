import { useCallback } from 'react';
import { usePdfExtractor } from './pdfExtractor';

// Hook que devolve uma função `processFile(pdfFile) => Promise<string>` e o
// elemento JSX da WebView que precisa estar montado na árvore para o caminho
// Expo Go (PDF.js). Quando o módulo nativo está disponível, `webViewElement`
// é `null` e a extração acontece direto via expo-pdf-text-extract.
export function useProcessTextWithAI() {
  const { extractRawText, webViewElement } = usePdfExtractor();

  const processFile = useCallback(
    async (pdfFile) => {
      const rawText = await extractRawText(pdfFile);
      return rawTextToMarkdown(rawText);
    },
    [extractRawText]
  );

  return { processFile, webViewElement };
}

// Converte texto bruto do PDF em markdown com títulos.
// Heurística local — sem chamadas externas.
function rawTextToMarkdown(raw) {
  const cleaned = raw
    .replace(/\f/g, '\n\n')
    .replace(/\r\n?/g, '\n');

  const rawLines = cleaned.split('\n').map((line) => line.trim());

  // Remove ruído: linhas vazias em excesso e linhas só com número de página.
  const trimmed = [];
  let blankRun = 0;
  for (const line of rawLines) {
    if (line === '') {
      blankRun += 1;
      continue;
    }
    if (/^\d+$/.test(line)) {
      // Provável número de página solto — descarta.
      continue;
    }
    if (blankRun > 0 && trimmed.length > 0) {
      trimmed.push('');
    }
    blankRun = 0;
    trimmed.push(line);
  }

  // Junta linhas quebradas no meio de uma frase pelo extrator do PDF.
  const merged = mergeBrokenSentences(trimmed);

  // Classifica cada linha e emite markdown.
  const out = [];
  for (let i = 0; i < merged.length; i++) {
    const line = merged[i];

    if (line === '') {
      if (out.length > 0 && out[out.length - 1] !== '') {
        out.push('');
      }
      continue;
    }

    const prevBlank = i === 0 || merged[i - 1] === '';
    const nextBlank = i === merged.length - 1 || merged[i + 1] === '';
    const isFirstContentLine = out.every((entry) => entry === '');

    const kind = classifyLine(line, { isFirstContentLine, prevBlank, nextBlank });

    if (kind === 'h1') {
      out.push(`# ${line}`);
    } else if (kind === 'h2') {
      out.push(`## ${line}`);
    } else if (kind === 'h3') {
      out.push(`### ${line}`);
    } else {
      out.push(line);
    }
  }

  // Remove blank lines no início/fim.
  while (out.length > 0 && out[0] === '') out.shift();
  while (out.length > 0 && out[out.length - 1] === '') out.pop();

  return out.join('\n');
}

function mergeBrokenSentences(lines) {
  const result = [];
  for (const line of lines) {
    const prev = result.length > 0 ? result[result.length - 1] : null;
    if (
      prev !== null &&
      prev !== '' &&
      line !== '' &&
      shouldMergeWithPrev(prev, line)
    ) {
      result[result.length - 1] = `${prev} ${line}`;
    } else {
      result.push(line);
    }
  }
  return result;
}

function shouldMergeWithPrev(prev, current) {
  const prevEndsSentence = /[.!?:;]$/.test(prev);
  if (prevEndsSentence) return false;

  // Se a linha anterior parece um título curto, não mescla.
  if (looksLikeHeading(prev)) return false;

  const startsLower = /^[a-záàâãéèêíïóôõöúçñ]/.test(current);
  // Continuação de hifenização: "exem-\nplo" → "exemplo".
  if (/-$/.test(prev) && /^[a-záàâãéèêíïóôõöúçñ]/.test(current)) {
    return true;
  }

  return startsLower;
}

function classifyLine(line, ctx) {
  const len = line.length;
  const endsSentence = /[.!?]$/.test(line);

  if (endsSentence) {
    return 'paragraph';
  }

  // h2: rótulos de capítulo/parte (mais específico que h1, então testa primeiro).
  if (/^(chapter|cap[ií]tulo|parte|part)\s+\S/i.test(line) && len <= 80) {
    return 'h2';
  }

  // h3: títulos numerados tipo "1.2 Algo".
  if (/^\d+(\.\d+)*\s+\S/.test(line) && len <= 80) {
    return 'h3';
  }

  // h1: primeira linha de conteúdo do documento, curta, sem pontuação final.
  if (ctx.isFirstContentLine && len <= 80) {
    return 'h1';
  }

  // h2: linha curta totalmente em maiúsculas, isolada por linhas em branco.
  if (
    ctx.prevBlank &&
    ctx.nextBlank &&
    len <= 60 &&
    looksAllCaps(line)
  ) {
    return 'h2';
  }

  return 'paragraph';
}

function looksLikeHeading(line) {
  if (line.length > 80) return false;
  if (/[.!?]$/.test(line)) return false;
  return (
    /^(chapter|cap[ií]tulo|parte|part)\s+\S/i.test(line) ||
    /^\d+(\.\d+)*\s+\S/.test(line) ||
    looksAllCaps(line)
  );
}

function looksAllCaps(line) {
  const letters = line.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length < 2) return false;
  return letters === letters.toUpperCase();
}
