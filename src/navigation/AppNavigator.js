import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// telas
import HomeScreen from '../screens/HomeScreen';
import TTSScreen from '../screens/TTSScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false, // vocês já têm header custom na TTS
          animation: 'fade', // deixa mais clean
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
        />

        <Stack.Screen
          name="TTS"
          component={TTSScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}