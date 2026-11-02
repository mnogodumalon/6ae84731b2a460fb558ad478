import type { EnrichedRueckmeldungen, EnrichedTerminvorschlaege } from '@/types/enriched';
import type { Rueckmeldungen, Terminvorschlaege, Treffen } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface TerminvorschlaegeMaps {
  treffenMap: Map<string, Treffen>;
}

export function enrichTerminvorschlaege(
  terminvorschlaege: Terminvorschlaege[],
  maps: TerminvorschlaegeMaps
): EnrichedTerminvorschlaege[] {
  return terminvorschlaege.map(r => ({
    ...r,
    treffenName: resolveDisplay(r.fields.treffen, maps.treffenMap, 'titel'),
  }));
}

interface RueckmeldungenMaps {
  terminvorschlaegeMap: Map<string, Terminvorschlaege>;
}

export function enrichRueckmeldungen(
  rueckmeldungen: Rueckmeldungen[],
  maps: RueckmeldungenMaps
): EnrichedRueckmeldungen[] {
  return rueckmeldungen.map(r => ({
    ...r,
    terminvorschlagName: resolveDisplay(r.fields.terminvorschlag, maps.terminvorschlaegeMap, 'anmerkung'),
  }));
}
