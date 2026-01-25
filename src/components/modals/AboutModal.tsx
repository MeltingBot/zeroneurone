import { Github, Heart, ExternalLink, Coffee } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const { t, i18n } = useTranslation('modals');
  const locale = i18n.language;

  const techStack = [
    { name: 'React', url: 'https://react.dev', key: 'react' },
    { name: 'TypeScript', url: 'https://www.typescriptlang.org', key: 'typescript' },
    { name: 'Zustand', url: 'https://zustand-demo.pmnd.rs', key: 'zustand' },
    { name: 'React Flow', url: 'https://reactflow.dev', key: 'reactflow' },
    { name: 'Yjs', url: 'https://yjs.dev', key: 'yjs' },
    { name: 'Dexie', url: 'https://dexie.org', key: 'dexie' },
    { name: 'Leaflet', url: 'https://leafletjs.com', key: 'leaflet' },
    { name: 'Graphology', url: 'https://graphology.github.io', key: 'graphology' },
  ];

  // Get version from build-time constants (injected by Vite)
  const version = __APP_VERSION__;
  const buildTime = __BUILD_TIME__;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('about.title')} width="md">
      <div className="space-y-6">
          {/* Logo and version */}
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Zero Neurone" className="w-20 h-auto" />
            <div>
              <h3 className="text-lg font-semibold text-text-primary">ZeroNeurone</h3>
              <p className="text-xs text-text-tertiary">
                {t('about.version', { version })}
                {buildTime && (
                  <span className="ml-1 text-text-tertiary/60">
                    {t('about.buildDate', { date: new Date(buildTime).toLocaleDateString(locale) })}
                  </span>
                )}
              </p>
              <div className="flex items-center gap-3 mt-1.5">
                <a
                  href="https://github.com/MeltingBot/zeroneurone"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent transition-colors"
                >
                  <Github size={14} />
                  <span>GitHub</span>
                </a>
                <a
                  href="https://ko-fi.com/yannpilpre"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent transition-colors"
                >
                  <Coffee size={14} />
                  <span>Ko-fi</span>
                </a>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <p className="text-sm text-text-secondary">
              {t('about.description')}
            </p>
          </div>

          {/* Philosophy */}
          <div>
            <h4 className="text-xs font-semibold text-text-primary mb-2 uppercase tracking-wide">
              {t('about.philosophy.title')}
            </h4>
            <ul className="space-y-1.5 text-xs text-text-secondary">
              <li className="flex items-start gap-2">
                <span className="text-text-tertiary">•</span>
                <span><strong>{t('about.philosophy.humanControl')}</strong> — {t('about.philosophy.humanControlDesc')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-text-tertiary">•</span>
                <span><strong>{t('about.philosophy.noCloud')}</strong> — {t('about.philosophy.noCloudDesc')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-text-tertiary">•</span>
                <span><strong>{t('about.philosophy.visualIsAnalysis')}</strong> — {t('about.philosophy.visualIsAnalysisDesc')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-text-tertiary">•</span>
                <span><strong>{t('about.philosophy.noOntology')}</strong> — {t('about.philosophy.noOntologyDesc')}</span>
              </li>
            </ul>
          </div>

          {/* Tech Stack */}
          <div>
            <h4 className="text-xs font-semibold text-text-primary mb-2 uppercase tracking-wide">
              {t('about.technologies.title')}
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {techStack.map((tech) => (
                <a
                  key={tech.name}
                  href={tech.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2 bg-bg-secondary rounded border border-border-default hover:border-border-strong transition-colors group"
                >
                  <div>
                    <span className="text-xs font-medium text-text-primary">{tech.name}</span>
                    <p className="text-[10px] text-text-tertiary">{t(`about.technologies.${tech.key}`)}</p>
                  </div>
                  <ExternalLink size={12} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              ))}
            </div>
          </div>

          {/* License */}
          <div>
            <h4 className="text-xs font-semibold text-text-primary mb-2 uppercase tracking-wide">
              {t('about.license.title')}
            </h4>
            <div className="p-3 bg-bg-secondary rounded border border-border-default">
              <p className="text-xs text-text-secondary mb-2">
                {t('about.license.text')}
              </p>
              <p className="text-[10px] text-text-tertiary font-mono leading-relaxed">
                {t('about.license.copyright', { year: new Date().getFullYear() })}
                <br /><br />
                Permission is hereby granted, free of charge, to any person obtaining a copy
                of this software and associated documentation files, to deal in the Software
                without restriction, including without limitation the rights to use, copy,
                modify, merge, publish, distribute, sublicense, and/or sell copies.
              </p>
            </div>
          </div>

        {/* Credits */}
        <div className="flex items-center justify-center gap-1 text-xs text-text-tertiary pt-2">
          <span>{t('about.footer')}</span>
          <Heart size={12} className="text-error" />
        </div>
      </div>
    </Modal>
  );
}
