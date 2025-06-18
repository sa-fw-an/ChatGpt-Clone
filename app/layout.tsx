import { ClerkProvider } from '@clerk/nextjs'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'),
  title: 'ChatGPT Clone',
  description: 'AI-powered chat application with file processing capabilities',
  keywords: 'AI, chatbot, OpenAI, file processing, document analysis, PDF analysis',
  authors: [{ name: 'Your Name' }],
  creator: 'Your Name',
  publisher: 'Your Name',
  robots: 'index, follow',
  icons: {
    icon: '/GPTIcon.svg',
    shortcut: '/placeholder-logo.png',
    apple: '/placeholder-logo.png',
  },
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://your-domain.com',
    title: 'ChatGPT Clone - AI-Powered Chat',
    description: 'Advanced AI chat interface with document processing and analysis capabilities',
    siteName: 'ChatGPT Clone',
    images: [
      {
        url: '/placeholder-logo.png',
        width: 1200,
        height: 630,
        alt: 'ChatGPT Clone',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChatGPT Clone - AI-Powered Chat',
    description: 'Advanced AI chat interface with document processing and analysis capabilities',
    images: ['/placeholder-logo.png'],
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1.0,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <meta name="theme-color" content="#212121" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta name="apple-mobile-web-app-title" content="ChatGPT Clone" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        </head>
        <body suppressHydrationWarning className="bg-[#212121] text-white overflow-hidden">
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}