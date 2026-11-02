import type { Rueckmeldungen, Terminvorschlaege } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { usePermissions } from '@/lib/permissions';

export interface RueckmeldungenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Rueckmeldungen;
  /** N:1-Ziel „Terminvorschlaege": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  terminvorschlaegeList: Terminvorschlaege[];
  /** Klick auf die Terminvorschlaege-Relation → overlay.push auf dessen Detail. */
  onOpenTerminvorschlaege?: (record: Terminvorschlaege) => void;
}

export function RueckmeldungenDetails({
  record,
  terminvorschlaegeList,
  onOpenTerminvorschlaege,
}: RueckmeldungenDetailsProps) {
  // attachments are a write to this record — read-only without the platform right
  const perms = usePermissions();
  const terminvorschlagTarget = terminvorschlaegeList.find(r => r.record_id === extractRecordId(record.fields.terminvorschlag));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('rueckmeldungen', 'teilnehmer_vorname')} value={record.fields.teilnehmer_vorname} format="text" />
        <RecordField label={fieldLabel('rueckmeldungen', 'teilnehmer_nachname')} value={record.fields.teilnehmer_nachname} format="text" />
        <RecordField label={fieldLabel('rueckmeldungen', 'antwort')} value={record.fields.antwort} format="pill" />
        <RecordField label={fieldLabel('rueckmeldungen', 'kommentar')} value={record.fields.kommentar} format="longtext" className="md:col-span-2" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={1}>
        <RecordRelation
          label={fieldLabel('rueckmeldungen', 'terminvorschlag')}
          name={terminvorschlagTarget?.fields.anmerkung ?? '—'}
          meta={undefined}
          onClick={terminvorschlagTarget && onOpenTerminvorschlaege ? () => onOpenTerminvorschlaege!(terminvorschlagTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.RUECKMELDUNGEN} recordId={record.record_id} readOnly={!perms.canWrite('rueckmeldungen')} />
    </>
  );
}
