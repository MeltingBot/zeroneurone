import { Plus, Upload, Map, Clock, Network, Search, Shield, Zap, Info } from 'lucide-react';
import { Button } from '../common';

interface LandingSectionProps {
  onNewInvestigation: () => void;
  onImport: () => void;
  onAbout: () => void;
  investigationCount: number;
  onViewInvestigations: () => void;
}

export function LandingSection({
  onNewInvestigation,
  onImport,
  onAbout,
  investigationCount,
  onViewInvestigations,
}: LandingSectionProps) {
  const features = [
    {
      icon: Network,
      title: 'Graphe relationnel',
      description: 'Visualisez les connexions entre personnes, lieux et concepts',
    },
    {
      icon: Map,
      title: 'Vue cartographique',
      description: 'Positionnez vos éléments sur une carte interactive et temporelle',
    },
    {
      icon: Clock,
      title: 'Timeline',
      description: 'Organisez les événements chronologiquement',
    },
    {
      icon: Search,
      title: 'Recherche et filtres instantanés',
      description: 'Trouvez et filtrez n\'importe quel élément en quelques frappes',
    },
    {
      icon: Shield,
      title: 'Données 100% local',
      description: 'Vos données restent sur votre machine, jamais transmises',
    },
    {
      icon: Zap,
      title: 'Collaboration sécurisé temps réel',
      description: 'Travaillez à plusieurs sur la même enquête',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
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
            Tableau blanc pour analystes et enquêteurs
          </p>
          <p className="text-sm text-text-tertiary max-w-xl">
            Un outil d'amplification cognitive qui combine la simplicité d'un tableau blanc
            avec la puissance de l'analyse de graphe. Cartographiez vos idées, géolocalisez vos élements, visualisez les événements,  
            connectez les indices et révélez les patterns cachés.
          </p>

          {/* CTA Buttons */}
          <div className="flex items-center gap-3 mt-8">
            <Button variant="primary" size="md" onClick={onNewInvestigation}>
              <Plus size={18} />
              Nouvelle enquête
            </Button>
            <Button variant="secondary" size="md" onClick={onImport}>
              <Upload size={18} />
              Importer
            </Button>
          </div>

          {/* Existing investigations link */}
          {investigationCount > 0 && (
            <button
              onClick={onViewInvestigations}
              className="mt-4 text-sm text-accent hover:underline"
            >
              Voir mes {investigationCount} enquête{investigationCount > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="p-4 bg-bg-secondary border border-border-default rounded"
            >
              <feature.icon size={20} className="text-text-secondary mb-2" />
              <h3 className="text-sm font-semibold text-text-primary mb-1">
                {feature.title}
              </h3>
              <p className="text-xs text-text-tertiary">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* About Link */}
        <div className="text-center border-t border-border-default pt-6">
          <button
            onClick={onAbout}
            className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <Info size={14} />
            À propos de ZeroNeurone
          </button>
        </div>
      </div>
    </div>
  );
}
