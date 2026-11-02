import { useMemo, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { IconPlus, IconCalendarEvent, IconUsers, IconMessageOff, IconCheck, IconMapPin } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { flowActionFor } from '@/config/plan';
import type { Treffen, Terminvorschlaege } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import { lookupKey } from '@/lib/formatters';
import { tx, dateFnsLocale, appLabel } from '@/i18n';
import { useClock, gruss, namen } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatCard, StatCardRow } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { Button } from '@/components/ui/button';

type Filter = 'offen' | 'festgelegt' | 'ohne';

interface Option {
  rec: Terminvorschlaege;
  date: Date | null;
  ja: number;
  evtl: number;
  nein: number;
}

interface Meeting {
  rec: Treffen;
  title: string;
  options: Option[];
  participants: number;
  best: Option | null;
  status: string;
  fixed: Date | null;
}

function toDate(s?: string): Date | null {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const { treffen, terminvorschlaege, rueckmeldungen } = data;
  const clock = useClock();
  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type !== 'treffen') return undefined;
      if (lookupKey(top.record.fields.status) !== 'offen') return undefined;
      const go = flowActionFor('treffen', 'status', top.record.record_id, 'termin_festgelegt');
      return go ? { label: tx('Termin festlegen'), onClick: go } : undefined;
    },
  });
  const [filter, setFilter] = useState<Filter | null>('offen');

  const meetings = useMemo<Meeting[]>(() => {
    const countsByOption = new Map<string, { ja: number; evtl: number; nein: number }>();
    const peopleByMeeting = new Map<string, Set<string>>();
    const optionToMeeting = new Map<string, string>();
    terminvorschlaege.forEach(o => {
      const tid = extractRecordId(o.fields.treffen);
      if (tid) optionToMeeting.set(o.record_id, tid);
    });
    rueckmeldungen.forEach(r => {
      const oid = extractRecordId(r.fields.terminvorschlag);
      if (!oid) return;
      const c = countsByOption.get(oid) ?? { ja: 0, evtl: 0, nein: 0 };
      const k = lookupKey(r.fields.antwort);
      if (k === 'kann') c.ja++;
      else if (k === 'kann_evtl') c.evtl++;
      else if (k === 'kann_nicht') c.nein++;
      countsByOption.set(oid, c);
      const tid = optionToMeeting.get(oid);
      if (tid) {
        const set = peopleByMeeting.get(tid) ?? new Set<string>();
        set.add(`${r.fields.teilnehmer_vorname ?? ''} ${r.fields.teilnehmer_nachname ?? ''}`.trim().toLowerCase());
        peopleByMeeting.set(tid, set);
      }
    });
    return treffen.map(rec => {
      const options: Option[] = terminvorschlaege
        .filter(o => extractRecordId(o.fields.treffen) === rec.record_id)
        .map(o => ({ rec: o, date: toDate(o.fields.termin), ...(countsByOption.get(o.record_id) ?? { ja: 0, evtl: 0, nein: 0 }) }))
        .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
      let best: Option | null = null;
      options.forEach(o => {
        if (o.ja + o.evtl === 0) return;
        if (!best || o.ja > best.ja || (o.ja === best.ja && o.evtl > best.evtl)) best = o;
      });
      return {
        rec,
        title: rec.fields.titel ?? '—',
        options,
        participants: peopleByMeeting.get(rec.record_id)?.size ?? 0,
        best,
        status: lookupKey(rec.fields.status) ?? 'offen',
        fixed: toDate(rec.fields.festgelegter_termin),
      };
    }).sort((a, b) => (b.rec.createdat ?? '').localeCompare(a.rec.createdat ?? ''));
  }, [treffen, terminvorschlaege, rueckmeldungen]);

  const open = meetings.filter(m => m.status === 'offen');
  const withoutAnswers = open.filter(m => m.participants === 0);
  const fixedAll = meetings.filter(m => m.status === 'termin_festgelegt');
  const upcomingFixed = fixedAll
    .filter(m => m.fixed && m.fixed >= clock)
    .sort((a, b) => (a.fixed?.getTime() ?? 0) - (b.fixed?.getTime() ?? 0));

  const visible = meetings.filter(m => {
    if (filter === 'offen') return m.status === 'offen';
    if (filter === 'festgelegt') return m.status === 'termin_festgelegt';
    if (filter === 'ohne') return m.status === 'offen' && m.participants === 0;
    return m.status !== 'abgesagt';
  });

  const fmt = (d: Date | null, p: string) => (d ? format(d, p, { locale: dateFnsLocale() }) : '—');
  const toggle = (f: Filter) => setFilter(cur => (cur === f ? null : f));
  const openMeeting = (id: string) => {
    const rec = treffen.find(r => r.record_id === id);
    if (rec) crud.treffen.openDetail(rec);
  };
  const fixAction = (m: Meeting) => {
    const go = flowActionFor('treffen', 'status', m.rec.record_id, 'termin_festgelegt');
    return go ? { label: tx('Festlegen'), onClick: go } : undefined;
  };

  let context: string;
  if (meetings.length === 0) context = tx('Lege dein erstes Treffen an und schlage Termine vor.');
  else if (open.length === 0) context = tx('Alle Treffen haben einen Termin — Zeit für das nächste.');
  else if (withoutAnswers.length > 0) context = tx`Auf „${namen(withoutAnswers.map(m => m.title))}“ hat noch niemand geantwortet.`;
  else context = tx`${namen(open.map(m => m.title))} wartet auf eine Entscheidung.`;

  const fixedLabel = (m: Meeting) => m.fixed ? fmt(m.fixed, 'EEE dd.MM., HH:mm') : tx('ohne Datum');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground">{context}</p>
        </div>
        {crud.treffen.canWrite && (
          <Button onClick={() => crud.treffen.openCreate({ status: 'offen' })}>
            <IconPlus size={16} className="shrink-0" />
            {tx('Neues Treffen')}
          </Button>
        )}
      </div>

      <DashboardGrid
        variant="split"
        kpis={meetings.length > 0 ? (
          <StatCardRow>
            <StatCard
              title={tx('Offene Treffen')}
              value={open.length}
              description={open.length > 0 ? tx('Warten auf einen Termin') : tx('Alles entschieden')}
              icon={<IconCalendarEvent size={18} className="text-muted-foreground" />}
              onClick={() => toggle('offen')}
              active={filter === 'offen'}
            />
            <StatCard
              title={tx('Ohne Antworten')}
              value={withoutAnswers.length}
              description={withoutAnswers.length > 0 ? tx('Link noch verteilen?') : tx('Überall wurde geantwortet')}
              icon={<IconMessageOff size={18} className="text-muted-foreground" />}
              tone={withoutAnswers.length > 0 ? 'warning' : 'default'}
              onClick={() => toggle('ohne')}
              active={filter === 'ohne'}
            />
            <StatCard
              title={tx('Termin festgelegt')}
              value={fixedAll.length}
              description={upcomingFixed.length > 0 ? tx`Nächster: ${fixedLabel(upcomingFixed[0])}` : tx('Kein kommender Termin')}
              icon={<IconCheck size={18} className="text-muted-foreground" />}
              onClick={() => toggle('festgelegt')}
              active={filter === 'festgelegt'}
            />
          </StatCardRow>
        ) : undefined}
        aside={
          <>
            <WorkList
              title={tx('Wartet auf Antworten')}
              items={withoutAnswers.map(m => ({
                id: m.rec.record_id,
                title: m.title,
                secondLine: <span className="text-muted-foreground">{m.options.length === 1 ? tx`1 Terminvorschlag` : tx`${m.options.length} Terminvorschläge`}</span>,
              }))}
              onItemClick={openMeeting}
              empty={{ text: open.length > 0 ? tx('Zu jedem offenen Treffen gibt es Antworten.') : tx('Keine offenen Treffen.') }}
            />
            <WorkList
              title={tx('Kommende Termine')}
              items={upcomingFixed.map(m => ({
                id: m.rec.record_id,
                title: m.title,
                secondLine: <span className="font-medium text-emerald-600">{fixedLabel(m)}</span>,
              }))}
              onItemClick={openMeeting}
              empty={{ text: tx('Noch kein Termin festgelegt.') }}
            />
          </>
        }
        primary={
          <div className="space-y-4 min-w-0">
            {visible.length === 0 && (
              <div className="rounded-[27px] bg-card shadow-sm p-8 text-center space-y-3">
                <IconCalendarEvent size={48} className="mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {meetings.length === 0 ? tx('Noch kein Treffen — schlage deine ersten Termine vor.') : tx('Keine Treffen in dieser Ansicht.')}
                </p>
                {crud.treffen.canWrite && (
                  <Button onClick={() => crud.treffen.openCreate({ status: 'offen' })}>{tx('Erstes Treffen anlegen')}</Button>
                )}
              </div>
            )}
            {visible.map(m => {
              const act = m.status === 'offen' ? fixAction(m) : undefined;
              return (
                <div key={m.rec.record_id} className="rounded-[27px] bg-card shadow-sm p-5 space-y-4 overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button type="button" className="min-w-0 text-left" onClick={() => crud.treffen.openDetail(m.rec)}>
                      <div className="font-semibold truncate">{m.title}</div>
                      <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><IconUsers size={14} className="shrink-0" />{m.participants === 1 ? tx`1 Teilnehmer` : tx`${m.participants} Teilnehmer`}</span>
                        {m.rec.fields.ort && <span className="inline-flex items-center gap-1 min-w-0"><IconMapPin size={14} className="shrink-0" /><span className="truncate">{m.rec.fields.ort}</span></span>}
                        <span className="font-medium">{m.rec.fields.status?.label}</span>
                      </div>
                    </button>
                    {act && <Button size="sm" onClick={act.onClick}>{act.label}</Button>}
                  </div>

                  {m.status === 'termin_festgelegt' && (
                    <div className="text-sm font-medium text-emerald-600">{tx`Festgelegt: ${fixedLabel(m)}`}</div>
                  )}

                  {m.options.length === 0 ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {tx('Noch keine Terminvorschläge.')}
                      {crud.terminvorschlaege.canWrite && (
                        <Button size="sm" variant="outline" onClick={() => crud.terminvorschlaege.openCreate({ treffen: m.rec.record_id })}>{appLabel('terminvorschlaege')} +</Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 text-[11px] uppercase tracking-wide text-muted-foreground px-2">
                        <span>{tx('Terminvorschlag')}</span>
                        <span className="text-right sm:text-left">{tx('Ja · Vielleicht · Nein')}</span>
                      </div>
                      {m.options.map(o => {
                        const total = o.ja + o.evtl + o.nein;
                        const isBest = m.best === o && m.status === 'offen';
                        return (
                          <button
                            type="button"
                            key={o.rec.record_id}
                            onClick={() => crud.terminvorschlaege.openDetail(o.rec)}
                            className={`w-full grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 rounded-xl px-2 py-2 text-left hover:bg-muted/60 ${isBest ? 'bg-emerald-500/10' : ''}`}
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-medium truncate">{fmt(o.date, 'EEE dd.MM.yyyy, HH:mm')}</span>
                              {isBest && <span className="block text-xs text-emerald-600">{tx('Beste Übereinstimmung')}</span>}
                            </span>
                            <span className="flex items-center gap-2 justify-end sm:justify-start min-w-0">
                              <span className="hidden sm:flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                {total > 0 && (
                                  <>
                                    <span className="bg-emerald-500" style={{ width: `${(o.ja / total) * 100}%` }} />
                                    <span className="bg-amber-400" style={{ width: `${(o.evtl / total) * 100}%` }} />
                                    <span className="bg-rose-400" style={{ width: `${(o.nein / total) * 100}%` }} />
                                  </>
                                )}
                              </span>
                              <span className="shrink-0 text-sm tabular-nums">
                                <b className="text-emerald-600">{o.ja}</b> · <b className="text-amber-600">{o.evtl}</b> · <b className="text-rose-500">{o.nein}</b>
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        }
      />
      {crud.surfaces}
    </div>
  );
}
