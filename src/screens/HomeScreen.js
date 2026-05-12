import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function HomeScreen() {
  const navigation = useNavigation();
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Audia TTS</Text>
      
      <TouchableOpacity 
        style={styles.button}
        onPress={() => navigation.navigate('TTS')}
      >
        <Text style={styles.buttonText}>Testar TTS Screen</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
  },
  title: {
    fontSize: 24,
    color: '#FFF',
    marginBottom: 20,
  },
  button: {
    padding: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 18,
  },
});