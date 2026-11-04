/**
 * Text for each language, looked up by key. Give each language a table of keys, pass the tables in, and call `t`.
 * A key missing in the chosen language falls back to the first language. A key missing everywhere is shown as the
 * key itself, so it stands out on screen.
 *
 * Declare the tables `as const` and a misspelled key is a compile error.
 */

export type StringTables = Record<string, Record<string, string>>;
export type LocaleValues = Record<string, string | number>;

/** Every key that appears in any language. */
export type TextKey<T extends StringTables> = { [L in keyof T]: keyof T[L] }[keyof T] & string;

export interface Localizer<T extends StringTables> {
  /** The language in use. */
  readonly locale: keyof T & string;
  /** Every language, the first one being the fallback. */
  readonly locales: (keyof T & string)[];
  /** Switches language. Throws for a language that has no table. */
  setLocale(locale: keyof T & string): void;
  /** The text for `key`. `{name}` placeholders are replaced from `values`; unknown placeholders stay as they are. */
  t(key: TextKey<T>, values?: LocaleValues): string;
}

export function createLocalizer<T extends StringTables>(tables: T, initial?: keyof T & string): Localizer<T> {
  const locales = Object.keys(tables) as (keyof T & string)[];
  if (locales.length === 0) throw new Error('A localizer needs at least one language');
  const fallback = locales[0];
  const has = (object: object, key: string) => Object.hasOwn(object, key);
  let current = initial ?? fallback;
  if (!has(tables, current)) throw new Error(`Unknown language: ${current}`);
  const lookup = (locale: string, key: string): string | undefined => (has(tables[locale], key) ? tables[locale][key] : undefined);
  return {
    get locale() {
      return current;
    },
    locales,
    setLocale(locale) {
      if (!has(tables, locale)) throw new Error(`Unknown language: ${locale}`);
      current = locale;
    },
    t(key, values) {
      const text = lookup(current, key) ?? lookup(fallback, key) ?? key;
      if (!values) return text;
      return text.replace(/\{(\w+)\}/g, (match, name: string) => (has(values, name) ? String(values[name]) : match));
    },
  };
}
