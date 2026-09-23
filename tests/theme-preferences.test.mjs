import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HD_THEME_STORAGE_KEY,
  normalizeHDThemePreference,
  readHDThemePreference,
  resolveHDTheme,
  writeHDThemePreference,
} from '../src/design-system/themePreferences.js';

test('system appearance follows the operating-system color preference', () => {
  assert.equal(resolveHDTheme('system', false), 'light');
  assert.equal(resolveHDTheme('system', true), 'dark');
});

test('explicit light and dark choices override the operating system', () => {
  assert.equal(resolveHDTheme('light', true), 'light');
  assert.equal(resolveHDTheme('dark', false), 'dark');
});

test('only the three supported appearance choices are accepted', () => {
  assert.equal(normalizeHDThemePreference('light'), 'light');
  assert.equal(normalizeHDThemePreference('dark'), 'dark');
  assert.equal(normalizeHDThemePreference('system'), 'system');
  assert.equal(normalizeHDThemePreference('sepia'), 'system');
  assert.equal(normalizeHDThemePreference(null), 'system');
});

test('appearance is persisted under a device-local preference key', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(readHDThemePreference(storage), 'system');
  assert.equal(writeHDThemePreference('dark', storage), 'dark');
  assert.equal(values.get(HD_THEME_STORAGE_KEY), 'dark');
  assert.equal(readHDThemePreference(storage), 'dark');
});

test('unavailable storage does not prevent choosing an appearance for the session', () => {
  const storage = {
    getItem() { throw new Error('storage blocked'); },
    setItem() { throw new Error('storage blocked'); },
  };
  assert.equal(readHDThemePreference(storage), 'system');
  assert.equal(writeHDThemePreference('dark', storage), 'dark');
});
