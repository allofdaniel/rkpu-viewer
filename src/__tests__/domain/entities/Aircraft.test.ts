/**
 * Aircraft Entity Tests
 * DO-278A 요구사항 추적: SRS-TEST-001
 */

import { describe, it, expect } from 'vitest';
import {
  detectFlightPhase,
  calculateDistanceNM,
  filterAbnormalJumps,
  formatAltitude,
  formatSpeed,
  isOnGround,
  getFlightPhaseColor,
  getFlightPhaseLabel,
  feetToMeters,
} from '@/domain/entities/Aircraft';
import type { AircraftPosition, AircraftTrailPoint } from '@/types';

describe('Aircraft Entity', () => {
  describe('detectFlightPhase', () => {
    const rkpuCoord = { lat: 35.5934, lon: 129.3518 };

    it('should detect ground phase when on_ground is true', () => {
      const position: AircraftPosition = {
        hex: 'TEST01',
        lat: 35.5934,
        lon: 129.3518,
        altitude_ft: 0,
        ground_speed: 10,
        on_ground: true,
      };
      expect(detectFlightPhase(position, rkpuCoord)).toBe('ground');
    });

    it('should detect ground phase for low altitude and slow speed', () => {
      const position: AircraftPosition = {
        hex: 'TEST01',
        lat: 35.5934,
        lon: 129.3518,
        altitude_ft: 50,
        ground_speed: 10,
      };
      expect(detectFlightPhase(position, rkpuCoord)).toBe('ground');
    });

    it('should detect takeoff phase with positive climb rate near airport', () => {
      const position: AircraftPosition = {
        hex: 'TEST02',
        lat: 35.5934,
        lon: 129.3518,
        altitude_ft: 300,
        ground_speed: 150,
        vertical_rate: 2000,
      };
      expect(detectFlightPhase(position, rkpuCoord)).toBe('takeoff');
    });

    it('should detect climb phase at higher altitude with positive rate', () => {
      const position: AircraftPosition = {
        hex: 'TEST03',
        lat: 36.0,
        lon: 130.0,
        altitude_ft: 15000,
        ground_speed: 350,
        vertical_rate: 1500,
      };
      expect(detectFlightPhase(position)).toBe('climb');
    });

    it('should detect cruise phase at high altitude with stable rate', () => {
      const position: AircraftPosition = {
        hex: 'TEST04',
        lat: 36.0,
        lon: 130.0,
        altitude_ft: 35000,
        ground_speed: 450,
        vertical_rate: 0,
      };
      expect(detectFlightPhase(position)).toBe('cruise');
    });

    it('should detect descent phase with negative rate', () => {
      const position: AircraftPosition = {
        hex: 'TEST05',
        lat: 36.0,
        lon: 130.0,
        altitude_ft: 20000,
        ground_speed: 300,
        vertical_rate: -1500,
      };
      expect(detectFlightPhase(position)).toBe('descent');
    });

    it('should detect approach phase at low altitude descending near airport', () => {
      const position: AircraftPosition = {
        hex: 'TEST06',
        lat: 35.6,
        lon: 129.35,
        altitude_ft: 2500,
        ground_speed: 180,
        vertical_rate: -800,
      };
      expect(detectFlightPhase(position, rkpuCoord)).toBe('approach');
    });

    it('should detect landing phase at very low altitude near airport', () => {
      const position: AircraftPosition = {
        hex: 'TEST07',
        lat: 35.595,
        lon: 129.352,
        altitude_ft: 200,
        ground_speed: 140,
        vertical_rate: -600,
      };
      expect(detectFlightPhase(position, rkpuCoord)).toBe('landing');
    });
  });

  describe('calculateDistanceNM', () => {
    it('should return 0 for same coordinates', () => {
      const point = { lat: 35.5934, lon: 129.3518 };
      expect(calculateDistanceNM(point, point)).toBe(0);
    });

    it('should calculate distance between two points correctly', () => {
      const rkpu = { lat: 35.5934, lon: 129.3518 };
      const rkss = { lat: 37.5583, lon: 126.7906 };
      const distance = calculateDistanceNM(rkpu, rkss);
      expect(distance).toBeGreaterThan(100);
      expect(distance).toBeLessThan(200);
    });

    it('should calculate short distances accurately', () => {
      const point1 = { lat: 35.5934, lon: 129.3518 };
      const point2 = { lat: 35.6, lon: 129.36 };
      const distance = calculateDistanceNM(point1, point2);
      expect(distance).toBeLessThan(1);
      expect(distance).toBeGreaterThan(0);
    });
  });

  describe('filterAbnormalJumps', () => {
    it('should return empty array for empty input', () => {
      expect(filterAbnormalJumps([])).toEqual([]);
    });

    it('should return single point unchanged', () => {
      const trail: AircraftTrailPoint[] = [
        { lat: 35.5934, lon: 129.3518, timestamp: Date.now() },
      ];
      expect(filterAbnormalJumps(trail)).toHaveLength(1);
    });

    it('should keep normal consecutive points', () => {
      const now = Date.now();
      const trail: AircraftTrailPoint[] = [
        { lat: 35.5934, lon: 129.3518, timestamp: now - 5000 },
        { lat: 35.5940, lon: 129.3520, timestamp: now - 4000 },
        { lat: 35.5946, lon: 129.3522, timestamp: now - 3000 },
        { lat: 35.5952, lon: 129.3524, timestamp: now - 2000 },
      ];
      const filtered = filterAbnormalJumps(trail);
      expect(filtered).toHaveLength(4);
    });

    it('should filter out abnormal jumps', () => {
      const now = Date.now();
      const trail: AircraftTrailPoint[] = [
        { lat: 35.5934, lon: 129.3518, timestamp: now - 5000 },
        { lat: 35.5940, lon: 129.3520, timestamp: now - 4000 },
        { lat: 36.5, lon: 130.5, timestamp: now - 3000 }, // Big jump - will be filtered
        { lat: 35.5952, lon: 129.3524, timestamp: now - 2000 }, // This also has big jump from prev, so filtered
      ];
      const filtered = filterAbnormalJumps(trail);
      // First 2 points are kept, 3rd is filtered, 4th is also filtered because jump from 2nd to 4th
      expect(filtered).toHaveLength(2);
    });
  });

  describe('formatAltitude', () => {
    it('should return dash for undefined', () => {
      expect(formatAltitude(undefined)).toBe('-');
    });

    it('should format low altitude', () => {
      expect(formatAltitude(5000)).toContain('5');
      expect(formatAltitude(5000)).toContain('ft');
    });

    it('should format high altitude as flight level', () => {
      expect(formatAltitude(35000)).toContain('FL');
    });
  });

  describe('formatSpeed', () => {
    it('should format speed with unit', () => {
      expect(formatSpeed(450)).toBe('450kt');
    });

    it('should return dash for undefined', () => {
      expect(formatSpeed(undefined)).toBe('-');
    });
  });

  describe('isOnGround', () => {
    it('should return true when on_ground is true', () => {
      expect(isOnGround({ hex: 'TEST', lat: 35, lon: 129, on_ground: true })).toBe(true);
    });

    it('should return true for very low altitude and slow speed', () => {
      expect(
        isOnGround({ hex: 'TEST', lat: 35, lon: 129, altitude_ft: 50, ground_speed: 20 })
      ).toBe(true);
    });

    it('should return false for airborne aircraft', () => {
      expect(
        isOnGround({ hex: 'TEST', lat: 35, lon: 129, altitude_ft: 5000, ground_speed: 200, on_ground: false })
      ).toBe(false);
    });
  });

  describe('getFlightPhaseColor', () => {
    it('should return correct colors', () => {
      expect(getFlightPhaseColor('ground')).toBe('#9E9E9E');
      expect(getFlightPhaseColor('cruise')).toBe('#2196F3');
      expect(getFlightPhaseColor('landing')).toBe('#FF9800');
    });
  });

  describe('getFlightPhaseLabel', () => {
    it('should return Korean labels', () => {
      expect(getFlightPhaseLabel('ground')).toBe('지상');
      expect(getFlightPhaseLabel('cruise')).toBe('순항');
      expect(getFlightPhaseLabel('landing')).toBe('착륙');
    });
  });

  describe('feetToMeters', () => {
    it('should convert feet to meters', () => {
      expect(feetToMeters(1000)).toBeCloseTo(304.8, 1);
      expect(feetToMeters(0)).toBe(0);
    });
  });
});
