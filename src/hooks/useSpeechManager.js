import { useRef, useEffect, useCallback, useState } from 'react';
import * as Speech from 'expo-speech';

export function useSpeechManager() {
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const speakingRef = useRef(false);
  const isMounted = useRef(true);

  // Sincroniza ref com state para leitura dentro de callbacks
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Limpeza ao desmontar
  useEffect(() => {
    return () => {
      isMounted.current = false;
      Speech.stop();
    };
  }, []);

  // Efeito que reage à pausa
  useEffect(() => {
    if (isPaused) {
      Speech.pause();
    } else {
      Speech.resume();
    }
  }, [isPaused]);

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  const stopSpeaking = useCallback(() => {
    Speech.stop();
    speakingRef.current = false;
  }, []);

  const speakLine = useCallback(
    (line, { onWordChange, onLineEnd }) => {
      if (!isMounted.current) return;
      Speech.stop(); // interrompe qualquer fala anterior

      if (!line || line.words.length === 0) {
        // Linha vazia → apenas avisa que terminou
        onLineEnd?.();
        return;
      }

      const words = line.words.map(w => w.text);
      const textToSpeak = words.join(' ');

      // Mapeia índices de início de cada palavra na string concatenada
      let currentIdx = 0;
      const wordStartIndices = words.map((word, i) => {
        const start = currentIdx;
        currentIdx += word.length + (i < words.length - 1 ? 1 : 0);
        return start;
      });

      speakingRef.current = true;

      Speech.speak(textToSpeak, {
        language: 'pt-BR',
        onBoundary: (e) => {
          if (!isMounted.current || !speakingRef.current) return;
          const wordIdx = wordStartIndices.findIndex(
            start => start === e.charIndex
          );
          if (wordIdx !== -1) {
            onWordChange?.(wordIdx);
          }
        },
        onDone: () => {
          if (!isMounted.current) return;
          speakingRef.current = false;
          onLineEnd?.();   // dispara avanço de linha
        },
        onStopped: () => {
          if (!isMounted.current) return;
          speakingRef.current = false;
        },
        onError: () => {
          if (!isMounted.current) return;
          speakingRef.current = false;
          onLineEnd?.();   // fallback: avança mesmo com erro
        },
      });
    },
    []
  );

  return {
    isPaused,
    togglePause,
    speakLine,
    stopSpeaking,
    isSpeaking: () => speakingRef.current,
  };
}