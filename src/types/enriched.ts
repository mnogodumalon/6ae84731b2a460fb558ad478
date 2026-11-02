import type { Rueckmeldungen, Terminvorschlaege } from './app';

export type EnrichedTerminvorschlaege = Terminvorschlaege & {
  treffenName: string;
};

export type EnrichedRueckmeldungen = Rueckmeldungen & {
  terminvorschlagName: string;
};
