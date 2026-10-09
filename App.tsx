import React from 'react';
import { StyleSheet, View } from 'react-native';
import { TripProvider, useTrip } from './src/store/tripStore';
import { HomeScreen } from './src/screens/HomeScreen';
import { TripScreen } from './src/screens/TripScreen';

function AppNavigator() {
  const { status } = useTrip();

  if (status === 'ACTIVE') {
    return <TripScreen />;
  }

  return <HomeScreen />;
}

export default function App() {
  return (
    <View style={styles.root}>
      <TripProvider>
        <AppNavigator />
      </TripProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
});
