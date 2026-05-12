import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '../screens/HomeScreen';
import TTSScreen from '../screens/TTSScreen';

export type RootStackParamList = {
  Home: undefined;
  TTS: { markdownText: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        id="RootStack"
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="TTS" component={TTSScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
