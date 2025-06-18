import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Define protected routes that require authentication
const isProtectedRoute = createRouteMatcher([
  '/api/chats(.*)',
  '/api/models(.*)',
  '/api/upload(.*)',
  '/api/file-upload(.*)',
  '/api/process-file(.*)',
  '/api/save-file-message(.*)',
  '/api/image-process(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  // Protect routes that require authentication
  if (isProtectedRoute(req)) {
    const { userId } = await auth()
    if (!userId) {
      // Only log in development for debugging
      if (process.env.NODE_ENV === 'development') {
        console.log(`Unauthorized access to: ${req.method} ${req.nextUrl.pathname}`)
      }
    }
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}