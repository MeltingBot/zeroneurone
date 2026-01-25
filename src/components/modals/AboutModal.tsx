import { Github, Heart, ExternalLink, Coffee } from 'lucide-react';
import { Modal } from '../common';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const techStack = [
    { name: 'React', url: 'https://react.dev', description: 'Interface utilisateur' },
    { name: 'TypeScript', url: 'https://www.typescriptlang.org', description: 'Typage statique' },
    { name: 'Zustand', url: 'https://zustand-demo.pmnd.rs', description: 'Gestion d\'état' },
    { name: 'React Flow', url: 'https://reactflow.dev', description: 'Canvas interactif' },
    { name: 'Yjs', url: 'https://yjs.dev', description: 'Collaboration temps réel' },
    { name: 'Dexie', url: 'https://dexie.org', description: 'Base de données locale' },
    { name: 'Leaflet', url: 'https://leafletjs.com', description: 'Cartographie' },
    { name: 'Graphology', url: 'https://graphology.github.io', description: 'Analyse de graphe' },
  ];

  // Get version from build-time constants (injected by Vite)
  const version = __APP_VERSION__;
  const buildTime = __BUILD_TIME__;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="À propos" width="md">
      <div className="space-y-6">
          {/* Logo and version */}
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Zero Neurone" className="w-20 h-auto" />
            <div>
              <h3 className="text-lg font-semibold text-text-primary">ZeroNeurone</h3>
              <p className="text-xs text-text-tertiary">
                Version {version}
                {buildTime && (
                  <span className="ml-1 text-text-tertiary/60">
                    ({new Date(buildTime).toLocaleDateString('fr-FR')})
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
              Outil d'amplification cognitive pour analystes et enquêteurs.
              Un tableau blanc combinant visualisation de graphe,
              cartographie et timeline.
            </p>
          </div>

          {/* Philosophy */}
          <div>
            <h4 className="text-xs font-semibold text-text-primary mb-2 uppercase tracking-wide">
              Philosophie
            </h4>
            <ul className="space-y-1.5 text-xs text-text-secondary">
              <li className="flex items-start gap-2">
                <span className="text-text-tertiary">•</span>
                <span><strong>L'humain garde le contrôle</strong> — Pas d'actions automatiques, ni intelligence artificielle, suggestions uniquement sur demande</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-text-tertiary">•</span>
                <span><strong>0% Cloud</strong> — Vos données ne quittent jamais votre machine sans action explicite</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-text-tertiary">•</span>
                <span><strong>Le visuel EST l'analyse</strong> — Position, couleurs, formes portent un sens défini par vous</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-text-tertiary">•</span>
                <span><strong>Zéro ontologie imposée</strong> — Créez vos propres concepts avec les tags et les propriétés, pas de types d'entités forcés</span>
              </li>
            </ul>
          </div>

          {/* Tech Stack */}
          <div>
            <h4 className="text-xs font-semibold text-text-primary mb-2 uppercase tracking-wide">
              Technologies
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
                    <p className="text-[10px] text-text-tertiary">{tech.description}</p>
                  </div>
                  <ExternalLink size={12} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              ))}
            </div>
          </div>

          {/* License */}
          <div>
            <h4 className="text-xs font-semibold text-text-primary mb-2 uppercase tracking-wide">
              Licence
            </h4>
            <div className="p-3 bg-bg-secondary rounded border border-border-default">
              <p className="text-xs text-text-secondary mb-2">
                Ce logiciel est distribué sous licence <strong>MIT</strong>.
              </p>
              <p className="text-[10px] text-text-tertiary font-mono leading-relaxed">
                Copyright (c) 2026 Yann PILPRÉ
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
          <span>Fait avec</span>
          <Heart size={12} className="text-error" />
          <span>pour les enquêteurs du monde entier</span>
        </div>
      </div>
    </Modal>
  );
}
