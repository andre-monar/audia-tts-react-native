import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  const [hasError, setHasError] = useState(null);

  useEffect(() => {
    // Vamos capturar qualquer erro durante a montagem inicial
    const handleError = (error) => {
      console.error("ERRO CAPTURADO PELO GLOBAL HANDLER:", error);
      setHasError(error);
    };

    // Adiciona um listener global de erros não tratados
    const originalHandler = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler(handleError);

    return () => ErrorUtils.setGlobalHandler(originalHandler);
  }, []);

  // Se um erro foi capturado, mostra ele na tela!
  if (hasError) {
    return (
      <ScrollView style={{ flex: 1, marginTop: 50, padding: 20, backgroundColor: '#000' }}>
        <Text style={{ color: 'red', fontSize: 18, fontWeight: 'bold' }}>🚨 ERRO CAPTURADO:</Text>
        <Text style={{ color: 'white', marginTop: 10 }}>{hasError?.message || hasError?.toString()}</Text>
        <Text style={{ color: 'orange', marginTop: 20, fontWeight: 'bold' }}>Stack Trace:</Text>
        <Text style={{ color: '#CCC' }}>{hasError?.stack}</Text>
      </ScrollView>
    );
  }

  return <AppNavigator />;
}