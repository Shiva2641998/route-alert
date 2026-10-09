import { routeService } from '../src/services/routeService';
import { poiService } from '../src/services/poiService';
import { detourService } from '../src/services/detourService';
import { isPOIAheadOfUser } from '../src/services/geoUtils';

async function runVerification() {
  console.log('--- 1. Testing Route Calculation (Delhi -> Jaipur) ---');
  const route = await routeService.calculateRoute('Delhi', 'Jaipur');
  console.log(`Route ID: ${route.id}`);
  console.log(`Origin: ${route.originName}, Destination: ${route.destinationName}`);
  console.log(`Waypoints count: ${route.waypoints.length}`);
  console.log(`Total Distance: ${(route.totalDistanceMeters / 1000).toFixed(1)} km`);
  console.log(`Total Duration: ${route.totalDurationMinutes} minutes`);

  console.log('\n--- 2. Testing CNG POI Retrieval along Route ---');
  const pois = await poiService.searchCNGAlongRoute(route);
  console.log(`Found ${pois.length} CNG stations along the corridor:`);
  pois.forEach((poi) => console.log(` - ${poi.name} (Rating: ${poi.rating})`));

  console.log('\n--- 3. Testing Detour Calculation for Delhi -> Jaipur Trip ---');
  const maxAllowedDetour = 2.0;
  const manesar = { latitude: 28.4089, longitude: 76.9944 };
  let userStartLocation = route.waypoints[0];
  let nearest = Infinity;
  for (const point of route.waypoints) {
    const dLat = point.latitude - manesar.latitude;
    const dLng = point.longitude - manesar.longitude;
    const score = dLat * dLat + dLng * dLng;
    if (score < nearest) {
      nearest = score;
      userStartLocation = point;
    }
  }
  console.log(`Simulated User Position: Lat ${userStartLocation.latitude}, Lng ${userStartLocation.longitude}`);

  const notifiedPOIs = new Set<string>();
  const ignoredPOIs = new Set<string>();

  for (const poi of pois) {
    const isAhead = isPOIAheadOfUser(userStartLocation, poi.coordinates, route.waypoints);
    const detour = await detourService.calculateDetour(userStartLocation, route, poi);

    console.log(`\nEvaluating: ${poi.name}`);
    console.log(` - Is ahead of user: ${isAhead}`);
    console.log(` - Detour Time: ${detour.detourMinutes} min`);
    console.log(` - Detour Distance: ${detour.detourDistanceMeters} m`);

    if (!isAhead) {
      console.log(' -> Result: SKIPPED (POI is behind user)');
      continue;
    }

    if (detour.detourMinutes <= maxAllowedDetour) {
      if (!notifiedPOIs.has(poi.id) && !ignoredPOIs.has(poi.id)) {
        notifiedPOIs.add(poi.id);
        console.log(` -> Result: ⛽ ALERT TRIGGERED! (${detour.detourMinutes} min <= ${maxAllowedDetour} min limit)`);
      } else {
        console.log(' -> Result: SKIPPED (Already handled)');
      }
    } else {
      console.log(` -> Result: IGNORED (Detour ${detour.detourMinutes} min exceeds ${maxAllowedDetour} min limit)`);
    }
  }

  console.log('\n--- 4. Verification Summary ---');
  const abcAlert = notifiedPOIs.has('cng-abc-manesar');
  const shahpuraSkipped = !notifiedPOIs.has('cng-rajasthan-gas-shahpura');

  console.log(`ABC CNG Station notified within 2 min: ${abcAlert ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`Shahpura CNG (> 3 min) ignored: ${shahpuraSkipped ? 'PASS ✅' : 'FAIL ❌'}`);

  if (abcAlert && shahpuraSkipped) {
    console.log('\n🎉 ALL MVP BUSINESS RULES VERIFIED SUCCESSFULLY!');
  } else {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
