import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import MapView, { Marker } from "react-native-maps";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import mosqueData from "../../data/mosques.json";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

// Bottom sheet snap points (from bottom of screen)
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.95;
const SNAP_POINTS = {
  MIN: SCREEN_HEIGHT * 0.55, // Collapsed - 45% visible
  MID: SCREEN_HEIGHT * 0.35, // Mid - 65% visible
  MAX: SCREEN_HEIGHT * 0.08, // Expanded - 92% visible
};

type Mosque = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  prayerTimes: {
    fajr: string;
    dhuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
  };
  capacity: number;
  facilities: string[];
};

// Quick action categories
const CATEGORIES = [
  { id: "mosque", icon: "🕌", label: "Mosque" },
  { id: "prayer", icon: "🤲", label: "Prayer" },
  { id: "qibla", icon: "🧭", label: "Qibla" },
  { id: "times", icon: "🕐", label: "Times" },
  { id: "quran", icon: "📖", label: "Quran" },
  { id: "more", icon: "⋯", label: "More" },
];

export default function Index() {
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState<Location.LocationObject | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedMosque, setSelectedMosque] = useState<Mosque | null>(null);
  const [mosques, setMosques] = useState<Mosque[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  const translateY = useSharedValue(SNAP_POINTS.MIN);
  const context = useSharedValue<{ y: number }>({ y: 0 });

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg("Permission to access location was denied");
        setLoading(false);
        return;
      }

      let currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);

      if (currentLocation) {
        const sortedMosques = [...mosqueData.mosques].sort((a, b) => {
          const distA = calculateDistance(
            currentLocation.coords.latitude,
            currentLocation.coords.longitude,
            a.latitude,
            a.longitude,
          );
          const distB = calculateDistance(
            currentLocation.coords.latitude,
            currentLocation.coords.longitude,
            b.latitude,
            b.longitude,
          );
          return distA - distB;
        });
        setMosques(sortedMosques);
        setSelectedMosque(sortedMosques[0]);
      }

      setLoading(false);
    })();
  }, []);

  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const updateExpandedState = (expanded: boolean) => {
    setIsExpanded(expanded);
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      const newValue = context.value.y + event.translationY;
      translateY.value = Math.max(
        SNAP_POINTS.MAX,
        Math.min(newValue, SNAP_POINTS.MIN),
      );
    })
    .onEnd((event) => {
      const velocity = event.velocityY;
      const currentY = translateY.value;

      let targetSnap = SNAP_POINTS.MIN;

      if (velocity < -500) {
        // Fast swipe up
        targetSnap = SNAP_POINTS.MAX;
      } else if (velocity > 500) {
        // Fast swipe down
        targetSnap = SNAP_POINTS.MIN;
      } else {
        // Snap to nearest
        const distToMin = Math.abs(currentY - SNAP_POINTS.MIN);
        const distToMid = Math.abs(currentY - SNAP_POINTS.MID);
        const distToMax = Math.abs(currentY - SNAP_POINTS.MAX);

        if (distToMax < distToMid && distToMax < distToMin) {
          targetSnap = SNAP_POINTS.MAX;
        } else if (distToMid < distToMin) {
          targetSnap = SNAP_POINTS.MID;
        } else {
          targetSnap = SNAP_POINTS.MIN;
        }
      }

      translateY.value = withSpring(targetSnap, {
        damping: 25,
        stiffness: 120,
        velocity: velocity,
      });

      runOnJS(updateExpandedState)(targetSnap === SNAP_POINTS.MAX);
    });

  const bottomSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const listOpacityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [SNAP_POINTS.MIN, SNAP_POINTS.MID, SNAP_POINTS.MAX],
      [0, 0.5, 1],
    );
    return { opacity };
  });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#C9A227" />
        <Text style={styles.loadingText}>Finding nearby mosques...</Text>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{errorMsg}</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.container}>
        {/* Map */}
        <MapView
          style={styles.map}
          customMapStyle={darkMapStyle}
          userInterfaceStyle="dark"
          initialRegion={{
            latitude: location?.coords.latitude || 51.5074,
            longitude: location?.coords.longitude || -0.1278,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          showsUserLocation={true}
          showsMyLocationButton={false}
        >
          {mosques.map((mosque) => (
            <Marker
              key={mosque.id}
              coordinate={{
                latitude: mosque.latitude,
                longitude: mosque.longitude,
              }}
              title={mosque.name}
              description={mosque.address}
              pinColor={mosque.id === selectedMosque?.id ? "#C9A227" : "#666"}
              onPress={() => setSelectedMosque(mosque)}
            />
          ))}
        </MapView>

        {/* Map overlay buttons */}
        <View style={[styles.mapOverlay, { top: insets.top + 10 }]}>
          <TouchableOpacity style={styles.mapButton}>
            <Text style={styles.mapButtonIcon}>☰</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom Sheet */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.bottomSheet, bottomSheetStyle]}>
            {/* Handle */}
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>

            {/* Search Bar */}
            <TouchableOpacity style={styles.searchBar} activeOpacity={0.8}>
              <Text style={styles.searchIcon}>🔍</Text>
              <Text style={styles.searchText}>Salaam, where to pray?</Text>
            </TouchableOpacity>

            {/* Featured Card */}
            {selectedMosque && (
              <TouchableOpacity style={styles.featuredCard} activeOpacity={0.9}>
                <View style={styles.featuredContent}>
                  <Text style={styles.featuredTitle}>
                    Next prayer at {selectedMosque.name}
                  </Text>
                  <Text style={styles.featuredSubtitle}>
                    {calculateDistance(
                      location?.coords.latitude || 0,
                      location?.coords.longitude || 0,
                      selectedMosque.latitude,
                      selectedMosque.longitude,
                    ).toFixed(1)}{" "}
                    km away
                  </Text>
                </View>
                <Text style={styles.featuredTime}>
                  {selectedMosque.prayerTimes.dhuhr}
                </Text>
              </TouchableOpacity>
            )}

            {/* Category Icons */}
            <View style={styles.categoriesContainer}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity key={cat.id} style={styles.categoryItem}>
                  <View style={styles.categoryIcon}>
                    <Text style={styles.categoryEmoji}>{cat.icon}</Text>
                  </View>
                  <Text style={styles.categoryLabel}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Mosque List */}
            <Animated.View style={[styles.listContainer, listOpacityStyle]}>
              <ScrollView
                style={styles.mosquesList}
                showsVerticalScrollIndicator={false}
                scrollEnabled={isExpanded}
              >
                {mosques.map((mosque) => (
                  <TouchableOpacity
                    key={mosque.id}
                    style={styles.mosqueItem}
                    onPress={() => setSelectedMosque(mosque)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.mosqueIcon}>
                      <Text style={styles.mosqueEmoji}>📍</Text>
                    </View>
                    <View style={styles.mosqueInfo}>
                      <Text style={styles.mosqueName}>{mosque.name}</Text>
                      <Text style={styles.mosqueAddress}>{mosque.address}</Text>
                    </View>
                    <Text style={styles.mosqueDistance}>
                      {location
                        ? `${calculateDistance(
                            location.coords.latitude,
                            location.coords.longitude,
                            mosque.latitude,
                            mosque.longitude,
                          ).toFixed(1)} km`
                        : ""}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
    </GestureHandlerRootView>
  );
}

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1d1d1d" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [{ color: "#757575" }],
  },
  {
    featureType: "administrative.country",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9e9e9e" }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#bdbdbd" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#757575" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#181818" }],
  },
  {
    featureType: "road",
    elementType: "geometry.fill",
    stylers: [{ color: "#2c2c2c" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#8a8a8a" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#373737" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#3c3c3c" }],
  },
  {
    featureType: "road.local",
    elementType: "labels.text.fill",
    stylers: [{ color: "#616161" }],
  },
  {
    featureType: "transit",
    elementType: "labels.text.fill",
    stylers: [{ color: "#757575" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#000000" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#3d3d3d" }],
  },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  loadingText: {
    marginTop: 16,
    color: "#fff",
    fontSize: 16,
  },
  errorText: {
    color: "#ff4444",
    fontSize: 16,
    textAlign: "center",
    padding: 20,
  },
  mapOverlay: {
    position: "absolute",
    right: 16,
    zIndex: 10,
  },
  mapButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(28, 28, 30, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  mapButtonIcon: {
    color: "#fff",
    fontSize: 18,
  },
  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: SHEET_HEIGHT,
    backgroundColor: "#1C1C1E",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleContainer: {
    paddingVertical: 12,
    alignItems: "center",
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#5C5C5E",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2C2C2E",
    marginHorizontal: 16,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 12,
  },
  searchText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "400",
  },
  featuredCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#C9A227",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  featuredContent: {
    flex: 1,
  },
  featuredTitle: {
    color: "#000",
    fontSize: 14,
    fontWeight: "600",
  },
  featuredSubtitle: {
    color: "rgba(0,0,0,0.6)",
    fontSize: 13,
    marginTop: 2,
  },
  featuredTime: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700",
  },
  categoriesContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 20,
    paddingHorizontal: 8,
  },
  categoryItem: {
    alignItems: "center",
    width: (SCREEN_WIDTH - 32) / 6,
  },
  categoryIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#2C2C2E",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  categoryEmoji: {
    fontSize: 24,
  },
  categoryLabel: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "500",
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  mosquesList: {
    flex: 1,
  },
  mosqueItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2C2C2E",
  },
  mosqueIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2C2C2E",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  mosqueEmoji: {
    fontSize: 18,
  },
  mosqueInfo: {
    flex: 1,
  },
  mosqueName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 2,
  },
  mosqueAddress: {
    color: "#8E8E93",
    fontSize: 13,
  },
  mosqueDistance: {
    color: "#8E8E93",
    fontSize: 14,
    fontWeight: "500",
  },
});
