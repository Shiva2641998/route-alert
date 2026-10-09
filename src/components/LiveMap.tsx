import React, { createElement, useEffect, useRef, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Route } from '../types/route';
import { UserLocation } from '../types/location';
import { POI } from '../types/poi';
import { buildLiveMapHtml } from './liveMapHtml';
import { readGoogleMapsApiKey } from '../services/googleKey';

interface LiveMapProps {
  route: Route | null;
  currentLocation: UserLocation | null;
  cngStations: POI[];
  activeAlertPoiId?: string;
}

interface MapMessage {
  source: 'route-alert';
  routeId: string;
  route: { latitude: number; longitude: number }[];
  stations: POI[];
  location: UserLocation | null;
  activeId?: string;
}

export const LiveMap: React.FC<LiveMapProps> = ({
  route,
  currentLocation,
  cngStations,
  activeAlertPoiId,
}) => {
  const mapHtml = useMemo(() => buildLiveMapHtml(readGoogleMapsApiKey()), []);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<MapMessage | null>(null);

  const message = (): MapMessage => ({
    source: 'route-alert',
    routeId: `${route?.id ?? ''}:${route?.waypoints.length ?? 0}`,
    route: route?.waypoints ?? [],
    stations: cngStations,
    location: currentLocation,
    activeId: activeAlertPoiId,
  });

  const deliver = (payload: MapMessage) => {
    if (Platform.OS === 'web') {
      frameRef.current?.contentWindow?.postMessage(payload, '*');
      return;
    }
    webRef.current?.injectJavaScript(
      `window.__onHost && window.__onHost(${JSON.stringify(payload)}); true;`
    );
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onReady = (event: MessageEvent) => {
      const data = event.data as { source?: string; type?: string } | undefined;
      if (data?.source !== 'route-alert-map' || data?.type !== 'ready') return;
      readyRef.current = true;
      if (pendingRef.current) deliver(pendingRef.current);
    };
    window.addEventListener('message', onReady);
    return () => window.removeEventListener('message', onReady);
  }, []);

  useEffect(() => {
    const payload = message();
    pendingRef.current = payload;
    // Always attempt delivering; if map is ready it renders immediately,
    // and if onLoadEnd fires afterwards it will re-deliver the latest pendingRef.
    deliver(payload);
  }, [route, currentLocation, cngStations, activeAlertPoiId]);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.fill}>
        <WebView
          ref={webRef}
          style={styles.fill}
          originWhitelist={['*']}
          source={{ html: mapHtml }}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          allowFileAccess={true}
          scalesPageToFit={false}
          onLoadEnd={() => {
            readyRef.current = true;
            if (pendingRef.current) deliver(pendingRef.current);
          }}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data) as { type?: string };
              if (data.type !== 'ready') return;
              readyRef.current = true;
              if (pendingRef.current) deliver(pendingRef.current);
            } catch {
              // Ignore non-JSON messages from the map page.
            }
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      {createElement('iframe', {
        ref: (node: HTMLIFrameElement | null) => {
          frameRef.current = node;
        },
        title: 'Route map',
        srcDoc: mapHtml,
        onLoad: () => {
          readyRef.current = true;
          if (pendingRef.current) deliver(pendingRef.current);
        },
        style: {
          border: '0',
          width: '100%',
          height: '100%',
          backgroundColor: '#e8eaed',
        },
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#e8eaed',
  },
});
