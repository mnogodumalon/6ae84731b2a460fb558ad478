import type { Treffen, Terminvorschlaege } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';
import { usePermissions } from '@/lib/permissions';

export interface TreffenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Treffen;
  /** 1:N „Terminvorschläge" (treffen): VOLLE Liste — der Block filtert auf diesen Record. */
  terminvorschlaegeList: Terminvorschlaege[];
  /** Zeilen-Klick → overlay.push auf das Terminvorschlaege-Detail (nie der Edit-Dialog). */
  onOpenTerminvorschlaege: (record: Terminvorschlaege) => void;
  /** Kontextuelles „+": öffnet den Terminvorschlaege-Dialog mit diesem Record vorgesetzt. */
  onAddTerminvorschlaege?: () => void;
}

export function TreffenDetails({
  record,
  terminvorschlaegeList,
  onOpenTerminvorschlaege,
  onAddTerminvorschlaege,
}: TreffenDetailsProps) {
  // attachments are a write to this record — read-only without the platform right
  const perms = usePermissions();
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('treffen', 'titel')} value={record.fields.titel} format="text" />
        <RecordField label={fieldLabel('treffen', 'beschreibung')} value={record.fields.beschreibung} format="longtext" className="md:col-span-2" />
        <RecordField label={fieldLabel('treffen', 'ort')} value={record.fields.ort} format="text" />
        <RecordField label={fieldLabel('treffen', 'organisator_vorname')} value={record.fields.organisator_vorname} format="text" />
        <RecordField label={fieldLabel('treffen', 'organisator_nachname')} value={record.fields.organisator_nachname} format="text" />
        <RecordField label={fieldLabel('treffen', 'status')} value={record.fields.status} format="pill" />
        <RecordField label={fieldLabel('treffen', 'festgelegter_termin')} value={record.fields.festgelegter_termin} format="datetime" />
      </RecordSection>

      <SatelliteSection
        title={appLabel('terminvorschlaege')}
        items={terminvorschlaegeList.filter(r => extractRecordId(r.fields.treffen) === record.record_id)}
        map={r => ({ name: r.fields.anmerkung ?? appLabel('terminvorschlaege'), meta: r.fields.termin })}
        onOpen={onOpenTerminvorschlaege}
        onAdd={onAddTerminvorschlaege}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.TREFFEN} recordId={record.record_id} readOnly={!perms.canWrite('treffen')} />
    </>
  );
}
