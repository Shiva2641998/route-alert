import * as Speech from 'expo-speech';
import { LocationCoordinate } from '../types/location';
import { Route } from '../types/route';
import {
  calculateBearing,
  calculateHaversineDistance,
  findClosestWaypointIndex,
} from './geoUtils';
import { isSoundMuted, subscribeSoundMuted } from './soundSettings';

type TurnDirection = 'left' | 'right' | 'u-turn';

interface Turn {
  index: number;
  distanceMeters: number;
  direction: TurnDirection;
}

const spokenStages = new Map<string, Set<string>>();
let activeRouteId = '';

function signedAngle(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function pointAtDistance(
  points: LocationCoordinate[],
  start: number,
  direction: -1 | 1,
  targetMeters: number
): number {
  let distance = 0;
  let index = start;
  while (index + direction >= 0 && index + direction < points.length) {
    const next = index + direction;
    distance += calculateHaversineDistance(points[index], points[next]);
    index = next;
    if (distance >= targetMeters) break;
  }
  return index;
}

function findNextTurn(
  location: LocationCoordinate,
  route: Route,
  maxAheadMeters = 650
): Turn | null {
  const points = route.waypoints;
  if (points.length < 3) return null;

  const userIndex = findClosestWaypointIndex(location, points);
  let distanceAhead = calculateHaversineDistance(location, points[userIndex]);

  for (let i = userIndex + 1; i < points.length - 1; i++) {
    distanceAhead += calculateHaversineDistance(points[i - 1], points[i]);
    if (distanceAhead > maxAheadMeters) return null;

    const before = pointAtDistance(points, i, -1, 45);
    const after = pointAtDistance(points, i, 1, 45);
    if (before === i || after === i) continue;

    const incoming = calculateBearing(points[before], points[i]);
    const outgoing = calculateBearing(points[i], points[after]);
    const angle = signedAngle(incoming, outgoing);
    const magnitude = Math.abs(angle);

    if (magnitude >= 150) {
      return { index: i, distanceMeters: distanceAhead, direction: 'u-turn' };
    }
    if (magnitude >= 38) {
      return {
        index: i,
        distanceMeters: distanceAhead,
        direction: angle < 0 ? 'left' : 'right',
      };
    }
  }

  return null;
}

function instruction(direction: TurnDirection, distanceMeters: number, now: boolean): string {
  const action =
    direction === 'u-turn'
      ? 'make a U-turn'
      : direction === 'left'
        ? 'turn left'
        : 'turn right';

  if (now) return `${action.charAt(0).toUpperCase()}${action.slice(1)}.`;
  const rounded = Math.max(50, Math.round(distanceMeters / 50) * 50);
  return `In ${rounded} meters, ${action}.`;
}

subscribeSoundMuted((muted) => {
  if (muted) void Speech.stop();
});

/** Announces each significant route turn at roughly 500 m and again near the turn. */
export function updateNavigationVoice(location: LocationCoordinate, route: Route): void {
  if (isSoundMuted()) return;
  if (activeRouteId !== route.id) {
    activeRouteId = route.id;
    spokenStages.clear();
  }

  const turn = findNextTurn(location, route);
  if (!turn) return;

  const turnKey = `${route.id}:${turn.index}`;
  const stages = spokenStages.get(turnKey) ?? new Set<string>();
  const stage = turn.distanceMeters <= 120 ? 'now' : turn.distanceMeters <= 500 ? 'advance' : null;
  if (!stage || stages.has(stage)) return;

  stages.add(stage);
  spokenStages.set(turnKey, stages);
  void Speech.stop().finally(() => {
    Speech.speak(instruction(turn.direction, turn.distanceMeters, stage === 'now'), {
      language: 'en-IN',
      rate: 0.92,
      pitch: 1,
      volume: 1,
      useApplicationAudioSession: false,
    });
  });
}

export type ManeuverDirection = 'straight' | 'left' | 'right' | 'u-turn';

export interface NavigationCue {
  direction: ManeuverDirection;
  distanceMeters: number | null;
  title: string;
}

/** Next banner maneuver. Looks further ahead than the spoken prompt. */
export function describeUpcomingTurn(
  location: LocationCoordinate,
  route: Route | null
): NavigationCue {
  if (!route || route.waypoints.length < 2) {
    return { direction: 'straight', distanceMeters: null, title: 'Continue straight' };
  }

  const turn = findNextTurn(location, route, 8000);
  if (!turn) {
    return { direction: 'straight', distanceMeters: null, title: 'Continue straight' };
  }

  const title =
    turn.direction === 'left' ? 'Turn left' : turn.direction === 'right' ? 'Turn right' : 'Make a U-turn';

  return {
    direction: turn.direction,
    distanceMeters: Math.max(0, Math.round(turn.distanceMeters)),
    title,
  };
}

export function resetNavigationVoice(): void {
  activeRouteId = '';
  spokenStages.clear();
  void Speech.stop();
}
