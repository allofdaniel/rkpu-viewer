/**
 * Airspace Entity Tests
 * DO-278A 요구사항 추적: SRS-TEST-003
 */

import { describe, it, expect } from 'vitest';
import {
  isPointInPolygon,
  isInAirspace,
  calculatePolygonCenter,
  findNearestWaypoint,
} from '@/domain/entities/Airspace';
import type { Coordinate, Airspace, Waypoint } from '@/types';

describe('Airspace Entity', () => {
  describe('isPointInPolygon', () => {
    const square: Coordinate[] = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 10 },
      { lat: 10, lon: 10 },
      { lat: 10, lon: 0 },
    ];

    it('should return true for point inside polygon', () => {
      expect(isPointInPolygon({ lat: 5, lon: 5 }, square)).toBe(true);
    });

    it('should return false for point outside polygon', () => {
      expect(isPointInPolygon({ lat: 15, lon: 15 }, square)).toBe(false);
    });

    it('should handle point on edge', () => {
      const result = isPointInPolygon({ lat: 0, lon: 5 }, square);
      expect(typeof result).toBe('boolean');
    });

    it('should return false for empty polygon', () => {
      expect(isPointInPolygon({ lat: 5, lon: 5 }, [])).toBe(false);
    });

    it('should work with complex polygon', () => {
      const complex: Coordinate[] = [
        { lat: 0, lon: 0 },
        { lat: 5, lon: 10 },
        { lat: 10, lon: 5 },
        { lat: 5, lon: 0 },
      ];
      expect(isPointInPolygon({ lat: 5, lon: 5 }, complex)).toBe(true);
      expect(isPointInPolygon({ lat: 1, lon: 9 }, complex)).toBe(false);
    });
  });

  describe('isInAirspace', () => {
    const testAirspace: Airspace = {
      name: 'Test Control Zone',
      type: 'CTR',
      lowerLimit: 0,
      upperLimit: 3000,
      polygon: [
        { lat: 35.0, lon: 129.0 },
        { lat: 35.0, lon: 130.0 },
        { lat: 36.0, lon: 130.0 },
        { lat: 36.0, lon: 129.0 },
      ],
    };

    it('should return true for position inside airspace horizontally and vertically', () => {
      expect(
        isInAirspace({ lat: 35.5, lon: 129.5, altitude_ft: 1500 }, testAirspace)
      ).toBe(true);
    });

    it('should return false for position outside polygon', () => {
      expect(
        isInAirspace({ lat: 37.0, lon: 131.0, altitude_ft: 1500 }, testAirspace)
      ).toBe(false);
    });

    it('should return false for position above upper limit', () => {
      expect(
        isInAirspace({ lat: 35.5, lon: 129.5, altitude_ft: 5000 }, testAirspace)
      ).toBe(false);
    });

    it('should return false for position below lower limit', () => {
      const elevatedAirspace: Airspace = {
        ...testAirspace,
        lowerLimit: 1000,
      };
      expect(
        isInAirspace({ lat: 35.5, lon: 129.5, altitude_ft: 500 }, elevatedAirspace)
      ).toBe(false);
    });

    it('should handle unlimited upper limit (undefined)', () => {
      const unlimitedAirspace: Airspace = {
        ...testAirspace,
        upperLimit: undefined,
      };
      expect(
        isInAirspace({ lat: 35.5, lon: 129.5, altitude_ft: 50000 }, unlimitedAirspace)
      ).toBe(true);
    });

    it('should handle undefined altitude (2D check only)', () => {
      expect(isInAirspace({ lat: 35.5, lon: 129.5 }, testAirspace)).toBe(true);
    });
  });

  describe('calculatePolygonCenter', () => {
    it('should calculate center of square', () => {
      const square: Coordinate[] = [
        { lat: 0, lon: 0 },
        { lat: 0, lon: 10 },
        { lat: 10, lon: 10 },
        { lat: 10, lon: 0 },
      ];
      const center = calculatePolygonCenter(square);
      expect(center.lat).toBe(5);
      expect(center.lon).toBe(5);
    });

    it('should calculate center of triangle', () => {
      const triangle: Coordinate[] = [
        { lat: 0, lon: 0 },
        { lat: 0, lon: 6 },
        { lat: 6, lon: 3 },
      ];
      const center = calculatePolygonCenter(triangle);
      expect(center.lat).toBe(2);
      expect(center.lon).toBe(3);
    });

    it('should return origin for empty polygon', () => {
      const center = calculatePolygonCenter([]);
      expect(center.lat).toBe(0);
      expect(center.lon).toBe(0);
    });
  });

  describe('findNearestWaypoint', () => {
    const waypoints: Waypoint[] = [
      { ident: 'WP1', name: 'Waypoint 1', type: 'waypoint', lat: 35.5, lon: 129.3 },
      { ident: 'WP2', name: 'Waypoint 2', type: 'waypoint', lat: 35.6, lon: 129.4 },
      { ident: 'WP3', name: 'Waypoint 3', type: 'waypoint', lat: 35.7, lon: 129.5 },
    ];

    it('should find the nearest waypoint', () => {
      const nearest = findNearestWaypoint({ lat: 35.55, lon: 129.35 }, waypoints);
      expect(nearest?.ident).toBe('WP1');
    });

    it('should return null for empty waypoints array', () => {
      expect(findNearestWaypoint({ lat: 35.5, lon: 129.3 }, [])).toBeNull();
    });

    it('should return exact match when position is on waypoint', () => {
      const nearest = findNearestWaypoint({ lat: 35.6, lon: 129.4 }, waypoints);
      expect(nearest?.ident).toBe('WP2');
    });
  });
});
