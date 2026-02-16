import * as Location from "expo-location";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import mosqueData from "../../data/mosques.json";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

const SHEET_HEIGHT = SCREEN_HEIGHT * 0.95;
// Collapsed shows just search bar (~85px: 12px handle padding + 5px handle + 12px padding + 14+14 search bar + padding)
const COLLAPSED_HEIGHT = 85;
const SNAP_POINTS = {
  MIN: SCREEN_HEIGHT - COLLAPSED_HEIGHT, // Collapsed - just search bar visible
  MID: SCREEN_HEIGHT * 0.45,              // Mid - shows featured card + categories
  MAX: SCREEN_HEIGHT * 0.08,              // Expanded - full list
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
  capacity?: number;
  facilities: string[];
};

const CATEGORIES = [
  { id: "mosque", icon: "🕌", label: "Mosque" },
  { id: "prayer", icon: "🤲", label: "Prayer" },
  { id: "qibla", icon: "🧭", label: "Qibla" },
  { id: "times", icon: "🕐", label: "Times" },
  { id: "quran", icon: "📖", label: "Quran" },
  { id: "more", icon: "⋯", label: "More" },
];

// Theme colors
const themes = {
  dark: {
    background: "#000",
    sheetBackground: "#1C1C1E",
    cardBackground: "#2C2C2E",
    text: "#fff",
    textSecondary: "#8E8E93",
    accent: "#C9A227",
    border: "#2C2C2E",
    mapStyle: "dark" as const,
  },
  light: {
    background: "#F2F2F7",
    sheetBackground: "#FFFFFF",
    cardBackground: "#F2F2F7",
    text: "#000",
    textSecondary: "#6B6B6B",
    accent: "#C9A227",
    border: "#E5E5EA",
    mapStyle: "light" as const,
  },
};

// Calculate distance between two coordinates (Haversine formula, in km)
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth's radius in km
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

// Dark map style for Google Maps (Android)
const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1d1d1d" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#181818" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#373737" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] },
];

