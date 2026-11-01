import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { greet } from '@nexa/core';

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>{greet({ id: '1', email: 'a@b.com', name: 'Nexa', createdAt: new Date().toISOString() })}</Text>
      <StatusBar style="auto" />
    </View>
  );
}
