import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bússola',
    short_name: 'Bússola',
    description: 'Finanças pessoais',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f4f1',
    theme_color: '#2a78d6',
    shortcuts: [
      { name: 'Lançar', url: '/lancar', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Revisar', url: '/revisar', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
    // compartilhar a notificação do banco direto no app: o texto cai na barra de lançar
    share_target: { action: '/lancar', method: 'GET', params: { text: 'q', title: 'q' } },
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
