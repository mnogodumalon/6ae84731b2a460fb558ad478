/**
 * EntityCrud — pre-generated CRUD + overlay plumbing for the dashboard.
 * Compose it; NEVER re-roll dialog state, submit handlers, an overlay stack
 * or a RecordOverlayHost in the page — this file owns all of it.
 *
 * API at a glance:
 *   const data = useDashboardData();
 *   const crud = useEntityCrud(data, {
 *     // optional — the ONE semantic slot on the overlay: the record's next
 *     // workflow step. Return undefined for types without one.
 *     footer: (top) => top.type === 'treffen'
 *       ? { label: …, onClick: () => … }
 *       : undefined,
 *   });
 *
 *   `top.type` is the SAME camelCase key as `crud.<entity>` — one spelling
 *   per entity, everywhere in this API.
 *   …
 *   crud.treffen.openCreate({ …defaults })   // create dialog, prefilled — defaults are
 *                                       // shape-tolerant: bare lookup keys / record ids are fine
 *   crud.treffen.openEdit(record)            // edit dialog (recordId + defaults wired)
 *   crud.treffen.openDetail(record)          // record overlay — pass the RAW record,
 *                                       // enrichment is resolved inside
 *   crud.overlay                         // RecordOverlayStack<OverlayItem> for drills:
 *                                       // push / pop / replace / close
 *   crud.enriched.treffen              // the display-ready array for EVERY entity —
 *                                       // Enriched* where relations exist, the raw array
 *                                       // otherwise. Reuse these; never call enrich*()
 *                                       // in the page, and never guess which entity has
 *                                       // one: they all do.
 *   {crud.surfaces}                      // render ONCE at the end of the page JSX:
 *                                       // all entity dialogs + the overlay host
 *
 * Built in (do NOT re-implement): optimistic update + Rückgängig counter-write
 * on edit, fetchAll-on-error, edit-from-overlay, and per-entity overlay bodies
 * (RecordHeader + <{Entity}Details> with every relation reachable and the
 * contextual "+" prefilled; list-field back-references additionally get a
 * "choose existing" picker that links an EXISTING record — built in, do not
 * re-roll). Drag writes (onEventDrop/onCardMove) stay YOURS:
 * optimistic setter first, PATCH in background, undoToast with counter-write.
 *
 * Overlay content per entity (the host renders these — you never compose
 * Details blocks yourself):
 *   treffen: titel, beschreibung, ort, organisator_vorname, organisator_nachname, status, festgelegter_termin  ·  ← terminvorschlaege (list + contextual +)
 *   terminvorschlaege: treffen, termin, anmerkung  ·  → treffen · ← rueckmeldungen (list + contextual +)
 *   rueckmeldungen: teilnehmer_vorname, teilnehmer_nachname, terminvorschlag, antwort, kommentar  ·  → terminvorschlaege
 */
