import { Dimensions } from 'react-native';
import TextSize from 'react-native-text-size';

// pega largura da tela, que pode modificar o número de palavras por linha
const SCREEN_WIDTH = Dimensions.get('window').width;
const PADDING = 32; // padding horizontal
const AVAILABLE_WIDTH = SCREEN_WIDTH - PADDING;

// in: string markdown
// out: array de linhas
// cada linha: {words: [{ text, bold, italic, underline}], fontSize}
export async function breakLinesFromFirstParagraph(markdown) {
    // vamos esvaziar o markdown parágrafo por parágrafo. a ideia é já enviar pro front o parágrafo processado,
    // assim o usuário não precisa esperar processar todo o texto para acessar o conteúdo.
    // esse processamento podia ser feito no aiScraping também, mas por ora vamos deixar só por aqui.
    const { paragraph, remainingMarkdown } = selectFirstParagraph(markdown);

    // para o paragrafo, chamar WrapWords
    const { lineType, fontSize, rawText } = parseParagraphType(paragraph);
    const words = parseWords(rawText);
    const wrappedLines = await wrapWords(words, fontSize);

    const lines = wrappedLines.map(line => ({ words: line, fontSize, lineType }));

    return { lines, remainingMarkdown };
}

// in: string markdown
// out: { paragraph: string, remainingMarkdown: string }
function selectFirstParagraph(markdown) {
    const index = markdown.indexOf('\n\n');

    if (index === -1) {
    // só tem um parágrafo, markdown acaba aqui
    return { paragraph: markdown.trim(), remainingMarkdown: '' };
    }

    return {
    paragraph: markdown.slice(0, index).trim(),
    remainingMarkdown: markdown.slice(index + 2).trim(),
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

// determinar tipos de palavras: negritadas, sublinhadas, etc.
function parseWords(text) {
    const words = [];
    // divide o texto preservando os marcadores de formatação como tokens separados
    const tokens = text.split(/(\*\*[^*]+\*\*|__[^_]+__|_[^_]+_)/g).filter(t => t.trim());

    for (const token of tokens) {
        let bold = false, italic = false, underline = false;
        let inner = token;

        if (token.startsWith('**') && token.endsWith('**')) {
        bold = true;
        inner = token.slice(2, -2);
        } else if (token.startsWith('__') && token.endsWith('__')) {
        underline = true;
        inner = token.slice(2, -2);
        } else if (token.startsWith('_') && token.endsWith('_')) {
        italic = true;
        inner = token.slice(1, -1);
        }

        inner.split(' ').filter(Boolean).forEach(w =>
        words.push({ text: w, bold, italic, underline })
        );
    }

    return words;
}
// agrupar palavras por linha
async function wrapWords(words, fontSize) {
    const lines = []; // array de linhas, cada linha é um array de palavras
    let currentLine = []; // linha atual
    let currentWidth = 0; // largura da linha atual (ele mede palavra a palavra para lidar com fontes proporcionais)

    // palavra a palavra:
    for (const word of words) {     
        // array de linhas, cada linha é um array de palavras
        const [{ width: wordWidth }] = await TextSize.measure({
        text: word.text,
        fontSize,
        fontFamily: 'System',
        });

        // largura da linha atual
        const spaceWidth = currentLine.length > 0
        ? (await TextSize.measure({ text: ' ', fontSize, fontFamily: 'System' }))[0].width
        : 0;


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