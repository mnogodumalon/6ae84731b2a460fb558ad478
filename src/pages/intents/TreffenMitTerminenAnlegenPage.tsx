/**
 * Treffen mit Terminen anlegen — 3-Schritt-Wizard.
 * Steps: 1) Treffen beschreiben → 2) Terminvorschlag erfassen → 3) Prüfen & speichern.
 * Reads: — (nur Eingaben). Writes: treffen (Status „offen“ automatisch), terminvorschlaege (verknüpft mit dem neuen Treffen).
 * Composes: IntentWizardShell, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { useTreffenMitTerminenAnlegenFlow } from '@/lib/journey/flows/TreffenMitTerminenAnlegen';
import { lookupOption } from '@/types/app';
import { tx } from '@/i18n';

export default function TreffenMitTerminenAnlegenPage() {
  const [step, setStep] = useState(1);
  const flow = useTreffenMitTerminenAnlegenFlow({
    steps: {
      titel: 1, ort: 1, beschreibung: 1, organisator_vorname: 1, organisator_nachname: 1,
      termin: 2, anmerkung: 2,
    },
  });

  return (
    <IntentWizardShell
      title={tx('Treffen mit Terminen anlegen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Lege ein Treffen mit einem Terminvorschlag an, damit der Link verschickt werden kann.'),
        needs: [tx('Titel und Ort des Treffens'), tx('Dein Name als Organisator'), tx('Ein möglicher Termin')],
      }}
    >
      <WizardStep label={tx('Treffen')} description={tx('Worum geht es, wo findet es statt und wer organisiert es?')}>
        <div className="space-y-4">
          <Bound form={flow.forms.treffen} name="titel" />
          <Bound form={flow.forms.treffen} name="ort" />
          <Bound form={flow.forms.treffen} name="beschreibung" rows={3} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Bound form={flow.forms.treffen} name="organisator_vorname" />
            <Bound form={flow.forms.treffen} name="organisator_nachname" />
          </div>
          <StepNav hideBack onNext={() => flow.validateStep(1)} nextStepLabel={tx('Terminvorschlag')} />
        </div>
      </WizardStep>

      <WizardStep label={tx('Termin')} description={tx('Wann könnte das Treffen stattfinden? Datum und Uhrzeit wählen.')}>
        <div className="space-y-4">
          <Bound form={flow.forms.terminvorschlaege} name="termin" />
          <Bound form={flow.forms.terminvorschlaege} name="anmerkung" />
          <StepNav onBack={() => setStep(1)} onNext={() => flow.validateStep(2)} nextStepLabel={tx('Prüfen')} />
        </div>
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            items={[{
              key: 'status',
              label: tx('Status'),
              value: lookupOption('treffen', 'status', 'offen')?.label ?? tx('Offen'),
            }]}
            whatHappensNext={tx('Das Treffen wird mit Status „Offen“ gespeichert und der Terminvorschlag damit verknüpft.')}
          />
        )}
      </WizardStep>

      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          next={[
            { label: tx('Termin festlegen'), href: '#/intents/termin-festlegen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Für weitere Terminvorschläge starte den Ablauf einfach noch einmal.')}
        />
      )}
    </IntentWizardShell>
  );
}
