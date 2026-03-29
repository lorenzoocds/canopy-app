import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  Animated, Dimensions, Vibration,
} from 'react-native';
import { Svg, Circle } from 'react-native-svg';

const COUNTDOWN_SECONDS = 45;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface JobOfferModalProps {
  visible: boolean;
  type: 'verify' | 'errand';
  data: any;
  onAccept: () => void;
  onDecline: () => void;
}

export default function JobOfferModal({
  visible, type, data, onAccept, onDecline,
}: JobOfferModalProps) {
  const [timeLeft, setTimeLeft] = useState(COUNTDOWN_SECONDS);
  const slideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleAcceptWithHaptic = () => {
    Vibration.vibrate([0, 200]);
    onAccept();
  };

  const handleDeclineWithHaptic = () => {
    Vibration.vibrate([0, 100, 100, 100]);
    onDecline();
  };

  useEffect(() => {
    if (visible) {
      setTimeLeft(COUNTDOWN_SECONDS);
      Vibration.vibrate([0, 400, 200, 400]);

      // Slide up
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 9,
      }).start();

      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Countdown
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            onDecline();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      Animated.timing(slideAnim, {
        toValue: Dimensions.get('window').height,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible]);

  const isVerify = type === 'verify';
  const accentColor = isVerify ? '#3498db' : '#e67e22';
  const accentBg = isVerify ? '#ebf5fb' : '#fef5ed';
  const distanceMiles = data?.distance
    ? (data.distance / 1609.34).toFixed(1)
    : '?';

  // Countdown ring
  const progress = timeLeft / COUNTDOWN_SECONDS;
  const circumference = 2 * Math.PI * 36;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <Modal transparent visible={visible} animationType="none">
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.modal,
            { transform: [{ translateY: slideAnim }, { scale: pulseAnim }] },
          ]}
        >
          {/* Job Type Badge */}
          <View style={[styles.typeBadge, { backgroundColor: accentBg }]}>
            <Text style={styles.typeEmoji}>{isVerify ? '🔵' : '🟠'}</Text>
            <Text style={[styles.typeText, { color: accentColor }]}>
              {isVerify ? 'VERIFY JOB' : 'ERRAND JOB'}
            </Text>
          </View>

          {/* Job Details */}
          {isVerify ? (
            <View style={styles.detailsSection}>
              <Text style={styles.jobTitle}>{data?.category?.name || 'Infrastructure Issue'}</Text>
              <Text style={styles.jobDistance}>{distanceMiles} miles away</Text>
              <Text style={styles.jobAddress}>{data?.address || 'Nearby location'}</Text>
            </View>
          ) : (
            <View style={styles.detailsSection}>
              <Text style={styles.jobTitle}>{data?.title || 'Errand'}</Text>
              <Text style={styles.jobSubdetail}>
                Pickup: {data?.pickup_name || data?.pickup_address} ({distanceMiles} mi)
              </Text>
              <Text style={styles.jobSubdetail}>
                Dropoff: {data?.dropoff_address}
              </Text>
              {data?.pickup_window_start && (
                <Text style={styles.jobWindow}>
                  Pickup window: {new Date(data.pickup_window_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {data.pickup_window_end ? new Date(data.pickup_window_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </Text>
              )}
            </View>
          )}

          {/* Payout */}
          <View style={[styles.payoutBox, { backgroundColor: accentBg }]}>
            <Text style={styles.payoutLabel}>Payout</Text>
            <Text style={[styles.payoutAmount, { color: accentColor }]}>
              ${isVerify ? '5.00' : (data?.payout_amount || '0.00')}
            </Text>
            {!isVerify && data?.distance_miles && (
              <Text style={styles.payoutMiles}>({data.distance_miles} mi)</Text>
            )}
          </View>

          {/* Countdown Ring */}
          <View style={styles.countdownContainer}>
            <Svg width={80} height={80} viewBox="0 0 80 80">
              <Circle
                cx="40" cy="40" r="36"
                stroke="#e0e0e0" strokeWidth="4" fill="none"
              />
              <Circle
                cx="40" cy="40" r="36"
                stroke={timeLeft <= 10 ? '#e74c3c' : accentColor}
                strokeWidth="4" fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
              />
            </Svg>
            <Text style={[styles.countdownText, timeLeft <= 10 && styles.countdownUrgent]}>
              0:{timeLeft.toString().padStart(2, '0')}
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.declineBtn} onPress={handleDeclineWithHaptic}>
              <Text style={styles.declineBtnText}>DECLINE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.acceptBtn, { backgroundColor: accentColor }]}
              onPress={handleAcceptWithHaptic}
            >
              <Text style={styles.acceptBtnText}>ACCEPT</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2, shadowRadius: 12, elevation: 10,
  },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 20,
  },
  typeEmoji: { fontSize: 16, marginRight: 8 },
  typeText: { fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  detailsSection: { alignItems: 'center', marginBottom: 20 },
  jobTitle: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },
  jobDistance: { fontSize: 15, color: '#666', marginTop: 6, fontWeight: '600' },
  jobAddress: { fontSize: 14, color: '#888', marginTop: 4, textAlign: 'center' },
  jobSubdetail: { fontSize: 14, color: '#666', marginTop: 4, textAlign: 'center' },
  jobWindow: { fontSize: 13, color: '#e67e22', marginTop: 8, fontWeight: '600' },
  payoutBox: {
    borderRadius: 16, paddingVertical: 20, paddingHorizontal: 28,
    alignItems: 'center', marginBottom: 20, width: '100%',
  },
  payoutLabel: { fontSize: 13, color: '#888', fontWeight: '600' },
  payoutAmount: { fontSize: 44, fontWeight: '900', marginTop: 6 },
  payoutMiles: { fontSize: 13, color: '#888', marginTop: 4 },
  countdownContainer: {
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 24, width: 80, height: 80,
  },
  countdownText: {
    position: 'absolute', fontSize: 20, fontWeight: '800', color: '#333',
  },
  countdownUrgent: { color: '#e74c3c' },
  buttonRow: { flexDirection: 'row', gap: 16, width: '100%' },
  declineBtn: {
    flex: 1, borderRadius: 14, padding: 18, alignItems: 'center',
    backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0',
  },
  declineBtnText: { fontSize: 16, fontWeight: '800', color: '#999' },
  acceptBtn: {
    flex: 1, borderRadius: 14, padding: 18, alignItems: 'center',
  },
  acceptBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
