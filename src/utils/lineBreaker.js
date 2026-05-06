import { Dimensions } from 'react-native';
import TextSize from 'react-native-text-size';

// pega largura da tela, que pode modificar o número de palavras por linha
const SCREEN_WIDTH = Dimensions.get('window').width;
const PADDING = 32; // padding horizontal
const AVAILABLE_WIDTH = SCREEN_WIDTH - PADDING;

// in: string markdown
// out: array de linhas
// cada linha: {words: [{ text, bold, italic, underline}], fontSize}
export function breakLines(words, fontSize) {
    // todo
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
            lines.push(currentLine); // add a linha atual ao array de linhas
            currentLine = [word]; // inicia uma nova linha com a palavra atual
            currentWidth = wordWidth; // reseta a largura da linha para a largura da palavra atual
        } else {
            currentLine.push(word); // adiciona a palavra à linha atual
            currentWidth += spaceWidth + wordWidth; // atualiza a largura da linha
        }

    }
    if (currentLine.length > 0) { // se sobrou uma linha não adicionada, adiciona ao array de linhas
        lines.push(currentLine);
    }
    return lines; // retorna o array de linhas
}