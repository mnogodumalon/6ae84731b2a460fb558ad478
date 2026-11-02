import type { Terminvorschlaege, Treffen, Rueckmeldungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';
import { usePermissions } from '@/lib/permissions';

export interface TerminvorschlaegeDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Terminvorschlaege;
  /** N:1-Ziel „Treffen": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  treffenList: Treffen[];
  /** Klick auf die Treffen-Relation → overlay.push auf dessen Detail. */
  onOpenTreffen?: (record: Treffen) => void;
  /** 1:N „Rückmeldungen" (terminvorschlag): VOLLE Liste — der Block filtert auf diesen Record. */
  rueckmeldungenList: Rueckmeldungen[];
  /** Zeilen-Klick → overlay.push auf das Rueckmeldungen-Detail (nie der Edit-Dialog). */
  onOpenRueckmeldungen: (record: Rueckmeldungen) => void;
  /** Kontextuelles „+": öffnet den Rueckmeldungen-Dialog mit diesem Record vorgesetzt. */
  onAddRueckmeldungen?: () => void;
}

export function TerminvorschlaegeDetails({
  record,
  treffenList,
  onOpenTreffen,
  rueckmeldungenList,
  onOpenRueckmeldungen,
  onAddRueckmeldungen,
}: TerminvorschlaegeDetailsProps) {
  // attachments are a write to this record — read-only without the platform right
  const perms = usePermissions();
  const treffenTarget = treffenList.find(r => r.record_id === extractRecordId(record.fields.treffen));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('terminvorschlaege', 'termin')} value={record.fields.termin} format="datetime" />
        <RecordField label={fieldLabel('terminvorschlaege', 'anmerkung')} value={record.fields.anmerkung} format="text" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={1}>
        <RecordRelation
          label={fieldLabel('terminvorschlaege', 'treffen')}
          name={treffenTarget?.fields.titel ?? '—'}
          meta={[treffenTarget?.fields.ort, treffenTarget?.fields.organisator_vorname].filter(Boolean).join(' · ') || undefined}
          onClick={treffenTarget && onOpenTreffen ? () => onOpenTreffen!(treffenTarget!) : undefined}
        />
      </RecordSection>

      <SatelliteSection
        title={appLabel('rueckmeldungen')}
        items={rueckmeldungenList.filter(r => extractRecordId(r.fields.terminvorschlag) === record.record_id)}
        map={r => ({ name: r.fields.teilnehmer_vorname ?? appLabel('rueckmeldungen'), meta: undefined })}
        onOpen={onOpenRueckmeldungen}
        onAdd={onAddRueckmeldungen}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.TERMINVORSCHLAEGE} recordId={record.record_id} readOnly={!perms.canWrite('terminvorschlaege')} />
    </>
  );
}
