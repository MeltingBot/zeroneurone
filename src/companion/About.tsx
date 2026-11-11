import { BookOpen, Coffee, ExternalLink, Github, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appPath } from '../utils/basePath';

const LINKS = [
  { key: 'docs', href: 'https://doc.zeroneurone.com', Icon: BookOpen },
  { key: 'github', href: 'https://github.com/MeltingBot/zeroneurone', Icon: Github },
  { key: 'kofi', href: 'https://ko-fi.com/yannpilpre', Icon: Coffee },
  { key: 'thirdParty', href: 'https://github.com/MeltingBot/zeroneurone/blob/main/public/THIRD_PARTY_LICENSES.txt', Icon: Scale },
] as const;

/** Version, documentation, sources and licences */
export function About() {
  const { t, i18n } = useTranslation('companion');
  const buildDate = __BUILD_TIME__ ? new Date(__BUILD_TIME__).toLocaleDateString(i18n.language) : '';

  return (
    <section className="space-y-2" aria-labelledby="companion-about">
      <h2 id="companion-about" className="text-xs text-text-secondary font-medium uppercase tracking-wider">
        {t('about.title')}
      </h2>
      <div className="flex items-center gap-3">
        <img src={appPath('logo-192.png')} alt="" className="w-10 h-10" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">ZeroNeurone</p>
          <p className="text-xs text-text-tertiary truncate">
            {t('about.version', { version: __APP_VERSION__ })}
            {__GIT_COMMIT__ && <span className="ml-1 font-mono">({__GIT_COMMIT__})</span>}
            {buildDate && <span className="ml-1">{buildDate}</span>}
          </p>
          <p className="text-xs text-text-tertiary">{t('about.license')}</p>
        </div>
      </div>
      <ul className="divide-y divide-border-default border border-border-default rounded">
        {LINKS.map(({ key, href, Icon }) => (
          <li key={key}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-12 flex items-center gap-3 px-3 py-3 text-sm active:bg-bg-secondary"
            >
              <Icon size={16} className="text-text-secondary" />
              <span className="flex-1">{t(`about.${key}`)}</span>
              <ExternalLink size={14} className="text-text-tertiary" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
