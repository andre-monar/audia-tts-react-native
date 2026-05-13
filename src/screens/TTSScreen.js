import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableWithoutFeedback, Animated } from 'react-native';
import { breakNextLine } from '../utils/lineBreaker';
import { mockMarkdown } from '../utils/mockText';
import { COLORS } from '../theme/colors';
import { FONT_SIZES } from '../theme/fontSizes';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSpeechManager } from '../hooks/useSpeechManager';

const BUFFER_EMPTY = { words: [], fontSize: FONT_SIZES.paragraph, lineType: 'buffer' };
const TOTAL_LINES = 7;     // total de linhas no buffer (inclui 2 ocultas)
const ACTIVE_IDX = 3;      // índice da linha ativa (sempre centro)
const RESET_INTERVAL = 2000; // ms antes de reiniciar após terminar
const EMPTY_LINE_PAUSE = 350; // ms entre linhas vazias (parágrafo)

export default function TTSScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const initialMarkdown = route.params?.markdownText || mockMarkdown;

  // ── ESTADO ──────────────────────────────────────────────────────────────
  const [lines, setLines] = useState(Array(TOTAL_LINES).fill(BUFFER_EMPTY));

  // ── HOOK DE FALA ────────────────────────────────────────────────────────
  const { activeWord, togglePause, speakLine, stopSpeaking } = useSpeechManager();

  // ── REFS ────────────────────────────────────────────────────────────────
  const linesRef = useRef(Array(TOTAL_LINES).fill(BUFFER_EMPTY));
  const initialMarkdownRef = useRef(initialMarkdown);
  const remainingMarkdown = useRef(initialMarkdownRef.current);
  const lineHistory = useRef([]);   // pilha de linhas já lidas
  const lineQueue = useRef([]);     // fila de linhas guardadas em goBackLine
  const resetTimer = useRef(null);  // timeout pendente para restart
  const emptyLineTimer = useRef(null); // timeout pendente para pular linha vazia

  // ── ANIMAÇÕES ────────────────────────────────────────────────────────────
  const opacities = useRef(
    Array(TOTAL_LINES).fill(null).map((_, i) =>
      new Animated.Value(i === 0 || i === TOTAL_LINES - 1 ? 0 : 1)
    )
  ).current;

  const containerAnim = useRef(new Animated.Value(0)).current;
  const lineHeights = useRef(Array(TOTAL_LINES).fill(60));

  // ── HELPERS ──────────────────────────────────────────────────────────────
  function updateLines(newLines) {
    linesRef.current = newLines;
    setLines([...newLines]);
  }

  function clearPendingTimers() {
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
    if (emptyLineTimer.current) {
      clearTimeout(emptyLineTimer.current);
      emptyLineTimer.current = null;
    }
  }

  // ── CARREGAMENTO DE LINHA ────────────────────────────────────────────────
  async function loadNextLine() {
    if (lineQueue.current.length > 0) {
      return lineQueue.current.shift();
    }
    if (!remainingMarkdown.current) return null;
    const { line, remainingMarkdown: next } = await breakNextLine(remainingMarkdown.current);
    remainingMarkdown.current = next;
    return line;
  }

  // ── INICIALIZAÇÃO ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const l3 = await loadNextLine();
      const l4 = await loadNextLine();
      const l5 = await loadNextLine();
      const l6 = await loadNextLine();
      if (cancelled) return;

      updateLines([
        BUFFER_EMPTY,
        BUFFER_EMPTY,
        BUFFER_EMPTY,
        l3 || BUFFER_EMPTY,
        l4 || BUFFER_EMPTY,
        l5 || BUFFER_EMPTY,
        l6 || BUFFER_EMPTY,
      ]);
      speakCurrentLine();
    }

    init();

    return () => {
      cancelled = true;
      stopSpeaking();
      clearPendingTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── FALAR LINHA ATIVA ────────────────────────────────────────────────────
  function speakCurrentLine() {
    const line = linesRef.current[ACTIVE_IDX];

    if (!line || line.words.length === 0) {
      const allEmpty = linesRef.current.every((l) => l.words.length === 0);
      const noMore = !remainingMarkdown.current && lineQueue.current.length === 0;
      if (allEmpty && noMore) {
        resetTimer.current = setTimeout(restart, RESET_INTERVAL);
      } else {
        emptyLineTimer.current = setTimeout(advanceLine, EMPTY_LINE_PAUSE);
      }
      return;
    }

    speakLine(line, { onLineEnd: advanceLine });
  }

  // ── AVANÇAR LINHA ────────────────────────────────────────────────────────
  async function advanceLine() {
    clearPendingTimers();

    const newLine = await loadNextLine();
    const shiftAmount = lineHeights.current[0] || 60;

    lineHistory.current.push(linesRef.current[1]);

    Animated.parallel([
      Animated.timing(containerAnim, {
        toValue: -shiftAmount,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacities[1], {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacities[6], {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      containerAnim.setValue(0);

      const shifted = [...linesRef.current.slice(1), newLine || BUFFER_EMPTY];
      updateLines(shifted);

      opacities.forEach((anim, i) => {
        anim.setValue(i === 0 || i === TOTAL_LINES - 1 ? 0 : 1);
      });

      speakCurrentLine();
    });
  }

  // ── RESTART ──────────────────────────────────────────────────────────────
  async function restart() {
    stopSpeaking();
    clearPendingTimers();

    remainingMarkdown.current = initialMarkdownRef.current;
    lineHistory.current = [];
    lineQueue.current = [];

    const l3 = await loadNextLine();
    const l4 = await loadNextLine();
    const l5 = await loadNextLine();
    const l6 = await loadNextLine();

    updateLines([
      BUFFER_EMPTY,
      BUFFER_EMPTY,
      BUFFER_EMPTY,
      l3 || BUFFER_EMPTY,
      l4 || BUFFER_EMPTY,
      l5 || BUFFER_EMPTY,
      l6 || BUFFER_EMPTY,
    ]);

    opacities.forEach((anim, i) => {
      anim.setValue(i === 0 || i === TOTAL_LINES - 1 ? 0 : 1);
    });

    speakCurrentLine();
  }

  // ── IR PARA HOME ─────────────────────────────────────────────────────────
  function goHome() {
    stopSpeaking();
    clearPendingTimers();
    navigation.navigate('Home');
  }

  // ── IR PARA LINHA ANTERIOR ───────────────────────────────────────────────
  function goBackLine() {
    if (lineHistory.current.length === 0) {
      speakCurrentLine();
      return;
    }

    stopSpeaking();
    clearPendingTimers();

    const current = [...linesRef.current];
    const prevLine = lineHistory.current.pop();

    // Apenas current[6] sai da tela; só ele precisa ir pra fila.
    if (current[6] && current[6].lineType !== 'buffer') {
      lineQueue.current.unshift(current[6]);
    }

    const reversed = [
      BUFFER_EMPTY,   // 0
      prevLine,       // 1
      current[1],     // 2
      current[2],     // 3 — ATIVA
      current[3],     // 4
      current[4],     // 5
      current[5],     // 6 — oculta
    ];

    updateLines(reversed);

    opacities.forEach((anim, i) => {
      anim.setValue(i === 0 || i === TOTAL_LINES - 1 ? 0 : 1);
    });

    speakCurrentLine();
  }

  // ── RENDER ───────────────────────────────────────────────────────────────
  return (
    <TouchableWithoutFeedback onPress={togglePause}>
      <View style={styles.container}>

        <View style={styles.header}>
          <Text style={styles.headerBtn} onPress={goBackLine}>←</Text>
          <Text style={styles.headerTitle}>TTS</Text>
          <Text style={styles.headerBtn} onPress={goHome}>⌂</Text>
        </View>

        <Animated.View style={[styles.linesContainer, { transform: [{ translateY: containerAnim }] }]}>
          {lines.map((line, idx) => (
            <Animated.View
              key={idx}
              style={{ opacity: opacities[idx] }}
              onLayout={(e) => { lineHeights.current[idx] = e.nativeEvent.layout.height; }}
            >
              <View style={styles.lineRow}>
                {line.words.map((word, wIdx) => (
                  <Text
                    key={wIdx}
                    style={[
                      styles.word,
                      { fontSize: line.fontSize },
                      idx === ACTIVE_IDX && wIdx === activeWord && styles.activeWord,
                    ]}
                  >
                    {word.text}{wIdx < line.words.length - 1 ? ' ' : ''}
                  </Text>
                ))}
              </View>
            </Animated.View>
          ))}
        </Animated.View>

      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 52,
    paddingBottom: 16,
  },
  headerBtn: {
    color: COLORS.textPrimary,
    fontSize: 22,
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  linesContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 20,
  },
  lineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  word: {
    color: COLORS.textSecondary,
  },
  activeWord: {
    color: COLORS.textPrimary,
    fontWeight: 'bold',
  },
});