export default function Index() {
  const systemColorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  
  const [isDarkMode, setIsDarkMode] = useState(true); // Default to dark
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedMosque, setSelectedMosque] = useState<Mosque | null>(null);
  const [mosques, setMosques] = useState<Mosque[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mapKey, setMapKey] = useState(0); // Force map re-render on theme change

  const theme = isDarkMode ? themes.dark : themes.light;

  const translateY = useSharedValue(SNAP_POINTS.MIN);
  const context = useSharedValue<{ y: number }>({ y: 0 });

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    // Force map to re-render with new theme
    setMapKey(prev => prev + 1);
  };

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
            a.longitude
          );
          const distB = calculateDistance(
            currentLocation.coords.latitude,
            currentLocation.coords.longitude,
            b.latitude,
            b.longitude
          );
          return distA - distB;
        });
        setMosques(sortedMosques);
        setSelectedMosque(sortedMosques[0]);
      }

      setLoading(false);
    })();
  }, []);

  const updateExpandedState = (expanded: boolean) => {
    setIsExpanded(expanded);
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      const newValue = context.value.y + event.translationY;
      translateY.value = Math.max(SNAP_POINTS.MAX, Math.min(newValue, SNAP_POINTS.MIN));
    })
    .onEnd((event) => {
      const velocity = event.velocityY;
      const currentY = translateY.value;
      
      // Snap points in order from top (expanded) to bottom (collapsed)
      const snapPoints = [SNAP_POINTS.MAX, SNAP_POINTS.MID, SNAP_POINTS.MIN];
      
      let targetSnap = SNAP_POINTS.MID;

      // Find current closest snap point
      let currentSnapIndex = 0;
      let minDist = Math.abs(currentY - snapPoints[0]);
      for (let i = 1; i < snapPoints.length; i++) {
        const dist = Math.abs(currentY - snapPoints[i]);
        if (dist < minDist) {
          minDist = dist;
          currentSnapIndex = i;
        }
      }

      // Fast swipe up (negative velocity) - go to next higher snap (lower index)
      if (velocity < -800) {
        targetSnap = snapPoints[Math.max(0, currentSnapIndex - 1)];
      }
      // Fast swipe down (positive velocity) - go to next lower snap (higher index)
      else if (velocity > 800) {
        targetSnap = snapPoints[Math.min(snapPoints.length - 1, currentSnapIndex + 1)];
      }
      // Slow drag - snap to nearest
      else {
        const distToMin = Math.abs(currentY - SNAP_POINTS.MIN);
        const distToMid = Math.abs(currentY - SNAP_POINTS.MID);
        const distToMax = Math.abs(currentY - SNAP_POINTS.MAX);

        if (distToMax < distToMid && distToMax < distToMin) {
          targetSnap = SNAP_POINTS.MAX;
        } else if (distToMid < distToMin && distToMid < distToMax) {
          targetSnap = SNAP_POINTS.MID;
        } else {
          targetSnap = SNAP_POINTS.MIN;
        }
      }

      translateY.value = withTiming(targetSnap, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
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
      [0, 0.5, 1]
    );
    return { opacity };
  });

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: theme.background,
    },
    loadingText: {
      marginTop: 16,
      color: theme.text,
      fontSize: 16,
    },
    bottomSheet: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      height: SHEET_HEIGHT,
      backgroundColor: theme.sheetBackground,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 5,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.cardBackground,
      marginHorizontal: 16,
      borderRadius: 8,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    searchText: {
      color: theme.text,
      fontSize: 17,
      fontWeight: "400",
    },
    categoryIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: theme.cardBackground,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 8,
    },
    categoryLabel: {
      color: theme.text,
      fontSize: 11,
      fontWeight: "500",
    },
    mosqueItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    mosqueIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.cardBackground,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    mosqueName: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "500",
      marginBottom: 2,
    },
    mosqueAddress: {
      color: theme.textSecondary,
      fontSize: 13,
    },
    mosqueDistance: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: "500",
    },
  }), [theme]);

  if (loading) {
    return (
      <View style={dynamicStyles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={dynamicStyles.loadingText}>Finding nearby mosques...</Text>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View style={dynamicStyles.loadingContainer}>
        <Text style={[styles.errorText, { color: "#ff4444" }]}>{errorMsg}</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={dynamicStyles.container}>
      <View style={dynamicStyles.container}>
        {/* Map */}
        <MapView
          key={mapKey}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          customMapStyle={isDarkMode ? darkMapStyle : []}
          userInterfaceStyle={isDarkMode ? "dark" : "light"}
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
              pinColor={mosque.id === selectedMosque?.id ? theme.accent : "#666"}
              onPress={() => setSelectedMosque(mosque)}
            />
          ))}
        </MapView>

        {/* Map overlay buttons */}
        <View style={[styles.mapOverlay, { top: insets.top + 10 }]}>
          {/* Menu button */}
          <TouchableOpacity 
            style={[styles.mapButton, { backgroundColor: theme.sheetBackground }]}
          >
            <Text style={[styles.mapButtonIcon, { color: theme.text }]}>☰</Text>
          </TouchableOpacity>
          
          {/* Theme toggle button */}
          <TouchableOpacity 
            style={[styles.mapButton, { backgroundColor: theme.sheetBackground, marginTop: 10 }]}
            onPress={toggleTheme}
          >
            <Text style={[styles.mapButtonIcon, { color: theme.text }]}>
              {isDarkMode ? "☀️" : "🌙"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Bottom Sheet */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[dynamicStyles.bottomSheet, bottomSheetStyle]}>
            {/* Handle */}
            <View style={styles.handleContainer}>
              <View style={[styles.handle, { backgroundColor: isDarkMode ? "#5C5C5E" : "#D1D1D6" }]} />
            </View>

            {/* Search Bar */}
            <TouchableOpacity style={dynamicStyles.searchBar} activeOpacity={0.8}>
              <Text style={styles.searchIcon}>🔍</Text>
              <Text style={dynamicStyles.searchText}>Salaam, where to pray?</Text>
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
                      selectedMosque.longitude
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
                  <View style={dynamicStyles.categoryIcon}>
                    <Text style={styles.categoryEmoji}>{cat.icon}</Text>
                  </View>
                  <Text style={dynamicStyles.categoryLabel}>{cat.label}</Text>
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
                    style={dynamicStyles.mosqueItem}
                    onPress={() => setSelectedMosque(mosque)}
                    activeOpacity={0.7}
                  >
                    <View style={dynamicStyles.mosqueIconContainer}>
                      <Text style={styles.mosqueEmoji}>📍</Text>
                    </View>
                    <View style={styles.mosqueInfo}>
                      <Text style={dynamicStyles.mosqueName}>{mosque.name}</Text>
                      <Text style={dynamicStyles.mosqueAddress}>{mosque.address}</Text>
                    </View>
                    <Text style={dynamicStyles.mosqueDistance}>
                      {location
                        ? `${calculateDistance(
                            location.coords.latitude,
                            location.coords.longitude,
                            mosque.latitude,
                            mosque.longitude
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

const styles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  errorText: {
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
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  mapButtonIcon: {
    fontSize: 18,
  },
  handleContainer: {
    paddingVertical: 12,
    alignItems: "center",
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 12,
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
  categoryEmoji: {
    fontSize: 24,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  mosquesList: {
    flex: 1,
  },
  mosqueEmoji: {
    fontSize: 18,
  },
  mosqueInfo: {
    flex: 1,
  },
});
