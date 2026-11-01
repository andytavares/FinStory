import { useEffect, useState } from 'react';
import { useQuery } from '../lib/ipc';
import { Credentials } from '../components/Credentials';
import { Card, PageHeader } from '../components/ui';
import { CategorizationSection } from './settings/CategorizationSection';
import { GeneralSection } from './settings/GeneralSection';
import { PrivacySection, type Protection } from './settings/PrivacySection';
import type { AppSettings, SetupStatus } from '@shared/types';

interface Health {
  readonly encryption: Protection;
  readonly updates: { readonly version: string };
}

const SECTIONS = [
  { id: 'general', tab: 'General', heading: 'General' },
  { id: 'categorization', tab: 'Categorization', heading: 'Categorization' },
  { id: 'credentials', tab: 'Credentials', heading: 'Credentials' },
  { id: 'privacy', tab: 'Data and privacy', heading: 'Your data' },
  { id: 'updates', tab: 'Updates', heading: 'Updates' },
] as const;

/** The section nearest the top of the scrolling page. Without IntersectionObserver the last click wins. */
function useActiveSection(): [string, (id: string) => void] {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries.find((entry) => entry.isIntersecting);
        if (top) setActive(top.target.id.replace('settings-', ''));
      },
      { rootMargin: '0px 0px -70% 0px' },
    );
    SECTIONS.forEach((s) => {
      const element = document.getElementById(`settings-${s.id}`);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);
  return [active, setActive];
}

export function Settings(): React.JSX.Element {
  const settings = useQuery<AppSettings>('settings:get');
  const status = useQuery<SetupStatus>('setup:status');
  const health = useQuery<Health>('health:get');
  const [active, setActive] = useActiveSection();

  const jump = (id: string): void => {
    setActive(id);
    const section = document.getElementById(`settings-${id}`);
    const scroller = section?.closest('.ds-body');
    if (!section || !scroller) return;
    // Scroll only the page body: scrollIntoView would also shift the clipped app shell.
    const offset = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTo?.({ top: scroller.scrollTop + offset - 8, behavior: 'smooth' });
  };

  if (settings.loading || !settings.data) return <p className="ds-faint">Loading…</p>;
  const s = settings.data;

  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex shrink-0 gap-[18px]">
        <div role="group" aria-label="Settings sections" className="sticky top-0 flex w-[170px] flex-none flex-col gap-0.5 self-start">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className="ds-nav !px-2.5 !py-[7px]"
              aria-current={active === section.id ? 'page' : undefined}
              onClick={() => jump(section.id)}
            >
              {section.tab}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-7">
          {SECTIONS.map((section) => (
            <section
              key={section.id}
              id={`settings-${section.id}`}
              aria-labelledby={`settings-${section.id}-heading`}
              className="flex scroll-mt-1 flex-col gap-3"
            >
              <h2 id={`settings-${section.id}-heading`} className="sr-only">
                {section.heading}
              </h2>
              {section.id === 'general' && <GeneralSection settings={s} />}
              {section.id === 'categorization' && <CategorizationSection settings={s} />}
              {section.id === 'credentials' && status.data && (
                <Credentials status={status.data} onSaved={status.refetch} />
              )}
              {section.id === 'privacy' && (
                <PrivacySection
                  protection={health.data?.encryption}
                  lastBackupAt={s.lastBackupAt}
                  onBackedUp={settings.refetch}
                />
              )}
              {section.id === 'updates' && <UpdatesCard version={health.data?.updates.version} />}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

function UpdatesCard({ version }: { version: string | undefined }): React.JSX.Element {
  return (
    <Card>
      <div className="ds-row">
        <div className="flex-1">
          <div className="font-semibold">Money</div>
          <div className="ds-caption">Money checks for updates at launch and every 6 hours.</div>
        </div>
        <span className="ds-num ds-muted">{version ? `Version ${version}` : 'Version unknown'}</span>
      </div>
    </Card>
  );
}
