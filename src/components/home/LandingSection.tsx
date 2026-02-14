import { useTranslation } from 'react-i18next';
import { Plus, Upload, Map, Clock, Network, Search, Shield, Zap, Info, BookOpen, Github, Coffee, Sun, Moon } from 'lucide-react';
import { Button, LanguageSwitcher } from '../common';
import { usePlugins } from '../../plugins/usePlugins';

interface LandingSectionProps {
  onNewInvestigation: () => void;
  onImport: () => void;
  onAbout: () => void;
  investigationCount: number;
  onViewInvestigations: () => void;
  themeMode: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function LandingSection({
  onNewInvestigation,
  onImport,
  onAbout,
  investigationCount,
  onViewInvestigations,
  themeMode,
  onToggleTheme,
}: LandingSectionProps) {
  const { t } = useTranslation('pages');
  const homePlugins = usePlugins('home:actions');

  const features = [
    { icon: Network, key: 'graph' },
    { icon: Map, key: 'map' },
    { icon: Clock, key: 'timeline' },
    { icon: Search, key: 'search' },
    { icon: Shield, key: 'local' },
    { icon: Zap, key: 'collab' },
  ];

  return (
    <div className="flex-1 overflow-y-auto" data-testid="landing-section">
      {/* Hero Section */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex flex-col items-center text-center mb-12">
          {/* Logo */}
          <img
            src="/logo.png"
            alt="Zero Neurone"
            className="w-64 h-auto mb-6"
          />

          {/* Tagline */}
          <p className="text-lg text-text-secondary mb-2">
            {t('home.landing.subtitle')}
          </p>
          <p className="text-sm text-text-tertiary max-w-xl">
            {t('home.landing.description')}
          </p>

          {/* CTA Buttons */}
          <div className="flex items-center gap-3 mt-8">
            <Button variant="primary" size="md" onClick={onNewInvestigation} data-testid="new-investigation">
              <Plus size={18} />
              {t('home.landing.startNew')}
            </Button>
            <Button variant="secondary" size="md" onClick={onImport} data-testid="import-button">
              <Upload size={18} />
              {t('home.landing.importExisting')}
            </Button>
          </div>

          {/* Existing investigations link */}
          {investigationCount > 0 && (
            <button
              onClick={onViewInvestigations}
              className="mt-4 text-sm text-accent hover:underline"
            >
              {t('home.landing.viewExisting', { count: investigationCount })}
            </button>
          )}
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {features.map((feature) => (
            <div
              key={feature.key}
              className="p-4 bg-bg-secondary border border-border-default rounded"
            >
              <feature.icon size={20} className="text-text-secondary mb-2" />
              <h3 className="text-sm font-semibold text-text-primary mb-1">
                {t(`home.landing.features.${feature.key}.title`)}
              </h3>
              <p className="text-xs text-text-tertiary">
                {t(`home.landing.features.${feature.key}.description`)}
              </p>
            </div>
          ))}
        </div>

        {/* Footer Links */}
        <div className="flex items-center justify-center gap-4 border-t border-border-default pt-6">
          {/* Plugin-provided actions */}
          {homePlugins.map((Plugin, i) => (
            <Plugin key={i} />
          ))}
          <button
            onClick={onToggleTheme}
            className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            title={themeMode === 'light' ? t('home.darkMode') : t('home.lightMode')}
          >
            {themeMode === 'light' ? <Moon size={14} /> : <Sun size={14} />}
            {themeMode === 'light' ? t('home.darkMode') : t('home.lightMode')}
          </button>
          <LanguageSwitcher size="sm" showLabel direction="up" />
          <button
            onClick={onAbout}
            className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <Info size={14} />
            {t('home.about')}
          </button>
          <a
            href="https://doc.zeroneurone.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <BookOpen size={14} />
            {t('home.documentation')}
          </a>
          <a
            href="https://github.com/MeltingBot/zeroneurone"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <Github size={14} />
            GitHub
          </a>
          <a
            href="https://ko-fi.com/yannpilpre"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <Coffee size={14} />
            Ko-fi
          </a>
        </div>
      </div>
    </div>
  );
}
