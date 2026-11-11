import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { About } from './About';
import { Preferences } from './Preferences';
import { getLocalUser, setLocalUserName } from './presence';
import { inputClass, sectionTitle } from './ui';

/** Settings of the companion on this phone, the same for every dossier */
export function AppSettings() {
  const { t } = useTranslation('companion');
  const [name, setName] = useState(() => getLocalUser().name);

  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed) setLocalUserName(trimmed);
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className={sectionTitle}>{t('settings.identity')}</h2>
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          enterKeyHint="done"
          autoComplete="nickname"
          aria-label={t('settings.identity')}
        />
      </section>
      <Preferences />
      <About />
    </div>
  );
}
