import { describe, it, expect } from 'vitest';
import { CITIES, CITY_DEMAND_PROFILES, getCityDemandProfile } from '../../shared/constants/cities.js';
import { updateAIPrices } from '../engine/aiPriceWar.js';
import { TIRES } from '../../shared/constants/tires.js';

describe('Section 6: Enhanced Market Realism', () => {
  describe('6b: Regional Demand Profiles', () => {
    it('should generate profiles for all cities', () => {
      expect(Object.keys(CITY_DEMAND_PROFILES).length).toBe(CITIES.length);
    });

    it('Rust Belt cities have higher used tire demand', () => {
      const detroit = CITY_DEMAND_PROFILES['detroit_mi'];
      expect(detroit.used_junk).toBeGreaterThan(1.0);
      expect(detroit.used_poor).toBeGreaterThan(1.0);
    });

    it('Rust Belt cities have lower luxury demand', () => {
      const detroit = CITY_DEMAND_PROFILES['detroit_mi'];
      expect(detroit.luxuryTouring).toBeLessThan(1.0);
    });

    it('Sunbelt cities have very low winter demand', () => {
      const miami = CITY_DEMAND_PROFILES['miami_fl'];
      expect(miami.winter).toBeLessThan(0.5);
    });

    it('Sunbelt cities have high all-season demand', () => {
      const miami = CITY_DEMAND_PROFILES['miami_fl'];
      expect(miami.allSeason).toBeGreaterThan(1.0);
    });

    it('Rural/agricultural cities have high tractor demand', () => {
      const somerset = CITY_DEMAND_PROFILES['somerset_pa'];
      expect(somerset.tractor).toBeGreaterThan(1.5);
      expect(somerset.implement).toBeGreaterThan(1.5);
    });

    it('Rural cities have low EV and luxury demand', () => {
      const somerset = CITY_DEMAND_PROFILES['somerset_pa'];
      expect(somerset.evTire).toBeLessThan(0.5);
      expect(somerset.luxuryTouring).toBeLessThan(0.5);
    });

    it('Cold-winter cities have high winter tire demand', () => {
      const buffalo = CITY_DEMAND_PROFILES['buffalo_ny'];
      expect(buffalo.winter).toBeGreaterThan(1.5);
    });
  });

  describe('6c: AI Price Wars', () => {
    it('AI shops lower prices when undercut', () => {
      const shops = [{ id: 's1', prices: { allSeason: 100 } }];
      updateAIPrices(shops, { allSeason: 70 }, null, { inflationIndex: 1.0, players: [] });
      expect(shops[0].prices.allSeason).toBeLessThan(100);
    });

    it('AI shops raise prices when players price high', () => {
      const tireDef = TIRES.allSeason?.def || 80;
      const shops = [{ id: 's1', prices: { allSeason: tireDef - 10 } }];
      updateAIPrices(shops, { allSeason: tireDef + 50 }, null, { inflationIndex: 1.0, players: [] });
      expect(shops[0].prices.allSeason).toBeGreaterThanOrEqual(tireDef - 10);
    });

    it('AI shops respect price floor', () => {
      const shops = [{ id: 's1', prices: { allSeason: 30 } }];
      // Extreme undercut
      updateAIPrices(shops, { allSeason: 10 }, null, { inflationIndex: 1.0, players: [] });
      const tireDef = TIRES.allSeason?.def || 80;
      expect(shops[0].prices.allSeason).toBeGreaterThanOrEqual(Math.round(tireDef * 0.65));
    });

    it('inflation adjusts AI target prices', () => {
      const tireDef = TIRES.allSeason?.def || 80;
      const shops = [{ id: 's1', prices: { allSeason: tireDef } }];
      // With high inflation
      updateAIPrices(shops, { allSeason: tireDef }, null, { inflationIndex: 1.10, players: [] });
      // Price should drift up slightly toward inflated default
      expect(shops[0].prices.allSeason).toBeGreaterThanOrEqual(tireDef);
    });
  });
});
