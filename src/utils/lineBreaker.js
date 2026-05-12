import { Dimensions } from 'react-native';
import { FONT_SIZES } from '../theme/fontSizes'
// é assim q funciona: 
// pega largura da tela, que pode modificar o número de palavras por linha
const SCREEN_WIDTH = Dimensions.get('window').width;
const PADDING = 32; // padding horizontal
const AVAILABLE_WIDTH = SCREEN_WIDTH - PADDING;
const CHAR_WIDTH_RATIO = 0.55;

// in: string markdown
// out: { line: { words, fontSize, lineType } | null, remainingMarkdown: string }
export async function breakNextLine(markdown) {
  if (!markdown || markdown.trim().length === 0) {
    return { line: null, remainingMarkdown: '' };
  }

  const { paragraph, remainingMarkdown: afterParagraph, emptyLineAfter } = selectFirstParagraph(markdown);

  if (paragraph === '') {
    return { line: { words: [], fontSize: FONT_SIZES.paragraph, lineType: 'empty' }, remainingMarkdown: afterParagraph };
  }

  const { lineType, fontSize, rawText } = parseParagraphType(paragraph);
  const words = parseWords(rawText);
  const wrappedLines = await wrapWords(words, fontSize);

  const firstLine = wrappedLines[0];

  // reconstrói remainingMarkdown com sobras do parágrafo
  const leftoverLines = wrappedLines.slice(1);
  let newRemaining = '';

  if (leftoverLines.length > 0) {
    const prefix = lineType === 'h1' ? '# ' : lineType === 'h2' ? '## ' : lineType === 'h3' ? '### ' : '';
    const leftoverText = prefix + leftoverLines.map(l => l.map(w => w.text).join(' ')).join('\n');
    newRemaining = leftoverText + (afterParagraph ? '\n' + (emptyLineAfter ? '\n' : '') + afterParagraph : '');
  } else {
    // se tinha \n\n, injeta linha vazia no início do remaining
    newRemaining = emptyLineAfter ? '\n' + afterParagraph : afterParagraph;
  }

  return {
    line: { words: firstLine, fontSize, lineType },
    remainingMarkdown: newRemaining,
  };
}

// in: string markdown
// out: { paragraph, remainingMarkdown, emptyLineAfter }
function selectFirstParagraph(markdown) {
  const index = markdown.indexOf('\n');

  if (index === -1) {
    return { paragraph: markdown.trim(), remainingMarkdown: '', emptyLineAfter: false };
  }

  const isDoubleBreak = markdown[index + 1] === '\n';

  return {
    paragraph: markdown.slice(0, index).trim(),
    remainingMarkdown: markdown.slice(isDoubleBreak ? index + 2 : index + 1).trim(),
    emptyLineAfter: isDoubleBreak,
  };
}

// determinar tipo de parágrafo: título, subtítulo, texto, etc
function parseParagraphType(paragraph) {
    if (paragraph.startsWith('### ')) {
        return { lineType: 'h3', fontSize: FONT_SIZES.h3, rawText: paragraph.slice(4) };
    }
    if (paragraph.startsWith('## ')) {
        return { lineType: 'h2', fontSize: FONT_SIZES.h2, rawText: paragraph.slice(3) };
    }
    if (paragraph.startsWith('# ')) {
        return { lineType: 'h1', fontSize: FONT_SIZES.h1, rawText: paragraph.slice(2) };
    }
    return { lineType: 'paragraph', fontSize: FONT_SIZES.paragraph, rawText: paragraph };
}

// limpar marcadores
function parseWords(text) {
  // remove marcadores markdown e retorna array de { text }
  const clean = text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1');

  return clean.split(' ').filter(Boolean).map(w => ({ text: w }));
}
// agrupar palavras por linha
async function wrapWords(words, fontSize) {
    const lines = []; // array de linhas, cada linha é um array de palavras
    let currentLine = []; // linha atual
    let currentWidth = 0; // largura da linha atual (ele mede palavra a palavra para lidar com fontes proporcionais)
    const charWidth = fontSize * CHAR_WIDTH_RATIO;
    // palavra a palavra:
    for (const word of words) {     
        // array de linhas, cada linha é um array de palavras
        const wordWidth = word.text.length * charWidth;
        const spaceWidth = currentLine.length > 0 ? charWidth : 0;

        // se a largura da linha atual + espaço + largura da palavra for menor que a largura disponível, adiciona a palavra à linha
        if (currentWidth + spaceWidth + wordWidth <= AVAILABLE_WIDTH) {
            // ADICIONA PALAVRA À LINHA ATUAL:
            currentLine.push(word); // adiciona a palavra à linha atual
            currentWidth += spaceWidth + wordWidth; // atualiza a largura da linha
        } else {
            // PULA A LINHA
            lines.push(currentLine); // add a linha atual ao array de linhas
            currentLine = [word]; // inicia uma nova linha com a palavra atual
            currentWidth = wordWidth; // reseta a largura da linha para a largura da palavra atual
        }

    }
    if (currentLine.length > 0) { // se sobrou uma linha não adicionada, adiciona ao array de linhas
        lines.push(currentLine);
    }
    return lines; // retorna o array de linhas
}