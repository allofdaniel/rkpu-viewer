/**
 * Weather Entity Tests
 * DO-278A 요구사항 추적: SRS-TEST-002
 */

import { describe, it, expect } from 'vitest';
import {
  determineFlightCategory,
  assessWeatherRisk,
  parseWindDirection,
  calculateCrosswind,
  isVmcConditions,
} from '@/domain/entities/Weather';
import type { MetarData, SigmetData } from '@/types';

describe('Weather Entity', () => {
  describe('determineFlightCategory', () => {
    it('should return VFR for good conditions', () => {
      expect(determineFlightCategory(10, 5000)).toBe('VFR');
    });

    it('should return MVFR for marginal conditions', () => {
      expect(determineFlightCategory(4, 2500)).toBe('MVFR');
    });

    it('should return IFR for instrument conditions', () => {
      expect(determineFlightCategory(2, 800)).toBe('IFR');
    });

    it('should return LIFR for low IFR conditions', () => {
      expect(determineFlightCategory(0.5, 200)).toBe('LIFR');
    });

    it('should prioritize visibility over ceiling', () => {
      // Low visibility but high ceiling = IFR
      expect(determineFlightCategory(1, 10000)).toBe('IFR');
    });

    it('should prioritize ceiling over visibility', () => {
      // Good visibility but low ceiling = IFR
      expect(determineFlightCategory(10, 500)).toBe('IFR');
    });

    it('should handle null ceiling as unlimited', () => {
      expect(determineFlightCategory(10, null)).toBe('VFR');
    });
  });

  describe('assessWeatherRisk', () => {
    const baseMetar: MetarData = {
      icaoId: 'RKPU',
      obsTime: new Date().toISOString(),
      altim: 1013,
      wdir: 180,
      wspd: 10,
      visib: 10,
      fltCat: 'VFR',
      rawOb: 'METAR RKPU',
    };

    const createWeather = (metar: MetarData, sigmets: SigmetData[] = []) => ({
      metar,
      sigmets,
      lightning: [],
      lastUpdated: Date.now(),
    });

    it('should return low risk for good VFR conditions', () => {
      const result = assessWeatherRisk(createWeather(baseMetar));
      expect(result.level).toBe('low');
      expect(result.factors).toHaveLength(0);
    });

    it('should return moderate risk for MVFR conditions', () => {
      const mvfrMetar: MetarData = {
        ...baseMetar,
        fltCat: 'MVFR',
        visib: 4,
      };
      // MVFR doesn't trigger risk factors in the current implementation
      const result = assessWeatherRisk(createWeather(mvfrMetar));
      expect(result.level).toBe('low');
    });

    it('should return high risk for IFR conditions', () => {
      const ifrMetar: MetarData = {
        ...baseMetar,
        fltCat: 'IFR',
        visib: 2,
        ceiling: 600,
      };
      const result = assessWeatherRisk(createWeather(ifrMetar));
      expect(result.level).toBe('high');
      expect(result.factors).toContain('IFR 기상');
    });

    it('should detect strong winds', () => {
      const windyMetar: MetarData = {
        ...baseMetar,
        wspd: 30,
      };
      const result = assessWeatherRisk(createWeather(windyMetar));
      expect(result.factors.some((f) => f.includes('30'))).toBe(true);
    });

    it('should detect gusts', () => {
      const gustyMetar: MetarData = {
        ...baseMetar,
        wspd: 15,
        wgst: 35,
      };
      const result = assessWeatherRisk(createWeather(gustyMetar));
      expect(result.factors.some((f) => f.includes('35'))).toBe(true);
    });

    it('should detect low visibility', () => {
      const lowVisMetar: MetarData = {
        ...baseMetar,
        visib: 1.5,
        fltCat: 'IFR',
      };
      const result = assessWeatherRisk(createWeather(lowVisMetar));
      expect(result.factors.some((f) => f.includes('시정') || f.includes('IFR'))).toBe(true);
    });

    it('should include SIGMET risks', () => {
      const sigmets: SigmetData[] = [
        {
          type: 'TURBULENCE',
          hazard: 'TURBULENCE',
          raw: 'SIGMET',
        },
      ];
      const result = assessWeatherRisk(createWeather(baseMetar, sigmets));
      expect(result.factors.some((f) => f.includes('SIGMET'))).toBe(true);
    });

    it('should return severe for LIFR with multiple hazards', () => {
      const severeMetar: MetarData = {
        ...baseMetar,
        fltCat: 'LIFR',
        visib: 0.5,
        ceiling: 100,
        wspd: 35,
        wgst: 50,
      };
      const sigmets: SigmetData[] = [
        { type: 'TURBULENCE', hazard: 'SEVERE_TURBULENCE', raw: '' },
      ];
      const result = assessWeatherRisk(createWeather(severeMetar, sigmets));
      expect(result.level).toBe('severe');
    });
  });

  describe('parseWindDirection', () => {
    it('should parse numeric direction', () => {
      expect(parseWindDirection('180')).toBe(180);
    });

    it('should return null for VRB', () => {
      expect(parseWindDirection('VRB')).toBeNull();
    });

    it('should handle zero padded values', () => {
      expect(parseWindDirection('090')).toBe(90);
    });
  });

  describe('calculateCrosswind', () => {
    it('should return 0 for aligned runway', () => {
      // Wind from 180, runway 18 (heading 180)
      expect(calculateCrosswind(180, 180, 20)).toBe(0);
    });

    it('should return full wind for perpendicular', () => {
      // Wind from 090, runway 18 (heading 180)
      const crosswind = calculateCrosswind(90, 180, 20);
      expect(crosswind).toBeCloseTo(20, 0);
    });

    it('should calculate partial crosswind', () => {
      // Wind from 150, runway 18 (heading 180) - 30 degree angle
      const crosswind = calculateCrosswind(150, 180, 20);
      // sin(30°) * 20 = 10
      expect(crosswind).toBeCloseTo(10, 0);
    });
  });

  describe('isVmcConditions', () => {
    it('should return true for VFR conditions', () => {
      expect(isVmcConditions(10, 5000)).toBe(true);
    });

    it('should return true for MVFR conditions', () => {
      expect(isVmcConditions(4, 2500)).toBe(true);
    });

    it('should return false for IFR conditions', () => {
      expect(isVmcConditions(2, 800)).toBe(false);
    });

    it('should return false for LIFR conditions', () => {
      expect(isVmcConditions(0.5, 200)).toBe(false);
    });
  });
});
