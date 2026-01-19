import { X, Github, Heart, ExternalLink } from 'lucide-react';
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

  // Get version from global (injected at build time)
  const version = (window as unknown as { __APP_VERSION__?: string }).__APP_VERSION__ || '0.5.0';
  const commitHash = (window as unknown as { __GIT_COMMIT__?: string }).__GIT_COMMIT__;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">À propos</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-bg-tertiary rounded transition-colors"
          >
            <X size={16} className="text-text-tertiary" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Logo and version */}
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Zero Neurone" className="w-20 h-auto" />
            <div>
              <h3 className="text-lg font-semibold text-text-primary">ZeroNeurone</h3>
              <p className="text-xs text-text-tertiary">
                Version {version}
                {commitHash && (
                  <span className="ml-1 font-mono">({commitHash.slice(0, 7)})</span>
                )}
              </p>
            </div>
          </div>

          {/* Description */}
          <div>
            <p className="text-sm text-text-secondary">
              Outil d'amplification cognitive pour analystes et enquêteurs.
              Un tableau blanc infini combinant visualisation de graphe,
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
                <span><strong>L'humain garde le contrôle</strong> — Pas d'actions automatiques, suggestions uniquement sur demande</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-text-tertiary">•</span>
                <span><strong>100% local par défaut</strong> — Vos données ne quittent jamais votre machine sans action explicite</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-text-tertiary">•</span>
                <span><strong>Le visuel EST l'analyse</strong> — Position, couleurs, formes portent un sens défini par vous</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-text-tertiary">•</span>
                <span><strong>Zéro ontologie imposée</strong> — Créez vos propres concepts, pas de types d'entités forcés</span>
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
      </div>
    </Modal>
  );
}
