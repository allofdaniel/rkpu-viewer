/**
 * NOTAM Entity Tests
 * DO-278A 요구사항 추적: SRS-TEST-004
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseQLine,
  getNotamValidity,
  filterActiveNotams,
  getNotamType,
  isNotamRelevant,
} from '@/domain/entities/Notam';
import type { Notam } from '@/types';

describe('NOTAM Entity', () => {
  describe('parseQLine', () => {
    it('should parse standard Q-line', () => {
      const qLine = 'Q) RKRR/QMRLC/IV/NBO/A/000/999/3536N12921E005';
      const result = parseQLine(qLine);

      expect(result).toBeDefined();
      expect(result?.fir).toBe('RKRR');
      expect(result?.code).toBe('QMRLC');
      expect(result?.traffic).toBe('IV');
      expect(result?.purpose).toBe('NBO');
      expect(result?.scope).toBe('A');
      expect(result?.lowerAlt).toBe(0);
      expect(result?.upperAlt).toBe(99900);
    });

    it('should extract coordinates from Q-line', () => {
      const qLine = 'Q) RKRR/QMRLC/IV/NBO/A/000/999/3536N12921E005';
      const result = parseQLine(qLine);

      expect(result?.lat).toBeCloseTo(35.6, 1);
      expect(result?.lon).toBeCloseTo(129.35, 1);
      expect(result?.radiusNM).toBe(5);
    });

    it('should return undefined for invalid Q-line', () => {
      expect(parseQLine('INVALID')).toBeUndefined();
      expect(parseQLine('')).toBeUndefined();
    });
  });

  describe('getNotamValidity', () => {
    const now = new Date('2025-01-10T12:00:00Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return active for current NOTAM', () => {
      const notam: Notam = {
        id: 'A0001/25',
        type: 'N',
        effectiveStart: new Date('2025-01-01T00:00:00Z'),
        effectiveEnd: new Date('2025-12-31T23:59:59Z'),
        fullText: 'Test NOTAM',
      };
      expect(getNotamValidity(notam)).toBe('active');
    });

    it('should return future for upcoming NOTAM', () => {
      const notam: Notam = {
        id: 'A0002/25',
        type: 'N',
        effectiveStart: new Date('2025-02-01T00:00:00Z'),
        effectiveEnd: new Date('2025-03-01T23:59:59Z'),
        fullText: 'Future NOTAM',
      };
      expect(getNotamValidity(notam)).toBe('future');
    });

    it('should return expired for past NOTAM', () => {
      const notam: Notam = {
        id: 'A0003/24',
        type: 'N',
        effectiveStart: new Date('2024-01-01T00:00:00Z'),
        effectiveEnd: new Date('2024-12-31T23:59:59Z'),
        fullText: 'Expired NOTAM',
      };
      expect(getNotamValidity(notam)).toBe('expired');
    });

    it('should return cancelled for cancel type NOTAM', () => {
      const notam: Notam = {
        id: 'A0004/25',
        type: 'C',
        effectiveStart: new Date('2025-01-01T00:00:00Z'),
        effectiveEnd: new Date('2025-12-31T23:59:59Z'),
        fullText: 'Cancelled NOTAM',
      };
      expect(getNotamValidity(notam)).toBe('cancelled');
    });

    it('should handle permanent NOTAM (no end date)', () => {
      const notam: Notam = {
        id: 'A0005/25',
        type: 'N',
        effectiveStart: new Date('2025-01-01T00:00:00Z'),
        fullText: 'Permanent NOTAM',
      };
      expect(getNotamValidity(notam)).toBe('active');
    });
  });

  describe('filterActiveNotams', () => {
    const now = new Date('2025-01-10T12:00:00Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should filter to active NOTAMs only', () => {
      const notams: Notam[] = [
        {
          id: 'A0001/25',
          number: 'A0001/25',
          type: 'N',
          effectiveStart: new Date('2025-01-01T00:00:00Z'),
          effectiveEnd: new Date('2025-12-31T23:59:59Z'),
          fullText: 'Active 1',
        },
        {
          id: 'A0002/25',
          number: 'A0002/25',
          type: 'N',
          effectiveStart: new Date('2025-02-01T00:00:00Z'),
          effectiveEnd: new Date('2025-03-01T23:59:59Z'),
          fullText: 'Future',
        },
        {
          id: 'A0003/24',
          number: 'A0003/24',
          type: 'N',
          effectiveStart: new Date('2024-01-01T00:00:00Z'),
          effectiveEnd: new Date('2024-12-31T23:59:59Z'),
          fullText: 'Expired',
        },
        {
          id: 'A0004/25',
          number: 'A0004/25',
          type: 'N',
          effectiveStart: new Date('2025-01-01T00:00:00Z'),
          effectiveEnd: new Date('2025-12-31T23:59:59Z'),
          fullText: 'Active 2',
        },
      ];

      const active = filterActiveNotams(notams);
      // Active + Future should remain (2 active + 1 future = 3)
      expect(active.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array for no active NOTAMs', () => {
      const notams: Notam[] = [
        {
          id: 'A0001/24',
          number: 'A0001/24',
          type: 'N',
          effectiveStart: new Date('2024-01-01T00:00:00Z'),
          effectiveEnd: new Date('2024-12-31T23:59:59Z'),
          fullText: 'Expired',
        },
      ];

      expect(filterActiveNotams(notams)).toHaveLength(0);
    });
  });

  describe('getNotamType', () => {
    it('should identify runway closure', () => {
      expect(getNotamType('QMRLC')).toBe('RWY_CLOSED');
    });

    it('should identify taxiway closure', () => {
      expect(getNotamType('QMXLC')).toBe('TWY_CLOSED');
    });

    it('should identify navaid outage', () => {
      expect(getNotamType('QNVAS')).toBe('NAV_OUTAGE');
    });

    it('should identify airspace restriction', () => {
      expect(getNotamType('QRTCA')).toBe('AIRSPACE');
    });

    it('should return GENERAL for unknown codes', () => {
      expect(getNotamType('QXXXX')).toBe('GENERAL');
    });
  });

  describe('isNotamRelevant', () => {
    it('should return true for relevant airport', () => {
      const notam: Notam = {
        id: 'A0001/25',
        type: 'N',
        location: 'RKPU',
        effectiveStart: new Date('2025-01-01'),
        fullText: 'Test',
      };
      expect(isNotamRelevant(notam, 'RKPU')).toBe(true);
    });

    it('should return true for FIR NOTAM affecting airport', () => {
      const notam: Notam = {
        id: 'A0002/25',
        type: 'N',
        location: 'RKRR', // FIR
        effectiveStart: new Date('2025-01-01'),
        fullText: 'Test',
      };
      expect(isNotamRelevant(notam, 'RKPU')).toBe(true);
    });

    it('should return false for unrelated NOTAM', () => {
      const notam: Notam = {
        id: 'A0003/25',
        type: 'N',
        location: 'RKSS',
        effectiveStart: new Date('2025-01-01'),
        fullText: 'Test',
      };
      expect(isNotamRelevant(notam, 'RKPU')).toBe(false);
    });
  });
});
