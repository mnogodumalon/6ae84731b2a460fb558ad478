import { lookupLabel } from '@/i18n';

// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
/** A raw record URL (applookup reference). NEVER render this directly
 *  in JSX — it is a URL, not a display value. Show the enriched `*Name`
 *  field or resolve it via the entity map instead. Assignable to/from
 *  string everywhere; the `& {}` keeps the alias NAME visible in tsc
 *  error messages (a plain primitive alias gets normalized away). */
export type RecordUrl = string & {};
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface Treffen {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    titel?: string;
    beschreibung?: string;
    ort?: string;
    organisator_vorname?: string;
    organisator_nachname?: string;
    status?: LookupValue;
    festgelegter_termin?: string; // Format: YYYY-MM-DD oder ISO String
  };
}

export interface Terminvorschlaege {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    treffen?: RecordUrl; // applookup -> URL zu 'Treffen' Record
    termin?: string; // Format: YYYY-MM-DD oder ISO String
    anmerkung?: string;
  };
}

export interface Rueckmeldungen {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    teilnehmer_vorname?: string;
    teilnehmer_nachname?: string;
    terminvorschlag?: RecordUrl; // applookup -> URL zu 'Terminvorschlaege' Record
    antwort?: LookupValue;
    kommentar?: string;
  };
}

export const APP_IDS = {
  TREFFEN: '6ae8471aa15b5146b6458da6',
  TERMINVORSCHLAEGE: '6ae8471fbb4a2d9f69dd24e1',
  RUECKMELDUNGEN: '6ae84720ea391faafe2b4611',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'treffen': {
    status: [{ key: "offen", get label() { return lookupLabel('treffen', 'status', "offen") ?? "Offen"; } }, { key: "termin_festgelegt", get label() { return lookupLabel('treffen', 'status', "termin_festgelegt") ?? "Termin festgelegt"; } }, { key: "abgesagt", get label() { return lookupLabel('treffen', 'status', "abgesagt") ?? "Abgesagt"; } }],
  },
  'rueckmeldungen': {
    antwort: [{ key: "kann", get label() { return lookupLabel('rueckmeldungen', 'antwort', "kann") ?? "Ja, ich kann"; } }, { key: "kann_evtl", get label() { return lookupLabel('rueckmeldungen', 'antwort', "kann_evtl") ?? "Vielleicht"; } }, { key: "kann_nicht", get label() { return lookupLabel('rueckmeldungen', 'antwort', "kann_nicht") ?? "Nein, ich kann nicht"; } }],
  },
};

// Optimistic LookupValue writes: never re-type a label — resolve the schema
// option instead (its label is a locale-aware getter; falls back to the key).
// WRONG: status: { key: 'offen', label: 'Offen' }   (frozen in one language)
// RIGHT: status: lookupOption('<appKey>', 'status', 'offen')
export function lookupOption(app: string, field: string, key: string): LookupValue {
  return LOOKUP_OPTIONS[app]?.[field]?.find(o => o.key === key) ?? { key, label: key };
}

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'treffen': {
    'titel': 'string/text',
    'beschreibung': 'string/textarea',
    'ort': 'string/text',
    'organisator_vorname': 'string/text',
    'organisator_nachname': 'string/text',
    'status': 'lookup/radio',
    'festgelegter_termin': 'date/datetimeminute',
  },
  'terminvorschlaege': {
    'treffen': 'applookup/select',
    'termin': 'date/datetimeminute',
    'anmerkung': 'string/text',
  },
  'rueckmeldungen': {
    'teilnehmer_vorname': 'string/text',
    'teilnehmer_nachname': 'string/text',
    'terminvorschlag': 'applookup/select',
    'antwort': 'lookup/radio',
    'kommentar': 'string/textarea',
  },
};

export const HUB_TOPOLOGY: Record<string, { field: string; entity: string }[]> = {
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateTreffen = StripLookup<Treffen['fields']>;
export type CreateTerminvorschlaege = StripLookup<Terminvorschlaege['fields']>;
export type CreateRueckmeldungen = StripLookup<Rueckmeldungen['fields']>;