import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import {
  useStepForm, useJourneySubmit, useRecordSearch, fieldText, fieldRef, recordIdOf, optionsOf,
  type JourneyRecord, type JourneyPort, type SummaryItem,
} from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { Bound } from '@/components/blocks/Bound';
import { Textarea } from '@/components/ui/textarea';
import { tx, dateFnsLocale } from '@/i18n';

type Answer = { antwort: string | null; kommentar: string };

function formatTermin(iso: string): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'EEEE, dd.MM.yyyy · HH:mm', { locale: dateFnsLocale() });
  } catch {
    return iso;
  }
}

function Inner({ port }: { port: JourneyPort }) {
  const treffenSearch = useRecordSearch(port, 'treffen', {
    searchFields: ['titel', 'ort'],
    toItem: (r: JourneyRecord) => ({
      id: r.id,
      title: fieldText(r, 'titel'),
      subtitle: [fieldText(r, 'ort'), `${fieldText(r, 'organisator_vorname')} ${fieldText(r, 'organisator_nachname')}`.trim()]
        .filter(Boolean).join(' · '),
    }),
  });
  const [proposals, setProposals] = useState<JourneyRecord[]>([]);
  const [propsLoaded, setPropsLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [attempted, setAttempted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const answersRef = useRef(answers);
  answersRef.current = answers;

  useEffect(() => {
    let alive = true;
    port.list('terminvorschlaege', { limit: 500 })
      .then(list => { if (alive) { setProposals(list); setPropsLoaded(true); } })
      .catch(() => { if (alive) setPropsLoaded(true); });
    return () => { alive = false; };
  }, [port]);

  const treffenRecords = treffenSearch.records;
  const multiple = treffenRecords.length > 1;
  const activeId = selected ?? (treffenRecords.length === 1 ? treffenRecords[0].id : null);
  const activeTreffen = treffenRecords.find(r => r.id === activeId) ?? null;

  const myProposals = useMemo(
    () => proposals
      .filter(p => recordIdOf(fieldRef(p, 'treffen')) === activeId)
      .sort((a, b) => fieldText(a, 'termin').localeCompare(fieldText(b, 'termin'))),
    [proposals, activeId],
  );

  const f = useStepForm('rueckmeldungen', {
    fields: ['teilnehmer_vorname', 'teilnehmer_nachname'],
    required: { teilnehmer_vorname: true, teilnehmer_nachname: true },
    steps: { teilnehmer_vorname: 2, teilnehmer_nachname: 2 },
    autoComplete: true,
  });
  const antwortOptions = optionsOf('rueckmeldungen', 'antwort');

  const rowFor = (p: JourneyRecord) => {
    const a = answersRef.current[p.id];
    const kommentar = a?.kommentar.trim();
    return {
      terminvorschlag: p.id,
      antwort: a?.antwort ?? '',
      ...(kommentar ? { kommentar } : {}),
    };
  };

  const submit = useJourneySubmit(port, [{
    key: 'rueckmeldungen',
    entity: 'rueckmeldungen',
    form: f,
    primary: true,
    // the first answered proposal; run() writes one record per answered proposal
    values: () => {
      const p = myProposals.find(x => answersRef.current[x.id]?.antwort);
      if (!p) return {};
      const row = rowFor(p);
      return { terminvorschlag: row.terminvorschlag, antwort: row.antwort };
    },
    run: async (ctx) => {
      let first: JourneyRecord | undefined;
      for (const p of myProposals) {
        if (!answersRef.current[p.id]?.antwort) continue;
        const created = await ctx.port.create('rueckmeldungen', {
          teilnehmer_vorname: f.get('teilnehmer_vorname'),
          teilnehmer_nachname: f.get('teilnehmer_nachname'),
          ...rowFor(p),
        });
        if (!first) first = created;
      }
      return first;
    },
  }], { draftKey: 'termin-abstimmen' });

  const setAnswer = (id: string, patch: Partial<Answer>) =>
    setAnswers(prev => {
      const cur: Answer = prev[id] ?? { antwort: null, kommentar: '' };
      return { ...prev, [id]: { ...cur, ...patch } };
    });

  const answeredCount = myProposals.filter(p => answers[p.id]?.antwort).length;

  const summaryItems: SummaryItem[] = myProposals.flatMap(p => {
    const a = answers[p.id];
    if (!a?.antwort) return [];
    const label = antwortOptions.find(o => o.key === a.antwort)?.label ?? a.antwort;
    return [{
      key: `antwort:${p.id}`,
      label: formatTermin(fieldText(p, 'termin')),
      value: a.kommentar.trim() ? `${label} — ${a.kommentar.trim()}` : label,
      step: 2,
    }];
  });

  const steps = [
    { label: tx('Treffen'), enabledIf: multiple },
    { label: tx('Deine Antworten') },
    { label: tx('Prüfen') },
  ];

  if (treffenSearch.select.loading || !propsLoaded) {
    return <p className="text-sm text-muted-foreground">{tx('Lädt …')}</p>;
  }
  if (treffenRecords.length === 0) {
    return <p className="text-sm text-muted-foreground">{tx('Aktuell gibt es kein offenes Treffen zum Abstimmen.')}</p>;
  }

  return (
    <IntentWizardShell
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      back={false}
      forms={[f]}
      draftKey="termin-abstimmen"
    >
      {step === 1 && (
        <>
          <EntitySelectStep
            {...treffenSearch.select}
            selectedId={selected}
            onSelect={id => { setSelected(id); setAnswers({}); }}
            avatar="none"
          />
          <StepNav hideBack nextStepLabel={tx('Deine Antworten')} onNext={() => (activeId ? true : tx('Bitte wähle ein Treffen aus.'))} />
        </>
      )}
      {step === 2 && activeTreffen && (
        <div className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{fieldText(activeTreffen, 'titel')}</h2>
            {fieldText(activeTreffen, 'beschreibung') && (
              <p className="text-sm text-muted-foreground whitespace-pre-line">{fieldText(activeTreffen, 'beschreibung')}</p>
            )}
            {fieldText(activeTreffen, 'ort') && (
              <p className="text-sm text-muted-foreground">{tx('Ort')}: {fieldText(activeTreffen, 'ort')}</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Bound form={f} name="teilnehmer_vorname" />
            <Bound form={f} name="teilnehmer_nachname" />
          </div>
          {myProposals.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tx('Für dieses Treffen gibt es noch keine Terminvorschläge.')}</p>
          ) : (
            <div className="space-y-4">
              {myProposals.map(p => {
                const a = answers[p.id] ?? { antwort: null, kommentar: '' };
                return (
                  <div key={p.id} className="rounded-xl border p-4 space-y-3 overflow-hidden">
                    <div className="min-w-0">
                      <div className="font-medium">{formatTermin(fieldText(p, 'termin'))}</div>
                      {fieldText(p, 'anmerkung') && (
                        <div className="text-sm text-muted-foreground">{fieldText(p, 'anmerkung')}</div>
                      )}
                    </div>
                    <ChoiceGroup
                      id={`antwort-${p.id}`}
                      value={a.antwort}
                      onChange={key => setAnswer(p.id, { antwort: key })}
                      options={antwortOptions}
                      required
                      invalid={!a.antwort && attempted}
                    />
                    <Textarea
                      rows={2}
                      value={a.kommentar}
                      onChange={e => setAnswer(p.id, { kommentar: e.target.value })}
                      placeholder={tx('Kommentar (optional)')}
                      maxLength={4000}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <StepNav
            hideBack={!multiple}
            onBack={() => setStep(1)}
            nextStepLabel={tx('Prüfen')}
            onNext={() => {
              setAttempted(true);
              if (!f.validate(['teilnehmer_vorname', 'teilnehmer_nachname'])) return false;
              if (myProposals.length === 0) return tx('Für dieses Treffen gibt es noch keine Terminvorschläge.');
              if (answeredCount < myProposals.length) return tx('Bitte wähle bei jedem Termin Ja, Vielleicht oder Nein.');
              return true;
            }}
          />
        </div>
      )}
      {step === 3 && !submit.done && (
        <SummaryStep
          forms={[f]}
          submit={submit}
          items={summaryItems}
          whatHappensNext={tx('Der Organisator sieht deine Rückmeldung und legt danach den Termin fest.')}
        />
      )}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[f]}
          title={tx('Danke für deine Rückmeldung!')}
          facts={summaryItems.map(i => ({ label: i.label, value: i.value }))}
        />
      )}
    </IntentWizardShell>
  );
}

export default function TerminAbstimmen() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPublicPagesConfig('termin-abstimmen').then(c => {
      setCfg(c);
      setPage(c?.pages['termin-abstimmen'] ?? null);
      setLoading(false);
    });
  }, []);

  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);

  if (loading || !cfg || !page || !port) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }
  return (
    <PublicShell title={page.title} description={page.description}>
      <Inner port={port} />
    </PublicShell>
  );
}
