import { useEffect } from 'react';
import { View } from 'react-native';

export default function TTSScreen() {
  useEffect(() => {
    async function processText() {
      try {
        let remaining = mockMarkdown;
        const allLines = [];
        
        while (remaining.length > 0) {
          const { lines, remainingMarkdown } = await breakLinesFromFirstParagraph(remaining);
          allLines.push(...lines);
          remaining = remainingMarkdown;
        }
        
        setLines(allLines);
        console.log('Total de linhas:', allLines.length);
      } catch (error) {
        console.error('ERRO DETALHADO:', error);
        console.error('Stack trace:', error.stack);
        // Mostra na tela também
        setError(error.message);
      }
    }
    
    processText();
  }, []);
  return <View style={{ flex: 1, backgroundColor: '#1A1A1A' }} />;
}