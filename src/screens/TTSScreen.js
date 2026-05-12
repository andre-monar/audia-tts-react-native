import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableWithoutFeedback, Animated } from 'react-native';
import { breakNextLine } from '../utils/lineBreaker';
import { mockMarkdown } from '../utils/mockText';
import { COLORS } from '../theme/colors';
import { FONT_SIZES } from '../theme/fontSizes';
import { useNavigation, useRoute } from '@react-navigation/native';

const EMPTY_LINE = { words: [], fontSize: FONT_SIZES.paragraph, lineType: 'empty' };
const BUFFER_EMPTY = { words: [], fontSize: FONT_SIZES.paragraph, lineType: 'buffer' };
const TOTAL_LINES = 7;    // total de linhas no buffer (inclui 2 ocultas)
const ACTIVE_IDX = 3;     // índice da linha ativa (sempre centro)
const WORD_INTERVAL = 500;  // ms por palavra
const RESET_INTERVAL = 2000; // ms antes de reiniciar após terminar

export default function TTSScreen() {

  const navigation = useNavigation();
  const route = useRoute();
  const initialMarkdown = route.params?.markdownText || mockMarkdown;

  // ── ESTADO ──────────────────────────────────────────────────────────────
  const [lines, setLines] = useState(Array(TOTAL_LINES).fill(BUFFER_EMPTY));
  const [activeWord, setActiveWord] = useState(0);

  // ── REFS (não causam re-render, usadas dentro de timers e callbacks) ────
  const linesRef = useRef(Array(TOTAL_LINES).fill(BUFFER_EMPTY)); // espelho de lines
  const activeWordRef = useRef(0);          // espelho de activeWord
  const initialMarkdownRef = useRef(initialMarkdown);
  const remainingMarkdown = useRef(initialMarkdownRef.current); // markdown ainda não processado
  const isPaused = useRef(false);           // controle de pausa
  const wordTimer = useRef(null);           // referência do setInterval
  const lineHistory = useRef([]); // pilha de linhas já lidas
  const lineQueue = useRef([]);    // fila de linhas futuras descartadas no goBackLine

  // ── ANIMAÇÕES ────────────────────────────────────────────────────────────
  // opacidades individuais de cada linha (índices 0 e 6 sempre 0)
  const opacities = useRef(
    Array(TOTAL_LINES).fill(null).map((_, i) =>
      new Animated.Value(i === 0 || i === TOTAL_LINES - 1 ? 0 : 1)
    )
  ).current;

  // translateY do container inteiro (anima o shift)
  const containerAnim = useRef(new Animated.Value(0)).current;

  // altura de cada linha (capturada via onLayout, usada no shift)
  const lineHeights = useRef(Array(TOTAL_LINES).fill(60));

  // ── HELPERS DE ESTADO ────────────────────────────────────────────────────
  function updateLines(newLines) {
    linesRef.current = newLines;
    setLines([...newLines]); // spread para forçar re-render
  }

  function updateActiveWord(idx) {
    activeWordRef.current = idx;
    setActiveWord(idx);
  }

  // ── CARREGAMENTO DE LINHA ────────────────────────────────────────────────
  async function loadNextLine() {
    // primeiro consome a fila de linhas futuras guardadas
    if (lineQueue.current.length > 0) {
      const fromQueue = lineQueue.current.shift();
      console.log('consumindo da fila:', fromQueue.words.map(w => w.text).join(' '), 'type:', fromQueue.lineType);

      return lineQueue.current.shift();
    }
    if (!remainingMarkdown.current) return null;
    const { line, remainingMarkdown: next } = await breakNextLine(remainingMarkdown.current);
    remainingMarkdown.current = next;
    return line;
  }

  // ── INICIALIZAÇÃO ────────────────────────────────────────────────────────
  // popula índices 3, 4, 5, 6 (0, 1 e 2 começam vazios/ocultos)
  useEffect(() => {
    async function init() {
      const l3 = await loadNextLine();
      const l4 = await loadNextLine();
      const l5 = await loadNextLine();
      const l6 = await loadNextLine();

      updateLines([
        BUFFER_EMPTY,           // 0 — oculta (acima)
        BUFFER_EMPTY,           // 1 — contexto anterior (começa vazia)
        BUFFER_EMPTY,           // 2 — contexto anterior
        l3 || BUFFER_EMPTY,     // 3 — ATIVA
        l4 || BUFFER_EMPTY,     // 4 — próxima
        l5 || BUFFER_EMPTY,     // 5 — próxima
        l6 || BUFFER_EMPTY,     // 6 — oculta (abaixo)
      ]);
      updateActiveWord(0);
      startWordTimer();
    }

    init();
    return () => clearInterval(wordTimer.current);
  }, []);

  // ── TIMER DE PALAVRAS ────────────────────────────────────────────────────
  function startWordTimer() {
    wordTimer.current = setInterval(() => {
      if (!isPaused.current) advanceWord();
    }, WORD_INTERVAL);
  }

  // ── AVANÇAR PALAVRA ──────────────────────────────────────────────────────
  function advanceWord() {
    const activeLine = linesRef.current[ACTIVE_IDX];

    // linha vazia: verifica se acabou tudo ou só pula a linha
    if (!activeLine || activeLine.words.length === 0) {
      const allEmpty = linesRef.current.every(l => l.words.length === 0);
      if (allEmpty && !remainingMarkdown.current) {
        // acabou o texto — reinicia após delay
        clearInterval(wordTimer.current);
        setTimeout(restart, RESET_INTERVAL);
      } else {
        advanceLine();
      }
      return;
    }

    const next = activeWordRef.current + 1;

    if (next >= activeLine.words.length) {
      advanceLine(); // acabou as palavras da linha ativa, avança linha
    } else {
      updateActiveWord(next); // avança palavra
    }
  }

  // ── AVANÇAR LINHA ────────────────────────────────────────────────────────
  async function advanceLine() {
    const newLine = await loadNextLine();
    const shiftAmount = lineHeights.current[0] || 60;

    // empilha a linha que vai sair para o histórico (pode ser usada para voltar linha depois)
    lineHistory.current.push(linesRef.current[1]);
    // 1. fade out da linha 1 e fade in da linha 6 simultaneamente com o shift
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
      // 2. após animação: reseta container, shifta linhas, reseta opacidades
      containerAnim.setValue(0);

      const shifted = [...linesRef.current.slice(1), newLine || BUFFER_EMPTY];
      updateLines(shifted);
      updateActiveWord(0);

      // reseta opacidades para estado padrão
      opacities.forEach((anim, i) => {
        anim.setValue(i === 0 || i === TOTAL_LINES - 1 ? 0 : 1);
      });
    });
  }

  // ── RESTART ──────────────────────────────────────────────────────────────
  async function restart() {
    remainingMarkdown.current = initialMarkdownRef.current;
    updateActiveWord(0);

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

    // reseta opacidades para estado inicial
    opacities.forEach((anim, i) => {
      anim.setValue(i === 0 || i === TOTAL_LINES - 1 ? 0 : 1);
    });

    startWordTimer();
  }

  // ── PAUSE / RESUME ───────────────────────────────────────────────────────
  function togglePause() {
    isPaused.current = !isPaused.current;
  }

  // ── IR PARA HOME ───────────────────────────────────────────────────────
  function goHome() {
    clearInterval(wordTimer.current); // para o timer antes de sair
    navigation.navigate('Home');
  }

  // ── IR PARA LINHA ANTERIOR ─────────────────────────────────────────────
  function goBackLine() {
    console.log('antes:', linesRef.current.map(l => l.words.map(w => w.text).join(' ')));
    console.log('queue antes:', lineQueue.current.map(l => l.words.map(w => w.text).join(' ')));
    if (lineHistory.current.length === 0) {
      updateActiveWord(0);
      return;
    }

    // snapshot imediato para evitar referências mutadas
    const current = [...linesRef.current];
    const prevLine = lineHistory.current.pop();

    const l5 = current[5];
    const l6 = current[6];
    // guarda na fila só se não for buffer vazio
    lineQueue.current.unshift(l6.lineType !== 'buffer' ? l6 : null);
    lineQueue.current.unshift(l5.lineType !== 'buffer' ? l5 : null);

    // filtra nulls
    lineQueue.current = lineQueue.current.filter(Boolean);

    console.log('l5 type:', current[5]?.lineType);
    console.log('l6 type:', current[6]?.lineType);
    const reversed = [
      BUFFER_EMPTY,      // 0 — oculta
      prevLine,          // 1 — histórico
      current[1],        // 2
      current[2],        // 3 — ativa
      current[3],        // 4
      current[4],        // 5
      current[5],      // 6 — oculta
    ];

    updateLines(reversed);
    updateActiveWord(0);
    console.log('depois:', reversed.map(l => l.words.map(w => w.text).join(' ')));
    console.log('queue depois:', lineQueue.current.map(l => l.words.map(w => w.text).join(' ')));
  }

  // ── RENDER ───────────────────────────────────────────────────────────────
  return (
    <TouchableWithoutFeedback onPress={togglePause}>
      <View style={styles.container}>

        {/* header fixo */}
        <View style={styles.header}>
          <Text style={styles.headerBtn} onPress={goBackLine}>←</Text>
          <Text style={styles.headerTitle}>TTS</Text>
          <Text style={styles.headerBtn} onPress={goHome}>⌂</Text>
        </View>

        {/* container animado — sobe durante o shift */}
        <Animated.View style={[styles.linesContainer, { transform: [{ translateY: containerAnim }] }]}>
          {lines.map((line, idx) => (
            <Animated.View
              key={idx}
              style={{ opacity: opacities[idx] }}
              onLayout={(e) => { lineHeights.current[idx] = e.nativeEvent.layout.height; }}
            >
              {/* linha de palavras */}
              <View style={styles.lineRow}>
                {line.words.map((word, wIdx) => (
                  <Text
                    key={wIdx}
                    style={[
                      styles.word,
                      { fontSize: line.fontSize },
                      // negrito só na palavra ativa da linha central
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
