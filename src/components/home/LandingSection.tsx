import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Upload, Map, Clock, Network, Search, Shield, Zap, Info, BookOpen, Github, Coffee, Sun, Moon, ExternalLink, Settings, ChevronRight, Eye, EyeOff, icons } from 'lucide-react';
import { Button, LanguageSwitcher } from '../common';
import { usePlugins } from '../../plugins/usePlugins';
import { isPluginDisabled, disablePlugin, enablePlugin } from '../../plugins/pluginRegistry';
import type { HomeCardRegistration } from '../../types/plugins';

interface LandingSectionProps {
  onNewInvestigation: () => void;
  onImport: () => void;
  onAbout: () => void;
  investigationCount: number;
  onViewInvestigations: () => void;
  themeMode: 'light' | 'dark';
  onToggleTheme: () => void;
}

const EXPANDED_KEY = 'zeroneurone:extensions-expanded';

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
  const bannerPlugins = usePlugins('home:banner');
  // includeDisabled: show all cards, manage enabled/disabled in UI
  const allCards = usePlugins('home:card', { includeDisabled: true });

  const [extensionsExpanded, setExtensionsExpanded] = useState(() => {
    return localStorage.getItem(EXPANDED_KEY) !== '0';
  });

  const toggleExpanded = () => {
    setExtensionsExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(EXPANDED_KEY, next ? '1' : '0');
      return next;
    });
  };

  const handleTogglePlugin = (id: string) => {
    if (isPluginDisabled(id)) {
      enablePlugin(id);
    } else {
      disablePlugin(id);
    }
  };

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
      {/* Plugin banners */}
      {bannerPlugins.map((Banner, i) => (
        <Banner key={i} />
      ))}

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

        {/* Plugin Cards — Accordion */}
        {allCards.length > 0 && (
          <div className="mb-12">
            <button
              onClick={toggleExpanded}
              className="flex items-center gap-1.5 text-sm font-semibold text-text-secondary mb-4 hover:text-text-primary"
            >
              <ChevronRight
                size={14}
                className={`transition-transform ${extensionsExpanded ? 'rotate-90' : ''}`}
              />
              {t('home.landing.extensions')}
              <span className="text-xs font-normal text-text-tertiary">({allCards.length})</span>
            </button>
            {extensionsExpanded && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {allCards.map((card: HomeCardRegistration) => {
                  const disabled = isPluginDisabled(card.id);
                  const IconComponent = (icons as Record<string, any>)[card.icon];
                  return (
                    <div
                      key={card.id}
                      className={`p-4 bg-bg-secondary border border-border-default rounded ${disabled ? 'opacity-40' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        {IconComponent && <IconComponent size={20} className="text-text-secondary shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-semibold text-text-primary">{card.name}</h3>
                            {card.version && (
                              <span className="text-[10px] text-text-tertiary">{card.version}</span>
                            )}
                            <button
                              onClick={() => handleTogglePlugin(card.id)}
                              className="ml-auto shrink-0 p-0.5 text-text-tertiary hover:text-text-secondary"
                              title={disabled ? t('home.landing.enablePlugin') : t('home.landing.disablePlugin')}
                            >
                              {disabled ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                          <p className="text-xs text-text-tertiary mb-2">{card.description}</p>
                          {!disabled && card.features && card.features.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {card.features.map((f) => (
                                <span
                                  key={f}
                                  className="px-1.5 py-0.5 text-[10px] bg-bg-tertiary text-text-secondary rounded"
                                >
                                  {f}
                                </span>
                              ))}
                            </div>
                          )}
                          {!disabled && (
                            <div className="flex items-center gap-3">
                              {card.license && (
                                <span className="text-[10px] text-text-tertiary">
                                  {t('home.landing.extensionsLicense')}: {card.license}
                                </span>
                              )}
                              {card.docUrl && (
                                <a
                                  href={card.docUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary"
                                >
                                  <ExternalLink size={10} />
                                  Documentation
                                </a>
                              )}
                              {card.onConfigure && (
                                <button
                                  onClick={card.onConfigure}
                                  className="inline-flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary"
                                >
                                  <Settings size={10} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