import { useState, useMemo, type ReactNode } from 'react';
import type { Treffen, Terminvorschlaege, Rueckmeldungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { enrichTerminvorschlaege, enrichRueckmeldungen } from '@/lib/enrich';
import type { EnrichedTerminvorschlaege, EnrichedRueckmeldungen } from '@/types/enriched';
import { useDashboardData } from '@/hooks/useDashboardData';
import {
  useRecordOverlayStack, RecordOverlayHost, RecordHeader,
  type RecordOverlayStack,
} from '@/components/widgets/RecordView';
import { TreffenDialog, type TreffenDialogDefaults } from '@/components/dialogs/TreffenDialog';
import { TreffenDetails } from '@/components/details/TreffenDetails';
import { TerminvorschlaegeDialog, type TerminvorschlaegeDialogDefaults } from '@/components/dialogs/TerminvorschlaegeDialog';
import { TerminvorschlaegeDetails } from '@/components/details/TerminvorschlaegeDetails';
import { RueckmeldungenDialog, type RueckmeldungenDialogDefaults } from '@/components/dialogs/RueckmeldungenDialog';
import { RueckmeldungenDetails } from '@/components/details/RueckmeldungenDetails';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { t, appLabel } from '@/i18n';
import { undoToast } from '@/lib/polish';
import { usePermissions } from '@/lib/permissions';
import { toast } from 'sonner';
import { formatDate } from '@/lib/formatters';

// The overlay union — one branch per entity, `record` typed the way the data
// flows: Enriched* where enrichment exists, the raw record type otherwise.
// The host resolves enrichment itself; pages pass raw records everywhere.
export type OverlayItem =
  | { type: 'treffen'; record: Treffen }
  | { type: 'terminvorschlaege'; record: EnrichedTerminvorschlaege }
  | { type: 'rueckmeldungen'; record: EnrichedRueckmeldungen };

/** The useDashboardData() return — pass it in, never re-fetch inside. */
export type EntityCrudData = ReturnType<typeof useDashboardData>;

export interface EntityCrudOptions {
  /** Per-type overlay footer — the record's next workflow step. */
  footer?: (top: OverlayItem) => ReactNode | { label: ReactNode; onClick: () => void } | undefined;
  placement?: 'side' | 'center';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface EntityCrudApi<TRecord, TDefaults> {
  /** Open the create dialog, optionally prefilled (shape-tolerant defaults). */
  openCreate: (defaults?: TDefaults) => void;
  /** Open the edit dialog for a record (recordId + defaults are wired). */
  openEdit: (record: TRecord) => void;
  /** Open the record overlay (raw record is fine — enrichment resolved inside). */
  openDetail: (record: TRecord) => void;
  /** May the signed-in user create/change records of this list? (the
   *  platform's rights — show a „+ Neu“ only when true; openCreate/openEdit
   *  refuse with a notice otherwise). */
  canWrite: boolean;
}

export interface EntityCrud {
  /** The overlay stack for drills: push / pop / replace / close. */
  overlay: RecordOverlayStack<OverlayItem>;
  /** Render ONCE at the end of the page JSX — all dialogs + the overlay host. */
  surfaces: ReactNode;
  treffen: EntityCrudApi<Treffen, TreffenDialogDefaults>;
  terminvorschlaege: EntityCrudApi<Terminvorschlaege, TerminvorschlaegeDialogDefaults>;
  rueckmeldungen: EntityCrudApi<Rueckmeldungen, RueckmeldungenDialogDefaults>;
  /** The display-ready array per entity: Enriched* where an enrich function
   *  exists, the raw array otherwise. One key per entity so no page has to
   *  know which is which. Reuse these; never re-enrich in the page. */
  enriched: { treffen: Treffen[]; terminvorschlaege: EnrichedTerminvorschlaege[]; rueckmeldungen: EnrichedRueckmeldungen[] };
}

export function useEntityCrud(data: EntityCrudData, options?: EntityCrudOptions): EntityCrud {
  const overlay = useRecordOverlayStack<OverlayItem>();
  // the platform's rights of the signed-in user (lib/permissions.ts) — unknown = allowed
  const perms = usePermissions();
  const refuse = () => { toast.error(t('perm_denied_title'), { description: t('perm_denied_desc') }); };
  const [treffenDialog, setTreffenDialog] = useState<{ defaults?: TreffenDialogDefaults; editing?: Treffen } | null>(null);
  const [terminvorschlaegeDialog, setTerminvorschlaegeDialog] = useState<{ defaults?: TerminvorschlaegeDialogDefaults; editing?: Terminvorschlaege } | null>(null);
  const [rueckmeldungenDialog, setRueckmeldungenDialog] = useState<{ defaults?: RueckmeldungenDialogDefaults; editing?: Rueckmeldungen } | null>(null);
  const enrichedTerminvorschlaege = useMemo(() => enrichTerminvorschlaege(data.terminvorschlaege, { treffenMap: data.treffenMap }), [data.terminvorschlaege, data.treffenMap]);
  const enrichedRueckmeldungen = useMemo(() => enrichRueckmeldungen(data.rueckmeldungen, { terminvorschlaegeMap: data.terminvorschlaegeMap }), [data.rueckmeldungen, data.terminvorschlaegeMap]);

  function detailTreffen(record: Treffen, push = false) {
    const item: OverlayItem = { type: 'treffen', record };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitTreffen(fields: Treffen['fields']) {
    const editing = treffenDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setTreffen(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateTreffenEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('treffen')} — ${t('crud_updated')}`, async () => {
        data.setTreffen(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateTreffenEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createTreffenEntry(fields);
      undoToast(`${appLabel('treffen')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailTerminvorschlaege(record: Terminvorschlaege, push = false) {
    const rec = enrichedTerminvorschlaege.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'terminvorschlaege', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitTerminvorschlaege(fields: Terminvorschlaege['fields']) {
    const editing = terminvorschlaegeDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setTerminvorschlaege(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateTerminvorschlaegeEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('terminvorschlaege')} — ${t('crud_updated')}`, async () => {
        data.setTerminvorschlaege(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateTerminvorschlaegeEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createTerminvorschlaegeEntry(fields);
      undoToast(`${appLabel('terminvorschlaege')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailRueckmeldungen(record: Rueckmeldungen, push = false) {
    const rec = enrichedRueckmeldungen.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'rueckmeldungen', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitRueckmeldungen(fields: Rueckmeldungen['fields']) {
    const editing = rueckmeldungenDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setRueckmeldungen(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateRueckmeldungenEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('rueckmeldungen')} — ${t('crud_updated')}`, async () => {
        data.setRueckmeldungen(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateRueckmeldungenEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createRueckmeldungenEntry(fields);
      undoToast(`${appLabel('rueckmeldungen')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  const surfaces = (
    <>
      <TreffenDialog
        open={treffenDialog !== null}
        onClose={() => setTreffenDialog(null)}
        onSubmit={submitTreffen}
        defaultValues={treffenDialog?.defaults}
        recordId={treffenDialog?.editing?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Treffen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Treffen']}
      />
      <TerminvorschlaegeDialog
        open={terminvorschlaegeDialog !== null}
        onClose={() => setTerminvorschlaegeDialog(null)}
        onSubmit={submitTerminvorschlaege}
        defaultValues={terminvorschlaegeDialog?.defaults}
        recordId={terminvorschlaegeDialog?.editing?.record_id}
        treffenList={data.treffen}
        enablePhotoScan={AI_PHOTO_SCAN['Terminvorschlaege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Terminvorschlaege']}
      />
      <RueckmeldungenDialog
        open={rueckmeldungenDialog !== null}
        onClose={() => setRueckmeldungenDialog(null)}
        onSubmit={submitRueckmeldungen}
        defaultValues={rueckmeldungenDialog?.defaults}
        recordId={rueckmeldungenDialog?.editing?.record_id}
        terminvorschlaegeList={data.terminvorschlaege}
        enablePhotoScan={AI_PHOTO_SCAN['Rueckmeldungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Rueckmeldungen']}
      />
      <RecordOverlayHost
        overlay={overlay}
        placement={options?.placement}
        size={options?.size}
        footer={options?.footer}
        render={(top) => {
          if (top.type === 'treffen') {
            return (
              <>
                <RecordHeader title={top.record.fields.titel ?? appLabel('treffen')} subtitle={top.record.fields.festgelegter_termin ? formatDate(top.record.fields.festgelegter_termin) : undefined} />
                <TreffenDetails
                  record={top.record}
                  terminvorschlaegeList={data.terminvorschlaege}
                  onOpenTerminvorschlaege={(r) => detailTerminvorschlaege(r, true)}
                  onAddTerminvorschlaege={perms.canWrite('terminvorschlaege') ? () => setTerminvorschlaegeDialog({ defaults: { treffen: createRecordUrl(APP_IDS.TREFFEN, top.record.record_id) } }) : undefined}
                />
              </>
            );
          }
          if (top.type === 'terminvorschlaege') {
            return (
              <>
                <RecordHeader title={top.record.fields.anmerkung ?? appLabel('terminvorschlaege')} subtitle={top.record.fields.termin ? formatDate(top.record.fields.termin) : undefined} />
                <TerminvorschlaegeDetails
                  record={top.record}
                  treffenList={data.treffen}
                  onOpenTreffen={(r) => detailTreffen(r, true)}
                  rueckmeldungenList={data.rueckmeldungen}
                  onOpenRueckmeldungen={(r) => detailRueckmeldungen(r, true)}
                  onAddRueckmeldungen={perms.canWrite('rueckmeldungen') ? () => setRueckmeldungenDialog({ defaults: { terminvorschlag: createRecordUrl(APP_IDS.TERMINVORSCHLAEGE, top.record.record_id) } }) : undefined}
                />
              </>
            );
          }
          if (top.type === 'rueckmeldungen') {
            return (
              <>
                <RecordHeader title={top.record.fields.teilnehmer_vorname ?? appLabel('rueckmeldungen')} subtitle={undefined} />
                <RueckmeldungenDetails
                  record={top.record}
                  terminvorschlaegeList={data.terminvorschlaege}
                  onOpenTerminvorschlaege={(r) => detailTerminvorschlaege(r, true)}
                />
              </>
            );
          }
          return null;
        }}
        canEdit={(top) => {
          if (top.type === 'treffen') return perms.canWrite('treffen');
          if (top.type === 'terminvorschlaege') return perms.canWrite('terminvorschlaege');
          if (top.type === 'rueckmeldungen') return perms.canWrite('rueckmeldungen');
          return true;
        }}
        onEdit={(top) => {
          overlay.close();
          if (top.type === 'treffen') setTreffenDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'terminvorschlaege') setTerminvorschlaegeDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'rueckmeldungen') setRueckmeldungenDialog({ editing: top.record, defaults: top.record.fields });
        }}
      />
    </>
  );

  return {
    overlay,
    surfaces,
    treffen: {
      openCreate: (defaults?: TreffenDialogDefaults) => (perms.canWrite('treffen') ? setTreffenDialog({ defaults }) : refuse()),
      openEdit: (record: Treffen) => (perms.canWrite('treffen') ? setTreffenDialog({ editing: record, defaults: record.fields }) : refuse()),
      openDetail: (record: Treffen) => detailTreffen(record, false),
      canWrite: perms.canWrite('treffen'),
    },
    terminvorschlaege: {
      openCreate: (defaults?: TerminvorschlaegeDialogDefaults) => (perms.canWrite('terminvorschlaege') ? setTerminvorschlaegeDialog({ defaults }) : refuse()),
      openEdit: (record: Terminvorschlaege) => (perms.canWrite('terminvorschlaege') ? setTerminvorschlaegeDialog({ editing: record, defaults: record.fields }) : refuse()),
      openDetail: (record: Terminvorschlaege) => detailTerminvorschlaege(record, false),
      canWrite: perms.canWrite('terminvorschlaege'),
    },
    rueckmeldungen: {
      openCreate: (defaults?: RueckmeldungenDialogDefaults) => (perms.canWrite('rueckmeldungen') ? setRueckmeldungenDialog({ defaults }) : refuse()),
      openEdit: (record: Rueckmeldungen) => (perms.canWrite('rueckmeldungen') ? setRueckmeldungenDialog({ editing: record, defaults: record.fields }) : refuse()),
      openDetail: (record: Rueckmeldungen) => detailRueckmeldungen(record, false),
      canWrite: perms.canWrite('rueckmeldungen'),
    },
    enriched: { treffen: data.treffen, terminvorschlaege: enrichedTerminvorschlaege, rueckmeldungen: enrichedRueckmeldungen },
  };
}
