import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../contexts/AuthContext';
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import ReporterHomeScreen from '../screens/reporter/ReporterHomeScreen';
import SubmitReportScreen from '../screens/reporter/SubmitReportScreen';
import MyReportsScreen from '../screens/reporter/MyReportsScreen';
import ReportDetailScreen from '../screens/reporter/ReportDetailScreen';
import WorkerHomeScreen from '../screens/worker/WorkerHomeScreen';
import ActiveVerifyJobScreen from '../screens/worker/ActiveVerifyJobScreen';
import ActiveErrandJobScreen from '../screens/worker/ActiveErrandJobScreen';
import MyJobsScreen from '../screens/worker/MyJobsScreen';
import EarningsScreen from '../screens/worker/EarningsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function ReporterTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#1a472a',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: { paddingBottom: 6, height: 56 },
        headerShown: false,
      }}
    >
      <Tab.Screen name="Map" component={ReporterHomeScreen} options={{ tabBarLabel: 'Map' }} />
      <Tab.Screen name="MyReports" component={MyReportsScreen} options={{ tabBarLabel: 'My Reports' }} />
    </Tab.Navigator>
  );
}

function WorkerTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#e67e22',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: { paddingBottom: 6, height: 56 },
        headerShown: false,
      }}
    >
      <Tab.Screen name="WorkerHome" component={WorkerHomeScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="MyJobs" component={MyJobsScreen} options={{ tabBarLabel: 'My Jobs' }} />
      <Tab.Screen name="Earnings" component={EarningsScreen} options={{ tabBarLabel: 'Earnings' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { session, user, loading } = useAuth();
  if (loading) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color="#1a472a" /></View>;
  }
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
          </>
        ) : user?.role === 'worker' ? (
          <>
            <Stack.Screen name="WorkerTabs" component={WorkerTabs} />
            <Stack.Screen name="ActiveVerifyJob" component={ActiveVerifyJobScreen} options={{ headerShown: true, title: 'Verify Job' }} />
            <Stack.Screen name="ActiveErrandJob" component={ActiveErrandJobScreen} options={{ headerShown: true, title: 'Errand' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="ReporterTabs" component={ReporterTabs} />
            <Stack.Screen name="SubmitReport" component={SubmitReportScreen} options={{ headerShown: true, title: 'Report Issue' }} />
            <Stack.Screen name="ReportDetail" component={ReportDetailScreen} options={{ headerShown: true, title: 'Report' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
