import { ClerkProvider } from '@clerk/nextjs'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

export const metadata = {
  title: 'ChatGPT Clone',
  description: 'AI-powered chat application with file processing capabilities',
  icons: {
    icon: '/GPTIcon.svg',
    shortcut: '/placeholder-logo.png',
    apple: '/placeholder-logo.png',
  },
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body suppressHydrationWarning>
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