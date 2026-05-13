import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';

const SPEECH_LANG = 'pt-BR';
// Piso de duração por linha quando o TTS está mudo (simulador, voz faltando,
// switch de silêncio). Sem isso, onDone dispara instantaneamente e a tela "flicka".
const MS_PER_WORD_FALLBACK = 380;
const MIN_LINE_DURATION_FLOOR = 1500;

/**
 * Hook que encapsula toda a interação com o TTS.
 *
 * Estado exposto:
 *  - isPaused: boolean atual de pausa
 *  - activeWord: índice da palavra atualmente em destaque na linha falada
 *
 * Ações:
 *  - speakLine(line, callbacks, fromWordIdx?)  — começa a falar uma linha
 *  - stopSpeaking()                             — para imediatamente
 *  - togglePause()                              — pausa/retoma (resume sintetiza
 *                                                 a partir da palavra onde parou)
 *
 * callbacks aceitos:
 *  - onLineEnd(): chamado quando a linha termina (de verdade ou via piso).
 *  - onWordChange(idx): opcional; receberá também as atualizações de palavra,
 *    além do hook já atualizar `activeWord` internamente.
 */
export function useSpeechManager() {
  const [isPaused, setIsPaused] = useState(false);
  const [activeWord, setActiveWord] = useState(0);

  const isPausedRef = useRef(false);
  const activeWordRef = useRef(0);
  const advanceTimer = useRef(null);
  const fallbackTimer = useRef(null);
  // estado da linha sendo falada, usado em resume
  const currentRef = useRef(null);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    return () => {
      Speech.stop();
      clearTimers();
    };
  }, []);

  function clearTimers() {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    if (fallbackTimer.current) {
      clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    }
  }

  function setActive(idx) {
    activeWordRef.current = idx;
    setActiveWord(idx);
  }

  const stopSpeaking = useCallback(() => {
    Speech.stop();
    clearTimers();
    currentRef.current = null;
  }, []);

  const speakLine = useCallback((line, callbacks = {}, fromWordIdx = 0) => {
    Speech.stop();
    clearTimers();

    if (!line || line.words.length === 0) {
      callbacks.onLineEnd?.();
      return;
    }

    currentRef.current = { line, callbacks };

    // Constrói o texto da linha e o mapa de offset → índice da palavra.
    let text = '';
    const wordStarts = [];
    for (let i = 0; i < line.words.length; i++) {
      if (i > 0) text += ' ';
      wordStarts.push(text.length);
      text += line.words[i].text;
    }

    const startCharIndex = wordStarts[fromWordIdx] ?? 0;
    const textFromHere = text.slice(startCharIndex);

    setActive(fromWordIdx);
    callbacks.onWordChange?.(fromWordIdx);

    const wordsRemaining = line.words.length - fromWordIdx;
    const minMs = Math.max(MIN_LINE_DURATION_FLOOR, wordsRemaining * MS_PER_WORD_FALLBACK);
    const startedAt = Date.now();
    let didEnd = false;
    let lastWordIdx = fromWordIdx;

    function scheduleEnd() {
      if (didEnd || isPausedRef.current) return;
      didEnd = true;
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, minMs - elapsed);
      if (wait > 0) {
        advanceTimer.current = setTimeout(() => {
          if (isPausedRef.current) return;
          callbacks.onLineEnd?.();
        }, wait);
      } else {
        callbacks.onLineEnd?.();
      }
    }

    // Fallback: anda o destaque palavra-a-palavra no ritmo estimado, caso
    // onBoundary não dispare (TTS mudo). Quando o áudio toca, o onBoundary
    // sobrescreve.
    function tickFallback() {
      if (didEnd || isPausedRef.current) return;
      const elapsed = Date.now() - startedAt;
      const expectedIdx = fromWordIdx + Math.floor(elapsed / MS_PER_WORD_FALLBACK);
      if (expectedIdx >= line.words.length) return;
      if (expectedIdx > lastWordIdx) {
        lastWordIdx = expectedIdx;
        setActive(expectedIdx);
        callbacks.onWordChange?.(expectedIdx);
      }
      fallbackTimer.current = setTimeout(tickFallback, 150);
    }
    fallbackTimer.current = setTimeout(tickFallback, MS_PER_WORD_FALLBACK);

    Speech.speak(textFromHere, {
      language: SPEECH_LANG,
      // No iOS, força sessão de áudio própria (categoria playback) para tocar
      // mesmo com o switch lateral de silêncio ligado.
      useApplicationAudioSession: false,
      onBoundary: ({ charIndex }) => {
        if (isPausedRef.current) return;
        const absoluteCharIndex = charIndex + startCharIndex;
        let idx = 0;
        for (let i = 0; i < wordStarts.length; i++) {
          if (wordStarts[i] <= absoluteCharIndex) idx = i;
          else break;
        }
        if (idx > lastWordIdx) {
          lastWordIdx = idx;
          setActive(idx);
          callbacks.onWordChange?.(idx);
        }
      },
      onDone: () => {
        if (isPausedRef.current) return;
        scheduleEnd();
      },
      onError: () => {
        scheduleEnd();
      },
    });
  }, []);

  const togglePause = useCallback(() => {
    if (isPausedRef.current) {
      // resume — re-sintetiza a partir da palavra onde parou
      isPausedRef.current = false;
      setIsPaused(false);
      const saved = currentRef.current;
      if (saved) {
        speakLine(saved.line, saved.callbacks, activeWordRef.current);
      }
    } else {
      isPausedRef.current = true;
      setIsPaused(true);
      Speech.stop();
      clearTimers();
    }
  }, [speakLine]);

  return {
    isPaused,
    activeWord,
    togglePause,
    speakLine,
    stopSpeaking,
  };
}
