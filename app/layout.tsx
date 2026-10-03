import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { AppNav } from '@/components/app-nav';

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0e17' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: {
    default: 'Strokio - Step-by-Step Drawing Lessons from Any Photo',
    template: '%s | Strokio',
  },
  description:
    'Turn any photo into a beginner-friendly, step-by-step drawing lesson with animated player, voice narration, AR camera overlay, and AI drawing feedback.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Strokio',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Strokio - Step-by-Step Drawing Lessons',
    description: 'Turn any photo into a beginner-friendly, step-by-step drawing lesson.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Strokio - Step-by-Step Drawing Lessons',
    description: 'Turn any photo into a beginner-friendly, step-by-step drawing lesson.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Anti-flash theme inline script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('strokio_theme');
                  var isDark = false;
                  if (stored === 'dark') {
                    isDark = true;
                  } else if (stored === 'light') {
                    isDark = false;
                  } else {
                    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  }
                  var root = document.documentElement;
                  if (isDark) {
                    root.classList.add('dark');
                    root.setAttribute('data-theme', 'dark');
                  } else {
                    root.classList.remove('dark');
                    root.setAttribute('data-theme', 'light');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning className="antialiased select-auto">
        <ThemeProvider>
          <AppNav>{children}</AppNav>
        </ThemeProvider>
      </body>
    </html>
  );
}
