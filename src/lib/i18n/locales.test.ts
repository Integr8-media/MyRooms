import ar from './locales/ar.json';
import en from './locales/en.json';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? keys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('locales', () => {
  it('Arabic has exactly the same keys as English', () => {
    expect(keys(ar).sort()).toEqual(keys(en).sort());
  });
});
