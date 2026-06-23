import { describe, expect, test } from 'bun:test';
import { defaultWeatherLocation, visitorWeatherLocation } from '../src/weather';

describe('visitor weather location', () => {
  test('falls back to default city for private IPs', async () => {
    const optionValue = async (name: string, fallback = '') => {
      if (name === 'azure_sidebar_weather_default_city') return '塔什干';
      return fallback;
    };
    const result = await visitorWeatherLocation('127.0.0.1', optionValue);
    expect(result.fallback).toBe(true);
    expect(result.location.city).toBe('塔什干');
  });

  test('default weather location uses configured options', async () => {
    const optionValue = async (name: string, fallback = '') => {
      if (name === 'azure_sidebar_weather_default_city') return '上海';
      if (name === 'azure_sidebar_weather_default_country_code') return 'CN';
      return fallback;
    };
    const location = await defaultWeatherLocation(optionValue);
    expect(location.city).toBe('上海');
    expect(location.country_code).toBe('CN');
  });
});
